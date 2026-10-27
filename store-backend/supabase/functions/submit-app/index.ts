// Supabase Edge Function: submit-app
// POST (signed-in user) { name, url, description, category, icon: "<base64>", icon_type: "image/png" }
// Runs the automatic checks, stores the icon and inserts the app with the verdict.
// Deploy:  supabase functions deploy submit-app
// Optional secret: SAFE_BROWSING_API_KEY (Google Safe Browsing v4, free)

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { verifyApp, type Deps } from "./verify.ts";

const CATEGORIES = ["Video", "Live TV", "Free", "Anime", "Music", "Games", "Kids", "News", "More"];
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "app";

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
}

async function doh(host: string, type: "A" | "AAAA"): Promise<string[]> {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
    headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000),
  });
  const j = await r.json();
  return (j.Answer ?? []).filter((a: { type: number }) => a.type === (type === "A" ? 1 : 28)).map((a: { data: string }) => a.data);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // who is calling
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: "Sign in to publish an app." }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const name = String(body.name ?? "").trim();
  const siteUrl = String(body.url ?? "").trim();
  const description = String(body.description ?? "").trim();
  const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : "More";
  if (name.length < 2 || name.length > 40) return json({ error: "The name must be 2 to 40 characters." }, 400);
  if (description.length < 10 || description.length > 400) return json({ error: "The description must be 10 to 400 characters." }, 400);

  // icon
  let icon: Uint8Array;
  try { icon = Uint8Array.from(atob(String(body.icon ?? "")), (c) => c.charCodeAt(0)); } catch { return json({ error: "The icon could not be read." }, 400); }
  const type = sniff(icon);
  if (!type || icon.length > 512 * 1024) return json({ error: "The icon must be a PNG, JPG or WebP image of 512 KB or less." }, 400);

  // rate limit: 3 submissions per user per day, 20 apps per user in total
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: today }, { count: total }] = await Promise.all([
    admin.from("apps").select("id", { count: "exact", head: true }).eq("owner", user.id).gte("created_at", since),
    admin.from("apps").select("id", { count: "exact", head: true }).eq("owner", user.id),
  ]);
  if ((today ?? 0) >= 3) return json({ error: "You can publish 3 apps per day. Try again tomorrow." }, 429);
  if ((total ?? 0) >= 20) return json({ error: "You've reached the limit of 20 apps." }, 429);

  // checks
  const { data: blocked } = await admin.from("blocked_domains").select("domain");
  const sb = Deno.env.get("SAFE_BROWSING_API_KEY");
  const deps: Deps = {
    fetch,
    resolve: async (host) => (await Promise.all([doh(host, "A"), doh(host, "AAAA").catch(() => [])])).flat(),
    blockedDomains: new Set((blocked ?? []).map((b: { domain: string }) => b.domain)),
    domainAgeDays: async (domain) => {
      const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) return null;
      const j = await r.json();
      const reg = (j.events ?? []).find((e: { eventAction: string }) => e.eventAction === "registration");
      return reg ? Math.floor((Date.now() - Date.parse(reg.eventDate)) / 86_400_000) : null;
    },
    isDangerous: sb ? async (u) => {
      const r = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${sb}`, {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(6000),
        body: JSON.stringify({
          client: { clientId: "m3tv-store", clientVersion: "1.0" },
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"], platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"], threatEntries: [{ url: u }],
          },
        }),
      });
      return Object.keys(await r.json()).includes("matches");
    } : undefined,
  };
  const verdict = await verifyApp({ name, url: siteUrl, description }, deps);

  if (verdict.status === "blocked") {
    // Nothing is stored for blocked submissions except the count against the daily limit.
    await admin.from("apps").insert({
      owner: user.id, slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`, name, url: siteUrl.slice(0, 300),
      domain: verdict.domain || "invalid", description, category, icon_path: "blocked", status: "blocked", reasons: verdict.reasons, flags: verdict.flags,
    }).then(() => {}, () => {});
    return json({ status: "blocked", reasons: verdict.reasons, flags: verdict.flags });
  }

  const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
  const path = `${user.id}/${slug}.${TYPES[type]}`;
  const up = await admin.storage.from("app-icons").upload(path, icon, { contentType: type, upsert: false });
  if (up.error) return json({ error: "The icon could not be saved." }, 500);

  const hue = [...slug].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7);
  const { error } = await admin.from("apps").insert({
    owner: user.id, slug, name, url: siteUrl,
    domain: verdict.domain, description, category, icon_path: path, hue,
    status: verdict.status, reasons: [], flags: verdict.flags,
  });
  if (error) return json({ error: "The app could not be saved." }, 500);
  return json({ status: verdict.status, reasons: [], flags: verdict.flags, slug });
});
