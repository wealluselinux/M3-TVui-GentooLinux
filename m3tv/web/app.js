"use strict";

// Standard Material icon paths (24x24, Apache-2.0).
const ICONS = {
  tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 14v2h8v-2h-8zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
  power: "M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z",
  del: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  search: "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  person: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  store: "M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  gear: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
};

// Simple line icons for the status bar. Constant markup only, never user data.
const STROKE = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const CLOUD = '<path d="M6.5 18a4 4 0 0 1-.5-7.97 6 6 0 0 1 11.6 1.2A3.4 3.4 0 0 1 17 18z"/>';
const SUN_RAYS = '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const WEATHER_ICONS = {
  clear: `<svg ${STROKE}><circle cx="12" cy="12" r="4"/>${SUN_RAYS}</svg>`,
  night: `<svg ${STROKE}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`,
  partly: `<svg ${STROKE}><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1M2.5 8h1M3.6 3.6l.7.7M12.4 3.6l-.7.7"/><g transform="translate(4 3.5) scale(.8)">${CLOUD}</g></svg>`,
  cloud: `<svg ${STROKE}>${CLOUD}</svg>`,
  fog: `<svg ${STROKE}><path d="M4 8h16M3 12h18M5 16h14M8 20h8"/></svg>`,
  rain: `<svg ${STROKE}><g transform="translate(0 -2)">${CLOUD}</g><path d="M8 19l-1 2.5M12 19l-1 2.5M16 19l-1 2.5"/></svg>`,
  snow: `<svg ${STROKE}><g transform="translate(0 -2)">${CLOUD}</g><path d="M8 20h.01M12 20h.01M16 20h.01M10 22.5h.01M14 22.5h.01" stroke-width="3"/></svg>`,
  storm: `<svg ${STROKE}><g transform="translate(0 -2)">${CLOUD}</g><path d="M13 16l-3 3.5h3L11 23"/></svg>`,
  none: `<svg ${STROKE}>${CLOUD}</svg>`,
};

function wifiIcon(level, slashed) {
  const arcs = ["M8.6 15.4a5 5 0 0 1 6.8 0", "M5.4 12.2a9.5 9.5 0 0 1 13.2 0", "M2.2 9a14 14 0 0 1 19.6 0"];
  const parts = arcs.map((d, i) => `<path d="${d}" opacity="${i < level ? 1 : 0.28}"/>`).join("");
  return `<svg ${STROKE}>${parts}<circle cx="12" cy="19" r="1.2" fill="currentColor"/>${slashed ? '<path d="M4 4l16 16"/>' : ""}</svg>`;
}
const ETHERNET_ICON = `<svg ${STROKE}><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/></svg>`;

const SWATCH_HUES = [285, 255, 215, 185, 150, 95, 55, 25, 350, 320];
const SESSION_KEY = "m3tv.session";
const BUILTIN = { "builtin-store": { name: "M3TV Store", glyph: "store" }, "builtin-settings": { name: "Settings", glyph: "gear" } };

const $ = (sel) => document.querySelector(sel);
let state = {
  services: [], logos: {}, recent: [], hue: 285, scale: 1, running: null, browser: null,
  network: null, weather: null, units: "auto", hotkey: null, home_hotkey: "Ctrl+X", store: { url: "", anon_key: "" },
};
let catalogApps = [];     // curated apps from /api/catalog
let community = [];       // approved community apps from Supabase
let communityLoaded = false;
let session = null;       // Supabase session { access_token, refresh_token, expires_at, user }
try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (_) { session = null; }
let acctMode = "in";
let tab = "home";         // "home", "apps" or "store"
let editing = false;
let previewId = null;     // app shown in the hero while you point at it
let previewTimer = null;
let heroIdx = 0;
let storeCat = "Featured";
let storeQ = "";
let newHue = 285;
let wx = null;            // { temp, kind }
let current = null;       // app shown in the detail dialog
let recording = false;

const byId = (id) => state.services.find((s) => s.id === id);
const isEditing = () => editing && tab === "apps";
const storeOn = () => !!(state.store && state.store.url);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICONS[name]);
  svg.appendChild(path);
  return svg;
}

async function api(path, body) {
  const opts = body === undefined
    ? {}
    : { method: "POST", headers: { "Content-Type": "application/json", "X-M3TV": "1" }, body: JSON.stringify(body) };
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

let snackTimer;
function snack(message) {
  const bar = $("#snack");
  bar.textContent = message;
  bar.hidden = false;
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { bar.hidden = true; }, 4000);
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Late night viewing" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function setAmbient(hue) { document.body.style.setProperty("--ah", hue); }

const openDialogs = () => document.querySelector("dialog[open]");

// ---------- header: clock, network, weather ----------
function tickClock() {
  $("#clock").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderNet() {
  const net = state.network || { type: "none", level: 0, ssid: null };
  const node = $("#net");
  let label;
  if (net.type === "ethernet") {
    node.innerHTML = ETHERNET_ICON;
    label = navigator.onLine ? "Wired network" : "Wired network, no internet";
  } else if (net.type === "wifi") {
    node.innerHTML = wifiIcon(net.level, !navigator.onLine);
    label = (net.ssid ? "Wi-Fi: " + net.ssid : "Wi-Fi") + (navigator.onLine ? "" : ", no internet");
  } else {
    node.innerHTML = wifiIcon(0, true);
    label = "No network";
  }
  node.classList.toggle("warn", net.type === "none" || !navigator.onLine);
  node.title = label;
  node.setAttribute("aria-label", label);
}

function unitFor() {
  if (state.units === "c" || state.units === "f") return state.units;
  return (navigator.language || "").toLowerCase() === "en-us" ? "f" : "c";
}

function weatherKind(code, isDay) {
  if (code === 0) return isDay ? "clear" : "night";
  if (code <= 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  if (code >= 51) return "rain";
  return "cloud";
}

function renderWeather() {
  const chip = $("#weather");
  chip.replaceChildren();
  if (!state.weather) {
    chip.insertAdjacentHTML("beforeend", WEATHER_ICONS.none);
    chip.append(el("span", null, "Set weather"));
    chip.title = "Choose a weather location in Settings";
  } else if (!wx) {
    chip.insertAdjacentHTML("beforeend", WEATHER_ICONS.none);
    chip.append(el("span", null, "–"));
    chip.title = state.weather.name || "Weather";
  } else {
    chip.insertAdjacentHTML("beforeend", WEATHER_ICONS[wx.kind] || WEATHER_ICONS.none);
    chip.append(el("span", null, Math.round(wx.temp) + "°"));
    chip.title = state.weather.name || "Weather";
  }
}

async function loadWeather() {
  const place = state.weather;
  if (!place) { wx = null; renderWeather(); return; }
  const unit = unitFor() === "f" ? "fahrenheit" : "celsius";
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + place.lat + "&longitude=" + place.lon +
    "&current=temperature_2m,weather_code,is_day&temperature_unit=" + unit;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("weather");
    const cur = (await res.json()).current;
    wx = { temp: cur.temperature_2m, kind: weatherKind(cur.weather_code, cur.is_day === 1) };
  } catch (_) { /* offline: keep the last reading */ }
  renderWeather();
}

async function findPlace(query) {
  const parts = query.split(",");
  const name = parts[0].trim();
  const hint = (parts[1] || "").trim().toLowerCase();
  const url = "https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=" + encodeURIComponent(name);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not reach the weather service");
  const results = (await res.json()).results || [];
  const match = results.find((r) => !hint ||
    [r.admin1, r.country, r.country_code].some((v) => v && v.toLowerCase().includes(hint))) || results[0];
  if (!match) throw new Error("No place found for “" + query + "”");
  return { name: match.name + (match.admin1 ? ", " + match.admin1 : match.country ? ", " + match.country : ""), lat: match.latitude, lon: match.longitude };
}

// ---------- logos, circles, hero ----------
function fillLogo(node, svc) {
  node.replaceChildren();
  node.classList.remove("fallback");
  const monogram = (svc.name[0] || "?").toUpperCase();
  const fallback = () => { node.replaceChildren(); node.classList.add("fallback"); node.textContent = monogram; };
  if (svc.iconUrl) { communityLogo(node, svc); return; }
  const version = svc.logo || (state.logos && state.logos[svc.id]);
  if (!version) { fallback(); return; }
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.addEventListener("error", fallback);
  img.src = "/api/logo/" + svc.id + "?v=" + version;
  node.appendChild(img);
}

function hostOf(url) {
  try { return new URL(url).host.replace(/^www\./, ""); } catch (_) { return ""; }
}

function preview(id, hue, delay) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    setAmbient(hue);
    if (tab === "home" && !isEditing() && previewId !== id) { previewId = id; renderHero(true); }
  }, delay);
}

// Logo-only circle. The name shows in the hero when you point at it.
function makeCircle(id, name, hue, svc) {
  const b = el("button", "circle");
  b.type = "button";
  b.setAttribute("role", "listitem");
  b.setAttribute("aria-label", name);
  b.title = name;
  b.style.setProperty("--th", hue);
  if (svc) {
    fillLogo(b, svc);
    if (state.running === id && !isEditing()) b.appendChild(el("span", "badge", "Open"));
  } else {
    b.classList.add("builtin");
    b.appendChild(icon(BUILTIN[id].glyph));
  }
  b.addEventListener("focus", () => preview(id, hue, 0));
  b.addEventListener("mouseenter", () => preview(id, hue, 220));
  b.addEventListener("click", () => (svc ? launch(svc) : openBuiltin(id)));
  return b;
}

function openBuiltin(id) {
  if (id === "builtin-store") setTab("store");
  if (id === "builtin-settings") openSettings();
}

const installed = (id) => state.services.some((x) => x.id === id);
const allApps = () => [...catalogApps, ...community];
const picks = () => allApps().filter((a) => !installed(a.id));

function heroItems() {
  const mine = [...(state.recent || []).map(byId).filter(Boolean), ...state.services.filter((x) => !(state.recent || []).includes(x.id))].slice(0, 3);
  const items = mine.map((svc) => ({ svc }));
  picks().slice(0, mine.length ? 3 : 4).forEach((svc) => items.push({ svc, pick: true }));
  if (!mine.length) items.unshift({ builtin: "builtin-store", welcome: true });
  return items;
}

function heroModel() {
  if (previewId) {
    if (BUILTIN[previewId]) return { builtin: previewId };
    const s = byId(previewId);
    if (s) return { svc: s };
  }
  const run = byId(state.running);
  if (run) return { svc: run, running: true };
  const items = heroItems();
  return items[heroIdx % items.length] || { builtin: "builtin-store", welcome: true };
}

function renderHero(swap) {
  const m = heroModel();
  const hero = $("#hero");
  const art = $("#hero-art");
  const runSvc = byId(state.running);
  const open = $("#hero-open");
  const home = $("#hero-home");
  let hue = state.hue;
  art.className = "hero-art";
  if (m.builtin) {
    const b = BUILTIN[m.builtin];
    const store = m.builtin === "builtin-store";
    $("#hero-eyebrow").textContent = m.welcome ? greeting() : "Built in";
    $("#hero-title").textContent = m.welcome ? "Welcome to M3 TV" : b.name;
    $("#hero-sub").textContent = store
      ? (m.welcome ? "Your TV is empty on purpose. Open the M3TV Store to get YouTube, Netflix, Spotify and more." : "Get YouTube, Netflix, Spotify and more.")
      : "Theme, home key, weather and sign-ins.";
    art.classList.add("glyph");
    art.replaceChildren(icon(b.glyph));
    open.textContent = "Open " + b.name;
    open.hidden = false;
    open.onclick = () => openBuiltin(m.builtin);
  } else {
    const svc = m.svc;
    hue = svc.hue;
    $("#hero-eyebrow").textContent = m.running ? "Open now" : m.pick ? "Top pick" : (svc.group || "Your apps");
    $("#hero-title").textContent = svc.name;
    $("#hero-sub").textContent = m.running
      ? (state.hotkey ? "Press " + state.hotkey + " to come back here." : "Press your home key to come back here.")
      : (svc.subtitle || hostOf(svc.url));
    fillLogo(art, svc);
    open.hidden = !!m.running;
    open.textContent = m.pick ? "Install " + svc.name : "Open " + svc.name;
    open.onclick = () => (m.pick ? openApp(svc) : launch(svc));
  }
  home.hidden = !runSvc;
  home.textContent = runSvc ? "Close " + runSvc.name : "";
  hero.style.setProperty("--th", hue);
  setAmbient(hue);

  const dots = $("#dots");
  dots.replaceChildren();
  const items = heroItems();
  if (items.length > 1 && !previewId && !runSvc) {
    items.forEach((_, i) => {
      const d = el("button", "dot");
      d.type = "button";
      d.setAttribute("role", "tab");
      d.setAttribute("aria-label", "Featured " + (i + 1));
      d.setAttribute("aria-selected", String(i === heroIdx % items.length));
      d.addEventListener("click", () => { heroIdx = i; renderHero(true); });
      dots.appendChild(d);
    });
  }
  if (swap) {
    hero.classList.remove("swap");
    void hero.offsetWidth;
    hero.classList.add("swap");
  }
}

function makeCard(svc) {
  const card = el("div", "card");
  card.tabIndex = 0;
  card.setAttribute("role", "listitem");
  card.style.setProperty("--th", svc.hue);
  const art = el("div", "art");
  const plate = el("div", "plate");
  fillLogo(plate, svc);
  art.appendChild(plate);
  card.appendChild(art);
  const meta = el("div", "meta");
  meta.appendChild(el("h3", null, svc.name));
  if (svc.subtitle) meta.appendChild(el("p", null, svc.subtitle));
  card.appendChild(meta);
  const open = () => openApp(svc);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); } });
  return card;
}

function renderRows() {
  const rows = $("#rows");
  rows.replaceChildren();
  const top = picks().slice(0, 12);
  if (top.length) {
    const cards = el("div", "rail");
    cards.setAttribute("role", "list");
    top.forEach((a) => cards.appendChild(makeCard(a)));
    rows.append(el("h2", "row-title", "Top picks for you"), cards);
  }
  const rail = el("div", "circles");
  rail.setAttribute("role", "list");
  rail.append(makeCircle("builtin-store", "M3TV Store", state.hue));
  rail.append(makeCircle("builtin-settings", "Settings", state.hue));
  state.services.forEach((svc) => rail.append(makeCircle(svc.id, svc.name, svc.hue, svc)));
  rows.append(el("h2", "row-title", "Your apps"), rail);
}

function renderApps() {
  const grid = $("#grid");
  grid.replaceChildren();
  const put = (circle, removable) => {
    const wrap = el("div", "wrap-circle");
    wrap.appendChild(circle);
    if (removable && isEditing()) {
      const del = el("button", "del");
      del.type = "button";
      del.setAttribute("aria-label", "Remove " + removable.name);
      del.appendChild(icon("del"));
      del.addEventListener("click", () => removeService(removable.id));
      wrap.appendChild(del);
    }
    grid.appendChild(wrap);
  };
  put(makeCircle("builtin-store", "M3TV Store", state.hue), null);
  put(makeCircle("builtin-settings", "Settings", state.hue), null);
  state.services.forEach((svc) => put(makeCircle(svc.id, svc.name, svc.hue, svc), svc));
  $("#apps-title").textContent = isEditing() ? "Tap the bin to remove an app" : "Your apps";
  $("#btn-edit").textContent = isEditing() ? "Done" : "Edit";
  $("#btn-edit").hidden = state.services.length === 0;
}

function render() {
  document.documentElement.style.setProperty("--h", state.hue);
  $("#view-home").hidden = tab !== "home";
  $("#view-apps").hidden = tab !== "apps";
  $("#view-store").hidden = tab !== "store";
  $("#tab-store").setAttribute("aria-selected", String(tab === "store"));
  $("#tab-home").setAttribute("aria-selected", String(tab === "home"));
  $("#tab-apps").setAttribute("aria-selected", String(tab === "apps"));
  document.body.classList.toggle("editing", isEditing());
  if (tab === "home") { renderHero(false); renderRows(); } else if (tab === "store") { renderStore(); } else { renderApps(); }
  renderAvatar();
  renderNet();
  renderWeather();
}


function setTab(name) {
  tab = name;
  editing = false;
  previewId = null;
  clearTimeout(previewTimer);
  if (name !== "home") setAmbient(state.hue);
  if (name === "store") { loadCatalog(); loadCommunity(); }
  render();
}

const gridKey = (s) => JSON.stringify([s.services, s.running, s.hue, s.logos, s.hotkey, s.recent]);
const weatherKey = (s) => JSON.stringify([s.weather, s.units]);

async function refresh() {
  try {
    const next = await api("/api/state");
    const prev = state;
    state = next;
    if (gridKey(prev) !== gridKey(next) && !openDialogs()) render();
    renderNet();
    if (weatherKey(prev) !== weatherKey(next)) loadWeather();
  } catch (_) { /* server restarting; try again on the next tick */ }
}

// ---------- M3TV Store ----------
async function loadCatalog() {
  try {
    const next = (await api("/api/catalog")).apps;
    const key = (l) => JSON.stringify(l.map((a) => [a.id, a.logo]));
    const changed = key(next) !== key(catalogApps);
    catalogApps = next;
    if (changed && !openDialogs() && tab !== "apps") render();
  } catch (_) { /* offline server restart */ }
}

function makeTile(app) {
  const t = el("button", "tile");
  t.type = "button";
  t.style.setProperty("--th", app.hue);
  const plate = el("div", "plate");
  fillLogo(plate, app);
  t.append(plate, el("span", "nm", app.name), el("span", "sub", installed(app.id) ? "Installed" : app.category || ""));
  t.addEventListener("click", () => openApp(app));
  return t;
}

function tiles(list, wrap) {
  const row = el("div", "tiles" + (wrap ? " wrap" : ""));
  row.setAttribute("role", "list");
  list.forEach((a) => row.appendChild(makeTile(a)));
  return row;
}

function renderStore() {
  const cats = ["Featured", ...new Set(catalogApps.map((a) => a.category)), "Community"];
  if (!cats.includes(storeCat)) storeCat = "Featured";
  const chips = $("#store-chips");
  chips.replaceChildren(...cats.map((c) => {
    const p = el("button", "pill", c);
    p.type = "button";
    p.setAttribute("role", "tab");
    p.setAttribute("aria-selected", String(c === storeCat && !storeQ));
    p.addEventListener("click", () => { storeCat = c; storeQ = ""; $("#store-q").value = ""; renderStore(); });
    return p;
  }));
  const body = $("#store-body");
  body.replaceChildren();
  if (!catalogApps.length) { body.append(el("p", "empty", "Loading apps…")); return; }
  const q = storeQ.trim().toLowerCase();
  if (q) {
    const hits = allApps().filter((a) => (a.name + " " + (a.subtitle || "") + " " + a.category).toLowerCase().includes(q));
    body.append(hits.length ? tiles(hits, true) : el("p", "empty", "No apps match “" + storeQ.trim() + "”. You can add any website from the Apps tab."));
    return;
  }
  if (storeCat === "Community") { body.append(communityBlock(true)); return; }
  if (storeCat !== "Featured") { body.append(tiles(catalogApps.filter((a) => a.category === storeCat), true)); return; }
  const feat = picks()[0] || catalogApps[0];
  const banner = el("button", "banner");
  banner.type = "button";
  banner.style.setProperty("--th", feat.hue);
  const text = el("div");
  text.append(el("p", "eyebrow", "Featured"), el("h3", null, feat.name), el("p", null, feat.subtitle || hostOf(feat.url)));
  const plate = el("div", "plate big");
  fillLogo(plate, feat);
  banner.append(plate, text);
  banner.addEventListener("click", () => openApp(feat));
  body.append(banner);
  cats.slice(1, -1).forEach((c) => {
    body.append(el("h2", "row-title", c), tiles(catalogApps.filter((a) => a.category === c)));
  });
  body.append(el("h2", "row-title", "Community"), communityBlock(false));
}

function communityBlock(wrap) {
  if (!storeOn()) return el("p", "empty", "Community apps are not set up on this TV yet. See store-backend/README.md to connect a Supabase project.");
  if (!community.length) return el("p", "empty", "No community apps yet. Be the first: sign in and publish one.");
  return tiles(community, wrap);
}

function openApp(app) {
  current = app;
  const have = installed(app.id);
  fillLogo($("#app-plate"), app);
  $("#app-plate").style.setProperty("--th", app.hue);
  $("#app-name").textContent = app.name;
  $("#app-by").textContent = app.community ? "Community app by " + app.publisher : "M3TV Store" + (app.category ? " · " + app.category : "");
  $("#app-desc").textContent = app.description || app.subtitle || "";
  $("#app-report").hidden = !app.community;
  $("#app-host").textContent = hostOf(app.url);
  $("#app-main").textContent = have ? "Open" : "Install";
  $("#app-remove").hidden = !have;
  $("#dlg-app").showModal();
}

async function appMain() {
  const app = current;
  if (!app) return;
  if (installed(app.id)) { $("#dlg-app").close(); launch(byId(app.id)); return; }
  try {
    state = app.community
      ? await api("/api/install-remote", { id: app.slug, name: app.name, url: app.url, description: app.description, hue: app.hue, icon_url: app.iconUrl, subtitle: "Community app" })
      : await api("/api/install", { id: app.id });
    catalogApps = catalogApps.map((a) => (a.id === app.id ? { ...a, installed: true } : a));
    if (app.community) app = { ...app, id: "c-" + app.slug };
    current = app;
    snack(app.name + " installed. Find it on your home screen.");
    openApp(app);
  } catch (err) { snack(err.message); }
}

async function appRemove() {
  const app = current;
  if (!app) return;
  try {
    state = await api("/api/uninstall", { id: app.id });
    snack(app.name + " removed");
    openApp(app);
  } catch (err) { snack(err.message); }
}

// ---------- community Store (Supabase) ----------
function saveSession(s) {
  session = s;
  try { s ? localStorage.setItem("m3tv.session", JSON.stringify(s)) : localStorage.removeItem("m3tv.session"); } catch (_) { /* private mode */ }
}

function headersFor(token) {
  const key = state.store.anon_key;
  const h = { apikey: key, "Content-Type": "application/json" };
  const bearer = token || (key.startsWith("eyJ") ? key : "");
  if (bearer) h.Authorization = "Bearer " + bearer;
  return h;
}

async function sbFetch(path, opts = {}) {
  const res = await fetch(state.store.url + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* not JSON */ }
  if (!res.ok) throw new Error((data && (data.msg || data.message || data.error_description || data.error)) || "Store error " + res.status);
  return data;
}

function toSession(d) {
  const u = d.user || {};
  return {
    access_token: d.access_token, refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    user: { id: u.id, email: u.email, username: (u.user_metadata && u.user_metadata.username) || (u.email || "").split("@")[0] },
  };
}

async function freshToken() {
  if (!session) throw new Error("Sign in first");
  if (session.expires_at - Date.now() / 1000 < 60) {
    try {
      const d = await sbFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: headersFor(), body: JSON.stringify({ refresh_token: session.refresh_token }) });
      saveSession(toSession(d));
    } catch (_) {
      saveSession(null);
      renderAvatar();
      throw new Error("Your session ended. Please sign in again.");
    }
  }
  return session.access_token;
}

async function loadCommunity() {
  if (!storeOn()) return;
  try {
    const rows = await sbFetch("/rest/v1/store_apps?select=*&order=created_at.desc&limit=60", { headers: headersFor() });
    community = rows.map((r) => ({
      id: "c-" + r.slug, slug: r.slug, remoteId: r.id, name: r.name, url: r.url, description: r.description, subtitle: r.description,
      category: r.category, hue: r.hue, publisher: r.publisher, community: true,
      iconUrl: state.store.url + "/storage/v1/object/public/app-icons/" + r.icon_path.split("/").map(encodeURIComponent).join("/"),
      logo: 1,
    }));
    if (!openDialogs() && tab !== "apps") render();
  } catch (_) { /* offline: keep what we have */ }
}

function communityLogo(node, app) {
  node.replaceChildren();
  node.classList.remove("fallback");
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.addEventListener("error", () => { node.replaceChildren(); node.classList.add("fallback"); node.textContent = (app.name[0] || "?").toUpperCase(); });
  img.src = app.iconUrl;
  node.appendChild(img);
}

function renderAvatar() {
  const a = $("#btn-account");
  a.replaceChildren();
  if (session) a.textContent = (session.user.username[0] || "?").toUpperCase();
  else a.appendChild(icon("person"));
  a.title = session ? session.user.username : "Sign in";
}

function setAcctMode(mode) {
  acctMode = mode;
  $("#acct-tab-in").setAttribute("aria-pressed", String(mode === "in"));
  $("#acct-tab-up").setAttribute("aria-pressed", String(mode === "up"));
  $("#acct-tab-in").className = "btn " + (mode === "in" ? "tonal" : "text");
  $("#acct-tab-up").className = "btn " + (mode === "up" ? "tonal" : "text");
  $("#acct-user-wrap").hidden = mode !== "up";
  $("#acct-submit").textContent = mode === "up" ? "Create account" : "Sign in";
  $("#acct-pass").autocomplete = mode === "up" ? "new-password" : "current-password";
  $("#acct-msg").textContent = "";
}

async function renderMine() {
  const list = $("#acct-mine");
  list.replaceChildren(el("li", null, "Loading…"));
  try {
    const token = await freshToken();
    const rows = await sbFetch("/rest/v1/apps?select=slug,name,status,reasons,flags&owner=eq." + session.user.id + "&order=created_at.desc&limit=20", { headers: headersFor(token) });
    list.replaceChildren(...(rows.length ? rows : [{ name: "Nothing yet", status: "" }]).map((r) => {
      const li = el("li");
      li.append(el("span", null, r.name));
      if (r.status) {
        const st = el("span", "st " + r.status, r.status === "approved" ? "Live" : r.status === "pending" ? "In review" : "Blocked");
        if (r.status !== "approved") st.title = [...(r.reasons || []), ...(r.flags || [])].join(" ");
        li.append(st);
      }
      return li;
    }));
  } catch (err) { list.replaceChildren(el("li", null, err.message)); }
}

function openAccount() {
  const on = storeOn();
  $("#acct-setup").hidden = on;
  $("#acct-out").hidden = !on || !!session;
  $("#acct-in").hidden = !on || !session;
  $("#acct-title").textContent = session ? "Your account" : "Sign in to M3TV";
  if (session) { $("#acct-hello").textContent = "Signed in as " + session.user.username + " (" + session.user.email + ")."; renderMine(); }
  else setAcctMode("in");
  $("#dlg-account").showModal();
}

async function submitAccount(ev) {
  ev.preventDefault();
  const msg = $("#acct-msg");
  const email = $("#acct-email").value.trim();
  const password = $("#acct-pass").value;
  msg.textContent = "";
  try {
    if (acctMode === "up") {
      const username = $("#acct-user").value.trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) throw new Error("Username: 3 to 20 letters, numbers or underscores.");
      const free = await sbFetch("/rest/v1/rpc/username_available", { method: "POST", headers: headersFor(), body: JSON.stringify({ name: username }) });
      if (!free) throw new Error("That username is taken.");
      const d = await sbFetch("/auth/v1/signup", { method: "POST", headers: headersFor(), body: JSON.stringify({ email, password, data: { username } }) });
      if (d && d.access_token) { saveSession(toSession(d)); }
      else { msg.textContent = "Account created. Check your email to confirm it, then sign in."; setAcctMode("in"); $("#acct-msg").textContent = "Account created. Check your email to confirm it, then sign in."; return; }
    } else {
      const d = await sbFetch("/auth/v1/token?grant_type=password", { method: "POST", headers: headersFor(), body: JSON.stringify({ email, password }) });
      saveSession(toSession(d));
    }
    $("#form-account").reset();
    renderAvatar();
    openAccount();
    snack("Signed in as " + session.user.username);
  } catch (err) { msg.textContent = err.message; }
}

function openPublish() {
  if (!storeOn()) { openAccount(); return; }
  if (!session) { snack("Sign in to publish an app"); openAccount(); return; }
  $("#form-publish").reset();
  $("#pub-result").hidden = true;
  $("#pub-submit").disabled = false;
  $("#dlg-publish").showModal();
  $("#pub-name").focus();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the icon file"));
    r.readAsDataURL(file);
  });
}

function showVerdict(v) {
  const box = $("#pub-result");
  box.hidden = false;
  box.className = "verdict " + v.status;
  box.replaceChildren();
  const head = { approved: "Published! Your app is now in the Store.", pending: "Submitted. It needs a manual review before it appears.", blocked: "Blocked. This app can't be published." }[v.status];
  box.append(el("b", null, head));
  box.scrollIntoView({ block: "nearest" });
  const items = [...(v.reasons || []), ...(v.flags || [])];
  if (items.length) { const ul = el("ul"); items.forEach((t) => ul.append(el("li", null, t))); box.append(ul); }
}

async function submitPublish(ev) {
  ev.preventDefault();
  const file = $("#pub-icon").files[0];
  if (!file) return;
  if (file.size > 512 * 1024) { showVerdict({ status: "blocked", reasons: ["The icon is larger than 512 KB."] }); return; }
  $("#pub-submit").disabled = true;
  $("#pub-submit").textContent = "Checking…";
  try {
    const token = await freshToken();
    const body = {
      name: $("#pub-name").value.trim(), url: $("#pub-url").value.trim(), description: $("#pub-desc").value.trim(),
      category: $("#pub-cat").value, icon: await fileToBase64(file), icon_type: file.type,
    };
    const v = await sbFetch("/functions/v1/submit-app", { method: "POST", headers: headersFor(token), body: JSON.stringify(body) });
    showVerdict(v);
    if (v.status === "approved") loadCommunity();
  } catch (err) { showVerdict({ status: "blocked", reasons: [err.message] }); }
  $("#pub-submit").disabled = false;
  $("#pub-submit").textContent = "Check and publish";
}

async function reportApp() {
  const app = current;
  if (!app || !app.community) return;
  if (!session) { snack("Sign in to report an app"); return; }
  const reason = (window.prompt("Why are you reporting " + app.name + "? (scam, copycat, broken…)") || "").trim();
  if (reason.length < 3) return;
  try {
    const token = await freshToken();
    await sbFetch("/rest/v1/reports", { method: "POST", headers: { ...headersFor(token), Prefer: "return=minimal" }, body: JSON.stringify({ app_id: app.remoteId, reporter: session.user.id, reason: reason.slice(0, 300) }) });
    snack("Thanks. Reported.");
  } catch (err) { snack(/duplicate|unique/i.test(err.message) ? "You already reported this app." : err.message); }
}

// ---------- actions ----------
async function launch(svc) {
  snack("Opening " + svc.name + "…");
  try {
    await api("/api/launch", { id: svc.id });
    previewId = null;
    state.running = svc.id;
    state.recent = [svc.id, ...(state.recent || []).filter((r) => r !== svc.id)].slice(0, 8);
    render();
  } catch (err) {
    snack(err.message);
  }
}

async function goHome() {
  try { await api("/api/home", {}); previewId = null; state.running = null; render(); } catch (err) { snack(err.message); }
}

async function removeService(id) {
  try { state = await api("/api/uninstall", { id }); render(); } catch (err) { snack(err.message); }
}

function swatchRow(container, selected, onPick) {
  container.replaceChildren();
  SWATCH_HUES.forEach((hue) => {
    const b = el("button", "swatch");
    b.type = "button";
    b.style.setProperty("--sw", hue);
    b.setAttribute("aria-label", "Colour " + hue);
    b.setAttribute("aria-pressed", String(hue === selected));
    b.addEventListener("click", () => {
      onPick(hue);
      swatchRow(container, hue, onPick);
    });
    container.appendChild(b);
  });
}

// ---------- dialogs ----------
function nearestSwatch(hue) {
  return SWATCH_HUES.reduce((a, b) => (Math.abs(b - hue) < Math.abs(a - hue) ? b : a));
}

function openSettings() {
  swatchRow($("#swatches"), nearestSwatch(state.hue), async (hue) => {
    state.hue = hue;
    document.documentElement.style.setProperty("--h", hue);
    try { await api("/api/settings", { hue }); } catch (err) { snack(err.message); }
  });
  $("#scale").value = String(state.scale);
  if (![...$("#scale").options].some((o) => o.value === String(state.scale))) $("#scale").value = "1";
  $("#units").value = state.units || "auto";
  $("#wx-query").value = state.weather ? state.weather.name : "";
  $("#profile-mode").value = state.profile_mode || "firefox";
  let info = state.browser
    ? "Browser: " + state.browser + ". Each app runs in its own full-screen window."
    : "Firefox was not found. Install it, then restart the launcher.";
  if (state.profile_mode !== "separate") {
    info += state.login_profile
      ? " Logins come from your Firefox profile (" + state.login_profile + "). Close your regular Firefox first."
      : " No Firefox profile was found, so a separate one is used.";
  }
  $("#browser-info").textContent = info;
  renderHotkey();
  $("#dlg-settings").showModal();
}

// ---------- home key ----------
const KEYNAMES = {
  Home: "home", End: "end", Pause: "pause", Insert: "insert", PrintScreen: "print", ContextMenu: "menu", Delete: "delete",
  PageUp: "prior", PageDown: "next", ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  Enter: "return", Space: "space", Tab: "tab", Backspace: "backspace",
};

function keySpec(ev) {
  const c = ev.code;
  if (/^(Control|Shift|Alt|Meta|OS)(Left|Right)$/.test(c)) return null; // modifier alone: keep waiting
  let key = null;
  if (/^Key[A-Z]$/.test(c)) key = c.slice(3).toLowerCase();
  else if (/^Digit\d$/.test(c)) key = c.slice(5);
  else if (/^F([1-9]|1[0-2])$/.test(c)) key = c.toLowerCase();
  else key = KEYNAMES[c] || "";
  const mods = [ev.ctrlKey && "ctrl", ev.altKey && "alt", ev.shiftKey && "shift", ev.metaKey && "super"].filter(Boolean);
  return [...mods, key].join("+");
}

function renderHotkey() {
  const btn = $("#btn-hotkey");
  btn.classList.toggle("rec", recording);
  btn.textContent = recording ? "Press the keys…" : (state.home_hotkey || "Ctrl+X");
  const parts = [];
  if (recording) parts.push("Press the key combination you want. Esc cancels.");
  else if (!state.hotkey_supported) parts.push("Automatic key binding works on Hyprland and sway. On other desktops, bind “m3tv home” to a key in your desktop settings.");
  else if (state.home_hotkey && !state.home_hotkey.includes("+")) parts.push("A key used on its own stops working inside apps while one is open.");
  $("#hotkey-note").textContent = parts.join(" ");
}

function onRecordKey(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.code === "Escape") { stopRecording(); return; }
  const spec = keySpec(ev);
  if (spec === null) return;
  stopRecording();
  saveHotkey(spec);
}

function stopRecording() {
  recording = false;
  document.removeEventListener("keydown", onRecordKey, true);
  renderHotkey();
}

async function saveHotkey(spec) {
  try {
    state = await api("/api/settings", { home_hotkey: spec });
    snack("Home key set to " + state.home_hotkey);
  } catch (err) {
    snack(err.message);
  }
  renderHotkey();
}

function openAdd() {
  $("#form-add").reset();
  newHue = SWATCH_HUES[Math.floor(Math.random() * SWATCH_HUES.length)];
  swatchRow($("#add-swatches"), newHue, (hue) => { newHue = hue; });
  $("#dlg-add").showModal();
  $("#add-name").focus();
}

async function setWeather() {
  const query = $("#wx-query").value.trim();
  try {
    if (!query) {
      state = await api("/api/settings", { weather: null });
      snack("Weather location cleared");
    } else {
      const place = await findPlace(query);
      state = await api("/api/settings", { weather: place });
      $("#wx-query").value = place.name;
      snack("Weather set to " + place.name);
    }
    wx = null;
    loadWeather();
  } catch (err) {
    snack(err.message);
  }
}

// ---------- wiring ----------
$("#btn-settings").append(icon("gear"));
$("#btn-store").append(icon("store"));
$("#search-ico").append(icon("search"));
$("#tab-store").addEventListener("click", () => setTab("store"));
$("#btn-store").addEventListener("click", () => setTab("store"));
$("#btn-search").addEventListener("click", () => { setTab("store"); $("#store-q").focus(); });
$("#store-q").addEventListener("input", () => { storeQ = $("#store-q").value; renderStore(); });
$("#app-main").addEventListener("click", appMain);
$("#app-remove").addEventListener("click", appRemove);
$("#app-close").addEventListener("click", () => $("#dlg-app").close());
$("#dlg-app").addEventListener("close", render);
$("#btn-quit").append(icon("power"));

$("#tab-home").addEventListener("click", () => setTab("home"));
$("#tab-apps").addEventListener("click", () => setTab("apps"));
$("#btn-edit").addEventListener("click", () => { editing = !editing; render(); });
$("#btn-add").addEventListener("click", openAdd);
$("#btn-settings").addEventListener("click", openSettings);
$("#btn-account").addEventListener("click", openAccount);
$("#btn-publish").addEventListener("click", openPublish);
$("#acct-publish").addEventListener("click", () => { $("#dlg-account").close(); openPublish(); });
$("#acct-tab-in").addEventListener("click", () => setAcctMode("in"));
$("#acct-tab-up").addEventListener("click", () => setAcctMode("up"));
$("#form-account").addEventListener("submit", submitAccount);
$("#acct-cancel").addEventListener("click", () => $("#dlg-account").close());
$("#acct-done").addEventListener("click", () => $("#dlg-account").close());
$("#acct-signout").addEventListener("click", () => { saveSession(null); renderAvatar(); $("#dlg-account").close(); snack("Signed out"); });
$("#form-publish").addEventListener("submit", submitPublish);
$("#pub-cancel").addEventListener("click", () => $("#dlg-publish").close());
$("#app-report").addEventListener("click", reportApp);
$("#dlg-account").addEventListener("close", render);
$("#dlg-publish").addEventListener("close", render);
$("#weather").addEventListener("click", openSettings);
$("#btn-quit").addEventListener("click", async () => {
  try { await api("/api/quit", {}); } catch (_) { /* window is closing */ }
});
$("#hero-home").addEventListener("click", goHome);

$("#btn-settings-close").addEventListener("click", () => { $("#dlg-settings").close(); });
$("#dlg-settings").addEventListener("close", () => { if (recording) stopRecording(); render(); });
$("#btn-hotkey").addEventListener("click", () => {
  if (recording) { stopRecording(); return; }
  recording = true;
  document.addEventListener("keydown", onRecordKey, true);
  renderHotkey();
});
$("#btn-hotkey-reset").addEventListener("click", () => { if (recording) stopRecording(); saveHotkey("ctrl+x"); });
$("#btn-wx-find").addEventListener("click", setWeather);
$("#wx-query").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); setWeather(); } });
$("#units").addEventListener("change", async () => {
  try { state = await api("/api/settings", { units: $("#units").value }); loadWeather(); } catch (err) { snack(err.message); }
});
$("#scale").addEventListener("change", async () => {
  try { await api("/api/settings", { scale: parseFloat($("#scale").value) }); snack("Scale saved. Restart the launcher to apply it."); }
  catch (err) { snack(err.message); }
});
$("#profile-mode").addEventListener("change", async () => {
  try { state = await api("/api/settings", { profile_mode: $("#profile-mode").value }); }
  catch (err) { snack(err.message); }
});
$("#btn-reset").addEventListener("click", async () => {
  try { state = await api("/api/services/reset", {}); $("#dlg-settings").close(); snack("Apps removed"); } catch (err) { snack(err.message); }
});

$("#btn-add-cancel").addEventListener("click", () => $("#dlg-add").close());
$("#form-add").addEventListener("submit", async () => {
  const entry = { name: $("#add-name").value.trim(), url: $("#add-url").value.trim(), hue: newHue, profile: $("#add-tv").checked ? "tv" : "web", subtitle: "Website" };
  try { state = await api("/api/services/add", entry); snack(entry.name + " added"); render(); } catch (err) { snack(err.message); }
});

window.addEventListener("online", renderNet);
window.addEventListener("offline", renderNet);

// Arrow-key / D-pad navigation: jump to the nearest focusable item in that direction.
document.addEventListener("keydown", (ev) => {
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
  if (!dir || openDialogs()) return;
  const items = [...document.querySelectorAll(".circle, .card, .tile, .banner, .pill, .dot, .search-pill, #store-q, .tab, .icon-btn, .avatar, .btn, #weather, .del")].filter((n) => n.offsetParent !== null);
  const cur = document.activeElement;
  if (!items.includes(cur)) {
    const first = document.querySelector("#hero-open:not([hidden])") || document.querySelector(".circle") || items[0];
    if (first) { first.focus(); ev.preventDefault(); }
    return;
  }
  const c = cur.getBoundingClientRect();
  const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
  let best = null, bestScore = Infinity;
  items.forEach((n) => {
    if (n === cur) return;
    const r = n.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 4) return;
    const across = Math.abs(dir[0] ? dy : dx);
    if (dir[0] && across > c.height * 0.6) return;
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = n; }
  });
  if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); ev.preventDefault(); }
});

tickClock();
setInterval(tickClock, 15000);
refresh().then(() => { render(); loadCatalog(); loadCommunity(); });
setInterval(() => { if (tab !== "apps" && !catalogApps.every((a) => a.logo)) loadCatalog(); }, 3000);
setInterval(() => {
  if (tab === "home" && !previewId && !state.running && !openDialogs() && heroItems().length > 1) { heroIdx++; renderHero(true); }
}, 9000);
setInterval(refresh, 2000);
setInterval(loadWeather, 15 * 60 * 1000);
