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
  assert.equal(r.vehicle.name, "Tesla Model Y Long Range AWD (2020–2024)", "model comes from the car EV Smart Charge recognised");
  assert.equal(r.vehicle.body, "model_y");
  assert.equal(r.plan.soc.value, 100, "target slider follows the integration");
  assert.equal(r.plan.deadline.text, "06:45");
  assert.equal(r.charge.startVisible, true, "plugged in and waiting: Lad nu switches the plan");
  assert.equal(r.charge.monta, "Færdig", "without Monta the charger box shows the charger state");
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
}
// Monta only where it is configured.
{
  const plain = { ...config, entities: Object.fromEntries(Object.entries(config.entities).filter(([key]) => !key.startsWith("monta_"))) };
  const html = context.ttdTemplate(context.ttdNormalizeConfig(plain));
  assert.doesNotMatch(html, />Monta|Monta wallet/, "no visible Monta without Monta entities");
  assert.match(context.ttdTemplate(context.ttdNormalizeConfig(config)), /Monta wallet/);
}
console.log("th-tesla-dashboard-card smart charge tests passed");
