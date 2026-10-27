// Run with:  node --test store-backend/tests/   (Node 22.18 or newer)
import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyApp, checkUrl, isPrivateIp, registrableDomain, variants, levenshtein, brandChecks, parsePage, nameMatchesSite,
} from "../supabase/functions/submit-app/verify.ts";
import type { Deps } from "../supabase/functions/submit-app/verify.ts";

const html = (title: string, extra = "") =>
  `<!doctype html><html><head><title>${title}</title>${extra}</head><body><h1>${title}</h1></body></html>`;

/** Fake internet: url -> Response (or a function). Everything resolves to a public address. */
function world(pages: Record<string, string | Response>, over: Partial<Deps> = {}): Deps {
  return {
    resolve: async () => ["93.184.216.34"],
    fetch: async (url: string) => {
      const hit = pages[url];
      if (hit === undefined) throw new Error("no route");
      return typeof hit === "string" ? new Response(hit, { status: 200, headers: { "content-type": "text/html" } }) : hit.clone();
    },
    ...over,
  };
}
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
const input = (name: string, url: string, description = "A nice place to watch things.") => ({ name, url, description });

test("helpers", () => {
  assert.equal(registrableDomain("app.plex.tv"), "plex.tv");
  assert.equal(registrableDomain("www.bbc.co.uk"), "bbc.co.uk");
  assert.equal(levenshtein("netflix", "netfl1x"), 1);
  assert.ok(variants("N3TFL1X").includes("netflix"));
  assert.ok(variants("netf1ix").includes("netflix"));
  assert.equal(isPrivateIp("10.0.0.5"), true);
  assert.equal(isPrivateIp("192.168.1.9"), true);
  assert.equal(isPrivateIp("169.254.169.254"), true);
  assert.equal(isPrivateIp("::1"), true);
  assert.equal(isPrivateIp("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateIp("93.184.216.34"), false);
});

test("address rules", () => {
  for (const bad of ["http://example.com", "https://127.0.0.1", "https://localhost", "https://user:pw@example.com", "https://example.com:8443",
    "https://bit.ly/abc", "https://xn--netflx-9ua.com", "https://printer.local", "not a url", "https://intranet"]) {
    assert.equal(checkUrl(bad).ok, false, bad);
  }
  assert.equal(checkUrl("https://www.example.com/watch").ok, true);
});

test("a normal site is approved", async () => {
  const v = await verifyApp(input("Plex", "https://app.plex.tv"), world({ "https://app.plex.tv/": html("Plex") }));
  assert.equal(v.status, "approved", JSON.stringify(v));
});

test("the real brand site under the brand name is approved", async () => {
  const v = await verifyApp(input("Netflix", "https://www.netflix.com"), world({ "https://www.netflix.com/": html("Netflix - Watch TV Shows Online") }));
  assert.equal(v.status, "approved", JSON.stringify(v));
});

test("brand name on a different site is blocked", async () => {
  const v = await verifyApp(input("Netflix Free", "https://some-site.com"), world({ "https://some-site.com/": html("Netflix Free") }));
  assert.equal(v.status, "blocked");
  assert.match(v.reasons.join(" "), /netflix/i);
});

test("look-alike addresses are blocked", async () => {
  for (const url of ["https://netflix-free.xyz", "https://netf1ix-watch.com", "https://netflix.com.evil.io", "https://login-youtube.net", "https://netfliks.com", "https://paypa1.com"]) {
    const v = await verifyApp(input("My Movies", url), world({ [url + "/"]: html("My Movies") }));
    assert.equal(v.status, "blocked", url + " " + JSON.stringify(v));
  }
});

test("ordinary words that are also brands do not cause false alarms", async () => {
  const v = await verifyApp(input("Applesauce Recipes", "https://applesauce-recipes.com"), world({ "https://applesauce-recipes.com/": html("Applesauce Recipes") }));
  assert.equal(v.status, "approved", JSON.stringify(v));
  const w = await verifyApp(input("Complex Cinema", "https://complexcinema.com"), world({ "https://complexcinema.com/": html("Complex Cinema") }));
  assert.equal(w.status, "approved", JSON.stringify(w));
});

test("the name must match the website", async () => {
  const v = await verifyApp(input("Cool Movies", "https://example.com"), world({ "https://example.com/": html("Buy Cheap Watches Today") }));
  assert.equal(v.status, "blocked");
  assert.match(v.reasons.join(" "), /doesn't match/);
});

test("the name can match through the domain or site name", async () => {
  const a = await verifyApp(input("Streamflix", "https://streamflix.example"), world({ "https://streamflix.example/": html("Home") }));
  assert.equal(a.status, "approved", JSON.stringify(a));
  const b = await verifyApp(input("Acme Player", "https://www.acme-tv.com"), world({ "https://www.acme-tv.com/": html("Home", '<meta property="og:site_name" content="Acme Player">') }));
  assert.equal(b.status, "approved", JSON.stringify(b));
});

test("an unreadable page needs a manual look instead of a block", async () => {
  const empty = await verifyApp(input("Cool App", "https://cool-app.example"), world({ "https://cool-app.example/": "<html><body><div id=root></div></body></html>" }));
  assert.equal(empty.status, "pending");
  const walled = await verifyApp(input("Cool App", "https://cool-app.example"), world({ "https://cool-app.example/": new Response("no", { status: 403 }) }));
  assert.equal(walled.status, "pending");
});

test("unreachable and broken sites are blocked", async () => {
  assert.equal((await verifyApp(input("Cool App", "https://gone.example"), world({}))).status, "blocked");
  assert.equal((await verifyApp(input("Cool App", "https://gone.example"), world({ "https://gone.example/": new Response("x", { status: 404 }) }))).status, "blocked");
  assert.equal((await verifyApp(input("Cool App", "https://gone.example"), world({}, { resolve: async () => [] }))).status, "blocked");
});

test("sites that resolve to private addresses are blocked (SSRF)", async () => {
  const v = await verifyApp(input("Cool App", "https://cool-app.example"), world({ "https://cool-app.example/": html("Cool App") }, { resolve: async () => ["169.254.169.254"] }));
  assert.equal(v.status, "blocked");
  assert.match(v.reasons.join(" "), /private/);
});

test("redirects to another domain are flagged, and hops are re-checked", async () => {
  const a = await verifyApp(input("Cool App", "https://cool-app.example"), world({
    "https://cool-app.example/": redirect("https://other-site.example/"),
    "https://other-site.example/": html("Cool App"),
  }));
  assert.equal(a.status, "pending", JSON.stringify(a));
  const b = await verifyApp(input("Cool App", "https://cool-app.example"), world({
    "https://cool-app.example/": redirect("http://insecure.example/"),
  }));
  assert.equal(b.status, "blocked");
  const c = await verifyApp(input("Cool App", "https://cool-app.example"), world({
    "https://cool-app.example/": redirect("https://netflix-login.example/"),
    "https://netflix-login.example/": html("Cool App"),
  }));
  assert.equal(c.status, "blocked");
});

test("scam wording is blocked, piracy wording is reviewed", async () => {
  const page = { "https://cool-app.example/": html("Cool App") };
  assert.equal((await verifyApp(input("Cool App", "https://cool-app.example", "Free Netflix account generator, claim your reward"), world(page))).status, "blocked");
  assert.equal((await verifyApp(input("Cool App", "https://cool-app.example", "Watch movies online for free, no signup needed"), world(page))).status, "pending");
});

test("new domains are flagged and dangerous sites blocked", async () => {
  const page = { "https://cool-app.example/": html("Cool App") };
  assert.equal((await verifyApp(input("Cool App", "https://cool-app.example"), world(page, { domainAgeDays: async () => 3 }))).status, "pending");
  assert.equal((await verifyApp(input("Cool App", "https://cool-app.example"), world(page, { domainAgeDays: async () => 900 }))).status, "approved");
  assert.equal((await verifyApp(input("Cool App", "https://cool-app.example"), world(page, { isDangerous: async () => true }))).status, "blocked");
  assert.equal((await verifyApp(input("Cool App", "https://cool-app.example"), world(page, { blockedDomains: new Set(["cool-app.example"]) }))).status, "blocked");
  // a failing optional lookup must not break the check
  assert.equal((await verifyApp(input("Cool App", "https://cool-app.example"), world(page, { domainAgeDays: async () => { throw new Error("down"); } }))).status, "approved");
});

test("page parsing", () => {
  const p = parsePage(`<title> A &amp; B </title><meta property="og:site_name" content="Site"><input type="password"><h1>Big <b>Title</b></h1>`);
  assert.deepEqual([p.title, p.siteName, p.h1, p.hasPassword], ["A & B", "Site", "Big Title", true]);
  assert.equal(nameMatchesSite("TV App", "x.example", p), true);
  assert.deepEqual(brandChecks("Plex", "app.plex.tv"), []);
});
