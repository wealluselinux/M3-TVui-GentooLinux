"use strict";

// Standard Material icon paths (24x24, Apache-2.0).
const ICONS = {
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 14v2h8v-2h-8zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
  power: "M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z",
  del: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
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

const $ = (sel) => document.querySelector(sel);
let state = {
  services: [], logos: {}, hue: 285, scale: 1, running: null, browser: null,
  network: null, weather: null, units: "auto", hotkey: null,
};
let editing = false;
let newHue = 285;
let wx = null; // { temp, kind }

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

// ---------- header: greeting, clock, network, weather ----------
function tickClock() {
  const now = new Date();
  $("#clock").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  $("#date").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const h = now.getHours();
  $("#greeting").textContent = h < 5 ? "Late night viewing" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
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

// ---------- grid ----------
function makeTile(svc) {
  const tile = el("div", "tile");
  tile.tabIndex = 0;
  tile.setAttribute("role", "listitem");
  tile.style.setProperty("--th", svc.hue);
  tile.dataset.id = svc.id;

  const logo = el("div", "logo");
  const version = state.logos && state.logos[svc.id];
  const monogram = (svc.name[0] || "?").toUpperCase();
  if (version) {
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.addEventListener("error", () => { img.remove(); logo.classList.add("fallback"); logo.textContent = monogram; });
    img.src = "/api/logo/" + svc.id + "?v=" + version;
    logo.appendChild(img);
  } else {
    logo.classList.add("fallback");
    logo.textContent = monogram;
  }
  tile.appendChild(logo);

  const text = el("div");
  text.appendChild(el("h3", null, svc.name));
  if (svc.subtitle) text.appendChild(el("p", null, svc.subtitle));
  tile.appendChild(text);

  if (state.running === svc.id && !editing) tile.appendChild(el("span", "badge", "Open"));

  if (editing) {
    const del = el("button", "del");
    del.setAttribute("aria-label", "Remove " + svc.name);
    del.appendChild(icon("del"));
    del.addEventListener("click", (ev) => { ev.stopPropagation(); removeService(svc.id); });
    tile.appendChild(del);
  } else {
    const open = () => launch(svc);
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); }
    });
  }
  return tile;
}

function render() {
  document.documentElement.style.setProperty("--h", state.hue);
  $("#grid").replaceChildren(...state.services.map(makeTile));
  document.body.classList.toggle("editing", editing);
  $("#btn-edit").classList.toggle("on", editing);
  $("#section-title").textContent = editing ? "Tap the bin to remove an app" : "Apps";
  const running = state.services.find((s) => s.id === state.running);
  $("#now").hidden = !running;
  if (running) {
    $("#now-name").textContent = running.name;
    $("#now-hint").textContent = state.hotkey
      ? "Press " + state.hotkey + " to come back here."
      : "Run “m3tv home” (bind it to a key) to come back here.";
  }
  renderNet();
  renderWeather();
}

const gridKey = (s) => JSON.stringify([s.services, s.running, s.hue, s.logos, s.hotkey]);
const weatherKey = (s) => JSON.stringify([s.weather, s.units]);

async function refresh() {
  try {
    const next = await api("/api/state");
    const prev = state;
    state = next;
    if (gridKey(prev) !== gridKey(next) && !document.querySelector("dialog[open]")) render();
    renderNet();
    if (weatherKey(prev) !== weatherKey(next)) loadWeather();
  } catch (_) { /* server restarting; try again on the next tick */ }
}

// ---------- actions ----------
async function launch(svc) {
  snack("Opening " + svc.name + "…");
  try {
    await api("/api/launch", { id: svc.id });
    state.running = svc.id;
    render();
  } catch (err) {
    snack(err.message);
  }
}

async function saveServices(list) {
  state = await api("/api/services", { services: list });
  render();
}

async function removeService(id) {
  if (state.services.length <= 1) { snack("Keep at least one app"); return; }
  try { await saveServices(state.services.filter((s) => s.id !== id)); } catch (err) { snack(err.message); }
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
  $("#dlg-settings").showModal();
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
$("#btn-edit").append(icon("edit"));
$("#btn-add").append(icon("add"));
$("#btn-settings").append(icon("tune"));
$("#btn-quit").append(icon("power"));

$("#btn-edit").addEventListener("click", () => { editing = !editing; render(); });
$("#btn-add").addEventListener("click", openAdd);
$("#btn-settings").addEventListener("click", openSettings);
$("#weather").addEventListener("click", openSettings);
$("#btn-quit").addEventListener("click", async () => {
  try { await api("/api/quit", {}); } catch (_) { /* window is closing */ }
});
$("#btn-home").addEventListener("click", async () => {
  try { await api("/api/home", {}); state.running = null; render(); } catch (err) { snack(err.message); }
});

$("#btn-settings-close").addEventListener("click", () => { $("#dlg-settings").close(); });
$("#dlg-settings").addEventListener("close", render);
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
  try { state = await api("/api/services/reset", {}); $("#dlg-settings").close(); snack("Apps reset"); } catch (err) { snack(err.message); }
});

$("#btn-add-cancel").addEventListener("click", () => $("#dlg-add").close());
$("#form-add").addEventListener("submit", async () => {
  const entry = {
    name: $("#add-name").value.trim(),
    url: $("#add-url").value.trim(),
    hue: newHue,
    profile: $("#add-tv").checked ? "tv" : "web",
    subtitle: "Custom app",
  };
  try {
    await saveServices([...state.services, entry]);
    snack(entry.name + " added");
  } catch (err) {
    snack(err.message);
  }
});

window.addEventListener("online", renderNet);
window.addEventListener("offline", renderNet);

// Arrow-key / D-pad navigation: jump to the nearest focusable item in that direction.
document.addEventListener("keydown", (ev) => {
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
  if (!dir || document.querySelector("dialog[open]")) return;
  const items = [...document.querySelectorAll(".tile, .icon-btn, .btn, .chip#weather")].filter((n) => n.offsetParent !== null);
  const current = document.activeElement;
  if (!items.includes(current)) { if (items[0]) { items[0].focus(); ev.preventDefault(); } return; }
  const c = current.getBoundingClientRect();
  const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
  let best = null, bestScore = Infinity;
  items.forEach((n) => {
    if (n === current) return;
    const r = n.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 4) return;
    const across = Math.abs(dir[0] ? dy : dx);
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = n; }
  });
  if (best) { best.focus(); best.scrollIntoView({ block: "nearest" }); ev.preventDefault(); }
});

tickClock();
setInterval(tickClock, 15000);
refresh();
setInterval(refresh, 2000);
setInterval(loadWeather, 15 * 60 * 1000);
