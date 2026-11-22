// Opt-in dashboard modules (the TH theme, the kiosk mode) are switched on by an invisible card in a dashboard's config.
// This helper finds the Lovelace dashboard on screen and the first card of a given type anywhere in its config (any
// view, inside stacks, layouts and popups), so a module applies to every view of that dashboard although the card sits
// in one view only. Nothing on the page is changed here; a module that finds no activator card does nothing.

const found = new WeakMap(); // dashboard config object -> Map(type -> card config | null)

/** The Lovelace dashboard on screen: { panel, root, urlPath, config, editMode }, or null (another panel, or a switch in progress). */
export function lovelaceOnScreen(doc = globalThis.document, loc = globalThis.location) {
  const main = doc?.querySelector?.("home-assistant")?.shadowRoot?.querySelector("home-assistant-main");
  const panel = main?.shadowRoot?.querySelector("partial-panel-resolver ha-panel-lovelace");
  const root = panel?.shadowRoot?.querySelector("hui-root");
  if (!panel || !root) return null;
  const urlPath = String(panel.panel?.url_path || panel.route?.prefix || "").replace(/^\//, "");
  const first = String(loc?.pathname || "").split("/")[1] || "";
  if (urlPath && first !== urlPath) return null;
  const lovelace = root.lovelace || panel.lovelace;
  return { panel, root, urlPath, config: lovelace?.config || null, editMode: !!lovelace?.editMode };
}

/** The first card config with `type` (e.g. "custom:th-theme-card") anywhere in a dashboard config, or null. */
export function findCardConfig(config, type) {
  if (!config || typeof config !== "object") return null;
  let byType = found.get(config);
  if (!byType) { byType = new Map(); found.set(config, byType); }
  if (byType.has(type)) return byType.get(type);
  let hit = null;
  const seen = new Set();
  const visit = (node, depth) => {
    if (hit || !node || typeof node !== "object" || depth > 40 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return; }
    if (node.type === type) { hit = node; return; }
    for (const value of Object.values(node)) if (value && typeof value === "object") visit(value, depth + 1);
  };
  visit(config, 0);
  byType.set(type, hit);
  return hit;
}

/**
 * Runs `tick(screen)` for each subscriber right after navigation and every `interval` ms while the page is visible.
 * `screen` is lovelaceOnScreen() or null. A tick returns true while its module is active (an activator was found or
 * something is still to be undone); while no module is active, the periodic tick only compares the screen (root,
 * config, edit mode, URL) and calls the subscribers when it changed. Right after start and navigation, a dashboard that
 * is still loading is looked at again every SETTLE_STEP ms for SETTLE_MS, so a kiosk top bar goes away quickly.
 * The loop starts with the first subscriber.
 */
const subscribers = new Set();
const SETTLE_MS = 4000;
const SETTLE_STEP = 150;
let timer = null;
let lastSignature = null;
let active = true;
let settleUntil = 0;
let settleTimer = null;

function signature(screen) {
  return [screen?.root || null, screen?.config || null, !!screen?.editMode, String(globalThis.location?.pathname || "")];
}

/** False only when HA knows the panel of the URL and it is not a Lovelace dashboard (no point in looking again soon). */
function mayBeLovelace() {
  const first = String(globalThis.location?.pathname || "").split("/")[1] || "";
  const panel = first ? globalThis.document?.querySelector?.("home-assistant")?.hass?.panels?.[first] : null;
  return !panel || panel.component_name === "lovelace";
}

function runAll() {
  if (globalThis.document?.hidden) return;
  const screen = lovelaceOnScreen();
  const sig = signature(screen);
  const same = !!lastSignature && sig.every((value, i) => value === lastSignature[i]);
  lastSignature = sig;
  if (!same || active) {
    active = false;
    for (const fn of subscribers) {
      try { if (fn(screen)) active = true; } catch (err) { active = true; console.warn("dashboard module", err); }
    }
  }
  if (!screen?.config && !settleTimer && Date.now() < settleUntil && mayBeLovelace()) {
    settleTimer = setTimeout(() => { settleTimer = null; runAll(); }, SETTLE_STEP);
  }
}

function settle() {
  settleUntil = Date.now() + SETTLE_MS;
  setTimeout(runAll, 50);
}

export function onDashboardTick(fn, { interval = 1500 } = {}) {
  subscribers.add(fn);
  lastSignature = null; // the new subscriber gets the current screen on the next run
  if (!timer && typeof globalThis.setInterval === "function" && globalThis.addEventListener) {
    timer = setInterval(runAll, interval);
    globalThis.addEventListener("location-changed", settle);
    globalThis.addEventListener("popstate", settle);
    globalThis.document?.addEventListener?.("visibilitychange", () => setTimeout(runAll, 50));
    settleUntil = Date.now() + SETTLE_MS;
  }
  if (timer) setTimeout(runAll, 0);
  return () => subscribers.delete(fn);
}

/** Shared look of the activator cards: nothing outside edit mode, a small dashed note while editing. */
export function activatorHtml(title, lines) {
  const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<style>:host{display:block}.note{border:1px dashed var(--divider-color,#888);border-radius:12px;padding:10px 12px;font:13px/1.45 var(--ha-font-family-body,system-ui,sans-serif);color:var(--secondary-text-color,#999)}.note b{color:var(--primary-text-color,#ddd)}</style>
<div class="note"><b>${esc(title)}</b>${lines.map((l) => `<br>${esc(l)}`).join("")}</div>`;
}

/**
 * Base class for the invisible activator cards. It hides itself (and its hui-card wrapper, so stacks keep no gap)
 * outside edit mode and shows a short note while the dashboard is being edited.
 */
export function activatorCardClass({ title, lines, stub }) {
  return class extends HTMLElement {
    static getStubConfig() { return { ...stub }; }
    setConfig(config) { this._config = { ...(config || {}) }; this._render(); }
    set hass(hass) { this._hass = hass; this._render(); }
    set editMode(value) { this._editMode = !!value; this._render(); }
    set preview(value) { this._preview = !!value; this._render(); }
    connectedCallback() { this._render(); }
    disconnectedCallback() { this._showWrapper(true); }
    getCardSize() { return 0; }
    getGridOptions() { return { columns: 12, rows: "auto" }; }
    _editing() { return !!(this._editMode || this._preview || lovelaceOnScreen()?.editMode); }
    _showWrapper(show) {
      const wrapper = this.parentElement;
      if (wrapper?.localName === "hui-card") wrapper.style.display = show ? "" : "none";
    }
    _render() {
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      const editing = this._editing();
      if (this._shown === editing && this.shadowRoot.innerHTML) return;
      this._shown = editing;
      this.style.display = editing ? "" : "none";
      this._showWrapper(editing);
      this.shadowRoot.innerHTML = editing ? activatorHtml(title, lines) : "<style>:host{display:none}</style>";
    }
  };
}
