import assert from "node:assert/strict";
import { installFakeDom, mockHass, renderCard, disconnect } from "./helpers/fake-dom.mjs";

installFakeDom();
const { batterySettings, batteryPrefix, detectLayout, unitEntity, TB_BATTERY_PREFIX, TB_PACK_KWH } = await import("../src/cards/th-battery-card/config.js");
await import("../src/cards/th-battery-card/th-battery-card.js");

const H = { batteries: "bank", inverter: "plant_inverter", emma: "plant_emma", battery: "unit" };

// --- config normalisation ---
assert.equal(batteryPrefix({}), TB_BATTERY_PREFIX);
assert.equal(batteryPrefix({ huawei: { battery: "unit" } }), "unit");
assert.equal(batteryPrefix({ huawei: { battery: false } }), null);
assert.equal(batteryPrefix({ huawei: false }), null);
assert.equal(unitEntity("unit", 2, "bms_temperature"), "sensor.unit_2_bms_temperature");
assert.equal(unitEntity("unit", 1, "max_temperature", 3), "sensor.unit_1_pack_3_max_temperature");
assert.equal(unitEntity(null, 1, "state_of_capacity"), null);

const unitStates = {};
for (const i of [1, 2]) {
  unitStates[`sensor.unit_${i}_state_of_capacity`] = { state: String(60 + i) };
  for (const j of [1, 2, 3]) unitStates[`sensor.unit_${i}_pack_${j}_state_of_capacity`] = { state: String(58 + i + j) };
}
assert.deepEqual(detectLayout(unitStates, "unit"), { batteries: 2, packs: 3 });
assert.deepEqual(detectLayout(unitStates, "other"), { batteries: 0, packs: 0 });
assert.deepEqual(detectLayout(null, "unit"), { batteries: 0, packs: 0 });

let S = batterySettings({ huawei: H }, unitStates);
assert.equal(S.entities.soc, "sensor.bank_state_of_capacity");
assert.equal(S.entities.eoc, "number.plant_inverter_end_of_charge_soc");
assert.equal(S.entities.gridCh, "switch.bank_charge_from_grid");
assert.equal(S.prefix, "unit");
assert.equal(S.batteries, 2);
assert.equal(S.packs, 3);
assert.equal(S.packKwh, TB_PACK_KWH);
assert.equal(S.title, "Batterier");
S = batterySettings({ batteries: 3, packs: "2", pack_kwh: 7, title: "Lager", entities: { soc: "sensor.example_soc", mode: null } }, unitStates);
assert.deepEqual([S.batteries, S.packs, S.packKwh, S.title], [3, 2, 7, "Lager"]);
assert.equal(S.entities.soc, "sensor.example_soc", "existing entities overrides still work");
assert.equal(S.entities.mode, null);
assert.deepEqual([batterySettings(null).batteries, batterySettings(null).packs], [1, 1], "nothing found: one unit with one module");

// --- render ---
const states = {
  ...unitStates,
  "sensor.bank_state_of_capacity": 62, "sensor.bank_charge_discharge_power": 1800, "sensor.bank_rated_capacity": 30000,
  "sensor.bank_day_charge": 6.2, "sensor.bank_day_discharge": 3.1, "sensor.bank_total_discharge": 1500,
  "sensor.bank_maximum_charge_power": 10000, "sensor.bank_maximum_discharge_power": 10000, "sensor.bank_status": "Running",
  "select.bank_working_mode": "maximise_self_consumption", "number.bank_end_of_discharge_soc": 10, "number.plant_inverter_end_of_charge_soc": 100,
  "switch.bank_charge_from_grid": "off",
  "sensor.unit_1_charge_discharge_power": 900, "sensor.unit_2_charge_discharge_power": 900, "sensor.unit_1_bms_temperature": 21,
};
const hass = mockHass({ states });
const card = await renderCard("th-battery-card", { type: "custom:th-battery-card", huawei: H }, hass);
const root = card.shadowRoot;
assert.match(root.innerHTML, /<h3>Batterier<\/h3>/);
assert.match(root.innerHTML, /LUNA 1/);
assert.match(root.innerHTML, /LUNA 2/);
assert.match(root.innerHTML, /id="mp23"/, "two units with three modules each");
assert.doesNotMatch(root.innerHTML, /id="mp24"/);
assert.equal(root.queried("#kick").innerHTML, "LUNA2000 · 2 × 15 kWh");
assert.match(root.queried("#chip").innerHTML, /Lader 1,80 kW/);
assert.match(root.queried("#sub").innerHTML, /18,6 kWh<\/b> af 30 kWh/);
assert.match(root.queried("#cap2").innerHTML, /Batteri 2/);
assert.match(root.queried("#grid").innerHTML, /Maks\. eget forbrug/);
assert.match(root.queried("#grid").innerHTML, /≈ 50/, "cycles = total discharge / capacity");
assert.match(root.queried("#grid").innerHTML, /Slået fra/);
assert.equal(root.queried("#ht1").textContent, "21°");

// The control button asks the page around it to open the control sheet.
root.queried("#ctl").onclick();
const ev = card.events.find((e) => e.type === "th-battery-control");
assert.ok(ev && ev.bubbles && ev.composed);

// A new config rebuilds the towers.
card.setConfig({ type: "custom:th-battery-card", huawei: H, batteries: 1, packs: 2, title: "Lager" });
assert.match(root.innerHTML, /<h3>Lager<\/h3>/);
assert.doesNotMatch(root.innerHTML, /LUNA 2/);
assert.match(root.innerHTML, /id="mp12"/);

// Minimal configs do not throw.
const minimal = await renderCard("th-battery-card", { type: "custom:th-battery-card" }, mockHass({}));
assert.match(minimal.shadowRoot.innerHTML, /LUNA 1/);
assert.match(minimal.shadowRoot.queried("#chip").innerHTML, /Offline/);
assert.equal(globalThis.window.customCards.filter((c) => c.type === "th-battery-card").length, 1);

for (const c of [card, minimal]) disconnect(c);
console.log("th-battery-card tests passed");
process.exit(0);
