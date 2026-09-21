import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const filename = new URL("../src/cards/smart-home-overview-card/smart-home-overview-card.js", import.meta.url);
const source = await readFile(filename, "utf8");
const registry = new Map();

class HTMLElement {
  attachShadow() {
    this.shadowRoot = { addEventListener() {} };
  }
}

const context = {
  HTMLElement,
  customElements: {
    define(name, constructor) { registry.set(name, constructor); },
    get(name) { return registry.get(name); },
    whenDefined() { return Promise.resolve(); },
  },
  document: { createElement() { return {}; } },
  window: { customCards: [] },
  console: { info() {} },
};

vm.runInNewContext(source, context, { filename: filename.pathname });
const Card = registry.get("smart-home-overview-card");
assert.ok(Card, "smart-home-overview-card should register");

const card = new Card();
card._hass = { states: {} };
assert.equal(card._num("sensor.missing"), null, "missing entity must remain unknown");

card._hass.states["sensor.value"] = { state: "0" };
assert.equal(card._num("sensor.value"), 0, "numeric zero must remain valid");

card._hass.states["sensor.value"].state = "12,5";
assert.equal(card._num("sensor.value"), 12.5, "decimal comma must continue to parse");

card._hass.states["sensor.value"].state = "not-a-number";
assert.equal(card._num("sensor.value"), null, "malformed values must remain unknown");

console.log("Validated Smart Home Overview numeric state handling");
