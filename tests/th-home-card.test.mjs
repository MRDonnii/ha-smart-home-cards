// th-home-card: config normalisation + render smoke tests with example data (node tests/th-home-card.test.mjs).
import assert from "node:assert/strict";
import { installFakeDom, mockHass, renderCard, disconnect } from "./helpers/fake-dom.mjs";

installFakeDom();
const { normalizeConfig, normalizePrice, normalizeRoom, definiteForm, entityList } = await import("../src/cards/th-home-card/config.js");
await import("../src/cards/th-home-card/th-home-card.js");

// ---------------------------------------------------------------- config
{
  const c = normalizeConfig({});
  assert.equal(c.energy, "/energy");
  assert.equal(c.price, null, "no price without config");
  assert.equal(c.alarm, null);
  assert.equal(c.lock, null);
  assert.deepEqual(c.rooms, []);
  assert.deepEqual(c.doors, []);
  assert.equal(c.freezer, null);
  assert.ok(c.ent.pv.startsWith("sensor.emma_") && c.ent.pv.endsWith("_pv_output_power"), "Huawei default names");
  assert.ok(c.ent.battery_soc.startsWith("sensor.batteries_"));
  assert.equal(c.ent.sunshine_hours, null, "non-Huawei values have no default");

  const h = normalizeConfig({ huawei: { emma: "example_emma", batteries: "example_battery" }, entities: { sunshine_hours: "sensor.example_sunshine" } });
  assert.equal(h.ent.pv, "sensor.example_emma_pv_output_power");
  assert.equal(h.ent.battery_power, "sensor.example_battery_charge_discharge_power");
  assert.equal(h.ent.sunshine_hours, "sensor.example_sunshine");
  assert.equal(normalizeConfig({ huawei: false }).ent.pv, null);
  assert.equal(normalizeConfig({ energy: false }).energy, null);
  assert.equal(normalizeConfig({ energy: "/dashboard-energy/0" }).energy, "/dashboard-energy/0");
}
{
  assert.equal(normalizePrice(null), null);
  assert.equal(normalizePrice(false), null);
  assert.equal(normalizePrice({ title: "x" }), null, "a price needs an entity");
  const p = normalizePrice({ stromligning: "example_prices" });
  assert.equal(p.title, "Strømligning");
  assert.equal(p.current, "sensor.example_prices_current_price_vat");
  assert.equal(p.mean, "sensor.example_prices_today_mean_vat");
  assert.equal(p.tomorrow, "binary_sensor.example_prices_tomorrow_available_vat");
  assert.equal(p.forecast, "sensor.example_prices_forecasts_vat");
  assert.equal(p.components.length, 6);
  assert.deepEqual(p.components[0], { name: "Spotpris", entity: "sensor.example_prices_spotprice_vat", color: "#e8c37e" });
  const q = normalizePrice({ current: "sensor.example_price", fallback: "sensor.example_price_2", title: "Min pris", components: [{ entity: "sensor.example_tariff", name: "Tarif" }] });
  assert.equal(q.current, "sensor.example_price");
  assert.equal(q.fallback, "sensor.example_price_2");
  assert.equal(q.title, "Min pris");
  assert.equal(q.components[0].color, "#e8c37e", "default colour");
  assert.equal(normalizePrice("sensor.example_price").current, "sensor.example_price");
}
{
  assert.equal(definiteForm("Hoveddør"), "hoveddøren");
  assert.equal(definiteForm("Garage"), "garagen");
  const c = normalizeConfig({ lock: "lock.front_door", alarm: { entity: "alarm_control_panel.home_alarm", name: "Example Alarm" } });
  assert.deepEqual(c.lock, { entity: "lock.front_door", name: "Hoveddør", definite: "hoveddøren" });
  assert.deepEqual(normalizeConfig({ lock: { entity: "lock.back", name: "Bagdør" } }).lock.definite, "bagdøren");
  assert.equal(normalizeConfig({ lock: { entity: "lock.shed", name: "Skur", name_definite: "skuret" } }).lock.definite, "skuret");
  assert.equal(c.alarm.name, "Example Alarm");
  assert.deepEqual(entityList(["light.a", { entity: "light.b", name: "B" }, { name: "no entity" }]), [{ entity: "light.a", name: null }, { entity: "light.b", name: "B" }]);
  const r = normalizeRoom({ name: "Room 1", temperature: "sensor.room_1_temperature", outdoor: true, lights: ["light.room_1"] }, 0);
  assert.equal(r.id, "r0");
  assert.equal(r.icon, "home");
  assert.equal(r.out, true);
  assert.equal(r.temp, "sensor.room_1_temperature");
  assert.deepEqual(r.lights, [{ entity: "light.room_1", name: null }]);
  // temperatures default to the rooms' sensors plus the freezer
  const t = normalizeConfig({ rooms: [{ name: "Room 1", temperature: "sensor.room_1_temperature" }, { name: "Room 2" }], freezer: "sensor.example_freezer" });
  assert.deepEqual(t.temps.map((x) => [x.entity, x.kind]), [["sensor.room_1_temperature", "in"], ["sensor.example_freezer", "freezer"]]);
  assert.equal(t.freezer.max, -15);
  assert.equal(normalizeConfig({ temperatures: [{ entity: "sensor.x", kind: "freezer" }, "sensor.y"] }).temps[1].kind, "in");
}

// ---------------------------------------------------------------- render
const ago = (min) => new Date(Date.now() - min * 6e4).toISOString();
const slots = Array.from({ length: 96 }, (_, i) => { const t = new Date(); t.setHours(0, 0, 0, 0); const s = new Date(t.getTime() + i * 9e5); return { start: s.toISOString(), end: new Date(s.getTime() + 9e5).toISOString(), price: 1.5 + Math.sin(i / 10) }; });
const states = {
  "sun.sun": { state: "above_horizon", attributes: { elevation: 12, next_rising: new Date(Date.now() + 18 * 36e5).toISOString(), next_setting: new Date(Date.now() + 3 * 36e5).toISOString() } },
  "sensor.example_emma_pv_output_power": "2400", "sensor.example_emma_load_power": "900", "sensor.example_emma_inverter_active_power": "2100",
  "sensor.example_battery_charge_discharge_power": "800", "sensor.example_battery_state_of_capacity": "64", "sensor.example_emma_pv_yield_today": "8.4",
  "sensor.example_price": { state: "1.82", attributes: { prices: slots } }, "sensor.example_price_mean": "1.6", "sensor.example_tariff": "0.41",
  "alarm_control_panel.home_alarm": "armed_away", "lock.front_door": "locked",
  "binary_sensor.front_door": { state: "off", last_changed: ago(30) }, "binary_sensor.terrace_door": { state: "on", last_changed: ago(2) },
  "sensor.living_room_temperature": "21.5", "sensor.living_room_humidity": "45", "sensor.bedroom_temperature": "19.2", "sensor.outdoor_temperature": "6.1",
  "sensor.example_freezer": "-18", "light.living_room": "on", "light.living_room_lamp": "off", "light.garden": "on", "switch.flag": "off",
  "media_player.living_room_tv": "playing",
};
const config = {
  type: "custom:th-home-card",
  huawei: { emma: "example_emma", batteries: "example_battery" },
  price: { current: "sensor.example_price", mean: "sensor.example_price_mean", title: "Example", components: [{ name: "Tarif", entity: "sensor.example_tariff" }] },
  alarm: { entity: "alarm_control_panel.home_alarm", name: "Example Alarm" },
  lock: "lock.front_door",
  doors: [{ entity: "binary_sensor.front_door", name: "Hoveddør" }, { entity: "binary_sensor.terrace_door", name: "Terrassedør" }],
  climate: { entity: "sensor.living_room_temperature", label: "i stuen", sensors: [{ entity: "sensor.bedroom_temperature", name: "Soveværelse" }, { entity: "sensor.outdoor_temperature", name: "Udenfor" }] },
  freezer: "sensor.example_freezer",
  rooms: [
    { name: "Stue", icon: "sofa", temperature: "sensor.living_room_temperature", humidity: "sensor.living_room_humidity", door: "binary_sensor.terrace_door", media_player: "media_player.living_room_tv",
      lights: [{ entity: "light.living_room", name: "Loftlampe" }, { entity: "light.living_room_lamp", name: "Lampe" }] },
    { name: "Have", icon: "tree", outdoor: true, lights: [{ entity: "light.garden", name: "Have" }, { entity: "switch.flag", name: "Flag" }] },
  ],
};
const hass = mockHass({ states });
const card = await renderCard("th-home-card", config, hass);
const root = card.shadowRoot;
assert.match(root.innerHTML, /Elpris · Example/);
assert.match(root.innerHTML, />i stuen</);
assert.match(root.queried("#rlist").innerHTML, /Stue/);
assert.match(root.queried("#rlist").innerHTML, /21,5°/);
assert.match(root.queried("#rlist").innerHTML, /1 lys/);
assert.doesNotMatch(root.queried("#rlist").innerHTML, /Have/, "outdoor rooms are on the Ude tab");
assert.equal(root.queried("#sikBig").innerHTML, "Til · ude");
assert.equal(root.queried("#sikSub").innerHTML, "Hoveddør låst");
assert.match(root.queried("#dl").innerHTML, /class="o"><i><\/i>Terrassedør/);
assert.match(root.queried("#kl").innerHTML, /Udenfor/);
assert.match(root.queried("#frz").innerHTML, /Fryser .*18,0° · OK/);
assert.match(root.queried("#pNow").innerHTML, /1,82/);
assert.match(root.queried("#plg").innerHTML, /Tarif 0,41/);
assert.match(root.queried("#days").innerHTML, /I dag/);
assert.match(root.queried("#say").innerHTML, /8,4 kWh/);

// the Ude tab
card._rtab = "out"; card._rk = null; card._update();
assert.match(root.queried("#rlist").innerHTML, /Have/);

// sheets: room, lights (all off), alarm, code → service calls
card.open("room", { room: card._c.rooms[0] });
let sheet = card._sheet; sheet.connectedCallback();
assert.match(sheet.shadowRoot.innerHTML, /Luftfugtighed/);
assert.match(sheet.shadowRoot.innerHTML, /Spiller/);
assert.match(sheet.shadowRoot.innerHTML, /Loftlampe/);
card.toggle("light.living_room");
assert.deepEqual(hass.calls.at(-1), { domain: "light", service: "toggle", data: { entity_id: "light.living_room" }, target: undefined });
card.toggle("switch.flag");
assert.equal(hass.calls.at(-1).domain, "switch");

card.open("lights");
sheet = card._sheet; sheet.connectedCallback();
assert.match(sheet.shadowRoot.innerHTML, /Sluk alle indendørs lys/);
hass.calls.length = 0;
sheet.allOff();
assert.deepEqual(hass.calls.map((c) => c.data.entity_id), ["light.living_room"], "only lit indoor lights");

card.open("temps");
sheet = card._sheet; sheet.connectedCallback();
assert.match(sheet.shadowRoot.innerHTML, /Temperaturer/);
assert.match(sheet.shadowRoot.innerHTML, /Stue/);

card.open("alarm");
sheet = card._sheet; sheet.connectedCallback();
assert.match(sheet.shadowRoot.innerHTML, /Example Alarm/);
assert.match(sheet.shadowRoot.innerHTML, /Lås hoveddøren op/);
assert.match(sheet.shadowRoot.innerHTML, /Terrassedør/);
sheet.kind = "code"; sheet.opts = { action: "unlock" }; sheet._code = "1234"; sheet._render(true);
assert.match(sheet.shadowRoot.innerHTML, /Koden sendes direkte til låsen/);
hass.calls.length = 0;
await sheet.submit();
assert.deepEqual(hass.calls[0], { domain: "lock", service: "unlock", data: { entity_id: "lock.front_door", code: "1234" }, target: undefined });
sheet.kind = "code"; sheet.opts = { action: "arm_home" }; sheet._code = ""; sheet._render(true);
assert.match(sheet.shadowRoot.innerHTML, /Koden sendes direkte til Example Alarm/);
await sheet.submit();
assert.deepEqual(hass.calls[1], { domain: "alarm_control_panel", service: "alarm_arm_home", data: { entity_id: "alarm_control_panel.home_alarm" }, target: undefined });
disconnect(card);

// ---------------------------------------------------------------- minimal config does not throw
const minimal = await renderCard("th-home-card", { type: "custom:th-home-card" }, mockHass());
assert.match(minimal.shadowRoot.queried("#rlist").innerHTML, /Ingen rum sat op/);
assert.equal(minimal.shadowRoot.queried("#sikBig").innerHTML, "–");
assert.equal(minimal.shadowRoot.queried("#klBig").innerHTML, "–");
assert.match(minimal.shadowRoot.innerHTML, /animation-delay:90ms;display:none/, "price tile hidden");
minimal.open("alarm"); minimal._sheet.connectedCallback();
minimal.setConfig({ type: "custom:th-home-card", huawei: false, rooms: [{ name: "Room 1" }] });
assert.match(minimal.shadowRoot.innerHTML, /id="tSol" role="button" tabindex="0" style="display:none"/, "solar tile hidden without PV");
assert.ok(customElements.get("th-home-sheet"));
assert.ok(window.customCards.some((c) => c.type === "th-home-card"));
disconnect(minimal);

console.log("th-home-card tests passed");
process.exit(0);
