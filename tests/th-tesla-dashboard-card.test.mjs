import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const filename = new URL("../src/cards/th-tesla-dashboard-card/th-tesla-dashboard-card.js", import.meta.url);
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
  window: { customCards: [] },
  console: { info() {}, warn() {} },
  Intl,
  Date,
  encodeURIComponent,
  requestAnimationFrame() {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};

vm.runInNewContext(source, context, { filename: filename.pathname });
const Card = registry.get("th-tesla-dashboard-card");
assert.ok(Card, "th-tesla-dashboard-card should register");
assert.equal(context.window.customCards.filter((card) => card.type === "th-tesla-dashboard-card").length, 1, "card picker entry registered once");

const s = (state, attributes = {}) => ({ state: String(state), attributes, last_updated: new Date().toISOString() });
const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();

const config = {
  name: "Bil",
  vehicle: { model: "Tesla Model 3 RWD" },
  location_entity: "device_tracker.car",
  entities: {
    battery: "sensor.battery", range: "sensor.range", odometer: "sensor.odometer",
    temperature_inside: "sensor.inside", temperature_outside: "sensor.outside", last_update: "sensor.last_update",
    online: "binary_sensor.online", asleep: "binary_sensor.asleep", charger: "binary_sensor.charger", charging: "binary_sensor.charging",
    charging_rate: "sensor.rate", charger_power: "sensor.power", charger_mode: "sensor.mode",
    charging_finish_time: "sensor.finish", charging_time_remaining: "sensor.remaining", charging_price_estimate: "sensor.estimate",
    tpms_front_left: "sensor.fl", tpms_front_right: "sensor.fr", tpms_rear_left: "sensor.rl", tpms_rear_right: "sensor.rr",
    best_charge_start: "sensor.best_start", best_charge_end: "sensor.best_end", best_charge_price: "sensor.best_price",
    charge_minutes_needed: "sensor.minutes", missing_wall_kwh: "sensor.missing",
    efficiency_score: "sensor.score", trips: "sensor.trips", last_trip: "sensor.last_trip", total_distance: "sensor.total",
    cost_per_km: "sensor.cost_km", monthly_performance: "sensor.monthly", charges: "sensor.charges",
    last_charge: "sensor.last_charge", charges_needing_price: "sensor.no_price", daily_energy: "sensor.daily",
    monta_state: "sensor.monta", monta_last_charge: "sensor.monta_last", monta_wallet: "sensor.wallet",
    monta_charge_energy: "sensor.monta_energy", monta_cable_connected: "binary_sensor.cable",
  },
  controls: {
    start_charge: { entity: "switch.start_stop" }, stop_charge: { entity: "switch.start_stop" },
    target_soc: { entity: "input_number.target" }, deadline: { entity: "input_datetime.ready_by" },
  },
  tpms: { unit: "bar" },
};

function baseStates() {
  const month = new Date().toISOString().slice(0, 7);
  return {
    "sensor.battery": s(72, { unit_of_measurement: "%" }),
    "sensor.range": s("318.4", { unit_of_measurement: "km" }),
    "sensor.odometer": s("172458.3", { unit_of_measurement: "km" }),
    "sensor.inside": s("21", { unit_of_measurement: "°C" }),
    "sensor.outside": s("4", { unit_of_measurement: "°C" }),
    "sensor.last_update": s(iso(5)),
    "binary_sensor.online": s("on", { state: "online" }),
    "binary_sensor.asleep": s("off"),
    "binary_sensor.charger": s("off", { charging_state: "Disconnected" }),
    "binary_sensor.charging": s("off"),
    "sensor.rate": s("0", { unit_of_measurement: "km/h" }),
    "sensor.power": s("0", { unit_of_measurement: "kW" }),
    "sensor.mode": s("disconnected"),
    "sensor.finish": s(""),
    "sensor.remaining": s(""),
    "sensor.estimate": s("28.83", { unit_of_measurement: "kr", estimated_kwh_needed: 17.2, current_price: 1.67 }),
    "sensor.fl": s("40.6", { unit_of_measurement: "psi" }),
    "sensor.fr": s("40.6", { unit_of_measurement: "psi" }),
    "sensor.rl": s("40.6", { unit_of_measurement: "psi" }),
    "sensor.rr": s("40.6", { unit_of_measurement: "psi" }),
    "sensor.best_start": s("01:15"),
    "sensor.best_end": s("04:42"),
    "sensor.best_price": s("17.89", { unit_of_measurement: "kr" }),
    "sensor.minutes": s("207", { unit_of_measurement: "min" }),
    "sensor.missing": s("24.8", { unit_of_measurement: "kWh" }),
    "sensor.score": s("128", { unit_of_measurement: "%" }),
    "sensor.trips": s("126"),
    "sensor.last_trip": s("12.4", { unit_of_measurement: "km", started_at: iso(40), ended_at: iso(22) }),
    "sensor.total": s("28453.2", { unit_of_measurement: "km" }),
    "sensor.cost_km": s("0.42", { unit_of_measurement: "DKK/km" }),
    "sensor.monthly": s("112", { unit_of_measurement: "%", months: [{ month, distance_km: 842.4 }] }),
    "sensor.charges": s("48"),
    "sensor.last_charge": s("2.41", { unit_of_measurement: "DKK", kwh: 6.97, price: 2.41, price_currency: "DKK", started_at: iso(300), ended_at: iso(249), start_battery_pct: 88, end_battery_pct: 99, location_name: "Home" }),
    "sensor.no_price": s("2"),
    "sensor.daily": s("10.6", { unit_of_measurement: "km" }),
    "sensor.monta": s("available"),
    "sensor.monta_last": s("completed", { consumedKwh: 7.11, cost: 2.45, currency: { identifier: "dkk" }, startedAt: iso(300), stoppedAt: iso(0) }),
    "sensor.wallet": s("245.3694", { unit_of_measurement: "DKK" }),
    "sensor.monta_energy": s("7.11", { unit_of_measurement: "kWh" }),
    "binary_sensor.cable": s("off"),
    "switch.start_stop": s("off"),
    "input_number.target": s("80", { min: 50, max: 100, step: 1 }),
    "input_datetime.ready_by": s("06:45:00", { has_date: false, has_time: true }),
    "device_tracker.car": s("home", { latitude: 56.1, longitude: 10.2 }),
  };
}

function card(states, cfg = config) {
  const instance = new Card();
  instance.setConfig(cfg);
  instance._hass = { states, locale: { language: "da", number_format: "language", time_format: "24" }, config: { time_zone: "Europe/Copenhagen" } };
  return instance;
}

const model = (states, cfg) => card(states, cfg)._model();

/** Collect every string of the view model, so no "undefined", "NaN" or "null" can reach the screen. */
function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => strings(item, out));
  return out;
}
function assertClean(result, label) {
  for (const text of strings(result)) assert.doesNotMatch(text, /undefined|NaN|null|\[object/, `${label}: ${text}`);
}

// Tesla online, not connected.
let states = baseStates();
let result = model(states);
assertClean(result, "online");
assert.equal(result.status.key, "online");
assert.equal(result.hero.status, "Online");
assert.equal(result.hero.soc, "72");
assert.equal(result.hero.range, "318 km");
assert.equal(result.hero.odometer, "172.458 km");
assert.equal(result.charge.badge.text, "Ikke tilsluttet");
assert.equal(result.charge.target, "Mål 80 %");
assert.equal(result.charge.startVisible, false, "no start button when not plugged");
assert.equal(result.charge.stopVisible, false);
assert.equal(result.charge.finish, "—");
assert.equal(result.charge.remaining, "—");
assert.equal(result.plan.bestStart, "01:15");
assert.equal(result.plan.bestEnd, "04:42");
assert.equal(result.plan.bestPrice, "17,89 kr.");
assert.equal(result.plan.missing, "24,8 kWh");
assert.equal(result.plan.minutes, "3 t 27 min");
assert.equal(result.plan.applyVisible, false, "unconfigured apply_plan stays hidden");
assert.equal(result.plan.soc.value, 80);
assert.equal(result.plan.deadline.editable, true);
assert.equal(result.plan.deadline.text, "06:45");
assert.equal(result.tpms.tires.FL.text, "2,8 bar", "psi converted to bar from unit_of_measurement");
assert.equal(result.tpms.tires.FL.tone, "ok");
assert.equal(result.drive.month, "842 km");
assert.equal(result.drive.total, "28.453 km");
assert.equal(result.drive.trips, "126");
assert.equal(result.drive.lastTrip, "12,4 km");
assert.match(result.drive.lastTripMeta, /18 min$/);
assert.equal(result.econ.costKm, "0,42 kr/km");
assert.equal(result.econ.noPriceTone, "warn");
assert.equal(result.econ.wallet, "245,37 kr.");
assert.equal(result.last.kwh, "6,97 kWh");
assert.equal(result.last.price, "2,41 kr.");
assert.equal(result.last.duration, "51 min");
assert.equal(result.last.montaLine, "Monta: 7,11 kWh · 2,45 kr.");
assert.equal(result.map.empty, null);

// Asleep and offline.
states = baseStates();
states["binary_sensor.online"] = s("off", { state: "asleep" });
states["binary_sensor.asleep"] = s("on");
assert.equal(model(states).status.label, "Sover");
states["binary_sensor.online"] = s("off", { state: "offline" });
states["binary_sensor.asleep"] = s("off");
assert.equal(model(states).status.label, "Offline");

// Cable connected, idle -> "Tilsluttet"; start button offered, stop hidden.
states = baseStates();
states["binary_sensor.cable"] = s("on");
states["sensor.monta"] = s("busy");
result = model(states);
assert.equal(result.status.label, "Tilsluttet");
assert.match(result.charge.sub, /^Kabel tilsluttet/);
assert.equal(result.charge.startVisible, true);
assert.equal(result.charge.stopVisible, false);

// Connected but not charging: car requesting, and scheduled.
states["sensor.mode"] = s("connected_requesting");
assert.equal(model(states).status.label, "Klar til opladning");
states["sensor.monta"] = s("busy-scheduled");
result = model(states);
assert.equal(result.status.label, "Venter på opladning");
assert.equal(result.charge.stopVisible, true, "a scheduled Monta charge can be stopped");
assert.equal(result.charge.startVisible, true, "start overrides the schedule");

// Plugged per Zaptec before Monta notices: start is offered from the fastest signal.
states = baseStates();
states["sensor.mode"] = s("connected_requesting");
result = model(states);
assert.equal(result.charge.startVisible, true, "Zaptec plug signal is enough");
assert.match(result.charge.sub, /^Kabel tilsluttet/, "stale Monta cable sensor does not override Zaptec");

// Monta reports the switch as on while idle-plugged ("busy"): start must still be offered.
states["sensor.monta"] = s("busy-non-charging");
states["switch.start_stop"] = s("on");
assert.equal(model(states).charge.startVisible, true);

// Script controls: busy while the script runs.
const scriptConfig = { ...config, controls: { ...config.controls, start_charge: { entity: "script.start" }, stop_charge: { entity: "script.stop" } } };
states["script.start"] = s("on");
states["script.stop"] = s("off");
result = model(states, scriptConfig);
assert.equal(result.charge.startVisible, true);
assert.equal(result.charge.startBusy, true, "running start script shows progress");
assert.equal(result.charge.stopBusy, false);

// Active charging.
states = baseStates();
states["binary_sensor.cable"] = s("on");
states["binary_sensor.charging"] = s("on");
states["binary_sensor.charger"] = s("on", { charging_state: "Charging" });
states["sensor.monta"] = s("busy-charging");
states["sensor.mode"] = s("connected_charging");
states["sensor.power"] = s("10.84", { unit_of_measurement: "kW" });
states["sensor.rate"] = s("42", { unit_of_measurement: "km/h" });
states["sensor.finish"] = s("04:42");
states["sensor.remaining"] = s("136", { unit_of_measurement: "min" });
states["switch.start_stop"] = s("on");
result = model(states);
assertClean(result, "charging");
assert.equal(result.status.label, "Lader");
assert.equal(result.charge.active, true);
assert.equal(result.charge.sub, "Kabel tilsluttet · Lader via Monta");
assert.equal(result.charge.power, "10,8 kW");
assert.equal(result.charge.rate, "+42 km/t");
assert.equal(result.charge.finish, "04:42");
assert.equal(result.charge.remaining, "2 t 16 min");
assert.equal(result.charge.startVisible, false);
assert.equal(result.charge.stopVisible, true);

// Charging complete.
states = baseStates();
states["binary_sensor.cable"] = s("on");
states["binary_sensor.charger"] = s("on", { charging_state: "Complete" });
states["sensor.mode"] = s("connected_finished");
states["sensor.battery"] = s("80", { unit_of_measurement: "%" });
assert.equal(model(states).status.label, "Opladning færdig");

// Monta unavailable.
states = baseStates();
states["sensor.monta"] = s("unavailable");
states["sensor.monta_last"] = s("unavailable");
states["sensor.wallet"] = s("unavailable");
result = model(states);
assertClean(result, "monta unavailable");
assert.equal(result.charge.monta, "Ikke tilgængelig");
assert.equal(result.econ.wallet, "—");

// Tesla entities unavailable.
states = baseStates();
for (const id of ["sensor.battery", "sensor.range", "sensor.odometer", "sensor.inside", "sensor.outside", "sensor.last_update", "binary_sensor.online", "binary_sensor.asleep", "binary_sensor.charger", "binary_sensor.charging"]) states[id] = s("unavailable");
states["sensor.mode"] = s("unknown");
states["sensor.monta"] = s("unavailable");
states["binary_sensor.cable"] = s("unavailable");
result = model(states);
assertClean(result, "tesla unavailable");
assert.equal(result.status.label, "Ukendt");
assert.equal(result.hero.soc, "—");
assert.equal(result.hero.socKnown, false);
assert.equal(result.charge.soc, "—");
assert.equal(result.charge.badge.text, "Ukendt");

// EV Ledger sensors missing entirely.
states = baseStates();
for (const id of ["sensor.score", "sensor.trips", "sensor.last_trip", "sensor.total", "sensor.cost_km", "sensor.monthly", "sensor.charges", "sensor.last_charge", "sensor.no_price"]) delete states[id];
result = model(states);
assertClean(result, "ledger missing");
assert.equal(result.drive.month, "—");
assert.equal(result.drive.lastTripMeta, "");
assert.equal(result.econ.noPriceTone, null);
assert.equal(result.last.source, "monta_last_charge", "falls back to Monta last charge");
assert.equal(result.last.kwh, "7,11 kWh");

// Location unavailable, missing and not configured.
states = baseStates();
states["device_tracker.car"] = s("unavailable");
assert.equal(model(states).map.empty, "Placering ikke tilgængelig");
delete states["device_tracker.car"];
assert.equal(model(states).map.empty, "Placeringen findes ikke i Home Assistant");
assert.equal(model(states, { ...config, location_entity: undefined }).map.empty, "Ingen placering konfigureret");

// TPMS unavailable and low pressure.
states = baseStates();
states["sensor.fl"] = s("unavailable");
states["sensor.rr"] = s("30", { unit_of_measurement: "psi" });
states["sensor.rl"] = s("2.4", { unit_of_measurement: "bar" });
result = model(states);
assert.equal(result.tpms.tires.FL.text, "—");
assert.equal(result.tpms.tires.FL.tone, "muted");
assert.equal(result.tpms.tires.RR.tone, "crit", "30 psi = 2.07 bar is critical");
assert.equal(result.tpms.tires.RL.tone, "warn");
assert.equal(result.tpms.tires.RL.status, "Lavt tryk");

// Battery 0 % and 100 %, low and critical tones.
states = baseStates();
states["sensor.battery"] = s("0", { unit_of_measurement: "%" });
result = model(states);
assert.equal(result.hero.soc, "0");
assert.equal(result.hero.socPercent, 0);
assert.equal(result.hero.socTone, "crit");
states["sensor.battery"] = s("100", { unit_of_measurement: "%" });
result = model(states);
assert.equal(result.hero.socPercent, 100);
assert.equal(result.hero.socTone, "ok");
states["sensor.battery"] = s("15", { unit_of_measurement: "%" });
assert.equal(model(states).hero.socTone, "warn");

// Very long values stay strings (CSS ellipsis handles them) and never break the model.
states = baseStates();
states["sensor.monta"] = s("some_really_long_vendor_specific_state_value_that_nobody_expected");
states["sensor.best_start"] = s("Ingen billig periode fundet inden deadline");
result = model(states);
assertClean(result, "long values");
assert.equal(result.plan.bestStart, "—", "non-clock text is not shown as a time");
assert.equal(result.plan.badge.text, "Ingen gyldig plan");

// Missing controls: no dead buttons.
states = baseStates();
states["binary_sensor.cable"] = s("on");
delete states["switch.start_stop"];
delete states["input_number.target"];
delete states["input_datetime.ready_by"];
result = model(states);
assert.equal(result.charge.startVisible, false);
assert.equal(result.plan.soc, null);
assert.equal(result.plan.deadline.editable, false);
states["switch.start_stop"] = s("unavailable");
assert.equal(model(states).charge.startVisible, false, "unavailable control is hidden");

// Popup layout and refresh configuration.
let popup = card(baseStates(), { ...config, layout: "charge", navigation_path: "/tesla/view", refresh_entities: ["sensor.monta", 42, "bad"] });
assert.equal(popup._cfg.layout, "charge");
assert.equal(popup._cfg.navigation_path, "/tesla/view");
assert.deepEqual([...popup._cfg.refresh], ["sensor.monta"]);
assert.equal(card(baseStates(), { ...config, layout: "weird", navigation_path: "javascript:alert(1)" })._cfg.navigation_path, null);
assert.equal(card(baseStates(), { ...config, map: { style: "satellite" } })._cfg.map.style, "satellite");
assert.equal(card(baseStates(), { ...config, map: { style: "x" } })._cfg.map.style, "default");

// Empty configuration renders dashes only.
result = model({}, {});
assertClean(result, "empty config");
assert.equal(result.hero.range, "—");

// The smart charge plan panel only exists when plan sensors or controls are configured.
assert.equal(card(baseStates(), config)._cfg.plan, true);
assert.equal(card({}, { entities: { battery: "sensor.car_battery" } })._cfg.plan, false, "no plan sensors: panel left out");
assert.equal(card({}, { controls: { deadline: "input_datetime.ready_by" } })._cfg.plan, true);

console.log("th-tesla-dashboard-card tests passed");

// EV Smart Charge: plan modes, timeline, trip and the car's model, found from one entity of the car.
{
  const hour = 3600000;
  const at = (hours) => new Date(Date.now() + hours * hour).toISOString();
  const scConfig = { ...config, vehicle: {}, smart_charge: "select.bil_charge_mode",
    controls: { target_soc: undefined, deadline: undefined } };
  delete scConfig.controls.target_soc;
  delete scConfig.controls.deadline;
  scConfig.controls = {};
  scConfig.entities = Object.fromEntries(Object.entries(config.entities).filter(([key]) => !key.startsWith("monta_")));
  const scStates = () => ({
    ...baseStates(),
    "sensor.mode": s("connected_finished"),
    "binary_sensor.charger": s("on", { charging_state: "Stopped" }),
    "select.bil_charge_mode": s("smart", { options: ["smart", "fixed", "now", "price_cap", "off", "manual"] }),
    "sensor.bil_charge_status": s("waiting", { vehicle_name: "Model Y Long Range AWD (2020–2024)", vehicle_body: "model_y" }),
    "sensor.bil_next_charge_start": s(at(2), { deadline: at(9), blocks: [{ start: at(2), end: at(3.5), kwh: 16, cost: 6.27, estimated: false }] }),
    "sensor.bil_planned_charge_cost": s("6.27", { unit_of_measurement: "kr" }),
    "sensor.bil_planned_charge_energy": s("15.97", { unit_of_measurement: "kWh" }),
    "sensor.bil_plan_target_soc": s("100", { unit_of_measurement: "%" }),
    "number.bil_target_soc": s("100", { min: 10, max: 100, step: 1 }),
    "time.bil_ready_by": s("06:45:00"),
    "time.bil_fixed_charging_start": s("22:00:00"),
    "time.bil_fixed_charging_end": s("06:00:00"),
    "number.bil_price_cap": s("1.5", { unit_of_measurement: "kr/kWh" }),
    "number.bil_minimum_soc": s("20"),
    "datetime.bil_temporary_departure": s("unknown"),
    "text.bil_trip_destination": s(""),
    "switch.bil_round_trip": s("on"),
    "button.bil_clear_temporary_plan": s("unknown"),
    "sensor.bil_trip_distance": s("unknown"),
    "sensor.bil_trip_energy": s("unknown"),
    "sensor.bil_trip_soc_needed": s("unknown"),
  });
  let st = scStates();
  let r = model(st, scConfig);
  assertClean(r, "smart charge");
  assert.equal(r.sc.badge.text, "Venter på billig strøm");
  assert.equal(r.sc.mode, "smart");
  assert.equal(r.sc.cost, "6,27 kr.");
  assert.match(r.sc.kwh, /^16,0 kWh$/);
  assert.equal(r.sc.segments.length, 1);
  assert.ok(r.sc.segments[0].left > 15 && r.sc.segments[0].left < 30, "block placed on the timeline");
  assert.equal(r.sc.marks[0].kind, "deadline");
  assert.match(r.sc.sub, /^Klar .* · mål 100 %$/);
  assert.equal(r.sc.fixed, null, "fixed window only in fixed mode");
  assert.equal(r.vehicle.name, "Tesla Model Y Long Range", "a short model name from the car EV Smart Charge recognised");
  assert.equal(r.vehicle.body, "model_y");
  assert.equal(r.plan.soc.value, 100, "target slider follows the integration");
  assert.equal(r.plan.deadline.text, "06:45");
  assert.equal(r.charge.startVisible, true, "plugged in and waiting: Lad nu switches the plan");
  assert.equal(r.charge.monta, "Venter på planen", "a finished charger that waits for the plan says so");
  assert.equal(r.charge.modeBoxVisible, false);
  assert.equal(r.charge.compare, null, "no comparison without the integration's alternatives");
  st["sensor.bil_planned_charge_cost"] = s("6.27", { unit_of_measurement: "kr", alternatives: {
    now: { cost: 32.79, start: at(0), end: at(1.5), blocks: 1 }, smart: { cost: 6.27, start: at(2), end: at(3.5), blocks: 1 },
    fixed: { cost: 9.1, start: at(3), end: at(4.5), blocks: 1 }, price_cap: { cost: null } } });
  const cmp = model(st, scConfig).charge.compare;
  assertClean(cmp, "compare");
  assert.equal(cmp.map((item) => item.price).join("|"), "32,79 kr.|6,27 kr.|9,10 kr.");
  assert.equal(cmp[1].saving, "spar 26,52 kr.");
  assert.equal(cmp[1].active, true);
  assert.match(cmp[0].detail, /^nu–/);
  assert.equal(cmp[2].label, "Fast tid 22:00–06:00");
  assert.match(cmp[2].detail, /^\d\d:\d\d–\d\d:\d\d$/);

  st["select.bil_charge_mode"] = s("fixed", { options: ["smart", "fixed", "now", "price_cap", "off", "manual"] });
  assert.equal(JSON.stringify(model(st, scConfig).sc.fixed), JSON.stringify({ start: "22:00", end: "06:00" }));
  st["select.bil_charge_mode"] = s("price_cap", { options: ["smart", "fixed", "now", "price_cap", "off", "manual"] });
  assert.equal(model(st, scConfig).sc.cap.value, "1.5");
  assert.equal(model(st, scConfig).sc.cap.over, null, "no override switch: no row");
  st["switch.bil_exceed_price_cap"] = s("on", { over_cap_kwh: 9, over_cap_max_price: 3, over_cap_extra: 13.5, cap_soc: 66.5 });
  assert.equal(model(st, scConfig).sc.cap.over.info, "9,0 kWh over loftet, op til 3,00 kr./kWh (+13,50 kr.) · loftet når ca. 67 %");
  st["switch.bil_exceed_price_cap"] = s("off", { over_cap_kwh: 0, cap_soc: 66.5 });
  assert.equal(model(st, scConfig).sc.cap.over.info, "Holder loftet · loftet når ca. 67 %");
  st["switch.bil_exceed_price_cap"] = s("on", { over_cap_kwh: 0, cap_soc: 85 });
  assert.equal(model(st, scConfig).sc.cap.over.info, "Loftet rækker til målet");

  st = scStates();
  st["datetime.bil_temporary_departure"] = s(at(20));
  st["text.bil_trip_destination"] = s("Aarhus");
  st["sensor.bil_trip_distance"] = s("49.7", { duration_min: 43 });
  st["sensor.bil_trip_energy"] = s("17.1", { unit_of_measurement: "kWh" });
  st["sensor.bil_trip_soc_needed"] = s("39.8", { unit_of_measurement: "%" });
  r = model(st, scConfig);
  assertClean(r, "trip");
  assert.equal(r.sc.trip.active, true);
  assert.match(r.sc.trip.summary, /^Aarhus · .* · kræver 40 %$/);
  assert.equal(r.sc.trip.info, "50 km hver vej · 43 min · 17,1 kWh · kræver 40 %");
  assert.ok(r.sc.marks.some((mark) => mark.kind === "trip"));

  // Default plan: shown when the integration has it, and what a temporary plan returns to.
  st = scStates();
  assert.equal(model(st, scConfig).sc.def, null, "no default plan entity: section hidden");
  st["select.bil_default_plan"] = s("fixed", { options: ["smart", "fixed", "price_cap", "now", "manual"] });
  st["select.bil_charge_mode"] = s("fixed", { options: ["smart", "fixed", "now", "price_cap", "off", "manual"] });
  r = model(st, scConfig);
  assert.equal(r.sc.def.mode, "fixed");
  assert.equal(r.sc.def.summary, "Fast tid");
  st["select.bil_charge_mode"] = s("now", { options: ["smart", "fixed", "now", "price_cap", "off", "manual"] });
  assert.equal(model(st, scConfig).sc.def.summary, "Fast tid · går tilbage hertil efter Lad nu");
  st["select.bil_charge_mode"] = s("manual", { options: ["smart", "fixed", "now", "price_cap", "off", "manual"] });
  assert.equal(model(st, scConfig).sc.def.summary, "Fast tid · Manuel er valgt, indtil du skifter");
  assert.equal(model(st, scConfig).sc.confirmLabel, "Bekræft manuel");

  // Waiting for an answer on the phone.
  st = scStates();
  st["sensor.bil_charge_status"] = s("awaiting_confirmation");
  st["switch.bil_confirm_plan_on_phone"] = s("on", { phones: ["mobile_app_a", "mobile_app_b"] });
  r = model(st, scConfig);
  assert.equal(r.sc.awaiting, true);
  assert.equal(r.sc.badge.text, "Venter på bekræftelse");
  assert.equal(r.sc.phone.info, "2 mobiler");
  assert.equal(r.sc.phone.notify, null, "no plan-message switch: chip hidden");
  st["switch.bil_notify_plan_on_phone"] = s("on");
  st["button.bil_send_plan_to_phone"] = s("unknown");
  r = model(st, scConfig);
  assert.equal(r.sc.phone.notify, true);
  assert.equal(r.sc.phone.send, true);

  // Charging: the stop button pauses the plan.
  st = scStates();
  st["sensor.mode"] = s("connected_charging");
  st["sensor.power"] = s("10.9", { unit_of_measurement: "kW" });
  st["sensor.bil_charge_status"] = s("charging");
  r = model(st, scConfig);
  assert.equal(r.charge.stopVisible, true);
  assert.equal(r.sc.badge.tone, "ok");

  // Every Tesla body draws, in every paint.
  for (const body of ["model_3", "model_3_highland", "model_y", "model_y_juniper", "model_s", "model_x", "cybertruck", "roadster"]) {
    for (const paint of ["grey", "black", "white", "silver", "blue", "red"]) {
      assert.match(context.ttdCarArt(body, paint), /^data:image\/svg\+xml,/);
    }
  }
// EV Ledger's price limit on Cheapest: shown with its set points in the cheapest plan only.
{
  const limitStates = () => ({
    ...scStates(),
    "switch.bil_price_limit_in_cheapest": s("on"),
    "number.bil_cheapest_max_price": s("2", { unit_of_measurement: "kr/kWh" }),
    "number.bil_always_charge_to": s("20", { unit_of_measurement: "%" }),
    "sensor.bil_next_charge_start": s("unknown", { blocks: [], above_limit_kwh: 18.6, limit_soc: 49 }),
    "sensor.bil_planned_charge_energy": s("0", { unit_of_measurement: "kWh" }),
  });
  let lm = model(limitStates(), scConfig).sc.limit;
  assert.equal(lm.on, true);
  assert.equal(lm.value, "2");
  assert.equal(lm.floor, 20);
  assert.equal(lm.info, "Prisen er over grænsen: venter");
  const off = limitStates();
  off["switch.bil_price_limit_in_cheapest"] = s("off");
  assert.equal(model(off, scConfig).sc.limit.info, "", "off: just the set points");
  const cap = limitStates();
  cap["select.bil_charge_mode"] = s("price_cap", cap["select.bil_charge_mode"].attributes);
  assert.equal(model(cap, scConfig).sc.limit, null, "only in the cheapest plan");
  const without = scStates();
  assert.equal(model(without, scConfig).sc.limit, null, "an EV Ledger without the setting");
  // What the limit holds back, "Lad alligevel" with the cost of charging it all now, and the line in the price chart.
  const q = (h) => new Date(Math.floor(Date.now() / 900000) * 900000 + h * hour).toISOString();
  const held = limitStates();
  held["sensor.bil_next_charge_start"] = s(q(1), { deadline: q(3), price_limit: 2, above_limit_kwh: 18.64, limit_soc: 69.5, slot_minutes: 15,
    blocks: [{ start: q(1), end: q(1.5), kwh: 5.5, cost: 10.54, estimated: false }],
    prices: [{ t: q(0.25), p: 2.6 }, { t: q(0.5), p: 2.4 }, { t: q(1), p: 1.9 }, { t: q(1.25), p: 1.95 }, { t: q(2), p: 2.2 }] });
  held["sensor.bil_planned_charge_energy"] = s("5.5", { unit_of_measurement: "kWh" });
  held["sensor.bil_planned_charge_cost"] = s("10.54", { unit_of_measurement: "kr", alternatives: { now: { cost: 94.17, energy_kwh: 32.39 } } });
  const hm = model(held, scConfig).sc;
  assert.equal(hm.limit.hold.title, "Venter med 18,6 kWh");
  assert.match(hm.limit.hold.detail, /Lader til ca\. 70 %, resten koster over 2,00 kr\/kWh · lad alligevel ca\. 94,17 kr/);
  assert.deepEqual(hm.chart.map((b) => [b.on, b.over]), [[false, true], [false, true], [true, false], [true, false], [false, true]]);
  assert.equal(hm.limitLine.label, "2,00 kr");
  assert.ok(hm.limitLine.h > 0.22 && hm.limitLine.h < 1);
  const unplugged = { ...held, "sensor.bil_charge_status": s("disconnected") };
  assert.equal(model(unplugged, scConfig).sc.limit.hold, null, "no charge-anyway button without the car");
  const offHeld = { ...held, "switch.bil_price_limit_in_cheapest": s("off") };
  assert.equal(model(offHeld, scConfig).sc.limitLine, null, "no line when the limit is off");
}
}
// Car controls while Tesla Fleet has no data yet (after a restart): the state comes from the car's Tesla Custom twin,
// the command still goes to the configured (Fleet) entity, unknown is not "0°" and the buttons are not dead.
{
  const st = {
    "lock.gk_lock": s("unknown"), "lock.gk_doors": s("locked"),
    "climate.gk_climate": s("unknown", { temperature: null, current_temperature: null }),
    "climate.gk_hvac_climate_system": s("off", { temperature: 20, current_temperature: 18.8 }),
    "number.gk_charge_limit_2": s("unknown", { min: 50, max: 100 }), "number.gk_charge_limit": s("100", { min: 50, max: 100 }),
    "switch.gk_sentry_mode_2": s("unknown"),
  };
  const ctl = { lock: "lock.gk_lock", climate: "climate.gk_climate", charge_limit: "number.gk_charge_limit_2", sentry: "switch.gk_sentry_mode_2" };
  const c = card(st, { ...config, car_controls: ctl });
  c._hass.entities = {
    "lock.gk_lock": { entity_id: "lock.gk_lock", device_id: "F" }, "climate.gk_climate": { entity_id: "climate.gk_climate", device_id: "F" },
    "number.gk_charge_limit_2": { entity_id: "number.gk_charge_limit_2", device_id: "F" }, "switch.gk_sentry_mode_2": { entity_id: "switch.gk_sentry_mode_2", device_id: "F" },
    "lock.gk_doors": { entity_id: "lock.gk_doors", device_id: "C" }, "lock.gk_charge_port_latch": { entity_id: "lock.gk_charge_port_latch", device_id: "C" },
    "climate.gk_hvac_climate_system": { entity_id: "climate.gk_hvac_climate_system", device_id: "C" },
    "number.gk_charge_limit": { entity_id: "number.gk_charge_limit", device_id: "C" },
  };
  c._hass.devices = { F: { id: "F", name: "Gokart" }, C: { id: "C", name: "Gokart" } };
  assert.equal(c._ccState("lock").state, "locked", "the twin's state");
  assert.equal(c._ccTwin("lock"), "lock.gk_doors", "not the charge port latch");
  assert.equal(c._ccTarget("lock"), "lock.gk_lock", "the command still goes to Tesla Fleet");
  assert.equal(c._ccState("climate").attributes.temperature, 20);
  assert.equal(c._ccState("charge_limit").state, "100");
  assert.equal(c._ccState("sentry").state, "unknown", "no twin: unknown");
  const f = c._format();
  assert.equal(c._ccText("sentry", c._ccState("sentry"), f)[0], "Venter på bilen – tryk sender kommandoen");
  assert.equal(c._ccText("climate", st["climate.gk_climate"], f)[0], "Venter på bilen – tryk sender kommandoen");
  st["lock.gk_lock"] = s("unavailable");
  c._hass.states = { ...st };
  assert.equal(c._ccTarget("lock"), "lock.gk_doors", "unavailable: the twin takes the command");
}
// Car controls: round buttons in the hero, only in the full layout, only the configured entities.
{
  const withCtl = { ...config, car_controls: { lock: "lock.car", climate: "climate.car", charge_limit: "number.car_limit", bogus: "x.y" } };
  const html = context.ttdTemplate(context.ttdNormalizeConfig(withCtl));
  assert.match(html, /data-cc="lock"/);
  assert.match(html, /data-qc="climate"/, "the climate opens the small thermostat");
  assert.doesNotMatch(html, /data-cc="sentry"/);
  assert.match(html, /data-qc="charge_limit"/);
  assert.match(html, /class="qc" data-r="qc"/);
  assert.doesNotMatch(html, /panel carctl/, "no separate panel: the card does not grow");
  assert.match(context.ttdTemplate(context.ttdNormalizeConfig({ ...withCtl, layout: "charge" })), /data-qc="climate"|data-cc="lock"/, "also in the charge popup");
  assert.doesNotMatch(context.ttdTemplate(context.ttdNormalizeConfig(config)), /Bilstyring/);
}
// Monta only where it is configured.
{
  const plain = { ...config, entities: Object.fromEntries(Object.entries(config.entities).filter(([key]) => !key.startsWith("monta_"))) };
  const html = context.ttdTemplate(context.ttdNormalizeConfig(plain));
  assert.doesNotMatch(html, />Monta|Monta wallet/, "no visible Monta without Monta entities");
  assert.match(context.ttdTemplate(context.ttdNormalizeConfig(config)), /Monta wallet/);
}
// EV Ledger without own finish/remaining sensors: the plan's end while the cable is in, nothing while it is out.
{
  const end = new Date(Date.now() + 90 * 60000);
  const ledger = { ...config, smart_charge: "select.bil_charge_mode",
    entities: Object.fromEntries(Object.entries(config.entities).filter(([key]) => !/^monta_|^charging_(finish_time|time_remaining|price_estimate)$/.test(key))) };
  const st = { ...baseStates(), "select.bil_charge_mode": s("smart", { options: ["smart", "now"] }),
    "sensor.bil_next_charge_end": s(end.toISOString(), { device_class: "timestamp" }),
    "binary_sensor.charger": s("off"), "binary_sensor.charging": s("off"), "sensor.mode": s("disconnected") };
  let r = model(st, ledger);
  assertClean(r, "ledger unplugged");
  assert.equal(r.charge.finish, "—", "unplugged: the plan's end is not the expected end");
  assert.equal(r.charge.remaining, "—");
  st["binary_sensor.charger"] = s("on", { charging_state: "Charging" });
  st["binary_sensor.charging"] = s("on");
  st["sensor.mode"] = s("connected_charging");
  r = model(st, ledger);
  assertClean(r, "ledger charging");
  assert.equal(r.charge.finish, `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`);
  assert.match(r.charge.remaining, /^1 t (29|30) min$/);
}
// ev_ledger: one EV Ledger entity finds the ledger's and the car's entities (here without an entity registry, so from
// the Tesla Custom names next to the battery sensor the ledger reads).
{
  const now = new Date().toISOString();
  const st = {
    "select.bil_charge_mode": s("smart", { options: ["smart", "now"] }),
    "sensor.bil_charging_status": s("idle", { source_entities: { battery: "sensor.car_battery", odometer: "sensor.car_odometer", location: "device_tracker.car_location_tracker", charger_power: "sensor.charger_charge_power" } }),
    "sensor.car_battery": s("64", { unit_of_measurement: "%" }), "sensor.car_odometer": s("71478", { unit_of_measurement: "km" }),
    "sensor.car_range": s("310", { unit_of_measurement: "km" }), "sensor.car_temperature_inside": s("19", { unit_of_measurement: "°C" }),
    "device_tracker.car_location_tracker": s("home", { latitude: 56, longitude: 10 }),
    "sensor.bil_trips": s("12"), "sensor.bil_distance_today": s("25.2", { unit_of_measurement: "km" }),
    "sensor.bil_home_charging_power": s("0.0", { unit_of_measurement: "kW" }), "sensor.charger_charger_mode": s("disconnected"),
    "number.bil_public_charge_energy": s("0"), "number.bil_public_charge_price": s("0"), "button.bil_log_public_charge": s("unknown"),
    "sensor.bil_next_charge_start": s(now, { waiting_for: { deadline: new Date(Date.now() + 50 * 3600000).toISOString(), price: 0.52, price_now: 1.95, saving: 12.4, soc_then: 41 }, co2: 85, blocks: [] }),
    "switch.bil_wait_for_a_cheaper_day": s("on", { daily_use_kwh: 3.6 }),
    "switch.bil_learn_departure_times": s("on", { departures: { man: "07:15", tir: "07:15", lør: null }, history_days: 40 }),
    "switch.bil_prefer_green_power": s("off", { price_area: "DK1" }),
  };
  const auto = { name: "Bil", ev_ledger: "select.bil_charge_mode" };
  const c = card(st, auto);
  assert.equal(c._id("battery"), "sensor.car_battery");
  assert.equal(c._id("range"), "sensor.car_range", "the car's range next to its battery sensor");
  assert.equal(c._id("temperature_inside"), "sensor.car_temperature_inside");
  assert.equal(c._id("trips"), "sensor.bil_trips", "the ledger's trips");
  assert.equal(c._id("daily_energy"), "sensor.bil_distance_today", "km today from the ledger");
  assert.equal(c._id("charger_power"), "sensor.bil_home_charging_power");
  assert.equal(c._id("charger_mode"), "sensor.charger_charger_mode", "the charger's mode next to its power sensor");
  assert.equal(c._loc(), "device_tracker.car_location_tracker");
  assert.equal(c._cfg.chart.distance_entity, "sensor.car_odometer");
  const r = c._model();
  assertClean(r, "ev_ledger");
  assert.equal(r.hero.range, "310 km");
  assert.match(r.sc.wait, /^Venter til .*: ca\. 0,52 kr\/kWh mod 1,95 i nat \(spar ca\. 12 kr\)\. Batteriet rækker \(ca\. 41 %\)\. · CO₂ ca\. 85 g\/kWh$/);
  assert.equal(r.sc.options.summary, "2 af 3 slået til");
  assert.match(r.sc.options.note, /^Lærte afgange: man 07:15 · tir 07:15 · lør –$/);
  // Set by hand wins.
  assert.equal(card(st, { ...auto, entities: { range: "sensor.other_range" } })._id("range"), "sensor.other_range");
  const html = context.ttdTemplate(context.ttdNormalizeConfig(auto));
  assert.match(html, /data-r="pc"/, "the public charge form");
  assert.match(html, /data-scoptrole="wait_cheaper_day"/, "the smarter choices");
  // Silent messages at night: a choice with its window.
  st["switch.bil_silent_messages_at_night"] = s("on", { from: "22:00", until: "07:00", silent_now: false });
  const q = card(st, auto)._model();
  assert.equal(q.sc.options.summary, "3 af 4 slået til");
  assert.match(q.sc.options.note, /Ladestart, færdig og planbeskeder kommer uden lyd 22:00–07:00$/);
  delete st["switch.bil_silent_messages_at_night"];
  // smart_charge does the same: the card always finds what is not set by hand.
  assert.equal(card(st, { name: "Bil", smart_charge: "select.bil_charge_mode" })._id("range"), "sensor.car_range");
}
// ev_ledger with the entity registry: Tesla Fleet names, and a second Tesla integration's device with the same name.
{
  const st = {
    "select.gk_charge_mode": s("smart", { options: ["smart"] }),
    "sensor.gk_charging_status": s("idle", { source_entities: { battery: "sensor.gokart_battery_level" } }),
    "sensor.gokart_battery_level": s("70", { unit_of_measurement: "%" }), "sensor.gokart_battery_range": s("300", { unit_of_measurement: "km" }),
    "device_tracker.gokart_location": s("home", { latitude: 56, longitude: 10 }), "binary_sensor.gokart_charge_cable": s("off"),
    "sensor.gokart_tpms_front_left": s("2.9", { unit_of_measurement: "bar" }),
  };
  const entities = {
    "select.gk_charge_mode": { entity_id: "select.gk_charge_mode", device_id: "L", platform: "evledger", translation_key: "charge_mode" },
    "sensor.gk_charging_status": { entity_id: "sensor.gk_charging_status", device_id: "L", platform: "evledger", translation_key: "charging_status" },
    "sensor.gokart_battery_level": { entity_id: "sensor.gokart_battery_level", device_id: "F", platform: "tesla_fleet", translation_key: "charge_state_battery_level" },
    "sensor.gokart_battery_range": { entity_id: "sensor.gokart_battery_range", device_id: "F", platform: "tesla_fleet", translation_key: "charge_state_battery_range" },
    "device_tracker.gokart_location": { entity_id: "device_tracker.gokart_location", device_id: "F", platform: "tesla_fleet", translation_key: "location" },
    "binary_sensor.gokart_charge_cable": { entity_id: "binary_sensor.gokart_charge_cable", device_id: "F", platform: "tesla_fleet", translation_key: "charge_state_conn_charge_cable" },
    "sensor.gokart_tpms_front_left": { entity_id: "sensor.gokart_tpms_front_left", device_id: "C", platform: "tesla_custom" },
  };
  const devices = { L: { id: "L", name: "Gokart" }, F: { id: "F", name: "Gokart" }, C: { id: "C", name: "Gokart" } };
  const c = card(st, { name: "Gokart", ev_ledger: "select.gk_charge_mode" });
  c._hass.entities = entities;
  c._hass.devices = devices;
  assert.equal(c._id("range"), "sensor.gokart_battery_range", "Tesla Fleet by translation key");
  assert.equal(c._id("charger"), "binary_sensor.gokart_charge_cable");
  assert.equal(c._loc(), "device_tracker.gokart_location");
  assert.equal(c._id("tpms_front_left"), "sensor.gokart_tpms_front_left", "another device with the car's name (Tesla Custom)");
}
// The charging cost per month and the year's total from EV Ledger.
{
  const d = new Date();
  const key = (back) => { const m = new Date(d.getFullYear(), d.getMonth() - back, 15); return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`; };
  const months = Array.from({ length: 12 }, (_, i) => ({ month: key(11 - i), cost: 0, kwh: 0, home_cost: 0, public_cost: 0, charges: 0, unpriced: 0 }));
  Object.assign(months[10], { cost: 1240.5, kwh: 410, home_cost: 1000.5, public_cost: 240, charges: 22 });
  Object.assign(months[11], { cost: 182.4, kwh: 96.2, home_cost: 182.4, public_cost: 0, charges: 6, unpriced: 1 });
  const st = { "select.bil_charge_mode": s("smart", { options: ["smart"] }),
    "sensor.bil_charging_cost_this_year": s("1422.9", { unit_of_measurement: "DKK", kwh: 506.2, unpriced: 1, previous_year: 3150, months }) };
  const auto = { name: "Bil", ev_ledger: "select.bil_charge_mode" };
  const c = card(st, auto)._model().cost;
  assert.equal(c.year, "1.423 kr.");
  assert.equal(c.yearSub, "i år · 506 kWh · 2,81 kr/kWh");
  assert.equal(c.sub, "Denne måned 182 kr. · 96 kWh");
  assert.equal(c.note, "Sidste år 3.150 kr. · 1 uden pris i år");
  assert.equal(c.bars.length, 12);
  assert.ok(c.bars[11].now && !c.bars[11].empty && c.bars[0].empty);
  assert.equal(c.bars[10].value, "1,2k");
  assert.equal(Math.round(c.bars[10].home + c.bars[10].pub), 100, "the dearest month fills the chart");
  assert.match(c.bars[10].title, /1\.240,50 kr\. · 410,0 kWh · 3,03 kr\/kWh · 22 ladninger · ude 240,00 kr\.$/);
  assert.match(c.bars[11].title, /6 ladninger · 1 uden pris$/);
  assert.equal(c.before, false, "no year before: no faint bars");
  assert.equal(c.bars[0].before, null);
  // The same months a year before.
  const before = months.map((m) => ({ ...m, month: `${Number(m.month.slice(0, 4)) - 1}${m.month.slice(4)}`, cost: 0, kwh: 0, home_cost: 0, public_cost: 0, charges: 0, unpriced: 0 }));
  Object.assign(before[11], { cost: 2481, kwh: 820, home_cost: 2481, charges: 30 });
  st["sensor.bil_charging_cost_this_year"] = s("1422.9", { ...st["sensor.bil_charging_cost_this_year"].attributes, months_year_before: before, previous_year_kwh: 3900 });
  const b = card(st, auto)._model().cost;
  assert.equal(b.before, true);
  assert.equal(Math.round(b.bars[11].before), 100, "last year's dearer month sets the scale");
  assert.equal(Math.round(b.bars[10].home + b.bars[10].pub), 50);
  assert.equal(b.bars[0].before, 0);
  assert.match(b.bars[11].title, / · året før 2\.481 kr\. · 820 kWh$/);
  assert.match(b.bars[0].title, / · året før ingen ladning$/);
  assert.equal(b.note, "Sidste år 3.150 kr. · 3.900 kWh · 1 uden pris i år");
  assert.match(context.ttdTemplate(context.ttdNormalizeConfig(auto)), /data-r="costChart"/, "the cost panel");
  delete st["sensor.bil_charging_cost_this_year"];
  assert.equal(card(st, auto)._model().cost, null, "no panel without the sensor");
}
// Ready-by popup (EV Ledger week plan and one-time time).
{
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(5, 30, 0, 0);
  const st = {
    "select.bil_charge_mode": s("smart", { options: ["smart"] }),
    "switch.bil_week_plan": s("on", { days: { mon: { time: "06:30", target: null }, tue: null, wed: { time: "06:30", target: 90 }, thu: null, fri: null, sat: null, sun: null },
      next_ready_by: tomorrow.toISOString(), next_target: 90, next_source: "week", once: null, normal_target: 80 }),
    "time.bil_ready_by": s("07:00:00"), "switch.bil_another_time_at_the_weekend": s("off"), "time.bil_ready_by_at_the_weekend": s("09:00:00"),
  };
  const auto = { name: "Bil", ev_ledger: "select.bil_charge_mode" };
  const c = card(st, auto);
  const rb = c._model().rb;
  assert.equal(rb.value, "i morgen kl. 05:30 · 90 %");
  assert.equal(rb.source, "Ugeplan");
  st["switch.bil_week_plan"] = s("off", { ...st["switch.bil_week_plan"].attributes, next_source: "once", next_target: 80 });
  assert.deepEqual(JSON.parse(JSON.stringify([card(st, auto)._model().rb.value, card(st, auto)._model().rb.source])), ["i morgen kl. 05:30", "Engangstid"], "the normal target is not repeated");
  delete st["switch.bil_week_plan"];
  assert.equal(card(st, auto)._model().rb, null, "older EV Ledger: the single time field");
  // Saving the week plan sends one call with the days.
  st["switch.bil_week_plan"] = s("on", { days: { mon: { time: "06:30", target: null }, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }, next_source: "week", normal_target: 80 });
  const calls = [];
  const d = card(st, auto);
  d._hass.callService = async (domain, service, data) => { calls.push([domain, service, data]); };
  d._r = { rbBody: { innerHTML: "" }, rbDlg: { open: false, showModal() { this.open = true; }, close() { this.open = false; }, scrollTop: 0 } };
  d._rbOpen();
  assert.equal(d._rbDraft.mode, "week");
  assert.equal(d._rbDraft.days.tue.on, false);
  d._rbAction({ dataset: { rbcopy: "" } });
  assert.equal(d._rbDraft.days.fri.on, true, "Monday copied to the workdays");
  d._rbDraft.days.fri.target = "90";
  await d._rbSave();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["evledger", "set_week_plan", { entity_id: "switch.bil_week_plan", enabled: true, days: { mon: { time: "06:30" }, tue: { time: "06:30" }, wed: { time: "06:30" }, thu: { time: "06:30" }, fri: { time: "06:30", target: 90 }, sat: null, sun: null } }]]);
  // An empty week is refused before anything is sent.
  calls.length = 0;
  d._rbOpen();
  for (const key of Object.keys(d._rbDraft.days)) d._rbDraft.days[key].on = false;
  await d._rbSave();
  assert.equal(calls.length, 0);
  assert.match(d._rbDraft.error, /Mindst én dag/);
  // A one-time time in the past is refused; a future one is sent as an exact moment.
  d._rbDraft.onceAt = "2000-01-01T05:00";
  d._rbOnceSave();
  assert.match(d._rbDraft.error, /fremtiden/);
  d._rbDraft.onceAt = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}T05:30`;
  d._rbDraft.onceTarget = "95";
  d._rbOnceSave();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ["evledger", "set_ready_by_once", { entity_id: "switch.bil_week_plan", at: tomorrow.toISOString(), target: 95 }]);
  // Back to the same time every day: the week plan off and the time set.
  calls.length = 0;
  d._rbOpen();
  d._rbDraft.mode = "same"; d._rbDraft.same = "06:45";
  await d._rbSave();
  assert.deepEqual(calls.map((x) => `${x[0]}.${x[1]}`), ["switch.turn_off", "time.set_value"]);
  assert.equal(calls[1][2].time, "06:45:00");
}
// A car that is not loaded yet: time 0 is no time.
{
  const st = { ...baseStates(), "sensor.last_update": s("1970-01-01T00:00:00+00:00") };
  assert.equal(model(st, config).hero.updatedLong, "—");
}
// A new target SOC is sent only after "Bekræft".
{
  const st = { "select.bil_charge_mode": s("smart", { options: ["smart"] }), "number.bil_target_soc": s("80", { min: 50, max: 100, step: 5 }) };
  const c = card(st, { name: "Bil", ev_ledger: "select.bil_charge_mode" });
  const calls = [];
  c._hass.callService = async (...a) => { calls.push(a); };
  c._queue = () => {};
  const range = { value: "90", dataset: {} };
  c._r = { socRange: range };
  c._onChange({ target: range });
  assert.equal(c._socPending, 90);
  assert.equal(calls.length, 0, "not sent yet");
  c._onClick({ target: { closest: () => ({ dataset: { socok: "" } }) } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["number", "set_value", { entity_id: "number.bil_target_soc", value: 90 }]]);
  range.value = "60";
  c._onChange({ target: range });
  c._onClick({ target: { closest: () => ({ dataset: { socundo: "" } }) } });
  assert.equal(calls.length, 1, "undo sends nothing");
  assert.equal(c._socPending, null);
}
console.log("th-tesla-dashboard-card smart charge tests passed");
