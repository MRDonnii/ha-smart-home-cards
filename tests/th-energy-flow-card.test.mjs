import assert from "node:assert/strict";
import { installFakeDom, mockHass, renderCard, disconnect } from "./helpers/fake-dom.mjs";

installFakeDom();
const { flowSettings, positive, TF_SCALE_DEFAULTS } = await import("../src/cards/th-energy-flow-card/config.js");
const { HUAWEI_DEVICE_DEFAULTS } = await import("../src/cards/shared/huawei-solar-entities.js");
await import("../src/cards/th-energy-flow-card/th-energy-flow-card.js");

const H = { emma: "plant_emma", batteries: "plant_batteries", charger: "plant_charger", inverter: "plant_inverter" };

// --- config normalisation ---
let S = flowSettings({ huawei: H });
assert.equal(S.entities.pv, "sensor.plant_emma_pv_output_power");
assert.equal(S.entities.bat, "sensor.plant_batteries_charge_discharge_power");
assert.equal(S.entities.ev, "sensor.plant_charger_charger_total_charged_energy");
assert.equal(S.entities.price, null, "prices have no default");
assert.equal(S.entities.mean, null);
assert.equal(S.mode, "now");
assert.equal(S.title, "Hvor kommer strømmen fra?");
assert.deepEqual(S.max, { sun: TF_SCALE_DEFAULTS.inverter_w, grid: TF_SCALE_DEFAULTS.grid_max_w, ev: TF_SCALE_DEFAULTS.ev_max_w });
assert.ok(flowSettings({}).entities.pv.startsWith(`sensor.${HUAWEI_DEVICE_DEFAULTS.emma}_`), "default device names");
assert.equal(flowSettings({ huawei: false }).entities.pv, null);
assert.doesNotThrow(() => flowSettings(null));

S = flowSettings({ mode: "day", inverter_w: 6000, grid_max_w: "17000", ev_max_w: -1, entities: { price: "sensor.example_price", ev: null, pv: " sensor.example_pv " } });
assert.equal(S.mode, "day");
assert.deepEqual(S.max, { sun: 6000, grid: 17000, ev: TF_SCALE_DEFAULTS.ev_max_w });
assert.equal(S.entities.price, "sensor.example_price");
assert.equal(S.entities.ev, null, "entities: null hides a value");
assert.equal(S.entities.pv, "sensor.example_pv");
assert.equal(positive("x", 5), 5);
assert.equal(positive(0, 5), 5);

// --- render ---
const states = {
  "sensor.plant_emma_pv_output_power": 3200, "sensor.plant_emma_load_power": 1400, "sensor.plant_emma_inverter_active_power": 2900,
  "sensor.plant_batteries_charge_discharge_power": 800, "sensor.plant_batteries_state_of_capacity": 64,
  "sensor.plant_emma_pv_yield_today": 12.3, "sensor.plant_emma_consumption_today": 9.1, "sensor.plant_emma_supply_from_grid_today": 2.2,
  "sensor.plant_emma_feed_in_to_grid_today": 3.4, "sensor.plant_batteries_day_charge": 4.0, "sensor.plant_batteries_day_discharge": 1.5,
  "sensor.plant_charger_charger_total_charged_energy": 812.4, "sensor.plant_charger_charger_temperature": 18,
  "sensor.example_price": 2.15, "sensor.example_price_mean": 1.9,
};
const hass = mockHass({ states });
const config = { type: "custom:th-energy-flow-card", huawei: H, entities: { price: "sensor.example_price", mean: "sensor.example_price_mean" } };
const card = await renderCard("th-energy-flow-card", config, hass);
const root = card.shadowRoot;
assert.match(root.innerHTML, /Hvor kommer strømmen fra\?/);
for (const label of ["SOLCELLER", "ELNETTET", "BATTERI", "BILLADER", "HUSET"]) assert.match(root.innerHTML, new RegExp(label));
assert.equal(root.queried("#v-sun").textContent, "3,20");
assert.equal(root.queried("#u-sun").textContent, "kW");
assert.equal(root.queried("#s-sun").textContent, "32 % af anlægget");
assert.equal(root.queried("#v-bat").textContent, "64");
assert.match(root.queried("#st").innerHTML, /Sol dækker/);
assert.match(root.queried("#st").innerHTML, /Pris nu/);
assert.match(root.queried("#st").innerHTML, /2,15/);
assert.match(root.queried("#st").innerHTML, /snit i dag 1,90/);
assert.ok(hass.calls.some((c) => c.ws === "recorder/statistics_during_period" && c.msg.statistic_ids[0] === "sensor.plant_charger_charger_total_charged_energy"), "charger statistics");

// "I dag"
card._mode = "day"; card._fk = null; card.update();
assert.match(root.queried("#st").innerHTML, /Selvforsynet/);
assert.equal(root.queried("#u-sun").textContent, "kWh");

// A new config rebuilds (title) and a scale change shows in the sun text.
card.setConfig({ ...config, title: "Energiflow", inverter_w: 6400 });
assert.match(root.innerHTML, /Energiflow/);
card._t = 0; card.hass = hass;
assert.equal(root.queried("#s-sun").textContent, "50 % af anlægget");

// Without a charger the medallion is left out; a minimal config does not throw.
const bare = await renderCard("th-energy-flow-card", { type: "custom:th-energy-flow-card", huawei: false }, mockHass({}));
assert.doesNotMatch(bare.shadowRoot.innerHTML, /BILLADER/);
const minimal = await renderCard("th-energy-flow-card", { type: "custom:th-energy-flow-card" }, mockHass({}));
assert.match(minimal.shadowRoot.innerHTML, /SOLCELLER/);
assert.equal(globalThis.window.customCards.filter((c) => c.type === "th-energy-flow-card").length, 1);

for (const c of [card, bare, minimal]) disconnect(c);
console.log("th-energy-flow-card tests passed");
process.exit(0);
