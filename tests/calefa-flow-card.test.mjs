import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const filename = new URL("../src/cards/ha-calefa-flow-card/ha-calefa-flow-card.js", import.meta.url);
const source = await readFile(filename, "utf8");
const registry = new Map();

class HTMLElement {
  attachShadow() {
    this.shadowRoot = { addEventListener() {}, querySelectorAll() { return []; } };
  }
}

const context = {
  HTMLElement,
  customElements: {
    define(name, constructor) { registry.set(name, constructor); },
    get(name) { return registry.get(name); },
  },
  window: { customCards: [], addEventListener() {}, removeEventListener() {} },
  console: { info() {}, warn() {} },
  Intl,
};

vm.runInNewContext(source, context, { filename: filename.pathname });
const Card = registry.get("ha-calefa-flow-card");
assert.ok(Card, "ha-calefa-flow-card should register");
assert.equal(context.window.customCards.filter((card) => card.type === "ha-calefa-flow-card").length, 1, "card picker entry registered once");

const state = (value, unit) => ({ state: String(value), attributes: unit ? { unit_of_measurement: unit } : {} });

function model(config, states) {
  const card = new Card();
  card._build = () => {};
  card.setConfig(config);
  card._hass = { states, locale: { language: "da" } };
  return card._computeModel();
}

// Missing and unavailable entities never throw and leave everything idle.
let result = model({}, {});
assert.equal(result.heatingActive, false);
assert.equal(result.dhwTap, false);
assert.equal(result.primary, false);
result = model({ fjv_supply: "sensor.a", pump: "sensor.p", water_flow: "sensor.w" }, {
  "sensor.a": state("unavailable"),
  "sensor.p": state("unknown"),
});
assert.equal(result.primary, false, "unavailable entities must not animate");

// Danish Calefa text states.
result = model({ heating_active: "sensor.h", dhw_active: "sensor.d", pump: "sensor.p" }, {
  "sensor.h": state("Opvarmning"),
  "sensor.d": state("Standby"),
  "sensor.p": state("Til"),
});
assert.equal(result.heatingActive, true);
assert.equal(result.dhwTap, false);
assert.equal(result.pumpActive, true);

// Explicit activity entities win over derived flow/valve values.
result = model({ heating_active: "sensor.h", heating_valve: "sensor.v", heating_flow: "sensor.f" }, {
  "sensor.h": state("Standby"),
  "sensor.v": state(80, "%"),
  "sensor.f": state(400, "L/h"),
});
assert.equal(result.heatingActive, false, "explicit heating_active has priority");

// Derived activity when no explicit entity is configured.
result = model({ heating_valve: "sensor.v", water_flow: "sensor.w", dhw_valve: "sensor.dv" }, {
  "sensor.v": state(35, "%"),
  "sensor.w": state(0, "L/h"),
  "sensor.dv": state(0, "%"),
});
assert.equal(result.heatingActive, true, "open heating valve means heating");
assert.equal(result.dhwTap, false, "zero water flow means no tapping");

// Bypass keeps the DHW primary side warm without tapping.
result = model({ dhw_active: "sensor.d", dhw_valve: "sensor.dv" }, {
  "sensor.d": state("Bypass"),
  "sensor.dv": state(4, "%"),
});
assert.equal(result.dhwBypass, true);
assert.equal(result.dhwTap, false);
assert.equal(result.dhwPrimary, true);

// A running pump keeps the heating loop moving even without heat demand.
result = model({ heating_active: "sensor.h", pump: "sensor.p" }, {
  "sensor.h": state("Standby"),
  "sensor.p": state("Til"),
});
assert.equal(result.heatingActive, false);
assert.equal(result.heatLoop, true);

// Stub config only uses entities that exist.
assert.deepEqual(Object.keys(Card.getStubConfig()).sort(), ["subtitle", "title"]);
const stub = Card.getStubConfig({ states: {
  "sensor.unit_calefa_fjernvarme_fremlob_temperatur": state(60, "°C"),
  "sensor.unit_calefa_cvv_ventilposition": state(0, "%"),
  "sensor.other_fjernvarme_retur_temperatur": state(30, "°C"),
} });
assert.equal(stub.fjv_supply, "sensor.unit_calefa_fjernvarme_fremlob_temperatur");
assert.equal(stub.heating_valve, "sensor.unit_calefa_cvv_ventilposition");
assert.equal(stub.fjv_return, undefined, "non-Calefa entities are not guessed");

assert.throws(() => new Card().setConfig(null), /configuration object/);

console.log("Validated Calefa flow card state handling");
