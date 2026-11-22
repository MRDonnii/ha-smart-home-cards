import assert from "node:assert/strict";
import { installFakeDom, mockHass, renderCard, disconnect } from "./helpers/fake-dom.mjs";

installFakeDom();
const {
  ENTITY_SPEC, resolveCardEntities, plantConfig, PLANT_DEFAULTS, groupDigits,
  DEFAULT_SITE, normalizeSite, defaultSigns, defaultWire, nearestOnOutline,
} = await import("../src/cards/huawei-solar-card/config.js");
const { HUAWEI_DEVICE_DEFAULTS } = await import("../src/cards/shared/huawei-solar-entities.js");
await import("../src/cards/huawei-solar-card/huawei-solar-card.js");

// ---------- entities ----------
{
  const d = resolveCardEntities({});
  assert.equal(Object.keys(d).length, Object.keys(ENTITY_SPEC).length);
  assert.equal(d.pv, `sensor.${HUAWEI_DEVICE_DEFAULTS.emma}_pv_output_power`);
  assert.equal(d.soc, `sensor.${HUAWEI_DEVICE_DEFAULTS.batteries}_state_of_capacity`);
  assert.equal(d.invSwitch, `switch.${HUAWEI_DEVICE_DEFAULTS.inverter}`);
  assert.equal(d.evTot, `sensor.${HUAWEI_DEVICE_DEFAULTS.charger}_charger_total_charged_energy`);
  assert.equal(d.sun, "sun.sun");
  for (const k of ["maxFeed", "month", "year", "price", "priceNow", "co2", "cloud", "rad", "sunH", "rain", "wind", "temp"]) assert.equal(d[k], null, k);

  const c = resolveCardEntities({
    huawei: { emma: "example_emma", inverter: "example_inverter" },
    entities: { price: "sensor.example_price", maxFeed: "number.example_feed_limit", pv: "" },
  });
  assert.equal(c.pv, null);
  assert.equal(c.load, "sensor.example_emma_load_power");
  assert.equal(c.derate, "number.example_inverter_power_derating");
  assert.equal(c.invSwitch, "switch.example_inverter");
  assert.equal(c.price, "sensor.example_price");
  assert.equal(c.maxFeed, "number.example_feed_limit");
  assert.equal(resolveCardEntities({ huawei: false }).soc, null);
}

// ---------- plant sizes ----------
{
  assert.deepEqual(plantConfig({}), { ...PLANT_DEFAULTS });
  const p = plantConfig({ name: " Example Home ", pv_capacity: "8000", max_power: 6000, string_max_power: -1, month_target: "x", charger_model: "Model X1" });
  assert.equal(p.name, "Example Home");
  assert.equal(p.pv_capacity, 8000);
  assert.equal(p.max_power, 6000);
  assert.equal(p.string_max_power, PLANT_DEFAULTS.string_max_power);
  assert.equal(p.month_target, PLANT_DEFAULTS.month_target);
  assert.equal(p.charger_model, "Model X1");
  assert.equal(groupDigits(11000), "11 000");
  assert.equal(groupDigits(950), "950");
}

// ---------- 3D site ----------
{
  const s = normalizeSite(undefined);
  assert.equal(s.blds.length, DEFAULT_SITE.blds.length);
  assert.deepEqual(Object.keys(s.signs).sort(), ["bat", "ev", "grid", "home", "pv"]);
  assert.deepEqual(Object.keys(s.via).sort(), ["ev", "grid", "home", "pv"]);
  assert.equal(s.attribution, "");
  assert.equal(s.garden, null);
  assert.deepEqual(s.tiles, { ox: 0, oy: 0, res: 1 });
  // the overhead cable meets the main building's wall nearest the pole
  const main = DEFAULT_SITE.blds.find((b) => b.id === DEFAULT_SITE.main);
  const q = nearestOnOutline(DEFAULT_SITE.pole.x, DEFAULT_SITE.pole.z, main.p);
  assert.deepEqual(s.wire, [q[0], 3.4, q[1]]);
  assert.deepEqual(nearestOnOutline(0, -5, [[-1, 0], [1, 0], [1, 2], [-1, 2]]), [0, 0]);

  // a partial custom site: positions fall back to the example, signs/via are worked out, decoration is left out
  const c = normalizeSite({
    array: { x0: 0, z0: -10, x1: 10, z1: -10, n: 10, tilt: 0.4 },
    house: { x: 2, z: 4 },
    signs: { pv: { y1: 8 } },
    via: { home: [[1, 2, 3]], ev: [[1, 2]] },
    conifers: [[0, 0], [10, 0], 1],
    tiles: { res: 0.5 },
    attribution: "Buildings © Example",
  });
  assert.deepEqual(c.cab, DEFAULT_SITE.cab);
  assert.deepEqual(c.house, { x: 2, z: 4 });
  assert.equal(c.blds.length, 0);
  assert.equal(c.trees.length, 0);
  assert.equal(c.paint.road, null);
  assert.equal(c.conifers, null);
  assert.deepEqual(c.tiles, { ox: 0, oy: 0, res: 0.5 });
  assert.deepEqual(c.signs.pv, { ...defaultSigns(c).pv, y1: 8 });
  assert.deepEqual(c.signs.home, { x: 2, z: 4, y0: 6.5, y1: 12.5 });
  assert.deepEqual(c.via.home, [[1, 2, 3]]);
  assert.equal(c.via.ev.length, 1, "an invalid via list falls back to the computed one");
  assert.deepEqual(c.wire, defaultWire(c));
  assert.deepEqual(c.wire, [2, 3.6, 4]);
  assert.equal(c.attribution, "Buildings © Example");
}

// ---------- render ----------
const H = HUAWEI_DEVICE_DEFAULTS;
const id = (device, domain, suffix) => (suffix ? `${domain}.${H[device]}_${suffix}` : `${domain}.${H[device]}`);
const states = {
  [id("emma", "sensor", "pv_output_power")]: { state: "4200" },
  [id("emma", "sensor", "load_power")]: { state: "1300" },
  [id("emma", "sensor", "inverter_active_power")]: { state: "2600" },
  [id("batteries", "sensor", "charge_discharge_power")]: { state: "1500" },
  [id("batteries", "sensor", "state_of_capacity")]: { state: "64" },
  [id("emma", "sensor", "pv_yield_today")]: { state: "18.4" },
  [id("emma", "sensor", "consumption_today")]: { state: "9.1" },
  [id("emma", "sensor", "supply_from_grid_today")]: { state: "1.2" },
  [id("emma", "sensor", "feed_in_to_grid_today")]: { state: "6.3" },
  [id("inverter", "sensor", "alarms")]: { state: "None" },
  [id("inverter", "switch", "")]: { state: "on" },
  [id("inverter", "number", "power_derating")]: { state: "11000", attributes: { min: 0, max: 11000, step: 1, unit_of_measurement: "W" } },
  [id("batteries", "switch", "charge_from_grid")]: { state: "off" },
  [id("batteries", "number", "end_of_discharge_soc")]: { state: "10", attributes: { min: 0, max: 20, step: 1 } },
  [id("batteries", "select", "working_mode")]: { state: "maximise_self_consumption", attributes: { options: ["maximise_self_consumption", "time_of_use_luna2000"] } },
  [id("batteries", "sensor", "forcible_charge")]: { state: "Charging" },
  [id("charger", "sensor", "charger_total_charged_energy")]: { state: "812.4" },
  "sun.sun": { state: "above_horizon", attributes: { elevation: 32, azimuth: 175 } },
  "sensor.example_price": { state: "1.85", attributes: { today_mean: 2.1, raw_today: [], raw_tomorrow: [] } },
};
const hass = () => mockHass({ states, ws: { "history/history_during_period": {} } });

{
  const card = await renderCard("huawei-solar-card", { type: "custom:huawei-solar-card" }, hass());
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /Solcelleanlæg · Huawei/);
  assert.match(html, /Batteri · LUNA2000/);
  assert.doesNotMatch(html, /Elpris inkl\. afgifter/, "no price block without a price entity");
  assert.equal(card.shadowRoot.queried("#tPVs").textContent, "42 % af kapacitet");
  assert.equal(card.shadowRoot.queried("#sMonth").textContent, "–");
  assert.ok(card.getCardSize() > 0);
  assert.equal(card.eid("maxFeed"), null);
  assert.equal(card.s("price"), undefined);
  assert.ok(card._hass.calls.some((c) => c.ws === "history/history_during_period"));

  // popups: control applies the changes through the right services; stop forcible charge presses the button
  card.openPopup("control");
  const p = card._popup;
  p.connectedCallback();
  p.hass = card._hass;
  assert.match(p.shadowRoot.queried("#body").innerHTML, /Minimum ladestand/);
  p._dirty = { gridCh: "on", eod: "15", mode: "time_of_use_luna2000" };
  await p._apply();
  const calls = card._hass.calls.filter((c) => c.domain);
  assert.deepEqual(calls.find((c) => c.domain === "switch").data, { entity_id: id("batteries", "switch", "charge_from_grid") });
  assert.equal(calls.find((c) => c.domain === "switch").service, "turn_on");
  assert.deepEqual(calls.find((c) => c.domain === "number").data, { entity_id: id("batteries", "number", "end_of_discharge_soc"), value: 15 });
  assert.deepEqual(calls.find((c) => c.domain === "select").data, { entity_id: id("batteries", "select", "working_mode"), option: "time_of_use_luna2000" });
  await p.shadowRoot.queried("#stopForc").onclick();
  assert.ok(card._hass.calls.some((c) => c.domain === "button" && c.service === "press" && c.data.entity_id === id("batteries", "button", "stop_forcible_charge")));

  // inverter popup: the limit text follows max_power; grid popup has no feed-in slider without its entity
  for (const [kind, check] of [
    ["inverter", (b) => assert.match(b, /11 000 W = ingen begrænsning/)],
    ["grid", (b) => { assert.doesNotMatch(b, /Maks\. salg til elnettet/); assert.match(b, /Elpris nu<\/span><b >–/); }],
    ["ev", (b) => assert.doesNotMatch(b, /Model/)],
  ]) {
    card.openPopup(kind); card._popup.connectedCallback(); card._popup.hass = card._hass;
    check(card._popup.shadowRoot.queried("#body").innerHTML);
  }
  disconnect(card);
}

{
  const card = await renderCard("huawei-solar-card", {
    type: "custom:huawei-solar-card", section: "side", max_power: 6000, charger_model: "Example Charger 11",
    entities: { price: "sensor.example_price", maxFeed: id("inverter", "number", "power_derating") },
  }, hass());
  assert.match(card.shadowRoot.innerHTML, /Elpris inkl\. afgifter/);
  assert.equal(card.shadowRoot.queried("#priceNow").textContent, "1,85");
  card.openPopup("inverter"); card._popup.connectedCallback(); card._popup.hass = card._hass;
  const inv = card._popup.shadowRoot.queried("#body").innerHTML;
  assert.match(inv, /6 000 W = ingen begrænsning/);
  assert.match(inv, /max="6000"/);
  card.openPopup("grid"); card._popup.connectedCallback(); card._popup.hass = card._hass;
  assert.match(card._popup.shadowRoot.queried("#body").innerHTML, /Maks\. salg til elnettet/);
  card.openPopup("ev"); card._popup.connectedCallback(); card._popup.hass = card._hass;
  assert.match(card._popup.shadowRoot.queried("#body").innerHTML, /Example Charger 11/);
  disconnect(card);
}

{
  const card = await renderCard("huawei-solar-card", { type: "custom:huawei-solar-card", section: "3d", name: "Example Home", site: { attribution: "Buildings © Example" } }, hass());
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /Example Home · live/);
  assert.match(html, /Buildings © Example/);
  assert.match(html, /id="lab-pv"/);
  assert.doesNotMatch(html, /SIDSTE 24 TIMER|Sidste 24 timer/);
  assert.equal(card.getCardSize(), 8);
  disconnect(card);
}

// minimal / odd configs do not throw
{
  const Ctor = customElements.get("huawei-solar-card");
  const c = new Ctor();
  c.setConfig({});
  c.setConfig({ type: "custom:huawei-solar-card", site: null, entities: [], huawei: "x" });
  assert.deepEqual(Ctor.getStubConfig(), { section: "all" });
  assert.ok(customElements.get("huawei-solar-popup"));
  assert.ok(window.customCards.some((x) => x.type === "huawei-solar-card"));
  const card = await renderCard("huawei-solar-card", { type: "custom:huawei-solar-card", section: "main", huawei: false }, mockHass({ states: {} }));
  assert.match(card.shadowRoot.innerHTML, /SOLCELLER/);
  disconnect(card);
}

console.log("huawei-solar-card tests passed");
process.exit(0);
