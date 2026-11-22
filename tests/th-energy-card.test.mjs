import assert from "node:assert/strict";
import { installFakeDom, mockHass, renderCard, disconnect } from "./helpers/fake-dom.mjs";

installFakeDom();
const C = await import("../src/cards/th-energy-card/config.js");
await import("../src/cards/th-energy-card/th-energy-card.js");

const H = { emma: "plant_emma", batteries: "plant_batteries", inverter: "plant_inverter", charger: "plant_charger", battery: "unit" };

// --- config normalisation ---
let S = C.energySettings({ huawei: H });
assert.equal(S.entities.pv, "sensor.plant_emma_pv_output_power");
assert.equal(S.entities.invSwitch, "switch.plant_inverter");
assert.equal(S.entities.stopForc, "button.plant_batteries_stop_forcible_charge");
assert.equal(S.entities.eoc, "number.plant_inverter_end_of_charge_soc");
assert.equal(S.entities.evTot, "sensor.plant_charger_charger_total_charged_energy");
assert.equal(S.entities.sun, "sun.sun");
for (const k of ["maxFeed", "month", "year", "price", "priceNow", "spotNow", "priceMean", "co2", "temp", "cloud", "wind", "rad"]) assert.equal(S.entities[k], null, `${k} has no default`);
assert.deepEqual([S.name, S.panels, S.view3d, S.weather, S.latitude], [null, null, null, null, null]);
assert.deepEqual([S.inverterW, S.gridMaxW, S.stringMaxW], [10000, 11000, 5000]);
assert.deepEqual([S.inverterModel, S.chargerModel], ["SUN2000", "Huawei SCharger"]);
S = C.energySettings({ name: " Example Home ", panels: "24", view3d: "/dashboard-energy/3d", weather: "sensor.not_weather", latitude: 0, inverter_w: 8000, inverter_model: "", battery_kwh: 15 });
assert.deepEqual([S.name, S.panels, S.view3d, S.weather, S.latitude], ["Example Home", 24, "/dashboard-energy/3d", null, 0]);
assert.deepEqual([S.inverterW, S.stringMaxW, S.inverterModel, S.batteryKwh], [8000, 4000, null, 15]);
assert.equal(C.energySettings({ weather: "weather.home" }).weather, "weather.home");
assert.doesNotThrow(() => C.energySettings(null));

// Capacity: battery_kwh, else the rated sensor (Wh), else units × modules × pack_kwh.
assert.equal(C.batteryCapacityKwh({ batteryKwh: 12, packKwh: 5 }, 30000, { batteries: 2, packs: 3 }), 12);
assert.equal(C.batteryCapacityKwh({ batteryKwh: null, packKwh: 5 }, 15000, { batteries: 2, packs: 3 }), 15);
assert.equal(C.batteryCapacityKwh({ batteryKwh: null, packKwh: 5 }, NaN, { batteries: 2, packs: 3 }), 30);
assert.deepEqual(C.batteryLayout({ batteries: 3 }, {}), { batteries: 3, packs: 1 });

// The embedded cards get the page's entities under their own keys.
const cfg = { huawei: H, inverter_w: 8000, batteries: 2, entities: { priceNow: "sensor.example_price_now", priceMean: "sensor.example_price_mean" },
  flow_card: { mode: "day", entities: { mean: null } }, battery_card: { title: "Lager" } };
const flow = C.flowCardConfig(cfg);
assert.equal(flow.title, "Hvor kommer strømmen fra?");
assert.equal(flow.mode, "day");
assert.equal(flow.inverter_w, 8000);
assert.deepEqual(flow.huawei, H);
assert.equal(flow.entities.price, "sensor.example_price_now");
assert.equal(flow.entities.mean, null, "flow_card.entities wins");
assert.equal(flow.entities.ev, "sensor.plant_charger_charger_total_charged_energy");
assert.equal(flow.entities.pv, "sensor.plant_emma_pv_output_power");
const bat = C.batteryCardConfig(cfg);
assert.equal(bat.title, "Lager");
assert.equal(bat.batteries, 2);
assert.equal(bat.entities.power, "sensor.plant_batteries_charge_discharge_power");
assert.equal(bat.entities.totDis, "sensor.plant_batteries_total_discharge");
assert.equal(bat.entities.status, "sensor.plant_batteries_status");
assert.equal(C.batteryCardConfig({}).title, "Batterier");

assert.equal(C.windToMs(36, "km/h"), 10);
assert.equal(C.windToMs(5, "m/s"), 5);
assert.ok(Number.isNaN(C.windToMs(undefined, "km/h")));
assert.deepEqual(C.weatherFallback({ attributes: { temperature: 7.5, cloud_coverage: 40, wind_speed: 18, wind_speed_unit: "km/h" } }), { temp: 7.5, cloud: 40, wind: 5, rad: NaN });
assert.equal(C.groupThousands(11000), "11 000");

// --- render ---
const prices = Array.from({ length: 24 }, (_, h) => ({ hour: new Date(Date.UTC(2026, 0, 15, h)).toISOString(), price: 1 + (h % 6) * 0.25 }));
const states = {
  "sensor.plant_emma_pv_output_power": 4200, "sensor.plant_emma_load_power": 1600, "sensor.plant_emma_inverter_active_power": 3900,
  "sensor.plant_batteries_charge_discharge_power": 1500, "sensor.plant_batteries_state_of_capacity": 71,
  "sensor.plant_emma_pv_yield_today": 18.4, "sensor.plant_emma_consumption_today": 11.2, "sensor.plant_emma_supply_from_grid_today": 1.3,
  "sensor.plant_emma_feed_in_to_grid_today": 6.8, "sensor.plant_batteries_day_charge": 5.5, "sensor.plant_batteries_day_discharge": 2.1,
  "sensor.plant_batteries_rated_capacity": 15000, "sensor.plant_batteries_total_discharge": 1500,
  "sensor.plant_inverter_alarms": "None", "switch.plant_inverter": "on", "sensor.plant_inverter_device_status": "On-grid",
  "select.plant_batteries_working_mode": { state: "maximise_self_consumption", attributes: { options: ["maximise_self_consumption", "time_of_use_luna2000"] } },
  "switch.plant_batteries_charge_from_grid": "off",
  "number.plant_batteries_end_of_discharge_soc": { state: "10", attributes: { min: 0, max: 20, step: 1 } },
  "number.plant_inverter_power_derating": { state: "8800", attributes: { min: 0, max: 8800, step: 1 } },
  "number.example_feed_limit": { state: "5000", attributes: { min: 0, max: 20000, step: 1 } },
  "sensor.plant_charger_charger_total_charged_energy": 640, "sensor.plant_charger_charger_temperature": 14,
  "sensor.example_price_now": 2.05, "sensor.example_prices": { state: "1.9", attributes: { raw_today: prices, raw_tomorrow: [], today_mean: 1.6 } },
  "sensor.example_co2": 95, "sensor.unit_1_state_of_capacity": 70, "sensor.unit_2_state_of_capacity": 72,
  "weather.home": { state: "cloudy", attributes: { temperature: 6.4, cloud_coverage: 80, wind_speed: 21.6, wind_speed_unit: "km/h" } },
  "sun.sun": { state: "above_horizon", attributes: { elevation: 20, next_rising: "2026-01-16T07:30:00Z", next_setting: "2026-01-15T15:40:00Z" } },
};
const hass = mockHass({ states, config: { latitude: 50 } });
const config = { type: "custom:th-energy-card", huawei: H, name: "Example Home", panels: 24, view3d: "/dashboard-energy/3d", weather: "weather.home",
  entities: { priceNow: "sensor.example_price_now", price: "sensor.example_prices", co2: "sensor.example_co2", maxFeed: "number.example_feed_limit" } };
const card = await renderCard("th-energy-card", config, hass);
const root = card.shadowRoot, q = (id) => root.queried(`#${id}`)?.innerHTML ?? "";
assert.match(root.innerHTML, /Energi · Example Home/);
assert.match(root.innerHTML, /Se huset i 3D/);
assert.match(root.innerHTML, /<th-energy-flow-card id="flow">/);
assert.match(root.innerHTML, /<th-battery-card id="batc">/);
assert.doesNotMatch(root.innerHTML, /id="priceS" style="display:none"/);
assert.match(q("say"), /Solen dækker hele huset/);
assert.match(q("s-sun"), /I dag 18,4 kWh · 24 paneler/);
assert.match(q("s-grid"), /Sælger · 2,05 kr\/kWh/);
assert.match(q("s-ev"), /14 °C · 640 kWh i alt/);
assert.match(q("wx"), /6,4°/, "weather entity fallback");
assert.match(q("wx"), /<b>6,0<\/b>/, "21.6 km/h = 6.0 m/s");
assert.match(q("wx"), /<b>–<\/b><small>W\/m² sol/, "no irradiance without a sensor");
assert.match(q("ctlRows"), /Maks\. salg til net/);
assert.match(q("pPills"), /CO₂ i nettet/);
assert.match(q("tot"), /DENNE MÅNED<\/small><b>–/, "month total not configured");
assert.match(q("tot"), /BATTERI-CYKLUSSER<\/small><b>100/, "1500 kWh / 15 kWh");
assert.match(q("eco"), /Solgt i dag/);
assert.deepEqual(card._fcfg, C.flowCardConfig(config));
assert.deepEqual(card._bcfg, C.batteryCardConfig(config));
assert.ok(hass.calls.some((c) => c.ws === "history/history_during_period" && c.msg.entity_ids.includes("sensor.plant_emma_pv_output_power")));

// Sheets: the control sheet sends changes only on "Anvend", to the configured entities.
card.open("control");
const sheet = card._sheet;
sheet.connectedCallback();
const html = sheet.shadowRoot.innerHTML;
assert.match(html, /Styring/);
assert.match(html, /Maks\. salg til elnettet/);
assert.match(html, /8 800 W betyder ingen begrænsning\./, "derating help from the entity's max");
assert.match(html, /max="11000"/, "feed-in slider up to grid_max_w");
sheet._dirty = { mode: "time_of_use_luna2000", gridCh: "on", eod: "15" };
await sheet._apply();
const svc = hass.calls.filter((c) => c.domain);
assert.deepEqual(svc.map((c) => `${c.domain}.${c.service}`), ["select.select_option", "switch.turn_on", "number.set_value"]);
assert.deepEqual(svc[0].data, { entity_id: "select.plant_batteries_working_mode", option: "time_of_use_luna2000" });
assert.deepEqual(svc[1].data, { entity_id: "switch.plant_batteries_charge_from_grid" });
assert.deepEqual(svc[2].data, { entity_id: "number.plant_batteries_end_of_discharge_soc", value: 15 });
await sheet.shadowRoot.queried("#stopF").onclick();
assert.deepEqual(hass.calls.filter((c) => c.domain).at(-1), { domain: "button", service: "press", data: { entity_id: "button.plant_batteries_stop_forcible_charge" }, target: undefined });
card.open("solar"); card._sheet.connectedCallback();
assert.match(card._sheet.shadowRoot.innerHTML, /24 paneler · SUN2000/);
card.open("battery"); card._sheet.connectedCallback();
assert.match(card._sheet.shadowRoot.innerHTML, /2× LUNA2000 · ca\. 15 kWh/, "units found from the per-unit sensors");

// Minimal config: Huawei defaults, no prices, no 3D button, no name.
const minimal = await renderCard("th-energy-card", { type: "custom:th-energy-card" }, mockHass({ states: { "sun.sun": states["sun.sun"] } }));
const mh = minimal.shadowRoot.innerHTML;
assert.match(mh, /<div class="k">Energi<\/div>/);
assert.doesNotMatch(mh, /Se huset i 3D/);
assert.match(mh, /id="priceS" style="display:none"/);
assert.match(minimal.shadowRoot.queried("#say").innerHTML, /Ingen forbindelse/);
assert.match(minimal.shadowRoot.queried("#wx").innerHTML, /<b>–<\/b><small>Temperatur/);
assert.equal(globalThis.window.customCards.filter((c) => c.type === "th-energy-card").length, 1);

for (const c of [card, minimal]) disconnect(c);
console.log("th-energy-card tests passed");
process.exit(0);
