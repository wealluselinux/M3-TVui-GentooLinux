// Automatic checks for apps submitted to the M3TV Store.
//
// Pure TypeScript with no Deno or Node APIs: fetch, DNS, domain age and Safe Browsing are
// passed in, so the same file runs inside the Supabase Edge Function and in the tests.
//
// Verdicts:
//   blocked  - hard failure (look-alike of a known brand, name does not match the website,
//              scam wording, unsafe or unreachable address, listed as dangerous). Never shown.
//   pending  - suspicious but not certain (new domain, page can't be read, piracy wording,
//              redirects elsewhere). Hidden until a person approves it.
//   approved - nothing found. Shown in the store.
//
// These checks catch lazy and obvious abuse. They do not make a site safe: a patient attacker can
// build a real-looking site and wait. That is why reports and manual review exist too.

export type Status = "approved" | "pending" | "blocked";

export interface Input {
  name: string;
  url: string;
  description: string;
}

export interface Verdict {
  status: Status;
  reasons: string[]; // why it was blocked (shown to the publisher)
  flags: string[]; // why it needs a manual look (shown to the publisher)
  domain: string;
  finalUrl: string | null;
}

export interface Deps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  resolve: (host: string) => Promise<string[]>; // A and AAAA records
  domainAgeDays?: (domain: string) => Promise<number | null>;
  isDangerous?: (url: string) => Promise<boolean>; // e.g. Google Safe Browsing
  blockedDomains?: Set<string>;
}

// ---------------------------------------------------------------------------
// Brands people like to imitate: token -> official registrable domains.
// A name or address that contains the token is only allowed on those domains.
// ---------------------------------------------------------------------------

export const BRANDS: Record<string, string[]> = {
  netflix: ["netflix.com", "netflix.net"],
  youtube: ["youtube.com", "youtu.be", "youtubekids.com"],
  google: ["google.com", "withgoogle.com", "googleusercontent.com"],
  disney: ["disney.com", "disneyplus.com", "hotstar.com", "disneynow.com"],
  hulu: ["hulu.com"],
  hbo: ["hbo.com", "hbomax.com", "max.com"],
  amazon: ["amazon.com", "primevideo.com", "amazon.co.uk", "amazon.de", "amazon.co.jp", "amazon.ca", "amazon.in", "amazon.fr", "amazon.it", "amazon.es", "amazon.com.au"],
  primevideo: ["primevideo.com", "amazon.com"],
  paramount: ["paramount.com", "paramountplus.com"],
  peacock: ["peacocktv.com", "nbc.com"],
  apple: ["apple.com", "icloud.com"],
  spotify: ["spotify.com"],
  twitch: ["twitch.tv"],
  crunchyroll: ["crunchyroll.com"],
  plex: ["plex.tv", "plex.com"],
  tubi: ["tubitv.com", "tubi.tv"],
  pluto: ["pluto.tv"],
  roku: ["roku.com"],
  fubo: ["fubo.tv", "fubo.com"],
  sling: ["sling.com"],
  philo: ["philo.com"],
  vimeo: ["vimeo.com"],
  hidive: ["hidive.com"],
  paypal: ["paypal.com", "paypal.me"],
  facebook: ["facebook.com", "fb.com", "meta.com", "messenger.com"],
  instagram: ["instagram.com"],
  whatsapp: ["whatsapp.com", "whatsapp.net"],
  tiktok: ["tiktok.com"],
  microsoft: ["microsoft.com", "live.com", "office.com", "outlook.com", "microsoftonline.com", "xbox.com", "bing.com"],
  steam: ["steampowered.com", "steamcommunity.com", "valvesoftware.com"],
  discord: ["discord.com", "discord.gg"],
  telegram: ["telegram.org", "t.me"],
  binance: ["binance.com"],
  coinbase: ["coinbase.com"],
  metamask: ["metamask.io"],
  ebay: ["ebay.com"],
  twitter: ["twitter.com", "x.com"],
  roblox: ["roblox.com"],
  chase: ["chase.com"],
  wellsfargo: ["wellsfargo.com"],
  bankofamerica: ["bankofamerica.com"],
};

// Ordinary words that are also brands. For these, only a whole word counts, not a substring.
const GENERIC_BRANDS = new Set(["apple", "steam", "sling", "philo", "pluto", "discord", "plex", "chase", "tubi"]);

const SHORTENERS = new Set([
  "bit.ly", "t.co", "tinyurl.com", "goo.gl", "is.gd", "ow.ly", "buff.ly", "cutt.ly", "rebrand.ly",
  "shorturl.at", "tiny.cc", "rb.gy", "lnkd.in", "s.id", "v.gd", "t.ly",
]);

const SUSPICIOUS_TLDS = new Set(["zip", "mov", "tk", "ml", "ga", "cf", "gq", "click", "country", "kim", "loan", "work", "men", "rest", "support"]);

// Wording that is only ever used by scams -> blocked.
const SCAM_TERMS: RegExp[] = [
  /free\s+(netflix|disney|hulu|spotify|prime|premium|paypal|robux|vbucks|v-bucks)/i,
  /account\s+(generator|giveaway)/i,
  /\b(keygen|cracked?|hack(ed|er|s)?|mod\s?apk|cheat\s?engine)\b/i,
  /\bgiveaway\b/i,
  /claim\s+your\s/i,
  /verify\s+your\s+(account|identity|card|wallet)/i,
  /(enter|confirm|provide)\s+your\s+(password|card|seed|wallet|ssn)/i,
  /\bairdrop\b/i,
  /double\s+your\s+(money|crypto|bitcoin)/i,
];

// Wording that suggests piracy -> a person has to look at it first.
const REVIEW_TERMS: RegExp[] = [
  /\btorrents?\b/i,
  /\bpirat(e|ed|es|ing)\b/i,
  /free\s+(movies?|tv|series|shows)\s+(online|streaming|stream)/i,
  /watch\s+(movies?|tv|series)\s+(online\s+)?for\s+free/i,
  /no\s+(subscription|signup|sign-up)\s+needed/i,
  /\bwarez\b/i,
];

const NAME_STOPWORDS = new Set([
  "app", "apps", "tv", "the", "official", "watch", "stream", "streaming", "video", "videos", "movies", "movie",
  "player", "online", "hd", "store", "site", "web", "and", "for", "free", "plus", "new", "best", "my",
]);

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const HOMOGLYPHS: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ѕ": "s", "ј": "j",
  "ԁ": "d", "ɡ": "g", "ǀ": "l", "ı": "i", "ο": "o", "ν": "v", "ɑ": "a", "ӏ": "l",
};

function fold1(s: string): string {
  const t = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return [...t].map((c) => HOMOGLYPHS[c] ?? c).join("");
}

/** Letters and digits only, lower case. Used when comparing names with websites. */
export function plain(s: string): string {
  return fold1(s).replace(/[^a-z0-9]/g, "");
}

/** Spelling tricks undone ("n3tf1ix" -> "netflix"). The digit 1 can be an l or an i, so two forms. */
export function variants(s: string): string[] {
  const base = fold1(s);
  const undo = (one: string) =>
    base
      .replace(/0/g, "o").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t")
      .replace(/@/g, "a").replace(/\$/g, "s").replace(/!/g, "i").replace(/1/g, one)
      .replace(/[^a-z0-9]/g, "");
  return [undo("l"), undo("i")];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const near = (a: string, brand: string) => a !== brand && brand.length >= 5 && levenshtein(a, brand) <= (brand.length >= 7 ? 2 : 1);

// ---------------------------------------------------------------------------
// Address helpers
// ---------------------------------------------------------------------------

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "go"]);

/** Approximation of the registrable domain (no full public-suffix list). */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (tld.length === 2 && SECOND_LEVEL.has(sld)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

export function isPrivateIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v.includes(":")) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateIp(mapped[1]);
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("2001:db8");
  }
  return true; // not an address we understand: treat as unsafe
}

export function checkUrl(input: string): { ok: true; url: URL } | { ok: false; reason: string } {
  const text = input.trim();
  if (text.length > 300) return { ok: false, reason: "The website address is too long." };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "That isn't a valid website address." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "The website address must start with https://" };
  if (url.username || url.password) return { ok: false, reason: "Addresses with a username or password aren't allowed." };
  if (url.port && url.port !== "443") return { ok: false, reason: "Custom ports aren't allowed." };
  const host = url.hostname.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || host.startsWith("[")) {
    return { ok: false, reason: "Websites must use a domain name, not a numeric address." };
  }
  if (!host.includes(".") || host === "localhost" || /\.(local|internal|lan|home|localhost)$/.test(host)) {
    return { ok: false, reason: "That address is not a public website." };
  }
  if (host.split(".").some((l) => l.startsWith("xn--"))) {
    return { ok: false, reason: "Look-alike (internationalised) domain names aren't allowed." };
  }
  if (SHORTENERS.has(registrableDomain(host))) return { ok: false, reason: "Link shorteners aren't allowed. Use the real website address." };
  return { ok: true, url };
}

// ---------------------------------------------------------------------------
// Reading the page
// ---------------------------------------------------------------------------

export interface PageInfo {
  title: string;
  siteName: string;
  ogTitle: string;
  appName: string;
  h1: string;
  hasPassword: boolean;
}

const ENT: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };
const decode = (s: string) => s.replace(/&(amp|quot|#39|apos|lt|gt|nbsp);/g, (m) => ENT[m] ?? m);
const strip = (s: string) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

export function parsePage(html: string): PageInfo {
  const info: PageInfo = { title: "", siteName: "", ogTitle: "", appName: "", h1: "", hasPassword: false };
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title) info.title = strip(title[1]).slice(0, 200);
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? "";
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    const content = strip(attrs.content ?? "").slice(0, 200);
    if (key === "og:site_name") info.siteName = content;
    else if (key === "og:title") info.ogTitle = content;
    else if (key === "application-name") info.appName = content;
  }
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1) info.h1 = strip(h1[1]).slice(0, 200);
  info.hasPassword = /<input[^>]+type\s*=\s*["']?password/i.test(html);
  return info;
}

async function readLimited(res: Response, limit: number): Promise<string> {
  const type = res.headers.get("content-type") ?? "";
  if (type && !/html|xml|text/i.test(type)) return "";
  if (!res.body) return (await res.text()).slice(0, limit);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return new TextDecoder().decode(all.slice(0, limit));
}

type Fetched = { ok: true; url: URL; html: string } | { ok: false; reason: string };

async function fetchPage(start: URL, deps: Deps): Promise<Fetched> {
  let url = start;
  for (let hop = 0; hop < 5; hop++) {
    const check = checkUrl(url.toString());
    if (!check.ok) return { ok: false, reason: hop === 0 ? check.reason : "The website redirects somewhere that isn't allowed." };
    let ips: string[];
    try {
      ips = await deps.resolve(url.hostname);
    } catch {
      return { ok: false, reason: "The website's address could not be found." };
    }
    if (!ips.length) return { ok: false, reason: "The website's address could not be found." };
    if (ips.some(isPrivateIp)) return { ok: false, reason: "The website points to a private network address." };
    let res: Response;
    try {
      res = await deps.fetch(url.toString(), {
        redirect: "manual",
        headers: { "user-agent": "M3TVStoreBot/1.0 (automatic app check)", accept: "text/html,*/*;q=0.5" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { ok: false, reason: "The website did not respond." };
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const where = res.headers.get("location");
      if (!where) return { ok: false, reason: "The website redirects without saying where." };
      try { url = new URL(where, url); } catch { return { ok: false, reason: "The website redirects to an invalid address." }; }
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 503) {
      return { ok: true, url, html: "" }; // exists, but blocks bots: a person will have to look
    }
    if (res.status >= 400) return { ok: false, reason: `The website doesn't load (error ${res.status}).` };
    return { ok: true, url, html: await readLimited(res, 250_000) };
  }
  return { ok: false, reason: "The website redirects too many times." };
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

export function brandChecks(name: string, host: string): string[] {
  const out: string[] = [];
  const reg = registrableDomain(host);
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const nameForms = variants(name);
  const hostForms = variants(host);
  const labelForms = variants(reg.split(".")[0]);
  for (const [brand, official] of Object.entries(BRANDS)) {
    if (official.includes(reg)) continue;
    const generic = GENERIC_BRANDS.has(brand);
    const wordHit = words.some((w) => variants(w).some((v) => v === brand || near(v, brand)));
    const nameHit = generic ? wordHit : wordHit || nameForms.some((v) => v.includes(brand));
    const hostHit = generic
      ? labelForms.some((v) => v === brand || near(v, brand))
      : hostForms.some((v) => v.includes(brand)) || labelForms.some((v) => near(v, brand));
    if (nameHit) out.push(`The name looks like “${brand}”, but this website isn't one of its official sites.`);
    if (hostHit) out.push(`The website address imitates “${brand}”.`);
  }
  return [...new Set(out)];
}

export function nameMatchesSite(name: string, host: string, page: PageInfo): boolean {
  const signals = [page.title, page.siteName, page.ogTitle, page.appName, page.h1, host.replace(/\./g, " ")];
  const joined = plain(signals.join(" "));
  const words = new Set(signals.join(" ").split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(plain));
  const whole = plain(name);
  if (whole && joined.includes(whole)) return true;
  const tokens = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(plain).filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
  if (!tokens.length) return true; // nothing meaningful to compare ("TV App")
  if (tokens.some((t) => (t.length >= 4 ? joined.includes(t) : words.has(t)))) return true;
  const label = plain(registrableDomain(host).split(".")[0]);
  return !!label && !!whole && levenshtein(whole, label) / Math.max(whole.length, label.length) <= 0.3;
}

// ---------------------------------------------------------------------------
// The whole check
// ---------------------------------------------------------------------------

export async function verifyApp(input: Input, deps: Deps): Promise<Verdict> {
  const reasons: string[] = [];
  const flags: string[] = [];
  const name = input.name.trim();
  const description = input.description.trim();
  const add = (list: string[], text: string) => { if (!list.includes(text)) list.push(text); };

  const urlCheck = checkUrl(input.url);
  if (!urlCheck.ok) {
    return { status: "blocked", reasons: [urlCheck.reason], flags: [], domain: "", finalUrl: null };
  }
  const host = urlCheck.url.hostname.toLowerCase();
  const domain = registrableDomain(host);

  if (deps.blockedDomains?.has(domain)) add(reasons, "This website is on the store's blocklist.");
  if (/https?:\/\/|www\.|\.(com|net|org|tv|io|xyz|app)\b/i.test(name)) add(reasons, "Don't put a web address in the app name.");
  brandChecks(name, host).forEach((r) => add(reasons, r));

  const text = `${name}\n${description}`;
  if (SCAM_TERMS.some((re) => re.test(text))) add(reasons, "The name or description uses wording that scams use.");
  if (REVIEW_TERMS.some((re) => re.test(text))) add(flags, "The description mentions content that needs a manual look.");
  if ((description.match(/https?:\/\//gi) ?? []).length > 1) add(flags, "The description contains several links.");
  if (SUSPICIOUS_TLDS.has(host.split(".").pop() ?? "")) add(flags, "This website's domain ending is often used for spam.");

  let finalUrl: string | null = null;
  if (!reasons.length) {
    const page = await fetchPage(urlCheck.url, deps);
    if (!page.ok) {
      add(reasons, page.reason);
    } else {
      finalUrl = page.url.toString();
      const finalHost = page.url.hostname.toLowerCase();
      if (registrableDomain(finalHost) !== domain) {
        add(flags, `The website redirects to a different domain (${registrableDomain(finalHost)}).`);
        brandChecks(name, finalHost).forEach((r) => add(reasons, r));
        if (deps.blockedDomains?.has(registrableDomain(finalHost))) add(reasons, "The website it redirects to is on the store's blocklist.");
      }
      const info = parsePage(page.html);
      const readable = !!(info.title || info.siteName || info.ogTitle || info.appName || info.h1);
      if (!readable) {
        add(flags, "The page could not be read automatically (it may need JavaScript or blocks checks).");
      } else if (!nameMatchesSite(name, finalHost, info)) {
        add(reasons, "The app name doesn't match what the website says it is. Use the name the website uses.");
      }
    }
  }

  if (!reasons.length) {
    try {
      if (await deps.isDangerous?.(urlCheck.url.toString())) add(reasons, "This website is listed as dangerous (phishing or malware).");
    } catch { /* the lookup is optional */ }
    try {
      const age = await deps.domainAgeDays?.(domain);
      if (age != null && age < 30) add(flags, "This website's domain was registered less than 30 days ago.");
    } catch { /* optional */ }
  }

  const status: Status = reasons.length ? "blocked" : flags.length ? "pending" : "approved";
  return { status, reasons, flags, domain, finalUrl };
}
