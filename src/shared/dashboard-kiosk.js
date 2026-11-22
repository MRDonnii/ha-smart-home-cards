// Dashboard kiosk mode (opt-in): hides Home Assistant's top bar and docked sidebar on ONE dashboard. Other dashboards
// and panels are unchanged. It is OFF unless the dashboard on screen contains the invisible card
// `custom:ha-dashboard-kiosk-card` (anywhere, in any view); the card's config holds the options:
//   - hide_header: the top bar is hidden (always shown in edit mode).
//   - hide_sidebar: the sidebar is set to "always hidden" (it opens as a drawer) and restored when you leave. HA keeps
//     that setting per browser (localStorage `dockedSidebar`), so the setting to restore is kept there too
//     (PREV_DOCK_KEY): a tab closed on the kiosk dashboard gets the sidebar back in the next tab that shows another
//     dashboard, or leaves the kiosk dashboard.
//   - header_toggle: a tap on a header card's menu button (☰) opens the sidebar as before; a long press (hold_ms)
//     shows/hides the top bar. The choice is remembered per device/browser (localStorage `storage_key`).
// Was a /local resource bound to one dashboard path (v2).
import { onDashboardTick, findCardConfig } from "./dashboard-activation.js";

export const KIOSK_VERSION = "2";
export const KIOSK_TYPE = "custom:ha-dashboard-kiosk-card";
const STYLE_ID = "ha-dashboard-kiosk-style";
const PREV_DOCK_KEY = "ha-dashboard-kiosk-prev-dock";

export const KIOSK_DEFAULTS = Object.freeze({
  hide_header: true,
  hide_sidebar: true,
  header_toggle: true,
  header_cards: ["ha-home-header-card-front", "ha-home-header-card"],
  menu_selector: "button.menu:not(.quick)",
  hold_ms: 600,
  storage_key: "ha-dashboard-kiosk-topbar",
});

/** The effective options of an activator card config, or null when there is none. */
export function kioskOptions(cardConfig) {
  if (!cardConfig) return null;
  const o = { ...KIOSK_DEFAULTS };
  for (const key of ["hide_header", "hide_sidebar", "header_toggle"]) if (typeof cardConfig[key] === "boolean") o[key] = cardConfig[key];
  if (Array.isArray(cardConfig.header_cards)) o.header_cards = cardConfig.header_cards.map(String).filter(Boolean);
  else if (typeof cardConfig.header_cards === "string" && cardConfig.header_cards) o.header_cards = [cardConfig.header_cards];
  if (typeof cardConfig.menu_selector === "string" && cardConfig.menu_selector.trim()) o.menu_selector = cardConfig.menu_selector.trim();
  const hold = Number(cardConfig.hold_ms);
  if (Number.isFinite(hold) && hold >= 200 && hold <= 5000) o.hold_ms = hold;
  if (typeof cardConfig.storage_key === "string" && cardConfig.storage_key.trim()) o.storage_key = cardConfig.storage_key.trim();
  return o;
}

const store = {
  get: (s, k) => { try { return s.getItem(k); } catch { return null; } },
  set: (s, k, v) => { try { if (v == null) s.removeItem(k); else s.setItem(k, v); } catch { /* private mode */ } },
};
const ha = () => document.querySelector("home-assistant");
const topbarWanted = (o) => store.get(localStorage, o.storage_key) === "shown";

function applyTopbar(screen, o) {
  const root = screen?.root;
  const sr = root?.shadowRoot;
  if (!sr) return;
  const hide = !!o?.hide_header && !topbarWanted(o) && !screen.editMode;
  const existing = sr.getElementById(STYLE_ID);
  if (hide && !existing) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    // No extra padding-top: header cards add the iPhone safe area themselves, otherwise it would count twice.
    s.textContent = ".header{display:none!important}hui-view-container{padding-top:0!important}";
    sr.appendChild(s);
    window.dispatchEvent(new Event("resize"));
  } else if (!hide && existing) {
    existing.remove();
    window.dispatchEvent(new Event("resize"));
  }
}

function setDock(dock) {
  ha()?.dispatchEvent(new CustomEvent("hass-dock-sidebar", { detail: { dock }, bubbles: true, composed: true }));
}

const DOCKS = ["docked", "auto", "always_hidden"];
/** The saved restore marker { dock, path } (path = url of the kiosk dashboard), or null. */
function readMarker() {
  const raw = store.get(localStorage, PREV_DOCK_KEY);
  if (!raw) return null;
  let value = raw;
  try { value = JSON.parse(raw); } catch { /* plain string */ }
  const marker = typeof value === "string" ? { dock: value, path: "" } : { dock: value?.dock, path: typeof value?.path === "string" ? value.path : "" };
  if (!DOCKS.includes(marker.dock) || marker.dock === "always_hidden") {
    store.set(localStorage, PREV_DOCK_KEY, null);
    return null;
  }
  return marker;
}
const writeMarker = (marker) => store.set(localStorage, PREV_DOCK_KEY, marker ? JSON.stringify(marker) : null);
/** HA's own saved sidebar setting (what a new tab starts with). */
function savedDock() {
  try { return JSON.parse(localStorage.getItem("dockedSidebar")); } catch { return undefined; }
}

/** Kiosk with hide_sidebar on screen: remember the user's setting (once) and hide the sidebar. */
function hideSidebar(screen) {
  const dock = ha()?.hass?.dockedSidebar;
  if (!dock) return;
  const path = screen?.urlPath || "";
  if (dock !== "always_hidden") {
    writeMarker({ dock, path });
    setDock("always_hidden");
    return;
  }
  // Already hidden (by this module in this or an earlier tab, or by the user): keep a marker, follow the dashboard.
  const marker = readMarker();
  if (marker && marker.path !== path) writeMarker({ ...marker, path });
}

/**
 * Any other screen: give the sidebar back if this module hid it. Returns true while a marker is kept.
 * While nothing is resolved (a reload or a switch in progress) and the URL is still the kiosk dashboard's, it waits,
 * so a reload of the kiosk dashboard does not flash the sidebar.
 */
function releaseSidebar(screen) {
  const marker = readMarker();
  if (!marker) return false;
  if (!screen?.config) {
    const first = String(globalThis.location?.pathname || "").split("/")[1] || "";
    if (!first || first === marker.path) return true;
  }
  const dock = ha()?.hass?.dockedSidebar;
  if (!dock) return true;
  if (dock === "always_hidden") {
    writeMarker(null);
    setDock(marker.dock);
    return false;
  }
  // Not hidden in this tab. Keep the marker while HA's saved setting is still hidden (another tab shows the kiosk
  // dashboard, or one was closed on it), so the next tab can restore it; otherwise it is stale.
  if (savedDock() === "always_hidden") return true;
  writeMarker(null);
  return false;
}

const bound = new WeakSet();
let current = null; // options while active, for the bound buttons
let lastScreenRoot = null;

function toggleTopbar() {
  if (!current) return;
  store.set(localStorage, current.storage_key, topbarWanted(current) ? null : "shown");
  navigator.vibrate?.(25);
  applyTopbar(lastScreen, current);
}

function bindMenu(card, o) {
  const sr = card.shadowRoot;
  const btn = sr?.querySelector(o.menu_selector);
  if (!btn || bound.has(btn)) return !!btn;
  bound.add(btn);
  btn.title = "Tryk: åbn menu · Hold: vis/skjul topbjælke";
  if (!sr.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `${o.menu_selector}{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation}`;
    sr.appendChild(s);
  }
  let timer = null;
  let held = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  btn.addEventListener("pointerdown", (ev) => {
    if (ev.button > 0 || !current?.header_toggle) return;
    held = false;
    cancel();
    timer = setTimeout(() => { held = true; timer = null; toggleTopbar(); }, current.hold_ms);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((t) => btn.addEventListener(t, cancel));
  btn.addEventListener("contextmenu", (ev) => { if (current?.header_toggle) ev.preventDefault(); });
  // Capture on the button itself runs before the card's own click: a long press must not also open the sidebar.
  btn.addEventListener("click", (ev) => {
    if (!held) return;
    held = false;
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }, true);
  return true;
}

let lastCard = null;
function findHeaderCards(root, names, out = []) {
  root.querySelectorAll("*").forEach((el) => {
    if (names.includes(el.localName)) out.push(el);
    if (el.shadowRoot) findHeaderCards(el.shadowRoot, names, out);
  });
  return out;
}
function bindHeaders(screen, o) {
  if (!o.header_toggle) return;
  if (lastCard?.isConnected && lastCard.getBoundingClientRect().height > 0
      && bound.has(lastCard.shadowRoot?.querySelector(o.menu_selector))) return;
  const view = screen?.root?.shadowRoot?.querySelector("hui-view-container");
  if (!view) return;
  for (const card of findHeaderCards(view, o.header_cards)) {
    if (bindMenu(card, o) && card.getBoundingClientRect().height > 0) lastCard = card;
  }
}

let lastScreen = null;
/** One detector tick; returns true while kiosk mode is on or the sidebar is still to be given back. */
function tick(screen) {
  const o = kioskOptions(screen?.config ? findCardConfig(screen.config, KIOSK_TYPE) : null);
  // Leaving a kiosk dashboard: take the style off its (cached) hui-root and give the sidebar back.
  if (lastScreenRoot && lastScreenRoot !== screen?.root) lastScreenRoot.shadowRoot?.getElementById(STYLE_ID)?.remove();
  lastScreenRoot = screen?.root || null;
  lastScreen = screen;
  current = o;
  if (!o) {
    screen?.root?.shadowRoot?.getElementById(STYLE_ID)?.remove();
    return releaseSidebar(screen);
  }
  if (o.hide_sidebar) hideSidebar(screen);
  else releaseSidebar(screen);
  applyTopbar(screen, o);
  bindHeaders(screen, o);
  return true;
}

let started = false;
export function startKioskModule() {
  if (started) return;
  started = true;
  onDashboardTick(tick);
}
