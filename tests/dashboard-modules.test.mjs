// The opt-in dashboard modules (th-theme-card, ha-dashboard-kiosk-card): nothing happens without the activator card in
// the dashboard config; with it the styles/sidebar apply on every view of that dashboard and are undone on leaving.
import assert from "node:assert/strict";
import { installFakeDom } from "./helpers/fake-dom.mjs";

const dom = installFakeDom();

// A minimal shadow root that keeps real children, enough for getElementById/querySelectorAll("*").
class MiniRoot {
  constructor() { this.children = []; }
  appendChild(node) { node.remove = () => { this.children = this.children.filter((n) => n !== node); }; this.children.push(node); return node; }
  getElementById(id) { return this.children.find((n) => n.id === id) || null; }
  querySelector(sel) { return sel.startsWith("#") ? this.getElementById(sel.slice(1)) : this.children.find((n) => n.localName === sel) || null; }
  querySelectorAll(sel) { return sel === "*" ? [...this.children] : this.children.filter((n) => n.localName === sel); }
}
const node = (localName, extra = {}) => ({ localName, shadowRoot: new MiniRoot(), ...extra });

// home-assistant > home-assistant-main > ha-panel-lovelace > hui-root, as in the frontend.
const navbar = node("ha-navbar-card");
const viewContainer = node("hui-view-container");
viewContainer.querySelectorAll = (sel) => (sel === "*" ? [navbar] : []);
const huiRoot = node("hui-root", { lovelace: { config: null, editMode: false } });
huiRoot.shadowRoot.appendChild(viewContainer);
huiRoot.shadowRoot.children.push(navbar);
const panel = { localName: "ha-panel-lovelace", panel: { url_path: "dashboard-example" }, shadowRoot: { querySelector: (s) => (s === "hui-root" ? huiRoot : null) } };
const main = { shadowRoot: { querySelector: (s) => (s === "partial-panel-resolver ha-panel-lovelace" ? panel : null) } };
const dockEvents = [];
const haEl = { shadowRoot: { querySelector: (s) => (s === "home-assistant-main" ? main : null) }, hass: { dockedSidebar: "docked" },
  dispatchEvent(ev) { dockEvents.push(ev.detail.dock); this.hass.dockedSidebar = ev.detail.dock; } };
document.querySelector = (s) => (s === "home-assistant" ? haEl : null);
location.pathname = "/dashboard-example/0";

const activation = await import("../src/shared/dashboard-activation.js");
const kiosk = await import("../src/shared/dashboard-kiosk.js");
const theme = await import("../src/shared/th-theme.js");
await import("../src/cards/th-theme-card/th-theme-card.js");
await import("../src/cards/ha-dashboard-kiosk-card/ha-dashboard-kiosk-card.js");

// Pure helpers.
const cfg = { views: [{ cards: [{ type: "vertical-stack", cards: [{ type: "tile" }] }] }, { cards: [{ type: "grid", cards: [{ type: "custom:th-theme-card", cards: false }] }] }] };
assert.deepEqual(activation.findCardConfig(cfg, "custom:th-theme-card"), { type: "custom:th-theme-card", cards: false });
assert.equal(activation.findCardConfig(cfg, "custom:ha-dashboard-kiosk-card"), null);
assert.deepEqual(theme.themeOptions({ cards: false }), { navbar: true, cards: false });
assert.equal(theme.themeOptions(null), null);
assert.equal(kiosk.kioskOptions(null), null);
const ko = kiosk.kioskOptions({ hide_sidebar: false, hold_ms: 900, header_cards: "my-header-card", storage_key: "my-key" });
assert.equal(ko.hide_header, true);
assert.equal(ko.hide_sidebar, false);
assert.equal(ko.hold_ms, 900);
assert.deepEqual(ko.header_cards, ["my-header-card"]);
assert.equal(ko.storage_key, "my-key");
assert.equal(kiosk.kioskOptions({ hold_ms: 5 }).hold_ms, 600, "silly hold time falls back to the default");
assert.ok(activation.lovelaceOnScreen(), "dashboard found");
location.pathname = "/other/0";
assert.equal(activation.lovelaceOnScreen(), null, "a dashboard switch in progress is ignored");
location.pathname = "/dashboard-example/0";

const tick = async () => {
  for (const [type, fn] of dom.listeners) if (type === "location-changed") fn();
  await new Promise((r) => setTimeout(r, 80));
};
const ids = (root) => root.children.map((n) => n.id).filter(Boolean);

// 1) No activator in the config: nothing changes.
huiRoot.lovelace.config = { views: [{ cards: [{ type: "tile" }] }] };
await tick();
assert.deepEqual(ids(huiRoot.shadowRoot), []);
assert.deepEqual(ids(navbar.shadowRoot), []);
assert.deepEqual(dockEvents, []);

// 2) Activators present (in another view than the one on screen): theme + kiosk apply.
huiRoot.lovelace.config = { views: [{ cards: [{ type: "tile" }] }, { type: "panel", cards: [{ type: "tile" }, { type: "custom:th-theme-card" }, { type: "custom:ha-dashboard-kiosk-card" }] }] };
await tick();
assert.ok(ids(huiRoot.shadowRoot).includes("th-theme-view"), "card surface style");
assert.ok(ids(huiRoot.shadowRoot).includes("ha-dashboard-kiosk-style"), "top bar hidden");
assert.ok(ids(navbar.shadowRoot).includes("th-theme-navbar"), "navbar style");
assert.deepEqual(dockEvents, ["always_hidden"]);

// Edit mode always shows the top bar.
huiRoot.lovelace.editMode = true;
await tick();
assert.ok(!ids(huiRoot.shadowRoot).includes("ha-dashboard-kiosk-style"));
huiRoot.lovelace.editMode = false;
await tick();
assert.ok(ids(huiRoot.shadowRoot).includes("ha-dashboard-kiosk-style"));

// The per-device choice (long press) keeps the top bar.
localStorage.setItem("ha-dashboard-kiosk-topbar", "shown");
await tick();
assert.ok(!ids(huiRoot.shadowRoot).includes("ha-dashboard-kiosk-style"));
localStorage.removeItem("ha-dashboard-kiosk-topbar");

// 3) Theme only for cards; activator removed again: everything is undone and the sidebar comes back.
huiRoot.lovelace.config = { views: [{ cards: [{ type: "custom:th-theme-card", navbar: false }] }] };
await tick();
assert.ok(ids(huiRoot.shadowRoot).includes("th-theme-view"));
assert.ok(!ids(navbar.shadowRoot).includes("th-theme-navbar"));
assert.ok(!ids(huiRoot.shadowRoot).includes("ha-dashboard-kiosk-style"));
assert.deepEqual(dockEvents, ["always_hidden", "docked"]);
huiRoot.lovelace.config = { views: [] };
await tick();
assert.deepEqual(ids(huiRoot.shadowRoot), []);

// The activator cards render nothing outside edit mode and a note while editing.
for (const tag of ["th-theme-card", "ha-dashboard-kiosk-card"]) {
  const Card = customElements.get(tag);
  assert.ok(Card && window.customCards.some((c) => c.type === tag), `${tag} registered`);
  const card = new Card();
  card.setConfig(Card.getStubConfig());
  assert.equal(card.style.display, "none");
  assert.equal(card.getCardSize(), 0);
  card.editMode = true;
  assert.match(card.shadowRoot.innerHTML, /dette dashboard/);
}

console.log("dashboard module tests passed");
process.exit(0);
