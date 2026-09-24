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
  setTimeout,
  clearTimeout,
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
assert.equal(result.primaryMoving, false, "bypass status without measured flow must not animate fjernvarme");
result = model({ fjv_flow: "sensor.ff", heating_flow: "sensor.hf", water_flow: "sensor.wf", heating_active: "sensor.h", dhw_active: "sensor.d" }, {
  "sensor.ff": state(0, "L/h"), "sensor.hf": state(0, "L/h"), "sensor.wf": state(0, "L/h"),
  "sensor.h": state("Opvarmning"), "sensor.d": state("Bypass"),
});
assert.equal(result.primaryMoving, false);
assert.equal(result.heatMoving, false);
assert.equal(result.waterMoving, false);
result = model({ fjv_flow: "sensor.ff", heating_flow: "sensor.hf", water_flow: "sensor.wf" }, {
  "sensor.ff": state(120, "L/h"), "sensor.hf": state(90, "L/h"), "sensor.wf": state(8, "L/h"),
});
assert.equal(result.primaryMoving, true);
assert.equal(result.heatMoving, true);
assert.equal(result.waterMoving, true);

// A running pump keeps the heating loop moving even without heat demand.
result = model({ heating_active: "sensor.h", pump: "sensor.p" }, {
  "sensor.h": state("Standby"),
  "sensor.p": state("Til"),
});
assert.equal(result.heatingActive, false);
assert.equal(result.heatLoop, true);

// New cards resolve the registry instead of guessing similarly named entities.
assert.deepEqual(Object.keys(Card.getStubConfig()).sort(), ["subtitle", "title"]);
const stub = Card.getStubConfig({ states: {
  "sensor.unit_calefa_fjernvarme_fremlob_temperatur": state(60, "°C"),
  "sensor.unit_calefa_cvv_ventilposition": state(0, "%"),
  "sensor.other_fjernvarme_retur_temperatur": state(30, "°C"),
} });
assert.equal(stub.fjv_supply, undefined);
const registryRows = [
  ["one", "sensor.renamed_supply", "source_inlet_temperature"],
  ["one", "sensor.renamed_valve", "cvv_valve_position"],
  ["one", "number.renamed_setpoint", "dhw_temperature_setpoint_control"],
  ["one", "switch.one_extra", "custom_control"],
  ["one", "binary_sensor.renamed_alarm", "warning_pressure_low"],
  ["two", "sensor.other_supply", "source_inlet_temperature"],
].map(([config_entry_id, entity_id, key]) => ({ platform: "wavin_calefa", config_entry_id, entity_id, unique_id: `${config_entry_id}_${key}`, disabled_by: null }));
const automatic = new Card();
automatic._build = () => {};
automatic._update = () => {};
automatic.setConfig({ calefa_entry: "one", fjv_supply: "sensor.manual_override", fjv_return: "sensor.other_unit", display_entities: { standby: "switch.other_unit", extra: "switch.one_extra" } });
automatic.hass = { states: {}, connection: { sendMessagePromise: async () => registryRows } };
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(automatic._config.fjv_supply, "sensor.renamed_supply", "selected integration owns its native bindings");
assert.equal(automatic._config.fjv_return, "", "old native binding from another unit is cleared");
assert.equal(automatic._config.heating_valve, "sensor.renamed_valve");
assert.equal(automatic._config.display_entities.dhw_setpoint, "number.renamed_setpoint");
assert.equal(automatic._config.display_entities.standby, undefined, "a selected integration drops unrelated controls");
assert.equal(automatic._config.display_entities.extra, "switch.one_extra", "verified same-integration controls remain available");
assert.deepEqual([...automatic._config.alarm_entities], ["binary_sensor.renamed_alarm"]);
const ambiguous = new Card();
ambiguous._build = () => {};
ambiguous._update = () => {};
ambiguous.setConfig({});
ambiguous.hass = { states: {}, connection: { sendMessagePromise: async () => registryRows } };
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(ambiguous._config.fjv_supply, "", "multiple integrations require a choice");

assert.throws(() => new Card().setConfig(null), /configuration object/);

// ---- Controller popup ----------------------------------------------------------------------
const controlStates = () => ({
  "number.bv": { state: "52.0", attributes: { min: 45, max: 60, step: 0.5, unit_of_measurement: "°C" } },
  "number.shift": { state: "0.0", attributes: { min: -9, max: 9, step: 1, unit_of_measurement: "°C" } },
  "number.max_supply": { state: "55.0", attributes: { min: 30, max: 65, step: 1, unit_of_measurement: "°C" } },
  "select.bypass": { state: "Adaptivt skema", attributes: { options: ["Skema", "Adaptivt skema", "Øko", "Komfort"] } },
  "select.curve": { state: "manual", attributes: { options: ["manual", "floor_heating", "radiator"] } },
  "switch.priority": state("on"),
  "sensor.dhw_state": state("Standby"),
  "sensor.dhw": state(34.2, "°C"),
  "sensor.flow": state(0, "L/h"),
});
function controller(extra = {}, states = controlStates()) {
  const card = new Card();
  card._build = () => {};
  card.setConfig({
    dhw_temperature: "sensor.dhw", dhw_active: "sensor.dhw_state", water_flow: "sensor.flow",
    display_entities: { dhw_setpoint: "number.bv", parallel_shift: "number.shift", heat_max_supply: "number.max_supply", bypass_mode: "select.bypass", heat_curve_type: "select.curve", return_priority: "switch.priority" },
    ...extra,
  });
  const calls = [];
  card._hass = { states, callService: (...args) => { calls.push(args); return Promise.resolve(); } };
  card._refs = { modal: { hidden: true }, device: { focus() {} }, lcd: { innerHTML: "" } };
  return { card, calls, lcd: () => card._refs.lcd.innerHTML };
}
const top = (card) => card._stack.at(-1);
const selectRow = (card, label) => {
  const frame = top(card);
  const index = card._rows(frame).findIndex((row) => row.label === label);
  assert.ok(index >= 0, `menu ${frame.node.label} has ${label}`);
  while (frame.index < index) card._displayMove(-1);
  while (frame.index > index) card._displayMove(1);
};
const json = (value) => JSON.stringify(value);

// Closed by default, and the markup starts hidden.
let ui = controller();
assert.equal(ui.card._displayOpen, false, "popup is closed by default");
assert.match(ui.card._modalMarkup(), /data-ref="modal" hidden/);
assert.match(ui.card._modalMarkup(), /class="cf-modal-backdrop" data-action="close-display"/, "backdrop closes the popup");
assert.match(ui.card._modalMarkup(), /data-ctl="down"[\s\S]*data-ctl="enter"[\s\S]*data-ctl="up"/, "DOWN / ENTER / UP touch strip in controller order");
assert.equal((ui.card._modalMarkup().match(/data-ref="pled-/g) || []).length, 5, "five indicator positions");
assert.match(ui.card._modalMarkup(), /class="ctl-usb"/, "USB flap");
assert.match(ui.card._modalMarkup(), /class="ctl-logo"[^>]*>wavin</, "Wavin logo");

// Open, close with X, backdrop, Escape and disconnect.
ui.card._openDisplay();
assert.equal(ui.card._displayOpen, true);
assert.equal(ui.card._refs.modal.hidden, false);
assert.match(ui.lcd(), /data-screen="front-bv"/, "opens on the BV front menu");
assert.match(ui.lcd(), /52°/, "BV front shows the DHW setpoint");
ui.card._handleClick({ composedPath: () => [{ dataset: { action: "close-display" } }] }); // X
assert.equal(ui.card._displayOpen, false);
assert.equal(ui.card._refs.modal.hidden, true);
ui.card._openDisplay();
ui.card._handleClick({ composedPath: () => [{ dataset: { action: "close-display" } }, { dataset: {} }] }); // backdrop
assert.equal(ui.card._displayOpen, false, "backdrop closes");
ui.card._openDisplay();
let prevented = false;
ui.card._handleKeydown({ key: "Escape", preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(ui.card._displayOpen, false, "Escape closes");
ui.card._openDisplay();
ui.card._displayEnter(true);
ui.card.disconnectedCallback();
assert.equal(ui.card._displayOpen, false, "disconnect closes the popup");
ui.card._openDisplay();
assert.equal(ui.card._stack.length, 0, "reopening starts on the front menu");
assert.equal(ui.card._frontKey, "bv");

// Short ENTER cycles the front menus; ALARM only joins while an alarm is active.
ui.card._displayEnter();
assert.equal(ui.card._frontKey, "varme");
assert.match(ui.lcd(), /data-screen="front-varme"[\s\S]*\+0\.0°/);
ui.card._displayEnter();
assert.equal(ui.card._frontKey, "indstil");
ui.card._displayEnter();
assert.equal(ui.card._frontKey, "bv", "no ALARM front without alarms");
const alarmed = controller({ alarm_entities: ["binary_sensor.low_pressure"] }, { ...controlStates(), "binary_sensor.low_pressure": { state: "on", attributes: { friendly_name: "Wavin Calefa 2 Tryk lav advarsel" } } });
alarmed.card._openDisplay();
assert.equal(json(alarmed.card._fronts()), json(["bv", "varme", "indstil", "alarm"]));
alarmed.card._frontKey = "alarm";
alarmed.card._displayEnter(true);
assert.equal(json(alarmed.card._rows(top(alarmed.card)).map((row) => row.label)), json(["Tryk lav advarsel", "Exit"]), "alarm list is read from the alarm entities");
alarmed.card._displayEnter();
assert.equal(top(alarmed.card).kind, "info");
assert.equal(alarmed.calls.length, 0, "alarms are read-only");

// Long ENTER opens the current front's menu and steps back again.
ui.card._displayEnter(true);
assert.equal(top(ui.card).node.label, "BV");
assert.match(ui.lcd(), /<b>BV<\/b><span>1\/5<\/span>/, "menu header shows title and position");
assert.match(ui.lcd(), /lcd-row is-selected" data-row="Temperatur"/, "black bar marks the selected row");
assert.match(ui.lcd(), /\[52\]/);
ui.card._displayEnter(true);
assert.equal(ui.card._stack.length, 0, "long ENTER returns to the front menu");

// UP/DOWN move the selection bar and stop at the ends; Exit is the last row.
ui.card._displayEnter(true);
ui.card._displayMove(1);
assert.equal(top(ui.card).index, 0, "UP stops at the first row");
ui.card._displayMove(-1);
assert.equal(top(ui.card).index, 1, "DOWN moves the bar down");
assert.match(ui.lcd(), /is-selected" data-row="Status"/);
for (let i = 0; i < 10; i += 1) ui.card._displayMove(-1);
assert.equal(ui.card._rows(top(ui.card))[top(ui.card).index].label, "Exit", "DOWN stops on Exit");
assert.match(ui.lcd(), /is-selected" data-row="Exit"/);
ui.card._displayEnter();
assert.equal(ui.card._stack.length, 0, "short ENTER on Exit goes back");

// Status pages are read-only and paged with UP/DOWN.
ui.card._displayEnter(true);
selectRow(ui.card, "Status");
ui.card._displayEnter();
assert.equal(top(ui.card).kind, "pages");
assert.match(ui.lcd(), /Status 1\/2[\s\S]*BV:<\/span><strong>34\.2[\s\S]*FLW:<\/span><strong>0</, "status grid uses controller abbreviations");
ui.card._displayMove(-1);
assert.equal(top(ui.card).page, 1);
assert.match(ui.lcd(), /Status:<\/span><strong>STANDBY/);
ui.card._displayMove(-1);
assert.equal(top(ui.card).page, 1, "pages stop at the last page");
ui.card._displayEnter();
assert.equal(top(ui.card).node.label, "BV", "ENTER leaves the status pages");

// Front value: UP/DOWN edit, short ENTER writes, long ENTER cancels.
const front = controller();
front.card._openDisplay();
front.card._displayMove(1);
assert.equal(front.card._frontEdit.value, 52.5, "UP raises by the entity step");
assert.match(front.lcd(), /lcd-big is-pending">52\.5°/);
front.card._displayEnter(true);
assert.equal(front.card._frontEdit, null);
assert.equal(front.calls.length, 0, "long ENTER cancels without writing");
for (let i = 0; i < 40; i += 1) front.card._displayMove(1);
assert.equal(front.card._frontEdit.value, 60, "value stops at the entity maximum");
front.card._displayEnter();
assert.equal(json(front.calls[0]), json(["number", "set_value", { entity_id: "number.bv", value: 60 }]));
assert.equal(front.card._frontKey, "bv", "confirming a value does not switch front");
front.card._displayMove(-1);
front.card._displayMove(1);
assert.equal(front.card._frontEdit, null, "returning to the current value clears the pending edit");
front.card._displayEnter();
assert.equal(front.card._frontKey, "varme");
front.card._displayMove(-1);
front.card._displayMove(-1);
assert.match(front.lcd(), /−2\.0°/);
front.card._displayEnter();
assert.equal(json(front.calls[1]), json(["number", "set_value", { entity_id: "number.shift", value: -2 }]));

// Numeric editor: Behold keeps the value, Sæt writes it.
const editor = controller();
editor.card._openDisplay();
editor.card._displayEnter();
editor.card._displayEnter(true);
selectRow(editor.card, "Varmekurve");
editor.card._displayEnter();
selectRow(editor.card, "Maks. Varme F.");
editor.card._displayEnter();
assert.equal(top(editor.card).kind, "edit");
assert.match(editor.lcd(), /Maks\. Varme F\.[\s\S]*55°C[\s\S]*<b>Behold<\/b>/);
editor.card._displayEnter();
assert.equal(editor.calls.length, 0, "Behold does not write");
assert.equal(top(editor.card).node.label, "Varmekurve", "the editor returns to its menu");
editor.card._displayEnter();
editor.card._displayMove(1);
assert.match(editor.lcd(), /56°C[\s\S]*<b>Sæt<\/b>/);
editor.card._displayEnter();
assert.equal(json(editor.calls[0]), json(["number", "set_value", { entity_id: "number.max_supply", value: 56 }]));

// Select editor uses the controller's words and writes the entity's own option.
selectRow(editor.card, "Type");
assert.match(editor.lcd(), /data-row="Type"><span>Type<\/span><em>\[MANUEL\]/);
editor.card._displayEnter();
assert.match(editor.lcd(), /<span>1\/3<\/span>[\s\S]*Manuel[\s\S]*Behold/);
editor.card._displayMove(1);
assert.match(editor.lcd(), /2\/3[\s\S]*Gulvvarme[\s\S]*Sæt/);
editor.card._displayEnter();
assert.equal(json(editor.calls[1]), json(["select", "select_option", { entity_id: "select.curve", option: "floor_heating" }]));
editor.card._displayEnter(true);
editor.card._displayEnter(true);
assert.equal(editor.card._stack.length, 0, "two long presses return from Varmekurve to the front");
editor.card._frontKey = "bv";
editor.card._displayEnter(true);
selectRow(editor.card, "Bypass");
editor.card._displayEnter();
editor.card._displayEnter(); // Mode
assert.match(editor.lcd(), /1\/4[\s\S]*Auto/, "Adaptivt skema is the controller's Auto");
editor.card._displayMove(1);
editor.card._displayEnter();
assert.equal(json(editor.calls[2]), json(["select", "select_option", { entity_id: "select.bypass", option: "Skema" }]));

// Switch editor.
editor.card._stack = [];
editor.card._frontKey = "varme";
editor.card._displayEnter(true);
selectRow(editor.card, "Returbegrænser");
editor.card._displayEnter();
selectRow(editor.card, "Prioritet");
assert.match(editor.lcd(), /\[TIL\]/);
editor.card._displayEnter();
assert.match(editor.lcd(), /2\/2[\s\S]*Til/);
editor.card._displayMove(-1);
editor.card._displayEnter();
assert.equal(json(editor.calls[3]), json(["switch", "turn_off", { entity_id: "switch.priority" }]));
assert.equal(editor.calls.length, 4);

// Read-only items: device-only functions, unbound and unavailable entities never open an editor.
const readOnly = controller({}, { ...controlStates(), "number.max_supply": state("unavailable") });
readOnly.card._openDisplay();
readOnly.card._displayEnter(true);
selectRow(readOnly.card, "Bypass");
readOnly.card._displayEnter();
selectRow(readOnly.card, "Se tidsplaner");
assert.match(readOnly.lcd(), /data-row="Se tidsplaner" data-readonly=""/);
readOnly.card._displayEnter();
assert.equal(top(readOnly.card).kind, "info");
assert.match(readOnly.lcd(), /Kun på enheden/);
readOnly.card._displayMove(1);
readOnly.card._displayEnter();
assert.equal(top(readOnly.card).node.label, "Bypass", "ENTER leaves the read-only screen");
selectRow(readOnly.card, "Temperatur");
assert.match(readOnly.lcd(), /is-lock[\s\S]*\[--\]/, "unbound value is marked read-only");
readOnly.card._displayEnter();
assert.equal(top(readOnly.card).kind, "info");
assert.match(readOnly.lcd(), /Ingen HA-entitet/);
readOnly.card._stack = [];
readOnly.card._frontKey = "varme";
readOnly.card._displayEnter(true);
selectRow(readOnly.card, "Varmekurve");
readOnly.card._displayEnter();
selectRow(readOnly.card, "Maks. Varme F.");
readOnly.card._displayEnter();
assert.match(readOnly.lcd(), /Værdien er ikke tilgængelig/, "unavailable entity is not editable");
readOnly.card._stack = [];
readOnly.card._frontKey = "indstil";
readOnly.card._displayEnter(true);
selectRow(readOnly.card, "Dato og tid");
readOnly.card._displayEnter();
assert.match(readOnly.lcd(), /Dato og tid[\s\S]*Kun på enheden/);
assert.equal(readOnly.calls.length, 0, "read-only screens never call a service");
const noBindings = controller({ display_entities: {} });
noBindings.card._openDisplay();
noBindings.card._displayMove(1);
noBindings.card._displayEnter();
assert.equal(noBindings.card._frontKey, "varme", "without a writable entity arrows do nothing on the front");
assert.equal(noBindings.calls.length, 0);

// Only services and values the entity really accepts are sent.
const guard = controller({}, { ...controlStates(), "select.bypass": { state: "Skema", attributes: { options: ["Skema", "Adaptivt skema"] } } });
assert.equal(json(guard.card._options({ type: "select", map: "bypass_mode" }, guard.card._hass.states["select.bypass"]).map((option) => option.label)), json(["Auto", "Planlæg"]), "options missing on the entity are not offered");
guard.card._commit({ type: "number", map: "dhw_setpoint", title: "Temperatur" }, 70);
guard.card._commit({ type: "select", map: "bypass_mode", title: "Mode" }, "Komfort");
guard.card._commit({ type: "switch", map: "dhw_setpoint", title: "x" }, "on");
assert.equal(guard.calls.length, 0, "out-of-range, unknown option and wrong domain are refused");

// A rejected service call is shown on the LCD and dismissed with ENTER.
const failing = controller();
failing.card._hass.callService = () => Promise.reject(new Error("Modbus timeout"));
failing.card._openDisplay();
failing.card._displayMove(1);
failing.card._displayEnter();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(failing.lcd(), /Ikke gemt[\s\S]*Modbus timeout/);
failing.card._displayMove(1);
assert.match(failing.lcd(), /Ikke gemt/, "arrows do not act behind an error screen");
failing.card._displayEnter();
assert.match(failing.lcd(), /data-screen="front-bv"/);

// Keyboard: arrows move, Enter is short, Shift+Enter and Backspace are long.
const keys = controller();
keys.card._openDisplay();
const press = (key, shiftKey = false) => keys.card._handleKeydown({ key, shiftKey, preventDefault() {} });
press("Enter");
assert.equal(keys.card._frontKey, "varme");
press("Enter", true);
assert.equal(top(keys.card).node.label, "ITC");
press("ArrowDown");
assert.equal(top(keys.card).index, 1);
press("ArrowUp");
assert.equal(top(keys.card).index, 0);
press("Backspace");
assert.equal(keys.card._stack.length, 0);

// Touch keys: a quick ENTER is short, a held ENTER fires one long press, held arrows repeat in editors.
const touch = controller();
touch.card._openDisplay();
const fakeKey = (ctl) => ({ dataset: { ctl }, classList: { add() {}, remove() {} } });
const pointer = (type, el) => touch.card._handlePointer({ type, button: 0, pointerId: 1, composedPath: () => [el], preventDefault() {} });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const enterKey = fakeKey("enter");
pointer("pointerdown", enterKey);
pointer("pointerup", enterKey);
assert.equal(touch.card._frontKey, "varme", "quick press is a short ENTER");
touch.card._handleClick({ detail: 1, composedPath: () => [{ dataset: { action: "display-key", ctl: "enter" } }] });
assert.equal(touch.card._frontKey, "varme", "the click after a pointer press is not counted twice");
pointer("pointerdown", enterKey);
await sleep(700);
assert.equal(top(touch.card)?.node.label, "ITC", "holding ENTER opens the menu while still held");
pointer("pointerup", enterKey);
assert.equal(top(touch.card)?.node.label, "ITC", "releasing after a long press adds no short press");
pointer("pointerdown", enterKey);
pointer("pointercancel", enterKey);
assert.equal(top(touch.card)?.node.label, "ITC", "a cancelled press does nothing");
touch.card._handleClick({ detail: 0, composedPath: () => [{ dataset: { action: "display-key", ctl: "down" } }] });
assert.equal(top(touch.card).index, 1, "keyboard-activated key click works");
touch.card._stack = [];
touch.card._frontKey = "bv";
const upKey = fakeKey("up");
pointer("pointerdown", upKey);
await sleep(700);
pointer("pointerup", upKey);
assert.ok(touch.card._frontEdit.value >= 54, "held UP repeats while editing a value");
assert.equal(touch.calls.length, 0, "repeating never writes by itself");
touch.card._closeDisplay();

// Popup LEDs mirror the controller status indicators.
const fascia = controller({ fjv_supply: "sensor.supply" }, { ...controlStates(), "sensor.supply": state(58) });
fascia.card._refs = Object.fromEntries(["power", "fault", "mode", "lan", "peripheral"].map((key) => [`pled-${key}`, { dataset: {}, getAttribute() { return null; }, setAttribute() {} }]));
fascia.card._applyStatusLeds({ dhwTap: false, heatingActive: true, dhwBypass: false });
assert.equal(fascia.card._refs["pled-power"].dataset.tone, "green");
assert.equal(fascia.card._refs["pled-mode"].dataset.tone, "red");
assert.equal(fascia.card._refs["pled-fault"].dataset.tone, "off");

// The registry binds the popup's controls and status readouts from the same integration.
const popupRows = [
  ["one", "select.mode", "dhw_mode_control"], ["one", "switch.priority", "return_limiter_priority_over_supply"],
  ["one", "sensor.bypass", "dhw_bypass_active"], ["one", "switch.vacation_ch", "vacation_for_ch"],
].map(([config_entry_id, entity_id, key]) => ({ platform: "wavin_calefa", config_entry_id, entity_id, unique_id: `${config_entry_id}_${key}`, disabled_by: null }));
const bound = new Card();
bound._build = () => {};
bound._update = () => {};
bound.setConfig({});
bound.hass = { states: {}, connection: { sendMessagePromise: async () => popupRows } };
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(bound._config.display_entities.bypass_mode, "select.mode");
assert.equal(bound._config.display_entities.return_priority, "switch.priority");
assert.equal(bound._config.display_entities.bypass_state, "sensor.bypass");
assert.equal(bound._config.display_entities.vacation_ch, "switch.vacation_ch");

const stale = new Card();
stale._build = () => {};
stale.setConfig({ pump: "sensor.p" });
const one = { states: { "sensor.p": state("Til") }, connected: true, locale: "da" };
assert.equal(stale._hasChanges(one), true);
stale._remember(one);
assert.equal(stale._hasChanges(one), false, "same state objects do not trigger a rebuild");
assert.equal(stale._hasChanges({ ...one, states: { "sensor.p": one.states["sensor.p"] } }), false);
assert.equal(stale._hasChanges({ ...one, states: { "sensor.p": state("Fra") } }), true);

const deltaCard = new Card();
deltaCard._build = () => {};
deltaCard.setConfig({ fjv_good_delta: 20, heating_good_delta: 5 });
assert.equal(deltaCard._deltaStatus("fjv", 19.9), "bad");
assert.equal(deltaCard._deltaStatus("fjv", 20), "good");
assert.equal(deltaCard._deltaStatus("heating", 5), "good");
assert.equal(deltaCard._deltaStatus("heating", null), "unavailable");

let legacyOpened = 0;
const legacy = { localName: "ha-fjernvarme-house-card-v2", _config: { details_title: "Calefa styring" }, _openDetailsPopup() { legacyOpened += 1; } };
const legacyRoot = { children: [legacy] };
const bridge = new Card();
bridge.getRootNode = () => legacyRoot;
bridge._decorateLegacyPopup = () => {};
context.document = { children: [] };
bridge._openLegacyPopup();
assert.equal(legacyOpened, 1, "display button opens the existing Calefa popup owner");

const faultCard = new Card();
faultCard._build = () => {};
faultCard.setConfig({ alarm_entities: ["binary_sensor.calefa_motor_failure", "binary_sensor.calefa_warning", "binary_sensor.calefa_idle"] });
faultCard._hass = { states: {
  "binary_sensor.calefa_motor_failure": { state: "on", attributes: { friendly_name: "Motorfejl", description: "Ventilen svarer ikke" } },
  "binary_sensor.calefa_warning": { state: "on", attributes: { friendly_name: "Lavt tryk" } },
  "binary_sensor.calefa_idle": { state: "off", attributes: { friendly_name: "Ingen fejl" } },
} };
assert.deepEqual(faultCard._activeFaults().map((fault) => fault.label), ["Motorfejl", "Lavt tryk"]);
assert.equal(faultCard._activeFaults()[0].detail, "Ventilen svarer ikke");
assert.equal(faultCard._activeFaults()[0].critical, true);
assert.equal(faultCard._activeFaults()[1].critical, false);

let popupOpened = 0;
let popupConfig;
registry.set("ha-fjernvarme-house-card-v2", class {});
const popupOwner = { style: {}, setConfig(config) { popupConfig = config; }, _openDetailsPopup() { popupOpened += 1; } };
context.document.createElement = () => popupOwner;
const integrated = new Card();
integrated._build = () => {};
integrated.setConfig({ popup_card: { details_entities: { standby: "switch.calefa_standby" }, extra_popups: [{ title: "Forbrug", cards: [{}] }] } });
integrated._hass = { states: {} };
integrated.shadowRoot.appendChild = () => {};
integrated._decorateLegacyPopup = () => {};
integrated._openLegacyPopup();
integrated._openLegacyPopup();
assert.equal(popupOpened, 2, "Info keeps both tabs available after the old dashboard card is removed");
assert.equal(popupConfig.extra_popups[0].cards.length, 1);
assert.equal(integrated._popupCard, popupOwner, "popup owner is reused rather than rebuilt");

const speed = new Card();
speed._build = () => {};
speed.setConfig({});
assert.equal(speed._flowLevel(null, "L/h"), null, "missing flow does not animate");
assert.equal(speed._flowLevel(0, "L/h"), null, "zero flow does not animate");
assert.equal(speed._flowLevel(60, "L/h"), 1);
assert.equal(speed._flowLevel(300, "L/h"), 2);
assert.equal(speed._flowLevel(600, "L/h"), 3);
assert.equal(speed._flowLevel(1100, "L/h"), 4);
assert.equal(speed._flowLevel(12, "L/min"), 3, "L/min is normalised separately");

// Flow tracks are traced on the 775 x 1295 unit illustration and stay inside it.
const geometry = vm.runInNewContext(`${source.slice(source.indexOf("const VIEW_W"), source.indexOf("function interpretActivity"))}; ({ VIEW_W, VIEW_H, TRACKS, ANCHORS, LAYOUT, pathLength })`);
assert.equal(geometry.VIEW_W / geometry.VIEW_H, 775 / 1295, "overlay uses the illustration aspect ratio");
for (const track of geometry.TRACKS) {
  const numbers = track.d.match(/-?\d*\.?\d+/g).map(Number);
  assert.ok(numbers.every((n) => n >= 0 && n <= geometry.VIEW_H), `${track.id} stays inside the drawing`);
  assert.ok(geometry.pathLength(track.d) > 40, `${track.id} has a measurable length`);
}
assert.equal(Math.round(geometry.pathLength("M0 0 H30 V40")), 70);
const laidOut = Object.values(geometry.LAYOUT).flat().flatMap((spec) => spec[0] === "pair" ? spec.slice(1, 3) : [spec[1]]);
assert.ok(laidOut.every((id) => geometry.ANCHORS[id]), "every side tile has a callout anchor");

const leds = new Card();
leds._build = () => {};
leds.setConfig({
  fjv_supply: "sensor.supply", outdoor_temperature: "sensor.outdoor",
  alarm_entities: ["binary_sensor.warning", "binary_sensor.outdoor_sensor_failure"],
});
leds._hass = { states: {
  "sensor.supply": state(50), "sensor.outdoor": state(4),
  "binary_sensor.warning": state("on"),
  "binary_sensor.outdoor_sensor_failure": state("off"),
} };
leds._refs = Object.fromEntries(["power", "fault", "mode", "lan", "peripheral"].map((key) => [
  `led-${key}`, { dataset: {}, getAttribute() { return null; }, setAttribute() {} },
]));
leds._applyStatusLeds({ dhwTap: false, heatingActive: false, dhwBypass: true });
assert.equal(leds._refs["led-power"].dataset.tone, "green");
assert.equal(leds._refs["led-fault"].dataset.tone, "yellow");
assert.equal(leds._refs["led-mode"].dataset.tone, "cyan");
assert.equal(leds._refs["led-mode"].dataset.blink, "slow");
assert.equal(leds._refs["led-lan"].dataset.tone, "unknown", "LAN must not be inferred from HA connection");
assert.equal(leds._refs["led-peripheral"].dataset.tone, "green", "available outdoor sensor lights peripheral LED");
leds._hass.states["binary_sensor.outdoor_sensor_failure"] = state("on");
leds._applyStatusLeds({ dhwTap: false, heatingActive: true, dhwBypass: false });
assert.equal(leds._refs["led-fault"].dataset.tone, "red");
assert.equal(leds._refs["led-mode"].dataset.tone, "red");
assert.equal(leds._refs["led-peripheral"].dataset.blink, "slow");

// "I dag": statistics rows are grouped per local hour and the live counter fills the current hour.
const today = vm.runInNewContext(`const clamp = (v, a, b) => Math.min(b, Math.max(a, v)); ${source.slice(source.indexOf("function buildTodaySeries"), source.indexOf("function interpretActivity"))}; buildTodaySeries`);
const midnightMs = Date.UTC(2026, 8, 24, 0, 0, 0);
const hourMs = 3600000;
const rows = [
  { start: midnightMs, change: 1.2 },
  { start: midnightMs + 5 * 60000, change: 0.3 },
  { start: new Date(midnightMs + hourMs).toISOString(), change: 2 },
  { start: midnightMs + 2 * hourMs, change: null },
  { start: midnightMs - hourMs, change: 9 },
];
const hours = today(rows, 5, midnightMs, midnightMs + 2 * hourMs + 20 * 60000);
assert.equal(hours.length, 24);
assert.equal(hours[0], 1.5, "5-minute rows are summed per hour");
assert.equal(hours[1], 2, "ISO timestamps are accepted");
assert.equal(hours[2], 1.5, "live counter fills the current hour");
assert.equal(hours.slice(3).reduce((a, b) => a + b, 0), 0, "future hours stay empty");
assert.equal(today([], null, midnightMs, midnightMs + hourMs).reduce((a, b) => a + b, 0), 0, "missing data stays empty");
const meterBase = vm.runInNewContext(`${source.slice(source.indexOf("function todayMeterBase"), source.indexOf("function buildTodaySeries"))}; todayMeterBase`);
assert.equal(meterBase([{ start: midnightMs + 300000, state: 4250, change: 0 }, { start: midnightMs, state: 4250, change: 0 }]), 4250, "midnight reading of a running meter");
assert.equal(meterBase([{ start: midnightMs, state: 4251, change: 1 }]), 4250, "first row's own change is removed");
assert.equal(meterBase([]), null);
const todayCard = new Card();
todayCard._build = () => {};
todayCard.setConfig({});
assert.equal(todayCard._todayEnabled(), false, "section is hidden without energy entities");
todayCard.setConfig({ energy_today: "sensor.energy_today" });
assert.equal(todayCard._todayEnabled(), true);
todayCard.setConfig({ energy_meter: "sensor.heat_meter_total" });
assert.equal(todayCard._todayMeterKey(), "energy_meter", "running meter has priority");
todayCard.setConfig({ energy_today: "sensor.energy_today", show_today: false });
assert.equal(todayCard._todayEnabled(), false);

console.log("Validated Calefa flow card state handling");
