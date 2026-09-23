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
result = model({ dhw_active: "sensor.d", dhw_valve: "sensor.dv" }, {
  "sensor.d": state("Bypass"),
  "sensor.dv": state(0, "%"),
});
assert.equal(result.dhwPrimary, true, "bypass heats the primary side even when the DHW valve reports zero");

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

// The physical display is closed by default and navigation stays inside the menu tree.
const display = new Card();
display._build = () => {};
display.setConfig({ display_entities: { parallel_shift: "number.calefa_shift", bypass_mode: "select.calefa_bypass" } });
const calls = [];
display._hass = { states: {
  "number.calefa_shift": { state: "2", attributes: { min: -9, max: 9, step: 1 } },
  "select.calefa_bypass": { state: "AUTO", attributes: { options: ["AUTO", "PLANLÆG", "KOMFORT", "ØKO"] } },
}, callService: (...args) => calls.push(args) };
display._renderDisplay = () => {};
assert.equal(display._displayOpen, false);
assert.match(display._modalMarkup(), /data-ref="modal" hidden/);
display._displayEnter();
assert.equal(display._displayPage, 1, "short Enter cycles front menus");
display._displayMove(-1);
assert.equal(display._edit.node.map, "parallel_shift");
assert.equal(display._edit.value, "3");
display._displayEnter();
assert.equal(calls.length, 0, "first Enter only asks for confirmation");
display._displayEnter();
assert.equal(JSON.stringify(calls[0]), JSON.stringify(["number", "set_value", { entity_id: "number.calefa_shift", value: 3 }]));
display._displayEnter(true);
assert.equal(display._inMenu, true, "long Enter opens the current menu");
display._displayEnter(true);
assert.equal(display._inMenu, false);
display._displayPage = 0;
display._displayEnter(true);
display._displayMove(1);
display._displayMove(1);
display._displayEnter(); // Bypass
display._displayEnter(); // Mode
assert.equal(display._edit.node.map, "bypass_mode");
display._displayMove(1);
display._displayEnter();
display._displayEnter();
assert.equal(JSON.stringify(calls[1]), JSON.stringify(["select", "select_option", { entity_id: "select.calefa_bypass", option: "PLANLÆG" }]));
display._displayEnter(true);
assert.equal(display._menuPath.length, 0, "long Enter returns one level");
const readOnly = new Card();
readOnly._build = () => {};
readOnly.setConfig({});
readOnly._hass = { states: {}, callService: (...args) => calls.push(args) };
readOnly._renderDisplay = () => {};
assert.equal(readOnly._activeFronts().length, 0, "no unsupported menu fronts are shown");
readOnly._displayEnter(true);
readOnly._displayEnter();
assert.equal(readOnly._edit, null, "unmapped menu values remain read-only");
assert.equal(calls.length, 2);
assert.equal(JSON.stringify(display._activeFronts()), JSON.stringify(["bv", "itc"]));
assert.equal(display._menuChildren(display._menuNode()).some((item) => item.service), false, "service actions without HA data are hidden");
const alarms = new Card();
alarms._build = () => {};
alarms.setConfig({ alarm_entities: ["binary_sensor.calefa_alarm", "sensor.not_an_alarm"] });
alarms._hass = { states: { "binary_sensor.calefa_alarm": state("on") } };
assert.equal(JSON.stringify(alarms._activeFronts()), JSON.stringify(["alarm"]));
assert.equal(alarms._menuValue({ label: "Aktuelle alarmer" }), "1 aktiv");

const modal = new Card();
modal._build = () => {};
modal.setConfig({});
modal._renderDisplay = () => {};
modal._refs = { modal: { hidden: true }, device: { focus() {} } };
modal._openDisplay();
assert.equal(modal._displayOpen, true);
assert.equal(modal._refs.modal.hidden, false);
modal._handleClick({ composedPath: () => [{ dataset: { action: "close-display" } }] }); // X
assert.equal(modal._refs.modal.hidden, true);
modal._openDisplay();
modal._handleClick({ composedPath: () => [{ dataset: { action: "close-display" } }] }); // backdrop
assert.equal(modal._displayOpen, false);
modal._openDisplay();
let prevented = false;
modal._handleKeydown({ key: "Escape", preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(modal._displayOpen, false);
modal._openDisplay();
modal.disconnectedCallback();
assert.equal(modal._displayOpen, false, "disconnect closes the modal and removes its key listener");

const stale = new Card();
stale._build = () => {};
stale.setConfig({ pump: "sensor.p" });
const one = { states: { "sensor.p": state("Til") }, connected: true, locale: "da" };
assert.equal(stale._hasChanges(one), true);
stale._remember(one);
assert.equal(stale._hasChanges(one), false, "same state objects do not trigger a rebuild");
assert.equal(stale._hasChanges({ ...one, states: { "sensor.p": one.states["sensor.p"] } }), false);
assert.equal(stale._hasChanges({ ...one, states: { "sensor.p": state("Fra") } }), true);

const speed = new Card();
const props = new Map();
const flowNode = { style: { getPropertyValue: (name) => props.get(name), setProperty: (name, value) => props.set(name, value) } };
speed._setFlowDuration(flowNode, 20);
const slow = props.get("--cf-flow-duration");
speed._setFlowDuration(flowNode, 80);
const fast = props.get("--cf-flow-duration");
assert.ok(parseFloat(fast) < parseFloat(slow), "valid faster flow shortens CSS animation duration");
speed._setFlowDuration(flowNode, null);
assert.equal(props.get("--cf-flow-duration"), "1.10s");

console.log("Validated Calefa flow card state handling");
