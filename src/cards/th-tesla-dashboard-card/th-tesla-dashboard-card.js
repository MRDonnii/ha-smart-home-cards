/*
 * TH Tesla Dashboard Card - `custom:th-tesla-dashboard-card`
 *
 * One Lovelace card with a complete Tesla dashboard: vehicle hero with battery ring, the native
 * Home Assistant map, charging (Monta/Zaptec), smart charge plan, TPMS, EV Ledger history and
 * economy, and a light daily usage chart.
 *
 * Maintenance notes
 * - The shadow DOM is built once per config and afterwards only updated in place.
 * - `_model()` turns hass states into display strings and flags without touching the DOM, so it is
 *   unit tested in Node (tests/th-tesla-dashboard-card.test.mjs).
 * - No polling. Rendering follows `hass`; chart statistics are fetched on demand and cached.
 * - Every entity and control is optional. Missing or unavailable data renders as "—", and a control
 *   without a working entity is removed instead of being shown as a dead button.
 * - Published source stays neutral: real entity IDs belong in the dashboard config only.
 */

import { CTL_CSS, ctlBattery, ctlLine, ctlParts, ctlStatus, ctlSummary, ctlTips, ctlTrack } from "../../shared/charge-timeline.js";
import { chartHover } from "../../shared/chart-hover.js";

const TTD_VERSION = "1.20.1";
// The smart charge plan comes from the user's own template sensors; without any of them the panel is left out.
const TTD_PLAN_ENTITY_KEYS = ["best_charge_start", "best_charge_end", "best_charge_price", "missing_wall_kwh", "charge_minutes_needed"];
const TTD_PLAN_CONTROL_KEYS = ["apply_plan", "target_soc", "deadline"];
const TTD_TAG = "th-tesla-dashboard-card";
const TTD_DASH = "—";
const TTD_EMPTY_STATES = new Set(["", "unknown", "unavailable", "none", "null", "undefined", "nan"]);
// Car controls: key, label, icon, the entity's domain.
const TTD_CAR_CONTROLS = [
  ["lock", "Lås", "mdi:lock", "lock"], ["climate", "Klima", "mdi:fan", "climate"], ["charge_port", "Ladeport", "mdi:ev-plug-type2", "cover"],
  ["sentry", "Vagtpost", "mdi:shield-car", "switch"], ["flash", "Blink lys", "mdi:car-light-high", "button"],
  ["charge_limit", "Ladegrænse", "mdi:battery-charging-high", "number"], ["charge_current", "Ladestrøm", "mdi:current-ac", "number"],
];
// The same control in the car's other integration (a device with the same name), by entity id: its state is shown while
// the configured entity has none yet (Tesla Fleet after a restart, until the car wakes up).
const TTD_CC_TWINS = {
  lock: (id) => /_(doors|lock)$/.test(id) && !id.includes("charge"), climate: () => true,
  charge_port: (id) => /charge|charger/.test(id), sentry: (id) => id.includes("sentry"), flash: (id) => id.includes("flash"),
  charge_limit: (id) => id.includes("charge_limit"), charge_current: (id) => /charging_amps|charge_current/.test(id),
};
// Quick climate extras in the climate popup, found next to the climate entity (Tesla Fleet or Tesla Custom names): role,
// label, icon, domain, entity id pattern.
const TTD_QC_CHIPS = [
  ["defrost", "Afrim", "mdi:car-defrost-front", "switch", /_defrost$/],
  ["steering", "Rat", "mdi:steering", "select", /(steering_wheel_heater|heated_steering_wheel)$/],
  ["seat_left", "Sæde V", "mdi:car-seat-heater", "select", /(seat_heater_front_left|heated_seat_left)$/],
  ["seat_right", "Sæde H", "mdi:car-seat-heater", "select", /(seat_heater_front_right|heated_seat_right)$/],
];
const TTD_HEAT_LEVELS = { off: "Fra", low: "Lav", medium: "Mellem", high: "Høj", auto: "Auto" };
const TTD_CONTROL_KEYS = ["start_charge", "stop_charge", "charger_mode", "target_soc", "deadline", "apply_plan"];
const TTD_MAP_RANGES = [0, 1, 6, 12, 24];
const TTD_CHART_RANGES = {
  today: { label: "I dag", period: "hour", days: 1 },
  "7d": { label: "7 dage", period: "day", days: 7 },
  "30d": { label: "30 dage", period: "day", days: 30 },
};
const TTD_STATS_TTL = 15 * 60 * 1000;
const TTD_ARM_MS = 4000;
const TTD_PENDING_MS = 8000;
// A car command waits this long for the car to answer (a sleeping car first has to wake up).
const TTD_CC_BUSY_MS = 90000;
const TTD_REFRESH_MS = 60 * 1000;
// Esri World Imagery (satellite) and its place-name overlay, shown on top of Home Assistant's own map on request.
const TTD_SATELLITE = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  attribution: "Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics",
};
// Shared by every card instance (dashboard view and popup), so opening both never doubles the refresh requests.
let ttdLastRefresh = 0;
const TTD_MONTA_PLUGGED = new Set(["busy", "busy-blocked", "busy-charging", "busy-non-charging", "busy-non-released", "busy-scheduled"]);
// Display labels for units delivered by Home Assistant. The unit itself is never invented here.
const TTD_UNIT_LABELS = { DKK: "kr.", kr: "kr.", "DKK/km": "kr/km", "DKK/kWh": "kr/kWh", "km/h": "km/t", h: "t" };
const TTD_PRESSURE_TO_BAR = { bar: 1, psi: 0.0689476, kpa: 0.01, pa: 0.00001, hpa: 0.001, mbar: 0.001 };

const TTD_TEXT = {
  status: {
    charging: "Lader", complete: "Opladning færdig", waiting: "Venter på opladning", ready: "Klar til opladning",
    plugged: "Tilsluttet", online: "Online", asleep: "Sover", offline: "Offline", unknown: "Ukendt", unplugged: "Ikke tilsluttet",
  },
  monta: {
    available: "Ledig", busy: "Optaget", "busy-blocked": "Blokeret", "busy-charging": "Aktiv opladning",
    "busy-non-charging": "Tilsluttet, lader ikke", "busy-non-released": "Ikke frigivet", "busy-reserved": "Reserveret",
    "busy-scheduled": "Planlagt opladning", error: "Fejl", disconnected: "Offline", passive: "Passiv", other: "Anden status",
  },
  mode: { disconnected: "Frakoblet", connected_requesting: "Bil venter", connected_charging: "Lader", connected_finished: "Færdig", unknown: "Ukendt" },
  zone: { home: "Hjemme", not_home: "Ude" },
  tpms: { ok: "Normalt tryk", low: "Lavt tryk", critical_low: "Kritisk lavt", high: "Højt tryk", critical_high: "Kritisk højt", unknown: "Ingen måling" },
  unavailable: "Ikke tilgængelig",
  hours: "t", minutes: "min", days: "d", today: "i dag", yesterday: "i går", tomorrow: "i morgen", at: "kl.",
};

const TTD_STATUS_TONES = {
  charging: "ok", complete: "ok", waiting: "info", ready: "info", plugged: "info",
  online: "ok", asleep: "muted", offline: "muted", unknown: "muted", unplugged: "muted",
};
const TTD_STATUS_ICONS = {
  charging: "mdi:lightning-bolt", complete: "mdi:check-circle-outline", waiting: "mdi:clock-outline", ready: "mdi:power-plug",
  plugged: "mdi:power-plug", online: "mdi:check-circle-outline", asleep: "mdi:sleep", offline: "mdi:wifi-off",
  unknown: "mdi:help-circle-outline", unplugged: "mdi:power-plug-off-outline",
};
const TTD_MONTA_TONES = {
  available: "ok", "busy-charging": "ok", busy: "info", "busy-scheduled": "info", "busy-non-charging": "info", "busy-reserved": "info",
  "busy-non-released": "warn", "busy-blocked": "crit", error: "crit",
};

// Neutral fallback artwork (original, no third-party assets): used when no vehicle image is configured or it fails to load.
const TTD_FALLBACK_CAR = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 210"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7482"/><stop offset=".5" stop-color="#363c47"/><stop offset="1" stop-color="#1c2027"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3442"/><stop offset="1" stop-color="#0c1016"/></linearGradient><radialGradient id="s"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="243" cy="186" rx="228" ry="16" fill="url(#s)"/><path fill="url(#b)" d="M30 140c-2-15 7-26 27-30l74-11c33-25 69-39 118-41 47-2 90 11 126 37l52 10c21 4 33 17 33 36l-2 14c0 6-4 10-10 10h-49a39 39 0 0 0-78 0H168a39 39 0 0 0-78 0H43c-8 0-12-6-13-13z"/><path fill="url(#g)" d="M144 99c29-21 62-31 104-33 43-2 80 9 109 29z"/><path d="M36 128h38" stroke="#c9d3e0" stroke-width="3" stroke-linecap="round"/><circle cx="129" cy="170" r="31" fill="#121418"/><circle cx="129" cy="170" r="21" fill="#3b424d"/><circle cx="364" cy="170" r="31" fill="#121418"/><circle cx="364" cy="170" r="21" fill="#3b424d"/></svg>')}`;

// Top view used by the TPMS panel. Wheel elements are tinted by tyre status.
const TTD_TOP_CAR = `<svg class="topcar" viewBox="0 0 120 250" aria-hidden="true"><defs><linearGradient id="ttd-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#262c36"/><stop offset=".5" stop-color="#4a5260"/><stop offset="1" stop-color="#262c36"/></linearGradient><linearGradient id="ttd-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2735"/><stop offset="1" stop-color="#0b1018"/></linearGradient></defs><rect class="wheel" data-r="wFL" x="3" y="44" width="10" height="34" rx="4"/><rect class="wheel" data-r="wFR" x="107" y="44" width="10" height="34" rx="4"/><rect class="wheel" data-r="wRL" x="3" y="170" width="10" height="34" rx="4"/><rect class="wheel" data-r="wRR" x="107" y="170" width="10" height="34" rx="4"/><ellipse cx="9" cy="86" rx="6" ry="3.5" fill="#3a414d"/><ellipse cx="111" cy="86" rx="6" ry="3.5" fill="#3a414d"/><path fill="url(#ttd-body)" stroke="rgba(255,255,255,.14)" d="M60 8c20 0 37 5 43 18 4 10 5 26 5 44v116c0 20-2 36-8 46-6 8-20 12-40 12s-34-4-40-12c-6-10-8-26-8-46V70c0-18 1-34 5-44C23 13 40 8 60 8z"/><path fill="url(#ttd-glass)" d="M24 80c10-12 62-12 72 0l3 70c-13 6-65 6-78 0z"/><path fill="url(#ttd-glass)" d="M22 158c14 4 62 4 76 0l-2 38c-12 8-60 8-72 0z"/><path d="M24 25c6-6 13-9 21-10M96 25c-6-6-13-9-21-10" stroke="#cfd8e3" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M24 233c7 4 14 6 22 6M96 233c-7 4-14 6-22 6" stroke="#dc2626" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;

// Smart charging by the EV Smart Charge integration (ev_smart_charge). Its entities are found on the car's device by
// translation key; the English entity id suffixes are the fallback when the entity registry is not available.
const TTD_SC_ROLES = {
  charge_mode: "select._charge_mode", default_charge_mode: "select._default_plan", charge_status: "sensor._charge_status", next_charge_start: "sensor._next_charge_start",
  next_charge_end: "sensor._next_charge_end", planned_cost: "sensor._planned_charge_cost", planned_energy: "sensor._planned_charge_energy",
  plan_target_soc: "sensor._plan_target_soc", target_soc: "number._target_soc", ready_by_time: "time._ready_by",
  fixed_start: "time._fixed_charging_start", fixed_end: "time._fixed_charging_end", price_cap: "number._price_cap",
  min_soc: "number._minimum_soc", trip_departure: "datetime._temporary_departure", trip_destination: "text._trip_destination",
  trip_round_trip: "switch._round_trip", trip_clear: "button._clear_temporary_plan", trip_distance: "sensor._trip_distance",
  trip_energy: "sensor._trip_energy", trip_target_soc: "sensor._trip_soc_needed", charge_now: "binary_sensor._charge_now",
  confirm_on_phone: "switch._confirm_plan_on_phone", confirm_plan: "button._confirm_plan",
  notify_plan: "switch._notify_plan_on_phone", send_plan: "button._send_plan_to_phone",
  price_cap_override: "switch._exceed_price_cap", smart_price_limit: "switch._price_limit_in_cheapest", price_limit_wait: "switch._wait_above_the_price_limit",
  smart_max_price: "number._cheapest_max_price", smart_floor_soc: "number._always_charge_to", ask_min_saving: "number._ask_when_waiting_saves_at_least", price_resolution: "select._price_resolution",
  // The smarter choices (EV Ledger), each on or off.
  wait_cheaper_day: "switch._wait_for_a_cheaper_day", learn_departure: "switch._learn_departure_times",
  prefer_green: "switch._prefer_green_power", ask_public_price: "switch._ask_for_the_price_of_public_charges",
  morning_check: "switch._message_if_the_target_is_not_reached", low_price_alert: "switch._message_when_power_is_cheap",
  quiet_night: "switch._silent_messages_at_night", quiet_from: "time._silent_from", quiet_until: "time._silent_until",
  // The ledger's own entities on the same device.
  trips: "sensor._trips", last_trip: "sensor._last_trip", total_distance: "sensor._total_distance",
  cost_per_km: "sensor._cost_per_km", monthly_performance: "sensor._monthly_performance", charges: "sensor._charges",
  last_charge: "sensor._last_charge", pending_review: "sensor._charges_needing_price",
  battery_efficiency_score: "sensor._battery_efficiency_score", distance_today: "sensor._distance_today",
  home_charging_power: "sensor._home_charging_power", home_cost_today: "sensor._home_charging_cost_today",
  charging_status: "sensor._charging_status", home_charging_energy: "sensor._home_charging_energy",
  cost_this_year: "sensor._charging_cost_this_year", tyres: "sensor._tyres",
  // Ready-by times: the week plan, the one-time time and the weekend time (EV Ledger).
  week_plan: "switch._week_plan", ready_by_once: "datetime._ready_by_once",
  // Keep the battery at the target while the car heats on the charger, up to a price (EV Ledger).
  heat_hold: "switch._keep_the_battery_at_the_target_while_heating", heat_hold_price: "number._price_limit_while_heating",
  weekend_ready_by: "switch._another_time_at_the_weekend", ready_by_weekend: "time._ready_by_at_the_weekend",
  public_charge_energy: "number._public_charge_energy",
  public_charge_price: "number._public_charge_price", public_charge_location: "text._public_charge_location",
  log_public_charge: "button._log_public_charge",
};
// The smarter choices shown under "Smarte valg": role, label, icon.
const TTD_SC_OPTIONS = [
  ["wait_cheaper_day", "Vent på billigere dag", "mdi:calendar-arrow-right"], ["learn_departure", "Lær køretider", "mdi:clock-start"],
  ["prefer_green", "Grøn strøm", "mdi:leaf"], ["ask_public_price", "Spørg om pris ude", "mdi:message-reply-text-outline"],
  ["morning_check", "Morgentjek", "mdi:alarm-check"], ["low_price_alert", "Billig strøm-besked", "mdi:cash-check"],
  ["quiet_night", "Lydløs om natten", "mdi:bell-sleep"],
];
// ev_ledger: the card's entities from EV Ledger alone. Card key -> EV Ledger role ...
const TTD_LEDGER_KEYS = {
  trips: "trips", last_trip: "last_trip", total_distance: "total_distance", cost_per_km: "cost_per_km",
  monthly_performance: "monthly_performance", charges: "charges", last_charge: "last_charge",
  charges_needing_price: "pending_review", efficiency_score: "battery_efficiency_score", daily_energy: "distance_today",
  charger_power: "home_charging_power",
};
// ... and the car's own entities, found next to the battery sensor EV Ledger reads: domain, translation keys (Tesla Fleet,
// Teslemetry, Tessie), entity id endings (Tesla Custom).
const TTD_CAR_KEYS = {
  battery: ["sensor", ["charge_state_battery_level"], ["_battery", "_battery_level"]],
  range: ["sensor", ["charge_state_battery_range"], ["_range", "_battery_range"]],
  odometer: ["sensor", ["vehicle_state_odometer"], ["_odometer"]],
  temperature_inside: ["sensor", ["climate_state_inside_temp"], ["_temperature_inside", "_inside_temperature"]],
  temperature_outside: ["sensor", ["climate_state_outside_temp"], ["_temperature_outside", "_outside_temperature"]],
  online: ["binary_sensor", ["state"], ["_online"]],
  asleep: ["binary_sensor", [], ["_asleep"]],
  charger: ["binary_sensor", ["charge_state_conn_charge_cable"], ["_charger", "_charge_cable"]],
  charging: ["binary_sensor", [], ["_charging"]],
  charging_rate: ["sensor", ["charge_state_charge_rate"], ["_charging_rate", "_charge_rate"]],
  last_update: ["sensor", [], ["_data_last_update_time"]],
  tpms_front_left: ["sensor", ["vehicle_state_tpms_pressure_fl"], ["_tpms_front_left"]],
  tpms_front_right: ["sensor", ["vehicle_state_tpms_pressure_fr"], ["_tpms_front_right"]],
  tpms_rear_left: ["sensor", ["vehicle_state_tpms_pressure_rl"], ["_tpms_rear_left"]],
  tpms_rear_right: ["sensor", ["vehicle_state_tpms_pressure_rr"], ["_tpms_rear_right"]],
  location: ["device_tracker", ["location"], ["_location_tracker", "_location"]],
};
const TTD_SC_MODES = [
  ["smart", "Billigst", "mdi:piggy-bank-outline"], ["fixed", "Fast tid", "mdi:clock-time-four-outline"],
  ["now", "Lad nu", "mdi:lightning-bolt"], ["price_cap", "Prisloft", "mdi:cash-lock"],
  ["off", "Pause", "mdi:pause"], ["manual", "Manuel", "mdi:hand-back-right-outline"],
];
// Plans that can be the default (used when the cable goes in, and returned to after another plan has run).
const TTD_SC_DEFAULTS = ["smart", "fixed", "price_cap", "now", "manual"];
const ttdScLabel = (mode) => TTD_SC_MODES.find(([key]) => key === mode)?.[1] || ttdHumanize(mode || "");
const TTD_SC_STATUS = {
  plan_only: ["Kun plan", "muted"], manual: ["Manuel", "muted"], disconnected: ["Ikke tilsluttet", "muted"],
  other_car: ["Anden bil i laderen", "muted"], unknown: ["Ukendt", "muted"], charging: ["Lader", "ok"],
  stopped_externally: ["Stoppet af bil/app", "warn"], not_responding: ["Laderen svarer ikke", "crit"], paused: ["På pause", "warn"],
  starting: ["Starter", "info"], done: ["Mål nået", "ok"], waiting: ["Venter på billig strøm", "info"],
  awaiting_confirmation: ["Venter på bekræftelse", "warn"],
};

// Original side views of every Tesla body (no third-party assets), front to the left, painted from TTD_PAINTS.
const TTD_PAINTS = {
  grey: ["#6b7482", "#363c47", "#1c2027"], black: ["#4a5058", "#1d2026", "#0b0d10"], white: ["#f4f6f8", "#d3d8de", "#98a0aa"],
  silver: ["#dde1e6", "#9aa2ab", "#5c636d"], blue: ["#4a72b8", "#1f3d78", "#0e1f40"], red: ["#d23b45", "#8e1820", "#4d0b10"],
};
const TTD_BODIES = {
  model_3: {
    body: "M30 140c-2-15 7-26 27-30l74-11c33-25 69-39 118-41 47-2 90 11 126 37l52 10c21 4 33 17 33 36l-2 14c0 6-4 10-10 10h-49a39 39 0 0 0-78 0H168a39 39 0 0 0-78 0H43c-8 0-12-6-13-13z",
    glass: "M144 99c29-21 62-31 104-33 43-2 80 9 109 29z", light: "M36 128h38", tail: "M448 126l14 3", wheels: [129, 364], wy: 170, wr: 31,
  },
  model_3_highland: {
    body: "M30 140c-2-15 7-26 27-30l74-11c33-25 69-39 118-41 47-2 90 11 126 37l52 10c21 4 33 17 33 36l-2 14c0 6-4 10-10 10h-49a39 39 0 0 0-78 0H168a39 39 0 0 0-78 0H43c-8 0-12-6-13-13z",
    glass: "M144 99c29-21 62-31 104-33 43-2 80 9 109 29z", light: "M34 124c11-3 22-4 33-4", tail: "M440 122h22", wheels: [129, 364], wy: 170, wr: 31,
  },
  model_y: {
    body: "M28 146C26 128 36 116 58 112L128 100C160 72 200 56 252 54C300 52 338 64 372 92L420 104C442 110 454 124 454 142L452 158C452 164 448 168 442 168L402 168A39 39 0 0 0 324 168L168 168A39 39 0 0 0 90 168L40 168C33 168 29 160 28 146Z",
    glass: "M142 98C172 76 206 64 250 62C292 60 326 70 356 92Z", light: "M34 132h40", tail: "M440 120l14 3", wheels: [129, 363], wy: 168, wr: 31,
  },
  model_y_juniper: {
    body: "M28 146C26 128 36 116 58 112L128 100C160 72 200 56 252 54C300 52 338 64 372 92L420 104C442 110 454 124 454 142L452 158C452 164 448 168 442 168L402 168A39 39 0 0 0 324 168L168 168A39 39 0 0 0 90 168L40 168C33 168 29 160 28 146Z",
    glass: "M142 98C172 76 206 64 250 62C292 60 326 70 356 92Z", light: "M30 122c16-2 34-2 52 0", tail: "M432 118h22", wheels: [129, 363], wy: 168, wr: 31,
  },
  model_s: {
    body: "M20 142C18 128 28 118 48 114L122 102C156 78 196 64 250 62C304 60 352 74 392 100L436 108C454 112 464 126 464 142L462 156C462 163 458 168 451 168L414 168A39 39 0 0 0 336 168L164 168A39 39 0 0 0 86 168L34 168C26 168 21 158 20 142Z",
    glass: "M138 100C170 80 206 70 250 68C296 66 338 78 372 100Z", light: "M26 128h40", tail: "M450 122l13 3", wheels: [125, 375], wy: 170, wr: 31,
  },
  model_x: {
    body: "M22 148C20 130 30 118 52 114L120 100C150 66 196 50 256 48C316 46 362 62 398 96L440 106C458 112 466 126 466 144L464 158C464 164 460 168 453 168L416 168A40 40 0 0 0 336 168L166 168A40 40 0 0 0 86 168L36 168C28 168 23 160 22 148Z",
    glass: "M136 98C166 70 206 58 254 56C302 54 342 68 376 96Z", light: "M28 132h40", tail: "M452 120l13 3", wheels: [126, 376], wy: 170, wr: 32,
  },
  cybertruck: {
    body: "M22 140L28 118L240 44L454 104L460 140L458 162L420 162A40 40 0 0 0 340 162L172 162A40 40 0 0 0 92 162L26 162Z",
    glass: "M150 94L240 56L322 80L322 94Z", light: "M26 120l40-14", tail: "M454 106l4 12", wheels: [132, 380], wy: 166, wr: 32,
  },
  roadster: {
    body: "M40 150C38 138 46 130 62 126L150 112C176 92 206 84 240 84C278 84 312 96 340 112L408 120C426 122 438 134 438 150L436 160C436 165 432 168 426 168L388 168A35 35 0 0 0 318 168L170 168A35 35 0 0 0 100 168L52 168C45 168 41 162 40 150Z",
    glass: "M176 110C196 96 216 90 240 90C266 90 290 98 310 110Z", light: "M46 136h32", tail: "M424 128l12 2", wheels: [135, 353], wy: 170, wr: 28,
  },
};

/** Side view of a Tesla body in a paint colour, as an image URL. */
function ttdCarArt(bodyKey, paintKey) {
  const b = TTD_BODIES[bodyKey] || TTD_BODIES.model_3;
  const [hi, mid, lo] = TTD_PAINTS[paintKey] || TTD_PAINTS.grey;
  const wheel = (x) => `<circle cx="${x}" cy="${b.wy}" r="${b.wr}" fill="#121418"/><circle cx="${x}" cy="${b.wy}" r="${Math.round(b.wr * 0.68)}" fill="#3b424d"/><circle cx="${x}" cy="${b.wy}" r="${Math.round(b.wr * 0.24)}" fill="#1b1f25"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 210"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3442"/><stop offset="1" stop-color="#0c1016"/></linearGradient><radialGradient id="s"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="243" cy="188" rx="228" ry="15" fill="url(#s)"/><path fill="url(#b)" d="${b.body}"/><path fill="url(#g)" d="${b.glass}"/><path d="${b.light}" stroke="#e7eef6" stroke-width="3" stroke-linecap="round" fill="none"/><path d="${b.tail}" stroke="#e0464f" stroke-width="3" stroke-linecap="round" fill="none"/>${b.wheels.map(wheel).join("")}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* ------------------------------------------------------------------ helpers */

function ttdEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function ttdHasValue(stateObj) {
  return !!stateObj && !TTD_EMPTY_STATES.has(String(stateObj.state ?? "").trim().toLowerCase());
}

function ttdToNumber(value) {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(/^-?\d+,\d+$/.test(text) ? text.replace(",", ".") : text);
  return Number.isFinite(number) ? number : null;
}

function ttdToDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const text = String(value).trim();
  if (TTD_EMPTY_STATES.has(text.toLowerCase()) || !/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
  const date = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function ttdUnit(unit) {
  if (unit == null) return "";
  const text = String(unit).trim();
  return TTD_UNIT_LABELS[text] ?? text;
}

function ttdJoin(value, unit) {
  return unit && value !== TTD_DASH ? `${value} ${unit}` : value;
}

function ttdClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ttdIsClock(text) {
  return typeof text === "string" && /^\d{1,2}[:.]\d{2}(?::\d{2})?$/.test(text.trim());
}

function ttdClock(text) {
  const [hours, minutes] = String(text).trim().split(/[:.]/);
  return `${hours.padStart(2, "0")}:${minutes}`;
}

function ttdHumanize(value) {
  const text = String(value ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : TTD_DASH;
}

function ttdNumberLocale(locale, language) {
  switch (locale?.number_format) {
    case "comma_decimal": return ["en-US", "en"];
    case "decimal_comma": return ["de", "es", "it"];
    case "space_comma": return ["fr", "sv", "cs"];
    case "system": return undefined;
    default: return language;
  }
}

/** Locale aware formatting that follows the user's Home Assistant profile (language, number and time format, time zone). */
class TtdFormat {
  constructor(hass) {
    const locale = hass?.locale || {};
    this.lang = locale.language || hass?.language || "da";
    this.numberLocale = ttdNumberLocale(locale, this.lang);
    this.grouping = locale.number_format !== "none";
    this.serverTz = hass?.config?.time_zone || undefined;
    this.timeZone = locale.time_zone === "server" ? this.serverTz : undefined;
    this.hour12 = locale.time_format === "12" ? true : locale.time_format === "24" ? false : undefined;
    this._cache = new Map();
  }

  _intl(key, create) {
    let formatter = this._cache.get(key);
    if (!formatter) {
      formatter = create();
      this._cache.set(key, formatter);
    }
    return formatter;
  }

  number(value, digits = 0) {
    if (value == null || !Number.isFinite(value)) return TTD_DASH;
    const factor = 10 ** digits;
    const rounded = Math.round(value * factor) / factor;
    return this._intl(`n${digits}`, () => new Intl.NumberFormat(this.numberLocale, {
      minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: this.grouping,
    })).format(rounded === 0 ? 0 : rounded);
  }

  time(value) {
    const date = ttdToDate(value);
    if (!date) return TTD_DASH;
    const parts = this._intl("time", () => new Intl.DateTimeFormat(this.lang, {
      hour: "2-digit", minute: "2-digit", hour12: this.hour12, timeZone: this.timeZone,
    })).formatToParts(date);
    const part = (type) => parts.find((item) => item.type === type)?.value;
    // Always "08:17": Danish CLDR would give "08.17", while the template sensors and the design use a colon.
    const period = part("dayPeriod");
    return `${part("hour")}:${part("minute")}${period ? ` ${period}` : ""}`;
  }

  date(value, withYear) {
    const date = ttdToDate(value);
    if (!date) return TTD_DASH;
    const year = withYear ?? this.dayKey(date).slice(0, 4) !== this.dayKey(new Date()).slice(0, 4);
    return this._intl(year ? "dateY" : "date", () => new Intl.DateTimeFormat(this.lang, {
      day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: this.timeZone,
    })).format(date);
  }

  weekday(value, style = "short", timeZone = this.timeZone) {
    return this._intl(`wd${style}${timeZone || ""}`, () => new Intl.DateTimeFormat(this.lang, { weekday: style, timeZone })).format(value);
  }

  dayKey(value, timeZone = this.timeZone) {
    return this._intl(`key${timeZone || ""}`, () => new Intl.DateTimeFormat("en-CA", {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone,
    })).format(value);
  }

  hour(value, timeZone = this.timeZone) {
    return Number(this._intl(`hour${timeZone || ""}`, () => new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", hourCycle: "h23", timeZone,
    })).format(value));
  }

  dayDiff(value) {
    const toUtc = (date) => Date.parse(`${this.dayKey(date)}T00:00:00Z`);
    return Math.round((toUtc(value) - toUtc(new Date())) / 86400000);
  }

  relativeDay(value) {
    const date = ttdToDate(value);
    if (!date) return TTD_DASH;
    const diff = this.dayDiff(date);
    if (diff === 0) return TTD_TEXT.today;
    if (diff === -1) return TTD_TEXT.yesterday;
    if (diff === 1) return TTD_TEXT.tomorrow;
    return this.date(date);
  }

  dayTime(value) {
    const date = ttdToDate(value);
    return date ? `${this.relativeDay(date)} ${TTD_TEXT.at} ${this.time(date)}` : TTD_DASH;
  }

  duration(minutes) {
    if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return TTD_DASH;
    const total = Math.round(minutes);
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    const mins = total % 60;
    if (days) return `${days} ${TTD_TEXT.days} ${hours} ${TTD_TEXT.hours}`;
    if (hours) return mins ? `${hours} ${TTD_TEXT.hours} ${mins} ${TTD_TEXT.minutes}` : `${hours} ${TTD_TEXT.hours}`;
    return `${mins} ${TTD_TEXT.minutes}`;
  }

  ago(value) {
    const date = ttdToDate(value);
    if (!date) return TTD_DASH;
    const seconds = (date.getTime() - Date.now()) / 1000;
    const abs = Math.abs(seconds);
    const rtf = this._intl("rtf", () => new Intl.RelativeTimeFormat(this.lang, { numeric: "auto", style: "short" }));
    if (abs < 45) return rtf.format(0, "second");
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
    return this.dayTime(date);
  }
}

/* --------------------------------------------------------------- config */

function ttdNormalizeConfig(raw) {
  const config = JSON.parse(JSON.stringify(raw || {}));
  const vehicle = config.vehicle && typeof config.vehicle === "object" ? config.vehicle : {};
  const entities = {};
  for (const [key, value] of Object.entries(config.entities || {})) {
    if (typeof value === "string" && value.includes(".")) entities[key] = value.trim();
  }
  const controls = {};
  for (const key of TTD_CONTROL_KEYS) {
    const value = config.controls?.[key];
    const entity = typeof value === "string" ? value : value?.entity;
    if (typeof entity === "string" && entity.includes(".")) controls[key] = { ...(typeof value === "object" ? value : {}), entity: entity.trim() };
  }
  const map = { hours_to_show: 6, theme_mode: "auto", default_zoom: 14, style: "default", satellite_labels: true, ...(config.map || {}) };
  map.style = map.style === "satellite" ? "satellite" : "default";
  map.ranges = Array.isArray(map.ranges) && map.ranges.length ? map.ranges.map(Number).filter((hours) => Number.isFinite(hours) && hours >= 0) : TTD_MAP_RANGES;
  map.hours_to_show = Number.isFinite(Number(map.hours_to_show)) ? Number(map.hours_to_show) : 6;
  const chart = { range: "today", ...(config.chart || {}) };
  if (!TTD_CHART_RANGES[chart.range]) chart.range = "today";
  chart.distance_entity = chart.distance_entity || entities.odometer || null;
  chart.energy_entity = chart.energy_entity || null;
  // Pressure thresholds are in bar and compared after converting the sensor's own unit.
  const tpms = { unit: null, digits: null, warning_low: 2.6, critical_low: 2.2, warning_high: 3.5, critical_high: 3.8, ...(config.tpms || {}) };
  const battery = { low: 20, critical: 10, ...(config.battery || {}) };
  const precision = config.precision && typeof config.precision === "object" ? config.precision : {};
  return {
    name: String(config.name || "Tesla"),
    // "auto" or no model: the name and body come from the car EV Smart Charge plans for.
    model: (vehicle.model || config.model) && (vehicle.model || config.model) !== "auto" ? String(vehicle.model || config.model) : null,
    body: TTD_BODIES[vehicle.body] ? vehicle.body : null,
    paint: TTD_PAINTS[vehicle.color] ? vehicle.color : "grey",
    image: vehicle.image || config.vehicle_image || null,
    // Photos of the car itself: plugged in (with the cable) and parked, shown in the charging panel and popup.
    // vehicle.photos: { charging: "/local/…/plugged-in.jpg", parked: "/local/…/parked.jpg" } (the 3D house reads the same).
    chargeImage: typeof vehicle.photos?.charging === "string" && vehicle.photos.charging ? vehicle.photos.charging : null,
    parkedImage: typeof vehicle.photos?.parked === "string" && vehicle.photos.parked ? vehicle.photos.parked : null,
    // A picture of the car from above (front up) for the tyres, and where its wheels are in it (% of width/height).
    topImage: typeof vehicle.photos?.top === "string" && vehicle.photos.top ? vehicle.photos.top : null,
    topWheels: Object.fromEntries(Object.entries({ fl: [13, 19], fr: [87, 19], rl: [13, 79], rr: [87, 79] }).map(([key, fallback]) => {
      const value = vehicle.photos?.top_wheels?.[key];
      return [key, Array.isArray(value) && value.length === 2 && value.every((n) => Number.isFinite(Number(n))) ? value.map(Number) : fallback];
    })),
    // The cable in the plugged-in photo ({ path, width, height } in the photo's pixels): animated while charging.
    cable: typeof vehicle.photos?.cable?.path === "string" && Number(vehicle.photos.cable.width) > 0 && Number(vehicle.photos.cable.height) > 0
      ? { path: vehicle.photos.cable.path, width: Number(vehicle.photos.cable.width), height: Number(vehicle.photos.cable.height) } : null,
    smart_charge: typeof config.smart_charge === "string" && config.smart_charge.includes(".") ? config.smart_charge.trim()
      : typeof config.ev_ledger === "string" && config.ev_ledger.includes(".") ? config.ev_ledger.trim() : null,

    charger_label: typeof config.charger_label === "string" && config.charger_label.trim() ? config.charger_label.trim() : null,
    confirm_mode_change: config.confirm_mode_change !== false,
    // The tyre sets panel (EV Ledger's tyres sensor, shown with ha-ev-tyre-card); tyres: false hides it.
    tyres: config.tyres !== false,
    location: config.location_entity || entities.location || null,
    entities, controls, map, chart, tpms, battery, precision,
    // The car's own controls (full layout only, i.e. the Tesla page): every one takes a second tap.
    carControls: Object.fromEntries(TTD_CAR_CONTROLS.map(([key]) => [key, config.car_controls?.[key]])
      .filter(([, id]) => typeof id === "string" && id.includes("."))),
    layout: config.layout === "charge" ? "charge" : "full",
    navigation_path: typeof config.navigation_path === "string" && config.navigation_path.startsWith("/") ? config.navigation_path : null,
    // Entities asked to refresh (homeassistant.update_entity) when the card becomes visible, e.g. a cloud-polled charger.
    plan: TTD_PLAN_ENTITY_KEYS.some((key) => entities[key]) || TTD_PLAN_CONTROL_KEYS.some((key) => controls[key])
      || (typeof config.smart_charge === "string" && config.smart_charge.includes("."))
      || (typeof config.ev_ledger === "string" && config.ev_ledger.includes(".")),
    refresh: (Array.isArray(config.refresh_entities) ? config.refresh_entities : []).filter((id) => typeof id === "string" && id.includes(".")),
  };
}

/** One user-facing vehicle status derived from Tesla, Monta and Zaptec data. Pure function (unit tested). */
function ttdDeriveStatus(snapshot) {
  const s = snapshot || {};
  const mode = s.mode || "";
  const monta = s.monta || "";
  const chargingState = s.chargingState || "";
  const plugged = s.plug === true || s.cable === true || mode.startsWith("connected_") || TTD_MONTA_PLUGGED.has(monta);
  // Plugged into the home charger, the charger decides whether it charges: the car's own charging flag can stand still
  // for an hour after a stop (Claude AI, 2026-10-09: stopped, yet shown charging with only "Stop"). Elsewhere (a public
  // charger) the car's own state counts.
  const atCharger = s.cable === true || mode.startsWith("connected_") || TTD_MONTA_PLUGGED.has(monta);
  const chargerCharging = mode === "connected_charging" || monta === "busy-charging" || (s.power != null && s.power >= 0.3);
  const charging = atCharger ? chargerCharging : s.charging === true || chargingState === "Charging" || chargerCharging;
  const reached = s.soc != null && s.target != null && s.soc >= s.target - 0.5;
  let key;
  if (charging) key = "charging";
  else if (plugged) {
    if (chargingState === "Complete" || (mode === "connected_finished" && (reached || s.target == null))) key = "complete";
    else if (monta === "busy-scheduled" || s.scheduled === true || chargingState === "Stopped" || chargingState === "NoPower" || mode === "connected_finished") key = "waiting";
    else if (mode === "connected_requesting" || chargingState === "Starting") key = "ready";
    else key = "plugged";
  } else if (s.asleep === true || s.vehicleState === "asleep") key = "asleep";
  else if (s.online === true || s.vehicleState === "online") key = "online";
  else if (s.online === false || s.vehicleState === "offline") key = "offline";
  else key = "unknown";
  return { key, label: TTD_TEXT.status[key], tone: TTD_STATUS_TONES[key], icon: TTD_STATUS_ICONS[key], plugged: plugged || charging, charging };
}

/** Tyre pressure with unit conversion; thresholds are evaluated in bar whatever unit the sensor reports. */
function ttdPressure(stateObj, options, format) {
  const value = ttdHasValue(stateObj) ? ttdToNumber(stateObj.state) : null;
  const unit = String(stateObj?.attributes?.unit_of_measurement ?? "").trim();
  if (value == null) return { text: TTD_DASH, tone: "muted", status: TTD_TEXT.tpms.unknown, bar: null };
  const toBar = TTD_PRESSURE_TO_BAR[unit.toLowerCase()];
  const bar = toBar ? value * toBar : null;
  const wanted = options.unit && TTD_PRESSURE_TO_BAR[String(options.unit).toLowerCase()] ? String(options.unit) : null;
  const displayUnit = wanted && bar != null ? wanted : unit;
  const shown = displayUnit === unit ? value : bar / TTD_PRESSURE_TO_BAR[displayUnit.toLowerCase()];
  const digits = Number.isInteger(options.digits) ? options.digits : displayUnit.toLowerCase() === "bar" ? 1 : 0;
  let tone = "ok";
  let status = TTD_TEXT.tpms.ok;
  if (bar == null) {
    tone = "info";
    status = "";
  } else if (bar <= options.critical_low) {
    tone = "crit"; status = TTD_TEXT.tpms.critical_low;
  } else if (bar >= options.critical_high) {
    tone = "crit"; status = TTD_TEXT.tpms.critical_high;
  } else if (bar <= options.warning_low) {
    tone = "warn"; status = TTD_TEXT.tpms.low;
  } else if (bar >= options.warning_high) {
    tone = "warn"; status = TTD_TEXT.tpms.high;
  }
  return { text: ttdJoin(format.number(shown, digits), displayUnit), tone, status, bar };
}

/* -------------------------------------------------------------- markup */

/** A JPEG photo has its own (studio) backdrop, which the card fades out; WebP/PNG photos are expected to be transparent. */
function ttdOpaque(path) {
  return /\.jpe?g(?:[?#]|$)/i.test(String(path || ""));
}

/** A short name that tells which car it is ("Tesla Model 3 RWD"), not the catalogue's full model line. */
function ttdShortModel(name) {
  const text = String(name || "").trim();
  const match = /(model\s?[3sxy]\b|cybertruck|roadster)/i.exec(text);
  if (!match) return text.length > 28 ? `${text.slice(0, 27).trim()}…` : text;
  const model = /^model/i.test(match[1]) ? `Model ${match[1].slice(-1).toUpperCase()}` : match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  const drive = /performance/i.test(text) ? "Performance" : /long range/i.test(text) ? "Long Range" : /\bAWD\b/i.test(text) ? "AWD"
    : /\bRWD\b|standard range/i.test(text) ? "RWD" : "";
  return ["Tesla", model, drive].filter(Boolean).join(" ");
}

function ttdIcon(icon, cls = "") {
  return `<ha-icon icon="${icon}"${cls ? ` class="${cls}"` : ""}></ha-icon>`;
}

function ttdTemplate(cfg) {
  const e = ttdEsc;
  const stat = (key, icon, ref, label) => `<button class="stat" data-more="${key}">${ttdIcon(icon)}<span class="stat-t"><b data-r="${ref}">${TTD_DASH}</b><small>${label}</small></span></button>`;
  const kpi = (key, icon, ref, label) => `<button class="kpi" data-more="${key}">${ttdIcon(icon, "tile-i")}<b data-r="${ref}">${TTD_DASH}</b><small>${label}</small></button>`;
  const cell = (key, icon, tone, ref, label, extra = "") => `<button class="cell" data-more="${key}">${ttdIcon(icon, `ic ${tone}`)}<span><small>${label}</small><b data-r="${ref}">${TTD_DASH}</b>${extra}</span></button>`;
  const row = (key, label, ref, extra = "") => `<button class="row" data-more="${key}"><span class="row-l">${label}</span><span class="row-v"${extra ? ` data-r="${ref}Box"` : ""}>${extra}<b data-r="${ref}">${TTD_DASH}</b></span></button>`;
  const tire = (key, ref, label) => `<button class="tire" data-more="${key}" data-r="${ref}"><small>${label}</small><b data-r="${ref}V">${TTD_DASH}</b><em data-r="${ref}S"></em></button>`;
  const item = (key, icon, ref, label) => `<div class="lc"><span class="lc-i">${ttdIcon(icon)}</span><span><b data-r="${ref}">${TTD_DASH}</b><small>${label}</small></span></div>`;
  const ranges = cfg.map.ranges.map((hours) => `<button type="button" data-range="${hours}" aria-pressed="false">${hours === 0 ? "Nu" : `${hours}t`}</button>`).join("");
  const chartOptions = Object.entries(TTD_CHART_RANGES).map(([key, range]) => `<option value="${key}">${range.label}</option>`).join("");
  const full = cfg.layout !== "charge";
  // The car's controls as a row of round buttons at the foot of the car picture (user, 2026-10-10: "styring af bilen
  // kommer op i top kortet uden at lave det større"); the climate and the two numbers open a small panel above it.
  const quick = TTD_CAR_CONTROLS.filter(([key]) => cfg.carControls[key]);
  const quickHtml = quick.length ? `<div class="qc" data-r="qc" role="toolbar" aria-label="Bilstyring">${quick.map(([key, label, icon, domain]) => `<button type="button" class="qc-b${domain === "number" || key === "climate" ? " qc-v" : ""}" ${domain === "number" || key === "climate" ? `data-qc="${key}"` : `data-cc="${key}"`} aria-label="${label}" title="${label}">${ttdIcon(icon)}<span data-qcv="${key}"></span><i class="qc-spin" aria-hidden="true"></i></button>`).join("")}<div class="qc-cap" data-r="qcCap" aria-live="polite" hidden></div><div class="qc-pop" data-r="qcPop" hidden></div></div>` : "";
  return `<div class="wrap" data-r="wrap"><div class="dash${full ? "" : " charge-layout"}${cfg.plan ? "" : " no-plan"}">
<section class="panel hero" data-r="hero" aria-label="Bilstatus">
  <div class="hero-info">
    <div class="hero-title"><h2 class="name">${e(cfg.name)}</h2><button class="pill" data-more="online" data-r="pill"><i class="dot"></i><span data-r="statusText">${TTD_DASH}</span></button></div>
    <p class="model" data-r="model">${e(cfg.model || "Tesla")}</p>
    <button class="updated" data-more="last_update"><span>Sidst opdateret</span><span data-r="updatedLong">${TTD_DASH}</span></button>
  </div>
  <div class="hero-car"><img data-r="carImg" alt="${e(cfg.model || "Tesla")}" decoding="async" width="900" height="434"><svg class="cable" data-r="heroCable" hidden aria-hidden="true"><path class="cable-base"/><path class="cable-flow"/><circle class="cable-port" r="5"/></svg></div>
  <button class="ring-wrap" data-more="battery" data-r="ring">
    <svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="52"/><circle class="ring-fill" data-r="ringFill" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="0 100"/></svg>
    <span class="ring-t"><span class="soc"><b data-r="soc">${TTD_DASH}</b><small data-r="socUnit">%</small>${ttdIcon("mdi:lightning-bolt", "bolt")}</span><span class="range" data-r="range">${TTD_DASH}</span><span class="muted">rækkevidde</span></span>
  </button>
  ${quickHtml}
  ${full ? `<div class="hero-stats">${stat("odometer", "mdi:speedometer", "odometer", "Kilometerstand")}${stat("temperature_inside", "mdi:thermometer", "inside", "Indetemperatur")}${stat("temperature_outside", "mdi:thermometer", "outside", "Udetemperatur")}${stat("last_update", "mdi:refresh", "updatedShort", "Sidst opdateret")}</div>` : ""}
</section>
<section class="panel charge" data-r="charge" aria-label="Opladning">
  <header class="ph">${ttdIcon("mdi:lightning-bolt", "ph-i green")}<div class="ph-t"><h3>Opladning</h3><p data-r="chargeSub">${TTD_DASH}</p></div><span class="badge" data-r="chargeBadge">${ttdIcon("mdi:power-plug", "")}<span data-r="chargeBadgeText">${TTD_DASH}</span></span></header>
  <div class="soc-row"><b data-r="chargeSoc">${TTD_DASH}</b><span data-r="chargeTarget"></span></div>
  <div class="bar" data-r="bar"><i class="bar-fill" data-r="barFill"></i><i class="bar-mark" data-r="barMark"></i></div>
  <div class="box kpis">${kpi("charger_power", "mdi:flash", "power", "Aktuel effekt")}${kpi("charging_rate", "mdi:speedometer", "rate", "Ladehastighed")}${kpi("charging_finish_time", "mdi:flag-checkered", "finish", "Forventet slut")}${kpi("charging_time_remaining", "mdi:timer-sand", "remaining", "Resttid")}</div>
  ${cfg.smart_charge ? `<div class="box ctl-host ptl" data-r="ptl" hidden><div class="ptl-h"><span class="ptl-bat" data-r="ptlBat"></span><span class="ptl-t"><b data-r="ptlTitle">Ladeplan</b><small data-r="ptlStatus"></small></span></div><div class="ctl-tl" data-r="ptlTrack"></div><p class="ptl-line" data-r="ptlLine"></p><div class="ptl-acts" data-r="ptlActs" hidden></div></div>` : ""}
  <div class="box monta">
    <button class="monta-main" data-more="${cfg.entities.monta_state ? "monta_state" : "charger_mode"}"><i class="mdot" data-r="montaDot"></i><span><b>${e(cfg.charger_label || (cfg.entities.monta_state ? "Monta" : "Lader"))}</b><small data-r="montaState">${TTD_DASH}</small></span></button>
    <div class="monta-mode" data-r="modeBox"><small>Ladertilstand</small><button class="mode-v" data-more="charger_mode" data-r="chargerMode">${TTD_DASH}</button><select class="mode-sel" data-r="modeSelect" aria-label="Ladertilstand" hidden></select></div>
    <div class="acts"><button type="button" class="btn go" data-action="start_charge" data-r="startBtn" hidden>Lad nu</button><button type="button" class="btn stop" data-action="stop_charge" data-r="stopBtn" hidden>Stop</button></div>
  </div>
  <div class="cmp" data-r="cmp" role="radiogroup" aria-label="Pris pr. ladeplan" hidden></div>
  <button class="foot" data-more="charging_price_estimate" data-r="estimate" hidden></button>
  ${cfg.smart_charge ? `<div class="sc-row sc-phone" data-r="scPhone" hidden><button type="button" class="chip" data-scinfo data-r="scInfoChip" aria-pressed="false" hidden>${ttdIcon("mdi:cellphone-message")}<span>Besked om plan</span></button><button type="button" class="chip" data-scphone data-r="scPhoneChip" aria-pressed="false">${ttdIcon("mdi:cellphone-check")}<span>Bekræft på mobil</span></button><button type="button" class="chip" data-scsend data-r="scSendChip" hidden>${ttdIcon("mdi:send")}<span>Send nu</span></button><span class="sc-info" data-r="scPhoneInfo"></span></div>` : ""}
  ${full && (cfg.chargeImage || cfg.parkedImage) ? `<div class="charge-art" data-r="chargeArt" hidden><img data-r="chargeArtImg" alt="${e(cfg.name)}" decoding="async"><svg class="cable" data-r="artCable" hidden aria-hidden="true"><path class="cable-base"/><path class="cable-flow"/><circle class="cable-port" r="5"/></svg></div>` : ""}
</section>
${cfg.smart_charge ? `<section class="panel plan sc" data-r="plan" aria-label="Smart opladning">
  <header class="ph">${ttdIcon("mdi:clock-outline", "ph-i")}<div class="ph-t"><h3>Smart opladning</h3><p data-r="scSub">${TTD_DASH}</p></div><span class="badge" data-r="scBadge"><span data-r="scBadgeText">${TTD_DASH}</span></span></header>
  <div class="sc-modes" role="radiogroup" aria-label="Ladeplan">${TTD_SC_MODES.map(([key, label, icon]) => `<button type="button" role="radio" aria-checked="false" data-scmode="${key}">${ttdIcon(icon)}<span>${label}</span>${ttdIcon("mdi:star", "sc-star")}</button>`).join("")}</div>
  <button type="button" class="btn go wide sc-confirm" data-scconfirm data-r="scConfirm" hidden>Bekræft billigst</button>
  <div class="sc-time" data-r="scTime"><div class="sc-chart" data-r="scChart" hidden></div><div class="sc-track" data-r="scTrack"></div><div class="sc-axis"><span data-r="scAxisL">Nu</span><span data-r="scAxisM"></span><span data-r="scAxisR"></span></div><p class="sc-hint" data-r="scHint" hidden></p><p class="sc-hint sc-wait" data-r="scWait" hidden></p></div>
  <div class="sc-hold" data-r="scHold" hidden>${ttdIcon("mdi:cash-clock", "ic amber")}<span><b data-r="scHoldT"></b><small data-r="scHoldS"></small><small class="sc-later" data-r="scHoldW"></small></span>
    <div class="sc-choice" role="radiogroup" aria-label="Ladning over prisgrænsen"><button type="button" role="radio" aria-checked="false" data-scwait="on" data-r="scWaitOn">Vent med resten</button><button type="button" role="radio" aria-checked="false" data-scwait="off" data-r="scWaitOff">Lad til målet</button></div></div>
  <div class="box plan-top">${cell("sc:next_charge_start", "mdi:clock-start", "blue", "scStart", "Næste start", `<em data-r="scStartDay"></em>`)}${cell("sc:next_charge_end", "mdi:check-circle-outline", "green", "scEnd", "Forventet slut", `<em data-r="scEndDay"></em>`)}${cell("sc:planned_cost", "mdi:cash", "amber", "scCost", "Planlagt pris", `<em data-r="scKwh"></em>`)}</div>
  <div class="plan-ctl" data-r="planCtl">
    <label class="ctl" data-r="socCtl" hidden>${ttdIcon("mdi:target", "ic green")}<span>Mål SOC</span><b data-r="socCtlVal">${TTD_DASH}</b><input type="range" data-r="socRange" aria-label="Mål SOC"></label>
    <div class="soc-ok" data-r="socOk" role="group" aria-label="Bekræft nyt mål" hidden>${ttdIcon("mdi:target", "ic amber")}<span data-r="socOkText"></span><button type="button" class="btn" data-socundo>Fortryd</button><button type="button" class="btn go" data-socok>Bekræft</button></div>
    <label class="ctl" data-r="dlCtl" hidden>${ttdIcon("mdi:calendar-clock", "ic blue")}<span>Klar senest</span><input type="time" data-r="dlInput" aria-label="Klar senest"></label>
    <button type="button" class="ctl rb-open" data-rbopen data-r="rbOpen" aria-haspopup="dialog" hidden>${ttdIcon("mdi:calendar-clock", "ic blue")}<span class="rb-open-t"><span>Klar senest</span><small data-r="rbSrc"></small></span><b data-r="rbVal">${TTD_DASH}</b>${ttdIcon("mdi:chevron-right", "rb-chev")}</button>
    <div class="ctl2" data-r="scFixed" hidden>${ttdIcon("mdi:clock-time-four-outline", "ic blue")}<span>Fast tid</span><input type="time" data-r="scFixedStart" aria-label="Fast ladestart"><span>–</span><input type="time" data-r="scFixedEnd" aria-label="Fast ladeslut"></div>
    <div class="ctl2" data-r="scCap" hidden>${ttdIcon("mdi:cash-lock", "ic amber")}<span>Prisloft</span><input type="number" step="0.05" inputmode="decimal" data-r="scCapInput" aria-label="Prisloft"><small data-r="scCapUnit"></small><span>min.</span><input type="number" step="5" min="0" max="100" inputmode="numeric" data-r="scMinInput" aria-label="Minimum-SOC"><small>%</small></div>
    <div class="ctl2" data-r="scLimit" hidden><button type="button" class="chip" data-sclimit data-r="scLimitChip" aria-pressed="false">${ttdIcon("mdi:cash-lock")}<span>Spørg før dyr ladning</span></button><span class="sc-grp" data-r="scMax" hidden><span>maks.</span><input type="number" step="0.05" min="0" inputmode="decimal" placeholder="auto" data-r="scMaxInput" aria-label="Fast prisgrænse (tom eller 0 = kun besparelsen tæller)" title="Kvarterer op til denne pris lades altid i nat. Tom (0) = kun besparelsen tæller."><small data-r="scMaxUnit"></small></span><span data-r="scLimitPre">spar mindst</span><input type="number" step="0.05" inputmode="decimal" data-r="scLimitInput" aria-label="Maks. pris i Billigst"><small data-r="scLimitUnit"></small><span>behold</span><input type="number" step="5" min="0" max="100" inputmode="numeric" data-r="scFloorInput" aria-label="Lad altid op til"><small>%</small><span class="sc-info" data-r="scLimitInfo"></span></div>
    <div class="sc-row" data-r="scCapX" hidden><button type="button" class="chip" data-sccapx data-r="scCapXChip" aria-pressed="false">${ttdIcon("mdi:cash-lock-open")}<span>Overskrid ved behov</span></button><span class="sc-info" data-r="scCapXInfo"></span></div>
    <div class="sc-row sc-res" data-r="scRes" role="radiogroup" aria-label="Priser i kvarterer eller timer" hidden>${ttdIcon("mdi:timer-cog-outline", "ic blue")}<span class="sc-res-l">Priser i</span><button type="button" class="chip" role="radio" data-scres="quarter" aria-checked="false">Kvarter</button><button type="button" class="chip" role="radio" data-scres="hour" aria-checked="false">Time</button></div>
  </div>
  <div class="sc-trip" data-r="scTrip">
    <button type="button" class="sc-trip-h" data-sctrip data-r="scTripHead" aria-expanded="false">${ttdIcon("mdi:map-marker-path", "ic blue")}<span><b>Midlertidig plan</b><small data-r="scTripSum">${TTD_DASH}</small></span>${ttdIcon("mdi:chevron-down", "sc-chev")}</button>
    <div class="sc-trip-b" data-r="scTripBody" hidden>
      <label class="sc-f"><span>Afgang</span><input type="datetime-local" data-r="scDep"></label>
      <label class="sc-f"><span>Destination (valgfri)</span><input type="text" data-r="scDest" placeholder="Adresse, by eller zone.arbejde" enterkeyhint="done" autocomplete="off"></label>
      <div class="sc-row"><button type="button" class="chip" data-scround data-r="scRound" aria-pressed="false">${ttdIcon("mdi:swap-horizontal")}<span>Tur/retur</span></button><span class="sc-info" data-r="scTripInfo"></span></div>
      <button type="button" class="btn stop wide" data-scclear data-r="scClear" hidden>Ryd midlertidig plan</button>
    </div>
  </div>
  <div class="sc-trip sc-def" data-r="scDef" hidden>
    <button type="button" class="sc-trip-h" data-scdef data-r="scDefHead" aria-expanded="false">${ttdIcon("mdi:calendar-star", "ic amber")}<span><b>Standardplan</b><small data-r="scDefSum">${TTD_DASH}</small></span>${ttdIcon("mdi:chevron-down", "sc-chev")}</button>
    <div class="sc-trip-b" data-r="scDefBody" hidden>
      <p class="sc-note">Kører når kablet sættes i. Vælger du en anden plan, kører den én gang og går så tilbage hertil.</p>
      <div class="sc-modes sc-defs" role="radiogroup" aria-label="Standardplan">${TTD_SC_MODES.filter(([key]) => TTD_SC_DEFAULTS.includes(key)).map(([key, label, icon]) => `<button type="button" role="radio" aria-checked="false" data-scdefault="${key}">${ttdIcon(icon)}<span>${label}</span></button>`).join("")}</div>
    </div>
  </div>
  <div class="sc-trip sc-opt" data-r="scOpt" hidden>
    <button type="button" class="sc-trip-h" data-scopt data-r="scOptHead" aria-expanded="false">${ttdIcon("mdi:tune-variant", "ic green")}<span><b>Smarte valg</b><small data-r="scOptSum">${TTD_DASH}</small></span>${ttdIcon("mdi:chevron-down", "sc-chev")}</button>
    <div class="sc-trip-b" data-r="scOptBody" hidden>
      <div class="sc-opts">${TTD_SC_OPTIONS.map(([role, label, icon]) => `<button type="button" class="chip" data-scoptrole="${role}" aria-pressed="false" hidden>${ttdIcon(icon)}<span>${label}</span></button>`).join("")}</div>
      <div class="ctl2" data-r="scQuiet" hidden>${ttdIcon("mdi:bell-sleep-outline", "ic blue")}<span>Lydløs</span><input type="time" data-r="scQuietFrom" aria-label="Lydløs fra"><span>–</span><input type="time" data-r="scQuietUntil" aria-label="Lydløs til"></div>
      <p class="sc-note" data-r="scOptNote"></p>
    </div>
  </div>
</section>` : `<section class="panel plan" data-r="plan" aria-label="Smart ladeplan"${cfg.plan ? "" : " hidden"}>
  <header class="ph">${ttdIcon("mdi:clock-outline", "ph-i")}<div class="ph-t"><h3>Smart ladeplan</h3><p data-r="planSub">${TTD_DASH}</p></div><span class="badge" data-r="planBadge"><span data-r="planBadgeText">${TTD_DASH}</span></span></header>
  <div class="box plan-top">${cell("best_charge_start", "mdi:clock-start", "blue", "bestStart", "Bedste start")}${cell("best_charge_end", "mdi:check-circle-outline", "green", "bestEnd", "Forventet slut")}${cell("best_charge_price", "mdi:cash", "amber", "bestPrice", "Forventet pris", `<em data-r="bestPriceKwh"></em>`)}</div>
  <div class="box plan-mid">${cell("missing_wall_kwh", "mdi:alarm", "orange", "missing", "Mangler for mål")}${cell("charge_minutes_needed", "mdi:timer-outline", "green", "minutes", "Ladetid (est.)")}</div>
  <button type="button" class="btn go wide" data-action="apply_plan" data-r="applyBtn" hidden>Brug ladeplan</button>
  <div class="plan-ctl" data-r="planCtl" hidden>
    <label class="ctl" data-r="socCtl" hidden>${ttdIcon("mdi:target", "ic green")}<span>Mål SOC</span><b data-r="socCtlVal">${TTD_DASH}</b><input type="range" data-r="socRange" aria-label="Mål SOC"></label>
    <div class="soc-ok" data-r="socOk" role="group" aria-label="Bekræft nyt mål" hidden>${ttdIcon("mdi:target", "ic amber")}<span data-r="socOkText"></span><button type="button" class="btn" data-socundo>Fortryd</button><button type="button" class="btn go" data-socok>Bekræft</button></div>
    <label class="ctl" data-r="dlCtl" hidden>${ttdIcon("mdi:calendar-clock", "ic blue")}<span>Klar senest</span><input type="time" data-r="dlInput" aria-label="Klar senest"></label>
  </div>
</section>`}
${full ? `<section class="panel map" data-r="mapPanel" aria-label="Bilens placering">
  <header class="ph">${ttdIcon("mdi:map-marker-radius", "ph-i blue")}<div class="ph-t"><h3>Bilens placering</h3></div><span class="meta" data-r="mapMeta"><i class="dot"></i><span data-r="mapMetaText">${TTD_DASH}</span></span><button type="button" class="icon-btn" data-chargers data-r="chargersBtn" aria-pressed="false" aria-label="Ladesteder" title="Ladesteder" hidden>${ttdIcon("mdi:ev-station")}</button><button type="button" class="icon-btn" data-mapstyle data-r="styleBtn" aria-pressed="false" aria-label="Satellitbillede" title="Satellitbillede" hidden>${ttdIcon("mdi:satellite-variant")}</button><button class="icon-btn" data-more="location" aria-label="Åbn placering">${ttdIcon("mdi:arrow-expand")}</button></header>
  <div class="map-body"><div class="map-host" data-r="mapHost"></div><p class="map-empty" data-r="mapEmpty" hidden></p><div class="seg" role="group" aria-label="Vis rute for" data-r="mapSeg">${ranges}</div></div>
</section>
<section class="panel tpms" data-r="tpms" aria-label="Dæktryk">
  <header class="ph">${ttdIcon("mdi:tire", "ph-i")}<div class="ph-t"><h3>Dæktryk</h3><p data-r="tpmsSum">${TTD_DASH}</p></div><span class="meta" data-r="tpmsTime"></span></header>
  <div class="tpms-body">${tire("tpms_front_left", "tFL", "Venstre for")}${tire("tpms_front_right", "tFR", "Højre for")}${cfg.topImage ? `<div class="topcar topphoto" data-r="topPhoto"><img data-r="topImg" alt="" decoding="async">${["FL", "FR", "RL", "RR"].map((key) => `<i class="wheel" data-r="w${key}" style="left:${cfg.topWheels[key.toLowerCase()][0]}%;top:${cfg.topWheels[key.toLowerCase()][1]}%"></i>`).join("")}</div>` : TTD_TOP_CAR}${tire("tpms_rear_left", "tRL", "Venstre bag")}${tire("tpms_rear_right", "tRR", "Højre bag")}</div>
</section>
<section class="panel list drive" data-r="drive" aria-label="Kørsel og historik">
  <header class="ph">${ttdIcon("mdi:road-variant", "ph-i")}<div class="ph-t"><h3>Kørsel &amp; historik</h3></div><button class="icon-btn" data-more="trips" aria-label="Åbn ture">${ttdIcon("mdi:chevron-right")}</button></header>
  <div class="rows">${row("monthly_performance", "Denne måned", "month")}${row("total_distance", "Total distance", "totalDist")}${row("trips", "Antal ture", "tripCount")}<button class="row" data-more="last_trip"><span class="row-l">Seneste tur</span><span class="row-v stack"><b data-r="lastTrip">${TTD_DASH}</b><small data-r="lastTripMeta"></small></span></button></div>
</section>
<section class="panel list econ" data-r="econ" aria-label="Økonomi">
  <header class="ph">${ttdIcon("mdi:chart-bar", "ph-i")}<div class="ph-t"><h3>Økonomi <span class="light">(EV Ledger)</span></h3></div><button class="icon-btn" data-more="charges" aria-label="Åbn opladninger">${ttdIcon("mdi:chevron-right")}</button></header>
  <div class="rows">${row("cost_per_km", "Pris pr. km", "costKm")}${row("efficiency_score", "Effektivitetsscore", "effScore")}${row("monthly_performance", "Månedlig performance", "monthly", ttdIcon("mdi:arrow-up", "trend"))}${row("charges", "Antal opladninger", "chargeCount")}${row("charges_needing_price", "Opladninger uden pris", "noPrice", ttdIcon("mdi:alert-outline", "trend"))}${cfg.entities.monta_wallet ? row("monta_wallet", "Monta wallet", "wallet") : ""}</div>
</section>
<section class="panel last" data-r="last" aria-label="Seneste opladning">
  <header class="ph">${ttdIcon("mdi:ev-station", "ph-i")}<div class="ph-t"><h3>Seneste opladning</h3></div><button class="icon-btn" data-more="last_charge" data-r="lastMore" aria-label="Åbn seneste opladning">${ttdIcon("mdi:chevron-right")}</button></header>
  <div class="lc-grid">${item("", "mdi:battery-charging-medium", "lcKwh", "Opladet energi")}${item("", "mdi:cash", "lcPrice", "Total pris")}${item("", "mdi:calendar-month-outline", "lcStart", "Starttidspunkt")}${item("", "mdi:clock-outline", "lcDuration", "Varighed")}</div>
  <p class="lc-foot" data-r="lcFoot"></p><p class="lc-foot" data-r="lcMonta"></p>
  <button type="button" class="lc-fix" data-ceopen data-r="lcFix" hidden>${ttdIcon("mdi:pencil-outline", "lc-fix-i")}<span class="lc-fix-t"><b data-r="lcFixPrice"></b><small data-r="lcFixSrc"></small></span><span class="lc-fix-go">Ret pris</span></button>
  ${cfg.smart_charge ? `<div class="sc-trip pc" data-r="pc" hidden>
    <button type="button" class="sc-trip-h" data-pctoggle data-r="pcHead" aria-expanded="false">${ttdIcon("mdi:map-marker-plus-outline", "ic blue")}<span><b>Offentlig ladning</b><small data-r="pcSum">Log kWh og pris</small></span>${ttdIcon("mdi:chevron-down", "sc-chev")}</button>
    <div class="sc-trip-b" data-r="pcBody" hidden>
      <div class="pc-f"><label class="sc-f"><span>kWh</span><input type="number" step="0.1" min="0" inputmode="decimal" data-r="pcKwh"></label><label class="sc-f"><span>Pris (kr.)</span><input type="number" step="0.01" min="0" inputmode="decimal" data-r="pcPrice"></label></div>
      <label class="sc-f"><span>Sted (valgfri)</span><input type="text" data-r="pcPlace" placeholder="Fx Clever Aarhus" autocomplete="off"></label>
      <button type="button" class="btn go wide" data-pcsave data-r="pcSave">Gem offentlig ladning</button>
      <p class="sc-note" data-r="pcNote"></p>
    </div>
  </div>` : ""}
</section>
<section class="panel daily" data-r="daily" aria-label="Dagligt forbrug">
  <header class="ph">${ttdIcon("mdi:chart-bar", "ph-i")}<div class="ph-t"><h3>Dagligt forbrug</h3><p data-r="dailySub">${TTD_DASH}</p></div><select class="range-sel" data-r="rangeSelect" aria-label="Periode">${chartOptions}</select></header>
  <div class="chart" data-r="chart" tabindex="0" role="img" aria-label="Dagligt forbrug">
    <div class="sm" data-r="smD"><div class="sm-h"><i class="sw sw-d"></i><span>Kørsel</span><em data-r="maxD"></em></div><div class="bars bars-d" data-r="barsD"></div></div>
    <div class="sm" data-r="smE"><div class="sm-h"><i class="sw sw-e"></i><span>Opladning</span><em data-r="maxE"></em></div><div class="bars bars-e" data-r="barsE"></div></div>
    <div class="axis" data-r="axis"></div>
    <div class="tip" data-r="tip" hidden><span class="tip-l" data-r="tipL"></span><span class="tip-r" data-r="tipDRow"><i class="key key-d"></i><b data-r="tipD"></b></span><span class="tip-r" data-r="tipERow"><i class="key key-e"></i><b data-r="tipE"></b></span></div>
    <p class="chart-empty" data-r="chartEmpty" hidden></p>
  </div>
</section>
${cfg.smart_charge ? `<section class="panel cost" data-r="cost" aria-label="Ladeudgifter" hidden>
  <header class="ph">${ttdIcon("mdi:calendar-month", "ph-i")}<div class="ph-t"><h3>Ladeudgifter <span class="light">(EV Ledger)</span></h3><p data-r="costSub">${TTD_DASH}</p></div><div class="cost-year"><b data-r="costYear">${TTD_DASH}</b><small data-r="costYearSub"></small></div></header>
  <div class="cost-wrap"><div class="cost-chart" data-r="costChart" role="img" aria-label="Ladeudgifter pr. måned"></div><div class="tip cost-tip" data-r="costTip" hidden></div></div>
  <div class="cost-key"><span><i class="sw cost-home"></i>Hjemme</span><span><i class="sw cost-public"></i>Ude</span><span data-r="costBeforeKey" hidden><i class="sw cost-before"></i>Samme måned året før</span><em data-r="costNote"></em></div>
</section>
${cfg.tyres !== false ? `<section class="panel tyres" data-r="tyres" aria-label="Hjul" hidden><div data-r="tyresHost"></div></section>` : ""}` : ""}` : ""}
${cfg.navigation_path ? `<button type="button" class="panel navlink" data-nav>${ttdIcon("mdi:car-info", "ph-i")}<span>${full ? "Åbn hele Tesla-oversigten" : "Flere indstillinger på Tesla-siden"}</span>${ttdIcon("mdi:chevron-right")}</button>` : ""}
</div>${cfg.smart_charge ? `<dialog class="rb-dlg" data-r="rbDlg" aria-label="Klar senest"><div class="rb" data-r="rbBody"></div></dialog>` : ""}<dialog class="rb-dlg ce-dlg" data-r="ceDlg" aria-label="Ret opladning"><div class="rb ce" data-r="ceBody"></div></dialog></div>`;
}

const TTD_STYLES = `
:host{display:block}
*{box-sizing:border-box}
.wrap{container:ttd / inline-size;
  --tdc-text:var(--primary-text-color,#eef2f7);--tdc-muted:var(--secondary-text-color,#94a3b8);
  --tdc-panel:var(--ha-card-background,var(--card-background-color,#111827));
  --tdc-line:color-mix(in srgb,var(--tdc-text) 9%,transparent);--tdc-tile:color-mix(in srgb,var(--tdc-text) 3%,transparent);
  --tdc-hover:color-mix(in srgb,var(--tdc-text) 7%,transparent);--tdc-grid:color-mix(in srgb,var(--tdc-text) 16%,transparent);
  --tdc-green:var(--success-color,#22c55e);--tdc-orange:var(--warning-color,#f59e0b);--tdc-red:var(--error-color,#ef4444);
  --tdc-blue:var(--primary-color,#2f81f7);--tdc-amber:#eab308;--tdc-drive:#1baf7a;--tdc-energy:#2a78d6;
  --tdc-radius:16px;--tdc-gap:16px;--tdc-pad:20px;color:var(--tdc-text);line-height:1.3}
.wrap.dark{--tdc-drive:#199e70;--tdc-energy:#3987e5;color-scheme:dark}
[data-tone=ok]{--tone:var(--tdc-green)}[data-tone=warn]{--tone:var(--tdc-orange)}[data-tone=crit]{--tone:var(--tdc-red)}
[data-tone=info]{--tone:var(--tdc-blue)}[data-tone=muted]{--tone:var(--tdc-muted)}
button,select,input{font:inherit;color:inherit}
button{background:none;border:0;padding:0;margin:0;text-align:inherit;cursor:pointer;border-radius:10px}
button[data-dead]{cursor:default}
button:focus-visible,select:focus-visible,input:focus-visible,.chart:focus-visible{outline:2px solid var(--tdc-blue);outline-offset:2px}
[hidden]{display:none!important}
ha-icon{--mdc-icon-size:22px;display:inline-flex;flex:none;color:var(--tdc-muted)}
h2,h3,p{margin:0}
.muted{color:var(--tdc-muted)}
.dash{display:grid;gap:var(--tdc-gap);grid-template-columns:repeat(12,minmax(0,1fr));
  grid-template-areas:"hero hero hero hero hero hero hero map map map map map" "charge charge charge charge charge plan plan plan plan tpms tpms tpms" "drive drive drive econ econ econ last last last daily daily daily"}
.panel{position:relative;min-width:0;container:panel / inline-size;padding:var(--tdc-pad);border-radius:var(--tdc-radius);background:var(--tdc-panel);border:1px solid var(--tdc-line);box-shadow:var(--tdc-shadow,none);overflow:hidden}
/* The cost panel takes a full row of its own below the others, whatever the layout. */
.cost{grid-column:1/-1;grid-row:-1}
/* The tyre sets (EV Ledger, ha-ev-tyre-card inside) take a full row too. */
.tyres{grid-column:1/-1}
.cost .ph{align-items:flex-start}
.cost-year{display:grid;justify-items:end;gap:1px;margin-left:auto;text-align:right}.cost-year b{font-size:22px;font-weight:750;line-height:1.1;white-space:nowrap}.cost-year small{font-size:12px;color:var(--tdc-muted);white-space:nowrap}
.cost-wrap{position:relative}
.tip.cost-tip{top:-10px;min-width:170px;max-width:240px;background:var(--tdc-dlg-bg,#121821);box-shadow:0 10px 28px rgba(0,0,0,.5)}.cost-tip b{font-size:15px}.cost-tip-r{color:var(--tdc-muted);font-size:12px}
.cost-m{cursor:pointer}
.cost-chart{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px;height:150px;margin-top:8px}
.cost-m{display:grid;grid-template-rows:auto minmax(0,1fr) auto;justify-items:center;gap:4px;min-width:0;height:100%}
.cost-m em{font-style:normal;font-size:12px;font-weight:650;color:var(--tdc-muted);white-space:nowrap}
.cost-col{display:flex;align-items:flex-end;justify-content:center;width:100%;min-height:0}
.cost-bar{display:flex;flex-direction:column-reverse;width:min(100%,44px);border-radius:6px 6px 2px 2px;overflow:hidden;background:color-mix(in srgb,var(--tdc-text) 10%,transparent)}
.cost-bar i{display:block;width:100%;min-height:0}.cost-bar .h{background:var(--tdc-blue)}.cost-bar .p{background:var(--tdc-amber)}
.cost-m small{font-size:12px;color:var(--tdc-muted)}
.cost-m[data-now] small,.cost-m[data-now] em{color:var(--tdc-text);font-weight:750}
.cost-m[data-now] .cost-bar{box-shadow:0 0 0 2px color-mix(in srgb,var(--tdc-blue) 40%,transparent)}
.cost-m[data-empty] em{opacity:.5}
.cost-key{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:10px;font-size:12px;color:var(--tdc-muted)}.cost-key span{display:inline-flex;align-items:center;gap:6px}.cost-key em{margin-left:auto;font-style:normal}
.sw.cost-home{background:var(--tdc-blue)}.sw.cost-public{background:var(--tdc-amber)}
.cost-before{display:block;flex:0 0 auto;width:min(26%,14px);border-radius:4px 4px 1px 1px;background:color-mix(in srgb,var(--tdc-text) 20%,transparent)}
.sw.cost-before{background:color-mix(in srgb,var(--tdc-text) 20%,transparent)}
.cost-chart[data-before] .cost-col{gap:3px}.cost-chart[data-before] .cost-bar{width:min(66%,36px)}
@container ttd (max-width:699px){.cost .ph{flex-wrap:wrap}.cost-year{flex-basis:100%;display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 8px;margin:4px 0 0;text-align:left}.cost-year b{font-size:20px}.cost-chart{gap:3px;height:130px}.cost-m em{font-size:9px}.cost-m small{font-size:10px}}
.hero{grid-area:hero}.map{grid-area:map}.charge{grid-area:charge}.plan{grid-area:plan}.tpms{grid-area:tpms}.drive{grid-area:drive}.econ{grid-area:econ}.last{grid-area:last}.daily{grid-area:daily}
.ph{display:flex;align-items:center;gap:12px;margin-bottom:16px;min-width:0}
.ph-i{--mdc-icon-size:28px;color:var(--tdc-text)}
.ph-t{flex:1;min-width:0}
.ph h3{font-size:20px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ph h3 .light{font-weight:400;color:var(--tdc-muted);font-size:16px}
.ph p{margin-top:4px;font-size:14px;color:var(--tdc-muted);overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.meta{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--tdc-muted);white-space:nowrap;min-width:0}
.meta>span{overflow:hidden;text-overflow:ellipsis}
.dot{width:9px;height:9px;border-radius:50%;background:var(--tone,var(--tdc-muted));flex:none}
.icon-btn{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:10px;border:1px solid var(--tdc-line);flex:none}
.icon-btn:hover{background:var(--tdc-hover)}
.green{color:var(--tdc-green)}.blue{color:var(--tdc-blue)}.amber{color:var(--tdc-amber)}.orange{color:var(--tdc-orange)}
.box{border:1px solid var(--tdc-line);border-radius:12px;background:var(--tdc-tile)}
.badge{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:999px;font-size:14px;font-weight:600;white-space:nowrap;flex:none;
  background:color-mix(in srgb,var(--tone,var(--tdc-muted)) 16%,transparent);border:1px solid color-mix(in srgb,var(--tone,var(--tdc-muted)) 45%,transparent)}
.badge ha-icon{--mdc-icon-size:18px;color:var(--tone)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:0 14px;border-radius:10px;font-size:14px;font-weight:600;white-space:nowrap}
.btn.go{background:var(--tdc-blue);color:var(--text-primary-color,#fff)}
.btn.stop{background:color-mix(in srgb,var(--tdc-red) 16%,transparent);color:var(--tdc-red);border:1px solid color-mix(in srgb,var(--tdc-red) 40%,transparent)}
.btn[data-armed]{outline:2px solid var(--tdc-orange);outline-offset:2px}
.btn.wide{width:100%;min-height:42px;margin-top:14px;font-size:15px}
.stat:hover,.kpi:hover,.cell:hover,.row:hover,.tire:hover,.monta-main:hover,.mode-v:hover,.foot:hover,.updated:hover,.pill:hover{background:var(--tdc-hover)}
button[data-dead]:hover{background:none}
/* hero */
.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(150px,1fr) auto;column-gap:16px;padding:24px;
  background:radial-gradient(90% 70% at 42% 52%,color-mix(in srgb,var(--tdc-text) 6%,transparent),transparent 70%),var(--tdc-panel)}
.hero-info{grid-area:1/1/2/2;position:relative;z-index:1;min-width:0}
.hero-title{display:flex;align-items:center;gap:14px;min-width:0}
.name{font-size:36px;font-weight:700;letter-spacing:-.02em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.pill{display:inline-flex;align-items:center;gap:8px;padding:4px 8px;margin-left:-8px;font-size:16px;font-weight:600;color:var(--tone);white-space:nowrap}
.model{margin-top:6px;font-size:19px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.updated{display:grid;margin:18px 0 0 -6px;padding:4px 6px;font-size:14px;color:var(--tdc-muted)}
.updated span+span{color:var(--tdc-text)}
.hero-car{grid-area:1/1/3/2;display:flex;align-items:flex-end;justify-content:center;min-width:0;min-height:0;padding:36px 0 0 16%;pointer-events:none}
.hero-car img{display:block;width:100%;height:100%;max-height:270px;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 16px 16px rgba(0,0,0,.35))}
.ring-wrap{grid-area:1/2/3/3;align-self:center;position:relative;width:var(--ring,196px);height:var(--ring,196px);border-radius:50%}
.ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:9}
.ring-track{stroke:color-mix(in srgb,var(--tdc-text) 12%,transparent)}
.ring-fill{stroke:var(--tone,var(--tdc-green));stroke-linecap:round;transition:stroke-dasharray .6s ease,stroke .3s ease}
.ring-fill[data-zero]{stroke:none}
.hero[data-charging] .ring-fill{filter:drop-shadow(0 0 5px color-mix(in srgb,var(--tone) 60%,transparent))}
.ring-t{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.soc{display:flex;align-items:baseline;font-weight:700;letter-spacing:-.02em}
.soc b{font-size:var(--soc-size,46px);line-height:1}
.soc small{font-size:calc(var(--soc-size,46px) * .5);margin-left:3px}
.soc .bolt{display:none;--mdc-icon-size:22px;color:var(--tone);align-self:center;margin-left:2px}
.hero[data-charging] .soc .bolt{display:inline-flex}
.range{margin-top:6px;font-size:20px;font-weight:600}
.ring-t .muted{font-size:13px}
.hero-stats{grid-area:3/1/4/3;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}
.stat{display:flex;align-items:center;gap:12px;min-width:0;padding:13px 14px;border:1px solid var(--tdc-line);border-radius:12px;background:var(--tdc-tile)}
.stat ha-icon{--mdc-icon-size:28px}
.stat-t{display:grid;min-width:0}
.stat b,.kpi b,.cell b,.tire b,.lc b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stat b{font-size:17px}
.stat small,.kpi small,.cell small,.tire small,.lc small{font-size:14px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* charge */
.charge{display:flex;flex-direction:column}
.charge>*{flex:0 0 auto}
.charge .sc-phone{margin-top:14px}
/* The car's own photo fills what is left of the panel; its dark backdrop fades into the panel. */
.charge>.charge-art{flex:1 1 0;position:relative;min-height:150px;margin-top:12px}
.charge-art img[data-fade],.hero-car img[data-photo]{--fx:linear-gradient(90deg,transparent,#000 13%,#000 87%,transparent);--fy:linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent);
  -webkit-mask-image:var(--fx),var(--fy);-webkit-mask-composite:source-in;mask-image:var(--fx),var(--fy);mask-composite:intersect}
.charge-art img{position:absolute;inset:0;margin:auto;width:auto;height:100%;max-width:100%;object-fit:contain}
.charge-art img:not([data-fade]){filter:drop-shadow(0 14px 14px rgba(0,0,0,.35))}
/* The charging cable while charging: a green glow with bright pulses running into the car, the port breathing. */
.hero-car{position:relative}
.cable{position:absolute;pointer-events:none;overflow:visible}
.cable path{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.cable .cable-base{stroke:color-mix(in srgb,var(--tdc-green) 70%,transparent);stroke-width:3.5px;filter:drop-shadow(0 0 4px var(--tdc-green))}
.cable .cable-flow{stroke:#eafff3;stroke-width:2.5px;stroke-dasharray:14px 30px;animation:ttdCableFlow 1.1s linear infinite;filter:drop-shadow(0 0 5px var(--tdc-green)) drop-shadow(0 0 2px #fff)}
.cable .cable-port{fill:var(--tdc-green);filter:drop-shadow(0 0 6px var(--tdc-green));animation:ttdPortPulse 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes ttdCableFlow{to{stroke-dashoffset:44px}}
@keyframes ttdPortPulse{50%{opacity:.45;transform:scale(1.6)}}
@media (prefers-reduced-motion:reduce){.cable .cable-flow,.cable .cable-port{animation:none}}
.hero-car img[data-photo]{width:auto;max-width:100%;filter:none}
.charge[data-active]{border-color:color-mix(in srgb,var(--tdc-green) 38%,var(--tdc-line))}
.charge[data-active]::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(70% 55% at 0 0,color-mix(in srgb,var(--tdc-green) 9%,transparent),transparent 70%)}
.soc-row{display:flex;justify-content:space-between;gap:12px;font-size:19px;font-weight:600}
.soc-row span{font-weight:500}
.bar{position:relative;height:14px;margin:10px 0 18px;border-radius:999px;background:color-mix(in srgb,var(--tdc-text) 12%,transparent)}
.bar-fill{position:absolute;left:0;top:0;bottom:0;width:calc(var(--soc,0) * 1%);border-radius:inherit;background:var(--tone,var(--tdc-green));transition:width .6s ease}
.bar-mark{position:absolute;top:-5px;bottom:-5px;width:3px;left:calc(var(--target,0) * 1% - 1.5px);border-radius:2px;background:var(--tdc-text)}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
${CTL_CSS}
.ptl{position:relative;margin-top:14px;padding:12px 16px 10px;--ctl-ev:var(--dashboard-ev,#b7a4ff);--ctl-muted:var(--tdc-muted);--ctl-good:var(--tdc-green);--ctl-warn:var(--tdc-orange);--ctl-text:var(--tdc-text);--ctl-bat-ok:var(--tdc-green);--ctl-bat-warn:var(--tdc-orange);--ctl-bat-crit:var(--tdc-red)}
.ptl-h{display:flex;align-items:center;gap:10px;margin-bottom:10px;min-width:0}
.ptl-bat{flex:none;display:flex}.ptl-bat .ctl-bat{width:36px;height:18px;margin-right:4px}
.ptl-t{display:grid;min-width:0}.ptl-t b{font-size:15px;font-weight:650}
.ptl-t small{font-size:13px;color:var(--tdc-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ptl-line{margin:6px 0 0;font-size:12.5px;color:var(--tdc-muted)}
.ptl-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.ptl-acts .btn{flex:1 1 auto}
.kpi{display:grid;gap:6px;min-width:0;padding:14px 16px;border-radius:0}
.kpi+.kpi{border-left:1px solid var(--tdc-line)}
.kpi b{font-size:18px}
.monta{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;margin-top:14px}
.monta-main{display:flex;align-items:center;gap:12px;min-width:0;padding:12px 16px;border-radius:12px 0 0 12px}
.monta-main>span{display:grid;min-width:0}
.monta-main b{font-size:16px;font-weight:600}
.monta-main small{display:flex;align-items:center;gap:6px;font-size:14px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mdot{width:22px;height:22px;border-radius:50%;flex:none;display:grid;place-items:center;background:color-mix(in srgb,var(--tone,var(--tdc-muted)) 22%,transparent)}
.mdot::after{content:"";width:10px;height:10px;border-radius:50%;background:var(--tone,var(--tdc-muted))}
.monta-mode{display:grid;gap:2px;padding:8px 16px;border-left:1px solid var(--tdc-line);min-width:0}
.monta-mode small{font-size:13px;color:var(--tdc-muted)}
.mode-v{font-size:15px;font-weight:600;padding:2px 6px;margin:0 -6px;white-space:nowrap}
.mode-sel{min-height:30px;border-radius:8px;border:1px solid var(--tdc-line);background:var(--tdc-panel);padding:0 8px;font-size:14px}
.acts{display:flex;gap:8px;padding:8px 12px}
.acts:not(:has(.btn:not([hidden]))){display:none}
.foot{display:block;width:100%;margin-top:12px;padding:6px 8px;font-size:13px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* price per plan */
.cmp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}
.cmp-i{display:grid;align-content:start;gap:3px;min-width:0;padding:12px 14px;border-radius:12px;border:1px solid var(--tdc-line);
  background:color-mix(in srgb,var(--primary-text-color,#fff) 5%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))))}
.cmp-i:hover{background:var(--tdc-hover)}
.cmp-i small{font-size:13px;font-weight:700;color:var(--tdc-muted)}
.cmp-i b{font-size:21px;font-weight:750;line-height:1.15;color:var(--tdc-text);white-space:nowrap}
.cmp-i span{font-size:13px;color:color-mix(in srgb,var(--tdc-text) 75%,transparent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cmp-i em{font-style:normal;font-size:13px;font-weight:700;color:var(--tdc-green)}
.cmp-i[aria-checked=true]{border-color:color-mix(in srgb,var(--tdc-blue) 70%,transparent);background:color-mix(in srgb,var(--tdc-blue) 16%,transparent)}
.cmp-i[aria-checked=true] small{color:var(--tdc-blue)}
.cmp-i[data-armed],.sc-modes button[data-armed],.chip[data-armed]{outline:2px solid var(--tdc-orange);outline-offset:2px}
.cmp-i[data-armed] small{color:var(--tdc-orange)}
@container panel (max-width:420px){.cmp{grid-template-columns:minmax(0,1fr)}.cmp-i{grid-template-columns:auto 1fr;column-gap:12px}.cmp-i b{grid-row:1/3;grid-column:1;align-self:center}}
/* plan */
.plan-top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.plan-mid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px}
.cell{display:flex;align-items:flex-start;gap:8px;min-width:0;padding:14px 12px;border-radius:0}
.cell+.cell{border-left:1px solid var(--tdc-line)}
.cell ha-icon{--mdc-icon-size:20px}
.cell small{font-size:13px}
.cell>span{display:grid;gap:4px;min-width:0}
.cell b{font-size:19px}
.cell em{font-style:normal;font-size:12px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.plan-ctl{display:grid;gap:10px;margin-top:14px}
.soc-ok{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;border:1px solid color-mix(in srgb,var(--tdc-amber) 45%,transparent);background:color-mix(in srgb,var(--tdc-amber) 10%,transparent);font-size:13px}
.soc-ok .btn{min-height:32px;padding:0 12px;border:1px solid var(--tdc-line)}.soc-ok .btn.go{border-color:transparent}
.ctl{display:grid;grid-template-columns:auto auto auto minmax(0,1fr);align-items:center;gap:10px;font-size:14px;color:var(--tdc-muted)}
.ctl b{color:var(--tdc-text);font-weight:600;min-width:44px}
.rb-open{width:100%;grid-template-columns:auto minmax(0,1fr) auto auto;padding:10px 12px;border:1px solid var(--tdc-line);border-radius:14px;background:color-mix(in srgb,var(--tdc-blue) 6%,transparent);text-align:left;cursor:pointer}
.rb-open:hover{border-color:color-mix(in srgb,var(--tdc-blue) 45%,transparent)}
.rb-open-t{display:grid;gap:1px;min-width:0}.rb-open-t span{color:var(--tdc-text);font-weight:600}.rb-open-t small{font-size:12px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rb-open b{white-space:nowrap}.rb-chev{color:var(--tdc-muted);--mdc-icon-size:20px}
.rb-dlg{width:min(560px,calc(100vw - 20px));max-height:min(88vh,860px);padding:0;border:1px solid color-mix(in srgb,var(--tdc-text) 12%,transparent);border-radius:24px;background-color:var(--tdc-dlg-bg,#121821);background-image:linear-gradient(180deg,color-mix(in srgb,var(--tdc-blue) 8%,transparent),transparent 140px);color:var(--tdc-text);color-scheme:dark;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:auto;overscroll-behavior:contain}
.rb-dlg::backdrop{background:rgba(3,7,13,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.rb{display:grid;gap:14px;padding:18px}
.rb button{font:inherit;color:inherit;cursor:pointer;background:none;border:0}
.rb-h{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center}
.rb-hi{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:color-mix(in srgb,var(--tdc-blue) 18%,transparent);color:var(--tdc-blue)}
.rb-h h3{margin:0;font-size:19px;outline:none}.rb-h p{margin:2px 0 0;font-size:13px;color:var(--tdc-muted)}.rb-h p b{color:var(--tdc-text);font-weight:600}
.rb-x{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;border:1px solid var(--tdc-line)!important}
.rb-sec{display:grid;gap:10px;padding:14px;border-radius:18px;border:1px solid var(--tdc-line);background:color-mix(in srgb,var(--tdc-text) 3%,transparent)}
.rb-sec h4{display:flex;align-items:center;gap:8px;margin:0;font-size:15px}.rb-sec h4 ha-icon{--mdc-icon-size:20px;color:var(--tdc-blue)}
.rb-note{margin:0;font-size:12.5px;line-height:1.45;color:var(--tdc-muted)}
.rb input,.rb select{font:inherit;font-size:15px;min-height:40px;padding:6px 10px;border-radius:10px;border:1px solid var(--tdc-line);background:color-mix(in srgb,var(--tdc-text) 5%,transparent);color:var(--tdc-text);color-scheme:dark light;min-width:0}
.rb input:disabled{opacity:.45}
.rb-once{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:10px;align-items:end}.rb-once .btn{grid-column:1/-1}
.rb-f{display:grid;gap:4px;font-size:12px;color:var(--tdc-muted)}.rb-f input,.rb-f select{width:100%}
.rb-once-on{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px;border-radius:14px;background:color-mix(in srgb,var(--tdc-blue) 12%,transparent);border:1px solid color-mix(in srgb,var(--tdc-blue) 40%,transparent)}
.rb-once-on b{display:block;font-size:15px}.rb-once-on small{display:block;margin-top:2px;font-size:12px;color:var(--tdc-muted)}
.rb .btn{border:1px solid var(--tdc-line)}.rb .btn.go{border-color:transparent;background:var(--tdc-blue);color:var(--text-primary-color,#fff)}.rb .btn:disabled{opacity:.5}
.rb-seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border-radius:14px;background:color-mix(in srgb,var(--tdc-text) 6%,transparent)}
.rb-seg button{min-height:38px;padding:0 8px;border-radius:10px;font-weight:600;font-size:14px;color:var(--tdc-muted);text-align:center;line-height:1.15}
.rb-seg button[aria-checked="true"]{background:var(--tdc-blue);color:var(--text-primary-color,#fff)}
.rb-row{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:10px;align-items:center}
.rb-day{font-weight:600}
.rb-week{display:grid;gap:6px}
.rb-wd{display:grid;grid-template-columns:118px minmax(0,1fr) minmax(0,1.25fr);gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--tdc-line)}
.rb-wd:last-child{border-bottom:0}
.rb-wd.off .rb-tog{color:var(--tdc-muted)}
.rb-free{grid-column:2/-1;font-size:13px;color:var(--tdc-muted)}
.rb-tog{display:flex;align-items:center;gap:8px;min-height:40px;text-align:left;font-weight:600}
.rb-tog ha-icon{--mdc-icon-size:22px;color:var(--tdc-muted)}.rb-tog[aria-pressed="true"] ha-icon{color:var(--tdc-blue)}
.rb-tools{display:flex;flex-wrap:wrap;gap:8px}.rb-tools .chip{border:1px solid var(--tdc-line)}
.rb-err{margin:0;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,#ef4444 15%,transparent);color:#fecaca;font-size:13px}
.rb-foot{position:sticky;bottom:-18px;display:flex;justify-content:flex-end;gap:10px;margin:0 -18px -18px;padding:12px 18px 18px;background:var(--tdc-dlg-bg,#121821);border-top:1px solid var(--tdc-line)}
@media (max-width:520px){.rb{padding:14px;gap:12px}.rb-sec{padding:12px}.rb input,.rb select{font-size:14px;padding:6px 8px}.rb-wd{grid-template-columns:88px minmax(0,1fr) minmax(0,1fr);gap:6px}.rb-tog{gap:6px}.rb-h h3{font-size:17px}.rb-once{grid-template-columns:1fr}.rb-foot{margin:0 -14px -14px;padding:12px 14px 14px;bottom:-14px}.rb-foot .btn{flex:1}}
.ctl input[type=time]{justify-self:start;grid-column:3/5;min-height:32px;padding:0 8px;border-radius:8px;border:1px solid var(--tdc-line);background:var(--tdc-tile);color:var(--tdc-text)}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:999px;margin:0;
  background:linear-gradient(to right,var(--tdc-blue) var(--p,0%),color-mix(in srgb,var(--tdc-text) 14%,transparent) var(--p,0%))}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:4px solid var(--tdc-blue);cursor:pointer}
input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:4px solid var(--tdc-blue);cursor:pointer}
/* smart charging (EV Smart Charge) */
.sc-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:16px}
/* The compact charge layout (the front page's popup while the car is plugged in) keeps what is used quickly: status,
   the four everyday plans, the plan's times and price, the target and "Klar senest" (with the one-time time). The
   rest (phone choices, price cap, manual, quarters/hours, temporary trip, default plan, smart choices) is set on the
   Tesla page. A plan that is chosen anyway stays visible. */
.dash.charge-layout .cmp,.dash.charge-layout .sc-phone,.dash.charge-layout .sc-res,.dash.charge-layout .sc-trip,
.dash.charge-layout .sc-def,.dash.charge-layout .sc-opt,.dash.charge-layout .charge-art{display:none!important}
.dash.charge-layout .sc-modes{grid-template-columns:repeat(2,minmax(0,1fr))}
.dash.charge-layout [data-scmode="price_cap"]:not([aria-checked="true"]),.dash.charge-layout [data-scmode="manual"]:not([aria-checked="true"]){display:none}
.sc-modes button{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;min-height:40px;padding:0 8px;border-radius:10px;
  border:1px solid var(--tdc-line);background:var(--tdc-tile);font-size:14px;font-weight:600;white-space:nowrap}
.sc-modes button span{overflow:hidden;text-overflow:ellipsis}
.sc-modes button ha-icon{--mdc-icon-size:18px}
.sc-modes button:hover{background:var(--tdc-hover)}
.sc-modes button[aria-checked=true]{background:color-mix(in srgb,var(--tdc-blue) 24%,transparent);border-color:color-mix(in srgb,var(--tdc-blue) 65%,transparent)}
.sc-modes button[aria-checked=true] ha-icon{color:var(--tdc-blue)}
.sc-modes button{position:relative}
.sc-modes .sc-star{display:none;position:absolute;top:3px;right:4px;--mdc-icon-size:13px;color:var(--tdc-amber)}
.sc-modes button[data-default] .sc-star{display:block}
.sc-modes button[aria-checked=true] .sc-star{color:var(--tdc-amber)}
.sc-time{margin-bottom:14px}
.sc-chart svg{display:block;width:100%;height:64px;overflow:visible}
.sc-chart rect{fill:color-mix(in srgb,var(--tdc-text) 17%,transparent)}
.sc-chart rect.on{fill:var(--tdc-green);filter:drop-shadow(0 0 4px color-mix(in srgb,var(--tdc-green) 55%,transparent))}
.sc-chart rect.est{opacity:.55}
.sc-chart line{stroke:var(--tdc-text);stroke-width:2;vector-effect:non-scaling-stroke}.sc-chart line.trip{stroke:var(--tdc-blue)}
.sc-chart{position:relative}
.sc-chart rect.over{fill:color-mix(in srgb,var(--tdc-orange) 30%,transparent)}
.sc-chart line.limit{stroke:var(--tdc-orange);stroke-width:1.5;stroke-dasharray:5 4}
.sc-lim{position:absolute;right:0;transform:translateY(-115%);padding:0 4px;border-radius:4px;font-size:11px;font-weight:700;line-height:1.35;color:var(--tdc-orange);background:color-mix(in srgb,var(--tdc-orange) 14%,var(--tdc-tile));pointer-events:none}
.sc-hold{display:flex;align-items:center;gap:10px;margin:-4px 0 14px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--tdc-orange) 11%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tdc-orange) 35%,transparent)}
.sc-hold>span{display:grid;gap:2px;flex:1;min-width:0}.sc-hold b{font-size:14px;font-weight:700}.sc-hold small{font-size:12.5px;color:var(--tdc-muted)}
.sc-chart rect.dear{fill:var(--tdc-orange);filter:drop-shadow(0 0 4px color-mix(in srgb,var(--tdc-orange) 55%,transparent))}
.sc-hold{flex-wrap:wrap}.sc-later{white-space:pre-line;color:var(--tdc-green)!important}
.sc-choice{display:grid;grid-template-columns:1fr 1fr;gap:8px;flex:1 1 100%}
.sc-choice button{min-height:38px;padding:0 10px;border-radius:10px;border:1px solid var(--tdc-line);background:var(--tdc-tile);font-size:14px;font-weight:600;white-space:nowrap}
.sc-choice button[aria-checked=true]{background:color-mix(in srgb,var(--tdc-orange) 22%,transparent);border-color:color-mix(in srgb,var(--tdc-orange) 60%,transparent)}
.sc-choice button[data-scwait=off][aria-checked=true]{background:color-mix(in srgb,var(--tdc-blue) 24%,transparent);border-color:color-mix(in srgb,var(--tdc-blue) 65%,transparent)}
.sc-choice button[data-armed]{outline:2px solid var(--tdc-orange);outline-offset:2px}
.sc-hint{margin:6px 0 0;font-size:13px;color:var(--tdc-green)}
.sc-track{position:relative;height:14px;border-radius:999px;background:color-mix(in srgb,var(--tdc-text) 11%,transparent)}
.sc-seg{position:absolute;top:0;bottom:0;border-radius:999px;background:var(--tdc-green);box-shadow:0 0 8px color-mix(in srgb,var(--tdc-green) 45%,transparent)}
.sc-seg[data-est]{background:repeating-linear-gradient(45deg,var(--tdc-green) 0 5px,color-mix(in srgb,var(--tdc-green) 50%,transparent) 5px 10px)}
.sc-mark{position:absolute;top:-4px;bottom:-4px;width:3px;margin-left:-1.5px;border-radius:2px;background:var(--tdc-text)}
.sc-mark.trip{background:var(--tdc-blue)}
.sc-axis{display:grid;grid-template-columns:auto 1fr auto;gap:8px;margin-top:7px;font-size:12px;color:var(--tdc-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.sc-axis span:nth-child(2){text-align:center;color:var(--tdc-green);font-weight:600;overflow:hidden;text-overflow:ellipsis}
.sc .plan-ctl{margin-top:14px}
.ctl2{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px;color:var(--tdc-muted)}
.ctl2 small{font-size:13px}
.ctl2 .sc-grp{display:inline-flex;align-items:center;gap:8px}
.ctl2 input,.sc-f input{min-height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--tdc-line);background:var(--tdc-tile);color:var(--tdc-text);font-size:15px;min-width:0}
.ctl2 input[type=number]{width:86px}
.sc-trip{margin-top:14px;border-radius:12px;background:color-mix(in srgb,var(--primary-text-color,#fff) 5%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))));
  border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid color-mix(in srgb,var(--tdc-blue) 70%,transparent)}
.sc-trip[data-active]{background:color-mix(in srgb,var(--tdc-blue) 12%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))))}
.sc-trip-h{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px}
.sc-trip-h:hover{background:var(--tdc-hover)}
.sc-trip-h>span{display:grid;gap:2px;flex:1;min-width:0}
.sc-trip-h b{font-size:15px;font-weight:600}
.sc-trip-h small{font-size:13px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-chev{transition:transform .2s}
.sc-trip-h[aria-expanded=true] .sc-chev{transform:rotate(180deg)}
.sc-trip-b{display:grid;gap:12px;padding:2px 14px 14px}
.sc-opts{display:flex;flex-wrap:wrap;gap:8px}
[data-r="scOptNote"]{white-space:pre-line}
.sc-wait{color:var(--tdc-blue)}
.pc{margin-top:12px}.pc-f{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sc-f{display:grid;gap:5px;font-size:13px;color:var(--tdc-muted)}
.sc-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}
.chip{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--tdc-line);font-size:14px;font-weight:600}
.chip ha-icon{--mdc-icon-size:18px}
.chip[aria-pressed=true]{background:color-mix(in srgb,var(--tdc-blue) 24%,transparent);border-color:color-mix(in srgb,var(--tdc-blue) 65%,transparent)}
.chip[aria-checked=true]{background:color-mix(in srgb,var(--tdc-blue) 24%,transparent);border-color:color-mix(in srgb,var(--tdc-blue) 65%,transparent)}
.sc-res{gap:8px}.sc-res .sc-res-l{color:var(--tdc-muted,var(--secondary-text-color));font-size:13px;margin-right:2px}
.chip[aria-pressed=true] ha-icon{color:var(--tdc-blue)}
.sc-info{flex:1;min-width:0;font-size:13px;color:var(--tdc-text)}
.sc-trip .btn.wide{margin-top:0}
.sc-confirm{margin:0 0 14px}
.sc-phone{margin-top:12px}
.sc-def{border-left-color:color-mix(in srgb,var(--tdc-amber) 70%,transparent)}
.sc-def .sc-defs{margin:0}
.sc-defs button[aria-checked=true]{background:color-mix(in srgb,var(--tdc-amber) 22%,transparent);border-color:color-mix(in srgb,var(--tdc-amber) 65%,transparent)}
.sc-defs button[aria-checked=true] ha-icon{color:var(--tdc-amber)}
.sc-note{margin:0;font-size:13px;line-height:1.4;color:var(--tdc-muted)}
@container panel (max-width:380px){.sc-modes button ha-icon:not(.sc-star){display:none}}
/* narrow panels: the status badge moves below the title instead of cutting it off */
@container panel (max-width:520px){.ph:has(.badge){flex-wrap:wrap;row-gap:8px}.ph:has(.badge) .ph-t{flex:1 1 calc(100% - 52px)}.ph .badge{margin-left:40px}}
/* map */
.map{display:flex;flex-direction:column;padding:0;min-height:340px}
.map .ph{padding:16px 16px 12px 20px;margin:0}
.map .ph-t{flex:0 0 auto}
.map .meta{flex:1 1 auto;justify-content:flex-end}
.map-body{position:relative;flex:1;min-height:240px;background:color-mix(in srgb,var(--tdc-text) 4%,transparent)}
.map-host{position:absolute;inset:0}
.map-host>*{display:block;height:100%;--ha-card-border-radius:0;--ha-card-border-width:0;--ha-card-box-shadow:none}
.map-empty{position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;font-size:14px;color:var(--tdc-muted)}
.seg{position:absolute;left:12px;bottom:12px;z-index:3;display:flex;gap:2px;padding:4px;border-radius:12px;border:1px solid var(--tdc-line);background:color-mix(in srgb,var(--primary-background-color,#0b0f16) 88%,transparent);color:var(--primary-text-color,#eef2f7)}
.seg button{min-width:48px;height:36px;padding:0 10px;border-radius:9px;font-size:15px;text-align:center}
.seg button:hover{background:var(--tdc-hover)}
.seg button[aria-pressed=true]{background:var(--tdc-blue);color:var(--text-primary-color,#fff)}
/* tpms */
.tpms{display:flex;flex-direction:column}
/* The car fills two rows; each tyre sits in the middle of its half, level with its wheel. */
.tpms-body{flex:1;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);grid-template-rows:repeat(2,150px);align-content:center;align-items:center;gap:0 14px}
.topcar{grid-column:2;grid-row:1/3;align-self:center;height:300px;width:auto;max-width:none;filter:drop-shadow(0 18px 22px rgba(0,0,0,.45))}
/* The car photographed from above: its wheels glow in the tyre's status colour. */
.topphoto{position:relative;filter:drop-shadow(0 18px 22px rgba(0,0,0,.45))}
.topphoto img{display:block;height:100%;width:auto}
.topphoto .wheel{position:absolute;width:8%;height:10%;transform:translate(-50%,-50%);border-radius:999px;background:var(--tone,var(--tdc-muted));box-shadow:0 0 10px 2px var(--tone,transparent);opacity:.92}
@container panel (max-width:340px){.tpms-body{grid-template-rows:repeat(2,120px);gap:0 10px}.topcar{height:240px}}
.topcar .wheel{fill:var(--tone,var(--tdc-muted));filter:drop-shadow(0 0 5px var(--tone,transparent))}
.tire{display:grid;gap:4px;min-width:0;padding:10px;border:1px solid var(--tdc-line);border-radius:12px;background:var(--tdc-tile)}
.tire b{font-size:24px;font-weight:700;letter-spacing:-.01em;color:var(--tdc-text)}
.tire em{display:inline-flex;align-items:center;gap:6px;font-style:normal;font-size:12.5px;font-weight:600;color:var(--tone,var(--tdc-muted));white-space:nowrap}
.tire small,.tire b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tire em::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 6px currentColor}
.tire em:empty{display:none}
/* The right-hand tyres mirror the left ones, facing the car. */
.tpms-body>.tire:nth-child(2),.tpms-body>.tire:nth-child(5){text-align:right;justify-items:end}
/* lists */
.rows{display:grid}
.row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-width:0;padding:8px 6px;margin:0 -6px;font-size:16px}
.row-l{color:color-mix(in srgb,var(--tdc-text) 80%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.row-v{display:inline-flex;align-items:center;gap:6px;min-width:0;justify-content:flex-end}
.row-v b{font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-v.stack{display:grid;justify-items:end;gap:2px}
.row-v small{font-size:13px;color:var(--tdc-muted);white-space:nowrap}
.row-v[data-tone] b,.row-v[data-tone] .trend{color:var(--tone)}
.trend{--mdc-icon-size:18px}
.row-v:not([data-tone]) .trend{display:none}
/* last charge */
.lc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 14px}
.lc{display:flex;align-items:flex-start;gap:12px;min-width:0}
.lc>span:last-child{display:grid;gap:4px;min-width:0}
.lc-i ha-icon{--mdc-icon-size:26px}
.lc b{font-size:18px}
.lc-foot{margin-top:14px;font-size:13px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lc-foot+.lc-foot{margin-top:4px}
.lc-fix{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;margin-top:12px;padding:10px 12px;border-radius:14px;border:1px solid var(--tdc-line);background:color-mix(in srgb,var(--tdc-text) 3%,transparent);color:inherit;font:inherit;text-align:left;cursor:pointer}
.lc-fix:hover{border-color:color-mix(in srgb,var(--tdc-blue) 45%,transparent)}
.lc-fix[data-tone=warn]{border-color:color-mix(in srgb,#f59e0b 55%,transparent);background:color-mix(in srgb,#f59e0b 10%,transparent)}
.lc-fix-i{--mdc-icon-size:20px;color:var(--tdc-blue)}.lc-fix[data-tone=warn] .lc-fix-i{color:#f59e0b}
.lc-fix-t{display:grid;gap:1px;min-width:0}.lc-fix-t b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lc-fix-t small{font-size:12px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lc-fix-go{padding:6px 12px;border-radius:999px;background:var(--tdc-blue);color:var(--text-primary-color,#fff);font-size:13px;font-weight:600;white-space:nowrap}
.ce-list{display:grid;gap:6px;max-height:228px;overflow:auto;overscroll-behavior:contain;padding-right:2px}
.ce-it{display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;width:100%;padding:9px 12px!important;border-radius:12px;border:1px solid var(--tdc-line)!important;text-align:left}
.ce-it[aria-pressed=true]{border-color:var(--tdc-blue)!important;background:color-mix(in srgb,var(--tdc-blue) 14%,transparent)!important}
.ce-it b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ce-it small{grid-column:1;font-size:12px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ce-it em{grid-row:1/3;grid-column:2;font-style:normal;text-align:right;font-size:13px;line-height:1.3}.ce-it em small{display:block;color:var(--tdc-muted);font-size:11.5px}
.ce-it .warn{color:#fbbf24}
.ce-f{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end}
.ce-f .rb-f input{font-size:18px;font-weight:600;text-align:right}
.ce-f .rb-f.main input{border-color:color-mix(in srgb,var(--tdc-blue) 60%,transparent);background:color-mix(in srgb,var(--tdc-blue) 10%,transparent)}
.ce-sum{margin:0;font-size:14px;color:var(--tdc-text)}.ce-sum b{font-size:16px}
.ce-ok{margin:0;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,#22c55e 16%,transparent);color:#bbf7d0;font-size:13px}
.ce .rb-seg{grid-template-columns:repeat(auto-fit,minmax(0,1fr))}
@media (max-width:520px){.ce-f{grid-template-columns:1fr 1fr}.ce-f .rb-f.main{grid-column:1/-1;order:-1}.ce-list{max-height:190px}}
.lc-foot:empty{display:none}
/* daily chart */
.range-sel{flex:none;min-height:32px;padding:0 8px;border-radius:8px;border:1px solid var(--tdc-line);background:var(--tdc-panel);font-size:14px}
.chart{position:relative;display:grid;gap:10px;border-radius:8px}
.chart[data-loading] .sm{opacity:.55}
.sm{display:grid;gap:6px;transition:opacity .2s}
.sm-h{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--tdc-muted)}
.sm-h em{margin-left:auto;font-style:normal;font-variant-numeric:tabular-nums;white-space:nowrap}
.sw{width:10px;height:10px;border-radius:3px;flex:none}
.sw-d,.key-d{background:var(--tdc-drive)}.sw-e,.key-e{background:var(--tdc-energy)}
.bars{display:grid;grid-template-columns:repeat(var(--n,24),minmax(0,1fr));grid-auto-rows:100%;column-gap:2px;align-items:end;height:48px;border-bottom:1px solid var(--tdc-grid)}
.bars i{display:block;justify-self:center;width:100%;max-width:24px;height:var(--h,0%);border-radius:4px 4px 0 0;background:var(--c);transition:height .3s ease}
.bars-d{--c:var(--tdc-drive)}.bars-e{--c:var(--tdc-energy)}
.bars i.nz{min-height:2px}
.bars i.hi{filter:brightness(1.3)}
.axis{display:grid;grid-template-columns:repeat(var(--n,24),minmax(0,1fr));font-size:12px;color:var(--tdc-muted);font-variant-numeric:tabular-nums;min-height:15px}
.axis span{white-space:nowrap;justify-self:center}
.tip{position:absolute;top:-6px;z-index:4;display:grid;gap:3px;min-width:120px;padding:8px 10px;border-radius:10px;border:1px solid var(--tdc-line);background:var(--tdc-panel);box-shadow:0 6px 18px rgba(0,0,0,.28);pointer-events:none;font-size:13px}
.tip-l{color:var(--tdc-muted)}
.tip-r{display:flex;align-items:center;gap:8px}
.key{width:12px;height:3px;border-radius:2px;flex:none}
.chart-empty{font-size:14px;color:var(--tdc-muted)}
/* tablet */
@container ttd (max-width:1199px){
  .dash{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"hero hero" "charge plan" "map tpms" "drive econ" "last daily"}
}
/* narrow tablet: stack the paired charge/plan panels to keep their inner grids readable */
@container ttd (max-width:899px){
  .dash{grid-template-areas:"hero hero" "charge charge" "plan plan" "map tpms" "drive econ" "last daily"}
}
/* mobile */
@container ttd (max-width:699px){
  .wrap{--tdc-gap:12px;--tdc-pad:16px}
  .dash{grid-template-columns:minmax(0,1fr);grid-template-areas:"hero" "charge" "plan" "map" "tpms" "drive" "econ" "last" "daily"}
  .hero{padding:18px;grid-template-rows:auto auto auto}
  .hero-title{flex-wrap:wrap;row-gap:2px}
  .name{font-size:28px;white-space:normal;overflow-wrap:anywhere}
  .model{font-size:16px}
  .updated{margin-top:10px}
  .hero-car{grid-area:2/1/3/3;padding:8px 0 0;height:190px}
  .ring-wrap{grid-area:1/2/2/3;align-self:start;--ring:136px;--soc-size:30px}
  .range{font-size:15px;margin-top:2px}
  .ring-t .muted{font-size:11px}
  .hero-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .monta{grid-template-columns:minmax(0,1fr) auto}
  .acts{grid-column:1/-1;border-top:1px solid var(--tdc-line);justify-content:flex-end}
  .map{min-height:300px}
  .badge{height:28px;padding:0 10px;font-size:13px}
}
@container ttd (max-width:380px){
  .ph h3{font-size:18px}
  .hero-car{height:150px}
  .ring-wrap{--ring:108px;--soc-size:26px}
  .stat{padding:10px}
  .stat ha-icon{display:none}
  .monta{grid-template-columns:minmax(0,1fr)}
  .monta-mode{border-left:0;border-top:1px solid var(--tdc-line)}
}
/* panel width driven: keep inner grids readable whatever the dashboard layout */
@container panel (max-width:560px){
  .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .kpi:nth-child(3){border-left:0}
  .kpi:nth-child(n+3){border-top:1px solid var(--tdc-line)}
}
@container panel (max-width:440px){
  .plan-top .cell{flex-direction:column;gap:6px;padding:12px 10px}
  .plan-top .cell small{white-space:normal}
}
/* popup layout (layout: charge): status, charging and plan only */
.dash.charge-layout{grid-template-columns:minmax(0,1fr);grid-template-areas:"hero" "charge" "plan" "nav"}
/* no smart charge plan configured: charging takes the plan's place */
.dash.no-plan{grid-template-areas:"hero hero hero hero hero hero hero map map map map map" "charge charge charge charge charge charge charge charge charge tpms tpms tpms" "drive drive drive econ econ econ last last last daily daily daily"}
@container ttd (max-width:1199px){.dash.no-plan{grid-template-areas:"hero hero" "charge charge" "map tpms" "drive econ" "last daily"}}
@container ttd (max-width:699px){.dash.no-plan{grid-template-areas:"hero" "charge" "map" "tpms" "drive" "econ" "last" "daily"}}
.dash.charge-layout.no-plan{grid-template-columns:minmax(0,1fr);grid-template-areas:"hero" "charge" "nav"}
/* Car controls: a full row under the charging panels (Tesla page only). */
.hero{position:relative}
.qc{position:relative;grid-area:2/1/3/2;align-self:end;justify-self:center;margin:0 0 -8px 16%;z-index:20;display:flex;gap:8px;padding:5px;border-radius:999px;background:color-mix(in srgb,var(--tdc-panel,#11161d) 72%,transparent);border:1px solid var(--tdc-line);backdrop-filter:blur(10px) saturate(140%);-webkit-backdrop-filter:blur(10px) saturate(140%)}
.qc-b{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:38px;min-width:38px;padding:0 9px;border-radius:999px;border:1px solid transparent;background:var(--tdc-tile);color:var(--tdc-text);font-size:13px;font-weight:650;cursor:pointer;transition:background .15s,border-color .15s}
.qc-b ha-icon{--mdc-icon-size:20px;color:var(--tdc-muted)}
.qc-b span:empty{display:none}
.qc-b span{white-space:nowrap}
.qc-b:hover{background:var(--tdc-hover)}
.qc-b[data-on]{background:color-mix(in srgb,var(--tdc-blue) 22%,transparent);border-color:color-mix(in srgb,var(--tdc-blue) 60%,transparent)}
.qc-b[data-on] ha-icon{color:var(--tdc-blue)}
.qc-b[data-warn] ha-icon{color:var(--tdc-orange)}
.qc-b[data-armed]{border-color:var(--tdc-orange);box-shadow:0 0 0 2px color-mix(in srgb,var(--tdc-orange) 45%,transparent)}
.qc-b[data-open]{border-color:color-mix(in srgb,var(--tdc-text) 45%,transparent)}
.qc-b:disabled{opacity:.4;cursor:default}
.qc-spin{position:absolute;inset:-3px;border-radius:999px;border:2px solid transparent;border-top-color:var(--tdc-blue);border-right-color:var(--tdc-blue);display:none;animation:ttdSpin .9s linear infinite;pointer-events:none}
.qc-b[data-busy] .qc-spin{display:block}
.qc-b[data-busy]{cursor:progress}
@keyframes ttdSpin{to{transform:rotate(360deg)}}
.qc-cap{position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);z-index:3;padding:5px 12px;border-radius:999px;background:color-mix(in srgb,var(--tdc-panel,#11161d) 82%,transparent);border:1px solid var(--tdc-line);font-size:13px;color:var(--tdc-text);white-space:nowrap;pointer-events:none}
.qc-cap[data-tone=warn]{border-color:var(--tdc-orange);color:var(--tdc-orange)}
.qc-pop{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);z-index:4;width:min(320px,90vw);display:grid;gap:10px;padding:12px;border-radius:18px;background:linear-gradient(180deg,color-mix(in srgb,var(--tdc-blue) 7%,var(--tdc-pop-bg,#161c25)),var(--tdc-pop-bg,#161c25) 60%);border:1px solid color-mix(in srgb,var(--tdc-text) 12%,transparent);box-shadow:0 22px 48px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.05)}
.qcp-h{display:flex;align-items:center;gap:8px}
.qcp-i{display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:50%;background:color-mix(in srgb,var(--tdc-blue) 18%,transparent);color:var(--tdc-blue)}.qcp-i ha-icon{--mdc-icon-size:20px}
.qcp-t{display:grid;gap:0;min-width:0;flex:1}.qcp-t b{font-size:15px;font-weight:700}.qcp-t small{color:var(--tdc-muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qcp-x{display:grid;place-items:center;width:30px;height:30px;flex:none;border-radius:50%;border:0;background:color-mix(in srgb,var(--tdc-text) 8%,transparent);color:var(--tdc-muted);cursor:pointer}.qcp-x ha-icon{--mdc-icon-size:18px}
.qcp-row{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center}
.qcp-power{position:relative;display:flex;align-items:center;justify-content:center;gap:6px;height:42px;min-width:84px;padding:0 12px;border-radius:999px;border:1px solid color-mix(in srgb,var(--tdc-blue) 45%,transparent);background:color-mix(in srgb,var(--tdc-blue) 12%,transparent);color:var(--tdc-blue);font-size:15px;font-weight:700;cursor:pointer;transition:background .2s,color .2s}
.qcp-power ha-icon{--mdc-icon-size:20px}
.qcp-power[data-on]{background:linear-gradient(135deg,color-mix(in srgb,var(--tdc-blue) 90%,#fff 0%),color-mix(in srgb,var(--tdc-blue) 70%,#000 0%));border-color:transparent;color:#fff;box-shadow:0 8px 20px color-mix(in srgb,var(--tdc-blue) 35%,transparent)}
.qcp-power[data-busy]{cursor:progress;opacity:.85}
.qc-pop[data-down]{bottom:auto;top:calc(100% + 10px)}
.panel.hero[data-pop]{overflow:visible;z-index:30}
.qcp-temp{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;text-align:center}
.qcp-temp b{font-size:22px;font-weight:700;line-height:1}.qcp-temp b[data-busy]{color:var(--tdc-blue)}
.qcp-temp button{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;border:1px solid var(--tdc-line);background:var(--tdc-tile);color:var(--tdc-text);cursor:pointer}.qcp-temp button ha-icon{--mdc-icon-size:22px}
.qcp-temp button:active{transform:scale(.94)}
.qcp-tv{display:grid;gap:2px}.qcp-tv b{font-size:28px;font-weight:700;line-height:1}.qcp-tv b[data-busy]{color:var(--tdc-blue)}.qcp-tv small{color:var(--tdc-muted);font-size:12px}
.qcp-chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.qcp-chip{display:grid;justify-items:center;gap:1px;min-width:0;padding:6px 4px 5px;border-radius:12px;border:1px solid var(--tdc-line);background:var(--tdc-tile);color:var(--tdc-text);text-align:center;cursor:pointer}
.qcp-chip ha-icon{--mdc-icon-size:18px;color:var(--tdc-muted)}.qcp-chip span{display:grid;min-width:0}.qcp-chip b{font-size:11.5px;font-weight:650;white-space:nowrap}.qcp-chip small{font-size:11px;color:var(--tdc-muted)}
.qcp-chip[data-on]{border-color:color-mix(in srgb,var(--tdc-amber,#f5a524) 55%,transparent);background:color-mix(in srgb,var(--tdc-amber,#f5a524) 14%,transparent)}.qcp-chip[data-on] ha-icon,.qcp-chip[data-on] small{color:var(--tdc-amber,#f5a524)}
.qcp-chip[data-kind=switch][data-on]{border-color:color-mix(in srgb,var(--tdc-blue) 55%,transparent);background:color-mix(in srgb,var(--tdc-blue) 14%,transparent)}.qcp-chip[data-kind=switch][data-on] ha-icon,.qcp-chip[data-kind=switch][data-on] small{color:var(--tdc-blue)}
.qcp-chip[data-busy]{opacity:.7;cursor:progress}.qcp-chip:disabled{opacity:.4;cursor:default}
.qcp-hold{display:grid;gap:8px;padding:10px;border-radius:14px;border:1px solid var(--tdc-line);background:var(--tdc-tile)}
.qcp-hold-t{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;border:0;background:none;color:var(--tdc-text);text-align:left;cursor:pointer;padding:0}
.qcp-hold-t ha-icon{--mdc-icon-size:20px;color:var(--tdc-muted)}.qcp-hold-t[data-active] ha-icon{color:var(--tdc-green)}
.qcp-hold-t span{display:grid;min-width:0}.qcp-hold-t b{font-size:13.5px;font-weight:650}.qcp-hold-t small{font-size:12px;color:var(--tdc-muted)}
.qcp-tog{position:relative;width:38px;height:22px;border-radius:999px;background:color-mix(in srgb,var(--tdc-text) 18%,transparent);transition:background .2s}
.qcp-tog::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s}
.qcp-hold-t[data-on] .qcp-tog{background:var(--tdc-blue)}.qcp-hold-t[data-on] .qcp-tog::after{transform:translateX(16px)}
.qcp-hold-p{display:grid;grid-template-columns:minmax(0,1fr) 78px auto;gap:6px;align-items:center;font-size:12px;color:var(--tdc-muted)}
.qcp-hold-p input{min-width:0;height:32px;padding:0 8px;border-radius:9px;border:1px solid var(--tdc-line);background:color-mix(in srgb,var(--tdc-text) 5%,transparent);color:var(--tdc-text);font:inherit;font-size:14px}
.qcp-more{justify-self:center;border:0;background:transparent;color:var(--tdc-muted);font-size:13px;cursor:pointer;padding:2px 6px}.qcp-more:hover{color:var(--tdc-blue)}
.qc-pop .cc-num{margin-top:0;grid-template-columns:auto 1fr}.qc-pop .cc-num input{grid-column:1/-1}
@container ttd (max-width:699px){.qc{grid-area:2/1/3/3;margin-left:0}.qc{gap:4px;padding:4px}.qc-b{height:36px;min-width:34px;padding:0 6px;font-size:12px;gap:3px}.qc-b ha-icon{--mdc-icon-size:18px}}
@container ttd (max-width:380px){.qc{gap:4px}.qc-b{min-width:32px;padding:0 5px}.qc-b ha-icon{--mdc-icon-size:18px}}
.cc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.cc{display:flex;align-items:center;gap:12px;min-height:58px;padding:10px 14px;border-radius:12px;border:1px solid var(--tdc-line);background:var(--tdc-tile);text-align:left;min-width:0}
.cc:hover{background:var(--tdc-hover)}
.cc ha-icon{--mdc-icon-size:22px;color:var(--tdc-muted)}
.cc>span{display:grid;gap:2px;min-width:0}.cc b{font-size:15px;font-weight:650}.cc small{font-size:12.5px;color:var(--tdc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc[aria-pressed=true]{background:color-mix(in srgb,var(--tdc-blue) 20%,transparent);border-color:color-mix(in srgb,var(--tdc-blue) 60%,transparent)}
.cc[aria-pressed=true] ha-icon{color:var(--tdc-blue)}
.cc[data-warn] ha-icon{color:var(--tdc-orange)}
.cc[data-armed]{outline:2px solid var(--tdc-orange);outline-offset:2px}
.cc:disabled{opacity:.45;cursor:default}
.cc-num{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:12px;margin-top:14px;font-size:14px;color:var(--tdc-muted)}
.cc-num-l{display:inline-flex;align-items:center;gap:8px}.cc-num-l ha-icon{--mdc-icon-size:20px}
.cc-num b{color:var(--tdc-text);font-size:15px;min-width:48px}
.cc-set{display:inline-flex;gap:8px}.cc-set .btn{margin:0;min-height:34px;padding:0 14px}
@container ttd (max-width:699px){.cc-num{grid-template-columns:auto 1fr;}.cc-num input{grid-column:1/-1}.cc-set{grid-column:1/-1}}
.charge-layout .hero{grid-template-rows:auto minmax(120px,1fr)}
.charge-layout .hero-car img{max-height:200px}
@container panel (min-width:540px){
  .charge-layout .hero-car{grid-area:1/1/3/2;height:auto;padding:30px 0 0 24%}
  .charge-layout .ring-wrap{grid-area:1/2/3/3;align-self:center;--ring:172px;--soc-size:40px}
  .charge-layout .range{font-size:17px;margin-top:4px}
  .charge-layout .ring-t .muted{font-size:12px}
}
.navlink{grid-area:nav;display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 16px;font-size:15px;font-weight:600}
.navlink:hover{background:var(--tdc-hover)}
.icon-btn[aria-pressed=true]{background:color-mix(in srgb,var(--tdc-blue) 22%,transparent);border-color:color-mix(in srgb,var(--tdc-blue) 50%,transparent)}
.icon-btn[aria-pressed=true] ha-icon{color:var(--tdc-text)}
.btn[data-busy]{opacity:.7;cursor:progress}
/* Tiles use the same design as the front page status buttons (custom:ha-home-status-card):
   card surface, shadow and rounded corners on the panels; the stat, KPI, plan, tyre and last-charge
   tiles get an accent edge, the big value first with detail and label below, and a large faint drifting icon. */
.wrap{--tdc-panel:var(--surface,var(--ha-card-background,var(--card-background-color,#172536)));--tdc-radius:15px;
  --tdc-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.22)));
  --ttd-info:var(--state-info-icon,var(--info-color,#38bdf8));--ttd-ok:var(--state-on-icon,var(--success-color,#20e3a2));
  --ttd-warm:var(--orange,var(--warning-color,#fb923c));--ttd-warn:var(--warning-color,#f59e0b);
  --ttd-err:var(--error-color,#ef4444);--ttd-muted:var(--dashboard-icon-muted,var(--disabled-text-color,#64748b))}
.dash .panel{border-radius:15px;box-shadow:var(--tdc-shadow)}
.dash .kpis.box,.dash .plan-top.box,.dash .plan-mid.box{border:0;border-radius:0;background:none;gap:10px}
.dash .stat,.dash .kpi,.dash .cell,.dash .tire,.dash .lc{--tile-accent:var(--ttd-info);position:relative;isolation:isolate;overflow:hidden;
  display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:0;min-width:0;padding:10px 12px;text-align:left;
  border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid color-mix(in srgb,var(--tile-accent) 78%,transparent);border-radius:12px;
  background:color-mix(in srgb,var(--primary-text-color,#fff) 5%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))));
  box-shadow:0 4px 12px rgba(0,0,0,.14)}
.dash .stat:hover,.dash .kpi:hover,.dash .cell:hover,.dash .tire:hover{background:color-mix(in srgb,var(--primary-text-color,#fff) 9%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))))}
.dash .stat-t,.dash .cell>span,.dash .lc>span,.dash .lc-i{display:contents}
.dash .stat>ha-icon,.dash .kpi>.tile-i,.dash .cell>ha-icon,.dash .tire>.tile-i,.dash .lc-i ha-icon{display:block;position:absolute;right:-10px;bottom:-10px;z-index:0;
  width:58px;height:58px;--mdc-icon-size:58px;color:var(--tile-accent);opacity:.12;pointer-events:none;animation:ttdTileDrift 5s ease-in-out infinite}
.dash .stat b,.dash .kpi b,.dash .cell b,.dash .tire b,.dash .lc b{order:1;position:relative;z-index:1;font-size:18px;font-weight:750;line-height:21px;
  color:var(--gray800,var(--primary-text-color,#f8fafc));white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}
.dash .cell em,.dash .tire em{order:3;position:relative;z-index:1;margin:0;padding-right:35px;font-size:11px;line-height:14px;white-space:normal;overflow:visible}
.dash .cell em{color:var(--gray600,var(--secondary-text-color,#a7b2c2))}
.dash .tire em{color:var(--tile-accent);font-weight:700}
.dash .stat small,.dash .kpi small,.dash .cell small,.dash .tire small,.dash .lc small{order:4;position:relative;z-index:1;margin:0;padding-right:35px;
  font-size:11px;font-weight:700;line-height:14px;color:var(--gray700,var(--secondary-text-color,#cbd5e1));letter-spacing:0;text-transform:none;white-space:normal;overflow:visible}
.dash .lc-grid{gap:10px}
.dash .hero-stats{gap:10px}
.dash .stat:nth-child(2){--tile-accent:var(--ttd-warm)}
.dash .stat:nth-child(4){--tile-accent:var(--ttd-ok)}
.dash .kpi:nth-child(1){--tile-accent:var(--ttd-warm)}
.dash .kpi:nth-child(2){--tile-accent:var(--ttd-ok)}
.dash .cell:has(>.ic.green){--tile-accent:var(--ttd-ok)}
.dash .cell:has(>.ic.amber){--tile-accent:var(--ttd-warm)}
.dash .cell:has(>.ic.orange){--tile-accent:var(--ttd-warn)}
.dash .tire{--tile-accent:var(--ttd-muted)}
.dash .tire[data-tone=ok]{--tile-accent:var(--ttd-ok)}
.dash .tire[data-tone=info]{--tile-accent:var(--ttd-info)}
.dash .tire[data-tone=warn]{--tile-accent:var(--ttd-warn)}
.dash .tire[data-tone=crit]{--tile-accent:var(--ttd-err)}
.dash .tire small{padding-right:0}
/* The tyre status lines up with the pressure and the label: no room for a tile icon, no dot, and the right-hand tyres
   end at the tile's edge whatever the width (Claude AI, 2026-10-14). */
.dash .tire em{padding-right:0;width:max-content;max-width:100%}
.dash .tire em::before{display:none}
.dash .tpms-body>.tire:nth-child(2) em,.dash .tpms-body>.tire:nth-child(5) em{align-self:flex-end;justify-self:end;margin-left:auto}
.dash .tpms-body{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}
.dash .tpms-body>.tire:nth-child(2),.dash .tpms-body>.tire:nth-child(5){border-left:0;border-right:calc(var(--dashboard-left-accent-width, 1) * 3px) solid color-mix(in srgb,var(--tile-accent) 78%,transparent)}
@container panel (max-width:360px){.dash .tire{padding:9px}.dash .tire b{font-size:16px;line-height:19px}}
.dash .lc:nth-child(1){--tile-accent:var(--ttd-ok)}
.dash .lc:nth-child(2){--tile-accent:var(--ttd-warm)}
.dash .monta.box{border:0;border-radius:12px;background:color-mix(in srgb,var(--primary-text-color,#fff) 5%,var(--surface,var(--ha-card-background,var(--card-background-color,#172536))));box-shadow:0 4px 12px rgba(0,0,0,.14)}
@keyframes ttdTileDrift{50%{transform:translate(-4px,-3px) scale(1.04) rotate(-4deg);opacity:.22}}
@container ttd (max-width:699px){
  .dash .stat,.dash .kpi,.dash .cell,.dash .tire,.dash .lc{padding:9px}
  .dash .stat b,.dash .kpi b,.dash .cell b,.dash .tire b,.dash .lc b{font-size:16px}
  .dash .stat small,.dash .kpi small,.dash .cell small,.dash .tire small,.dash .lc small,.dash .cell em,.dash .tire em{font-size:10px}
}
@media (max-width:600px){
  .dash .stat,.dash .kpi,.dash .cell,.dash .tire,.dash .lc{padding:9px}
  .dash .stat b,.dash .kpi b,.dash .cell b,.dash .tire b,.dash .lc b{font-size:16px}
  .dash .stat small,.dash .kpi small,.dash .cell small,.dash .tire small,.dash .lc small,.dash .cell em,.dash .tire em{font-size:10px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}.dash ha-icon{animation:none!important}}
`;

/* ----------------------------------------------------------------- card */

class ThTeslaDashboardCard extends HTMLElement {
  static deriveStatus(snapshot) {
    return ttdDeriveStatus(snapshot);
  }

  static getStubConfig() {
    return {
      name: "Tesla",
      vehicle: { model: "Tesla Model 3 RWD" },
      location_entity: "device_tracker.tesla_location_tracker",
      entities: {
        battery: "sensor.tesla_battery", range: "sensor.tesla_range", odometer: "sensor.tesla_odometer",
        temperature_inside: "sensor.tesla_temperature_inside", temperature_outside: "sensor.tesla_temperature_outside",
        online: "binary_sensor.tesla_online", asleep: "binary_sensor.tesla_asleep",
        charger: "binary_sensor.tesla_charger", charging: "binary_sensor.tesla_charging",
      },
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    // Hover/tryk på smart-opladningens prisgraf: tid, pris og om bilen lader (Claude AI, 2026-10-18).
    chartHover(this.shadowRoot, ".sc-chart", (box, fraction) => this._scPoint(fraction));
    this._cfg = null;
    this._hass = null;
    this._built = false;
    this._r = {};
    this._seen = new Map();
    this._stats = {};
    this._loading = {};
    this._hi = -1;
    // All interaction is delegated from the shadow root, so rebuilding the DOM never duplicates listeners.
    this.shadowRoot.addEventListener("click", (event) => this._onClick(event));
    ctlTips(this.shadowRoot);
    this.shadowRoot.addEventListener("change", (event) => this._onChange(event));
    // The ready-by popup keeps what is typed in its draft.
    this.shadowRoot.addEventListener("input", (event) => { if (event.target?.dataset?.rbin) this._rbInput(event.target); });
    // So does the charge correction (the total follows kWh × price per kWh while typing).
    this.shadowRoot.addEventListener("input", (event) => { if (event.target?.dataset?.cein) this._ceInput(event.target); });
    // A tap on a number marks it, so the right one is just typed over it (also on the phone, where a tap only places
    // the cursor; WebKit drops a selection made in the focus event itself).
    this.shadowRoot.addEventListener("focusin", (event) => {
      const el = event.target;
      if (["kwh", "per", "total"].includes(el?.dataset?.cein)) setTimeout(() => { if (this.shadowRoot.activeElement === el) el.select(); }, 0);
    });
    this.shadowRoot.addEventListener("input", (event) => this._onInput(event));
    this.shadowRoot.addEventListener("keydown", (event) => this._onKey(event));
    this.shadowRoot.addEventListener("focusout", (event) => this._commitInput(event.target));
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("th-tesla-dashboard-card: ugyldig konfiguration");
    this._cfg = ttdNormalizeConfig(config);
    this._mapHours = this._cfg.map.hours_to_show;
    this._chartRange = this._cfg.chart.range;
    this._mapStyle = this._cfg.map.style;
    this._built = false;
    this._stats = {};
    this._map = null;
    this._mapError = false;
    if (this._hass) this._queue(true);
  }

  set hass(hass) {
    this._hass = hass;
    this._queue(false);
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 16;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto", min_columns: 12 };
  }

  connectedCallback() {
    this._connected = true;
    if (!this._tick) this._tick = setInterval(() => this._onTick(), 60000);
    this._observe();
    if (this._hass) this._queue(true);
  }

  disconnectedCallback() {
    this._connected = false;
    clearInterval(this._tick);
    this._tick = null;
    this._io?.disconnect();
    this._io = null;
    // Layout cards may move the element (disconnect + connect); forget cleared timers so they restart.
    clearTimeout(this._styleTimer);
    this._styleTimer = null;
    clearTimeout(this._chargerRetry);
    clearTimeout(this._pendingTimer);
    this._disarm(false);
  }

  /* ------------------------------------------------------ update loop */

  _queue(force) {
    if (force) this._force = true;
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      this._flush();
    });
  }

  _flush() {
    if (!this._cfg || !this._hass) return;
    if (!this._built) this._build();
    const changed = this._force || this._statesChanged();
    this._force = false;
    if (!changed) return;
    if (this._map) this._map.hass = this._hass;
    this._apply(this._model());
    this._renderChart(false);
    if (this._map && !this._satMap && !this._styleTimer && Date.now() - (this._styleGaveUp || 0) > 30000) this._applyMapStyle(0);
  }

  _statesChanged() {
    const states = this._hass.states || {};
    let changed = false;
    for (const id of this._watch) {
      const stateObj = states[id];
      if (this._seen.get(id) !== stateObj) {
        this._seen.set(id, stateObj);
        changed = true;
      }
    }
    const locale = this._hass.locale || {};
    const env = [this._hass.themes?.darkMode, locale.language, locale.number_format, locale.time_format, locale.time_zone].join("|");
    if (env !== this._env) {
      this._env = env;
      this._fmt = null;
      changed = true;
    }
    return changed;
  }

  _onTick() {
    // Relative times ("5 min. siden", "i dag") and the chart's current hour age without any state change.
    if (!this._hass || !this._built) return;
    this._queue(true);
    if (this._visible) this._loadStats(this._chartRange, false);
  }

  _observe() {
    if (this._io || typeof IntersectionObserver === "undefined") {
      if (typeof IntersectionObserver === "undefined") this._onVisible();
      return;
    }
    this._io = new IntersectionObserver((entries) => {
      this._visible = entries.some((entry) => entry.isIntersecting);
      if (this._visible) this._onVisible();
    });
    this._io.observe(this);
  }

  _onVisible() {
    this._visible = true;
    if (!this._built) return;
    this._ensureMap();
    this._loadStats(this._chartRange, false);
    this._refresh(false);
  }

  /** Ask cloud-polled integrations for fresh data (at most once a minute across all card instances). */
  _refresh(force) {
    const ids = this._cfg.refresh.filter((id) => this._hass?.states?.[id]);
    if (!ids.length || (!force && Date.now() - ttdLastRefresh < TTD_REFRESH_MS)) return;
    ttdLastRefresh = Date.now();
    this._hass.callService("homeassistant", "update_entity", { entity_id: ids }).catch(() => {});
  }

  _format() {
    if (!this._fmt) this._fmt = new TtdFormat(this._hass);
    return this._fmt;
  }

  /* ------------------------------------------------------ state access */

  _id(key) {
    // Every entity not set by hand is found from EV Ledger (smart_charge or ev_ledger: any entity of the car's EV Ledger).
    return this._cfg.entities[key] || (this._cfg.smart_charge ? this._autoIds()[key] : undefined);
  }

  /** The car's location tracker: set by hand, or found from EV Ledger. */
  _loc() {
    return this._cfg.location || (this._cfg.smart_charge ? this._autoIds().location : null) || null;
  }

  /** ev_ledger: the ledger's entities by role, and the car's own entities next to the battery sensor EV Ledger reads. */
  _autoIds() {
    const sc = this._scIds();
    const sources = this._hass?.states?.[sc.charging_status]?.attributes?.source_entities || {};
    const registry = this._hass?.entities;
    const sig = JSON.stringify(sources);
    if (this._autoMap && this._autoSrc === registry && this._autoSig === sig && this._autoStates === !!this._hass?.states) return this._autoMap;
    const map = {};
    for (const [key, role] of Object.entries(TTD_LEDGER_KEYS)) if (sc[role] && this._hass?.states?.[sc[role]]) map[key] = sc[role];
    const states = this._hass?.states || {};
    const battery = sources.battery;
    if (battery) map.battery = battery;
    if (sources.odometer) map.odometer = sources.odometer;
    if (sources.location) map.location = sources.location;
    if (sources.charging?.startsWith("binary_sensor.")) map.charging = sources.charging;
    // The car's devices: the battery sensor's, and any other device with the same name (another Tesla integration).
    let pool = [];
    const devices = this._hass?.devices;
    const own = registry?.[battery];
    if (own?.device_id && devices) {
      const name = (dev) => String(dev?.name_by_user || dev?.name || "").toLowerCase();
      const carName = name(devices[own.device_id]);
      const ids = new Set(Object.values(devices).filter((dev) => dev.id === own.device_id || (carName && name(dev) === carName)).map((dev) => dev.id));
      pool = Object.values(registry).filter((entry) => ids.has(entry.device_id) && !entry.hidden);
    }
    const prefix = (battery?.split(".")[1] || "").replace(/_battery(_level)?$/, "");
    for (const [key, [domain, keys, endings]] of Object.entries(TTD_CAR_KEYS)) {
      if (map[key]) continue;
      const hit = pool.find((entry) => entry.entity_id.startsWith(`${domain}.`) && keys.includes(entry.translation_key))
        || pool.find((entry) => entry.entity_id.startsWith(`${domain}.`) && endings.some((end) => entry.entity_id.endsWith(end)) && !entry.entity_id.includes("destination"));
      if (hit) map[key] = hit.entity_id;
      else if (prefix) {
        // No entity registry (or an older frontend): the Tesla Custom names next to the battery sensor.
        const guess = endings.map((end) => `${domain}.${prefix}${end}`).find((id) => states[id]);
        if (guess) map[key] = guess;
      }
    }
    // The charger's mode, next to the charger power sensor EV Ledger reads.
    const power = sources.charger_power && registry?.[sources.charger_power];
    if (power?.device_id) {
      const mode = Object.values(registry).find((entry) => entry.device_id === power.device_id && entry.entity_id.startsWith("sensor.") && entry.entity_id.endsWith("_charger_mode"));
      if (mode) map.charger_mode = mode.entity_id;
    } else if (sources.charger_power) {
      const guess = `sensor.${sources.charger_power.split(".")[1].replace(/_charge_power$/, "")}_charger_mode`;
      if (states[guess]) map.charger_mode = guess;
    }
    // The daily chart: driving from the odometer, charging from the ledger's home charging energy.
    if (!this._cfg.chart.distance_entity && map.odometer) this._cfg.chart.distance_entity = map.odometer;
    if (!this._cfg.chart.energy_entity && sc.home_charging_energy && states[sc.home_charging_energy]) this._cfg.chart.energy_entity = sc.home_charging_energy;
    this._autoMap = map;
    this._autoSrc = registry;
    this._autoSig = sig;
    this._autoStates = !!this._hass?.states;
    return map;
  }

  _so(key) {
    const id = this._id(key);
    return id ? this._hass?.states?.[id] : undefined;
  }

  _num(key) {
    const stateObj = this._so(key);
    return ttdHasValue(stateObj) ? ttdToNumber(stateObj.state) : null;
  }

  _text(key) {
    const stateObj = this._so(key);
    return ttdHasValue(stateObj) ? String(stateObj.state).trim() : null;
  }

  _bool(key) {
    const stateObj = this._so(key);
    if (!ttdHasValue(stateObj)) return null;
    if (stateObj.state === "on") return true;
    return stateObj.state === "off" ? false : null;
  }

  _attr(key, name) {
    return this._so(key)?.attributes?.[name];
  }

  _unit(key, fallback = "") {
    return ttdUnit(this._so(key)?.attributes?.unit_of_measurement ?? fallback);
  }

  _digits(key, fallback) {
    const precision = this._cfg.precision[key];
    return Number.isInteger(precision) ? precision : fallback;
  }

  _value(key, digits, unitFallback = "") {
    const value = this._num(key);
    return value == null ? TTD_DASH : ttdJoin(this._format().number(value, this._digits(key, digits)), this._unit(key, unitFallback));
  }

  _control(key) {
    const fallback = { target_soc: "target_soc", deadline: "ready_by_time" }[key];
    const id = this._cfg.controls[key]?.entity || (fallback && this._scIds()[fallback]);
    const stateObj = id ? this._hass?.states?.[id] : undefined;
    return stateObj && stateObj.state !== "unavailable" ? { id, stateObj, domain: id.split(".")[0] } : null;
  }

  _targetEntity() {
    return this._cfg.controls.target_soc?.entity || this._id("target_soc") || this._scIds().target_soc || null;
  }

  _deadlineEntity() {
    return this._cfg.controls.deadline?.entity || this._id("deadline") || this._scIds().ready_by_time || null;
  }

  /** Save the public charge typed in: the ledger's kWh, price and place, then its button. */
  async _savePublic() {
    const r = this._r;
    const ids = this._scIds();
    const kwh = ttdToNumber(r.pcKwh?.value);
    const price = ttdToNumber(r.pcPrice?.value);
    const place = String(r.pcPlace?.value || "").trim();
    if (!(kwh > 0) || price == null || price < 0) {
      this._pcNote = "Skriv kWh og pris.";
      this._queue(true);
      return;
    }
    try {
      await this._hass.callService("number", "set_value", { entity_id: ids.public_charge_energy, value: kwh });
      await this._hass.callService("number", "set_value", { entity_id: ids.public_charge_price, value: price });
      if (ids.public_charge_location && this._hass.states[ids.public_charge_location]) await this._hass.callService("text", "set_value", { entity_id: ids.public_charge_location, value: place });
      await this._hass.callService("button", "press", { entity_id: ids.log_public_charge });
      const f = this._format();
      this._pcNote = `Gemt: ${f.number(kwh, 1)} kWh for ${f.number(price, 2)} kr.${place ? ` (${place})` : ""}`;
      for (const input of [r.pcKwh, r.pcPrice, r.pcPlace]) if (input) input.value = "";
    } catch (err) {
      this._pcNote = `Kunne ikke gemme: ${err?.message || err}`;
    }
    this._queue(true);
  }

  /** Entity ids of the EV Smart Charge car the card follows, by role (translation key). */
  _scIds() {
    const anchor = this._cfg?.smart_charge;
    if (!anchor) return {};
    const registry = this._hass?.entities;
    if (this._scMap && this._scMapSrc === registry) return this._scMap;
    const map = {};
    const own = registry?.[anchor];
    if (own?.device_id) {
      for (const entry of Object.values(registry)) {
        if (entry.device_id === own.device_id && entry.platform === own.platform && TTD_SC_ROLES[entry.translation_key]) map[entry.translation_key] = entry.entity_id;
      }
    }
    if (!Object.keys(map).length) {
      // No entity registry (or an older frontend): derive the siblings from the English entity id suffixes.
      const object = anchor.split(".")[1] || "";
      const suffix = Object.values(TTD_SC_ROLES).map((pattern) => pattern.split("._")[1]).find((end) => object.endsWith(`_${end}`));
      const prefix = suffix ? object.slice(0, -suffix.length - 1) : object;
      for (const [role, pattern] of Object.entries(TTD_SC_ROLES)) {
        const [domain, end] = pattern.split("._");
        map[role] = `${domain}.${prefix}_${end}`;
      }
    }
    this._scMap = map;
    this._scMapSrc = registry;
    return map;
  }

  _sc(role) {
    const id = this._scIds()[role];
    return id ? this._hass?.states?.[id] : undefined;
  }

  _scNum(role) {
    const stateObj = this._sc(role);
    return ttdHasValue(stateObj) ? ttdToNumber(stateObj.state) : null;
  }

  _scCall(role, domain, service, data = {}) {
    const id = this._scIds()[role];
    if (id && this._hass?.states?.[id]) this._call(domain, service, { entity_id: id, ...data });
  }

  _targetSoc() {
    const stateObj = this._hass?.states?.[this._targetEntity()];
    return ttdHasValue(stateObj) ? ttdToNumber(stateObj.state) : null;
  }

  _snapshot() {
    const vehicleState = this._attr("online", "state");
    return {
      online: this._bool("online"),
      vehicleState: ttdHasValue(this._so("online")) && vehicleState ? String(vehicleState).toLowerCase() : null,
      asleep: this._bool("asleep"),
      plug: this._bool("charger"),
      chargingState: ttdHasValue(this._so("charger")) ? this._attr("charger", "charging_state") ?? null : null,
      charging: this._bool("charging"),
      mode: this._text("charger_mode"),
      monta: this._text("monta_state"),
      cable: this._bool("monta_cable_connected"),
      scheduled: this._bool("scheduled_charging"),
      power: this._num("charger_power"),
      soc: this._num("battery"),
      target: this._targetSoc(),
    };
  }

  /* ------------------------------------------------------ view model */

  _model() {
    const f = this._format();
    const cfg = this._cfg;
    const status = ttdDeriveStatus(this._snapshot());
    const soc = this._num("battery");
    const target = this._targetSoc();
    const socTone = soc == null ? "muted" : soc <= cfg.battery.critical ? "crit" : soc <= cfg.battery.low ? "warn" : "ok";
    // A car that is not loaded yet reports time 0 (1 Jan 1970): no time rather than a wrong one.
    const reported = ttdToDate(this._text("last_update"));
    const lastUpdate = reported && reported.getFullYear() >= 2000 ? reported : null;
    const hero = {
      status: status.label, tone: status.tone, charging: status.charging,
      updatedLong: lastUpdate ? f.dayTime(lastUpdate) : TTD_DASH,
      updatedShort: lastUpdate ? (f.dayDiff(lastUpdate) === 0 ? f.time(lastUpdate) : f.date(lastUpdate)) : TTD_DASH,
      soc: soc == null ? TTD_DASH : f.number(soc, 0), socKnown: soc != null, socPercent: soc == null ? 0 : ttdClamp(soc, 0, 100), socTone,
      range: this._value("range", 0), odometer: this._value("odometer", 0),
      inside: this._value("temperature_inside", 1), outside: this._value("temperature_outside", 1),
    };
    return {
      status, hero,
      charge: this._chargeModel(f, status, soc, target, socTone),
      plan: this._planModel(f),
      sc: this._cfg.smart_charge ? this._scModel(f) : null,
      rb: this._cfg.smart_charge ? this._rbModel(f) : null,
      vehicle: this._vehicleModel(),
      tpms: this._tpmsModel(f),
      drive: this._driveModel(f),
      econ: this._econModel(f),
      cost: this._costModel(f),
      last: this._lastChargeModel(f),
      map: this._mapModel(f),
    };
  }

  _chargeModel(f, status, soc, target, socTone) {
    const cable = this._bool("monta_cable_connected");
    const plug = this._bool("charger");
    const montaKey = this._text("monta_state");
    const montaConfigured = !!this._id("monta_state");
    const montaLabel = montaKey ? TTD_TEXT.monta[montaKey] ?? ttdHumanize(montaKey) : montaConfigured ? TTD_TEXT.unavailable : null;
    const mode = this._text("charger_mode");
    const known = cable != null || plug != null || !!montaKey || !!mode;
    // Any plug signal wins (Zaptec/Tesla often know seconds to minutes before Monta's cloud poll).
    const cableText = status.plugged || cable === true || plug === true ? "Kabel tilsluttet"
      : cable === false || plug === false ? "Kabel ikke tilsluttet" : null;
    let activity = null;
    if (status.charging) activity = montaKey === "busy-charging" ? "Lader via Monta" : this._attr("charger", "fast_charger_present") === true ? "Lader på hurtiglader" : "Lader";
    else if (montaLabel) activity = `Monta ${montaLabel.toLowerCase()}`;
    const badgeKey = !known ? "unknown" : status.plugged ? status.key : "unplugged";
    const rate = this._num("charging_rate");
    const rateText = rate == null ? TTD_DASH : `${rate > 0 ? "+" : ""}${ttdJoin(f.number(rate, 0), this._unit("charging_rate", "km/h"))}`;
    // With EV Ledger the end of this charging period comes from the plan (the car's own "full at" time for the last
    // one), and the time left is counted from it, unless own sensors are configured. Unplugged, the plan's end is only
    // what would happen if the car were plugged in now, so it is not shown as the expected end here.
    const pluggedNow = !!(status.plugged || cable === true || plug === true);
    // The plan as a timeline with its pauses (Claude AI, 2026-10-16): its last period's end is the expected end, not the
    // end of the next period (it said 01:00 for a plan that ran until 05:45).
    const planTl = this._planTimeline(f, status, pluggedNow, soc, target);
    const planEnd = planTl && Number.isFinite(planTl.end) ? new Date(planTl.end) : null;
    const scEnd = this._cfg.smart_charge && !this._id("charging_finish_time") && pluggedNow ? planEnd || ttdToDate(this._sc("next_charge_end")?.state) : null;
    const finishRaw = this._text("charging_finish_time") ?? (scEnd ? scEnd.toISOString() : null);
    let remainingRaw = this._text("charging_time_remaining");
    if (remainingRaw == null && !this._id("charging_time_remaining") && status.charging && scEnd) remainingRaw = String(Math.max(0, Math.round((scEnd.getTime() - Date.now()) / 60000)));
    const remainingNumber = ttdToNumber(remainingRaw);
    const remainingUnit = String(this._attr("charging_time_remaining", "unit_of_measurement") || "min");
    const remaining = remainingRaw == null ? TTD_DASH : remainingNumber == null ? remainingRaw
      : remainingNumber <= 0 ? TTD_DASH : f.duration(remainingUnit === "h" ? remainingNumber * 60 : remainingNumber);
    const finish = finishRaw == null ? TTD_DASH : ttdIsClock(finishRaw) ? ttdClock(finishRaw) : ttdToDate(finishRaw) ? f.time(finishRaw) : finishRaw;
    const start = this._control("start_charge");
    const stop = this._control("stop_charge");
    // Without own start/stop controls the buttons switch the EV Smart Charge plan: "Lad nu", or "Pause".
    const scMode = this._cfg.smart_charge && ttdHasValue(this._sc("charge_mode")) ? this._sc("charge_mode") : null;
    const scheduled = montaKey === "busy-scheduled";
    const estimate = this._num("charging_price_estimate");
    let estimateText = null;
    const nowPlan = this._cfg.smart_charge && !this._id("charging_price_estimate") ? this._sc("planned_cost")?.attributes?.alternatives?.now : null;
    if (estimate == null && nowPlan && Number.isFinite(Number(nowPlan.cost)) && Number(nowPlan.energy_kwh) > 0) {
      const unit = ttdUnit(this._sc("planned_cost")?.attributes?.unit_of_measurement ?? "kr.");
      estimateText = `Estimeret pris ved ladning nu: ${ttdJoin(f.number(Number(nowPlan.cost), 2), unit)} (${f.number(Number(nowPlan.energy_kwh), 1)} kWh)`;
    }
    if (estimate != null) {
      const unit = this._unit("charging_price_estimate", "kr.");
      const kwh = ttdToNumber(this._attr("charging_price_estimate", "estimated_kwh_needed"));
      const price = ttdToNumber(this._attr("charging_price_estimate", "current_price"));
      estimateText = `Estimeret pris ved ladning nu: ${ttdJoin(f.number(estimate, 2), unit)}`
        + (kwh != null && price != null ? ` (${f.number(kwh, 1)} kWh à ${f.number(price, 2)} ${ttdPerKwh(unit)})` : "");
    }
    return {
      active: status.charging,
      plugged: !!(status.plugged || cable === true || plug === true),
      sub: [cableText, activity].filter(Boolean).join(" · ") || TTD_DASH,
      badge: { text: TTD_TEXT.status[badgeKey], tone: TTD_STATUS_TONES[badgeKey], icon: TTD_STATUS_ICONS[badgeKey] },
      soc: soc == null ? TTD_DASH : `${f.number(soc, 0)} %`, socPercent: soc == null ? 0 : ttdClamp(soc, 0, 100), socTone,
      target: target == null ? null : planTl?.aim != null ? `I nat ca. ${f.number(planTl.aim, 0)} % · mål ${f.number(target, 0)} %` : `Mål ${f.number(target, 0)} %`,
      targetPercent: target == null ? null : ttdClamp(target, 0, 100),
      power: this._value("charger_power", 1), rate: rateText, finish, remaining,
      // The charger line says where in the plan it is ("Pause til 02:30 (periode 3 af 5)"); the plan box has the rest.
      monta: montaLabel ?? (mode ? (planTl?.status ? planTl.status.split(" · ")[0] : this._chargerText(mode)) : TTD_DASH),
      plan: planTl,
      startLabel: planTl?.goal != null ? `Lad nu til ${f.number(planTl.goal, 0)} %` : "Lad nu",
      montaTone: montaKey ? TTD_MONTA_TONES[montaKey] || "muted" : { connected_charging: "ok", connected_requesting: "info", connected_finished: "info" }[mode] || "muted",
      modeBoxVisible: montaConfigured || !!this._modeOptions(),
      mode: mode ? TTD_TEXT.mode[mode] ?? ttdHumanize(mode) : this._id("charger_mode") ? TTD_TEXT.unavailable : TTD_DASH,
      // Offered on the fastest plug signal (Zaptec/Tesla/Monta) instead of waiting for a single, possibly stale, source.
      startVisible: (!!start || !!scMode) && status.plugged && !status.charging,
      stopVisible: (!!stop && (status.charging || scheduled)) || (!stop && !!scMode && status.charging),
      startBusy: this._busy("start_charge", start),
      stopBusy: this._busy("stop_charge", stop),
      modeOptions: this._modeOptions(),
      estimate: estimateText,
      compare: this._compareModel(f),
    };
  }

  /** Price of charging now, cheapest and in the fixed window, from EV Smart Charge (empty without it). */
  _compareModel(f) {
    if (!this._cfg.smart_charge) return null;
    const costObj = this._sc("planned_cost");
    const alternatives = costObj?.attributes?.alternatives;
    if (!alternatives || typeof alternatives !== "object") return null;
    const unit = ttdUnit(costObj.attributes.unit_of_measurement ?? "kr.");
    const mode = this._sc("charge_mode")?.state;
    const now = ttdToNumber(alternatives.now?.cost);
    const clock = (role) => (ttdIsClock(this._sc(role)?.state) ? ttdClock(this._sc(role).state) : null);
    const items = [["now", "Lad nu"], ["smart", "Billigst"], ["fixed", "Fast tid"]].map(([key, name]) => {
      let label = name;
      const plan = alternatives[key] || {};
      const cost = ttdToNumber(plan.cost);
      const start = ttdToDate(plan.start);
      const end = ttdToDate(plan.end);
      const detail = start && end ? `${start.getTime() <= Date.now() + 60000 ? "nu" : f.time(start)}–${f.time(end)}${ttdToNumber(plan.blocks) > 1 ? " (delt)" : ""}` : "Intet at lade";
      if (key === "fixed" && clock("fixed_start") && clock("fixed_end")) label = `${label} ${clock("fixed_start")}–${clock("fixed_end")}`;
      const saving = key !== "now" && cost != null && now != null && now - cost >= 0.5 ? `spar ${ttdJoin(f.number(now - cost, 2), unit)}` : "";
      return { key, label, price: cost == null ? TTD_DASH : ttdJoin(f.number(cost, 2), unit), detail, saving, active: key === mode, estimated: !!plan.estimated };
    });
    return items.some((item) => item.price !== TTD_DASH) ? items : null;
  }

  /** A control is busy while its script runs, or for a few seconds after a direct command. */
  _busy(name, control) {
    if (control?.domain === "script" && control.stateObj.state === "on") return true;
    return this._pending?.name === name && Date.now() < this._pending.until;
  }

  _modeOptions() {
    const control = this._control("charger_mode");
    if (!control || !["select", "input_select"].includes(control.domain)) return null;
    const options = Array.isArray(control.stateObj.attributes?.options) ? control.stateObj.attributes.options.map(String) : [];
    return options.length ? { options, value: control.stateObj.state } : null;
  }

  _planModel(f) {
    const missing = this._num("missing_wall_kwh");
    const reached = missing != null && missing <= 0.05;
    const startText = this._text("best_charge_start");
    const endText = this._text("best_charge_end");
    const validStart = ttdIsClock(startText);
    let badge = null;
    if (reached) badge = { text: "Mål nået", tone: "ok" };
    else if (validStart) badge = { text: "Aktivt forslag", tone: "info" };
    else if (startText) badge = { text: "Ingen gyldig plan", tone: "warn" };
    else if (this._id("best_charge_start")) badge = { text: TTD_TEXT.status.unknown, tone: "muted" };
    const price = this._num("best_charge_price");
    const priceUnit = this._unit("best_charge_price", "kr.");
    const minutesRaw = this._num("charge_minutes_needed");
    const minutes = minutesRaw == null ? null : String(this._attr("charge_minutes_needed", "unit_of_measurement")) === "h" ? minutesRaw * 60 : minutesRaw;
    const deadline = this._deadlineModel(f);
    const targetId = this._targetEntity();
    const targetControl = this._control("target_soc");
    let soc = null;
    if (targetControl && ["input_number", "number"].includes(targetControl.domain) && ttdHasValue(targetControl.stateObj)) {
      const attrs = targetControl.stateObj.attributes || {};
      const value = ttdToNumber(targetControl.stateObj.state);
      const min = ttdToNumber(attrs.min) ?? 0;
      const max = ttdToNumber(attrs.max) ?? 100;
      soc = { value, min, max, step: ttdToNumber(attrs.step) ?? 1, text: `${f.number(value, 0)} %`, percent: max > min ? ttdClamp(((value - min) / (max - min)) * 100, 0, 100) : 0 };
    }
    return {
      badge,
      sub: `Bedste ladetid baseret på elpris og deadline${deadline.text && !deadline.editable ? ` · klar ${TTD_TEXT.at} ${deadline.text}` : ""}`,
      bestStart: !reached && validStart ? ttdClock(startText) : TTD_DASH,
      bestEnd: !reached && ttdIsClock(endText) ? ttdClock(endText) : TTD_DASH,
      bestPrice: !reached && price != null ? ttdJoin(f.number(price, 2), priceUnit) : TTD_DASH,
      bestPriceKwh: !reached && price != null && price > 0 && missing != null && missing > 0 ? `≈ ${f.number(price / missing, 2)} ${ttdPerKwh(priceUnit)}` : "",
      missing: missing == null ? TTD_DASH : ttdJoin(f.number(Math.max(0, missing), 1), this._unit("missing_wall_kwh", "kWh")),
      minutes: minutes == null ? TTD_DASH : f.duration(Math.max(0, minutes)),
      applyVisible: !!this._control("apply_plan") && !reached,
      soc, targetKnown: !!targetId,
      deadline,
    };
  }

  /** The car controls: state per button, the value per slider (unless one is being set). */
  /** How a car control stands, in words, and whether it is "on" (lit) or calls for attention. */
  _ccText(key, o, f) {
    if (!o) return [TTD_TEXT.unavailable, false, false];
    if (o.state === "unknown" && key !== "flash") return ["Venter på bilen – tryk sender kommandoen", false, false];
    const temp = Number(o.attributes?.current_temperature);
    switch (key) {
      case "lock": return [{ locked: "Låst", unlocked: "Ulåst", locking: "Låser…", unlocking: "Låser op…", open: "Åben" }[o.state] || ttdHumanize(o.state), false, ["unlocked", "open"].includes(o.state)];
      case "climate": return [o.state === "off" ? "Klima slukket" : `Klima tændt${o.attributes?.current_temperature != null && Number.isFinite(temp) ? ` · inde ${f.number(temp, 0)} °C` : ""}`, o.state !== "off", false];
      case "charge_port": return [{ open: "Ladeport åben", opening: "Ladeport åbner…", closed: "Ladeport lukket", closing: "Ladeport lukker…" }[o.state] || ttdHumanize(o.state), ["open", "opening"].includes(o.state), false];
      case "sentry": return [o.state === "on" ? "Vagtpost til" : "Vagtpost fra", o.state === "on", false];
      case "flash": return ["Blink lys", false, false];
      default: {
        const unit = o.attributes?.unit_of_measurement || (key === "charge_limit" ? "%" : "A");
        return [Number.isFinite(Number(o.state)) ? `${f.number(Number(o.state), 0)} ${unit}` : TTD_TEXT.unavailable, false, false];
      }
    }
  }

  /** A command that was sent and is waiting for the car: done when its entity shows the result, given up after a while. */
  _ccSettle(st) {
    const now = Date.now();
    for (const [key, item] of Object.entries(this._ccBusy || {})) {
      const o = String(item.ctl).startsWith("chip:")
        ? this._hass?.states?.[this._qcChips().find((chip) => `chip:${chip.role}` === item.ctl)?.target] : st(item.ctl);
      if (o && item.done(o)) {
        delete this._ccBusy[key];
        if (item.ok) this._ccSay(item.ok, 4000);
      } else if (now >= item.until) {
        delete this._ccBusy[key];
        this._ccSay(`${item.label} svarede ikke – prøv igen`, 6000, "warn");
      }
    }
  }

  _ccSay(text, ms, tone = "") {
    this._ccMsg = { text, tone, until: Date.now() + ms };
    clearTimeout(this._ccMsgTimer);
    this._ccMsgTimer = setTimeout(() => this._applyCarControls(), ms + 50);
  }

  /** Send a car command and show at once that it is on its way; the button cannot be pressed again until the car answers. */
  _ccCall(key, ctl, domain, service, data, done, text, ok) {
    const label = TTD_CAR_CONTROLS.find(([k]) => k === ctl)?.[1] || TTD_QC_CHIPS.find(([k]) => `chip:${k}` === ctl)?.[1] || "Bilen";
    this._ccBusy = { ...(this._ccBusy || {}), [key]: { ctl, done, text, ok, label, until: Date.now() + TTD_CC_BUSY_MS } };
    clearTimeout(this._ccBusyTimer);
    this._ccBusyTimer = setTimeout(() => this._applyCarControls(), TTD_CC_BUSY_MS + 100);
    this._applyCarControls();
    Promise.resolve(this._hass?.callService(domain, service, data)).catch((err) => {
      if (this._ccBusy) delete this._ccBusy[key];
      this._ccSay(`Fejl: ${err?.message || err}`, 7000, "warn");
      this._applyCarControls();
    });
  }

  /** The same control in the car's other integration, when there is one. */
  _ccTwin(key) {
    const id = this._cfg.carControls[key];
    const registry = this._hass?.entities; const devices = this._hass?.devices;
    if (!id || !registry || !devices) return null;
    this._ccTwins = this._ccTwinsSrc === registry ? this._ccTwins || {} : {};
    this._ccTwinsSrc = registry;
    if (key in this._ccTwins) return this._ccTwins[key];
    const own = registry[id];
    const name = (dev) => String(dev?.name_by_user || dev?.name || "").toLowerCase();
    const carName = own?.device_id ? name(devices[own.device_id]) : "";
    const domain = id.split(".")[0];
    const twin = carName ? Object.values(registry).find((entry) => entry.entity_id !== id && entry.entity_id.startsWith(`${domain}.`)
      && entry.device_id && entry.device_id !== own.device_id && name(devices[entry.device_id]) === carName
      && TTD_CC_TWINS[key]?.(entry.entity_id)) : null;
    this._ccTwins[key] = twin?.entity_id || null;
    return this._ccTwins[key];
  }

  /** The control's state: the configured entity's, or its twin's while the configured one has none. */
  _ccState(key) {
    const o = this._hass?.states?.[this._cfg.carControls[key]];
    if (o && !["unknown", "unavailable"].includes(o.state)) return o;
    const twin = this._ccTwin(key); const t = twin ? this._hass?.states?.[twin] : null;
    return t && !["unknown", "unavailable"].includes(t.state) ? t : o;
  }

  /** Where a command goes: the configured entity (it wakes the car), or the twin when the configured one is unavailable. */
  _ccTarget(key) {
    const id = this._cfg.carControls[key]; const o = this._hass?.states?.[id];
    if (o && o.state !== "unavailable") return id;
    const twin = this._ccTwin(key);
    return twin && this._hass?.states?.[twin]?.state !== "unavailable" ? twin : id;
  }

  _applyCarControls() {
    if (!this._r.qc) return;
    const f = this._format();
    const st = (key) => this._ccState(key);
    this._ccSettle(st);
    const busy = this._ccBusy || {};
    const busyFor = (ctl) => Object.values(busy).find((item) => item.ctl === ctl);
    for (const button of this.shadowRoot.querySelectorAll(".qc-b")) {
      const key = button.dataset.cc || button.dataset.qc; const o = st(key);
      // Unknown (no data from the car yet) still sends the command, which wakes the car; only unavailable is dead.
      const dead = !o || (o.state === "unavailable" && key !== "flash");
      const [label, on, warn] = this._ccText(key, o, f);
      const working = busyFor(key);
      button.disabled = !!dead;
      this._attrSet(button, "data-on", !!on && !working);
      this._attrSet(button, "data-warn", !!warn);
      this._attrSet(button, "data-armed", this._armed === `cc:${key}`);
      this._attrSet(button, "data-busy", !!working);
      this._attrSet(button, "aria-busy", String(!!working));
      this._attrSet(button, "data-open", this._qcOpen === key);
      this._attrSet(button, "title", working ? working.text : label);
      if (key === "lock") button.querySelector("ha-icon")?.setAttribute("icon", ["unlocked", "open"].includes(o?.state) ? "mdi:lock-open-variant" : ["locking", "unlocking"].includes(o?.state) ? "mdi:lock-clock" : "mdi:lock");
      const value = button.querySelector(`[data-qcv="${key}"]`);
      let shown = "";
      if (key === "climate" && o && !["off", "unknown", "unavailable"].includes(o.state) && o.attributes?.temperature != null && Number.isFinite(Number(o.attributes.temperature))) shown = `${f.number(Number(o.attributes.temperature), 0)}°`;
      // Only a value: while the car is not loaded the button stays an icon (the explanation is in its title).
      else if (["charge_limit", "charge_current"].includes(key)) shown = !dead && o && Number.isFinite(Number(o.state)) ? label : "";
      if (value && value.textContent !== shown) value.textContent = shown;
    }
    // One line above the buttons: "Tryk igen …", what is on its way, or how it went.
    const armedKey = this._armed?.startsWith("cc:") ? this._armed.slice(3) : null;
    const armedText = armedKey ? { lock: "Tryk igen for at låse op", charge_port: "Tryk igen for ladeporten", sentry: "Tryk igen for at slå vagtpost fra" }[armedKey] : null;
    const working = Object.values(busy).at(-1);
    const msg = this._ccMsg && Date.now() < this._ccMsg.until ? this._ccMsg : null;
    const cap = armedText ? [armedText, "warn"] : working ? [working.text, ""] : msg ? [msg.text, msg.tone] : ["", ""];
    const capEl = this._r.qcCap;
    if (capEl) {
      capEl.hidden = !cap[0] || !!this._qcOpen;
      if (capEl.textContent !== cap[0]) capEl.textContent = cap[0];
      this._attrSet(capEl, "data-tone", cap[1] || null);
    }
    this._applyQcPop(st, f, busyFor);
    for (const input of this.shadowRoot.querySelectorAll("[data-ccnum]")) {
      const key = input.dataset.ccnum; const o = st(key); const a = o?.attributes || {};
      const pending = this._ccPending?.key === key ? this._ccPending.value : null;
      const value = pending ?? (o && Number.isFinite(Number(o.state)) ? Number(o.state) : null);
      const unit = a.unit_of_measurement || (key === "charge_limit" ? "%" : "A");
      if (this.shadowRoot.activeElement !== input || pending === null) {
        this._attrSet(input, "min", a.min ?? 0); this._attrSet(input, "max", a.max ?? 100); this._attrSet(input, "step", a.step ?? 1);
        if (value !== null && input.value !== String(value)) input.value = String(value);
      }
      input.disabled = value === null || !!busyFor(key);
      const lo = Number(input.min) || 0; const hi = Number(input.max) || 100;
      if (value !== null) input.style.setProperty("--p", `${hi > lo ? ((value - lo) / (hi - lo)) * 100 : 0}%`);
      const out = this.shadowRoot.querySelector(`[data-ccv="${key}"]`);
      const shown = value === null ? TTD_DASH : `${f.number(value, 0)} ${unit}${busyFor(key) ? " …" : ""}`;
      if (out && out.textContent !== shown) out.textContent = shown;
    }
  }

  /** The small panel above the buttons: the climate (on/off and temperature) or a number (charge limit, current). */
  _openQc(key) {
    this._qcOpen = this._qcOpen === key ? null : key;
    this._qcTemp = null;
    const pop = this._r.qcPop;
    if (!pop) return;
    pop.hidden = !this._qcOpen;
    // While the popup is open it may lie over the panels below the car (the hero panel clips otherwise).
    this._r.hero?.toggleAttribute("data-pop", !!this._qcOpen);
    if (!this._qcOpen) { this._applyCarControls(); return; }
    const [, label, icon] = TTD_CAR_CONTROLS.find(([k]) => k === key) || [];
    const head = (more) => `<div class="qcp-h"><span class="qcp-i">${ttdIcon(icon)}</span><div class="qcp-t"><b>${label}</b><small data-qcp="sub"></small></div>${more ? `<button type="button" class="qcp-x" data-qcmore aria-label="Flere indstillinger" title="Flere indstillinger">${ttdIcon("mdi:dots-horizontal")}</button>` : ""}<button type="button" class="qcp-x" data-qcclose aria-label="Luk">${ttdIcon("mdi:close")}</button></div>`;
    pop.innerHTML = key === "climate"
      ? `${head(true)}<div class="qcp-row"><button type="button" class="qcp-power" data-qcpower>${ttdIcon("mdi:power")}<span data-qcp="power"></span><i class="qc-spin" aria-hidden="true"></i></button>
        <div class="qcp-temp"><button type="button" data-qctemp="-1" aria-label="Koldere">${ttdIcon("mdi:minus")}</button><b data-qcp="temp">${TTD_DASH}</b><button type="button" data-qctemp="1" aria-label="Varmere">${ttdIcon("mdi:plus")}</button></div></div>
        <div class="qcp-chips" data-qcp="chips"></div>${this._sc("heat_hold") ? `
        <div class="qcp-hold">
          <button type="button" class="qcp-hold-t" data-qchold aria-pressed="false">${ttdIcon("mdi:battery-charging-80")}<span><b>Hold batteriet på målet</b><small data-qcp="holdsub"></small></span><i class="qcp-tog" aria-hidden="true"></i></button>
          <label class="qcp-hold-p"><span>Kun når strømmen koster højst</span><input type="number" step="0.05" min="0" inputmode="decimal" data-qcholdprice aria-label="Maks pris pr. kWh"><small data-qcp="holdunit">kr/kWh</small></label>
        </div>` : ""}`
      : `${head(false)}<div class="cc-num"><b data-ccv="${key}">${TTD_DASH}</b><input type="range" data-ccnum="${key}" aria-label="${label}"></div><button type="button" class="qcp-more" data-qcmore>Åbn i Home Assistant ›</button>`;
    this._applyCarControls();
    // Not room above the buttons inside the card (a phone): open downwards instead.
    pop.removeAttribute("data-down");
    const card = this.shadowRoot.querySelector("ha-card") || this;
    const top = pop.getBoundingClientRect?.().top; const cardTop = card.getBoundingClientRect?.().top;
    if (Number.isFinite(top) && Number.isFinite(cardTop) && top < Math.max(cardTop, 0) + 4) pop.setAttribute("data-down", "");
  }

  _applyQcPop(st, f, busyFor) {
    const pop = this._r.qcPop; const key = this._qcOpen;
    if (!pop || !key || pop.hidden) return;
    const o = st(key);
    const sub = pop.querySelector('[data-qcp="sub"]');
    if (key === "climate") {
      const temp = Number(o?.attributes?.current_temperature);
      const outside = this._num("temperature_outside");
      const subText = [busyFor("climate") ? busyFor("climate").text : o && !["off", "unknown", "unavailable"].includes(o.state) ? "Kører" : "",
        o?.attributes?.current_temperature != null && Number.isFinite(temp) ? `inde ${f.number(temp, 1)} °C` : "",
        outside != null ? `ude ${f.number(outside, 1)} °C` : ""].filter(Boolean).join(" · ");
      if (sub && sub.textContent !== subText) sub.textContent = subText;
      const chips = this._qcChips();
      const box = pop.querySelector('[data-qcp="chips"]');
      if (box) {
        const html = chips.map((chip) => {
          const working = busyFor(`chip:${chip.role}`);
          return `<button type="button" class="qcp-chip" data-qcchip="${chip.role}" data-kind="${chip.domain}"${chip.on ? " data-on" : ""}${working ? " data-busy" : ""}${chip.dead ? " disabled" : ""}>${ttdIcon(chip.icon)}<span><b>${chip.label}</b><small>${working ? "…" : chip.level}</small></span></button>`;
        }).join("");
        if (box.dataset.sig !== html) { box.dataset.sig = html; box.innerHTML = html; }
        box.hidden = !chips.length;
      }
      const power = busyFor("climate"); const on = o && o.state !== "off";
      const btn = pop.querySelector("[data-qcpower]");
      if (btn) {
        this._attrSet(btn, "data-on", !!on && !power); this._attrSet(btn, "data-busy", !!power); btn.disabled = !o || o.state === "unavailable";
        const text = power ? "…" : on ? "Sluk" : "Tænd";
        const span = btn.querySelector('[data-qcp="power"]'); if (span && span.textContent !== text) span.textContent = text;
      }
      // Keep the battery at the target while heating (EV Ledger): on/off, why it does or does not charge, the price limit.
      const hold = this._sc("heat_hold");
      const holdBtn = pop.querySelector("[data-qchold]");
      if (hold && holdBtn) {
        const a = hold.attributes || {};
        const on = hold.state === "on";
        this._attrSet(holdBtn, "aria-pressed", String(on));
        this._attrSet(holdBtn, "data-on", on);
        this._attrSet(holdBtn, "data-active", !!a.active);
        const kr = (v) => `${f.number(Number(v), 2)} kr`;
        const target = a.target != null ? `${f.number(Number(a.target), 0)} %` : "målet";
        const why = !on ? "Lader fra nettet i stedet for batteriet, mens bilen varmes"
          : a.active ? `Lader nu og holder ${target}`
          : { not_plugged_in: "Kun når bilen er sat til laderen", climate_off: `Holder ${target}, når klimaet kører`,
            too_expensive: `Venter: strømmen koster ${kr(a.price_now)} (højst ${kr(a.price_limit)})`,
            at_target: `Batteriet er på målet (${target})`, paused: "Ladeplanen står på pause",
            no_price: "Venter på elprisen", no_battery_level: "Venter på bilens batteriniveau" }[a.reason] || "";
        const holdSub = pop.querySelector('[data-qcp="holdsub"]');
        if (holdSub && holdSub.textContent !== why) holdSub.textContent = why;
        const priceIn = pop.querySelector("[data-qcholdprice]");
        const limit = this._sc("heat_hold_price");
        if (priceIn && limit && this.shadowRoot.activeElement !== priceIn && priceIn.value !== String(Number(limit.state))) priceIn.value = String(Number(limit.state));
        const unit = pop.querySelector('[data-qcp="holdunit"]');
        const u = ttdUnit(limit?.attributes?.unit_of_measurement || "kr/kWh");
        if (unit && unit.textContent !== u) unit.textContent = u;
      }
      const target = this._qcTemp ?? (o?.attributes?.temperature != null ? Number(o.attributes.temperature) : NaN);
      const tEl = pop.querySelector('[data-qcp="temp"]');
      const tText = Number.isFinite(target) ? `${f.number(target, 1)} °C` : TTD_DASH;
      if (tEl && tEl.textContent !== tText) tEl.textContent = tText;
      if (tEl) this._attrSet(tEl, "data-busy", this._qcTemp != null || !!(this._ccBusy || {}).climate_temp);
    } else if (sub) {
      const [label] = this._ccText(key, o, f);
      const text = `Nu ${label}`; if (sub.textContent !== text) sub.textContent = text;
    }
  }

  /** The climate extras next to the climate entity: on the same device first (it takes the commands), else the car's
   * other integration; the state from whichever knows it. */
  _qcChips() {
    const registry = this._hass?.entities; const devices = this._hass?.devices; const states = this._hass?.states || {};
    const climate = this._cfg.carControls.climate;
    if (!climate || !registry || !devices) return [];
    const own = registry[climate];
    const name = (dev) => String(dev?.name_by_user || dev?.name || "").toLowerCase();
    const carName = own?.device_id ? name(devices[own.device_id]) : "";
    const pool = Object.values(registry).filter((entry) => entry.device_id && (entry.device_id === own?.device_id || (carName && name(devices[entry.device_id]) === carName)) && !entry.hidden);
    pool.sort((a, b) => (a.device_id === own?.device_id ? 0 : 1) - (b.device_id === own?.device_id ? 0 : 1));
    const known = (id) => states[id] && !["unknown", "unavailable"].includes(states[id].state);
    return TTD_QC_CHIPS.map(([role, label, icon, domain, pattern]) => {
      const found = pool.filter((entry) => entry.entity_id.startsWith(`${domain}.`) && pattern.test(entry.entity_id)).map((entry) => entry.entity_id);
      if (!found.length) return null;
      const target = found.find((id) => states[id] && states[id].state !== "unavailable") || found[0];
      const shown = states[found.find(known) || target];
      const value = String(shown?.state || "").toLowerCase();
      const on = domain === "switch" ? value === "on" : !!value && !["off", "unknown", "unavailable"].includes(value);
      const level = domain === "switch" ? (on ? "Til" : "Fra") : TTD_HEAT_LEVELS[value] || TTD_DASH;
      return { role, label, icon, domain, target, value, on, level, dead: !states[target] || states[target].state === "unavailable" };
    }).filter(Boolean);
  }

  _qcChip(role) {
    const chip = this._qcChips().find((item) => item.role === role);
    if (!chip || chip.dead || Object.values(this._ccBusy || {}).some((item) => item.ctl === `chip:${role}`)) return;
    if (chip.domain === "switch") {
      const on = !chip.on;
      this._ccCall(`chip:${role}`, `chip:${role}`, "switch", on ? "turn_on" : "turn_off", { entity_id: chip.target },
        (st) => st.state === (on ? "on" : "off"), `${chip.label} ${on ? "til" : "fra"}…`, `${chip.label} ${on ? "til" : "fra"}`);
      return;
    }
    // Heat levels: Fra → Lav → (Mellem) → Høj → Fra, in the target entity's own spelling.
    const options = (this._hass.states[chip.target]?.attributes?.options || []).map(String);
    const levels = options.filter((option) => option.toLowerCase() !== "auto");
    if (!levels.length) return;
    const index = levels.findIndex((option) => option.toLowerCase() === chip.value);
    const next = levels[(index + 1) % levels.length];
    this._ccCall(`chip:${role}`, `chip:${role}`, "select", "select_option", { entity_id: chip.target, option: next },
      (st) => String(st.state).toLowerCase() === next.toLowerCase(), `${chip.label}: ${TTD_HEAT_LEVELS[next.toLowerCase()] || next}…`,
      `${chip.label}: ${TTD_HEAT_LEVELS[next.toLowerCase()] || next}`);
  }

  _qcPower() {
    const id = this._ccTarget("climate"); const o = this._ccState("climate");
    if (!o || (this._ccBusy || {}).climate) return;
    const on = o.state !== "off";
    this._ccCall("climate", "climate", "climate", on ? "turn_off" : "turn_on", { entity_id: id },
      (s) => (s.state !== "off") === !on, on ? "Slukker klima…" : "Starter klima…", on ? "Klima slukket" : "Klima tændt");
  }

  _qcTempStep(delta) {
    const id = this._ccTarget("climate"); const o = this._ccState("climate");
    if (!o) return;
    const a = o.attributes || {}; const step = Number(a.target_temp_step) || 0.5;
    const base = this._qcTemp ?? (a.temperature != null ? Number(a.temperature) : NaN);
    if (!Number.isFinite(base)) return;
    const value = ttdClamp(Math.round((base + delta * step) / step) * step, Number(a.min_temp) || 15, Number(a.max_temp) || 28);
    this._qcTemp = value;
    this._applyCarControls();
    // Set when the taps stop, so a few taps send one command.
    clearTimeout(this._qcTempTimer);
    this._qcTempTimer = setTimeout(() => {
      const t = this._qcTemp; this._qcTemp = null;
      if (t == null) return;
      this._ccCall("climate_temp", "climate", "climate", "set_temperature", { entity_id: id, temperature: t },
        (s) => Math.abs(Number(s.attributes?.temperature) - t) < 0.01, `Sætter ${this._format().number(t, 1)} °C…`, `Klima sat til ${this._format().number(t, 1)} °C`);
    }, 1200);
  }

  /** A car control: the first tap asks ("Tryk igen"), the second within a few seconds acts – on this car's entity only. */
  _carControl(key) {
    const id = this._ccTarget(key); const o = this._ccState(key);
    if (!o || Object.values(this._ccBusy || {}).some((item) => item.ctl === key)) return; // on its way: not twice
    if (key === "climate") { this._openQc("climate"); return; }
    // Only what could do harm by a stray tap asks first: unlocking, the charge port (it releases the cable) and
    // switching sentry off. Locking, sentry on and flashing the lights act at once.
    const critical = (key === "lock" && o.state !== "unlocked" && o.state !== "open") || key === "charge_port"
      || (key === "sentry" && o.state === "on");
    if (critical && this._armed !== `cc:${key}`) {
      this._disarm(false);
      this._armed = `cc:${key}`;
      this._armTimer = setTimeout(() => this._disarm(true), TTD_ARM_MS);
      this._queue(true);
      return;
    }
    this._disarm(true);
    if (key === "lock") {
      const lock = o.state !== "locked";
      this._ccCall(key, key, "lock", lock ? "lock" : "unlock", { entity_id: id }, (s) => s.state === (lock ? "locked" : "unlocked"),
        lock ? "Låser bilen…" : "Låser op…", lock ? "Bilen er låst" : "Bilen er låst op");
    } else if (key === "charge_port") {
      const open = !["open", "opening"].includes(o.state);
      this._ccCall(key, key, "cover", open ? "open_cover" : "close_cover", { entity_id: id }, (s) => s.state === (open ? "open" : "closed"),
        open ? "Åbner ladeporten…" : "Lukker ladeporten…", open ? "Ladeporten er åben" : "Ladeporten er lukket");
    } else if (key === "sentry") {
      const on = o.state !== "on";
      this._ccCall(key, key, "switch", on ? "turn_on" : "turn_off", { entity_id: id }, (s) => s.state === (on ? "on" : "off"),
        on ? "Slår vagtpost til…" : "Slår vagtpost fra…", on ? "Vagtpost er til" : "Vagtpost er fra");
    } else if (key === "flash") {
      const before = o.state;
      this._ccCall(key, key, "button", "press", { entity_id: id }, (s) => s.state !== before, "Blinker…", "Bilen blinkede");
    }
  }

  /** EV Ledger's plan as the shared timeline of the charging panel (the Tesla page and the quick charge popup): the
   * charging periods, the pauses between them with a tooltip each, the plan in words and the buttons that override it
   * (Claude AI, 2026-10-16; user: "ladnings kortet … mere besked om hvornår den lader … ændre til fuld ladning og
   * overstyre det der er igang"). Only while the cable is in. */
  _planTimeline(f, status, plugged, soc = null, target = null) {
    if (!this._cfg.smart_charge || !plugged) return null;
    const modeObj = this._sc("charge_mode");
    const mode = modeObj?.state;
    if (!mode || ["manual", "unavailable", "unknown"].includes(mode)) return null;
    const a = this._sc("next_charge_start")?.attributes || {};
    const now = Date.now();
    const blocks = (Array.isArray(a.blocks) ? a.blocks : []).map((b) => ({ t: Date.parse(b.start), e: Date.parse(b.end), kwh: Number(b.kwh) || 0, cost: Number(b.cost) || 0 }));
    const deadline = mode === "now" ? NaN : Date.parse(a.deadline);
    const prices = (Array.isArray(a.prices) ? a.prices : []).map((x) => ({ t: Date.parse(x?.t), p: Number(x?.p) })).filter((x) => Number.isFinite(x.t) && Number.isFinite(x.p));
    const parts = ctlParts({ now, blocks, deadline, prices, minutes: Number(a.slot_minutes) || 15 });
    const waitObj = this._sc("price_limit_wait");
    const above = Number(a.above_limit_kwh) || 0;
    const waiting = waitObj?.state === "on" && above >= 0.5;
    const goalRaw = a.deadline_target != null && Number.isFinite(Number(a.deadline_target)) ? Number(a.deadline_target) : null;
    const goal = goalRaw ?? this._scNum("plan_target_soc") ?? this._scNum("target_soc");
    const def = modeObj.attributes?.default_mode;
    const acts = [];
    if (waiting && waitObj.state !== "unavailable") acts.push({ key: "full", label: goal != null ? `Lad til ${f.number(goal, 0)} %` : "Lad til målet" });
    if (def && mode !== def && ["now", "off"].includes(mode)) acts.push({ key: "back", label: `Følg planen (${ttdScLabel(def)})` });
    const charge = parts.some((p) => p.kind === "charge");
    if (!charge && !acts.length) return null;
    const unit = ttdUnit(this._sc("planned_cost")?.attributes?.unit_of_measurement ?? "kr.").replace(/\.$/, "");
    const later = (Array.isArray(a.limit_cheaper) ? a.limit_cheaper : []).reduce((m, w) => (!m || Number(w.saving) > Number(m.saving) ? w : m), null);
    const laterAt = later ? ttdToDate(later.start) : null;
    const limitPrice = Number(a.price_limit);
    const track = charge ? ctlTrack(parts, {
      now, deadline, unit,
      held: waiting && a.limit_soc != null ? { reach: Number(a.limit_soc), later: laterAt ? f.dayTime(laterAt) : "" } : null,
      dear: (p) => !waiting && a.limit_ask === true && Number.isFinite(limitPrice) && p.price > limitPrice + 1e-6,
    }) : "";
    const status_ = charge ? ctlStatus(parts, { now, charging: status.charging }) : "";
    const wait = waiting ? ` · venter med ${f.number(above, 1)} kWh${laterAt ? ` til ${f.dayTime(laterAt)}` : ""}` : "";
    return {
      title: `Ladeplan · ${ttdScLabel(mode)}`,
      status: status_ || (mode === "off" ? "På pause – planen er stoppet" : ""),
      line: charge ? `${ctlLine(parts, now)}${wait}` : "",
      track, acts, goal, end: charge ? ctlSummary(parts).end : NaN,
      // Waiting with the dear rest, tonight's level is what the plan aims for.
      aim: waiting && a.limit_soc != null && Number(a.limit_soc) > (soc ?? 0) ? Number(a.limit_soc) : null,
      battery: soc == null ? "" : ctlBattery(soc, waiting && a.limit_soc != null ? Number(a.limit_soc) : goal ?? target ?? 100, !!status.charging, this._cfg.battery),
    };
  }

  /** The charger's state in words; with smart charging a stopped charger that waits for the plan is not "finished". */
  _chargerText(mode) {
    const plan = this._cfg.smart_charge ? this._sc("charge_status")?.state : null;
    if (["connected_finished", "connected_requesting"].includes(mode) && plan) {
      const waiting = { waiting: "Venter på planen", starting: "Starter", awaiting_confirmation: "Venter på bekræftelse", paused: "På pause", done: "Færdig – mål nået" }[plan];
      if (waiting) return waiting;
    }
    return TTD_TEXT.mode[mode] ?? ttdHumanize(mode);
  }

  /** Name and artwork: configured, or the model EV Smart Charge recognised for this car. */
  _vehicleModel() {
    const attrs = this._sc("charge_status")?.attributes || {};
    const name = this._cfg.model || (attrs.vehicle_name ? ttdShortModel(attrs.vehicle_name) : "Tesla");
    const body = this._cfg.body || (TTD_BODIES[attrs.vehicle_body] ? attrs.vehicle_body : "model_3");
    return { name, body, paint: this._cfg.paint, image: this._cfg.image };
  }

  /** The charging cost per month and the year's total (EV Ledger's cost this year with its last 12 months). */
  _costModel(f) {
    const o = this._sc("cost_this_year");
    if (!ttdHasValue(o)) return null;
    const a = o.attributes || {};
    const unit = ttdUnit(a.unit_of_measurement || "kr.");
    const read = (list) => (Array.isArray(list) ? list : []).map((m) => ({
      key: String(m.month || ""), cost: Number(m.cost) || 0, kwh: Number(m.kwh) || 0, home: Number(m.home_cost) || 0,
      pub: Number(m.public_cost) || 0, charges: Number(m.charges) || 0, unpriced: Number(m.unpriced) || 0,
    }));
    const months = read(a.months);
    // The same months a year before (EV Ledger 0.5.1+), drawn as faint bars next to this year's.
    const before = read(a.months_year_before);
    const hasBefore = before.some((m) => m.charges > 0);
    const top = Math.max(1, ...months.map((m) => m.home + m.pub), ...(hasBefore ? before.map((m) => m.home + m.pub) : []));
    const d = new Date();
    const nowKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const date = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 15);
    const kr = (value, digits = 0) => ttdJoin(f.number(value, digits), unit);
    const perKwh = ttdUnit(`${a.unit_of_measurement || "DKK"}/kWh`);
    const bars = months.map((m, i) => ({
      tip: {
        title: date(m.key).toLocaleDateString("da-DK", { month: "long", year: "numeric" }),
        cost: m.charges ? kr(m.cost, 2) : "Ingen ladning",
        parts: m.pub > 0 ? `Hjemme ${kr(m.home, 2)} · ude ${kr(m.pub, 2)}` : "",
        energy: m.charges ? [`${f.number(m.kwh, 1)} kWh`, m.kwh > 0 && m.cost > 0 ? `${f.number(m.cost / m.kwh, 2)} ${perKwh}` : "",
          `${m.charges} ${m.charges === 1 ? "ladning" : "ladninger"}`].filter(Boolean).join(" · ") : "",
        unpriced: m.unpriced ? `${m.unpriced} uden pris` : "",
        before: hasBefore && before[i] ? `Året før: ${before[i].charges ? `${kr(before[i].cost)} · ${f.number(before[i].kwh, 0)} kWh` : "ingen ladning"}` : "",
      },
      now: m.key === nowKey, empty: m.charges === 0,
      before: hasBefore ? ((before[i]?.home || 0) + (before[i]?.pub || 0)) / top * 100 : null,
      month: date(m.key).toLocaleDateString("da-DK", { month: "short" }).replace(".", ""),
      value: m.cost >= 1000 ? `${f.number(m.cost / 1000, 1)}k` : f.number(m.cost, 0),
      home: (m.home / top) * 100, pub: (m.pub / top) * 100,
      title: [date(m.key).toLocaleDateString("da-DK", { month: "long", year: "numeric" }), kr(m.cost, 2), `${f.number(m.kwh, 1)} kWh`,
        m.kwh > 0 && m.cost > 0 ? `${f.number(m.cost / m.kwh, 2)} ${perKwh}` : "",
        `${m.charges} ${m.charges === 1 ? "ladning" : "ladninger"}`, m.pub > 0 ? `ude ${kr(m.pub, 2)}` : "",
        m.unpriced ? `${m.unpriced} uden pris` : "",
        hasBefore && before[i] ? `året før ${before[i].charges ? `${kr(before[i].cost)} · ${f.number(before[i].kwh, 0)} kWh` : "ingen ladning"}` : ""].filter(Boolean).join(" · "),
    }));
    const year = ttdToNumber(o.state) ?? 0;
    const yearKwh = Number(a.kwh) || 0;
    const month = months.find((m) => m.key === nowKey);
    const previous = Number(a.previous_year) || 0;
    const previousKwh = Number(a.previous_year_kwh) || 0;
    return {
      year: kr(year),
      yearSub: `i år · ${f.number(yearKwh, 0)} kWh${yearKwh > 0 && year > 0 ? ` · ${f.number(year / yearKwh, 2)} ${perKwh}` : ""}`,
      sub: month ? `Denne måned ${kr(month.cost)} · ${f.number(month.kwh, 0)} kWh` : "Pr. måned, det seneste år",
      note: [previous > 0 ? `Sidste år ${kr(previous)}${previousKwh > 0 ? ` · ${f.number(previousKwh, 0)} kWh` : ""}` : "",
        Number(a.unpriced) ? `${a.unpriced} uden pris i år` : ""].filter(Boolean).join(" · "),
      before: hasBefore,
      bars,
    };
  }

  _scModel(f) {
    const status = this._sc("charge_status");
    const statusKey = ttdHasValue(status) ? status.state : null;
    const [label, tone] = TTD_SC_STATUS[statusKey] || [statusKey ? ttdHumanize(statusKey) : TTD_TEXT.unavailable, "muted"];
    const modeObj = this._sc("charge_mode");
    const mode = ttdHasValue(modeObj) ? modeObj.state : null;
    const plan = this._sc("next_charge_start")?.attributes || {};
    const now = Date.now();
    const blocks = (Array.isArray(plan.blocks) ? plan.blocks : [])
      .map((block) => ({ start: ttdToDate(block.start), end: ttdToDate(block.end), estimated: !!block.estimated }))
      .filter((block) => block.start && block.end && block.end.getTime() > now);
    const deadline = ttdToDate(plan.deadline);
    const trip = ttdToDate(this._sc("trip_departure")?.state);
    const target = this._scNum("plan_target_soc");
    // Timeline from now to the latest of the deadline, the trip and the plan (at least an hour, at most two days; four
    // while the plan waits for a cheaper day).
    const waiting = plan.waiting_for && typeof plan.waiting_for === "object" ? plan.waiting_for : null;
    const until = Math.min(now + (waiting ? 96 : 48) * 3600000, Math.max(now + 3600000, deadline?.getTime() || 0, trip?.getTime() || 0, ...blocks.map((block) => block.end.getTime())));
    const at = (date) => ttdClamp(((date.getTime() - now) / (until - now)) * 100, 0, 100);
    const segments = blocks.filter((block) => block.start.getTime() < until).map((block) => {
      const left = at(new Date(Math.max(block.start.getTime(), now)));
      return { left, width: Math.max(at(block.end) - left, 0.6), estimated: block.estimated, title: `${f.time(block.start)}–${f.time(block.end)}` };
    });
    const marks = [deadline && deadline.getTime() <= until ? { left: at(deadline), kind: "deadline" } : null, trip && trip.getTime() <= until ? { left: at(trip), kind: "trip" } : null].filter(Boolean);
    const next = blocks[0];
    // The prices the plan chose from (EV Ledger): a small chart of when the car charges – also before it is plugged in.
    const minutes = Number(plan.slot_minutes) || 15;
    const slots = (Array.isArray(plan.prices) ? plan.prices : []).map((x) => ({ s: Date.parse(x?.t), p: Number(x?.p), est: !!x?.e }))
      .map((x) => ({ ...x, e: x.s + minutes * 60000 })).filter((x) => Number.isFinite(x.s) && Number.isFinite(x.p) && x.e > now && x.s < until);
    const lo = Math.min(...slots.map((x) => x.p)), hi = Math.max(...slots.map((x) => x.p));
    // Claude AI, 2026-10-15; user: "illustrer hvad der sker med ladning ud fra disse settings": EV Ledger's price limit on
    // Cheapest as a line in the chart, the quarters above it that the plan skips marked.
    // EV Ledger 0.9: price_limit is the price above which waiting is cheaper; shown only when that is worth asking about.
    const limitOn = mode === "smart" && this._sc("smart_price_limit")?.state === "on"
      && (plan.limit_ask == null || plan.limit_ask === true || this._sc("price_limit_wait")?.state === "on");
    const limitP = limitOn && plan.price_limit != null && Number.isFinite(Number(plan.price_limit)) ? Number(plan.price_limit) : null;
    const hOf = (p) => 0.22 + 0.78 * (hi > lo ? (p - lo) / (hi - lo) : 0.5);
    const chart = slots.map((x) => {
      const left = at(new Date(Math.max(x.s, now))); const on = blocks.some((b) => x.s < b.end.getTime() && x.e > b.start.getTime());
      const over = limitP != null && x.p > limitP;
      return { left, width: at(new Date(Math.min(x.e, until))) - left, h: hOf(x.p), on, est: x.est, over: over && !on, dear: over && on,
        title: `${f.time(new Date(x.s))} · ${f.number(x.p, 2)} kr/kWh${on ? (over ? " · lader over grænsen" : " · lader") : over ? " · over grænsen" : ""}` };
    });
    const limitLine = limitP != null && slots.length && limitP >= lo && limitP <= hi ? { h: hOf(limitP), label: `${f.number(limitP, 2)} kr` } : null;
    // The car's own "full at" time while it charges up to its limit (EV Ledger's next charge end), for the last period.
    const endSensor = ttdToDate(this._sc("next_charge_end")?.state);
    const lastEnd = blocks.length === 1 && endSensor ? endSensor : blocks[blocks.length - 1]?.end;
    const cost = this._scNum("planned_cost");
    const energy = this._scNum("planned_energy");
    const costUnit = ttdUnit(this._sc("planned_cost")?.attributes?.unit_of_measurement ?? "kr.");
    const sub = [];
    if (mode === "now") {
      // EV Ledger: Charge now hands back to the default plan once the target is reached.
      const def = this._sc("default_charge_mode")?.state || "smart";
      sub.push(def === "now" ? "Lader nu til målet" : `Lader nu til målet, derefter ${ttdScLabel(def).toLowerCase()}`);
    }
    else if (mode === "off") sub.push("Laderen holdes på pause");
    else if (mode === "manual") sub.push("Laderen styres ikke");
    else if (deadline) sub.push(`Klar ${f.dayTime(trip && trip < deadline ? trip : deadline)}`);
    if (target != null && mode !== "now" && mode !== "off") sub.push(`mål ${f.number(target, 0)} %`);
    const time = (role) => {
      const raw = this._sc(role)?.state;
      return ttdIsClock(raw) ? ttdClock(raw) : "";
    };
    const capObj = this._sc("price_cap");
    const distanceObj = this._sc("trip_distance");
    const distance = ttdHasValue(distanceObj) ? ttdToNumber(distanceObj.state) : null;
    const dAttrs = distanceObj?.attributes || {};
    const need = this._scNum("trip_target_soc");
    const tripEnergy = this._scNum("trip_energy");
    const destination = ttdHasValue(this._sc("trip_destination")) ? String(this._sc("trip_destination").state) : "";
    const roundTrip = this._sc("trip_round_trip")?.state === "on";
    let tripInfo = "";
    if (dAttrs.looking_up) tripInfo = "Finder ruten …";
    else if (dAttrs.error === "not_found") tripInfo = "Adressen blev ikke fundet";
    else if (dAttrs.error) tripInfo = "Ruten kunne ikke hentes, prøver igen";
    else if (distance != null) {
      tripInfo = [`${f.number(distance, 0)} km${roundTrip ? " hver vej" : ""}`, dAttrs.duration_min ? f.duration(dAttrs.duration_min) : null,
        tripEnergy != null ? `${f.number(tripEnergy, 1)} kWh` : null, need != null ? `kræver ${f.number(Math.min(need, 100), 0)} %${need > 100 ? " (rækker ikke)" : ""}` : null].filter(Boolean).join(" · ");
    }
    const tripSum = trip ? [destination || "Uden destination", f.dayTime(trip), need != null ? `kræver ${f.number(Math.min(need, 100), 0)} %` : null].filter(Boolean).join(" · ")
      : "Afgang på et andet tidspunkt eller en længere tur";
    // Why the plan waits (EV Ledger "Vent på billigere dag") and how green its power is ("Grøn strøm").
    const waitDay = waiting ? ttdToDate(waiting.deadline) : null;
    const wait = [waiting && waitDay ? `Venter til ${waitDay.toLocaleDateString("da-DK", { weekday: "long" })}: ca. ${f.number(Number(waiting.price), 2)} kr/kWh mod ${f.number(Number(waiting.price_now), 2)} i nat (spar ca. ${f.number(Number(waiting.saving), 0)} kr). Batteriet rækker (ca. ${f.number(Number(waiting.soc_then), 0)} %).` : "",
      Number.isFinite(Number(plan.co2)) && plan.co2 !== null ? `CO₂ ca. ${f.number(Number(plan.co2), 0)} g/kWh` : ""].filter(Boolean).join(" · ");
    const options = TTD_SC_OPTIONS.map(([role, label]) => {
      const sw = this._sc(role);
      return sw && sw.state !== "unavailable" ? { role, label, on: sw.state === "on", attrs: sw.attributes || {} } : null;
    }).filter(Boolean);
    const notes = [];
    for (const option of options.filter((o) => o.on)) {
      if (option.role === "learn_departure") {
        const days = option.attrs.departures;
        notes.push(days ? `Lærte afgange: ${Object.entries(days).map(([day, at]) => `${day} ${at || "–"}`).join(" · ")}` : `Lærer stadig køretider (${option.attrs.history_days || 0} af 21 dages ture)`);
      } else if (option.role === "wait_cheaper_day" && !waiting) {
        notes.push(option.attrs.daily_use_kwh == null ? "Venter på mindst en uges ture for at kende dagligt forbrug" : `Ingen billigere dag lige nu · forbrug ca. ${f.number(Number(option.attrs.daily_use_kwh), 1)} kWh/dag`);
      } else if (option.role === "prefer_green" && !option.attrs.price_area) notes.push("Grøn strøm: CO₂-prognosen findes kun for Danmark");
      else if (option.role === "quiet_night" && option.attrs.from && option.attrs.until) notes.push(`Ladestart, færdig og planbeskeder kommer uden lyd ${option.attrs.from}–${option.attrs.until}${option.attrs.silent_now ? " (lydløs nu)" : ""}`);
    }
    return {
      badge: { text: label, tone }, sub: sub.join(" · ") || TTD_DASH,
      mode, modes: Array.isArray(modeObj?.attributes?.options) ? modeObj.attributes.options.map(String) : TTD_SC_MODES.map(([key]) => key),
      segments, marks, chart, axisRight: f.dayTime(new Date(until)), axisMid: next ? `${f.time(next.start)}–${f.time(blocks.length === 1 ? lastEnd : next.end)}` : "",
      hint: statusKey === "disconnected" && next ? `Sættes bilen til nu, lader den ${f.dayTime(next.start)}–${f.time(blocks.length === 1 ? lastEnd : next.end)}${blocks.length > 1 ? ` (+${blocks.length - 1} perioder)` : ""}${cost != null ? ` · ${ttdJoin(f.number(cost, 2), costUnit)}` : ""}` : "",
      // Unplugged the plan is only what would happen if it were plugged in now (the hint says so): no start or end
      // time that reads as if it will charge (user, 2026-10-16).
      start: statusKey === "disconnected" ? TTD_DASH : next ? (next.start.getTime() <= now ? "Nu" : f.time(next.start)) : TTD_DASH,
      startDay: statusKey === "disconnected" ? "ikke sat til" : next && next.start.getTime() > now ? f.relativeDay(next.start) : "",
      end: statusKey === "disconnected" ? TTD_DASH : next ? f.time(lastEnd) : TTD_DASH,
      endDay: statusKey === "disconnected" ? "" : next ? f.relativeDay(lastEnd) : "",
      cost: cost == null ? TTD_DASH : ttdJoin(f.number(cost, 2), costUnit),
      kwh: energy != null && energy > 0 ? `${f.number(energy, 1)} kWh${blocks.some((block) => block.estimated) ? " · delvist skønnet pris" : ""}` : "",
      fixed: mode === "fixed" ? { start: time("fixed_start"), end: time("fixed_end") } : null,
      // EV Ledger's price limit on Cheapest: own set points, adjustable here.
      limit: mode === "smart" && this._sc("smart_price_limit") && this._sc("smart_price_limit").state !== "unavailable" ? (() => {
        // Ask before dear charging (EV Ledger 0.9; Claude AI, 2026-10-15): the plan charges to the target; when waiting
        // with the rest for a cheaper later period saves enough, it can wait (switch "Wait above the price limit").
        const sw = this._sc("smart_price_limit");
        const savingObj = this._sc("ask_min_saving");
        const priceObj = savingObj ? null : this._sc("smart_max_price");
        const on = sw.state === "on";
        const a = this._sc("next_charge_start")?.attributes || {};
        const above = Number(a.above_limit_kwh) || 0;
        const reach = a.limit_soc != null && Number.isFinite(Number(a.limit_soc)) ? Number(a.limit_soc) : null;
        const waitObj = this._sc("price_limit_wait");
        const waiting = waitObj?.state === "on";
        const relevant = on && above >= 0.5 && (a.limit_ask == null || a.limit_ask === true || waiting);
        const saved = Number(a.limit_saving);
        const info = !on ? "" : waiting && above >= 0.5 ? "Venter med resten"
          : relevant ? (Number.isFinite(saved) ? `Spar ca. ${ttdJoin(f.number(saved, 0), costUnit)} ved at vente` : `${f.number(above, 1)} kWh billigere senere`)
          : "Intet at spare ved at vente";
        let choice = null;
        if (relevant && statusKey !== "disconnected" && waitObj && waitObj.state !== "unavailable") {
          const later = (Array.isArray(a.limit_cheaper) ? a.limit_cheaper : []).map((w) => ({ ...w, at: ttdToDate(w.start) })).filter((w) => w.at);
          const best = later.reduce((m, w) => (!m || Number(w.saving) > Number(m.saving) ? w : m), null);
          const overCost = Number(a.above_limit_cost);
          const use = Number(a.daily_use_kwh);
          const drive = Number.isFinite(use) && use > 0 ? `I kører ca. ${f.number(use, 1)} kWh om dagen` : "";
          const windows = later.map((w) => `${w.kind === "day" ? "Dag" : "Nat"} ${f.dayTime(w.at)}: ca. ${f.number(Number(w.price), 2)} kr/kWh${w.estimated ? " (prognose)" : ""} · spar ca. ${ttdJoin(f.number(Number(w.saving), 0), costUnit)}`);
          // The answers say what they charge to tonight (user, 2026-10-15: "Vent med resten" should show it, so it is
          // easy to judge whether that is enough).
          const socNow = this._num("battery");
          const goal = Number.isFinite(Number(a.deadline_target)) && a.deadline_target != null ? Number(a.deadline_target) : this._scNum("plan_target_soc");
          choice = {
            waitLabel: reach == null ? "Vent med resten" : socNow != null && reach <= socNow + 0.5 ? "Lad ikke i nat" : `Lad kun til ${f.number(reach, 0)} %`,
            fullLabel: goal != null ? `Lad til ${f.number(goal, 0)} %` : "Lad til målet",
            wait: waiting,
            title: waiting ? `Venter med ${f.number(above, 1)} kWh` : `${f.number(above, 1)} kWh kan lades billigere senere`,
            detail: waiting
              ? [reach != null ? `Lader til ca. ${f.number(reach, 0)} % i nat` : "Lader ikke i nat", best ? `resten ${f.dayTime(best.at)}` : "resten i næste billige periode", drive].filter(Boolean).join(" · ")
              : [Number.isFinite(overCost) && overCost > 0 ? `ca. ${ttdJoin(f.number(overCost, 2), costUnit)} i nat` : "", reach != null ? `venter du, lader den til ca. ${f.number(reach, 0)} % i nat` : "", drive].filter(Boolean).join(" · "),
            windows,
          };
        }
        const valueObj = savingObj || priceObj;
        // The fixed price limit next to the saving (user, 2026-10-15: "nu kan jeg ikke justere maks kroner mere i
        // popup"): empty / 0 = only the saving counts.
        const maxObj = savingObj ? this._sc("smart_max_price") : null;
        const maxNum = ttdHasValue(maxObj) ? ttdToNumber(maxObj.state) : null;
        const max = maxObj && maxObj.state !== "unavailable"
          ? { value: maxNum != null && maxNum > 0 ? String(maxNum) : "", unit: ttdUnit(maxObj.attributes?.unit_of_measurement ?? "") } : null;
        return { on, saving: !!savingObj, value: ttdHasValue(valueObj) ? String(ttdToNumber(valueObj.state)) : "",
          unit: ttdUnit(valueObj?.attributes?.unit_of_measurement ?? ""), floor: this._scNum("smart_floor_soc"), max, info, choice };
      })() : null,
      limitLine,
      cap: mode === "price_cap" ? { value: ttdHasValue(capObj) ? String(ttdToNumber(capObj.state)) : "", unit: ttdUnit(capObj?.attributes?.unit_of_measurement ?? ""), min: this._scNum("min_soc"), over: (() => {
        // EV Ledger: may the plan go above the cap to reach the target by the ready-by time, and what that costs.
        const sw = this._sc("price_cap_override");
        if (!sw || sw.state === "unavailable") return null;
        const a = sw.attributes || {};
        const kwh = Number(a.over_cap_kwh) || 0;
        const reach = Number.isFinite(Number(a.cap_soc)) && a.cap_soc !== null ? `loftet når ca. ${f.number(Number(a.cap_soc), 0)} %` : "";
        const unit = ttdUnit(this._sc("planned_cost")?.attributes?.unit_of_measurement ?? "kr.");
        let info;
        if (sw.state !== "on") info = ["Holder loftet", reach].filter(Boolean).join(" · ");
        else if (kwh > 0) info = [`${f.number(kwh, 1)} kWh over loftet${Number.isFinite(Number(a.over_cap_max_price)) && a.over_cap_max_price !== null ? `, op til ${f.number(Number(a.over_cap_max_price), 2)} ${unit}/kWh` : ""} (+${f.number(Number(a.over_cap_extra) || 0, 2)} ${unit})`, reach].filter(Boolean).join(" · ");
        else info = "Loftet rækker til målet";
        return { on: sw.state === "on", info };
      })() } : null,
      trip: { active: !!trip, departure: trip, summary: tripSum, info: tripInfo, destination, roundTrip },
      wait,
      options: options.length ? { list: options, summary: `${options.filter((o) => o.on).length} af ${options.length} slået til`, note: notes.join("\n") } : null,
      awaiting: statusKey === "awaiting_confirmation",
      confirmLabel: `Bekræft ${ttdScLabel(mode).toLowerCase()}`,
      def: (() => {
        const obj = this._sc("default_charge_mode");
        if (!ttdHasValue(obj)) return null;
        const value = obj.state;
        const label = ttdScLabel(value);
        let summary = label;
        if (mode === "manual" && value !== "manual") summary = `${label} · Manuel er valgt, indtil du skifter`;
        else if (mode && mode !== value) summary = `${label} · går tilbage hertil efter ${ttdScLabel(mode)}`;
        const options = Array.isArray(obj.attributes?.options) ? obj.attributes.options.map(String) : TTD_SC_DEFAULTS;
        return { mode: value, label, summary, options };
      })(),
      phone: (() => {
        const sw = this._sc("confirm_on_phone");
        if (!sw || sw.state === "unavailable") return null;
        const phones = Array.isArray(sw.attributes?.phones) ? sw.attributes.phones.length : 0;
        const info = this._sc("notify_plan");
        return {
          on: sw.state === "on", phones,
          info: phones ? `${phones} ${phones === 1 ? "mobil" : "mobiler"}` : "Vælg mobiler under Konfigurer",
          notify: info && info.state !== "unavailable" ? info.state === "on" : null,
          send: !!phones && !!this._sc("send_plan") && this._sc("send_plan").state !== "unavailable",
        };
      })(),
    };
  }

  /* ------------------------------------------------------ correct a charge (EV Ledger update_charge) */

  /** EV Ledger's finished charges, newest first (the charges sensor keeps the latest 20). */
  _ceCharges() {
    const list = this._so("charges")?.attributes?.charges;
    return Array.isArray(list) ? list.filter((c) => c && c.id && c.ended_at) : [];
  }

  _ceAvailable() {
    return !!this._ledgerEntity() && this._ceCharges().length > 0;
  }

  /** One charge's price per kWh and where the price came from, for the panel and the list. */
  _ceSummary(c) {
    if (!c) return null;
    const f = this._format();
    const kwh = ttdToNumber(c.kwh);
    const price = ttdToNumber(c.price);
    const unit = ttdPerKwh(ttdUnit(c.price_currency) || "kr.");
    const per = kwh && price != null ? price / kwh : null;
    const operator = c.operator ? String(c.operator) : "";
    const source = { place: "din pris for stedet", zone: "zonens pris", operator: operator ? `${operator}s pris` : "operatørens pris",
      default: "standardprisen", manual: "rettet af dig" }[c.price_source] || (c.location_kind === "home" ? "målt hjemme" : "");
    return {
      missing: price == null,
      price: price == null ? "Mangler pris" : per == null ? ttdJoin(f.number(price, 2), ttdUnit(c.price_currency) || "kr.") : per === 0 ? "Gratis" : `${f.number(per, 2)} ${unit}`,
      source: price == null ? "Skriv kWh og prisen pr. kWh" : [source, kwh ? `${f.number(kwh, 1)} kWh = ${ttdJoin(f.number(price, 2), ttdUnit(c.price_currency) || "kr.")}` : ""].filter(Boolean).join(" · "),
    };
  }

  _ceOpen(id) {
    const dlg = this._r.ceDlg;
    const charges = this._ceCharges();
    if (!dlg || !charges.length) return;
    this._cePick(charges.find((c) => c.id === id) || charges[0]);
    this._ceRender();
    if (!dlg.open) {
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    }
  }

  _ceClose() {
    const dlg = this._r.ceDlg;
    clearTimeout(this._ceTimer);
    if (dlg?.open) {
      if (typeof dlg.close === "function") dlg.close();
      else dlg.removeAttribute("open");
    }
    this._ceDraft = null;
  }

  /** A draft of one charge (nothing is saved before "Gem"). */
  _cePick(c) {
    const kwh = ttdToNumber(c.kwh);
    const price = ttdToNumber(c.price);
    this._ceDraft = {
      id: c.id, kwh: kwh == null ? "" : ttdCeText(kwh, 2), per: kwh && price != null ? ttdCeText(price / kwh, 2) : "",
      total: price == null ? "" : ttdCeText(price, 2), place: c.location_name || "", last: "per", remember: "",
      error: "", saved: "", busy: false,
    };
  }

  _ceRender() {
    const body = this._r.ceBody;
    const d = this._ceDraft;
    if (!body || !d) return;
    const f = this._format();
    const charges = this._ceCharges();
    const c = charges.find((x) => x.id === d.id);
    if (!c) { this._ceClose(); return; }
    const pub = c.location_kind === "public";
    const unit = ttdPerKwh(ttdUnit(c.price_currency) || "kr.");
    const money = ttdUnit(c.price_currency) || "kr.";
    const when = (x) => { const t = ttdToDate(x.started_at); return t ? `${f.date(t)} ${f.time(t)}` : ""; };
    const where = (x) => (x.location_kind === "home" ? "Hjemme" : x.location_name || "Ude");
    const sum = this._ceSummary(c);
    const canPlace = pub && c.latitude != null && c.longitude != null;
    const list = charges.map((x) => {
      const s = this._ceSummary(x);
      return `<button type="button" class="ce-it" data-cepick="${ttdEsc(x.id)}" aria-pressed="${x.id === d.id}"><b>${ttdEsc(where(x))}</b><small>${ttdEsc(when(x))}${x.kwh != null ? ` · ${ttdEsc(f.number(Number(x.kwh), Number(x.kwh) < 1 ? 2 : 1))} kWh` : ""}</small><em${s.missing ? ' class="warn"' : ""}>${ttdEsc(s.price)}${x.price != null ? `<small>${ttdEsc(ttdJoin(f.number(Number(x.price), 2), money))}</small>` : ""}</em></button>`;
    }).join("");
    const scroll = this._r.ceList?.scrollTop;
    body.innerHTML = `
      <header class="rb-h">
        <span class="rb-hi">${ttdIcon("mdi:cash-edit")}</span>
        <div><h3 tabindex="-1" autofocus>Ret opladning</h3><p><b>${ttdEsc(where(c))}</b> · ${ttdEsc(when(c))}</p></div>
        <button type="button" class="rb-x" data-ceclose aria-label="Luk">${ttdIcon("mdi:close")}</button>
      </header>
      <section class="rb-sec">
        <h4>${ttdIcon("mdi:cash")}Pris</h4>
        <p class="rb-note">Nu: <b>${ttdEsc(sum.price)}</b>${sum.missing ? "" : ` · ${ttdEsc(sum.source)}`}</p>
        <div class="ce-f">
          <label class="rb-f"><span>kWh</span><input type="text" inputmode="decimal" autocomplete="off" data-cein="kwh" value="${ttdEsc(d.kwh)}" placeholder="23,4"></label>
          <label class="rb-f main"><span>Pris (${ttdEsc(unit)})</span><input type="text" inputmode="decimal" autocomplete="off" data-cein="per" value="${ttdEsc(d.per)}" placeholder="3,95"></label>
          <label class="rb-f"><span>I alt (${ttdEsc(money)})</span><input type="text" inputmode="decimal" autocomplete="off" data-cein="total" value="${ttdEsc(d.total)}" placeholder="92,43"></label>
        </div>
        <p class="ce-sum" data-cesum>${ttdEsc(this._ceSumText())}</p>
        ${pub ? `<label class="rb-f"><span>Sted</span><input type="text" autocomplete="off" data-cein="place" value="${ttdEsc(d.place)}" placeholder="Fx Clever Bilka"></label>
        ${canPlace || c.operator ? `<div class="rb-seg" role="radiogroup" aria-label="Husk prisen">
          <button type="button" role="radio" aria-checked="${d.remember === ""}" data-ceremember="">Kun denne ladning</button>
          ${canPlace ? `<button type="button" role="radio" aria-checked="${d.remember === "place"}" data-ceremember="place">Husk for stedet</button>` : ""}
          ${c.operator ? `<button type="button" role="radio" aria-checked="${d.remember === "operator"}" data-ceremember="operator">Husk for ${ttdEsc(String(c.operator).slice(0, 18))}</button>` : ""}
        </div>
        <p class="rb-note">${d.remember === "place" ? "Næste ladning her (inden for ca. 150 m) får prisen og navnet af sig selv." : d.remember === "operator" ? `${ttdEsc(c.operator)} får prisen som sin ${Number(c.station_kw) >= 50 ? "lynladerpris (fra 50 kW)" : "normale pris"} til næste ladninger.` : "Prisen gælder kun denne ladning. En pris du retter, bliver aldrig skiftet ud af sig selv."}</p>` : ""}` : ""}
      </section>
      <section class="rb-sec">
        <h4>${ttdIcon("mdi:format-list-bulleted")}Vælg en anden opladning</h4>
        <div class="ce-list" data-r="ceList">${list}</div>
      </section>
      <p class="rb-err" role="alert"${d.error ? "" : " hidden"}>${ttdEsc(d.error)}</p>
      <p class="ce-ok" role="status"${d.saved ? "" : " hidden"}>${ttdEsc(d.saved)}</p>
      <footer class="rb-foot">
        <button type="button" class="btn" data-ceclose>Annuller</button>
        <button type="button" class="btn go" data-cesave ${d.busy ? "disabled" : ""}>Gem pris</button>
      </footer>`;
    this._r.ceList = body.querySelector(".ce-list");
    if (scroll != null && this._r.ceList) this._r.ceList.scrollTop = scroll;
  }

  /** "23,4 kWh × 3,95 kr/kWh = 92,43 kr." for the draft. */
  _ceSumText() {
    const d = this._ceDraft;
    const f = this._format();
    const kwh = ttdCeNum(d?.kwh);
    const per = ttdCeNum(d?.per);
    const total = ttdCeNum(d?.total);
    if (!(kwh > 0) || total == null) return "Skriv kWh og prisen pr. kWh – eller hvad ladningen kostede i alt.";
    return `${f.number(kwh, 1)} kWh × ${f.number(per ?? total / kwh, 2)} kr/kWh = ${f.number(total, 2)} kr.`;
  }

  /** Typing changes the draft; the total follows kWh × price per kWh, the price per kWh follows a total typed in. */
  _ceInput(el) {
    const d = this._ceDraft;
    const key = el.dataset.cein;
    if (!d || !key) return;
    d[key] = el.value;
    d.error = ""; d.saved = "";
    const body = this._r.ceBody;
    const set = (k, value) => { d[k] = value; const input = body?.querySelector(`[data-cein="${k}"]`); if (input && input !== el) input.value = value; };
    const kwh = ttdCeNum(d.kwh);
    if (key === "per" || (key === "kwh" && d.last === "per")) {
      const per = ttdCeNum(d.per);
      if (key === "per") d.last = "per";
      if (kwh > 0 && per != null) set("total", ttdCeText(kwh * per, 2));
    } else if (key === "total" || key === "kwh") {
      const total = ttdCeNum(d.total);
      if (key === "total") d.last = "total";
      if (kwh > 0 && total != null) set("per", ttdCeText(total / kwh, 2));
    }
    const sum = body?.querySelector("[data-cesum]");
    if (sum) sum.textContent = this._ceSumText();
    for (const node of body?.querySelectorAll(".rb-err,.ce-ok") || []) node.hidden = true;
  }

  _ceAction(target) {
    if (target.dataset.ceopen != null) { this._ceOpen(); return; }
    const d = this._ceDraft;
    if (!d) return;
    if (target.dataset.ceclose != null) { this._ceClose(); return; }
    if (target.dataset.cepick != null) {
      const c = this._ceCharges().find((x) => x.id === target.dataset.cepick);
      if (c) this._cePick(c);
    } else if (target.dataset.ceremember != null) d.remember = target.dataset.ceremember;
    else if (target.dataset.cesave != null) { this._ceSave(); return; }
    this._ceRender();
  }

  async _ceSave() {
    const d = this._ceDraft;
    const c = this._ceCharges().find((x) => x.id === d?.id);
    const entity = this._ledgerEntity();
    if (!d || !c || !entity || d.busy) return;
    const kwh = ttdCeNum(d.kwh);
    const per = ttdCeNum(d.per);
    const total = ttdCeNum(d.total);
    const fail = (text) => { d.error = text; this._ceRender(); };
    if (!(kwh > 0) || kwh > 300) return fail("Skriv hvor mange kWh ladningen gav (fx 23,4).");
    if (d.last === "total" ? total == null || total < 0 : per == null || per < 0 || per > 100) return fail("Skriv prisen pr. kWh (fx 3,95) – eller prisen i alt.");
    const place = String(d.place || "").trim();
    if (d.remember === "place" && !place) return fail("Giv stedet et navn, så det kan huskes (fx Clever Bilka).");
    const data = { entity_id: entity, charge_id: c.id, kwh };
    if (d.last === "total") data.price = Math.round(total * 100) / 100;
    else data.price_per_kwh = Math.round(per * 10000) / 10000;
    if (c.location_kind === "public" && place !== (c.location_name || "")) data.location_name = place;
    if (d.remember) data.remember = d.remember;
    d.busy = true; d.error = ""; this._ceRender();
    try {
      await this._hass.callService("evledger", "update_charge", data);
      const f = this._format();
      const price = data.price ?? Math.round(kwh * data.price_per_kwh * 100) / 100;
      d.busy = false;
      d.saved = `Gemt: ${f.number(kwh, 1)} kWh × ${f.number(price / kwh, 2)} kr/kWh = ${f.number(price, 2)} kr.${d.remember === "place" ? " Prisen huskes for stedet." : d.remember === "operator" ? ` Prisen huskes for ${c.operator}.` : ""}`;
      this._ceRender();
      clearTimeout(this._ceTimer);
      this._ceTimer = setTimeout(() => this._ceClose(), 1600);
    } catch (err) {
      d.busy = false;
      fail(`Kunne ikke gemme: ${err?.message || err}`);
    }
  }

  /* ------------------------------------------------------ ready-by popup (EV Ledger week plan, one-time time) */

  /** The "Klar senest" button: the next ready-by time, its target when it has its own, and what set it. */
  _rbModel(f) {
    const week = this._sc("week_plan");
    if (!week) return null;
    const a = week.attributes || {};
    const next = ttdToDate(a.next_ready_by);
    const normal = ttdToNumber(a.normal_target);
    const target = ttdToNumber(a.next_target);
    const own = target != null && normal != null && Math.round(target) !== Math.round(normal);
    const source = { once: "Engangstid", week: "Ugeplan", learned: "Lærte afgange", time: this._rbSameText() }[a.next_source] || "";
    return {
      value: next ? `${ttdRbWhen(f, next)}${own ? ` · ${Math.round(target)} %` : ""}` : TTD_DASH,
      source,
      sig: JSON.stringify([a.next_ready_by, a.next_target, a.next_source, a.once, week.state, a.days]),
    };
  }

  _rbSameText() {
    const weekend = this._sc("weekend_ready_by")?.state === "on" && ttdIsClock(this._sc("ready_by_weekend")?.state);
    return weekend ? "Hverdage og weekend" : "Samme tid hver dag";
  }

  _rbIsOpen() {
    return !!this._r.rbDlg?.open;
  }

  /** Open the popup with a draft of the current settings (nothing is saved before "Gem"). */
  _rbOpen() {
    const dlg = this._r.rbDlg;
    if (!dlg) return;
    const week = this._sc("week_plan");
    const a = week?.attributes || {};
    const same = ttdClock(this._sc("ready_by_time")?.state) || "07:00";
    const weekend = ttdClock(this._sc("ready_by_weekend")?.state) || "09:00";
    const weekendOn = this._sc("weekend_ready_by")?.state === "on";
    const days = {};
    for (const [key] of TTD_RB_DAYS) {
      const day = a.days?.[key];
      days[key] = day ? { on: true, time: ttdClock(day.time) || same, target: day.target ?? "" }
        : a.days ? { on: false, time: same, target: "" } : { on: true, time: weekendOn && (key === "sat" || key === "sun") ? weekend : same, target: "" };
    }
    const next = ttdToDate(a.next_ready_by);
    this._rbDraft = {
      mode: week?.state === "on" ? "week" : "same", same, weekend, weekendOn, days,
      onceAt: next ? ttdLocalInput(next) : "", onceTarget: "", error: "", busy: false,
    };
    this._rbRender();
    if (!dlg.open) {
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    }
  }

  _rbClose() {
    const dlg = this._r.rbDlg;
    if (dlg?.open) {
      if (typeof dlg.close === "function") dlg.close();
      else dlg.removeAttribute("open");
    }
    this._rbDraft = null;
  }

  _rbRender() {
    const body = this._r.rbBody;
    const d = this._rbDraft;
    if (!body || !d) return;
    const f = this._format();
    const week = this._sc("week_plan");
    const a = week?.attributes || {};
    const normal = ttdToNumber(a.normal_target) ?? this._targetSoc() ?? 80;
    const next = ttdToDate(a.next_ready_by);
    const nextTarget = ttdToNumber(a.next_target);
    const once = a.once && ttdToDate(a.once.at) ? { at: ttdToDate(a.once.at), target: ttdToNumber(a.once.target) } : null;
    const src = { once: "engangstid", week: "ugeplan", learned: "lærte afgange", time: this._rbSameText().toLowerCase() }[a.next_source] || "";
    const learned = this._sc("learn_departure");
    const learnedTimes = learned?.attributes?.departures;
    const minSoc = ttdToNumber(this._sc("min_soc")?.state);
    const targets = (value) => `<option value=""${value === "" || value == null ? " selected" : ""}>Normal ${Math.round(normal)} %</option>${[50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100].map((v) => `<option value="${v}"${Number(value) === v ? " selected" : ""}>${v} %</option>`).join("")}`;
    const now = new Date();
    const max = new Date(now.getTime() + 14 * 86400000);
    const onDays = TTD_RB_DAYS.filter(([key]) => d.days[key].on);
    const earliest = onDays.map(([key]) => d.days[key].time).sort()[0];
    const scroll = this._r.rbDlg?.scrollTop || 0;
    body.innerHTML = `
      <header class="rb-h">
        <span class="rb-hi">${ttdIcon("mdi:calendar-clock")}</span>
        <div><h3 tabindex="-1" autofocus>Klar senest</h3><p>${next ? `Næste: <b>${ttdEsc(ttdRbWhen(f, next, true))}</b> · ${Math.round(nextTarget ?? normal)} % · ${ttdEsc(src)}` : "Ingen klar-senest-tid endnu"}</p></div>
        <button type="button" class="rb-x" data-rbclose aria-label="Luk">${ttdIcon("mdi:close")}</button>
      </header>
      <section class="rb-sec">
        <h4>${ttdIcon("mdi:numeric-1-circle-outline")}Engangstid</h4>
        ${once ? `<div class="rb-once-on">
            <div><b>${ttdEsc(ttdRbWhen(f, once.at, true))}</b><small>${Math.round(once.target ?? normal)} % · bruges én gang, derefter gælder ${d.mode === "week" && week?.state === "on" ? "ugeplanen" : "den normale tid"} igen</small></div>
            <button type="button" class="btn" data-rbonceclear ${d.busy ? "disabled" : ""}>Fjern</button>
          </div>`
          : `<p class="rb-note">Til en enkelt gang, fx en tidlig tur. Når tiden er nået, gælder den normale plan igen af sig selv.</p>
          <div class="rb-once">
            <label class="rb-f"><span>Klar senest</span><input type="datetime-local" step="60" data-rbin="onceAt" value="${ttdEsc(d.onceAt)}" min="${ttdLocalInput(now)}" max="${ttdLocalInput(max)}"></label>
            <label class="rb-f"><span>Mål</span><select data-rbin="onceTarget">${targets(d.onceTarget)}</select></label>
            <button type="button" class="btn go" data-rboncesave ${d.busy ? "disabled" : ""}>Brug én gang</button>
          </div>`}
      </section>
      <section class="rb-sec">
        <h4>${ttdIcon("mdi:calendar-sync-outline")}Normal plan</h4>
        <div class="rb-seg" role="radiogroup" aria-label="Normal plan">
          <button type="button" role="radio" aria-checked="${d.mode === "same"}" data-rbmode="same">Samme tid hver dag</button>
          <button type="button" role="radio" aria-checked="${d.mode === "week"}" data-rbmode="week">Ugeplan</button>
        </div>
        ${d.mode === "same" ? `
          <label class="rb-row"><span class="rb-day">Hver dag</span><input type="time" step="60" data-rbin="same" value="${ttdEsc(d.same)}"></label>
          <div class="rb-row">
            <button type="button" class="rb-tog" data-rbweekend aria-pressed="${d.weekendOn}">${ttdIcon(d.weekendOn ? "mdi:checkbox-marked-circle" : "mdi:checkbox-blank-circle-outline")}<span>Anden tid i weekenden</span></button>
            <input type="time" step="60" data-rbin="weekend" value="${ttdEsc(d.weekend)}" ${d.weekendOn ? "" : "disabled"} aria-label="Weekend">
          </div>
          <p class="rb-note">Målet er ${Math.round(normal)} % (Mål SOC). Med ugeplanen kan hver dag få sin egen tid og sit eget mål, og dage uden kørsel kan springes over.</p>`
        : `
          <div class="rb-week">${TTD_RB_DAYS.map(([key, name]) => {
            const day = d.days[key];
            return `<div class="rb-wd${day.on ? "" : " off"}">
              <button type="button" class="rb-tog" data-rbday="${key}" aria-pressed="${day.on}" aria-label="${name} ${day.on ? "til" : "fri"}">${ttdIcon(day.on ? "mdi:checkbox-marked-circle" : "mdi:checkbox-blank-circle-outline")}<span>${name}</span></button>
              ${day.on ? `<input type="time" step="60" data-rbin="time:${key}" value="${ttdEsc(day.time)}" aria-label="${name} klar senest"><select data-rbin="target:${key}" aria-label="${name} mål">${targets(day.target)}</select>`
                : `<span class="rb-free">Fri dag – ingen klar-tid</span>`}
            </div>`;
          }).join("")}</div>
          <div class="rb-tools">
            <button type="button" class="chip" data-rbcopy>${ttdIcon("mdi:content-copy")}<span>Mandag til alle hverdage</span></button>
            ${learnedTimes && Object.values(learnedTimes).some(Boolean) ? `<button type="button" class="chip" data-rblearned>${ttdIcon("mdi:school-outline")}<span>Brug lærte afgange</span></button>` : ""}
          </div>
          <p class="rb-note">Planen lader billigst muligt, så bilen er klar på hver dags tid med dagens mål.${onDays.length < 7 && earliest ? ` På fri dage holdes mindst ${minSoc != null ? `${Math.round(minSoc)} %` : "minimum"} fra kl. ${earliest}.` : ""}${learned?.state === "on" ? " Ugeplanen bruges i stedet for de lærte afgange." : ""} Et eget mål sættes også som bilens ladegrænse, mens den er sat til laderen.</p>`}
      </section>
      <p class="rb-err" role="alert"${d.error ? "" : " hidden"}>${ttdEsc(d.error)}</p>
      <footer class="rb-foot">
        <button type="button" class="btn" data-rbclose>Annuller</button>
        <button type="button" class="btn go" data-rbsave ${d.busy ? "disabled" : ""}>Gem plan</button>
      </footer>`;
    this._rbSig = this._rbModel(f)?.sig;
    if (this._r.rbDlg) this._r.rbDlg.scrollTop = scroll;
  }

  /** Inputs only change the draft (no redraw while typing). */
  _rbInput(el) {
    const d = this._rbDraft;
    const key = el.dataset.rbin;
    if (!d || !key) return;
    if (key.startsWith("time:")) d.days[key.slice(5)].time = el.value;
    else if (key.startsWith("target:")) d.days[key.slice(7)].target = el.value;
    else d[key] = el.value;
  }

  _rbAction(target) {
    const d = this._rbDraft;
    if (target.dataset.rbopen != null) return this._rbOpen();
    if (!d) return undefined;
    if (target.dataset.rbclose != null) return this._rbClose();
    d.error = "";
    if (target.dataset.rbmode) d.mode = target.dataset.rbmode;
    else if (target.dataset.rbday) { const day = d.days[target.dataset.rbday]; day.on = !day.on; }
    else if (target.dataset.rbweekend != null) d.weekendOn = !d.weekendOn;
    else if (target.dataset.rbcopy != null) {
      for (const key of ["tue", "wed", "thu", "fri"]) d.days[key] = { ...d.days.mon };
    } else if (target.dataset.rblearned != null) {
      const learned = this._sc("learn_departure")?.attributes?.departures || {};
      TTD_RB_DAYS.forEach(([key], i) => {
        const time = learned[TTD_RB_LEARNED[i]];
        d.days[key] = time ? { ...d.days[key], on: true, time } : { ...d.days[key], on: false };
      });
    } else if (target.dataset.rbsave != null) return this._rbSave();
    else if (target.dataset.rboncesave != null) return this._rbOnceSave();
    else if (target.dataset.rbonceclear != null) return this._rbService("clear_ready_by_once", {}, false);
    this._rbRender();
    return undefined;
  }

  async _rbService(service, data, close) {
    const d = this._rbDraft;
    const id = this._scIds().week_plan;
    if (!d || !id) return false;
    d.busy = true; this._rbRender();
    try {
      await this._hass.callService("evledger", service, { entity_id: id, ...data });
      if (close) this._rbClose(); else { d.busy = false; d.error = ""; this._rbRender(); }
      return true;
    } catch (err) {
      d.busy = false; d.error = `Kunne ikke gemmes: ${err?.message || err}`; this._rbRender();
      return false;
    }
  }

  _rbOnceSave() {
    const d = this._rbDraft;
    const at = d.onceAt ? new Date(d.onceAt) : null;
    if (!at || Number.isNaN(at.getTime()) || at <= new Date()) { d.error = "Vælg et tidspunkt ude i fremtiden."; this._rbRender(); return; }
    if (at.getTime() > Date.now() + 14 * 86400000) { d.error = "Engangstiden kan højst ligge 14 dage frem."; this._rbRender(); return; }
    this._rbService("set_ready_by_once", { at: at.toISOString(), ...(d.onceTarget ? { target: Number(d.onceTarget) } : {}) }, false);
  }

  async _rbSave() {
    const d = this._rbDraft;
    if (d.mode === "week") {
      const days = {};
      for (const [key, name] of TTD_RB_DAYS) {
        const day = d.days[key];
        if (day.on && !ttdIsClock(day.time)) { d.error = `Vælg en tid for ${name.toLowerCase()}.`; this._rbRender(); return; }
        days[key] = day.on ? { time: day.time, ...(day.target !== "" && day.target != null ? { target: Number(day.target) } : {}) } : null;
      }
      if (!Object.values(days).some(Boolean)) { d.error = "Mindst én dag skal have en klar-senest-tid."; this._rbRender(); return; }
      await this._rbService("set_week_plan", { days, enabled: true }, true);
      return;
    }
    if (!ttdIsClock(d.same) || (d.weekendOn && !ttdIsClock(d.weekend))) { d.error = "Vælg en tid."; this._rbRender(); return; }
    const ids = this._scIds();
    d.busy = true; this._rbRender();
    try {
      if (this._sc("week_plan")?.state === "on") await this._hass.callService("switch", "turn_off", { entity_id: ids.week_plan });
      if (ttdClock(this._sc("ready_by_time")?.state) !== d.same) await this._hass.callService("time", "set_value", { entity_id: ids.ready_by_time, time: `${d.same}:00` });
      if (ids.weekend_ready_by && this._sc("weekend_ready_by")) {
        if (d.weekendOn && ttdClock(this._sc("ready_by_weekend")?.state) !== d.weekend) await this._hass.callService("time", "set_value", { entity_id: ids.ready_by_weekend, time: `${d.weekend}:00` });
        if ((this._sc("weekend_ready_by").state === "on") !== d.weekendOn) await this._hass.callService("switch", d.weekendOn ? "turn_on" : "turn_off", { entity_id: ids.weekend_ready_by });
      }
      this._rbClose();
    } catch (err) {
      d.busy = false; d.error = `Kunne ikke gemmes: ${err?.message || err}`; this._rbRender();
    }
  }

  _deadlineModel(f) {
    const id = this._deadlineEntity();
    const stateObj = id ? this._hass?.states?.[id] : undefined;
    const editable = !!this._control("deadline");
    if (!ttdHasValue(stateObj)) return { text: null, input: "", type: "time", editable: false };
    const domain = id.split(".")[0];
    const attrs = stateObj.attributes || {};
    const raw = String(stateObj.state).trim();
    const hasDate = domain === "datetime" || (domain === "input_datetime" && attrs.has_date === true && attrs.has_time !== false);
    if (domain === "input_datetime" && attrs.has_date === true && attrs.has_time === false) return { text: f.date(`${raw}T00:00:00`), input: raw, type: "date", editable };
    if (hasDate) {
      const date = ttdToDate(raw);
      if (!date) return { text: null, input: "", type: "datetime-local", editable: false };
      const local = domain === "datetime" ? "" : raw.slice(0, 16).replace(" ", "T");
      return { text: f.dayDiff(date) === 0 ? f.time(date) : `${f.date(date)} ${f.time(date)}`, input: local, type: "datetime-local", editable: editable && domain === "input_datetime" };
    }
    return ttdIsClock(raw) ? { text: ttdClock(raw), input: ttdClock(raw), type: "time", editable } : { text: null, input: "", type: "time", editable: false };
  }

  _tpmsModel(f) {
    const tires = {};
    let newest = null;
    for (const [ref, key] of [["FL", "tpms_front_left"], ["FR", "tpms_front_right"], ["RL", "tpms_rear_left"], ["RR", "tpms_rear_right"]]) {
      const stateObj = this._so(key);
      tires[ref] = ttdPressure(stateObj, this._cfg.tpms, f);
      const seen = ttdToNumber(stateObj?.attributes?.tpms_last_seen_pressure_timestamp);
      if (ttdHasValue(stateObj) && seen != null && (newest == null || seen > newest)) newest = seen;
    }
    return { tires, measured: newest == null ? "" : `Målt ${f.dayDiff(newest * 1000) === 0 ? f.time(newest * 1000) : f.dayTime(newest * 1000)}` };
  }

  _driveModel(f) {
    const months = this._attr("monthly_performance", "months");
    let month = TTD_DASH;
    if (Array.isArray(months) && ttdHasValue(this._so("monthly_performance"))) {
      const current = f.dayKey(new Date(), f.serverTz).slice(0, 7);
      const entry = months.find((item) => item?.month === current);
      month = entry ? ttdJoin(f.number(ttdToNumber(entry.distance_km), 0), "km") : ttdJoin(f.number(0, 0), "km");
    }
    const tripAttrs = this._so("last_trip")?.attributes || {};
    const tripStart = ttdToDate(tripAttrs.started_at);
    const tripEnd = ttdToDate(tripAttrs.ended_at);
    const tripMinutes = tripStart && tripEnd ? (tripEnd - tripStart) / 60000 : null;
    return {
      month,
      total: this._value("total_distance", 0),
      trips: this._value("trips", 0),
      lastTrip: this._value("last_trip", 1),
      lastTripMeta: ttdHasValue(this._so("last_trip")) && tripStart ? [f.relativeDay(tripStart), tripMinutes != null && tripMinutes >= 0 ? f.duration(tripMinutes) : null].filter(Boolean).join(" · ") : "",
    };
  }

  _econModel(f) {
    const score = this._num("efficiency_score");
    const monthly = this._num("monthly_performance");
    const missing = this._num("charges_needing_price");
    return {
      costKm: this._value("cost_per_km", 2),
      effScore: this._value("efficiency_score", 0), effTone: score != null && score >= 100 ? "ok" : null,
      monthly: this._value("monthly_performance", 0), monthlyTone: monthly == null ? null : monthly >= 100 ? "ok" : "warn",
      monthlyIcon: monthly != null && monthly < 100 ? "mdi:arrow-down" : "mdi:arrow-up",
      charges: this._value("charges", 0),
      noPrice: this._value("charges_needing_price", 0), noPriceTone: missing != null && missing > 0 ? "warn" : null,
      wallet: this._value("monta_wallet", 2),
    };
  }

  _lastChargeModel(f) {
    const ledger = this._so("last_charge");
    const monta = this._so("monta_last_charge");
    // EV Ledger's session counts as soon as it has started, also while its price is still unknown.
    const useLedger = ttdHasValue(ledger) || !!ttdToDate(ledger?.attributes?.started_at);
    const a = (useLedger ? ledger : monta)?.attributes || {};
    const source = useLedger ? "last_charge" : ttdHasValue(monta) ? "monta_last_charge" : null;
    const kwh = ttdToNumber(useLedger ? a.kwh : a.consumedKwh);
    const price = useLedger ? ttdToNumber(a.price) ?? ttdToNumber(ledger.state) : ttdToNumber(a.cost);
    const currency = ttdUnit(useLedger ? a.price_currency || ledger.attributes?.unit_of_measurement : a.currency?.identifier?.toUpperCase());
    const start = ttdToDate(useLedger ? a.started_at : a.startedAt);
    const end = ttdToDate(useLedger ? a.ended_at : a.stoppedAt);
    const minutes = start && end ? (end - start) / 60000 : null;
    const fromSoc = ttdToNumber(useLedger ? a.start_battery_pct : null);
    const toSoc = ttdToNumber(useLedger ? a.end_battery_pct : a.soc?.percentage);
    const foot = source ? [
      end ? `Slut ${f.dayDiff(end) === f.dayDiff(start || end) ? f.time(end) : f.dayTime(end)}` : null,
      kwh && price != null ? `${f.number(price / kwh, 2)} ${ttdPerKwh(currency || "kr.")}` : null,
      fromSoc != null && toSoc != null ? `${f.number(fromSoc, 0)} → ${f.number(toSoc, 0)} %` : toSoc != null ? `${f.number(toSoc, 0)} %` : null,
      useLedger && a.location_name ? String(a.location_name) : null,
    ].filter(Boolean).join(" · ") : "";
    let montaLine = "";
    if (useLedger) {
      const energy = this._num("monta_charge_energy") ?? this._num("monta_last_meter_reading");
      const cost = ttdHasValue(monta) ? ttdToNumber(monta.attributes?.cost) : null;
      const montaCurrency = ttdUnit(monta?.attributes?.currency?.identifier?.toUpperCase());
      const parts = [energy != null ? `${f.number(energy, 2)} kWh` : null, cost != null ? ttdJoin(f.number(cost, 2), montaCurrency || "kr.") : null].filter(Boolean);
      if (parts.length) montaLine = `Monta: ${parts.join(" · ")}`;
    }
    return {
      source,
      kwh: kwh == null ? TTD_DASH : `${f.number(kwh, 2)} kWh`,
      price: price == null ? TTD_DASH : ttdJoin(f.number(price, 2), currency || "kr."),
      start: start ? `${f.date(start)} ${f.time(start)}` : TTD_DASH,
      duration: minutes == null || minutes < 0 ? TTD_DASH : f.duration(minutes),
      foot, montaLine,
    };
  }

  _mapModel(f) {
    const id = this._loc();
    const stateObj = id ? this._hass?.states?.[id] : undefined;
    const lat = ttdToNumber(stateObj?.attributes?.latitude);
    const lon = ttdToNumber(stateObj?.attributes?.longitude);
    const updated = ttdToDate(stateObj?.last_updated);
    const zone = ttdHasValue(stateObj) ? TTD_TEXT.zone[stateObj.state] ?? String(stateObj.state) : null;
    let empty = null;
    if (!id) empty = "Ingen placering konfigureret";
    else if (!stateObj) empty = "Placeringen findes ikke i Home Assistant";
    else if (stateObj.state === "unavailable") empty = "Placering ikke tilgængelig";
    else if (lat == null || lon == null) empty = "Ingen GPS-position";
    else if (this._mapError) empty = "Kortet kunne ikke indlæses";
    return {
      empty,
      meta: [zone, updated ? f.ago(updated) : null].filter(Boolean).join(" · ") || TTD_DASH,
      fresh: !!updated && Date.now() - updated.getTime() < 30 * 60000 && !empty,
    };
  }

  /* ------------------------------------------------------ DOM */

  _build() {
    this.shadowRoot.innerHTML = `<style>${TTD_STYLES}</style>${ttdTemplate(this._cfg)}`;
    this._r = {};
    for (const el of this.shadowRoot.querySelectorAll("[data-r]")) this._r[el.dataset.r] = el;
    this._moreEls = [...this.shadowRoot.querySelectorAll("[data-more]")];
    this._rangeEls = [...this.shadowRoot.querySelectorAll("[data-range]")];
    const cfg = this._cfg;
    this._watch = [...new Set([
      ...Object.values(cfg.entities), ...Object.values(cfg.controls).map((control) => control.entity),
      this._loc(), cfg.chart.distance_entity, cfg.chart.energy_entity, ...Object.values(this._scIds()),
    ].filter(Boolean))];
    this._seen.clear();
    this._force = true;
    this._built = true;
    this._chartSig = null;
    this._hi = -1;
    const img = this._r.carImg;
    img.addEventListener("error", () => {
      if (img.dataset.fallback) img.hidden = true;
      else {
        img.dataset.fallback = "1";
        img.src = TTD_FALLBACK_CAR;
      }
    });
    img.src = this._url(cfg.image) || ttdCarArt(cfg.body || "model_3", cfg.paint);
    if (!cfg.image) img.dataset.art = `${cfg.body || "model_3"}|${cfg.paint}`;
    const chart = this._r.chart;
    if (chart) {
      this._r.rangeSelect.value = this._chartRange;
      chart.addEventListener("pointermove", (event) => this._onChartPointer(event));
      const cost = this._r.costChart;
      if (cost && !cost.dataset.tipBound) {
        cost.dataset.tipBound = "1";
        cost.addEventListener("pointermove", (event) => this._costTip(event.target?.closest?.("[data-ci]")));
        cost.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse") this._costTip(null); });
        cost.addEventListener("click", (event) => this._costTip(event.target?.closest?.("[data-ci]"), true));
      }
      chart.addEventListener("pointerleave", () => this._showTip(-1));
      chart.addEventListener("blur", () => this._showTip(-1));
    }
    if (this._visible || typeof IntersectionObserver === "undefined") this._onVisible();
  }

  _t(ref, value) {
    const el = this._r[ref];
    const text = value == null ? "" : String(value);
    if (el && el.textContent !== text) el.textContent = text;
  }

  _hide(ref, hidden) {
    const el = this._r[ref];
    if (el && el.hidden !== !!hidden) el.hidden = !!hidden;
  }

  _attrSet(ref, name, value) {
    const el = typeof ref === "string" ? this._r[ref] : ref;
    if (!el) return;
    if (value == null || value === false) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else {
      const text = value === true ? "" : String(value);
      if (el.getAttribute(name) !== text) el.setAttribute(name, text);
    }
  }

  _style(ref, name, value) {
    const el = this._r[ref];
    if (el && el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
  }

  _apply(m) {
    const r = this._r;
    this._attrSet("wrap", "class", this._hass.themes?.darkMode ? "wrap dark" : "wrap");
    // hero
    this._attrSet("pill", "data-tone", m.hero.tone);
    this._t("statusText", m.hero.status);
    this._t("updatedLong", m.hero.updatedLong);
    this._t("updatedShort", m.hero.updatedShort);
    this._attrSet("hero", "data-charging", m.hero.charging);
    this._attrSet("ring", "data-tone", m.hero.socTone);
    this._t("soc", m.hero.soc);
    this._hide("socUnit", !m.hero.socKnown);
    this._attrSet("ringFill", "stroke-dasharray", `${m.hero.socPercent} 100`);
    this._attrSet("ringFill", "data-zero", m.hero.socPercent <= 0);
    this._t("range", m.hero.range);
    this._attrSet("ring", "aria-label", `Batteri ${m.hero.soc}${m.hero.socKnown ? " %" : ""}, rækkevidde ${m.hero.range}`);
    this._t("odometer", m.hero.odometer);
    this._t("inside", m.hero.inside);
    this._t("outside", m.hero.outside);
    // charge
    const c = m.charge;
    this._attrSet("charge", "data-active", c.active);
    this._t("chargeSub", c.sub);
    this._attrSet("chargeBadge", "data-tone", c.badge.tone);
    this._attrSet(r.chargeBadge.firstElementChild, "icon", c.badge.icon);
    this._t("chargeBadgeText", c.badge.text);
    this._t("chargeSoc", c.soc);
    this._t("chargeTarget", c.target || "");
    this._attrSet("bar", "data-tone", c.socTone);
    this._style("bar", "--soc", String(c.socPercent));
    this._hide("barMark", c.targetPercent == null);
    this._style("bar", "--target", String(c.targetPercent ?? 0));
    this._t("power", c.power);
    this._t("rate", c.rate);
    this._t("finish", c.finish);
    this._t("remaining", c.remaining);
    this._attrSet("montaDot", "data-tone", c.montaTone);
    this._t("montaState", c.monta);
    this._hide("ptl", !c.plan);
    if (c.plan && r.ptl) {
      this._t("ptlTitle", c.plan.title);
      if (r.ptlBat && r.ptlBat.dataset.sig !== c.plan.battery) { r.ptlBat.dataset.sig = c.plan.battery; r.ptlBat.innerHTML = c.plan.battery; }
      this._t("ptlStatus", c.plan.status);
      this._t("ptlLine", c.plan.line);
      if (r.ptlTrack.dataset.sig !== c.plan.track) { r.ptlTrack.dataset.sig = c.plan.track; r.ptlTrack.innerHTML = c.plan.track; }
      r.ptlTrack.hidden = !c.plan.track;
      const acts = JSON.stringify([c.plan.acts, this._armed]);
      if (r.ptlActs.dataset.sig !== acts) {
        r.ptlActs.dataset.sig = acts;
        r.ptlActs.innerHTML = c.plan.acts.map((x) => `<button type="button" class="btn${x.key === "full" ? " go" : ""}" data-planact="${x.key}"${this._armed === `plan:${x.key}` ? " data-armed" : ""}>${ttdEsc(this._armed === `plan:${x.key}` ? `Bekræft: ${x.label.toLowerCase()}` : x.label)}</button>`).join("");
      }
      r.ptlActs.hidden = !c.plan.acts.length;
    }
    this._t("chargerMode", c.mode);
    this._hide("modeBox", !c.modeBoxVisible);
    this._renderModeSelect(c.modeOptions);
    this._hide("startBtn", !c.startVisible);
    this._hide("stopBtn", !c.stopVisible);
    this._t("startBtn", c.startBusy ? "Starter …" : this._armed === "start_charge" ? `Bekræft: ${c.startLabel.toLowerCase()}` : c.startLabel);
    this._attrSet("startBtn", "title", c.plan ? "Overstyrer planen: lader med det samme til målet, derefter tilbage til standardplanen" : null);
    this._t("stopBtn", c.stopBusy ? "Stopper …" : this._armed === "stop_charge" ? "Bekræft: stop" : "Stop");
    this._attrSet("startBtn", "data-busy", c.startBusy);
    this._attrSet("stopBtn", "data-busy", c.stopBusy);
    this._attrSet("startBtn", "aria-busy", c.startBusy ? "true" : null);
    this._attrSet("stopBtn", "aria-busy", c.stopBusy ? "true" : null);
    this._attrSet("startBtn", "data-armed", this._armed === "start_charge");
    this._attrSet("stopBtn", "data-armed", this._armed === "stop_charge");
    this._hide("estimate", !c.estimate || !!c.compare);
    this._t("estimate", c.estimate || "");
    this._hide("cmp", !c.compare);
    if (c.compare) {
      const signature = JSON.stringify([c.compare, this._armed]);
      if (r.cmp.dataset.sig !== signature) {
        r.cmp.dataset.sig = signature;
        r.cmp.innerHTML = c.compare.map((item) => `<button type="button" role="radio" class="cmp-i" data-scmode="${item.key}" aria-checked="${item.active}"${this._armed === `mode:${item.key}` ? " data-armed" : ""}><small>${ttdEsc(this._armed === `mode:${item.key}` ? "Tryk igen for at vælge" : item.label)}</small><b>${ttdEsc(item.price)}${item.estimated ? "*" : ""}</b><span>${ttdEsc(item.detail)}</span>${item.saving ? `<em>${ttdEsc(item.saving)}</em>` : ""}</button>`).join("");
      }
    }
    // vehicle
    const v = m.vehicle;
    this._t("model", v.name);
    const cfg = this._cfg;
    // The charging popup shows the car with its cable while it is plugged in.
    const heroPhoto = cfg.layout === "charge" && m.charge.plugged ? cfg.chargeImage : null;
    const heroKey = heroPhoto || v.image || `${v.body}|${v.paint}`;
    if (r.carImg.dataset.key !== heroKey) {
      r.carImg.dataset.key = heroKey;
      delete r.carImg.dataset.fallback;
      r.carImg.hidden = false;
      r.carImg.src = this._url(heroPhoto || v.image) || ttdCarArt(v.body, v.paint);
    }
    // A photo with its own backdrop (JPEG) fades out at the edges; a transparent one (WebP/PNG) is drawn like the artwork.
    this._attrSet(r.carImg, "data-photo", !!heroPhoto && ttdOpaque(heroPhoto));
    // The charging cable comes alive while the car charges (like the Tesla app).
    const flowing = !!cfg.cable && m.charge.active && !!cfg.chargeImage;
    this._placeCable(r.heroCable, r.carImg, flowing && heroPhoto === cfg.chargeImage, "YMax");
    if (r.chargeArt) {
      const photo = m.charge.plugged ? cfg.chargeImage || cfg.parkedImage : cfg.parkedImage;
      this._hide("chargeArt", !photo);
      if (photo && r.chargeArtImg.dataset.src !== photo) {
        r.chargeArtImg.dataset.src = photo;
        r.chargeArtImg.src = this._url(photo);
        this._attrSet(r.chargeArtImg, "data-fade", ttdOpaque(photo));
      }
      this._placeCable(r.artCable, r.chargeArtImg, flowing && photo === cfg.chargeImage, "YMid");
    }
    if (m.sc) this._applySmart(m.sc);
    this._applyCarControls();
    // plan
    const p = m.plan;
    this._hide("planBadge", !p.badge);
    if (p.badge) {
      this._attrSet("planBadge", "data-tone", p.badge.tone);
      this._t("planBadgeText", p.badge.text);
    }
    this._t("planSub", p.sub);
    this._t("bestStart", p.bestStart);
    this._t("bestEnd", p.bestEnd);
    this._t("bestPrice", p.bestPrice);
    this._t("bestPriceKwh", p.bestPriceKwh);
    this._t("missing", p.missing);
    this._t("minutes", p.minutes);
    this._hide("applyBtn", !p.applyVisible);
    this._t("applyBtn", this._armed === "apply_plan" ? "Bekræft: brug ladeplan" : "Brug ladeplan");
    this._attrSet("applyBtn", "data-armed", this._armed === "apply_plan");
    this._hide("socCtl", !p.soc);
    if (p.soc) {
      const range = r.socRange;
      this._attrSet(range, "min", p.soc.min);
      this._attrSet(range, "max", p.soc.max);
      this._attrSet(range, "step", p.soc.step);
      const pending = this._socPending;
      if (!this._dragSoc && pending == null) {
        if (range.value !== String(p.soc.value)) range.value = String(p.soc.value);
        this._t("socCtlVal", p.soc.text);
        range.style.setProperty("--p", `${p.soc.percent}%`);
      }
      this._hide("socOk", pending == null);
      if (pending != null) {
        this._t("socOkText", `Nyt mål ${this._format().number(pending, 0)} % (nu ${p.soc.text})`);
        if (!this._dragSoc) this._t("socCtlVal", `${this._format().number(pending, 0)} %`);
      }
    } else this._hide("socOk", true);
    const dl = p.deadline;
    // EV Ledger with the week plan: "Klar senest" opens the ready-by popup instead of a single time field.
    const rb = m.rb;
    this._hide("rbOpen", !rb);
    if (rb) { this._t("rbVal", rb.value); this._t("rbSrc", rb.source); }
    this._hide("dlCtl", !dl.editable || !!rb);
    if (rb && this._rbIsOpen() && rb.sig !== this._rbSig) this._rbRender();
    if (dl.editable) {
      const input = r.dlInput;
      if (input.type !== dl.type) input.type = dl.type;
      if (this.shadowRoot.activeElement !== input && input.value !== dl.input) input.value = dl.input;
    }
    this._hide("planCtl", !m.sc && !p.soc && !dl.editable && !rb);
    // tpms
    for (const key of ["FL", "FR", "RL", "RR"]) {
      const tire = m.tpms.tires[key];
      this._attrSet(`t${key}`, "data-tone", tire.tone);
      this._attrSet(`w${key}`, "data-tone", tire.tone);
      this._t(`t${key}V`, tire.text);
      this._t(`t${key}S`, { ok: "Normalt", warn: tire.status, crit: tire.status }[tire.tone] || tire.status);
      if (r[`t${key}`]) this._attrSet(`t${key}`, "aria-label", `${r[`t${key}`].querySelector("small").textContent}: ${tire.text}${tire.status ? `, ${tire.status}` : ""}`);
    }
    this._t("tpmsTime", m.tpms.measured);
    if (r.topImg && r.topImg.dataset.src !== this._cfg.topImage) { r.topImg.dataset.src = this._cfg.topImage; r.topImg.src = this._url(this._cfg.topImage); }
    // One line for all four: fine, or which tyres need air.
    const names = { FL: "venstre for", FR: "højre for", RL: "venstre bag", RR: "højre bag" };
    const tires = ["FL", "FR", "RL", "RR"].map((key) => [key, m.tpms.tires[key]]);
    const off = tires.filter(([, tire]) => ["warn", "crit"].includes(tire.tone));
    const known = tires.filter(([, tire]) => tire.tone !== "muted");
    const summary = !known.length ? TTD_TEXT.tpms.unknown : !off.length ? "Alle fire dæk har normalt tryk"
      : Object.entries(off.reduce((acc, [key, tire]) => ({ ...acc, [tire.status]: [...(acc[tire.status] || []), names[key]] }), {}))
        .map(([status, where]) => `${status}: ${where.join(", ")}`).join(" · ");
    this._t("tpmsSum", summary);
    // drive & economy
    this._t("month", m.drive.month);
    this._t("totalDist", m.drive.total);
    this._t("tripCount", m.drive.trips);
    this._t("lastTrip", m.drive.lastTrip);
    this._t("lastTripMeta", m.drive.lastTripMeta);
    const e = m.econ;
    this._t("costKm", e.costKm);
    this._t("effScore", e.effScore);
    if (r.effScore) this._attrSet(r.effScore.parentElement, "data-tone", e.effTone);
    this._t("monthly", e.monthly);
    this._attrSet("monthlyBox", "data-tone", e.monthlyTone);
    if (r.monthlyBox) this._attrSet(r.monthlyBox.querySelector(".trend"), "icon", e.monthlyIcon);
    this._t("chargeCount", e.charges);
    this._t("noPrice", e.noPrice);
    this._attrSet("noPriceBox", "data-tone", e.noPriceTone);
    this._t("wallet", e.wallet);
    // last charge
    const l = m.last;
    this._attrSet("lastMore", "data-more", l.source === "monta_last_charge" ? "monta_last_charge" : "last_charge");
    this._t("lcKwh", l.kwh);
    this._t("lcPrice", l.price);
    this._t("lcStart", l.start);
    this._t("lcDuration", l.duration);
    this._t("lcFoot", l.foot);
    this._t("lcMonta", l.montaLine);
    const fix = this._ceAvailable() && l.source === "last_charge" ? this._ceSummary(this._ceCharges()[0]) : null;
    this._hide("lcFix", !fix);
    if (fix) {
      this._t("lcFixPrice", fix.price);
      this._t("lcFixSrc", fix.source);
      this._attrSet("lcFix", "data-tone", fix.missing ? "warn" : null);
      this._attrSet("lcFix", "aria-label", `Ret pris eller kWh: ${fix.price}`);
    }
    // Charging cost per month (EV Ledger).
    if (this._r.cost) {
      const c = m.cost;
      this._hide("cost", !c);
      if (c) {
        this._t("costYear", c.year);
        this._t("costYearSub", c.yearSub);
        this._t("costSub", c.sub);
        this._t("costNote", c.note);
        this._hide("costBeforeKey", !c.before);
        this._attrSet("costChart", "data-before", c.before ? "" : null);
        this._costBars = c.bars;
        const html = c.bars.map((b, i) => `<div class="cost-m" data-ci="${i}"${b.now ? " data-now" : ""}${b.empty ? " data-empty" : ""} aria-label="${ttdEsc(b.title)}"><em>${b.empty ? "–" : b.value}</em><div class="cost-col">${b.before != null ? `<i class="cost-before" style="height:${Math.max(b.before, 2).toFixed(1)}%"></i>` : ""}<div class="cost-bar" style="height:${Math.max(b.home + b.pub, b.empty ? 2 : 4).toFixed(1)}%">${b.home > 0 ? `<i class="h" style="flex:${b.home.toFixed(2)}"></i>` : ""}${b.pub > 0 ? `<i class="p" style="flex:${b.pub.toFixed(2)}"></i>` : ""}</div></div><small>${ttdEsc(b.month)}</small></div>`).join("");
        const chart = this._r.costChart;
        if (chart && chart.dataset.sig !== html) { chart.dataset.sig = html; chart.innerHTML = html; }
      }
    }
    // Tyre sets (EV Ledger 0.7+): the tyre card inside its own panel.
    if (this._r.tyres) {
      const id = this._scIds().tyres;
      const stateObj = id ? this._hass?.states?.[id] : undefined;
      this._hide("tyres", !stateObj || !customElements.get("ha-ev-tyre-card"));
      if (stateObj && customElements.get("ha-ev-tyre-card")) {
        let card = this._r.tyresHost.firstElementChild;
        if (!card || card.dataset.entity !== id) {
          card = document.createElement("ha-ev-tyre-card");
          card.setConfig({ entity: id, embedded: true });
          card.dataset.entity = id;
          this._r.tyresHost.replaceChildren(card);
        }
        card.hass = this._hass;
      }
    }
    // Public charge form (EV Ledger): kWh, price and place, saved with the ledger's button.
    if (this._r.pc) {
      const ids = this._scIds();
      const ready = ["public_charge_energy", "public_charge_price", "log_public_charge"].every((role) => ids[role] && this._hass?.states?.[ids[role]] && this._hass.states[ids[role]].state !== "unavailable");
      this._hide("pc", !ready);
      if (ready) {
        const pending = Number(this._hass.states[ids.pending_review]?.state) || 0;
        this._t("pcSum", pending > 0 ? `${pending} ${pending === 1 ? "ladning mangler" : "ladninger mangler"} pris` : "Log kWh og pris");
        this._attrSet("pcHead", "aria-expanded", String(!!this._pcOpen));
        this._hide("pcBody", !this._pcOpen);
        this._t("pcNote", this._pcNote || "");
      }
    }
    // map
    this._attrSet("mapMeta", "data-tone", m.map.fresh ? "ok" : "muted");
    this._t("mapMetaText", m.map.meta);
    this._hide("mapEmpty", !m.map.empty);
    this._t("mapEmpty", m.map.empty || "");
    this._hide("mapHost", !!m.map.empty);
    this._hide("mapSeg", !!m.map.empty);
    for (const el of this._rangeEls) this._attrSet(el, "aria-pressed", String(Number(el.dataset.range) === this._mapHours));
    this._attrSet("styleBtn", "aria-pressed", String(this._mapStyle === "satellite"));
    this._attrSet("chargersBtn", "aria-pressed", String(!!this._chargersOn));
    // Tiles whose entity is missing stay visible (layout) but stop acting like buttons.
    for (const el of this._moreEls) this._attrSet(el, "data-dead", !this._hass.states[this._moreId(el.dataset.more)]);
  }

  /** Lays the cable over the photo exactly where the picture is drawn (object-fit: contain inside the img box). */
  _placeCable(svg, img, show, align) {
    if (!svg || !img) return;
    const cable = this._cfg.cable;
    // An <svg> has no .hidden property: the attribute itself is switched.
    if (!show || !cable || !img.offsetWidth) { svg.setAttribute("hidden", ""); if (show && !img.dataset.cableWait) { img.dataset.cableWait = "1"; img.addEventListener("load", () => this._queue(true), { once: true }); } return; }
    if (svg.dataset.d !== cable.path) {
      svg.dataset.d = cable.path;
      svg.setAttribute("viewBox", `0 0 ${cable.width} ${cable.height}`);
      for (const path of svg.querySelectorAll("path")) path.setAttribute("d", cable.path);
      const [x, y] = cable.path.replace(/^M\s*/, "").split(/[\s,L]+/).map(Number);
      const port = svg.querySelector("circle");
      port.setAttribute("cx", x); port.setAttribute("cy", y);
    }
    svg.setAttribute("preserveAspectRatio", `xMid${align} meet`);
    const box = `${img.offsetLeft}|${img.offsetTop}|${img.offsetWidth}|${img.offsetHeight}`;
    if (svg.dataset.box !== box) {
      svg.dataset.box = box;
      Object.assign(svg.style, { left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`, width: `${img.offsetWidth}px`, height: `${img.offsetHeight}px` });
    }
    svg.removeAttribute("hidden");
  }

  /** "/local/…" pictures come from Home Assistant, also when the card runs elsewhere (e.g. HA Smartdash's screens). */
  _url(path) {
    if (!path) return null;
    return path.startsWith("/") && typeof this._hass?.hassUrl === "function" ? this._hass.hassUrl(path) : path;
  }

  _applySmart(sc) {
    const r = this._r;
    this._attrSet("scBadge", "data-tone", sc.badge.tone);
    this._t("scBadgeText", sc.badge.text);
    this._t("scSub", sc.sub);
    for (const button of this.shadowRoot.querySelectorAll(".sc-modes [data-scmode]")) {
      const armed = this._armed === `mode:${button.dataset.scmode}`;
      this._attrSet(button, "aria-checked", String(button.dataset.scmode === sc.mode));
      this._attrSet(button, "data-armed", armed);
      button.hidden = !sc.modes.includes(button.dataset.scmode);
      const label = button.querySelector("span");
      const text = armed ? "Bekræft" : TTD_SC_MODES.find(([key]) => key === button.dataset.scmode)?.[1] || "";
      if (label && label.textContent !== text) label.textContent = text;
      const isDefault = sc.def?.mode === button.dataset.scmode;
      this._attrSet(button, "data-default", isDefault);
      this._attrSet(button, "title", isDefault ? "Standardplan" : null);
    }
    this._hide("scDef", !sc.def);
    if (sc.def) {
      this._t("scDefSum", sc.def.summary);
      this._attrSet("scDefHead", "aria-expanded", String(!!this._defOpen));
      this._hide("scDefBody", !this._defOpen);
      for (const button of this.shadowRoot.querySelectorAll(".sc-defs [data-scdefault]")) {
        const key = button.dataset.scdefault;
        const armed = this._armed === `default:${key}`;
        this._attrSet(button, "aria-checked", String(key === sc.def.mode));
        this._attrSet(button, "data-armed", armed);
        button.hidden = !sc.def.options.includes(key);
        const label = button.querySelector("span");
        const text = armed ? "Bekræft" : ttdScLabel(key);
        if (label && label.textContent !== text) label.textContent = text;
      }
    }
    this._scBars = sc.chart;
    const chartSig = JSON.stringify([sc.chart, sc.marks, sc.limitLine]);
    if (r.scChart && r.scChart.dataset.sig !== chartSig) {
      r.scChart.dataset.sig = chartSig;
      const H = 60;
      const ly = sc.limitLine ? H - Math.max(3, sc.limitLine.h * (H - 4)) : null;
      r.scChart.innerHTML = sc.chart.length ? `<svg viewBox="0 0 1000 ${H}" preserveAspectRatio="none" role="img" aria-label="Priser og ladetider">${sc.chart.map((b) => {
        const h = Math.max(3, b.h * (H - 4));
        return `<rect x="${(b.left * 10).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${Math.max(b.width * 10 - 1.5, 1).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" class="${b.on ? "on" : ""}${b.over ? " over" : ""}${b.dear ? " dear" : ""}${b.est ? " est" : ""}"></rect>`;
      }).join("")}${sc.marks.map((m) => `<line x1="${m.left * 10}" x2="${m.left * 10}" y1="0" y2="${H}" class="${m.kind}"/>`).join("")}${ly != null ? `<line x1="0" x2="1000" y1="${ly.toFixed(1)}" y2="${ly.toFixed(1)}" class="limit"/>` : ""}</svg>${ly != null ? `<span class="sc-lim" style="top:${((ly / H) * 100).toFixed(1)}%">Senere ca. ${ttdEsc(sc.limitLine.label)}</span>` : ""}` : "";
    }
    if (r.scChart) r.scChart.hidden = !sc.chart.length;
    if (r.scTrack) r.scTrack.hidden = !!sc.chart.length;
    this._t("scHint", sc.hint);
    if (r.scHint) r.scHint.hidden = !sc.hint;
    this._t("scWait", sc.wait);
    if (r.scWait) r.scWait.hidden = !sc.wait;
    this._hide("scOpt", !sc.options);
    if (sc.options) {
      this._t("scOptSum", sc.options.summary);
      this._attrSet("scOptHead", "aria-expanded", String(!!this._optOpen));
      this._hide("scOptBody", !this._optOpen);
      for (const button of this.shadowRoot.querySelectorAll("[data-scoptrole]")) {
        const option = sc.options.list.find((o) => o.role === button.dataset.scoptrole);
        button.hidden = !option;
        if (option) this._attrSet(button, "aria-pressed", String(option.on));
      }
      this._t("scOptNote", sc.options.note);
      // The silent window for the messages at night (EV Ledger), editable while the choice is on.
      const quietOn = sc.options.list.find((o) => o.role === "quiet_night")?.on;
      const from = this._sc("quiet_from")?.state; const until = this._sc("quiet_until")?.state;
      const hasWindow = quietOn && ttdIsClock(from) && ttdIsClock(until);
      this._hide("scQuiet", !hasWindow);
      if (hasWindow) {
        const active = this.shadowRoot.activeElement;
        if (active !== r.scQuietFrom && r.scQuietFrom.value !== ttdClock(from)) r.scQuietFrom.value = ttdClock(from);
        if (active !== r.scQuietUntil && r.scQuietUntil.value !== ttdClock(until)) r.scQuietUntil.value = ttdClock(until);
      }
    }
    const signature = JSON.stringify([sc.segments, sc.marks]);
    if (r.scTrack && r.scTrack.dataset.sig !== signature) {
      r.scTrack.dataset.sig = signature;
      r.scTrack.replaceChildren(
        ...sc.segments.map((segment) => {
          const el = document.createElement("i");
          el.className = "sc-seg";
          el.title = segment.title;
          el.style.left = `${segment.left}%`;
          el.style.width = `${segment.width}%`;
          if (segment.estimated) el.dataset.est = "";
          return el;
        }),
        ...sc.marks.map((mark) => {
          const el = document.createElement("i");
          el.className = `sc-mark ${mark.kind}`;
          el.style.left = `${mark.left}%`;
          return el;
        }),
      );
    }
    this._t("scAxisM", sc.axisMid);
    this._t("scAxisR", sc.axisRight);
    this._t("scStart", sc.start);
    this._t("scEnd", sc.end);
    this._t("scStartDay", sc.startDay);
    this._t("scEndDay", sc.endDay);
    this._t("scCost", sc.cost);
    this._t("scKwh", sc.kwh);
    const active = this.shadowRoot.activeElement;
    this._hide("scFixed", !sc.fixed);
    if (sc.fixed) {
      if (active !== r.scFixedStart && r.scFixedStart.value !== sc.fixed.start) r.scFixedStart.value = sc.fixed.start;
      if (active !== r.scFixedEnd && r.scFixedEnd.value !== sc.fixed.end) r.scFixedEnd.value = sc.fixed.end;
    }
    // Quarters or whole hours: the plans (and the price cards that follow EV Ledger) change with it.
    const resolution = this._sc("price_resolution")?.state;
    this._hide("scRes", !["quarter", "hour"].includes(resolution));
    for (const button of this.shadowRoot.querySelectorAll("[data-scres]")) this._attrSet(button, "aria-checked", String(button.dataset.scres === resolution));
    this._hide("scCap", !sc.cap);
    this._hide("scLimit", !sc.limit);
    if (sc.limit) {
      this._attrSet("scLimitChip", "aria-pressed", String(sc.limit.on));
      if (active !== r.scLimitInput && r.scLimitInput.value !== sc.limit.value) r.scLimitInput.value = sc.limit.value;
      this._t("scLimitUnit", sc.limit.unit);
      this._t("scLimitPre", sc.limit.saving ? "spar mindst" : "maks.");
      if (r.scLimitInput) { r.scLimitInput.step = sc.limit.saving ? "1" : "0.05"; r.scLimitInput.setAttribute("aria-label", sc.limit.saving ? "Spørg når det sparer mindst" : "Maks. pris i Billigst"); }
      this._hide("scMax", !sc.limit.max);
      if (sc.limit.max) {
        if (active !== r.scMaxInput && r.scMaxInput.value !== sc.limit.max.value) r.scMaxInput.value = sc.limit.max.value;
        this._t("scMaxUnit", sc.limit.max.unit);
      }
      const floor = sc.limit.floor == null ? "" : String(sc.limit.floor);
      if (active !== r.scFloorInput && r.scFloorInput.value !== floor) r.scFloorInput.value = floor;
      this._t("scLimitInfo", sc.limit.info);
    }
    const choice = sc.limit?.choice;
    this._hide("scHold", !choice);
    if (choice) {
      this._t("scHoldT", choice.title);
      this._t("scHoldS", choice.detail);
      this._t("scHoldW", choice.windows.join("\n"));
      for (const [ref, on, label] of [["scWaitOn", true, choice.waitLabel], ["scWaitOff", false, choice.fullLabel]]) {
        const armed = this._armed === `wait:${on}`;
        this._attrSet(ref, "aria-checked", String(choice.wait === on));
        this._attrSet(ref, "data-armed", armed);
        this._t(ref, armed ? "Bekræft" : label);
      }
    }
    this._hide("scCapX", !sc.cap?.over);
    if (sc.cap?.over) {
      const armed = this._armed === "capx";
      this._attrSet("scCapXChip", "aria-pressed", String(sc.cap.over.on));
      this._attrSet("scCapXChip", "data-armed", armed);
      const label = this._r.scCapXChip?.querySelector("span");
      const text = armed ? "Bekræft" : "Overskrid ved behov";
      if (label && label.textContent !== text) label.textContent = text;
      this._t("scCapXInfo", sc.cap.over.info);
    }
    if (sc.cap) {
      if (active !== r.scCapInput && r.scCapInput.value !== sc.cap.value) r.scCapInput.value = sc.cap.value;
      this._t("scCapUnit", sc.cap.unit);
      const min = sc.cap.min == null ? "" : String(sc.cap.min);
      if (active !== r.scMinInput && r.scMinInput.value !== min) r.scMinInput.value = min;
    }
    const trip = sc.trip;
    this._t("scTripSum", trip.summary);
    this._attrSet("scTrip", "data-active", trip.active);
    this._attrSet("scTripHead", "aria-expanded", String(!!this._tripOpen));
    this._hide("scTripBody", !this._tripOpen);
    const dep = trip.departure ? ttdLocalInput(trip.departure) : "";
    if (active !== r.scDep && r.scDep.value !== dep) r.scDep.value = dep;
    if (active !== r.scDest && r.scDest.value !== trip.destination) r.scDest.value = trip.destination;
    this._attrSet("scRound", "aria-pressed", String(trip.roundTrip));
    this._t("scTripInfo", trip.info);
    this._hide("scClear", !trip.active && !trip.destination);
    this._hide("scConfirm", !sc.awaiting);
    if (sc.awaiting) this._t("scConfirm", sc.confirmLabel);
    this._hide("scPhone", !sc.phone);
    if (sc.phone) {
      this._attrSet("scPhoneChip", "aria-pressed", String(sc.phone.on));
      this._t("scPhoneInfo", sc.phone.info);
      this._hide("scInfoChip", sc.phone.notify == null);
      this._attrSet("scInfoChip", "aria-pressed", String(!!sc.phone.notify));
      this._hide("scSendChip", !sc.phone.send);
    }
  }

  _renderModeSelect(model) {
    const select = this._r.modeSelect;
    this._hide("modeSelect", !model);
    this._hide("chargerMode", !!model);
    if (!model) return;
    const signature = model.options.join("\u0001");
    if (select.dataset.sig !== signature) {
      select.dataset.sig = signature;
      select.replaceChildren(...model.options.map((option) => {
        const el = document.createElement("option");
        el.value = option;
        el.textContent = TTD_TEXT.mode[option] ?? ttdHumanize(option);
        return el;
      }));
    }
    if (this.shadowRoot.activeElement !== select && select.value !== model.value) select.value = model.value;
  }

  /* ------------------------------------------------------ map */

  _mapConfig() {
    const map = this._cfg.map;
    return {
      type: "map",
      entities: [{ entity: this._loc(), focus: true }],
      hours_to_show: this._mapHours,
      theme_mode: map.theme_mode,
      default_zoom: map.default_zoom,
      ...(map.auto_fit != null ? { auto_fit: !!map.auto_fit } : {}),
    };
  }

  async _ensureMap() {
    if (this._map || this._mapLoading || !this._loc() || !this._r.mapHost) return;
    const stateObj = this._hass?.states?.[this._loc()];
    if (!stateObj || stateObj.state === "unavailable") return;
    this._mapLoading = true;
    const host = this._r.mapHost;
    try {
      const helpers = await window.loadCardHelpers?.();
      if (!helpers?.createCardElement) throw new Error("loadCardHelpers unavailable");
      const card = helpers.createCardElement(this._mapConfig());
      card.layout = "grid";
      card.hass = this._hass;
      card.addEventListener("ll-rebuild", (event) => {
        event.stopPropagation();
        if (this._map === card) {
          this._map = null;
          this._ensureMap();
        }
      });
      if (host.isConnected && this._r.mapHost === host) {
        host.replaceChildren(card);
        this._map = card;
        this._applyMapStyle(0);
      }
    } catch (err) {
      this._mapError = true;
      this._queue(true);
    } finally {
      this._mapLoading = false;
    }
  }

  _setMapHours(hours) {
    if (!Number.isFinite(hours) || hours === this._mapHours) return;
    this._mapHours = hours;
    this._map?.setConfig?.(this._mapConfig());
    this._applyMapStyle(0);
    this._queue(true);
  }

  _toggleMapStyle() {
    this._mapStyle = this._mapStyle === "satellite" ? "default" : "satellite";
    this._applyMapStyle(0);
    this._queue(true);
  }

  /**
   * Satellite imagery on top of Home Assistant's own (Leaflet based) map, so markers, route, zoom and
   * more-info keep working. Uses frontend internals defensively: when they are missing, the toggle stays
   * hidden and the normal map is shown.
   */
  _applyMapStyle(attempt) {
    clearTimeout(this._styleTimer);
    this._styleTimer = null;
    try {
      this._applyMapStyleNow(attempt);
    } catch (err) {
      // Leaflet refuses layers until the map has a view; try again shortly.
      this._styleErr = err;
      if (attempt < 30) this._styleTimer = setTimeout(() => this._applyMapStyle(attempt + 1), 1000);
    }
  }

  _applyMapStyleNow(attempt) {
    const haMap = ttdFindDeep(this._map, "ha-map");
    // Home Assistant 2026.10 draws the map with MapLibre GL (ha-map's engine); satellite is Leaflet-only for now, the
    // charging stations work on both
    const engine = haMap?._engine;
    if (engine?._map?.project && engine?._maplibre?.Marker) {
      this._hide("styleBtn", true);
      this._applyChargers({ kind: "maplibre", map: engine._map, lib: engine._maplibre });
      return;
    }
    const L = haMap?.Leaflet;
    const map = haMap?.leafletMap;
    if (!L?.tileLayer || !map?.addLayer) {
      // The native map loads lazily; retry for ~30 s, then again after the next state update (see _flush).
      if (this._map && attempt < 30) this._styleTimer = setTimeout(() => this._applyMapStyle(attempt + 1), 1000);
      else this._styleGaveUp = Date.now();
      this._hide("styleBtn", true);
      this._hide("chargersBtn", true);
      return;
    }
    this._hide("styleBtn", false);
    if (this._satMap !== map) {
      const options = { maxZoom: 20, maxNativeZoom: 19 };
      const layers = [L.tileLayer(this._cfg.map.satellite_url || TTD_SATELLITE.url, { ...options, attribution: this._cfg.map.satellite_attribution || TTD_SATELLITE.attribution })];
      if (this._cfg.map.satellite_labels !== false && !this._cfg.map.satellite_url) layers.push(L.tileLayer(TTD_SATELLITE.labels, options));
      // Home Assistant's dark mode inverts map tiles with a CSS filter; photos must be shown as they are.
      for (const layer of layers) layer.on("tileload", (event) => event.tile.style.setProperty("filter", "none", "important"));
      this._sat = L.layerGroup(layers);
      this._satLayers = layers;
      this._satMap = map;
      // Home Assistant may (re)create its base layer, e.g. on theme changes; keep it hidden while satellite is chosen.
      map.on("layeradd", () => this._syncBaseLayers(map));
    }
    const satellite = this._mapStyle === "satellite";
    if (satellite && !map.hasLayer(this._sat)) this._sat.addTo(map);
    if (!satellite && map.hasLayer(this._sat)) map.removeLayer(this._sat);
    this._syncBaseLayers(map);
    this._applyChargers({ kind: "leaflet", map, lib: L });
  }

  /* ------------------------------------------------------ charging stations on the map */

  /**
   * Charging stations on the map (Claude AI, 2026-10-27; user: "kan det også vise de her lade steder på kortet …
   * trykke på lade stedet og se prisen"). EV Ledger's evledger/chargers answers with the Superchargers, Open Charge
   * Map's stations (its API key stays in Home Assistant), the places named before and the zones with a price, each with
   * the price per kWh it would use. A marker shows that price; a tap shows name, operator, normal/fast price and where
   * it comes from, power, connectors, the distance from the car and a route link. Fetched for the visible area, again
   * after moving the map. The choice is kept per browser.
   */
  _ledgerEntity() {
    return this._id("last_charge") || this._cfg.smart_charge || this._cfg.ev_ledger || null;
  }

  _toggleChargers() {
    this._chargersOn = !this._chargersOn;
    clearTimeout(this._chargerRetry);
    try { localStorage.setItem("ttd-chargers", this._chargersOn ? "1" : "0"); } catch (_) { /* private mode */ }
    this._applyMapStyle(0);
    this._queue(true);
  }

  /** The map's centre and the distance (km) to its corner, for either engine. */
  _chargerArea(view) {
    const map = view.map;
    const center = map.getCenter?.();
    const corner = map.getBounds?.()?.getNorthEast?.();
    if (!center) return null;
    const lat = center.lat, lng = center.lng ?? center.lon;
    const radius = corner ? ttdDistanceKm(lat, lng, corner.lat, corner.lng ?? corner.lon) : 5;
    return { lat, lng, radius: Math.min(25, Math.max(1, radius)) };
  }

  _applyChargers(view) {
    const entity = this._ledgerEntity();
    this._hide("chargersBtn", !entity || typeof this._hass?.callWS !== "function");
    if (this._chargersOn == null) {
      try { this._chargersOn = localStorage.getItem("ttd-chargers") === "1"; } catch (_) { this._chargersOn = false; }
    }
    if (this._chargerView?.map !== view.map) {
      this._clearChargers();
      this._chargerKey = null;
      view.map.on("moveend", () => {
        clearTimeout(this._chargerTimer);
        this._chargerTimer = setTimeout(() => this._loadChargers(view), 600);
      });
    }
    this._chargerView = view;
    if (!entity || !this._chargersOn) {
      this._clearChargers();
      this._chargerKey = null;
      return;
    }
    this._loadChargers(view);
  }

  _clearChargers() {
    for (const marker of this._chargerMarkers || []) marker.remove();
    this._chargerMarkers = [];
  }

  async _loadChargers(view) {
    if (!this._chargersOn || this._chargerView !== view) return;
    const at = this._chargerArea(view);
    if (!at) return;
    const key = `${at.lat.toFixed(3)},${at.lng.toFixed(3)},${at.radius.toFixed(1)}`;
    if (key === this._chargerKey) return;
    this._chargerKey = key;
    let reply;
    try {
      reply = await this._hass.callWS({ type: "evledger/chargers", entity_id: this._ledgerEntity(), latitude: at.lat, longitude: at.lng, radius_km: Number(at.radius.toFixed(2)) });
    } catch (err) {
      this._chargerKey = null;
      console.warn("th-tesla-dashboard-card: ladesteder", err);
      return;
    }
    if (this._chargerView !== view || key !== this._chargerKey || !this._chargersOn) return;
    this._drawChargers(view, reply);
    // EV Ledger is fetching the operators' own prices (AFIR) in the background: ask again when they are there
    clearTimeout(this._chargerRetry);
    if (reply?.afir?.loading && (this._chargerTries = (this._chargerTries || 0) + 1) <= 6) {
      this._chargerRetry = setTimeout(() => { this._chargerKey = null; this._loadChargers(view); }, 20000);
    } else if (!reply?.afir?.loading) this._chargerTries = 0;
  }

  _drawChargers(view, reply) {
    this._clearChargers();
    const car = this._hass?.states?.[this._loc()]?.attributes || {};
    const unit = String(reply?.currency || "DKK") === "DKK" ? "kr" : reply?.currency;
    const money = (value) => Number(value).toFixed(2).replace(".", ",");
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const SOURCE = { place: "din pris for stedet", zone: "zonens pris", station: "operatørens egen pris nu", operator: "operatørens pris", default: "standardpris" };
    for (const station of reply?.stations || []) {
      const color = station.kind === "supercharger" ? "#e31937" : station.kind === "place" || station.kind === "zone" ? "#8b5cf6" : station.fast ? "#f97316" : "#16a34a";
      // Only a price that belongs to the station counts: the ledger's default price is what an unknown station would
      // be logged with, not the station's price (user: "alle 3 ladesteder viser det samme i pris? det er da ikke det samme").
      const known = station.price != null && station.price_source && station.price_source !== "default";
      const label = !known ? "?" : Number(station.price) === 0 ? "Gratis" : money(station.price);
      const pill = `<div style="display:flex;align-items:center;gap:3px;width:max-content;padding:2px 7px 2px 3px;border-radius:999px;background:${color};color:#fff;font:700 11px/1.2 system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.45);border:1.5px solid #fff;white-space:nowrap;cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z"/></svg>${esc(label)}</div>`;
      const far = Number.isFinite(car.latitude) && Number.isFinite(car.longitude) ? ttdDistanceKm(car.latitude, car.longitude, station.latitude, station.longitude) : null;
      const power = Number.isFinite(station.max_kw) ? `${Math.round(station.max_kw)} kW ${station.fast ? "lynlader" : "normallader"}` : null;
      const fallback = Number(reply?.default_price) > 0 ? `Lader du her, bruges din standardpris ${money(reply.default_price)} ${unit}/kWh, til du retter den.` : "Lader du her, spørger telefonen om prisen.";
      const prices = !known ? `<b style="font-size:16px">Pris ukendt</b><div style="opacity:.75;margin-top:2px">${fallback.trim()} Ret pris → "Husk for stedet" sætter den her.</div>`
        : `<b style="font-size:16px">${Number(station.price) === 0 ? "Gratis" : `${money(station.price)} ${unit}/kWh`}</b> <span style="opacity:.7">· ${esc(SOURCE[station.price_source] || "")}</span>`
          + (station.price_normal != null && station.price_fast != null ? `<div style="opacity:.75;margin-top:2px">${station.price_source === "station" ? "AC" : "Normal"} ${money(station.price_normal)} · ${station.price_source === "station" ? "DC" : "lyn"} ${money(station.price_fast)} ${unit}/kWh</div>` : "")
          + (station.price_source === "station" ? [
            Array.isArray(station.day_range) ? `I dag ${money(station.day_range[0])}–${money(station.day_range[1])} ${unit}/kWh` : null,
            Number(station.start_fee) > 0 ? `Startgebyr ${money(station.start_fee)} ${unit}` : null,
            ...(station.minute_fees || []).map(([perMinute, from]) => `${money(perMinute)} ${unit}/min${from > 0 ? ` efter ${from} min` : ""}`),
          ].filter(Boolean).map((line) => `<div style="opacity:.75;margin-top:2px">${esc(line)}</div>`).join("") : "");
      // The same plug and power once, counted ("2 × CCS 150 kW")
      const plugCount = new Map();
      for (const c of (station.connectors || []).filter((x) => x.type || x.kw)) {
        const key = `${esc(c.type || "Stik")}${c.kw ? ` ${Math.round(c.kw)} kW` : ""}`;
        plugCount.set(key, (plugCount.get(key) || 0) + (Number(c.count) || 1));
      }
      const plugs = [...plugCount].map(([key, count]) => `${count > 1 ? `${count} × ` : ""}${key}`);
      const popup = `<div style="font:13px/1.35 system-ui,sans-serif;min-width:210px;max-width:260px;color:var(--primary-text-color,#111)">${[
        `<div style="font-weight:800;font-size:14px;margin-bottom:4px">${esc(station.name || station.operator || "Ladested")}</div>`,
        `<div style="margin-bottom:6px">${prices}</div>`,
        [station.operator && !String(station.name || "").includes(station.operator) ? esc(station.operator) : station.operator ? null : "Operatør ukendt", power, Number.isFinite(station.points) ? `${station.points} pladser` : null].filter(Boolean).join(" · "),
        plugs.length ? `<div style="opacity:.75;margin-top:2px">${plugs.slice(0, 4).join(", ")}</div>` : "",
        station.usage_cost ? `<div style="opacity:.7;margin-top:2px">Opgivet pris: ${esc(station.usage_cost)}</div>` : "",
        station.feed ? `<div style="opacity:.55;margin-top:2px;font-size:11.5px">Data: ${esc(station.feed)} (EU's AFIR-data)</div>` : "",
        `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px">${far != null ? `<span style="opacity:.7">${far < 1 ? `${Math.round(far * 1000)} m` : `${far.toFixed(1).replace(".", ",")} km`} fra bilen</span>` : "<span></span>"}<a href="https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}" target="_blank" rel="noopener" style="padding:5px 12px;border-radius:999px;background:${color};color:#fff;font-weight:700;text-decoration:none">Rute</a></div>`,
      ].filter(Boolean).join("")}</div>`;
      let marker;
      if (view.kind === "maplibre") {
        const el = document.createElement("div");
        el.innerHTML = pill;
        el.title = station.name || "";
        marker = new view.lib.Marker({ element: el, anchor: "center" })
          .setLngLat([station.longitude, station.latitude])
          .setPopup(new view.lib.Popup({ offset: 14, maxWidth: "290px", closeButton: true }).setHTML(popup))
          .addTo(view.map);
      } else {
        const L = view.lib;
        marker = L.marker([station.latitude, station.longitude], { icon: L.divIcon({ className: "", html: `<div style="transform:translate(-50%,-50%);width:max-content">${pill}</div>`, iconSize: [0, 0] }), keyboard: false, title: station.name || "" })
          .bindPopup(popup, { maxWidth: 280, autoPanPadding: [16, 16] })
          .addTo(view.map);
      }
      marker._ttdStation = station;
      this._chargerMarkers.push(marker);
    }
  }

  /** Hides (never removes) Home Assistant's own base map below the satellite layers, so its theme handling keeps working. */
  _syncBaseLayers(map) {
    const pane = map.getPane?.("tilePane");
    if (!pane) return;
    const ours = new Set((this._satLayers || []).map((layer) => layer.getContainer?.()).filter(Boolean));
    const hide = this._mapStyle === "satellite";
    for (const el of pane.children) {
      if (ours.has(el)) continue;
      const value = hide ? "hidden" : "";
      if (el.style.visibility !== value) el.style.visibility = value;
    }
  }

  /* ------------------------------------------------------ chart */

  async _loadStats(range, force) {
    const ids = [this._cfg.chart.distance_entity, this._cfg.chart.energy_entity].filter((id) => id && this._hass?.states?.[id]);
    if (!this._r.chart || !ids.length || typeof this._hass?.callWS !== "function" || this._loading[range]) return;
    const cached = this._stats[range];
    if (!force && cached && Date.now() - cached.at < TTD_STATS_TTL) return;
    this._loading[range] = true;
    this._attrSet("chart", "data-loading", range === this._chartRange);
    const spec = TTD_CHART_RANGES[range];
    const hoursBack = range === "today" ? 26 : (spec.days + 1) * 24;
    try {
      const rows = await this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: new Date(Date.now() - hoursBack * 3600000).toISOString(),
        statistic_ids: ids,
        period: spec.period,
        types: ["change", "state"],
      });
      this._stats[range] = { at: Date.now(), rows: rows || {} };
    } catch (err) {
      this._stats[range] = { at: Date.now(), rows: {}, error: true };
    } finally {
      this._loading[range] = false;
      this._attrSet("chart", "data-loading", false);
    }
    if (range === this._chartRange) this._renderChart(true);
  }

  /** Buckets for the chart: statistic changes plus the live, not yet compiled part of the current period. */
  _chartData() {
    const f = this._format();
    const range = this._chartRange;
    const spec = TTD_CHART_RANGES[range];
    const tz = f.serverTz;
    const now = new Date();
    const todayKey = f.dayKey(now, tz);
    const nowHour = f.hour(now, tz);
    const stats = this._stats[range];
    let slots;
    if (range === "today") {
      slots = Array.from({ length: 24 }, (_, hour) => ({ key: hour, future: hour > nowHour, axis: hour % 4 === 0 ? String(hour).padStart(2, "0") : "", tip: `${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00` }));
    } else {
      const keys = [];
      for (let step = 0; keys.length < spec.days && step < spec.days * 4 + 8; step += 1) {
        const key = f.dayKey(new Date(now.getTime() - step * 6 * 3600000), tz);
        if (!keys.includes(key)) keys.push(key);
      }
      slots = keys.reverse().map((key, index) => {
        const date = new Date(`${key}T12:00:00Z`);
        const fromEnd = keys.length - 1 - index;
        const axis = range === "7d" ? f.weekday(date, "short", "UTC").replace(/\.$/, "") : fromEnd % 5 === 0 ? String(Number(key.slice(8))) : "";
        return { key, future: false, axis, tip: `${f.weekday(date, "long", "UTC")} ${Number(key.slice(8))}.${Number(key.slice(5, 7))}.` };
      });
    }
    const series = (id) => {
      const rows = stats?.rows?.[id];
      if (!id || !Array.isArray(rows)) return null;
      const values = new Map();
      let last = null;
      for (const row of rows) {
        const start = typeof row.start === "number" ? row.start : Date.parse(row.start);
        if (!Number.isFinite(start)) continue;
        const key = range === "today" ? (f.dayKey(start, tz) === todayKey ? f.hour(start, tz) : null) : f.dayKey(start, tz);
        const change = ttdToNumber(row.change);
        if (key != null && change != null) values.set(key, (values.get(key) || 0) + Math.max(0, change));
        const state = ttdToNumber(row.state);
        if (state != null && (!last || start > last.start)) last = { start, state };
      }
      const live = ttdHasValue(this._hass.states[id]) ? ttdToNumber(this._hass.states[id].state) : null;
      if (live != null && last) {
        const delta = live - last.state;
        const currentKey = range === "today" ? nowHour : todayKey;
        if (delta > 0 && delta < 1000) values.set(currentKey, (values.get(currentKey) || 0) + delta);
      }
      return values;
    };
    const drive = series(this._cfg.chart.distance_entity);
    const energy = series(this._cfg.chart.energy_entity);
    for (const slot of slots) {
      slot.d = drive && !slot.future ? drive.get(slot.key) ?? 0 : null;
      slot.e = energy && !slot.future ? energy.get(slot.key) ?? 0 : null;
    }
    return { range, slots, hasDrive: !!drive, hasEnergy: !!energy, error: !!stats?.error, loaded: !!stats };
  }

  _renderChart(force) {
    const r = this._r;
    if (!r.chart || !this._hass) return;
    const f = this._format();
    const cfg = this._cfg.chart;
    const live = [cfg.distance_entity, cfg.energy_entity, this._id("daily_energy")].map((id) => this._hass.states[id]?.state).join("|");
    const now = new Date();
    const signature = [this._chartRange, this._stats[this._chartRange]?.at, live, f.hour(now, f.serverTz), f.dayKey(now, f.serverTz), this._env].join("|");
    if (!force && signature === this._chartSig) return;
    this._chartSig = signature;
    const data = this._chartData();
    this._chart = data;
    const dUnit = ttdUnit(this._hass.states[cfg.distance_entity]?.attributes?.unit_of_measurement || "km");
    const eUnit = ttdUnit(this._hass.states[cfg.energy_entity]?.attributes?.unit_of_measurement || "kWh");
    this._chartUnits = { d: dUnit, e: eUnit };
    const n = data.slots.length;
    r.chart.style.setProperty("--n", String(n));
    const bars = (field) => {
      const max = Math.max(0, ...data.slots.map((slot) => slot[field] ?? 0));
      const html = data.slots.map((slot) => {
        const value = slot[field];
        if (value == null) return "<i></i>";
        const height = max > 0 ? Math.round((value / max) * 1000) / 10 : 0;
        return `<i${value > 0 ? ' class="nz"' : ""} style="--h:${height}%"></i>`;
      }).join("");
      return { max, html };
    };
    const drive = bars("d");
    const energy = bars("e");
    const sum = (field) => data.slots.reduce((total, slot) => total + (slot[field] ?? 0), 0);
    this._hide("smD", !data.hasDrive);
    this._hide("smE", !data.hasEnergy);
    if (data.hasDrive && r.barsD.innerHTML !== drive.html) r.barsD.innerHTML = drive.html;
    if (data.hasEnergy && r.barsE.innerHTML !== energy.html) r.barsE.innerHTML = energy.html;
    this._t("maxD", data.hasDrive ? `maks ${f.number(drive.max, 1)} ${dUnit}` : "");
    this._t("maxE", data.hasEnergy ? `maks ${f.number(energy.max, 1)} ${eUnit}` : "");
    const axis = data.slots.map((slot, index) => (slot.axis ? `<span style="grid-column:${index + 1}">${ttdEsc(slot.axis)}</span>` : "")).join("");
    if (r.axis.innerHTML !== axis) r.axis.innerHTML = axis;
    const anySeries = data.hasDrive || data.hasEnergy;
    this._hide("axis", !anySeries);
    let empty = "";
    if (!cfg.distance_entity && !cfg.energy_entity) empty = "Ingen historik konfigureret";
    else if (!anySeries && data.error) empty = "Historik ikke tilgængelig";
    else if (!anySeries && data.loaded) empty = "Ingen historik fundet";
    else if (!anySeries) empty = "Henter historik …";
    this._hide("chartEmpty", !empty);
    this._t("chartEmpty", empty);
    // Totals as text keep every value reachable without hovering (tooltips only enhance).
    const period = TTD_CHART_RANGES[data.range].label.toLowerCase();
    const totals = [
      data.hasDrive ? `${f.number(data.range === "today" && this._num("daily_energy") != null ? this._num("daily_energy") : sum("d"), 1)} ${dUnit}` : null,
      data.hasEnergy ? `${f.number(sum("e"), 1)} ${eUnit}` : null,
    ].filter(Boolean);
    const daily = this._value("daily_energy", 1);
    this._t("dailySub", totals.length ? `${totals.join(" · ")} ${period}` : daily === TTD_DASH ? "" : `${daily} kørt i dag`);
    const peak = data.hasDrive && drive.max > 0 ? data.slots.find((slot) => slot.d === drive.max) : null;
    const spoken = [totals[0] && data.hasDrive ? `${totals[0]} kørt` : null, data.hasEnergy ? `${totals[totals.length - 1]} ladet` : null].filter(Boolean);
    this._attrSet("chart", "aria-label", `Dagligt forbrug ${period}. ${spoken.join(", ") || "Ingen data"}${peak ? `. Mest kørsel ${peak.tip}: ${f.number(drive.max, 1)} ${dUnit}` : ""}.`);
    this._hi = -1;
    this._hide("tip", true);
  }

  _onChartPointer(event) {
    const bars = !this._r.smD.hidden ? this._r.barsD : this._r.barsE;
    const rect = bars.getBoundingClientRect();
    const n = this._chart?.slots.length || 0;
    if (!n || rect.width <= 0) return;
    this._showTip(Math.floor(ttdClamp((event.clientX - rect.left) / rect.width, 0, 0.9999) * n));
  }

  /** The monthly cost chart's info box: hover with a mouse, tap on a phone (tap the same month again to close). */
  _costTip(column, tap = false) {
    const tip = this._r.costTip;
    if (!tip) return;
    const index = column ? Number(column.dataset.ci) : -1;
    if (index < 0 || (tap && this._costTipAt === index && !tip.hidden)) { tip.hidden = true; this._costTipAt = -1; return; }
    const bar = this._costBars?.[index];
    if (!bar) return;
    const t = bar.tip;
    const html = `<span class="tip-l">${ttdEsc(t.title)}</span><b>${ttdEsc(t.cost)}</b>${[t.parts, t.energy, t.unpriced, t.before].filter(Boolean).map((line) => `<span class="cost-tip-r">${ttdEsc(line)}</span>`).join("")}`;
    if (tip.dataset.html !== html) { tip.dataset.html = html; tip.innerHTML = html; }
    this._costTipAt = index;
    tip.hidden = false;
    const wrap = tip.parentElement.getBoundingClientRect();
    const col = column.getBoundingClientRect();
    const left = col.left + col.width / 2 - wrap.left - tip.offsetWidth / 2;
    tip.style.left = `${ttdClamp(left, 0, Math.max(0, wrap.width - tip.offsetWidth))}px`;
  }

  // The price slot under the pointer in the smart charge chart (left/width are percent of the chart, h of its 60 px).
  _scPoint(fraction) {
    const bars = this._scBars;
    if (!bars?.length) return null;
    const x = fraction * 100;
    const bar = bars.find((b) => x >= b.left && x < b.left + b.width) || bars.reduce((a, b) => (Math.abs(b.left + b.width / 2 - x) < Math.abs(a.left + a.width / 2 - x) ? b : a));
    const h = Math.max(3, bar.h * 56) / 60;
    return { x: (bar.left + bar.width / 2) / 100, y: 1 - h, color: bar.on ? "var(--tdc-green)" : "var(--tdc-text)", text: bar.title };
  }

  _showTip(index) {
    const data = this._chart;
    const r = this._r;
    if (!data || index < 0 || index >= data.slots.length || data.slots[index].future) {
      if (this._hi >= 0) for (const row of [r.barsD, r.barsE]) row.children[this._hi]?.classList.remove("hi");
      this._hi = -1;
      this._hide("tip", true);
      return;
    }
    if (this._hi !== index) {
      for (const row of [r.barsD, r.barsE]) {
        row.children[this._hi]?.classList.remove("hi");
        row.children[index]?.classList.add("hi");
      }
      this._hi = index;
    }
    const f = this._format();
    const slot = data.slots[index];
    this._t("tipL", slot.tip);
    this._hide("tipDRow", !data.hasDrive);
    this._hide("tipERow", !data.hasEnergy);
    this._t("tipD", `${f.number(slot.d, 1)} ${this._chartUnits.d}`);
    this._t("tipE", `${f.number(slot.e, 1)} ${this._chartUnits.e}`);
    // Centred over the bar and kept inside the chart by its real width (Claude AI, 2026-10-18; the old ±70 px clamp
    // treated left as the centre, so the tip stuck out on the right and was cut by the panel).
    this._hide("tip", false);
    const width = r.chart.clientWidth;
    const x = ((index + 0.5) / data.slots.length) * width;
    r.tip.style.left = `${ttdClamp(x - r.tip.offsetWidth / 2, 0, Math.max(0, width - r.tip.offsetWidth))}px`;
  }

  /* ------------------------------------------------------ interaction */

  _moreId(key) {
    if (!key) return null;
    if (key.startsWith("sc:")) return this._scIds()[key.slice(3)] || null;
    if (key === "location") return this._loc();
    if (key === "target_soc") return this._targetEntity();
    if (key === "deadline") return this._deadlineEntity();
    return this._cfg.entities[key] || this._cfg.controls[key]?.entity || null;
  }

  _onClick(event) {
    // A tap on the backdrop around the ready-by popup closes it.
    if (event.target && event.target === this._r.rbDlg) { this._rbClose(); return; }
    if (event.target && event.target === this._r.ceDlg) { this._ceClose(); return; }
    const ce = event.target?.closest?.("[data-ceopen],[data-ceclose],[data-cepick],[data-cesave],[data-ceremember]");
    if (ce && Object.keys(ce.dataset || {}).some((key) => key.startsWith("ce"))) { this._ceAction(ce); return; }
    // "Opladninger uden pris" opens the correction with the first charge without a price.
    if (event.target?.closest?.('[data-more="charges_needing_price"]')?.dataset?.more === "charges_needing_price" && this._ceAvailable() && this._ceCharges().some((c) => c.price == null)) {
      this._ceOpen(this._ceCharges().find((c) => c.price == null)?.id);
      return;
    }
    // A tap outside the small control panel closes it.
    if (this._qcOpen && !event.target?.closest?.(".qc-pop,[data-qc]")) this._openQc(this._qcOpen);
    const target = event.target?.closest?.("[data-range],[data-action],[data-more],[data-nav],[data-mapstyle],[data-chargers],[data-scmode],[data-scdefault],[data-scdef],[data-sccapx],[data-sclimit],[data-scwait],[data-planact],[data-cc],[data-ccset],[data-ccundo],[data-sctrip],[data-scround],[data-scclear],[data-scconfirm],[data-scphone],[data-scinfo],[data-scsend],[data-scres],[data-qc],[data-qcclose],[data-qcpower],[data-qctemp],[data-qcmore],[data-scopt],[data-scoptrole],[data-pctoggle],[data-pcsave],[data-qcchip],[data-rbopen],[data-rbclose],[data-rbsave],[data-rbmode],[data-rbday],[data-rbweekend],[data-rbcopy],[data-rblearned],[data-rboncesave],[data-rbonceclear],[data-socok],[data-socundo],[data-qchold]");
    if (!target) return;
    if (Object.keys(target.dataset).some((key) => key.startsWith("rb"))) { this._rbAction(target); return; }
    if (target.dataset.socok != null || target.dataset.socundo != null) {
      const value = this._socPending;
      this._socPending = null;
      clearTimeout(this._socTimer);
      if (target.dataset.socok != null && value != null) this._setTargetSoc(value);
      this._queue(true);
      return;
    }
    if (target.dataset.qc) { if (!target.disabled) this._openQc(target.dataset.qc); return; }
    if (target.dataset.qcclose != null) { this._openQc(this._qcOpen); return; }
    if (target.dataset.qcpower != null) { this._qcPower(); return; }
    if (target.dataset.qcchip) { this._qcChip(target.dataset.qcchip); return; }
    if (target.dataset.qchold != null) { this._scCall("heat_hold", "switch", "toggle"); return; }
    if (target.dataset.qctemp) { this._qcTempStep(Number(target.dataset.qctemp)); return; }
    if (target.dataset.qcmore != null) {
      const id = this._cfg.carControls[this._qcOpen];
      this._openQc(this._qcOpen);
      if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } }));
      return;
    }
    if (target.dataset.cc) this._carControl(target.dataset.cc);
    else if (target.dataset.ccset) {
      const pending = this._ccPending; const id = this._ccTarget(target.dataset.ccset);
      this._ccPending = null; clearTimeout(this._ccTimer);
      if (pending && id && pending.key === target.dataset.ccset) this._call("number", "set_value", { entity_id: id, value: pending.value });
      this._applyCarControls();
    } else if (target.dataset.ccundo) { this._ccPending = null; clearTimeout(this._ccTimer); this._applyCarControls(); }
    else if (target.dataset.scmode) this._chooseMode(target.dataset.scmode);
    else if (target.dataset.scdefault) this._chooseDefault(target.dataset.scdefault);
    else if (target.dataset.sccapx != null) this._toggleCapOverride();
    else if (target.dataset.sclimit != null) this._scCall("smart_price_limit", "switch", "toggle");
    else if (target.dataset.scwait) this._chooseWait(target.dataset.scwait === "on");
    else if (target.dataset.planact) this._planAct(target.dataset.planact);
    else if (target.dataset.scres) this._scCall("price_resolution", "select", "select_option", { option: target.dataset.scres });
    else if (target.dataset.scdef != null) {
      this._defOpen = !this._defOpen;
      this._queue(true);
    } else if (target.dataset.sctrip != null) {
      this._tripOpen = !this._tripOpen;
      this._queue(true);
    } else if (target.dataset.scround != null) this._scCall("trip_round_trip", "switch", "toggle");
    else if (target.dataset.scclear != null) this._scCall("trip_clear", "button", "press");
    else if (target.dataset.scconfirm != null) this._scCall("confirm_plan", "button", "press");
    else if (target.dataset.scphone != null) this._scCall("confirm_on_phone", "switch", "toggle");
    else if (target.dataset.scinfo != null) this._scCall("notify_plan", "switch", "toggle");
    else if (target.dataset.scsend != null) this._scCall("send_plan", "button", "press");
    else if (target.dataset.scopt != null) { this._optOpen = !this._optOpen; this._queue(true); }
    else if (target.dataset.scoptrole) this._scCall(target.dataset.scoptrole, "switch", "toggle");
    else if (target.dataset.pctoggle != null) { this._pcOpen = !this._pcOpen; this._queue(true); }
    else if (target.dataset.pcsave != null) this._savePublic();
    else if (target.dataset.nav != null) this._navigate();
    else if (target.dataset.mapstyle != null) this._toggleMapStyle();
    else if (target.dataset.chargers != null) this._toggleChargers();
    else if (target.dataset.range != null) this._setMapHours(Number(target.dataset.range));
    else if (target.dataset.action) this._action(target.dataset.action);
    else if (target.dataset.more) {
      const entityId = this._moreId(target.dataset.more);
      if (entityId && this._hass?.states?.[entityId]) {
        this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }));
      }
    }
  }

  _navigate() {
    const path = this._cfg.navigation_path;
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed"));
    // Lets a surrounding popup close itself.
    this.dispatchEvent(new CustomEvent("tesla-popup-close", { bubbles: true, composed: true }));
  }

  _onChange(event) {
    if (event.target?.dataset?.qcholdprice != null) {
      const value = ttdToNumber(event.target.value);
      if (value != null && value >= 0) this._scCall("heat_hold_price", "number", "set_value", { value });
      return;
    }
    if (event.target?.dataset?.rbin) { this._rbInput(event.target); return; }
    if (event.target?.dataset?.cein) return;
    const el = event.target;
    const r = this._r;
    if (el?.dataset?.ccnum) {
      // Charge limit and current are not critical: set when the slider is let go, like the target.
      const key = el.dataset.ccnum; const id = this._ccTarget(key); const value = Number(el.value);
      const [, label] = TTD_CAR_CONTROLS.find(([k]) => k === key) || [];
      this._ccPending = null;
      if (id) this._ccCall(key, key, "number", "set_value", { entity_id: id, value }, (s) => Number(s.state) === value,
        `Sætter ${String(label).toLowerCase()} til ${value}…`, `${label} er ${value}`);
      this._applyCarControls();
      return;
    }
    if (el === r.rangeSelect) {
      this._chartRange = TTD_CHART_RANGES[el.value] ? el.value : "today";
      this._renderChart(true);
      this._loadStats(this._chartRange, false);
    } else if (el === r.socRange) {
      // A new target is only sent after "Bekræft" (and forgotten after 20 s without it).
      this._dragSoc = false;
      const value = Number(el.value);
      const current = this._targetSoc();
      clearTimeout(this._socTimer);
      this._socPending = current != null && Math.round(current) === Math.round(value) ? null : value;
      if (this._socPending != null) this._socTimer = setTimeout(() => { this._socPending = null; this._queue(true); }, 20000);
      this._queue(true);
      return;
    } else if (el === r.dlInput) {
      clearTimeout(this._dlTimer);
      this._dlTimer = setTimeout(() => this._setDeadline(el.value), 1500);
    }
    else if (el === r.modeSelect) this._setChargerMode(el.value);
    else if ([r.scFixedStart, r.scFixedEnd, r.scCapInput, r.scMinInput, r.scLimitInput, r.scMaxInput, r.scFloorInput, r.scDest, r.scDep, r.scQuietFrom, r.scQuietUntil].includes(el)) this._deferInput(el);
  }

  /** Time pickers report every step (22 → 23 → 00 …); only the value the user stops at is sent. */
  _deferInput(el) {
    clearTimeout(this._inputTimer);
    this._inputEl = el;
    this._inputTimer = setTimeout(() => this._commitInput(el), 1500);
  }

  _commitInput(el) {
    if (!el || el !== this._inputEl) return;
    clearTimeout(this._inputTimer);
    this._inputEl = null;
    const r = this._r;
    if (el === r.scFixedStart && el.value) this._scCall("fixed_start", "time", "set_value", { time: `${el.value}:00` });
    else if (el === r.scFixedEnd && el.value) this._scCall("fixed_end", "time", "set_value", { time: `${el.value}:00` });
    else if (el === r.scQuietFrom && el.value) this._scCall("quiet_from", "time", "set_value", { time: `${el.value}:00` });
    else if (el === r.scQuietUntil && el.value) this._scCall("quiet_until", "time", "set_value", { time: `${el.value}:00` });
    else if (el === r.scCapInput && el.value !== "" && Number.isFinite(Number(el.value))) this._scCall("price_cap", "number", "set_value", { value: Number(el.value) });
    else if (el === r.scMinInput && el.value !== "" && Number.isFinite(Number(el.value))) this._scCall("min_soc", "number", "set_value", { value: Number(el.value) });
    else if (el === r.scLimitInput && el.value !== "" && Number.isFinite(Number(el.value))) this._scCall(this._sc("ask_min_saving") ? "ask_min_saving" : "smart_max_price", "number", "set_value", { value: Number(el.value) });
    else if (el === r.scMaxInput && !el.validity?.badInput && (el.value === "" || Number.isFinite(Number(el.value)))) this._scCall("smart_max_price", "number", "set_value", { value: el.value === "" ? 0 : Math.max(0, Number(el.value)) });
    else if (el === r.scFloorInput && el.value !== "" && Number.isFinite(Number(el.value))) this._scCall("smart_floor_soc", "number", "set_value", { value: Number(el.value) });
    else if (el === r.scDest) this._scCall("trip_destination", "text", "set_value", { value: el.value.trim() });
    else if (el === r.scDep && el.value) {
      const date = new Date(el.value);
      if (!Number.isNaN(date.getTime())) this._scCall("trip_departure", "datetime", "set_value", { datetime: date.toISOString() });
    }
  }

  _onInput(event) {
    if (event.target?.dataset?.ccnum) {
      // The value follows the finger; it is set when the slider is let go (see _onChange).
      this._ccPending = { key: event.target.dataset.ccnum, value: Number(event.target.value) };
      this._applyCarControls();
      return;
    }
    if (event.target !== this._r.socRange) return;
    const el = event.target;
    this._dragSoc = true;
    const min = Number(el.min) || 0;
    const max = Number(el.max) || 100;
    this._t("socCtlVal", `${this._format().number(Number(el.value), 0)} %`);
    el.style.setProperty("--p", `${max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0}%`);
  }

  _onKey(event) {
    if (event.target !== this._r.chart || !this._chart) return;
    const n = this._chart.slots.length;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const start = this._hi < 0 ? n - 1 : this._hi + (event.key === "ArrowRight" ? 1 : -1);
      let index = ttdClamp(start, 0, n - 1);
      while (index > 0 && this._chart.slots[index].future) index -= 1;
      this._showTip(index);
    } else if (event.key === "Escape") this._showTip(-1);
  }

  _action(name) {
    let control = this._control(name);
    if (!control && (name === "start_charge" || name === "stop_charge") && this._cfg.smart_charge) {
      const id = this._scIds().charge_mode;
      const stateObj = id ? this._hass?.states?.[id] : undefined;
      if (stateObj && stateObj.state !== "unavailable") control = { id, stateObj, domain: "select", option: name === "start_charge" ? "now" : "off" };
    }
    if (!control || this._busy(name, control)) return;
    // Two-step confirmation: the first press arms the button for a few seconds, the second one executes.
    if (this._armed !== name) {
      this._disarm(false);
      this._armed = name;
      this._armTimer = setTimeout(() => this._disarm(true), TTD_ARM_MS);
      this._queue(true);
      return;
    }
    this._disarm(true);
    const { id, domain } = control;
    if (domain !== "script") {
      // Direct commands: show progress briefly and fetch the charger's new state instead of waiting for its next poll.
      this._pending = { name, until: Date.now() + TTD_PENDING_MS };
      clearTimeout(this._pendingTimer);
      this._pendingTimer = setTimeout(() => {
        this._refresh(true);
        this._queue(true);
      }, 4000);
      setTimeout(() => this._queue(true), TTD_PENDING_MS + 50);
    }
    if (control.option) this._call("select", "select_option", { entity_id: id, option: control.option });
    else if (domain === "button" || domain === "input_button") this._call(domain, "press", { entity_id: id });
    else if (domain === "switch" || domain === "input_boolean") this._call(domain, name === "stop_charge" ? "turn_off" : "turn_on", { entity_id: id });
    else if (domain === "script" || domain === "scene") this._call(domain, "turn_on", { entity_id: id });
    else if (domain === "automation") this._call(domain, "trigger", { entity_id: id });
  }

  /** Switching plan can start or stop the charger, so it takes a second tap within a few seconds. */
  _chooseMode(mode) {
    if (this._sc("charge_mode")?.state === mode) return;
    const key = `mode:${mode}`;
    if (this._cfg.confirm_mode_change && this._armed !== key) {
      this._disarm(false);
      this._armed = key;
      this._armTimer = setTimeout(() => this._disarm(true), TTD_ARM_MS);
      this._queue(true);
      return;
    }
    this._disarm(true);
    this._scCall("charge_mode", "select", "select_option", { option: mode });
  }

  /** Over the price limit: wait with the rest (only below the limit this plug-in) or charge to the target; second tap confirms. */
  _chooseWait(on) {
    if ((this._sc("price_limit_wait")?.state === "on") === on) return;
    const key = `wait:${on}`;
    if (this._armed !== key) {
      this._disarm(false);
      this._armed = key;
      this._armTimer = setTimeout(() => this._disarm(true), TTD_ARM_MS);
      this._queue(true);
      return;
    }
    this._disarm(true);
    this._scCall("price_limit_wait", "switch", on ? "turn_on" : "turn_off");
  }

  /** The plan box's overrides, each with a second tap: charge to the target after all (the plan waited with the dear
   * rest), or back to the default plan after "Lad nu" or a pause. */
  _planAct(key) {
    const armKey = `plan:${key}`;
    if (this._armed !== armKey) {
      this._disarm(false);
      this._armed = armKey;
      this._armTimer = setTimeout(() => this._disarm(true), TTD_ARM_MS);
      this._queue(true);
      return;
    }
    this._disarm(true);
    if (key === "full") this._scCall("price_limit_wait", "switch", "turn_off");
    else if (key === "back") {
      const def = this._sc("charge_mode")?.attributes?.default_mode;
      if (def) this._scCall("charge_mode", "select", "select_option", { option: def });
    }
  }

  /** The default plan decides what runs when the cable goes in, so it takes a second tap as well. */
  _chooseDefault(mode) {
    if (this._sc("default_charge_mode")?.state === mode) return;
    const key = `default:${mode}`;
    if (this._cfg.confirm_mode_change && this._armed !== key) {
      this._disarm(false);
      this._armed = key;
      this._armTimer = setTimeout(() => this._disarm(true), TTD_ARM_MS);
      this._queue(true);
      return;
    }
    this._disarm(true);
    this._scCall("default_charge_mode", "select", "select_option", { option: mode });
  }

  /** Going above the price cap (or not) changes when the car charges, so it takes a second tap too. */
  _toggleCapOverride() {
    if (this._cfg.confirm_mode_change && this._armed !== "capx") {
      this._disarm(false);
      this._armed = "capx";
      this._armTimer = setTimeout(() => this._disarm(true), TTD_ARM_MS);
      this._queue(true);
      return;
    }
    this._disarm(true);
    this._scCall("price_cap_override", "switch", "toggle");
  }

  _disarm(render) {
    clearTimeout(this._armTimer);
    this._armTimer = null;
    if (!this._armed) return;
    this._armed = null;
    if (render) this._queue(true);
  }

  _setTargetSoc(value) {
    const control = this._control("target_soc");
    if (!control || !Number.isFinite(value)) return;
    if (["input_number", "number"].includes(control.domain)) this._call(control.domain, "set_value", { entity_id: control.id, value });
  }

  _setDeadline(value) {
    const control = this._control("deadline");
    if (!control || !value) return;
    const { id, domain } = control;
    const attrs = control.stateObj.attributes || {};
    if (domain === "input_datetime") {
      if (attrs.has_date && attrs.has_time !== false) this._call(domain, "set_datetime", { entity_id: id, datetime: `${value.replace("T", " ")}:00` });
      else if (attrs.has_date) this._call(domain, "set_datetime", { entity_id: id, date: value });
      else this._call(domain, "set_datetime", { entity_id: id, time: `${value}:00` });
    } else if (domain === "time") this._call(domain, "set_value", { entity_id: id, time: `${value}:00` });
  }

  _setChargerMode(option) {
    const control = this._control("charger_mode");
    if (control && ["select", "input_select"].includes(control.domain)) this._call(control.domain, "select_option", { entity_id: control.id, option });
  }

  async _call(domain, service, data) {
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", {
        bubbles: true, composed: true, detail: { message: `Handlingen mislykkedes: ${err?.message || err}` },
      }));
    }
  }
}

const TTD_RB_DAYS = [["mon", "Mandag"], ["tue", "Tirsdag"], ["wed", "Onsdag"], ["thu", "Torsdag"], ["fri", "Fredag"], ["sat", "Lørdag"], ["sun", "Søndag"]];
// EV Ledger's learned departures are keyed by Danish short weekday names.
const TTD_RB_LEARNED = ["man", "tir", "ons", "tor", "fre", "lør", "søn"];

/** "i morgen kl. 07:00", or a weekday and date further ahead ("onsdag 14/10 kl. 05:30"). */
function ttdRbWhen(f, date, long = false) {
  const diff = f.dayDiff(date);
  const day = diff === 0 ? TTD_TEXT.today : diff === 1 ? TTD_TEXT.tomorrow
    : `${f.weekday(date, long ? "long" : "short").replace(/\.$/, "")}${long ? ` ${date.getDate()}/${date.getMonth() + 1}` : ""}`;
  return `${day} ${TTD_TEXT.at} ${f.time(date)}`;
}

/** A date as the value of an <input type="datetime-local"> in the browser's time zone. */
function ttdLocalInput(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A number typed in a correction field ("3,95", "3.95", "1 234,5"), or null. */
function ttdCeNum(value) {
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return null;
  const number = Number(/,\d*$/.test(text) ? text.replace(/\./g, "").replace(",", ".") : text);
  return Number.isFinite(number) ? number : null;
}

/** A number for a correction field: Danish decimal comma, no thousands separator. */
function ttdCeText(value, digits) {
  return Number.isFinite(value) ? (Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits).replace(".", ",") : "";
}

function ttdPerKwh(unit) {
  return unit === "kr." || unit === "kr" ? "kr/kWh" : `${unit}/kWh`;
}

/** Finds an element by tag through nested shadow roots (bounded depth; used once per map creation). */
/** Great-circle distance in km. */
function ttdDistanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

function ttdFindDeep(root, tag, depth = 0) {
  if (!root || depth > 6) return null;
  const scope = root.shadowRoot || root;
  const direct = scope.querySelector?.(tag);
  if (direct) return direct;
  for (const el of scope.querySelectorAll?.("*") || []) {
    if (el.shadowRoot) {
      const found = ttdFindDeep(el, tag, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

if (!customElements.get(TTD_TAG)) customElements.define(TTD_TAG, ThTeslaDashboardCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TTD_TAG)) {
  window.customCards.push({
    type: TTD_TAG,
    name: "TH Tesla Dashboard Card",
    description: `Tesla-dashboard med batteri, kort, opladning, ladeplan, dæktryk og EV Ledger v${TTD_VERSION}`,
    preview: false,
    documentationURL: "https://github.com/MRDonnii/ha-smart-home-cards/tree/main/src/cards/th-tesla-dashboard-card",
  });
}
