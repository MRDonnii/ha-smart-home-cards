// scroll-stack-card: config validation, mounting child cards once hass is there, and the per-card CSS injection.
import assert from "node:assert/strict";
import { installFakeDom, mockHass, FakeRoot } from "./helpers/fake-dom.mjs";

const dom = installFakeDom();
const created = [];
window.loadCardHelpers = async () => ({
  createCardElement(config) {
    const el = document.createElement(config.type.startsWith("custom:") ? config.type.slice(7) : `hui-${config.type}-card`);
    el.attachShadow({ mode: "open" });
    el.cardConfig = config;
    el.replaceWith = () => {};
    created.push(el);
    return el;
  },
});
await import("../src/cards/scroll-stack-card/scroll-stack-card.js");

const Card = customElements.get("scroll-stack-card");
assert.ok(Card, "registered");
assert.ok(window.customCards.some((c) => c.type === "scroll-stack-card"));
assert.throws(() => new Card().setConfig({}), /kræver cards/);

const card = new Card();
card.setConfig({ cards: [{ type: "custom:example-card" }, { type: "tile", entity: "light.example" }], gap: "8px", scroll: false, mobile_padding: "0 10px", css: { "example-card": ".x{color:red}" } });
assert.match(card.shadowRoot.innerHTML, /gap:8px/);
assert.match(card.shadowRoot.innerHTML, /overflow-y:visible/);
assert.match(card.shadowRoot.innerHTML, /@media \(max-width:1100px\).*padding:0 10px/);
await new Promise((r) => setTimeout(r, 5));
assert.equal(created.length, 0, "children wait for hass");
const hass = mockHass({ states: { "light.example": "on" } });
card.hass = hass;
assert.equal(created.length, 2, "children mounted once hass arrives");
assert.ok(created.every((el) => el.hass === hass), "children get hass");
const styled = created[0].shadowRoot.appended.find((n) => n.dataset?.ssc === "1");
assert.ok(styled, "extra CSS injected into the matching card");
assert.equal(styled.textContent, ".x{color:red}");
assert.equal(created[1].shadowRoot.appended.length, 0, "other cards untouched");
assert.ok(created[1].shadowRoot instanceof FakeRoot);
assert.equal(card.getCardSize(), 12);
void dom;
console.log("scroll-stack-card tests passed");
process.exit(0);
