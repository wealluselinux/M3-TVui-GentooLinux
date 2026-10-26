"use strict";

// Standard Material icon paths (24x24, Apache-2.0).
const ICONS = {
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 14v2h8v-2h-8zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
  power: "M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z",
  del: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
};

const SWATCH_HUES = [285, 255, 215, 185, 150, 95, 55, 25, 350, 320];

const $ = (sel) => document.querySelector(sel);
let state = { services: [], hue: 285, scale: 1, running: null, browser: null };
let editing = false;
let newHue = 285;

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

// ---------- header ----------
function tickClock() {
  const now = new Date();
  $("#clock").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  $("#date").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const h = now.getHours();
  $("#greeting").textContent = h < 5 ? "Late night viewing" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// ---------- grid ----------
function makeTile(svc) {
  const tile = el("div", "tile");
  tile.tabIndex = 0;
  tile.setAttribute("role", "listitem");
  tile.style.setProperty("--th", svc.hue);
  tile.dataset.id = svc.id;
  tile.appendChild(el("div", "mono", (svc.name[0] || "?").toUpperCase()));

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
  if (running) $("#now-name").textContent = running.name;
}

async function refresh() {
  try {
    const next = await api("/api/state");
    const changed = JSON.stringify(next) !== JSON.stringify(state);
    state = next;
    if (changed && !document.querySelector("dialog[open]")) render();
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
function openSettings() {
  swatchRow($("#swatches"), nearestSwatch(state.hue), async (hue) => {
    state.hue = hue;
    document.documentElement.style.setProperty("--h", hue);
    try { await api("/api/settings", { hue }); } catch (err) { snack(err.message); }
  });
  $("#scale").value = String(state.scale);
  if (![...$("#scale").options].some((o) => o.value === String(state.scale))) $("#scale").value = "1";
  $("#browser-info").textContent = state.browser
    ? "Browser: " + state.browser + ". Each app runs in its own full-screen window."
    : "Firefox was not found. Install it, then restart the launcher.";
  $("#dlg-settings").showModal();
}

function nearestSwatch(hue) {
  return SWATCH_HUES.reduce((a, b) => (Math.abs(b - hue) < Math.abs(a - hue) ? b : a));
}

function openAdd() {
  $("#form-add").reset();
  newHue = SWATCH_HUES[Math.floor(Math.random() * SWATCH_HUES.length)];
  swatchRow($("#add-swatches"), newHue, (hue) => { newHue = hue; });
  $("#dlg-add").showModal();
  $("#add-name").focus();
}

// ---------- wiring ----------
$("#btn-edit").append(icon("edit"));
$("#btn-add").append(icon("add"));
$("#btn-settings").append(icon("tune"));
$("#btn-quit").append(icon("power"));

$("#btn-edit").addEventListener("click", () => { editing = !editing; render(); });
$("#btn-add").addEventListener("click", openAdd);
$("#btn-settings").addEventListener("click", openSettings);
$("#btn-quit").addEventListener("click", async () => {
  try { await api("/api/quit", {}); } catch (_) { /* window is closing */ }
});
$("#btn-home").addEventListener("click", async () => {
  try { await api("/api/home", {}); state.running = null; render(); } catch (err) { snack(err.message); }
});

$("#btn-settings-close").addEventListener("click", () => { $("#dlg-settings").close(); render(); });
$("#dlg-settings").addEventListener("close", render);
$("#scale").addEventListener("change", async () => {
  try { await api("/api/settings", { scale: parseFloat($("#scale").value) }); snack("Scale saved. Restart the launcher to apply it."); }
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

// Arrow-key / D-pad navigation: jump to the nearest focusable item in that direction.
document.addEventListener("keydown", (ev) => {
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
  if (!dir || document.querySelector("dialog[open]")) return;
  const items = [...document.querySelectorAll(".tile, .icon-btn, .btn")].filter((n) => n.offsetParent !== null);
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
