import assert from "node:assert/strict";
import { installFakeDom, mockHass, renderCard, disconnect } from "./helpers/fake-dom.mjs";

installFakeDom({ now: "2026-06-01T10:00:00Z" });
const core = await import("../src/cards/fb-energy-cards/fb-energy-core.js");
const { VERSION } = await import("../src/cards/fb-energy-cards/fb-energy-cards.js");
assert.equal(VERSION, "1.1.1");

// Entity resolution: the Huawei Solar integration's standard names by default, renamed devices, single overrides.
const defaults = core.normalizeConfig({}).entities;
assert.deepEqual(Object.keys(defaults).sort(), Object.keys(core.ENTITY_SPEC).sort());
assert.ok(defaults.solar.startsWith("sensor.") && defaults.solar.endsWith("_pv_output_power"));
assert.ok(defaults.alarm.endsWith("_alarms"));
const renamed = core.normalizeConfig({ huawei: { emma: "example_emma", inverter: "example_inverter" }, entities: { soc: "sensor.example_soc", home: null } }).entities;
assert.equal(renamed.solar, "sensor.example_emma_pv_output_power");
assert.equal(renamed.alarm, "sensor.example_inverter_alarms");
assert.equal(renamed.soc, "sensor.example_soc");
assert.equal(renamed.home, null);
assert.equal(core.normalizeConfig({ huawei: false }).entities.solar, null);
assert.equal(core.normalizeConfig({ huawei: false, entities: { solar: "sensor.example_pv" } }).entities.solar, "sensor.example_pv");
assert.deepEqual(core.normalizeConfig(undefined).entities.grid, defaults.grid);
assert.equal(core.normalizeConfig({ title: "X", grid_import_positive: false }).grid_import_positive, false);

// Unit handling and formatting.
const h = mockHass({ states: { "sensor.a": { state: "1.5", attributes: { unit_of_measurement: "kW" } }, "sensor.b": { state: "800", attributes: { unit_of_measurement: "Wh" } }, "sensor.c": { state: "unavailable" } } });
assert.equal(core.measure(h, "sensor.a"), 1500);
assert.equal(core.measure(h, "sensor.b", "energy"), 0.8);
assert.equal(core.measure(h, "sensor.c"), null);
assert.equal(core.measure(h, null), null);
assert.match(core.power(1500), /1,50 <small>kW<\/small>/);
assert.match(core.power(-420), /420 <small>W<\/small>/);

// Render smoke tests with example data.
const p = (state, unit) => ({ state: String(state), attributes: { unit_of_measurement: unit } });
const hass = mockHass({
  states: {
    "sensor.example_emma_pv_output_power": p(2400, "W"),
    "sensor.example_emma_load_power": p(900, "W"),
    "sensor.example_emma_feed_in_power": p(-1100, "W"),
    "sensor.example_emma_battery_charge_discharge_power": p(400, "W"),
    "sensor.example_emma_state_of_capacity": p(62, "%"),
    "sensor.example_emma_pv_yield_today": p(8.4, "kWh"),
    "sensor.example_emma_consumption_today": p(6.1, "kWh"),
    "sensor.example_emma_supply_from_grid_today": p(1.2, "kWh"),
    "sensor.example_emma_feed_in_to_grid_today": p(3.3, "kWh"),
    "sensor.example_emma_energy_charged_today": p(2.5, "kWh"),
    "sensor.example_emma_energy_discharged_today": p(1.75, "kWh"),
  },
});
const cfg = { huawei: { emma: "example_emma" } };
for (const tag of ["fb-energy-flow-card", "fb-energy-battery-card", "fb-energy-today-card"]) assert.ok(customElements.get(tag), tag);

const flow = await renderCard("fb-energy-flow-card", { type: "custom:fb-energy-flow-card", ...cfg }, hass);
const fhtml = flow.shadowRoot.innerHTML;
assert.match(fhtml, /Hvor går strømmen hen\?/);
assert.match(fhtml, /2,40 <small>kW<\/small>/);
assert.match(fhtml, /Strøm ind/); // negative feed-in = import with the default sign
assert.match(fhtml, /data-entity="sensor\.example_emma_pv_output_power"/);
const flowInverted = await renderCard("fb-energy-flow-card", { type: "custom:fb-energy-flow-card", ...cfg, grid_import_positive: false }, hass);
assert.match(flowInverted.shadowRoot.innerHTML, /Strøm ud/);

const battery = await renderCard("fb-energy-battery-card", { type: "custom:fb-energy-battery-card", ...cfg, title: "Batteri" }, hass);
const bhtml = battery.shadowRoot.innerHTML;
assert.match(bhtml, /Batteri<\/h2>/);
assert.match(bhtml, /Batteriet lades op/);
assert.match(bhtml, /62<small> %<\/small>/);
assert.match(bhtml, /1,75 <small>kWh<\/small>/);

const today = await renderCard("fb-energy-today-card", { type: "custom:fb-energy-today-card", ...cfg }, hass);
const thtml = today.shadowRoot.innerHTML;
assert.match(thtml, /Dagens strøm i tal/);
assert.match(thtml, /8,40 <small>kWh<\/small>/);
assert.match(thtml, /Sendt til elnettet/);

// A minimal config does not throw; missing values show "—" and "Målinger mangler".
const empty = await renderCard("fb-energy-flow-card", { type: "custom:fb-energy-flow-card" }, mockHass());
assert.match(empty.shadowRoot.innerHTML, /Målinger mangler/);
assert.match(empty.shadowRoot.innerHTML, /—/);
const none = await renderCard("fb-energy-today-card", { type: "custom:fb-energy-today-card", huawei: false }, mockHass());
assert.match(none.shadowRoot.innerHTML, /data-entity=""/);
assert.deepEqual(Object.keys(customElements.get("fb-energy-today-card").getStubConfig().entities).sort(), Object.keys(core.ENTITY_SPEC).sort());

for (const card of [flow, flowInverted, battery, today, empty, none]) disconnect(card);
console.log("fb-energy-cards tests passed");
process.exit(0);
