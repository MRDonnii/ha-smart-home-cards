const CALEFA_FLOW_CARD_VERSION = "0.9.0";
// The release build replaces this empty string with the bundled, generated unit image.
const CALEFA_DEFAULT_UNIT_IMAGE = "";

const ENTITY_KEYS = [
  "fjv_supply", "fjv_return", "fjv_flow",
  "heating_supply", "heating_return", "heating_setpoint", "heating_flow",
  "dhw_temperature", "dhw_setpoint", "cold_water_temperature", "water_flow",
  "pump", "pump_speed", "heating_valve", "dhw_valve",
  "heating_active", "dhw_active", "power", "pressure",
  "room_temperature", "outdoor_temperature",
  "lan_status", "peripheral_status",
  "energy_meter", "energy_today", "cost_today", "energy_price", "heating_energy_today", "dhw_energy_today",
];

// Registry unique IDs are stable when users rename Home Assistant entities.
const CALEFA_SENSOR_KEYS = {
  fjv_supply: "source_inlet_temperature", fjv_return: "source_return_temperature",
  heating_supply: "cvv_supply_temperature", heating_return: "cvv_return_temperature",
  heating_setpoint: "cvv_desired_supply_temperature", dhw_temperature: "dhw_out_temperature",
  dhw_setpoint: "dhw_temperature_setpoint", cold_water_temperature: "dcw_sensor_temperature",
  water_flow: "domestic_cold_water_flow", pump: "itc_pump_status",
  heating_valve: "cvv_valve_position", dhw_valve: "valve_position",
  heating_active: "ch_state", dhw_active: "dhw_state", pressure: "system_pressure",
  outdoor_temperature: "outdoor_temperature",
};
const CALEFA_CONTROL_KEYS = {
  dhw_setpoint: "dhw_temperature_setpoint_control", parallel_shift: "heat_curve_parallel_shift",
  heat_curve_type: "heat_curve_type", heat_curve_slope: "heat_curve_manual_slope",
  heat_min_supply: "heat_curve_min_supply_temperature", heat_max_supply: "heat_curve_max_supply_temperature",
  heat_max_return: "return_limiter_max_temperature", return_limiter_mode: "return_limiter_mode",
  return_limiter_gain: "return_limiter_max_gain", summer_shutdown: "summer_shutdown_temperature",
  bypass_temperature: "dhw_bypass_temperature_control", auto_standby: "auto_standby_enabled",
  standby: "standby_control", room_profile: "room_mode", room_schedule: "room_schedule",
  room_temporary_mode: "room_temporary_mode", eco_temperature: "room_eco_temperature",
  comfort_temperature: "room_comfort_temperature", extra_comfort_temperature: "room_extra_comfort_temperature",
  temporary_temperature: "room_temporary_temperature", temporary_duration: "room_temporary_duration",
  bypass_mode: "dhw_mode_control", circulation_temperature: "circulation_temperature_control",
  return_priority: "return_limiter_priority_over_supply", vacation: "vacation_control",
  vacation_dhw: "vacation_for_dhw", vacation_ch: "vacation_for_ch",
};
// Read-only status values shown on the controller's status pages.
const CALEFA_READOUT_KEYS = {
  bypass_state: "dhw_bypass_active", dhw_blocking: "dhw_blocking_source", dhw_regulator: "dhw_regulator_state",
  ch_blocking: "ch_blocking_source", ch_regulator: "ch_regulator_state", circulation_state: "circulation_state",
};
const CALEFA_ALARM_KEYS = new Set([
  "warning_low_energy", "warning_pressure_high", "error_pressure_critical_low", "warning_pressure_low",
  "dhi_sensor_failure", "dho_sensor_failure", "dhw_motor_failure", "dhw_motor_stuck",
  "dhw_sensor_failure", "dcw_sensor_failure", "no_secondary_pressure", "pressure_sensor_failure",
  "flow_sensor_failure", "itc_hs_sensor_failure", "itc_hr_sensor_failure", "outdoor_sensor_failure",
  "itc_motor_failure", "itc_htco_error", "auto_standby_fault",
]);
const CALEFA_REGISTRY_CACHE = new WeakMap();
function calefaRegistry(hass) {
  const visible = Object.values(hass?.entities || {}).filter((row) => row.platform === "wavin_calefa" && !row.disabled_by);
  const connection = hass?.connection;
  if (!connection?.sendMessagePromise) return Promise.resolve(visible);
  if (!CALEFA_REGISTRY_CACHE.has(connection)) {
    const request = connection.sendMessagePromise({ type: "config/entity_registry/list" })
      .then((rows) => rows.filter((row) => row.platform === "wavin_calefa" && !row.disabled_by))
      .catch((error) => {
        CALEFA_REGISTRY_CACHE.delete(connection);
        if (visible.length) return visible;
        throw error;
      });
    CALEFA_REGISTRY_CACHE.set(connection, request);
  }
  return CALEFA_REGISTRY_CACHE.get(connection);
}
function calefaEntries(rows) { return [...new Set(rows.map((row) => row.config_entry_id).filter(Boolean))]; }
function calefaBindings(rows, entryId) {
  const found = new Map(rows.filter((row) => row.config_entry_id === entryId)
    .map((row) => [row.unique_id?.slice(entryId.length + 1), row.entity_id]));
  const entities = Object.fromEntries(Object.entries(CALEFA_SENSOR_KEYS)
    .map(([key, unique]) => [key, found.get(unique)]).filter(([, id]) => id?.startsWith("sensor.")));
  const controls = Object.fromEntries([
    ...Object.entries(CALEFA_CONTROL_KEYS).map(([key, unique]) => [key, found.get(unique)]).filter(([, id]) => /^(number|select|switch)\./.test(id || "")),
    ...Object.entries(CALEFA_READOUT_KEYS).map(([key, unique]) => [key, found.get(unique)]).filter(([, id]) => id?.startsWith("sensor.")),
  ]);
  const alarms = [...CALEFA_ALARM_KEYS].map((unique) => found.get(unique)).filter((id) => id?.startsWith("binary_sensor."));
  return { entities, controls, alarms };
}

const UNAVAILABLE = new Set(["", "unknown", "unavailable", "none", "null"]);
const ON_WORDS = new Set([
  "on", "true", "yes", "ja", "open", "opening", "åben", "aaben",
  "heat", "heating", "active", "aktiv", "running", "kører", "korer",
  "drift", "i drift", "til", "tændt", "taendt", "opvarmning", "demand",
]);
const OFF_WORDS = new Set([
  "off", "false", "no", "nej", "closed", "closing", "lukket", "idle",
  "standby", "stand-by", "inactive", "inaktiv", "stop", "stopped", "stoppet",
  "fra", "slukket", "ingen", "sommer", "sommerstop", "summer",
]);

const METRICS = {
  fjv_supply: { label: "FJV frem", icon: "mdi:transmission-tower-import", tone: "supply", kind: "temperature" },
  fjv_return: { label: "FJV retur", icon: "mdi:transmission-tower-export", tone: "return", kind: "temperature" },
  heating_supply: { label: "Varme frem", icon: "mdi:radiator", tone: "heat", kind: "temperature" },
  heating_return: { label: "Varme retur", icon: "mdi:radiator-disabled", tone: "heat-return", kind: "temperature" },
  dhw_temperature: { label: "Varmt vand", icon: "mdi:water-thermometer", tone: "dhw", kind: "temperature" },
  cold_water_temperature: { label: "Koldt vand", icon: "mdi:water-outline", tone: "cold", kind: "temperature" },
  pump: { label: "Pumpe", icon: "mdi:fan", tone: "component", kind: "pump" },
  heating_valve: { label: "V-ventil", icon: "mdi:valve", tone: "component", kind: "valve" },
  dhw_valve: { label: "BV-ventil", icon: "mdi:valve", tone: "component", kind: "valve" },
  bypass: { label: "Bypass", icon: "mdi:pipe-valve", tone: "bypass", kind: "bypass" },
};

// Controller popup. Menu paths, labels and screen layouts follow Wavin's Calefa II V installation guide
// (pp. 10-24): a short ENTER selects or switches front menu, a held ENTER opens a menu or goes back, and
// UP/DOWN move through menus or change values. Only entities bound from the wavin_calefa integration are
// written; controller functions without a Home Assistant control are shown as display-only screens.
const LONG_PRESS_MS = 600;
const LCD_ROWS = 3;
// Controller wording for each select, paired with the integration's Danish and English options.
const OPTION_LABELS = {
  bypass_mode: [["Auto", "Adaptivt skema", "adaptive_schedule"], ["Planlæg", "Skema", "schedule"], ["Komfort", "Komfort", "comfort"], ["Øko", "Øko", "eco"]],
  heat_curve_type: [["Manuel", "Manuel", "manual"], ["Gulvvarme", "Gulvvarme", "floor_heating"], ["Radiator", "Radiator", "radiator"]],
  return_limiter_mode: [["Fra", "Fra", "off"], ["Maksimum", "Maksimum", "maximum"]],
  room_profile: [["Øko", "Øko", "eco"], ["Komfort", "Komfort", "comfort"], ["Ekstra komfort", "Ekstra komfort", "extra_comfort"]],
};
const SWITCH_OPTIONS = [["Fra", "off"], ["Til", "on"]];
const numberItem = (label, map, title = label) => ({ type: "number", label, map, title });
const selectItem = (label, map, title = label) => ({ type: "select", label, map, title });
const switchItem = (label, map, title = label) => ({ type: "switch", label, map, title });
const pagesItem = (label, source, status) => ({ type: "pages", label, source, status });
const deviceItem = (label) => ({ type: "device", label });
const menuItem = (label, children, status) => ({ type: "menu", label, children, status });
const BV_MENU = menuItem("BV", [
  numberItem("Temperatur", "dhw_setpoint"),
  pagesItem("Status", "bv", "dhw_active"),
  menuItem("Bypass", [selectItem("Mode", "bypass_mode"), deviceItem("Se tidsplaner"), numberItem("Temperatur", "bypass_temperature")]),
  numberItem("Cirkulation", "circulation_temperature", "Cirk. temp."),
], "dhw_active");
const ITC_MENU = menuItem("ITC", [
  pagesItem("Status", "itc", "heating_active"),
  menuItem("Varmekurve", [
    selectItem("Type", "heat_curve_type"), numberItem("Hældning", "heat_curve_slope"),
    numberItem("Paral-forskyd", "parallel_shift"), numberItem("Min. Varme F.", "heat_min_supply"), numberItem("Maks. Varme F.", "heat_max_supply"),
  ]),
  menuItem("Returbegrænser", [
    selectItem("Mode", "return_limiter_mode"), numberItem("Maks. retur", "heat_max_return"),
    numberItem("Forstærkning", "return_limiter_gain"), switchItem("Prioritet", "return_priority"),
  ]),
], "heating_active");
const SETTINGS_MENU = menuItem("INDSTIL.", [
  BV_MENU,
  ITC_MENU,
  menuItem("Rum", [
    selectItem("Komfortniveau", "room_profile"), numberItem("Øko", "eco_temperature"), numberItem("Komfort", "comfort_temperature"),
    numberItem("Ekstra komfort", "extra_comfort_temperature"), switchItem("Skema", "room_schedule"), switchItem("Midl. mode", "room_temporary_mode"),
    numberItem("Midl. temp.", "temporary_temperature"), numberItem("Midl. varighed", "temporary_duration"),
  ], "room_profile"),
  menuItem("Programmer", [
    menuItem("Temperaturer", [numberItem("Udkobl. temp.", "summer_shutdown")]),
    switchItem("Standby", "standby"), switchItem("Aut. standby", "auto_standby"),
    switchItem("Ferie", "vacation"), switchItem("Ferie BV", "vacation_dhw"), switchItem("Ferie CV", "vacation_ch"),
  ]),
  menuItem("Avanceret", [deviceItem("CV manl. ventil"), deviceItem("BV motorservice"), deviceItem("CH motorservice"), deviceItem("Komponenter"), deviceItem("Kopier opsætning")]),
  deviceItem("Dato og tid"),
  pagesItem("Føler", "sensors"),
]);
// Front menus cycled with short ENTER; ALARM only appears while an alarm is active.
const FRONTS = {
  bv: { label: "BV", value: numberItem("Temperatur", "dhw_setpoint"), menu: BV_MENU },
  varme: { label: "VARME", value: numberItem("Paral-forskyd", "parallel_shift"), menu: ITC_MENU },
  indstil: { label: "INDSTIL.", menu: SETTINGS_MENU },
  alarm: { label: "ALARM" },
};
// Status and sensor pages use the controller's abbreviations (installation guide p. 24).
const READOUTS = {
  FJF: ["fjv_supply", "temperature"], FJR: ["fjv_return", "temperature"], PRE: ["pressure", "pressure"],
  BV: ["dhw_temperature", "temperature"], KV: ["cold_water_temperature", "temperature"], FLW: ["water_flow", "flow"],
  BVV: ["dhw_valve", "percent"], BYP: ["bypass_state", "binary"], VF: ["heating_supply", "temperature"],
  VR: ["heating_return", "temperature"], UT: ["outdoor_temperature", "temperature"], PUM: ["pump", "binary"],
  CVV: ["heating_valve", "percent"], "ØVF": ["heating_setpoint", "temperature"],
};
const STATUS_PAGES = {
  bv: { grid: ["BV", "KV", "FJF", "FJR", "FLW", "BVV"], rows: [["Status", "dhw_active"], ["Bypass", "bypass_state"], ["Blokeret af", "dhw_blocking"], ["Regulator", "dhw_regulator"], ["Cirkulation", "circulation_state"]] },
  itc: { grid: ["VF", "VR", "UT", "ØVF", "CVV", "PUM"], rows: [["Status", "heating_active"], ["Blokeret af", "ch_blocking"], ["Regulator", "ch_regulator"]] },
  sensors: { grid: ["FJF", "BV", "FJR", "KV", "PRE", "FLW", "VF", "VR", "UT", "ØVF", "CVV", "BVV", "PUM", "BYP"], units: true },
};
const LCD_ICONS = {
  bv: '<path d="M1 5.4h1.7v6.8H1z"/><path d="M2.4 7h13.1a4.2 4.2 0 0 1 4.2 4.2v1.7h-3.1v-1.6c0-.6-.4-1-1-1H2.4z"/><path d="M7.4 3h7v1.8h-2.6V7H10V4.8H7.4z"/><path d="M18.2 15.1s-1.9 2.3-1.9 3.5a1.9 1.9 0 0 0 3.8 0c0-1.2-1.9-3.5-1.9-3.5z"/>',
  varme: '<path d="M2.5 11.5 12 3.5l9.5 8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 10.4V21h14V10.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.2 19.4v-6.2m-2.3 2.2 2.3-2.4 2.3 2.4M14.8 19.4v-6.2m-2.3 2.2 2.3-2.4 2.3 2.4" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  gear: '<path d="M12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64L4.57 11c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01a.5.5 0 0 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64z"/>',
  warning: '<path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/>',
  lock: '<path d="M7 10V7a5 5 0 0 1 10 0v3h1.5v11h-13V10zm2.4 0h5.2V7a2.6 2.6 0 0 0-5.2 0z"/>',
};
const lcdIcon = (name, cls = "") => `<svg class="lcd-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${LCD_ICONS[name]}</svg>`;
// Fascia symbols above the five status LEDs (installation guide p. 10).
const CONTROLLER_LEDS = [
  ["power", "Strøm", '<path d="M12 3v8"/><path d="M7.3 6.2a7.5 7.5 0 1 0 9.4 0"/>'],
  ["fault", "Advarsel / alarm", '<path d="M12 3.5 2.5 20.5h19z"/><path d="M12 10v5"/><path d="M12 17.4v.4"/>'],
  ["mode", "Mode", '<path d="M3 6.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/><path d="M3 12c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/><path d="M3 17.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0"/>'],
  ["lan", "LAN", '<path d="M2.5 8.8a13.5 13.5 0 0 1 19 0"/><path d="M5.8 12.2a8.8 8.8 0 0 1 12.4 0"/><path d="M9 15.6a4.2 4.2 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>'],
  ["peripheral", "Perifer", '<circle cx="12" cy="12" r="8.5"/>'],
];

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[c]);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// Pipe runs, anchors and component positions are traced on the bundled unit illustration and use
// its own pixel coordinates (775 x 1295), so the overlay never stretches the picture.
const VIEW_W = 775;
const VIEW_H = 1295;
// Hydraulics follow Wavin's principle diagram for the Calefa II V ITC (installation guide, Oct. 2025, p. 5):
// two plate exchangers sit one behind the other. The rear one, whose top shows above the front one,
// is the heating exchanger (02, air vent 49 on its upper port); the large front face is the domestic
// hot water exchanger (01). Where a pipe passes behind another part, `hide` lists the rectangles
// ({x, y, w, h}) or circles ({x, y, r}) that cover it, so glow and arrows disappear behind it.
// Holes of one track must not overlap.
// The diagram has no separate bypass pipe or thermostatic bypass valve: the electronic bypass is the DHW
// branch itself (FF, supply tee with 51 FJF, 01 primary from the bottom up, 51 FJR, valve 37 held slightly
// open, return tee downstream of 22/34, FR). The return from 37 crosses the supply line without a joint.
// Tracks marked `bypass` form that route.
const TRACKS = [
  // District heating supply: FF riser (90, 59, strainer 53) and the supply tee with 51 FJF that feeds both exchangers.
  { id: "ff", circuit: "primary", speed: "primary", tone: "supply", bypass: true, d: "M98.5 1238 V684 Q98.5 668.5 114 668.5 H352" },
  // Supply branch up behind the return manifold and down the diagonal into the heating exchanger's upper port.
  { id: "ff-heat", circuit: "heat-primary", speed: "heat-primary", tone: "supply", d: "M350 646 Q353 610 375 592 L405 563.5 L478 513.8 Q497 500.8 518 499 H537", hide: [{ x: 360, y: 548, w: 56, h: 42 }] },
  // Supply branch over the outer U-bend into the DHW exchanger's lower port.
  { id: "ff-dhw", circuit: "dhw-primary", speed: "dhw-primary", tone: "supply", bypass: true, d: "M352 669 Q370 674 390 674 H432 Q455 674 455 697 V915 Q455 938.5 478 938.5 H548" },
  // Heating exchanger return: lower port, behind the U-bends, through the heating valve (22/34) into the manifold.
  { id: "fr-heat", circuit: "heat-primary", speed: "heat-primary", tone: "return", d: "M442 863.5 H271 Q256 863.5 256 848 V575", hide: [{ x: 242, y: 656, w: 30, h: 26 }] },
  // DHW exchanger return: upper port past 51 FJR through the DHW control valve (37/34) into the manifold.
  { id: "fr-dhw", circuit: "dhw-primary", speed: "dhw-primary", tone: "return", bypass: true, d: "M490 574.5 H256" },
  // Return manifold (joins downstream of 22/34), sensor cross (52) and FR riser, which runs behind the supply line.
  { id: "fr", circuit: "primary", speed: "primary", tone: "return", bypass: true, d: "M256 574.5 H201 Q186.5 574.5 186.5 589 V1238", hide: [{ x: 172, y: 656, w: 30, h: 26 }] },
  // Heating return: VR through the pump (40) and strainer (53), over the inner U-bend, behind the outer
  // one and into the heating exchanger's lower port.
  { id: "vr", circuit: "heat", speed: "heat", tone: "heat-return", d: "M380 1238 V1076 L384 900 L388 830 V719 Q388 704 403 704 H440 Q452 704 452 716 V864 Q452 876 464 876 H548", hide: [{ x: 378.4, y: 987.4, r: 88 }, { x: 370, y: 852, w: 30, h: 22 }, { x: 441, y: 690, w: 29, h: 195 }] },
  // Heating supply: leaves the heating exchanger's upper port behind the valves, crosses behind the inner
  // U-bend, the valve return and the outer U-bend, then drops through the safety valve (25) to VF.
  { id: "vf", circuit: "heat", speed: "heat", tone: "heat", d: "M357 688 L437 858 L472 945 Q489 968 489 1000 V1058 L496 1090 V1238", hide: [{ x: 374, y: 722, w: 27, h: 62 }, { x: 425, y: 852, w: 16, h: 22 }, { x: 441, y: 845, w: 30, h: 55 }, { x: 441, y: 900, w: 60, h: 53 }] },
  // Cold water: KV up to the check valve (28A) below the pressure equaliser (07); it continues behind
  // the exchangers and comes up the flow meter (36) riser into the DHW exchanger's upper port.
  { id: "kv", circuit: "dhw", speed: "dhw", tone: "cold", d: "M679 1238 V1146" },
  { id: "kv-up", circuit: "dhw", speed: "dhw", tone: "cold", d: "M502 914 V590 Q502 574.5 517.5 574.5 H548" },
  // Hot water: DHW exchanger's lower port, down and round to BV.
  { id: "bv", circuit: "dhw", speed: "dhw", tone: "dhw", d: "M510 950 V1058 Q510 1076 530 1076 Q581 1076 581 1112 V1238" },
];
// Visible copper faces measured on the illustration: the top strip of the rear heating exchanger and the
// whole front DHW exchanger. The fog on a face runs from its hot end to its cold end.
const HX = {
  heat: { x: 584, y: 468.5, w: 102.5, h: 64.5, r: 7, top: true },
  dhw: { x: 591.5, y: 533, w: 96, h: 452.5, r: 8 },
};
// The pump head: flat face edge, the bezel band the arrows run in, and the outer housing edge.
const PUMP = { x: 378.4, y: 987.4, face: 68, rail: 77.3, rim: 86.5, box: 100 };
// 22/34 heating valve (centre left) and 37 DHW motor valve (top centre).
const VALVES = { heating_valve: { x: 255, y: 762, r: 46 }, dhw_valve: { x: 345, y: 505, r: 44 } };
const PORTS = [["FF", 98, "supply", "Fjernvarme frem"], ["FR", 187, "return", "Fjernvarme retur"], ["VR", 380, "heat-return", "Varme retur"], ["VF", 496, "heat", "Varme frem"], ["BV", 581, "dhw", "Brugsvand varmt"], ["KV", 679, "cold", "Koldt vand"]];
const LED_POSITIONS = [["power", 347, "Strøm"], ["fault", 367, "Fejl"], ["mode", 387, "Driftstilstand"], ["lan", 406, "LAN"], ["peripheral", 426, "Ekstern enhed"]];
// Callout targets on the drawing, and the side each tile sits on. FJF (51, red) sits in the supply tee,
// so its callout stays on the supply line into the tee; FJR (51, dark blue) sits on the DHW exchanger's
// primary outlet before valve 37, not on the common return (principle diagram p. 5, sensor colours p. 4).
// The bypass tile points at the outer U-bend that carries the bypass only: supply tee to the DHW
// exchanger's lower primary port.
const ANCHORS = {
  fjv_supply: [160, 668], fjv_return: [437, 575],
  dhw_valve: [345, 505], heating_valve: [255, 762], pump: [291.9, 987.4],
  heating_supply: [636, 500], heating_return: [486, 876],
  dhw_temperature: [640, 950], cold_water_temperature: [679, 1180], bypass: [455, 790],
};
// Tiles whose height on the side differs from their callout target, so the side layout stays unchanged.
const PLACE_Y = { fjv_return: 800 };
const LAYOUT = {
  left: [["tile", "dhw_valve"], ["pair", "fjv_supply", "fjv_return", "fjv"], ["tile", "heating_valve"], ["tile", "pump"]],
  right: [["tile", "dhw_temperature"], ["pair", "heating_supply", "heating_return", "heating"], ["tile", "bypass"], ["tile", "cold_water_temperature"]],
};
// Marker speed in drawing pixels per second for flow levels 1-4.
const FLOW_SPEEDS = [0, 42, 62, 88, 118];

function pathLength(d) {
  const tokens = String(d).match(/[MHVLQ]|-?\d*\.?\d+/g) || [];
  let index = 0, x = 0, y = 0, length = 0, command = "";
  const next = () => Number(tokens[index++]);
  while (index < tokens.length) {
    if (/[MHVLQ]/.test(tokens[index])) command = tokens[index++];
    if (command === "M") { x = next(); y = next(); }
    else if (command === "H") { const nx = next(); length += Math.abs(nx - x); x = nx; }
    else if (command === "V") { const ny = next(); length += Math.abs(ny - y); y = ny; }
    else if (command === "L") { const nx = next(); const ny = next(); length += Math.hypot(nx - x, ny - y); x = nx; y = ny; }
    else if (command === "Q") {
      const cx = next(), cy = next(), nx = next(), ny = next();
      let px = x, py = y;
      for (let step = 1; step <= 10; step += 1) {
        const t = step / 10;
        const qx = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * nx;
        const qy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ny;
        length += Math.hypot(qx - px, qy - py);
        px = qx; py = qy;
      }
      x = nx; y = ny;
    } else index += 1;
  }
  return length;
}

const polar = (r, degrees) => {
  const a = (degrees * Math.PI) / 180;
  return [Math.round(r * Math.cos(a) * 10) / 10, Math.round(r * Math.sin(a) * 10) / 10];
};

// Clip path that keeps the whole drawing except the holes a track passes behind.
function hideClip(id, holes) {
  const shape = (h) => h.r
    ? `M${h.x - h.r} ${h.y}a${h.r} ${h.r} 0 1 0 ${2 * h.r} 0a${h.r} ${h.r} 0 1 0 ${-2 * h.r} 0Z`
    : `M${h.x} ${h.y}h${h.w}v${h.h}h${-h.w}Z`;
  return `<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" d="M0 0H${VIEW_W}V${VIEW_H}H0Z${holes.map(shape).join("")}"/></clipPath>`;
}

// Fog colour for a water temperature: blue when cold, pale in between, orange to red when hot.
const FOG_STOPS = [[5, [47, 107, 255]], [15, [54, 180, 255]], [25, [127, 214, 255]], [35, [255, 200, 87]], [45, [255, 154, 60]], [55, [255, 106, 54]], [65, [255, 61, 79]]];
function fogColor(celsius) {
  const t = clamp(Number(celsius), FOG_STOPS[0][0], FOG_STOPS[FOG_STOPS.length - 1][0]);
  const upper = FOG_STOPS.findIndex(([at]) => at >= t);
  const [a, from] = FOG_STOPS[Math.max(0, upper - 1)];
  const [b, to] = FOG_STOPS[upper];
  const k = b === a ? 0 : (t - a) / (b - a);
  return `rgb(${from.map((c, i) => Math.round(c + (to[i] - c) * k)).join(",")})`;
}

// "I dag" section: hourly consumption for the current local day from Home Assistant statistics.
const TODAY_KEYS = ["energy_meter", "energy_today", "cost_today", "energy_price", "heating_energy_today", "dhw_energy_today"];
const TODAY_REFETCH_MS = 5 * 60 * 1000;

// Groups 5-minute (or hourly) statistic "change" rows into 24 local hours. The part of the current
// hour that is not in the statistics yet is the difference between the live daily counter and the
// summed statistics, so the chart always ends at the counter's current value.
// Meter reading at local midnight for an ever-increasing meter (e.g. the MQTT heat meter): the first
// statistics row of the day minus its own change.
function todayMeterBase(rows) {
  const first = (rows || [])
    .map((row) => ({ start: typeof row.start === "number" ? row.start : Date.parse(row.start), state: Number(row.state), change: Number(row.change) }))
    .filter((row) => Number.isFinite(row.start) && Number.isFinite(row.state))
    .sort((a, b) => a.start - b.start)[0];
  return first ? first.state - (Number.isFinite(first.change) ? first.change : 0) : null;
}

function buildTodaySeries(rows, liveTotal, midnight, now) {
  const hours = Array(24).fill(0);
  let sum = 0;
  for (const row of rows || []) {
    const start = typeof row.start === "number" ? row.start : Date.parse(row.start);
    const change = Number(row.change);
    if (!Number.isFinite(start) || !Number.isFinite(change) || change <= 0) continue;
    const index = Math.floor((start - midnight) / 3600000);
    if (index < 0 || index > 23) continue;
    hours[index] += change;
    sum += change;
  }
  const current = clamp(Math.floor((now - midnight) / 3600000), 0, 23);
  if (Number.isFinite(liveTotal) && liveTotal > sum) hours[current] += liveTotal - sum;
  return hours.map((value) => Math.round(value * 1000) / 1000);
}

function interpretActivity(stateObj, context = "generic") {
  if (!stateObj) return null;
  const raw = String(stateObj.state ?? "").trim().toLowerCase();
  if (UNAVAILABLE.has(raw)) return null;
  if (context === "dhw" && raw.includes("bypass")) return "bypass";
  if (ON_WORDS.has(raw)) return true;
  if (OFF_WORDS.has(raw)) return false;
  if (context === "heating" && /(opvarm|varme|heat|radiator|gulv)/.test(raw) && !/(standby|fra|sluk)/.test(raw)) return true;
  if (context === "dhw" && /(brugsvand|varmt vand|tapning|dhw|hot water)/.test(raw) && !/(standby|fra|ingen)/.test(raw)) return true;
  const numeric = toNumber(stateObj.state);
  return numeric === null ? null : numeric > 0;
}

class HaCalefaFlowCard extends HTMLElement {
  static getConfigElement() { return document.createElement("ha-calefa-flow-card-editor"); }
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._sourceConfig = null;
    this._registryConnection = null;
    this._hass = null;
    this._built = false;
    this._refs = {};
    this._metricNodes = new Map();
    this._seen = new Map();
    this._displayOpen = false;
    this._faultOpen = false;
    this._popupCard = null;
    this._resetDisplay();
    this._model = null;
    this._onClick = (event) => this._handleClick(event);
    this._onKeydown = (event) => this._handleKeydown(event);
    this._onPointer = (event) => this._handlePointer(event);
    this.shadowRoot.addEventListener("click", this._onClick);
    for (const type of ["pointerdown", "pointerup", "pointercancel"]) this.shadowRoot.addEventListener(type, this._onPointer);
    this.shadowRoot.addEventListener("contextmenu", (event) => {
      if (event.composedPath().some((node) => node?.dataset?.ctl)) event.preventDefault();
    });
  }

  static getStubConfig(hass) {
    return { title: "Calefa II 40/40", subtitle: "Fjernvarmeunit" };
  }

  setConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("ha-calefa-flow-card requires a configuration object");
    }
    const text = (value, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;
    this._sourceConfig = config;
    this._registryConnection = null;
    this._config = {
      calefa_entry: text(config.calefa_entry),
      title: text(config.title, "Calefa II 40/40"),
      subtitle: text(config.subtitle, "Fjernvarmeunit"),
      background_image: text(config.unit_image || config.background_image, CALEFA_DEFAULT_UNIT_IMAGE),
      background_fit: config.background_fit === "cover" ? "cover" : "contain",
      flow_threshold: Math.max(0, toNumber(config.flow_threshold) ?? 0.05),
      valve_threshold: Math.max(0, toNumber(config.valve_threshold) ?? 1),
      fjv_good_delta: Math.max(0, toNumber(config.fjv_good_delta) ?? 20),
      heating_good_delta: Math.max(0, toNumber(config.heating_good_delta) ?? 5),
      show_footer: config.show_footer !== false,
      show_today: config.show_today !== false,
      animations: config.animations !== false,
      display_entities: config.display_entities && typeof config.display_entities === "object" && !Array.isArray(config.display_entities) ? { ...config.display_entities } : {},
      alarm_entities: Array.isArray(config.alarm_entities) ? config.alarm_entities.filter((id) => typeof id === "string" && id.startsWith("binary_sensor.")) : [],
      popup_card: config.popup_card && typeof config.popup_card === "object" && !Array.isArray(config.popup_card) ? config.popup_card : null,
    };
    for (const key of ENTITY_KEYS) this._config[key] = text(config[key]);
    this._entityIds = [...new Set([...ENTITY_KEYS.map((key) => this._config[key]), ...Object.values(this._config.display_entities), ...this._config.alarm_entities].filter(Boolean))];
    this._build();
    if (this._hass) this._update();
    this._resolveCalefa();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config || !hass) return;
    this._resolveCalefa();
    if (!this._built) this._build();
    if (this._hasChanges(hass)) this._update();
    if (this._popupCard) this._popupCard.hass = hass;
  }

  _resolveCalefa() {
    const connection = this._hass?.connection;
    if (!connection?.sendMessagePromise || connection === this._registryConnection) return;
    this._registryConnection = connection;
    const source = this._sourceConfig;
    calefaRegistry(this._hass).then((rows) => {
      if (this._sourceConfig !== source || this._hass?.connection !== connection) return;
      const entries = calefaEntries(rows);
      const entry = source.calefa_entry || (entries.length === 1 ? entries[0] : "");
      if (!entry || !entries.includes(entry)) return;
      const { entities, controls, alarms } = calefaBindings(rows, entry);
      const selected = Boolean(source.calefa_entry);
      let changed = false;
      for (const key of Object.keys(CALEFA_SENSOR_KEYS)) {
        const id = entities[key] || "";
        if ((selected || (!source[key] && id)) && this._config[key] !== id) { this._config[key] = id; changed = true; }
      }
      if (selected) {
        const selectedIds = new Set(rows.filter((row) => row.config_entry_id === entry).map((row) => row.entity_id));
        const verifiedControls = Object.fromEntries(Object.entries(source.display_entities || {})
          .filter(([, id]) => selectedIds.has(id)));
        const bindings = { ...verifiedControls, ...controls };
        if (JSON.stringify(this._config.display_entities) !== JSON.stringify(bindings)) {
          this._config.display_entities = bindings; changed = true;
        }
      } else {
        for (const [key, id] of Object.entries(controls)) {
          if (!source.display_entities?.[key] && this._config.display_entities[key] !== id) {
            this._config.display_entities[key] = id; changed = true;
          }
        }
      }
      if ((selected || !source.alarm_entities) && JSON.stringify(this._config.alarm_entities) !== JSON.stringify(alarms)) {
        this._config.alarm_entities = alarms; changed = true;
      }
      if (changed) {
        this._entityIds = [...new Set([...ENTITY_KEYS.map((key) => this._config[key]),
          ...Object.values(this._config.display_entities), ...this._config.alarm_entities].filter(Boolean))];
        this._build();
        this._update();
      }
    }).catch(() => { if (this._hass?.connection === connection) this._registryConnection = null; });
  }

  get hass() { return this._hass; }
  getCardSize() { return 9; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }

  connectedCallback() {
    if (typeof IntersectionObserver !== "undefined" && !this._observer) {
      this._observer = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        this._offscreen = entry ? !entry.isIntersecting : false;
        this._syncAnimation();
        if (!this._offscreen && this._todayPending) this._maybeFetchToday();
      }, { rootMargin: "100px" });
      this._observer.observe(this);
    }
    this._observeLayout();
    requestAnimationFrame(() => this._layout());
  }

  disconnectedCallback() {
    this._observer?.disconnect();
    this._observer = null;
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._closeDisplay();
    this._closeFaults();
    this._popupCard?._closeDetailsPopup?.();
  }

  _stateObj(key) {
    const id = this._config?.[key];
    return id && this._hass?.states ? this._hass.states[id] || null : null;
  }

  _available(key) {
    const state = this._stateObj(key);
    return Boolean(state) && !UNAVAILABLE.has(String(state.state ?? "").trim().toLowerCase());
  }

  _num(key) { return this._available(key) ? toNumber(this._stateObj(key).state) : null; }
  _unit(key) { return this._stateObj(key)?.attributes?.unit_of_measurement || ""; }
  _activity(key, context) { return interpretActivity(this._stateObj(key), context); }

  _valvePosition(key) {
    const state = this._stateObj(key);
    if (!state || !this._available(key)) return null;
    const direct = toNumber(state.state);
    if (direct !== null) return clamp(direct, 0, 100);
    const attr = toNumber(state.attributes?.current_position ?? state.attributes?.position);
    if (attr !== null) return clamp(attr, 0, 100);
    const activity = interpretActivity(state, "valve");
    return activity === true ? 100 : activity === false ? 0 : null;
  }

  _formatNumber(value, decimals = 1) {
    const language = this._hass?.locale?.language || this._hass?.language || "da-DK";
    try {
      return new Intl.NumberFormat(language, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
    } catch (error) {
      return new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
    }
  }

  _format(key, kind = "number") {
    if (!this._available(key)) return "–";
    const value = this._num(key);
    if (value === null) return String(this._stateObj(key).state);
    const unit = this._unit(key);
    let decimals = 1;
    let shownUnit = unit;
    if (kind === "temperature") { decimals = 1; shownUnit = unit || "°C"; }
    else if (kind === "valve" || kind === "percent") { decimals = 0; shownUnit = "%"; }
    else if (kind === "flow") decimals = Math.abs(value) < 10 ? 1 : 0;
    else if (kind === "power") decimals = Math.abs(value) >= 100 ? 0 : 1;
    else if (kind === "pressure") decimals = 1;
    const text = this._formatNumber(value, decimals);
    return shownUnit ? `${text} ${shownUnit}` : text;
  }

  _formatParts(key, kind) {
    const text = this._format(key, kind);
    if (text === "–") return ["–", ""];
    const match = text.match(/^(.+?)\s+(°C|%|bar|kW|W|L\/h|L\/min|m³\/h)$/i);
    return match ? [match[1], match[2]] : [text, ""];
  }

  _hasChanges(hass) {
    if (this._seenConnected !== hass.connected || this._seenLocale !== hass.locale) return true;
    for (const id of this._entityIds) if (this._seen.get(id) !== hass.states?.[id]) return true;
    return false;
  }

  _remember(hass) {
    this._seenConnected = hass.connected;
    this._seenLocale = hass.locale;
    this._seen.clear();
    for (const id of this._entityIds) this._seen.set(id, hass.states?.[id]);
  }

  _computeModel() {
    const primaryFlow = this._num("fjv_flow");
    const heatFlow = this._num("heating_flow");
    const waterFlow = this._num("water_flow");
    const heatValve = this._valvePosition("heating_valve");
    const dhwValve = this._valvePosition("dhw_valve");
    const pumpState = this._activity("pump", "pump");
    const pumpSpeed = this._num("pump_speed");
    const explicitHeat = this._activity("heating_active", "heating");
    const explicitDhw = this._activity("dhw_active", "dhw");

    const heatValveOpen = heatValve === null ? null : heatValve > this._config.valve_threshold;
    const dhwValveOpen = dhwValve === null ? null : dhwValve > this._config.valve_threshold;
    const pumpActive = typeof pumpState === "boolean" ? pumpState : pumpSpeed !== null ? pumpSpeed > 0 : null;
    const measuredPrimary = primaryFlow !== null && primaryFlow > this._config.flow_threshold;
    const waterMoving = waterFlow !== null && waterFlow > this._config.flow_threshold;

    const heatingActive = typeof explicitHeat === "boolean"
      ? explicitHeat
      : (heatFlow !== null && heatFlow > this._config.flow_threshold) || heatValveOpen === true || pumpActive === true;

    let dhwState = "idle";
    if (explicitDhw === "bypass") dhwState = "bypass";
    else if (explicitDhw === true) dhwState = "active";
    else if (explicitDhw === false) dhwState = "idle";
    else if (waterFlow !== null) dhwState = waterMoving ? "active" : "idle";
    else if (dhwValveOpen) dhwState = "active";

    // Measured tapping wins over a DHW state that is read a few seconds apart from the flow meter.
    const dhwTap = dhwState === "active" || waterMoving;
    // The controller's bypass state only arms the function; the unit has no separate bypass pipe. Water
    // passes through the DHW exchanger's primary side only while valve 37 is open, so each primary branch
    // moves exactly while its own valve is open. Without a valve reading, tapping or measured heating flow
    // stands in, and a bypass is never drawn as moving because its flow cannot be shown.
    const dhwBypass = dhwState === "bypass" && !dhwTap;
    const dhwPrimary = dhwValveOpen ?? dhwTap;
    const bypassFlow = dhwBypass && dhwValveOpen === true;
    const heatPrimary = heatValveOpen ?? (heatingActive && measuredPrimary);
    const valvesKnown = heatValve !== null && dhwValve !== null;
    const primaryMoving = Boolean(dhwPrimary || heatPrimary || (!valvesKnown && measuredPrimary));
    // The pump drives the closed heating circuit; the configured heating flow is only used without a pump.
    const heatMoving = typeof pumpActive === "boolean" ? pumpActive : heatFlow !== null && heatFlow > this._config.flow_threshold;
    const supply = this._num("fjv_supply");
    const ret = this._num("fjv_return");
    const heatSupply = this._num("heating_supply");
    const heatReturn = this._num("heating_return");

    let pumpText = "–";
    if (this._config.pump_speed && pumpSpeed !== null) pumpText = this._format("pump_speed", "percent");
    else if (typeof pumpActive === "boolean" && (this._config.pump || this._config.pump_speed)) pumpText = pumpActive ? "Kører" : "Stop";

    return {
      heatingActive,
      heatLoop: heatingActive || pumpActive === true,
      heatPrimary,
      heatValveOpen,
      heatingValve: heatValve,
      dhwState,
      dhwTap,
      dhwBypass,
      bypassFlow,
      bypassArmed: dhwBypass && !bypassFlow,
      dhwPrimary,
      dhwValveOpen,
      dhwValve,
      primary: primaryMoving,
      primaryMoving,
      measuredPrimary,
      heatMoving,
      waterMoving,
      pumpActive: pumpActive ?? heatingActive,
      pumpSpeed,
      pumpText,
      cooling: supply !== null && ret !== null ? supply - ret : null,
      heatingDelta: heatSupply !== null && heatReturn !== null ? heatSupply - heatReturn : null,
    };
  }

  _configured(id) {
    if (id === "pump") return Boolean(this._config.pump || this._config.pump_speed);
    if (id === "bypass") return Boolean(this._config.dhw_active);
    return Boolean(this._config[id]);
  }

  // Bypass mode in the controller's own words (Auto / Planlæg / Komfort / Øko) and its temperature.
  _bypassSettings() {
    const entity = (key) => this._hass?.states?.[this._config.display_entities?.[key]];
    const mode = entity("bypass_mode");
    const raw = String(mode?.state ?? "").trim().toLowerCase();
    const label = UNAVAILABLE.has(raw) ? "" : (OPTION_LABELS.bypass_mode.find((row) => row.some((text) => text.toLowerCase() === raw))?.[0] ?? mode.state);
    const temperature = toNumber(entity("bypass_temperature")?.state);
    const degrees = temperature === null ? "" : `${this._formatNumber(temperature, Number.isInteger(temperature) ? 0 : 1)} °C`;
    return [label, degrees].filter(Boolean).join(" · ");
  }

  _tileMarkup(id) {
    if (!this._configured(id)) return "";
    const metric = METRICS[id];
    return `<button class="cf-tile" type="button" data-metric="${id}" data-tone="${metric.tone}" data-action="more-info" data-key="${id}"><ha-icon icon="${metric.icon}"></ha-icon><span><small>${metric.label}</small><strong><b data-num>–</b><em data-unit></em></strong><i data-sub></i></span></button>`;
  }

  _blockMarkup(spec) {
    const anchorY = (ids) => {
      const ys = ids.filter((id) => this._configured(id)).map((id) => PLACE_Y[id] ?? ANCHORS[id][1]);
      return ys.length ? ys.reduce((sum, y) => sum + y, 0) / ys.length : 0;
    };
    const place = (y) => `data-y="${Math.round(y)}" style="--y:${((y / VIEW_H) * 100).toFixed(2)}%"`;
    if (spec[0] === "pair") {
      const [, first, second, delta] = spec;
      const tiles = [this._tileMarkup(first), this._tileMarkup(second)].filter(Boolean);
      if (!tiles.length) return "";
      const ring = tiles.length === 2 ? `<div class="cf-delta" data-delta="${delta}" role="status" aria-label="Temperaturforskel mellem frem og retur"><small>ΔT</small><strong><b>–</b><em>°C</em></strong></div>` : "";
      return `<div class="cf-block cf-pair ${tiles.length === 2 ? "" : "is-single"}" ${place(anchorY([first, second]))}>${tiles.join("")}${ring}</div>`;
    }
    const tile = this._tileMarkup(spec[1]);
    return tile ? `<div class="cf-block" ${place(PLACE_Y[spec[1]] ?? ANCHORS[spec[1]][1])}>${tile}</div>` : "";
  }

  _build() {
    if (!this._config) return;
    this._closeFaults();
    this._popupCard?._closeDetailsPopup?.();
    this._popupCard = null;
    this.shadowRoot.innerHTML = `<style>${CALEFA_STYLES}</style>${this._markup()}`;
    this._refs = {};
    this.shadowRoot.querySelectorAll("[data-ref]").forEach((el) => { this._refs[el.dataset.ref] = el; });
    this._metricNodes = new Map();
    this.shadowRoot.querySelectorAll("[data-metric]").forEach((el) => {
      const id = el.dataset.metric;
      if (!this._metricNodes.has(id)) this._metricNodes.set(id, []);
      this._metricNodes.get(id).push({ el, num: el.querySelector("[data-num]"), unit: el.querySelector("[data-unit]"), sub: el.querySelector("[data-sub]") });
    });
    this._circuitNodes = new Map();
    this._trackNodes = new Map();
    this.shadowRoot.querySelectorAll("[data-circuit]").forEach((el) => {
      const key = el.dataset.circuit;
      if (!this._circuitNodes.has(key)) this._circuitNodes.set(key, []);
      this._circuitNodes.get(key).push(el);
      const id = el.dataset.id || el.dataset.track;
      if (!this._trackNodes.has(id)) this._trackNodes.set(id, []);
      this._trackNodes.get(id).push(el);
    });
    this._markerLevels = {};
    const photo = this._refs.photo;
    if (photo) {
      photo.addEventListener("error", () => {
        if (CALEFA_DEFAULT_UNIT_IMAGE && photo.getAttribute("src") !== CALEFA_DEFAULT_UNIT_IMAGE) photo.setAttribute("src", CALEFA_DEFAULT_UNIT_IMAGE);
        else photo.hidden = true;
      });
      photo.setAttribute("src", this._config.background_image);
    }
    this._built = true;
    this._seen.clear();
    this._observeLayout();
    this._syncAnimation();
  }

  _observeLayout() {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (!this.isConnected || !this._built || typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => this._layout());
    this._resizeObserver.observe(this);
    this.shadowRoot.querySelectorAll(".cf-block, .cf-stage-box").forEach((el) => this._resizeObserver.observe(el));
  }

  // Places the side tiles next to the part they describe, resolves overlaps and draws the callouts.
  _layout() {
    const { main, stage, callouts } = this._refs;
    if (!main || !stage || !callouts || !main.clientWidth) return;
    const bounds = main.getBoundingClientRect();
    const picture = stage.getBoundingClientRect();
    if (!picture.height) return;
    for (const side of [this._refs.left, this._refs.right]) {
      if (!side) continue;
      const box = side.getBoundingClientRect();
      const gap = clamp(picture.width * 0.016, 5, 12);
      const items = [...side.querySelectorAll(":scope > .cf-block")]
        .map((el) => ({ el, height: el.offsetHeight, want: picture.top - box.top + (Number(el.dataset.y) / VIEW_H) * picture.height }))
        .sort((a, b) => a.want - b.want);
      let cursor = 0;
      for (const item of items) {
        item.top = Math.max(item.want - item.height / 2, cursor);
        cursor = item.top + item.height + gap;
      }
      let limit = box.height;
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];
        if (item.top + item.height > limit) item.top = Math.max(0, limit - item.height);
        limit = item.top - gap;
      }
      for (const item of items) {
        const top = `${Math.round(item.top)}px`;
        if (item.el.style.top !== top) item.el.style.top = top;
      }
      this._toggle(side, "is-placed", true);
    }
    callouts.setAttribute("viewBox", `0 0 ${Math.round(bounds.width)} ${Math.round(bounds.height)}`);
    for (const group of callouts.querySelectorAll("[data-callout]")) {
      const id = group.dataset.callout;
      const tile = main.querySelector(`.cf-tile[data-metric="${id}"]`);
      if (!tile || !tile.offsetParent) { group.setAttribute("visibility", "hidden"); continue; }
      group.removeAttribute("visibility");
      const box = tile.getBoundingClientRect();
      const left = tile.closest(".cf-left") !== null;
      const sx = (left ? box.right : box.left) - bounds.left;
      const sy = box.top + box.height / 2 - bounds.top;
      const tx = picture.left - bounds.left + (ANCHORS[id][0] / VIEW_W) * picture.width;
      const ty = picture.top - bounds.top + (ANCHORS[id][1] / VIEW_H) * picture.height;
      const kx = sx + (left ? 1 : -1) * clamp(Math.abs(tx - sx) * 0.25, 6, 18);
      const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} H${kx.toFixed(1)} L${tx.toFixed(1)} ${ty.toFixed(1)}`;
      const [path, ring, dot] = group.children;
      if (path.getAttribute("d") !== d) path.setAttribute("d", d);
      for (const circle of [ring, dot]) { circle.setAttribute("cx", tx.toFixed(1)); circle.setAttribute("cy", ty.toFixed(1)); }
    }
  }

  _markup() {
    const sides = Object.fromEntries(Object.entries(LAYOUT).map(([side, specs]) => [side, specs.map((spec) => this._blockMarkup(spec)).join("")]));
    const callouts = Object.keys(ANCHORS).filter((id) => this._configured(id))
      .map((id) => `<g data-callout="${id}" data-tone="${METRICS[id].tone}"><path/><circle class="cf-callout-ring" r="5.5"/><circle class="cf-callout-dot" r="2.2"/></g>`).join("");
    return `<ha-card><div class="cf ${this._config.animations ? "" : "no-anim"}" data-ref="root">
      <div class="cf-main" data-ref="main">
        <aside class="cf-side cf-left" data-ref="left">${sides.left}</aside>
        <section class="cf-stage"><div class="cf-stage-box" data-ref="stage">${this._stageMarkup()}</div><div class="cf-ports" aria-hidden="true">${PORTS.map(([code, x, tone, title]) => `<span data-tone="${tone}" title="${title}" style="left:${((x / VIEW_W) * 100).toFixed(2)}%">${code}</span>`).join("")}</div></section>
        <aside class="cf-side cf-right" data-ref="right">${sides.right}</aside>
        <svg class="cf-callouts" data-ref="callouts" aria-hidden="true">${callouts}</svg>
      </div>
      ${this._footerMarkup()}
      ${this._todayMarkup()}
    </div>${this._modalMarkup()}${this._faultModalMarkup()}</ha-card>`;
  }

  _footerMarkup() {
    if (!this._config.show_footer) return "";
    const items = [["room_temperature", "Bolig", "mdi:home-thermometer-outline"], ["outdoor_temperature", "Ude", "mdi:thermometer"], ["power", "Effekt", "mdi:flash-outline"], ["pressure", "Tryk", "mdi:gauge"]].filter(([key]) => this._config[key]);
    if (!items.length) return "";
    return `<footer class="cf-footer">${items.map(([key, label, icon]) => `<button type="button" data-action="more-info" data-key="${key}" data-footer="${key}"><ha-icon icon="${icon}"></ha-icon><span><small>${label}</small><strong>–</strong></span></button>`).join("")}</footer>`;
  }

  // Bypass arrows are smaller and sparser: valve 37 holds a trickle of a few to about 160 L/h.
  _markersMarkup(track, level, variant = "") {
    const bypass = variant === "bypass";
    const length = pathLength(track.d);
    const count = Math.max(1, Math.round(length / (bypass ? 78 : 54)));
    const duration = length / FLOW_SPEEDS[level];
    const shape = bypass ? "M-5 -4.5 L3.5 0 L-5 4.5 L-2.5 0 Z" : "M-7 -6.5 L5 0 L-7 6.5 L-3.5 0 Z";
    return Array.from({ length: count }, (_, index) => `<path class="cf-marker" d="${shape}"><animateMotion path="${track.d}" dur="${duration.toFixed(2)}s" begin="-${((index * duration) / count).toFixed(2)}s" repeatCount="indefinite" rotate="auto"/></path>`).join("");
  }

  _stageMarkup() {
    const clip = (layer, track) => track.hide ? ` clip-path="url(#cf-hide-${layer}-${track.id})"` : "";
    const clips = (layer) => TRACKS.filter((track) => track.hide).map((track) => hideClip(`cf-hide-${layer}-${track.id}`, track.hide)).join("");
    const tracks = TRACKS.map((track) => `<g class="cf-track" data-circuit="${track.circuit}" data-id="${track.id}" data-tone="${track.tone}"${clip("g", track)}><path class="cf-track-halo" d="${track.d}"/><path class="cf-track-core" d="${track.d}"/><path class="cf-track-hot" d="${track.d}"/></g>`).join("");
    const markers = TRACKS.map((track) => `<g class="cf-markers" data-circuit="${track.circuit}" data-track="${track.id}"${clip("a", track)}>${this._markersMarkup(track, 2)}</g>`).join("");
    const pct = (value, total) => `${((value / total) * 100).toFixed(3)}%`;
    const fogs = Object.entries(HX).map(([key, face]) => {
      const rx = pct(face.r, face.w), ry = pct(face.r, face.h);
      const radius = face.top ? `${rx} ${rx} 0 0 / ${ry} ${ry} 0 0` : `${rx} / ${ry}`;
      return `<div class="cf-fog" data-ref="fog-${key}" data-fog="${key}" style="left:${pct(face.x, VIEW_W)};top:${pct(face.y, VIEW_H)};width:${pct(face.w, VIEW_W)};height:${pct(face.h, VIEW_H)};border-radius:${radius}"><i></i><i></i></div>`;
    }).join("");
    // Three arrows in the pump's bezel band: a tail that fades in and a head that spans the band.
    const [tx, ty] = polar(PUMP.rail, -84);
    const [ex, ey] = polar(PUMP.rail, -6);
    const [ix, iy] = polar(PUMP.face + 1.5, -6);
    const [ox, oy] = polar(PUMP.rim - 1.5, -6);
    const [hx, hy] = polar(PUMP.rail, 8);
    const arc = `M${tx} ${ty} A${PUMP.rail} ${PUMP.rail} 0 0 1 ${ex} ${ey}`;
    const blades = [0, 120, 240].map((rotation) => `<g transform="rotate(${rotation})"><path class="cf-pump-glow" stroke="url(#cf-pump-tail)" d="${arc}"/><path class="cf-pump-arc" stroke="url(#cf-pump-tail)" d="${arc}"/><path class="cf-pump-head" d="M${ix} ${iy} L${hx} ${hy} L${ox} ${oy} Z"/></g>`).join("");
    const box = PUMP.box;
    const pump = `<div class="cf-pump" data-ref="pump" style="left:${pct(PUMP.x - box, VIEW_W)};top:${pct(PUMP.y - box, VIEW_H)};width:${pct(2 * box, VIEW_W)};height:${pct(2 * box, VIEW_H)}">
        <svg class="cf-pump-ring" viewBox="${-box} ${-box} ${2 * box} ${2 * box}" aria-hidden="true"><circle class="cf-pump-rail" r="${PUMP.rail}"/><circle class="cf-pump-face" r="${PUMP.face}"/><circle class="cf-pump-rim" r="${PUMP.rim}"/></svg>
        <svg class="cf-pump-rotor" viewBox="${-box} ${-box} ${2 * box} ${2 * box}" aria-hidden="true"><defs><linearGradient id="cf-pump-tail" gradientUnits="userSpaceOnUse" x1="${tx}" y1="${ty}" x2="${ex}" y2="${ey}"><stop offset="0" stop-color="currentColor" stop-opacity="0"/><stop offset=".6" stop-color="currentColor" stop-opacity=".5"/><stop offset="1" stop-color="currentColor"/></linearGradient></defs>${blades}</svg>
      </div>`;
    const valves = Object.entries(VALVES).filter(([id]) => this._config[id]).map(([id, v]) => `<g class="cf-valve" data-ref="valve-${id}" transform="translate(${v.x} ${v.y})"><circle class="cf-valve-track" r="${v.r}"/><circle class="cf-valve-level" r="${v.r}" pathLength="100" transform="rotate(-90)"/><g class="cf-valve-runner"><circle r="${v.r + 6}" fill="none" stroke="none"/><circle class="cf-valve-dot" cx="0" cy="${-v.r}" r="6"/></g><text class="cf-valve-pct cf-minor" x="${v.r + 9}" y="7" data-ref="valve-${id}-text">–</text></g>`).join("");
    const leds = LED_POSITIONS.map(([key, x, label]) => `<circle class="cf-display-led" data-ref="led-${key}" cx="${x}" cy="164" r="4.4" aria-label="${label}"/>`).join("");
    const photo = this._config.background_image ? `<img class="cf-photo" data-ref="photo" alt="" decoding="async" style="object-fit:${this._config.background_fit === "cover" ? "cover" : "contain"}">` : "";
    const hit = PUMP.rim + 2;
    return `${photo}
      <div class="cf-fogs" aria-hidden="true">${fogs}</div>
      <svg class="cf-layer cf-glow" viewBox="0 0 ${VIEW_W} ${VIEW_H}" aria-hidden="true">
        <defs><linearGradient id="cf-lcd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9cdd8"/><stop offset="1" stop-color="#a3bac7"/></linearGradient>${clips("g")}</defs>
        <g class="cf-lcd"><rect x="346" y="102" width="58" height="42" rx="2" fill="url(#cf-lcd)"/><text class="cf-lcd-title" x="350" y="114" data-ref="mini-title">STANDBY</text><text class="cf-lcd-value" x="375" y="139" text-anchor="middle" data-ref="mini-value">–</text></g>
        ${tracks}
      </svg>
      <svg class="cf-layer cf-anim" data-ref="anim" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img" aria-label="Calefa flowdiagram">
        <defs>${clips("a")}</defs>
        ${markers}
        ${valves}
        <g class="cf-display-status">${leds}</g>
      </svg>
      ${pump}
      <button class="cf-display-hit" type="button" data-action="open-display" aria-label="Åbn Calefa-display"><ha-icon icon="mdi:gesture-tap"></ha-icon></button>
      <button class="cf-pump-hit" type="button" data-action="more-info" data-key="pump" aria-label="Pumpe status og detaljer" style="left:${pct(PUMP.x - hit, VIEW_W)};top:${pct(PUMP.y - hit, VIEW_H)};width:${pct(2 * hit, VIEW_W)};height:${pct(2 * hit, VIEW_H)}"></button>
      <button class="cf-fault" type="button" data-ref="fault-button" data-action="open-faults" aria-label="Vis aktive Calefa-fejl" hidden><ha-icon icon="mdi:alert-outline"></ha-icon><span>Fejl</span><b data-ref="fault-count"></b></button>
      <button class="cf-info" type="button" data-action="open-legacy-popup" aria-label="Info: Calefa styring og forbrug"><ha-icon icon="mdi:information-outline"></ha-icon><span>Info</span></button>`;
  }

  _modalMarkup() {
    const leds = CONTROLLER_LEDS.map(([key, label, path]) => `<span class="ctl-led" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg><i data-ref="pled-${key}" role="img" aria-label="${label}"></i></span>`).join("");
    const key = (ctl, label, glyph) => `<button type="button" data-action="display-key" data-ctl="${ctl}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${glyph}</svg></button>`;
    return `<div class="cf-modal" data-ref="modal"${this._displayOpen ? "" : " hidden"}><div class="cf-modal-backdrop" data-action="close-display"></div>
      <section class="ctl-wrap" role="dialog" aria-modal="true" aria-label="Calefa II V styring" tabindex="-1" data-ref="device">
        <button class="ctl-close" type="button" data-action="close-display" aria-label="Luk styring"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        <div class="ctl-device">
          <div class="ctl-logo" aria-hidden="true">wavin</div>
          <div class="ctl-lcd" data-ref="lcd" aria-live="polite"></div>
          <div class="ctl-leds">${leds}</div>
          <div class="ctl-usb" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M2.5 12h16"/><path d="M18.5 9.8 21.8 12l-3.3 2.2z" class="is-fill"/><circle cx="3.6" cy="12" r="1.5" class="is-fill"/><path d="M7.5 12 10.4 7.6h3.4"/><circle cx="14.9" cy="7.6" r="1.2" class="is-fill"/><path d="m10 12 2.9 4.4h2.5"/><path d="M15.4 15.3h2.2v2.2h-2.2z" class="is-fill"/></svg></div>
          <div class="ctl-keys" role="group" aria-label="Touch-knapper">
            ${key("down", "Pil ned", '<path d="M5 7h14l-7 11z" class="is-fill"/>')}
            ${key("enter", "Enter – kort tryk vælger, hold for menu eller tilbage", '<path d="M19.5 5.5v6.8H6.2"/><path d="M9.6 8.6 5.6 12.3l4 3.7"/>')}
            ${key("up", "Pil op", '<path d="M5 17h14L12 6z" class="is-fill"/>')}
          </div>
        </div>
        <p class="ctl-hint" data-ref="display-hint"></p>
      </section></div>`;
  }

  _faultModalMarkup() {
    return `<div class="cf-fault-modal" data-ref="fault-modal" hidden><div class="cf-fault-backdrop" data-action="close-faults"></div><section class="cf-fault-panel" role="dialog" aria-modal="true" aria-label="Aktive Calefa-fejl" tabindex="-1" data-ref="fault-panel"><header><ha-icon icon="mdi:alert-outline"></ha-icon><strong>Calefa-fejl</strong><button type="button" data-action="close-faults" aria-label="Luk fejl">×</button></header><div class="cf-fault-list" data-ref="fault-list"></div></section></div>`;
  }

  _text(el, value) { if (el && el.textContent !== value) el.textContent = value; }
  _toggle(el, cls, on) { if (el && el.classList.contains(cls) !== on) el.classList.toggle(cls, on); }

  _update() {
    if (!this._built || !this._hass) return;
    this._remember(this._hass);
    const model = this._computeModel();
    this._model = model;
    this._applyMetrics(model);
    this._applyDeltas(model);
    this._applyDiagram(model);
    this._applyFooter();
    this._applyToday();
    this._renderFaults();
    if (this._displayOpen) this._renderDisplay();
  }

  _metricValue(id, model) {
    const metric = METRICS[id];
    if (metric.kind === "bypass") {
      // Kører only while valve 37 is open in bypass state; Klar while the controller has armed it.
      const available = this._available("dhw_active");
      const text = !available ? "–" : model.bypassFlow ? "Kører" : model.bypassArmed ? "Klar" : "Fra";
      return { parts: [text, ""], sub: this._bypassSettings(), on: model.bypassFlow, armed: model.bypassArmed, available };
    }
    if (metric.kind === "pump") {
      const text = this._config.pump_speed && this._num("pump_speed") !== null ? this._format("pump_speed", "percent") : model.pumpText;
      const speed = this._config.pump_speed && this._num("pump_speed") !== null;
      return { parts: this._split(text), sub: speed ? (model.pumpActive ? "Kører" : "Stop") : "", on: model.pumpActive, available: text !== "–" };
    }
    if (metric.kind === "valve") {
      const position = this._valvePosition(id);
      const fallback = id === "heating_valve" ? Boolean(model.heatValveOpen ?? model.heatPrimary) : Boolean(model.dhwValveOpen ?? model.dhwPrimary);
      const on = position !== null ? position > this._config.valve_threshold : fallback;
      const text = this._format(id, "valve");
      let sub = on ? (position !== null && position >= 99 ? "Åben" : "Regulerer") : "Lukket";
      // Valve 37 is the electronic bypass: armed without an opening means no bypass flow yet.
      if (id === "dhw_valve" && model.bypassFlow) sub = "Bypass";
      else if (id === "dhw_valve" && model.bypassArmed) sub = "Bypass klar";
      return { parts: this._split(text), sub, on, available: this._available(id) };
    }
    const parts = this._formatParts(id, metric.kind);
    let on = false;
    if (id.startsWith("fjv_")) on = model.primaryMoving;
    else if (id.startsWith("heating_")) on = model.heatMoving;
    else if (id === "dhw_temperature" || id === "cold_water_temperature") on = model.waterMoving;
    let sub = "";
    if (id === "dhw_temperature" && this._config.water_flow && this._available("water_flow")) sub = this._format("water_flow", "flow");
    if (id === "heating_supply" && this._config.heating_flow && this._available("heating_flow")) sub = this._format("heating_flow", "flow");
    return { parts, sub, on, available: this._available(id) };
  }

  _split(text) {
    const match = String(text).match(/^(.+?)\s+(%|°C|bar|kW|W)$/);
    return match ? [match[1], match[2]] : [text, ""];
  }

  _applyMetrics(model) {
    for (const id of Object.keys(METRICS)) {
      const nodes = this._metricNodes.get(id) || [];
      if (!nodes.length) continue;
      const value = this._metricValue(id, model);
      const idle = METRICS[id].tone === "component" ? !value.on : METRICS[id].tone === "bypass" ? !value.on && !value.armed : false;
      this._toggle(this._refs.callouts?.querySelector(`[data-callout="${id}"]`), "is-idle", idle);
      for (const node of nodes) {
        this._text(node.num, value.parts[0]);
        this._text(node.unit, value.parts[1] ? ` ${value.parts[1]}` : "");
        this._text(node.sub, value.sub);
        this._toggle(node.el, "is-on", value.on);
        this._toggle(node.el, "is-armed", Boolean(value.armed));
        this._toggle(node.el, "is-unavailable", !value.available);
      }
    }
  }

  _deltaStatus(kind, value) {
    if (!Number.isFinite(value)) return "unavailable";
    return value >= this._config[kind === "fjv" ? "fjv_good_delta" : "heating_good_delta"] ? "good" : "bad";
  }

  _applyDeltas(model) {
    const values = { fjv: model.cooling, heating: model.heatingDelta };
    this.shadowRoot.querySelectorAll("[data-delta]").forEach((node) => {
      const value = values[node.dataset.delta];
      this._text(node.querySelector("b"), value === null ? "–" : this._formatNumber(value, 1));
      const status = this._deltaStatus(node.dataset.delta, value);
      this._toggle(node, "is-muted", status === "unavailable");
      this._toggle(node, "is-good", status === "good");
      this._toggle(node, "is-bad", status === "bad");
      const label = `${node.dataset.delta === "fjv" ? "Fjernvarme" : "Varme"} afkøling ${value === null ? "ikke tilgængelig" : `${this._formatNumber(value, 1)} grader, ${status === "good" ? "god" : "lav"}`}`;
      if (node.getAttribute("aria-label") !== label) node.setAttribute("aria-label", label);
    });
  }

  // Flow level 1-4 from a measured flow; null when the flow is not moving.
  _flowLevel(raw, unit = "") {
    const amount = Number(raw);
    if (raw === null || raw === undefined || !Number.isFinite(amount) || amount <= this._config.flow_threshold) return null;
    const u = String(unit).toLowerCase();
    const normalized = u === "l/h" ? amount / 1200 : u === "l/min" ? amount / 20 : u.startsWith("m³") || u.startsWith("m3") ? amount / 1.2 : amount / 100;
    return normalized < 0.12 ? 1 : normalized < 0.35 ? 2 : normalized < 0.7 ? 3 : 4;
  }

  _setCircuit(circuit, on) {
    for (const node of this._circuitNodes?.get(circuit) || []) this._toggle(node, "is-on", Boolean(on));
  }

  _setFog(node, hot, cold) {
    if (!node) return;
    const values = { "--fog-hot": fogColor(hot), "--fog-mid": fogColor((hot + cold) / 2), "--fog-cold": fogColor(cold) };
    for (const [name, value] of Object.entries(values)) if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
  }

  _setMarkerSpeed(speed, level, variant = "") {
    const key = `${level}:${variant}`;
    if (!level || this._markerLevels?.[speed] === key) return;
    this._markerLevels[speed] = key;
    for (const track of TRACKS.filter((entry) => entry.speed === speed)) {
      const group = this.shadowRoot.querySelector(`[data-track="${track.id}"]`);
      if (group) group.innerHTML = this._markersMarkup(track, level, variant);
    }
  }

  // Marker level of a primary branch from its valve opening (the PICV sets the flow).
  _valveLevel(position) {
    if (position === null || position === undefined) return null;
    return position <= 15 ? 1 : position <= 35 ? 2 : position <= 70 ? 3 : 4;
  }

  _applyDiagram(model) {
    const measured = this._flowLevel(this._num("fjv_flow"), this._unit("fjv_flow"));
    const water = this._flowLevel(this._num("water_flow"), this._unit("water_flow"));
    // A bypass trickle (valve 37 at a few per cent, measured 3-30 L/h) runs slowest; its short kick of
    // about 8 % moved some 160 L/h through the Kamstrup meter.
    const dhwPrimaryLevel = model.bypassFlow ? (model.dhwValve > 5 ? 2 : 1)
      : model.dhwTap ? water ?? this._valveLevel(model.dhwValve) ?? measured ?? 2
      : this._valveLevel(model.dhwValve) ?? measured ?? 1;
    const heatPrimaryLevel = this._valveLevel(model.heatingValve) ?? measured ?? 1;
    const valveKnown = model.heatingValve !== null && model.dhwValve !== null;
    // The trunk carries the sum of both branches; the meter's own reading is late, so it only decides
    // the speed when a valve reading is missing.
    const trunkLevel = Math.max(model.dhwPrimary ? dhwPrimaryLevel : 0, model.heatPrimary ? heatPrimaryLevel : 0, valveKnown ? 0 : measured ?? 0) || 1;
    const heatSecondary = this._flowLevel(this._num("heating_flow"), this._unit("heating_flow"));
    const heatLevel = typeof model.pumpActive === "boolean" && this._configured("pump")
      ? this._valveLevel(model.pumpSpeed) ?? 2
      : heatSecondary;
    const bypassOnly = model.bypassFlow && !model.heatPrimary;
    this._setMarkerSpeed("primary", trunkLevel, bypassOnly ? "bypass" : "");
    this._setMarkerSpeed("heat-primary", heatPrimaryLevel);
    this._setMarkerSpeed("dhw-primary", dhwPrimaryLevel, model.bypassFlow ? "bypass" : "");
    this._setMarkerSpeed("heat", heatLevel);
    this._setMarkerSpeed("dhw", water);
    this._setCircuit("primary", model.primaryMoving);
    this._setCircuit("heat-primary", Boolean(model.heatPrimary));
    this._setCircuit("dhw-primary", Boolean(model.dhwPrimary));
    this._setCircuit("heat", model.heatMoving);
    this._setCircuit("dhw", model.waterMoving);
    // The bypass route (FF, supply tee, 01 primary, 37, FR): thin and slow while valve 37 holds a trickle,
    // dotted and still while the controller has armed the bypass but the valve is closed.
    for (const track of TRACKS.filter((entry) => entry.bypass)) {
      const trunk = track.circuit === "primary";
      const moving = trunk ? model.primaryMoving : Boolean(model.dhwPrimary);
      for (const node of this._trackNodes?.get(track.id) || []) {
        this._toggle(node, "is-bypass", trunk ? bypassOnly : model.bypassFlow);
        this._toggle(node, "is-armed", model.bypassArmed && !moving);
      }
    }
    // Exchanger fog shows heat moving through a face: the heating exchanger while its primary branch is
    // open (hot at the top), the DHW exchanger while tapping or during a bypass flow (hot at the bottom).
    const heatFog = this._refs["fog-heat"];
    const dhwFog = this._refs["fog-dhw"];
    this._toggle(heatFog, "is-on", Boolean(model.heatPrimary));
    this._toggle(dhwFog, "is-on", model.waterMoving);
    this._toggle(dhwFog, "is-warm", !model.waterMoving && model.bypassFlow);
    const first = (...keys) => keys.map((key) => this._num(key)).find((value) => value !== null) ?? null;
    this._setFog(heatFog, first("fjv_supply", "heating_supply") ?? 60, first("fjv_return", "heating_supply") ?? 35);
    this._setFog(dhwFog, first("dhw_temperature", "fjv_supply") ?? 55, first("cold_water_temperature") ?? 10);

    const pump = this._refs.pump;
    const hasPump = this._configured("pump");
    this._toggle(pump, "is-on", hasPump && Boolean(model.pumpActive));
    this._toggle(pump, "is-off", hasPump && !model.pumpActive);
    const pumpDuration = model.pumpSpeed !== null && model.pumpSpeed > 0 ? `${(3.2 - 2.1 * clamp(model.pumpSpeed / 100, 0, 1)).toFixed(2)}s` : "2.2s";
    if (pump && pump.style.getPropertyValue("--cf-pump-duration") !== pumpDuration) pump.style.setProperty("--cf-pump-duration", pumpDuration);

    for (const id of Object.keys(VALVES)) {
      const node = this._refs[`valve-${id}`];
      if (!node) continue;
      const position = this._valvePosition(id);
      const open = position !== null && position > this._config.valve_threshold;
      const pos = position === null ? 0 : Math.round(position);
      const values = { "--cf-valve-pos": String(pos), "--cf-valve-sweep": `${Math.round(pos * 3.6)}deg`, "--cf-valve-duration": `${(2.8 - 1.8 * clamp(pos / 100, 0, 1)).toFixed(2)}s` };
      for (const [name, value] of Object.entries(values)) if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
      this._toggle(node, "is-open", open);
      this._toggle(node, "is-unknown", position === null);
      this._text(this._refs[`valve-${id}-text`], position === null ? "–" : `${pos}%`);
    }

    this._applyStatusLeds(model);
    const key = model.dhwTap && this._config.dhw_temperature ? "dhw_temperature" : this._config.heating_supply ? "heating_supply" : "fjv_supply";
    this._text(this._refs["mini-title"], model.dhwTap ? "BV" : model.heatingActive ? "VARME" : model.dhwBypass ? "BYPASS" : "STANDBY");
    this._text(this._refs["mini-value"], this._config[key] ? this._format(key, "temperature").replace(" °C", "°").replace(/,\d/, "") : "–");
    this._syncAnimation();
  }

  // SMIL markers and CSS rotations only run while the card is visible and motion is wanted.
  _syncAnimation() {
    const svg = this._refs?.anim;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = Boolean(this._config?.animations) && !this._offscreen && !this._displayOpen && !reduce;
    this._toggle(this._refs?.root, "is-paused", !run);
    if (!svg?.pauseAnimations) return;
    // Reduced motion keeps the arrows visible as a still picture; idle pipes stop the timeline.
    const model = this._model;
    const moving = Boolean(model && (model.primaryMoving || model.heatMoving || model.waterMoving));
    const markers = run && moving;
    if (markers && svg.animationsPaused?.()) svg.unpauseAnimations();
    else if (!markers && !svg.animationsPaused?.()) svg.pauseAnimations();
  }

  _applyStatusLeds(model) {
    const state = (key) => this._config[key] ? this._hass?.states?.[this._config[key]] : null;
    const known = (entity) => entity && !UNAVAILABLE.has(String(entity.state).toLowerCase());
    const live = ["fjv_supply", "dhw_temperature", "heating_supply"].some((key) => known(state(key)));
    const alarms = this._config.alarm_entities
      .map((id) => [id, this._hass?.states?.[id]])
      .filter(([, entity]) => entity && interpretActivity(entity) === true);
    const hasError = alarms.some(([id, entity]) => /fejl|error|failure|critical|kritisk/i.test(id + " " + (entity.attributes?.friendly_name || "")));
    const mode = model.dhwTap ? ["cyan", "Varmt vand aktivt"] :
      model.heatingActive ? ["red", "Varme aktiv"] :
      model.dhwBypass ? ["cyan slow", "Bypass aktiv"] : ["off", "Ingen varme eller varmt vand"];
    const lan = state("lan_status");
    const lanText = String(lan?.state || "").toLowerCase();
    const lanTone = !known(lan) ? "unknown" :
      ["on", "online", "connected", "forbundet"].includes(lanText) ? "green" :
      ["connecting", "opretter forbindelse"].includes(lanText) ? "green fast" : "off";
    const peripheral = state("peripheral_status");
    const outdoor = state("outdoor_temperature");
    const outdoorError = this._config.alarm_entities.some((id) => /outdoor_sensor_failure|udef.*fejl|udetemperatur.*fejl/i.test(id) && interpretActivity(this._hass?.states?.[id]) === true);
    const peripheralTone = known(peripheral)
      ? (interpretActivity(peripheral) === true ? "green" : "off")
      : outdoorError ? "green slow" : known(outdoor) ? "green" : "unknown";
    const leds = {
      power: [live ? "green" : "unknown", live ? "Enhedens data er tilgængelige" : "Strømstatus ikke tilgængelig"],
      fault: [hasError ? "red" : alarms.length ? "yellow" : "off", hasError ? "Enhedsfejl" : alarms.length ? "Advarsel" : "Ingen registreret fejl"],
      mode,
      lan: [lanTone, known(lan) ? "LAN: " + lan.state : "LAN-status ikke tilgængelig"],
      peripheral: [peripheralTone, outdoorError ? "Udendørsføler i alarm" : known(outdoor) ? "Udendørsføler tilsluttet" : "Udendørsfølerstatus ikke tilgængelig"],
    };
    for (const [key, [tone, label]] of Object.entries(leds)) {
      const [color, blink] = tone.split(" ");
      // The same indicator is drawn on the unit illustration and on the controller popup's fascia.
      for (const led of [this._refs[`led-${key}`], this._refs[`pled-${key}`]]) {
        if (!led) continue;
        if (led.dataset.tone !== color) led.dataset.tone = color;
        if (led.dataset.blink !== (blink || "")) led.dataset.blink = blink || "";
        if (led.getAttribute("aria-label") !== label) led.setAttribute("aria-label", label);
      }
    }
  }

  _applyFooter() {
    this.shadowRoot.querySelectorAll("[data-footer]").forEach((el) => {
      const key = el.dataset.footer;
      const kind = key === "power" ? "power" : key === "pressure" ? "pressure" : "temperature";
      this._text(el.querySelector("strong"), this._format(key, kind));
    });
  }

  // ---- "I dag": consumption, price and hourly chart ---------------------------------------------

  _todayEnabled() {
    return this._config.show_today !== false && ["energy_meter", "energy_today", "heating_energy_today", "dhw_energy_today"].some((key) => this._config[key]);
  }

  _todayMeterKey() {
    return this._config.energy_meter ? "energy_meter" : this._config.energy_today ? "energy_today" : null;
  }

  _todayMarkup() {
    if (!this._todayEnabled()) return "";
    // The billing meter (Kamstrup) drives the chart; the Calefa split is shown as an estimate only.
    const meterKey = this._todayMeterKey();
    const meter = Boolean(meterKey);
    const split = this._config.heating_energy_today || this._config.dhw_energy_today;
    const stacked = !meter && split;
    const slots = Array.from({ length: 24 }, (_, hour) => `<g class="cf-hour" data-hour="${hour}"><title></title><rect class="cf-bar-slot" x="${hour * 10 + 1.6}" y="6" width="6.8" height="94"/><rect class="cf-bar cf-bar-heat" x="${hour * 10 + 1.6}" y="100" width="6.8" height="0"/><rect class="cf-bar cf-bar-dhw" x="${hour * 10 + 1.6}" y="100" width="6.8" height="0"/></g>`).join("");
    const stat = (key, label, ref, unit, sub = "") => `<button class="cf-stat" type="button" data-action="more-info" data-key="${key}" ${this._config[key] ? "" : "disabled"}><small>${label}</small><strong><b data-ref="${ref}">–</b><em>${unit}</em></strong>${sub}</button>`;
    return `<section class="cf-today" data-ref="today" aria-label="Forbrug og pris i dag">
      <div class="cf-today-stats">
        ${stat(meterKey || "heating_energy_today", "Forbrug i dag", "today-energy", "kWh", meter ? `<i>Målt · Kamstrup</i>` : "")}
        ${stat(this._config.cost_today ? "cost_today" : "energy_price", "Pris i dag", "today-cost", "kr", `<i data-ref="today-price"></i>`)}
        ${split ? `<div class="cf-stat cf-stat-split"><small>Fordeling · Calefa-estimat</small><span><i class="cf-key cf-key-heat"></i>Varme <b data-ref="today-heat">–</b></span><span><i class="cf-key cf-key-dhw"></i>Varmt vand <b data-ref="today-dhw">–</b></span></div>` : ""}
      </div>
      <div class="cf-chart" role="img" data-ref="today-chart" aria-label="Forbrug pr. time i dag">
        <span class="cf-chart-y" data-ref="today-ymax"></span><span class="cf-chart-r" data-ref="today-cmax"></span>
        <svg viewBox="0 0 240 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="cf-chart-grid" d="M0 6 H240 M0 53 H240 M0 100 H240"/>
          ${slots}
          <path class="cf-cost-area" data-ref="today-area" d=""/>
          <path class="cf-cost-line" data-ref="today-line" d=""/>
          <path class="cf-now-line" data-ref="today-now" d=""/>
        </svg>
        <div class="cf-chart-x">${["00", "06", "12", "18", "24"].map((label, index) => `<span style="left:${index * 25}%">${label}</span>`).join("")}</div>
      </div>
      <div class="cf-chart-legend">${stacked ? `<span><i class="cf-key cf-key-heat"></i>Varme</span><span><i class="cf-key cf-key-dhw"></i>Varmt vand</span>` : `<span><i class="cf-key cf-key-heat"></i>Forbrug pr. time${meter ? " (Kamstrup)" : ""}</span>`}<span><i class="cf-key cf-key-cost"></i>Pris, akkumuleret</span></div>
    </section>`;
  }

  _todayDay(now = Date.now()) {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    return midnight.getTime();
  }

  _applyToday() {
    const section = this._refs.today;
    if (!section) return;
    const now = Date.now();
    const midnight = this._todayDay(now);
    if (this._todayMidnight !== midnight) {
      this._todayMidnight = midnight;
      this._todayRows = {};
      this._todayFetched = 0;
    }
    const live = (key) => this._config[key] ? this._num(key) : null;
    const heat = live("heating_energy_today");
    const dhw = live("dhw_energy_today");
    // A running meter (energy_meter) is turned into today's kWh by subtracting its midnight reading.
    const meterKey = this._todayMeterKey();
    let meter = live("energy_today");
    if (meterKey === "energy_meter") {
      const reading = live("energy_meter");
      const base = todayMeterBase(this._todayRows[this._config.energy_meter]);
      meter = reading !== null && base !== null ? Math.max(0, reading - base) : meter;
    }
    const splitTotal = heat !== null || dhw !== null ? (heat ?? 0) + (dhw ?? 0) : null;
    const total = meter ?? splitTotal;
    const price = live("energy_price");
    const cost = live("cost_today") ?? (total !== null && price !== null ? total * price : null);
    const perKwh = price ?? (cost !== null && total ? cost / total : null);
    this._text(this._refs["today-energy"], total === null ? "–" : this._formatNumber(total, 1));
    this._text(this._refs["today-cost"], cost === null ? "–" : this._formatNumber(cost, 2));
    this._text(this._refs["today-price"], perKwh === null ? "" : `${this._formatNumber(perKwh, 2)} kr/kWh`);
    this._text(this._refs["today-heat"], heat === null ? "–" : `${this._formatNumber(heat, 1)} kWh`);
    this._text(this._refs["today-dhw"], dhw === null ? "–" : `${this._formatNumber(dhw, 1)} kWh`);

    const series = (key, liveTotal) => this._config[key] ? buildTodaySeries(this._todayRows[this._config[key]], liveTotal, midnight, now) : null;
    const meterHours = meterKey ? series(meterKey, meter) : null;
    const heatHours = meterHours ? null : series("heating_energy_today", heat);
    const dhwHours = meterHours ? null : series("dhw_energy_today", dhw);
    const split = !meterHours && Boolean(heatHours || dhwHours);
    const lower = meterHours || heatHours || Array(24).fill(0);
    const upper = split && dhwHours ? dhwHours : Array(24).fill(0);
    const basis = meterHours || lower.map((value, hour) => value + upper[hour]);
    this._renderTodayChart({ lower, upper, basis, perKwh, split, now, midnight });
    this._maybeFetchToday(now);
  }

  _renderTodayChart({ lower, upper, basis, perKwh, split, now, midnight }) {
    const current = clamp(Math.floor((now - midnight) / 3600000), 0, 23);
    const nice = (value) => {
      if (!(value > 0)) return 1;
      const step = 10 ** Math.floor(Math.log10(value));
      return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((factor) => factor * step).find((candidate) => candidate >= value) || value;
    };
    const kwhMax = nice(Math.max(...lower.map((value, hour) => value + upper[hour]), 0.1) * 1.1);
    const scale = (value) => (value / kwhMax) * 94;
    const hours = this._refs["today-chart"].querySelectorAll(".cf-hour");
    hours.forEach((group, hour) => {
      const [title, , heatBar, dhwBar] = group.children;
      const heatHeight = hour > current ? 0 : scale(lower[hour]);
      const dhwHeight = hour > current ? 0 : scale(upper[hour]);
      const set = (bar, y, height) => {
        const values = [y.toFixed(2), height.toFixed(2)];
        if (bar.getAttribute("y") !== values[0]) bar.setAttribute("y", values[0]);
        if (bar.getAttribute("height") !== values[1]) bar.setAttribute("height", values[1]);
      };
      set(heatBar, 100 - heatHeight, heatHeight);
      set(dhwBar, 100 - heatHeight - dhwHeight, dhwHeight);
      this._toggle(group, "is-now", hour === current);
      this._toggle(group, "is-future", hour > current);
      const kwh = lower[hour] + upper[hour];
      const text = hour > current ? "" : `Kl. ${String(hour).padStart(2, "0")}–${String(hour + 1).padStart(2, "0")}: ${this._formatNumber(kwh, 2)} kWh${split ? ` (varme ${this._formatNumber(lower[hour], 2)}, varmt vand ${this._formatNumber(upper[hour], 2)})` : ""}${perKwh !== null ? ` · ${this._formatNumber(kwh * perKwh, 2)} kr` : ""}`;
      this._text(title, text);
    });
    const fraction = clamp((now - midnight) / 3600000 - current, 0, 1);
    let cumulative = 0;
    const points = [[0, 0]];
    for (let hour = 0; hour <= current; hour += 1) {
      cumulative += basis[hour];
      points.push([hour === current ? (hour + fraction) * 10 : (hour + 1) * 10, cumulative]);
    }
    const costMax = perKwh !== null ? nice(cumulative * perKwh * 1.1) : 0;
    const y = (kwh) => (perKwh !== null && costMax ? 100 - ((kwh * perKwh) / costMax) * 94 : 100);
    const line = perKwh !== null ? points.map(([x, kwh], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y(kwh).toFixed(2)}`).join(" ") : "";
    const area = line ? `${line} L${points[points.length - 1][0].toFixed(2)} 100 L0 100 Z` : "";
    for (const [ref, d] of [["today-line", line], ["today-area", area], ["today-now", `M${((current + fraction) * 10).toFixed(2)} 0 V100`]]) {
      if (this._refs[ref] && this._refs[ref].getAttribute("d") !== d) this._refs[ref].setAttribute("d", d);
    }
    this._text(this._refs["today-ymax"], `${this._formatNumber(kwhMax, kwhMax < 10 ? 1 : 0)} kWh`);
    this._text(this._refs["today-cmax"], perKwh !== null ? `${this._formatNumber(costMax, costMax < 10 ? 1 : 0)} kr` : "");
    const total = basis.reduce((sum, value) => sum + value, 0);
    const label = `Forbrug pr. time i dag, i alt ${this._formatNumber(total, 1)} kWh${perKwh !== null ? `, ${this._formatNumber(total * perKwh, 2)} kr` : ""}`;
    if (this._refs["today-chart"].getAttribute("aria-label") !== label) this._refs["today-chart"].setAttribute("aria-label", label);
  }

  // Statistics are only requested while the card is visible and at most every five minutes; the
  // current hour follows the live daily counters in between.
  _maybeFetchToday(now = Date.now()) {
    if (!this._refs.today || !this._hass?.callWS || this._todayLoading) return;
    if (this._offscreen) { this._todayPending = true; return; }
    if (this._todayFetched && now - this._todayFetched < TODAY_REFETCH_MS) return;
    const meterKey = this._todayMeterKey();
    const ids = (meterKey ? [meterKey] : ["heating_energy_today", "dhw_energy_today"]).map((key) => this._config[key]).filter(Boolean);
    if (!ids.length) return;
    const midnight = this._todayMidnight;
    this._todayLoading = true;
    this._todayPending = false;
    this._hass.callWS({ type: "recorder/statistics_during_period", start_time: new Date(midnight).toISOString(), end_time: new Date(now).toISOString(), statistic_ids: ids, period: "5minute", types: ["change", "state"] })
      .then((result) => {
        if (this._todayMidnight !== midnight) return;
        this._todayRows = Object.fromEntries(ids.map((id) => [id, Array.isArray(result?.[id]) ? result[id] : []]));
        this._todayFetched = Date.now();
        this._applyToday();
      })
      .catch(() => { this._todayFetched = Date.now(); })
      .finally(() => { this._todayLoading = false; });
  }

  // ---- Controller popup: state -------------------------------------------------------------

  _resetDisplay() {
    this._frontKey = "bv";
    this._stack = [];
    this._frontEdit = null;
    this._notice = null;
  }

  _entity(map) {
    const id = this._config.display_entities[map] || (ENTITY_KEYS.includes(map) ? this._config[map] : "");
    const state = id ? this._hass?.states?.[id] : null;
    return state ? [id, state] : null;
  }

  _live(state) { return Boolean(state) && !UNAVAILABLE.has(String(state.state ?? "").trim().toLowerCase()); }

  _canEdit(node) {
    const entity = node && this._entity(node.map);
    if (!entity || !this._live(entity[1])) return false;
    const [id, state] = entity;
    if (node.type === "number") return id.startsWith("number.") && [state.state, state.attributes?.min, state.attributes?.max].every((value) => Number.isFinite(Number(value)));
    if (node.type === "select") return id.startsWith("select.") && this._options(node, state).some((option) => option.value === state.state);
    if (node.type === "switch") return id.startsWith("switch.") && ["on", "off"].includes(state.state);
    return false;
  }

  // Controller labels for the options the entity really offers, in the controller's order.
  _options(node, state) {
    if (node.type === "switch") return SWITCH_OPTIONS.map(([label, value]) => ({ label, value }));
    const actual = Array.isArray(state?.attributes?.options) ? state.attributes.options : [];
    const known = (OPTION_LABELS[node.map] || []).flatMap(([label, ...values]) => {
      const value = values.find((candidate) => actual.includes(candidate));
      return value ? [{ label, value }] : [];
    });
    return [...known, ...actual.filter((value) => !known.some((option) => option.value === value)).map((value) => ({ label: value, value }))];
  }

  _activeAlarms() { return this._activeFaults(); }

  _fronts() { return ["bv", "varme", "indstil", ...(this._activeAlarms().length ? ["alarm"] : [])]; }

  _rows(frame) {
    const node = frame.node;
    const children = node.type === "alarms"
      ? this._activeAlarms().map((fault) => ({ type: "alarm", label: fault.label.replace(/^Wavin Calefa\s*\d*\s*/i, ""), fault }))
      : node.children;
    return [...children, { type: "exit", label: "Exit" }];
  }

  _stepNumber(value, direction, attributes) {
    const min = Number(attributes.min), max = Number(attributes.max), step = Number(attributes.step) || 1;
    return Number(clamp(min + (Math.round((value - min) / step) + direction) * step, min, max).toFixed(6));
  }

  // ---- Controller popup: buttons -----------------------------------------------------------

  // UP is +1 and DOWN is -1: UP raises values and moves the selection bar up.
  _displayMove(direction) {
    const frame = this._stack.at(-1);
    if (this._notice) return;
    if (!frame) {
      const node = FRONTS[this._frontKey].value;
      if (node && this._canEdit(node)) {
        const [, state] = this._entity(node.map);
        const current = Number(state.state);
        const value = this._stepNumber(this._frontEdit?.value ?? current, direction, state.attributes);
        this._frontEdit = value === current ? null : { node, value };
      }
    } else if (frame.kind === "menu") {
      frame.index = clamp(frame.index - direction, 0, this._rows(frame).length - 1);
    } else if (frame.kind === "pages") {
      frame.page = clamp(frame.page - direction, 0, this._pages(frame.node.source).length - 1);
    } else if (frame.kind === "edit") {
      if (frame.options) frame.index = (frame.index + direction + frame.options.length) % frame.options.length;
      else {
        const [, state] = this._entity(frame.node.map) || [];
        if (state) frame.value = this._stepNumber(frame.value, direction, state.attributes);
      }
    }
    this._renderDisplay();
  }

  _displayEnter(long = false) {
    const frame = this._stack.at(-1);
    if (this._notice) {
      this._notice = null;
      this._renderDisplay();
      return;
    }
    if (!frame) {
      const front = FRONTS[this._frontKey];
      if (this._frontEdit) {
        if (!long) this._commit(this._frontEdit.node, this._frontEdit.value);
        this._frontEdit = null;
      } else if (long) {
        this._stack.push({ kind: "menu", node: front.menu || { type: "alarms", label: "Alarmer" }, index: 0 });
      } else {
        const fronts = this._fronts();
        this._frontKey = fronts[(fronts.indexOf(this._frontKey) + 1) % fronts.length];
      }
    } else if (frame.kind === "menu" && !long) {
      this._open(this._rows(frame)[frame.index]);
    } else if (frame.kind === "edit" && !long) {
      const value = frame.options ? frame.options[frame.index].value : frame.value;
      if (value !== frame.original) this._commit(frame.node, value);
      this._stack.pop();
    } else {
      this._stack.pop();
    }
    this._renderDisplay();
  }

  _open(item) {
    if (!item || item.type === "exit") { this._stack.pop(); return; }
    if (item.type === "menu") { this._stack.push({ kind: "menu", node: item, index: 0 }); return; }
    if (item.type === "pages") { this._stack.push({ kind: "pages", node: item, page: 0 }); return; }
    if (item.type === "alarm") { this._stack.push({ kind: "info", title: item.label, lines: [item.fault.critical ? "Enhedsfejl" : "Advarsel", item.fault.detail] }); return; }
    if (item.type === "device") { this._stack.push({ kind: "info", title: item.label, lines: ["Kun på enheden", "Ingen styring fra HA"] }); return; }
    if (!this._canEdit(item)) {
      this._stack.push({ kind: "info", title: item.title, lines: ["Kun visning", this._entity(item.map) ? "Værdien er ikke tilgængelig" : "Ingen HA-entitet"] });
      return;
    }
    const [, state] = this._entity(item.map);
    if (item.type === "number") {
      this._stack.push({ kind: "edit", node: item, value: Number(state.state), original: Number(state.state) });
      return;
    }
    const options = this._options(item, state);
    const index = Math.max(0, options.findIndex((option) => option.value === state.state));
    this._stack.push({ kind: "edit", node: item, options, index, original: state.state });
  }

  // Writes only through the entity's own domain service, and only values the entity accepts.
  _commit(node, value) {
    if (!this._canEdit(node) || !this._hass?.callService) return;
    const [id, state] = this._entity(node.map);
    let call = null;
    if (node.type === "number") {
      if (Number.isFinite(value) && value >= Number(state.attributes.min) && value <= Number(state.attributes.max)) call = ["number", "set_value", { entity_id: id, value }];
    } else if (node.type === "select") {
      if (state.attributes.options.includes(value)) call = ["select", "select_option", { entity_id: id, option: value }];
    } else if (node.type === "switch" && ["on", "off"].includes(value)) {
      call = ["switch", value === "on" ? "turn_on" : "turn_off", { entity_id: id }];
    }
    if (!call) return;
    const title = node.title;
    Promise.resolve(this._hass.callService(...call)).catch((error) => {
      if (!this._displayOpen) return;
      this._notice = { kind: "info", title, lines: ["Ikke gemt", String(error?.message || error || "Ukendt fejl").slice(0, 60)] };
      this._renderDisplay();
    });
  }

  // ---- Controller popup: LCD ---------------------------------------------------------------

  _lcdNumber(value, step) {
    const decimals = step && Number(step) < 0.5 ? 1 : Number.isInteger(value) ? 0 : 1;
    return value.toFixed(decimals);
  }

  _lcdValue(node) {
    const entity = this._entity(node.map);
    if (!entity || !this._live(entity[1])) return "--";
    const [, state] = entity;
    if (node.type === "number") {
      const value = Number(state.state);
      return Number.isFinite(value) ? this._lcdNumber(value, state.attributes?.step) : "--";
    }
    const option = this._options(node, state).find((item) => item.value === state.state);
    return (option?.label || state.state).toUpperCase();
  }

  _lcdStatus(key) {
    const entity = this._entity(key);
    return entity && this._live(entity[1]) ? String(entity[1].state).toUpperCase() : "--";
  }

  _readout(code, units) {
    const [key, kind] = READOUTS[code];
    const entity = this._entity(key);
    if (!entity || !this._live(entity[1])) return "--";
    const state = entity[1];
    if (kind === "binary") return interpretActivity(state) ? "1" : "0";
    const value = toNumber(state.state);
    if (value === null) return String(state.state).toUpperCase();
    const unit = state.attributes?.unit_of_measurement || "";
    const decimals = kind === "percent" || (kind === "flow" && (Math.abs(value) >= 10 || Number.isInteger(value))) ? 0 : 1;
    const text = value.toFixed(decimals);
    if (!units) return text;
    if (kind === "temperature") return `${text}°C`;
    if (kind === "percent") return `${text}%`;
    return unit ? `${text} ${unit.replace("L/", "l/")}` : text;
  }

  _pages(source) {
    const spec = STATUS_PAGES[source];
    const codes = spec.grid.filter((code) => this._entity(READOUTS[code][0]));
    const pages = [];
    for (let index = 0; index < codes.length; index += 6) pages.push({ grid: codes.slice(index, index + 6) });
    const rows = (spec.rows || []).filter(([, key]) => this._entity(key));
    for (let index = 0; index < rows.length; index += LCD_ROWS) pages.push({ rows: rows.slice(index, index + LCD_ROWS) });
    return pages.length ? pages : [{ rows: [] }];
  }

  _lcdMarkup() {
    const frame = this._notice || this._stack.at(-1);
    if (!frame) return this._frontLcd();
    if (frame.kind === "menu") return this._menuLcd(frame);
    if (frame.kind === "pages") return this._pagesLcd(frame);
    if (frame.kind === "edit") return this._editLcd(frame);
    return this._infoLcd(frame);
  }

  _railCell(key) {
    if (key === "bv") {
      const entity = this._entity("dhw_setpoint");
      const value = entity && this._live(entity[1]) ? toNumber(entity[1].state) : null;
      return `<span>${value === null ? "--" : `${Math.round(value)}°`}</span>`;
    }
    if (key === "varme") return `<span>${escapeHtml(this._shiftText())}</span>`;
    if (key === "indstil") return `<span>${lcdIcon("gear")}</span>`;
    return `<span>${this._activeAlarms().length ? lcdIcon("warning") : ""}</span>`;
  }

  _shiftText(value) {
    const entity = this._entity("parallel_shift");
    const shift = value ?? (entity && this._live(entity[1]) ? toNumber(entity[1].state) : null);
    return shift === null ? "--" : `${shift > 0 ? "+" : shift < 0 ? "−" : "+"}${Math.abs(shift).toFixed(1)}°`;
  }

  _frontLcd() {
    const key = this._frontKey;
    const order = ["bv", "varme", "indstil", "alarm"];
    const rail = [1, 2, 3].map((offset) => this._railCell(order[(order.indexOf(key) + offset) % order.length])).join("");
    const pending = this._frontEdit ? " is-pending" : "";
    let main;
    if (key === "bv") {
      const entity = this._entity("dhw_setpoint");
      const value = this._frontEdit?.value ?? (entity && this._live(entity[1]) ? toNumber(entity[1].state) : null);
      main = `<div class="lcd-front-title">${lcdIcon("bv")}<b>BV</b></div><div class="lcd-front-value"><span>–</span><strong class="lcd-big${pending}">${value === null ? "--" : `${this._lcdNumber(value, entity?.[1]?.attributes?.step)}°`}</strong><span>+</span></div>`;
    } else if (key === "varme") {
      const entity = this._entity("parallel_shift");
      const shift = this._frontEdit?.value ?? (entity && this._live(entity[1]) ? toNumber(entity[1].state) : null);
      const level = shift === null ? 50 : clamp(((shift + 9) / 18) * 100, 0, 100);
      main = `<div class="lcd-front-title">${lcdIcon("varme")}<b>VARME</b></div><div class="lcd-front-value is-shift"><strong class="lcd-big${pending}">${escapeHtml(this._shiftText(shift))}</strong><span class="lcd-thermo" style="--level:${level.toFixed(0)}%"><i></i><b></b></span></div>`;
    } else if (key === "indstil") {
      main = `<div class="lcd-front-center"><b>INDSTIL.</b>${lcdIcon("gear", "is-large")}</div>`;
    } else {
      const count = this._activeAlarms().length;
      main = `<div class="lcd-front-center"><b>ALARM</b>${lcdIcon("warning", "is-large")}<small>${count} aktiv${count === 1 ? "" : "e"}</small></div>`;
    }
    return `<div class="lcd-front" data-screen="front-${key}"><div class="lcd-front-main">${main}</div><div class="lcd-rail">${rail}</div></div>`;
  }

  _menuLcd(frame) {
    const rows = this._rows(frame);
    const start = clamp(frame.index - 1, 0, Math.max(0, rows.length - LCD_ROWS));
    const visible = rows.slice(start, start + LCD_ROWS).map((item, offset) => {
      let value = "";
      if (["number", "select", "switch"].includes(item.type)) {
        value = `[${escapeHtml(this._lcdValue(item))}]`;
        if (!this._canEdit(item)) value = `${lcdIcon("lock", "is-lock")}${value}`;
      } else if (item.status) value = `[${escapeHtml(this._lcdStatus(item.status))}]`;
      else if (item.type === "device") value = lcdIcon("lock", "is-lock");
      const selected = start + offset === frame.index;
      return `<div class="lcd-row${selected ? " is-selected" : ""}" data-row="${escapeHtml(item.label)}"${item.type === "device" ? ' data-readonly=""' : ""}><span>${escapeHtml(item.label)}</span><em>${value}</em></div>`;
    }).join("");
    const thumb = 100 / Math.max(rows.length, 1);
    return `<div class="lcd-menu" data-screen="menu"><header class="lcd-head"><b>${escapeHtml(frame.node.label)}</b><span>${frame.index + 1}/${rows.length}</span></header><div class="lcd-list"><div class="lcd-rows">${visible}</div><div class="lcd-scroll"><i class="is-up"></i><span><b style="top:${(frame.index * thumb).toFixed(2)}%;height:${thumb.toFixed(2)}%"></b></span><i class="is-down"></i></div></div></div>`;
  }

  _pagesLcd(frame) {
    const source = frame.node.source;
    const pages = this._pages(source);
    frame.page = clamp(frame.page, 0, pages.length - 1);
    const page = pages[frame.page];
    const units = Boolean(STATUS_PAGES[source].units);
    const title = `${frame.node.label} ${frame.page + 1}/${pages.length}`;
    const cells = page.grid
      ? `<div class="lcd-grid${units ? " has-divider" : ""}">${page.grid.map((code) => `<div><span>${code}${units ? "" : ":"}</span><strong>${escapeHtml(this._readout(code, units))}</strong></div>`).join("")}</div>`
      : `<div class="lcd-lines">${page.rows.length ? page.rows.map(([label, key]) => `<div><span>${escapeHtml(label)}:</span><strong>${escapeHtml(this._lcdStatus(key))}</strong></div>`).join("") : "<p>Ingen data</p>"}</div>`;
    const head = units
      ? `<header class="lcd-head"><b>${escapeHtml(title)}</b></header>`
      : `<header class="lcd-rule"><i></i><b>${escapeHtml(title)}</b><i></i></header>`;
    const prev = frame.page > 0 ? '<i class="lcd-tri is-left"></i>' : "<i></i>";
    const next = frame.page < pages.length - 1 ? '<i class="lcd-tri is-right"></i>' : "<i></i>";
    return `<div class="lcd-pages${units ? " is-sensors" : ""}" data-screen="pages">${head}${cells}<footer class="lcd-exit">${prev}<b>Exit</b>${next}</footer></div>`;
  }

  _editLcd(frame) {
    const [, state] = this._entity(frame.node.map) || [];
    if (frame.options) {
      const option = frame.options[frame.index];
      const label = option.value === frame.original ? "Behold" : "Sæt";
      return `<div class="lcd-edit is-options" data-screen="edit"><header class="lcd-head"><b>${escapeHtml(frame.node.title)}</b><span>${frame.index + 1}/${frame.options.length}</span></header><strong class="lcd-big">${escapeHtml(option.label)}</strong><footer class="lcd-bar"><i class="lcd-tri is-left"></i><b>${label}</b><i class="lcd-tri is-right"></i></footer></div>`;
    }
    const unit = state?.attributes?.unit_of_measurement || "";
    const text = `${this._lcdNumber(frame.value, state?.attributes?.step)}${unit === "°C" ? "°C" : unit ? ` ${unit}` : ""}`;
    return `<div class="lcd-edit" data-screen="edit"><header class="lcd-head"><b>${escapeHtml(frame.node.title)}</b></header><strong class="lcd-big">${escapeHtml(text)}</strong><footer class="lcd-bar"><span>–</span><b>${frame.value === frame.original ? "Behold" : "Sæt"}</b><span>+</span></footer></div>`;
  }

  _infoLcd(frame) {
    return `<div class="lcd-info" data-screen="info"><header class="lcd-head"><b>${escapeHtml(frame.title)}</b></header><div class="lcd-message">${frame.lines.map((line, index) => `<${index ? "small" : "b"}>${escapeHtml(line)}</${index ? "small" : "b"}>`).join("")}</div><footer class="lcd-exit"><i></i><b>Exit</b><i></i></footer></div>`;
  }

  _displayHint() {
    const frame = this._notice || this._stack.at(-1);
    if (!frame) return this._frontEdit ? "ENTER: sæt værdi · hold ENTER: fortryd" : FRONTS[this._frontKey].value ? "▲▼ justér · ENTER: næste · hold ENTER: menu" : "ENTER: næste · hold ENTER: menu";
    if (frame.kind === "menu") return "▲▼ vælg · ENTER: åbn · hold ENTER: tilbage";
    if (frame.kind === "pages") return "▲▼ side · ENTER: exit";
    if (frame.kind === "edit") return "▲▼ ændr · ENTER: sæt/behold · hold ENTER: fortryd";
    return "ENTER: exit";
  }

  _renderDisplay() {
    const lcd = this._refs.lcd;
    if (!lcd) return;
    const markup = this._lcdMarkup();
    if (this._lcdHtml !== markup || this._lcdEl !== lcd) {
      lcd.innerHTML = markup;
      this._lcdHtml = markup;
      this._lcdEl = lcd;
    }
    this._text(this._refs["display-hint"], this._displayHint());
  }

  _openDisplay() {
    if (!this._refs.modal || this._displayOpen) return;
    this._closeFaults();
    this._resetDisplay();
    this._displayOpen = true;
    this._refs.modal.hidden = false;
    this._renderDisplay();
    this._syncAnimation();
    window.addEventListener("keydown", this._onKeydown);
    this._refs.device?.focus({ preventScroll: true });
  }

  _closeDisplay() {
    clearTimeout(this._pressTimer);
    this._press = null;
    this._displayOpen = false;
    this._resetDisplay();
    if (this._refs.modal) this._refs.modal.hidden = true;
    if (!this._faultOpen) window.removeEventListener("keydown", this._onKeydown);
    this._syncAnimation();
  }

  // Touch keys: a held ENTER becomes a long press once the threshold passes, like the controller;
  // held UP/DOWN repeat while a value is being edited.
  _handlePointer(event) {
    if (event.type === "pointerdown") {
      const key = event.composedPath().find((node) => node?.dataset?.ctl);
      if (!key || !this._displayOpen || (event.button ?? 0) > 0) return;
      event.preventDefault();
      key.setPointerCapture?.(event.pointerId);
      clearTimeout(this._pressTimer);
      this._press = { ctl: key.dataset.ctl, el: key, long: false };
      key.classList.add("is-pressed");
      if (key.dataset.ctl === "enter") {
        this._pressTimer = setTimeout(() => {
          if (!this._press) return;
          this._press.long = true;
          this._displayEnter(true);
        }, LONG_PRESS_MS);
      } else {
        const direction = key.dataset.ctl === "up" ? 1 : -1;
        const repeat = (delay) => {
          this._pressTimer = setTimeout(() => {
            if (!this._press || !(this._frontEdit || this._stack.at(-1)?.kind === "edit")) return;
            this._displayMove(direction);
            repeat(110);
          }, delay);
        };
        this._displayMove(direction);
        repeat(450);
      }
      return;
    }
    const press = this._press;
    if (!press) return;
    clearTimeout(this._pressTimer);
    this._press = null;
    press.el.classList.remove("is-pressed");
    this._pointerUpAt = Date.now();
    if (event.type === "pointerup" && press.ctl === "enter" && !press.long) this._displayEnter(false);
  }

  // Keyboard or assistive activation of a touch key arrives as a plain click.
  _pressKey(ctl, event) {
    if (event?.detail > 0 && Date.now() - (this._pointerUpAt || 0) < 600) return;
    if (ctl === "enter") this._displayEnter(false);
    else this._displayMove(ctl === "up" ? 1 : -1);
  }

  _activeFaults() {
    return this._config.alarm_entities.flatMap((id) => {
      const state = this._hass?.states?.[id];
      if (interpretActivity(state) !== true) return [];
      const label = state.attributes?.friendly_name || id.split(".")[1].replaceAll("_", " ");
      const detail = ["message", "description", "problem", "reason", "error"]
        .map((key) => state.attributes?.[key]).find((value) => typeof value === "string" && value.trim());
      const critical = /fejl|error|failure|fault|critical|kritisk/i.test(`${id} ${label}`);
      return [{ id, label, detail: detail || (critical ? "Aktiv fejl i Calefa-enheden" : "Aktiv advarsel fra Calefa-enheden"), critical }];
    });
  }

  _renderFaults() {
    const faults = this._activeFaults();
    const button = this._refs["fault-button"];
    if (button) {
      button.hidden = faults.length === 0;
      button.dataset.severity = faults.some((fault) => fault.critical) ? "error" : "warning";
    }
    this._text(this._refs["fault-count"], faults.length ? String(faults.length) : "");
    if (!this._faultOpen) return;
    const list = this._refs["fault-list"];
    if (!list) return;
    const signature = faults.map((fault) => fault.id).join("|");
    if (list.dataset.ids !== signature) {
      list.dataset.ids = signature;
      list.replaceChildren();
      if (!faults.length) {
        const empty = document.createElement("p");
        empty.textContent = "Ingen aktive fejl eller advarsler.";
        list.appendChild(empty);
      } else for (const fault of faults) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "cf-fault-row";
        row.dataset.action = "fault-more-info";
        row.dataset.entityId = fault.id;
        row.innerHTML = '<ha-icon icon="mdi:alert-outline"></ha-icon><span><strong></strong><small></small></span><ha-icon icon="mdi:chevron-right"></ha-icon>';
        list.appendChild(row);
      }
    }
    faults.forEach((fault, index) => {
      const row = list.children[index];
      if (!row) return;
      row.dataset.severity = fault.critical ? "error" : "warning";
      this._text(row.querySelector("strong"), fault.label);
      this._text(row.querySelector("small"), fault.detail);
    });
  }

  _openFaults() {
    if (!this._refs["fault-modal"] || !this._activeFaults().length) return;
    this._closeDisplay();
    this._faultOpen = true;
    this._refs["fault-modal"].hidden = false;
    this._renderFaults();
    window.addEventListener("keydown", this._onKeydown);
    this._refs["fault-panel"]?.focus({ preventScroll: true });
  }

  _closeFaults() {
    this._faultOpen = false;
    if (this._refs["fault-modal"]) this._refs["fault-modal"].hidden = true;
    if (!this._displayOpen) window.removeEventListener("keydown", this._onKeydown);
  }

  _openLegacyPopup() {
    // Keep the detailed controls and all consumption cards inside this card's Info flow.
    // The popup owner is mounted lazily and stays hidden in the dashboard.
    if (this._config?.popup_card && customElements.get("ha-fjernvarme-house-card-v2")) {
      if (!this._popupCard) {
        const owner = document.createElement("ha-fjernvarme-house-card-v2");
        owner.style.display = "none";
        owner.setConfig(this._config.popup_card);
        owner.hass = this._hass;
        this.shadowRoot.appendChild(owner);
        this._popupCard = owner;
      }
      this._popupCard._openDetailsPopup();
      this._decorateLegacyPopup(this._popupCard, "Styring");
      return;
    }
    // Compatibility with dashboards that have not migrated their popup config.
    const root = this.getRootNode?.() || document;
    const stack = [root, document];
    const seen = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      if (node !== this && node.localName === "ha-fjernvarme-house-card-v2" && node._config?.details_title === "Calefa styring" && typeof node._openDetailsPopup === "function") {
        node._openDetailsPopup();
        this._decorateLegacyPopup(node, "Styring");
        return;
      }
      if (node.shadowRoot) stack.push(node.shadowRoot);
      if (node.children) for (const child of node.children) stack.push(child);
    }
  }

  _decorateLegacyPopup(card, active) {
    const panel = card._detailsPopupEl?.querySelector?.('[role="dialog"]');
    if (!panel || panel.querySelector(".cf-legacy-tabs")) return;
    const bar = document.createElement("nav");
    bar.className = "cf-legacy-tabs";
    bar.setAttribute("aria-label", "Calefa visning");
    bar.style.cssText = "display:flex;gap:6px;flex:0 0 auto;padding:8px 60px 8px 10px;background:var(--card-background-color,#1c2630);z-index:2";
    for (const [label, open] of [["Styring", () => card._openDetailsPopup()], ["Forbrug", () => card._openCardsPopup(0)]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-current", label === active ? "page" : "false");
      button.style.cssText = `min-height:36px;padding:4px 14px;border:1px solid ${label === active ? "#5bc7e8" : "#526775"};border-radius:10px;background:${label === active ? "#23526a" : "#1b2b35"};color:#f0f8fb;font:700 13px system-ui;cursor:pointer`;
      button.addEventListener("click", () => { open(); this._decorateLegacyPopup(card, label); });
      bar.appendChild(button);
    }
    panel.insertBefore(bar, panel.lastElementChild);
  }

  _handleClick(event) {
    const target = event.composedPath().find((node) => node?.dataset?.action);
    if (!target) return;
    const action = target.dataset.action;
    if (action === "more-info") {
      const key = target.dataset.key;
      const id = key === "pump" ? (this._config.pump || this._config.pump_speed) : key === "bypass" ? this._config.dhw_active : this._config?.[key];
      if (!id || !this._hass?.states?.[id]) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } }));
    } else if (action === "open-display") this._openDisplay();
    else if (action === "open-faults") this._openFaults();
    else if (action === "close-faults") this._closeFaults();
    else if (action === "fault-more-info") {
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: target.dataset.entityId } }));
    }
    else if (action === "open-legacy-popup") this._openLegacyPopup();
    else if (action === "close-display") this._closeDisplay();
    else if (action === "display-key") this._pressKey(target.dataset.ctl, event);
  }

  _handleKeydown(event) {
    if (this._faultOpen) {
      if (event.key === "Escape") { event.preventDefault(); this._closeFaults(); }
      return;
    }
    if (!this._displayOpen) return;
    if (event.key === "Escape") { event.preventDefault(); this._closeDisplay(); }
    if (event.key === "ArrowUp") { event.preventDefault(); this._displayMove(1); }
    if (event.key === "ArrowDown") { event.preventDefault(); this._displayMove(-1); }
    if (event.key === "Enter") { event.preventDefault(); this._displayEnter(event.shiftKey); }
    if (event.key === "Backspace") { event.preventDefault(); this._displayEnter(true); }
  }
}

class HaCalefaFlowCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>:host{display:block;padding:12px 0;color:var(--primary-text-color)}label{display:block;margin-bottom:6px;font-weight:600}select{box-sizing:border-box;width:100%;min-height:40px;padding:7px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:inherit}p{margin:7px 0;color:var(--secondary-text-color);font-size:12px}</style><label for="integration">Calefa-integration</label><select id="integration"><option value="">Søg automatisk</option></select><p>Ved én integration forbindes kortet automatisk. Vælg her, hvis du har flere.</p>`;
    this._select = this.shadowRoot.querySelector("select");
    this._select.addEventListener("change", () => {
      const config = { ...this._config };
      if (this._select.value) config.calefa_entry = this._select.value;
      else delete config.calefa_entry;
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config } }));
    });
  }
  setConfig(config) { this._config = config; this._select.value = config.calefa_entry || ""; }
  set hass(hass) {
    if (!hass?.connection || this._connection === hass.connection) return;
    this._connection = hass.connection;
    calefaRegistry(hass).then((rows) => {
      if (this._connection !== hass.connection) return;
      const entries = calefaEntries(rows);
      this._select.replaceChildren(new Option("Søg automatisk", ""), ...entries.map((id) => {
        const first = rows.find((row) => row.config_entry_id === id && row.entity_id?.startsWith("sensor."));
        return new Option(`${first?.entity_id?.split(".")[1]?.split("_").slice(0, 3).join(" ") || "Calefa"} (${id.slice(0, 8)})`, id);
      }));
      this._select.value = this._config?.calefa_entry || "";
      this.shadowRoot.querySelector("p").textContent = entries.length > 1
        ? "Flere Calefa-integrationer fundet. Vælg den, som kortet skal vise."
        : entries.length === 1 ? "Én Calefa-integration fundet. Kortet forbinder automatisk."
          : "Ingen Calefa-integration fundet endnu.";
    }).catch(() => { this.shadowRoot.querySelector("p").textContent = "Integrationslisten kunne ikke indlæses."; });
  }
}
if (!customElements.get("ha-calefa-flow-card-editor")) customElements.define("ha-calefa-flow-card-editor", HaCalefaFlowCardEditor);

const CALEFA_STYLES = `
  :host{display:block;container:calefa-card / inline-size;--cf-supply:#ff7a2f;--cf-return:#3f95ff;--cf-heat:#ff9a3c;--cf-heat-return:#5cb8ff;--cf-dhw:#ff4f5a;--cf-cold:#35d3ea;--cf-bypass:#b88cff;--cf-ok:#35df9c;--cf-off:#ff5463;--cf-muted:rgba(191,211,226,.72);--cf-text:#f2f7fa;--cf-line:rgba(255,255,255,.09)}
  *{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}button:focus-visible{outline:2px solid #49bdff;outline-offset:2px}
  ha-card{position:relative;display:block;overflow:hidden;border:1px solid rgba(145,177,199,.16);border-radius:var(--ha-card-border-radius,24px);background:radial-gradient(90% 55% at 50% 40%,rgba(43,95,125,.26),transparent 70%),linear-gradient(155deg,#0b1924,#102535 54%,#07121b);color:var(--cf-text);box-shadow:0 18px 52px rgba(0,0,0,.3)}
  .cf{padding:clamp(8px,1.8cqw,22px) clamp(6px,1.8cqw,22px) calc(clamp(8px,1.4cqw,16px) + env(safe-area-inset-bottom,0px));min-width:0}
  [data-tone="supply"]{--tone:var(--cf-supply)}[data-tone="return"]{--tone:var(--cf-return)}[data-tone="heat"]{--tone:var(--cf-heat)}[data-tone="heat-return"]{--tone:var(--cf-heat-return)}[data-tone="dhw"]{--tone:var(--cf-dhw)}[data-tone="cold"]{--tone:var(--cf-cold)}[data-tone="bypass"]{--tone:var(--cf-bypass)}[data-tone="component"]{--tone:var(--cf-ok)}

  /* One composition for every width: tiles | unit | tiles, scaled with the card. */
  .cf-main{position:relative;display:grid;grid-template-columns:minmax(0,18fr) minmax(0,64fr) minmax(0,18fr);column-gap:clamp(8px,2.4cqw,30px);align-items:stretch;max-width:980px;margin:0 auto}
  .cf-stage{min-width:0}.cf-stage-box{position:relative;width:100%;aspect-ratio:775/1295;container:cf-stage / inline-size}
  .cf-photo,.cf-layer{position:absolute;inset:0;width:100%;height:100%}.cf-photo{display:block;object-position:center}.cf-layer{overflow:visible;pointer-events:none}
  .cf-side{position:relative;min-width:0;z-index:4}.cf-block{position:absolute;top:var(--y);width:100%;max-width:100%;transform:translateY(-50%)}.cf-left .cf-block{right:0}.cf-right .cf-block{left:0}.cf-side.is-placed .cf-block{transform:none}

  .cf-tile:not([data-tone]){--tone:#6f8795}.cf-tile{display:flex;align-items:center;gap:clamp(4px,.7cqw,8px);width:100%;min-width:0;min-height:44px;padding:clamp(4px,.55cqw,7px) clamp(6px,.85cqw,10px);border:1px solid color-mix(in srgb,var(--tone) 42%,transparent);border-radius:clamp(9px,1.3cqw,15px);background:linear-gradient(135deg,color-mix(in srgb,var(--tone) 11%,transparent),rgba(5,13,20,.86) 72%);box-shadow:0 8px 20px rgba(0,0,0,.22);text-align:left;cursor:pointer;transition:border-color .4s,box-shadow .4s}
  .cf-tile.is-on{border-color:color-mix(in srgb,var(--tone) 78%,transparent);box-shadow:0 0 18px color-mix(in srgb,var(--tone) 18%,transparent),0 8px 20px rgba(0,0,0,.22)}
  .cf-tile>ha-icon{--mdc-icon-size:clamp(14px,1.9cqw,22px);flex:0 0 auto;color:var(--tone)}
  .cf-tile>span{display:flex;flex-direction:column;min-width:0}
  .cf-tile small{overflow:hidden;color:#dbe6ec;font-size:clamp(10px,1.15cqw,13px);line-height:1.2;white-space:nowrap;text-overflow:ellipsis}
  .cf-tile strong{display:flex;align-items:baseline;color:var(--tone);font-size:clamp(15px,2cqw,22px);line-height:1.08;white-space:nowrap}.cf-tile strong b{font-weight:850;font-variant-numeric:tabular-nums}.cf-tile strong em{margin-left:2px;color:var(--cf-muted);font-size:clamp(9px,1cqw,12px);font-style:normal;font-weight:500}
  .cf-tile i{overflow:hidden;color:var(--cf-muted);font-size:clamp(10px,1cqw,11px);font-style:normal;line-height:1.2;white-space:nowrap;text-overflow:ellipsis}.cf-tile i:empty{display:none}
  .cf-tile[data-tone="component"]:not(.is-on){--tone:#7e8f99}.cf-tile[data-tone="bypass"]:not(.is-on):not(.is-armed){--tone:#7e8f99}.cf-tile[data-tone="component"] strong{color:#f2f7fa}.cf-tile.is-unavailable{opacity:.5}
  .cf-pair{--ring:clamp(40px,4.8cqw,54px);display:grid;grid-template-rows:1fr 1fr;row-gap:calc(var(--ring) * .78)}.cf-pair.is-single{grid-template-rows:1fr;row-gap:0}.cf-pair .cf-tile{position:relative;z-index:1}.cf-pair:not(.is-single):before{content:"";position:absolute;left:50%;top:20%;bottom:20%;width:2px;transform:translateX(-50%);background:linear-gradient(var(--cf-supply),var(--cf-return));opacity:.7}.cf-right .cf-pair:not(.is-single):before{background:linear-gradient(var(--cf-heat),var(--cf-heat-return))}

  /* ΔT ring on the seam between supply and return. */
  .cf-delta{--cf-delta-tone:#7b99a8;position:absolute;left:50%;top:50%;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;width:var(--ring);height:var(--ring);border:clamp(2px,.3cqw,3px) solid var(--cf-delta-tone);border-radius:50%;background:radial-gradient(circle,#15313d 0%,#0a1d29 74%);box-shadow:0 0 0 3px rgba(9,26,36,.9),0 0 14px color-mix(in srgb,var(--cf-delta-tone) 35%,transparent);color:#e7f7fa;transform:translate(-50%,-50%);pointer-events:none}
  .cf-delta small{font-size:clamp(9px,.95cqw,11px);font-weight:800;line-height:1}.cf-delta strong{display:flex;align-items:baseline;font-size:clamp(10px,1.2cqw,13px);line-height:1.1;white-space:nowrap}.cf-delta strong em{margin-left:1px;font-size:.85em;font-style:normal}
  .cf-delta.is-good{--cf-delta-tone:var(--cf-ok)}.cf-delta.is-bad{--cf-delta-tone:#ff685a}.cf-delta.is-muted{opacity:.55}
  .cf-delta:not(.is-muted):after{content:"";position:absolute;inset:-6px;border:1px solid var(--cf-delta-tone);border-radius:50%;opacity:.35;animation:cf-pulse 2.8s ease-in-out infinite}

  /* Callouts */
  .cf-callouts{position:absolute;inset:0;z-index:3;width:100%;height:100%;overflow:visible;pointer-events:none}
  .cf-callouts g{color:var(--tone)}.cf-callouts g.is-idle{color:#7e8f99}.cf-callouts path{fill:none;stroke:currentColor;stroke-width:1.3;opacity:.85}.cf-callout-ring{fill:rgba(4,16,24,.9);stroke:currentColor;stroke-width:2}.cf-callout-dot{fill:currentColor}

  /* Flow tracks follow the pipes in the illustration. */
  .cf-track path{fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0;transition:opacity .45s ease}
  .cf-track{color:var(--tone)}.cf-track-halo{stroke:currentColor;stroke-width:26}.cf-track-core{stroke:currentColor;stroke-width:9}.cf-track-hot{stroke:#fff6ec;stroke-width:2.6}
  .cf-glow .cf-track.is-on .cf-track-halo{opacity:.3}.cf-glow .cf-track.is-on .cf-track-core{opacity:.95}.cf-glow .cf-track.is-on .cf-track-hot{opacity:.55}
  /* Bypass: a thin trickle while valve 37 is slightly open; dotted and still while only armed. */
  .cf-glow .cf-track.is-on.is-bypass .cf-track-halo{opacity:.14}.cf-glow .cf-track.is-on.is-bypass .cf-track-core{opacity:.72;stroke-width:5}.cf-glow .cf-track.is-on.is-bypass .cf-track-hot{opacity:.5;stroke-width:1.8;stroke-dasharray:3 11}
  .cf-glow .cf-track.is-armed .cf-track-core{opacity:.9;stroke-width:4.6;stroke-dasharray:.1 12}
  .cf-glow{filter:drop-shadow(0 0 6px rgba(255,140,70,.12))}
  .cf-markers{display:none}.cf-markers.is-on{display:inline}.cf-marker{fill:#fff;opacity:.92}

  /* Exchanger fog: a soft coloured layer on the copper from the hot end to the cooled end, with slow wisps
     moving the way the district heating water flows (up through the DHW exchanger, down through the heating one). */
  .cf-fogs{position:absolute;inset:0;pointer-events:none}
  .cf-fog{position:absolute;overflow:hidden;opacity:0;transition:opacity 1.1s ease;--fog-hot:#ff6a36;--fog-mid:#ffc857;--fog-cold:#36b4ff;--fog-dir:to top}
  .cf-fog[data-fog="heat"]{--fog-dir:to bottom}
  .cf-fog:before{content:"";position:absolute;inset:0;background:linear-gradient(var(--fog-dir),var(--fog-hot) 4%,var(--fog-mid) 52%,var(--fog-cold) 98%);opacity:.5}
  .cf-fog i{position:absolute;left:-30%;top:0;width:160%;height:200%;background-repeat:repeat-y;background-size:100% 50%;animation:cf-fog-drift 18s linear infinite paused}
  .cf-fog i:first-of-type{background-image:radial-gradient(34% 9% at 30% 16%,rgba(255,255,255,.34),transparent 72%),radial-gradient(28% 7% at 70% 38%,rgba(255,255,255,.26),transparent 72%),radial-gradient(38% 10% at 42% 62%,rgba(255,255,255,.3),transparent 72%),radial-gradient(26% 7% at 76% 84%,rgba(255,255,255,.22),transparent 72%)}
  .cf-fog i:last-of-type{animation-duration:29s;opacity:.75;background-image:radial-gradient(30% 8% at 64% 12%,rgba(255,255,255,.24),transparent 72%),radial-gradient(40% 11% at 26% 44%,rgba(255,255,255,.28),transparent 72%),radial-gradient(30% 8% at 70% 76%,rgba(255,255,255,.22),transparent 72%)}
  .cf-fog[data-fog="heat"] i{animation-direction:reverse;animation-duration:9s}
  .cf-fog[data-fog="heat"] i:first-of-type{background-image:radial-gradient(34% 30% at 32% 32%,rgba(255,255,255,.34),transparent 72%),radial-gradient(28% 26% at 72% 68%,rgba(255,255,255,.26),transparent 72%)}
  .cf-fog[data-fog="heat"] i:last-of-type{animation-duration:15s;background-image:radial-gradient(40% 32% at 62% 40%,rgba(255,255,255,.26),transparent 72%)}
  .cf-fog.is-on,.cf-fog.is-warm{opacity:1}.cf-fog.is-on i,.cf-fog.is-warm i{animation-play-state:running}
  .cf-fog.is-warm:before{background:linear-gradient(var(--fog-dir),var(--fog-hot),transparent 70%);opacity:.42}.cf-fog.is-warm i{opacity:.4;animation-duration:32s}

  /* Pump: three arrows running in the bezel band of the pump head, blue and turning when on, red and still when off. */
  .cf-pump{position:absolute;z-index:5;pointer-events:none;color:#7d909b}.cf-pump.is-on{color:#3aa8ff}.cf-pump.is-off{color:var(--cf-off)}
  .cf-pump svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .cf-pump-rail{fill:none;stroke:currentColor;stroke-width:7.5;opacity:.13}
  .cf-pump-face{fill:none;stroke:currentColor;stroke-width:.9;opacity:.3}
  .cf-pump-rim{fill:none;stroke:currentColor;stroke-width:1.4;opacity:.55;transition:opacity .4s}.cf-pump.is-on .cf-pump-rim{opacity:.85}
  .cf-pump-arc{fill:none;stroke-width:6.5;stroke-linecap:round}.cf-pump-glow{fill:none;stroke-width:15;stroke-linecap:round;opacity:.28}
  .cf-pump-head{fill:currentColor;stroke:currentColor;stroke-width:1.2;stroke-linejoin:round}
  .cf-pump:not(.is-on) .cf-pump-glow{display:none}
  .cf-pump.is-on .cf-pump-rotor{animation:cf-spin var(--cf-pump-duration,2.2s) linear infinite}

  /* Valve rings: arc length is the opening, the dot travels through the open part. */
  .cf-valve-track{fill:rgba(4,14,20,.35);stroke:rgba(190,210,220,.28);stroke-width:5}
  .cf-valve-level{fill:none;stroke:#7e8f99;stroke-width:6;stroke-linecap:round;stroke-dasharray:var(--cf-valve-pos,0) 100;transition:stroke-dasharray .9s ease,stroke .4s}
  .cf-valve.is-open .cf-valve-level{stroke:var(--cf-ok);filter:drop-shadow(0 0 4px rgba(53,223,156,.6))}
  .cf-valve-runner{transform-box:fill-box;transform-origin:center;opacity:0}.cf-valve-dot{fill:#eafff6}
  .cf-valve.is-open .cf-valve-runner{animation:cf-valve-run var(--cf-valve-duration,2s) ease-in-out infinite}
  .cf-valve-pct{fill:#e9f6f1;font:800 22px system-ui,sans-serif;paint-order:stroke;stroke:#06131b;stroke-width:5px}.cf-valve:not(.is-open) .cf-valve-pct{fill:#aab8bf}

  /* Display overlay and status LEDs */
  .cf-lcd-title{fill:#1b3440;font:800 10px system-ui,sans-serif;letter-spacing:.04em}.cf-lcd-value{fill:#142b36;font:800 24px system-ui,sans-serif}
  .cf-display-led{fill:#6f8288;stroke:#b9c4c6;stroke-width:.6;opacity:.45}.cf-display-led[data-tone="green"]{fill:#27f05b;stroke:#caffd5;opacity:1}.cf-display-led[data-tone="red"]{fill:#fb2558;stroke:#ffd8e1;opacity:1}.cf-display-led[data-tone="cyan"]{fill:#52dcff;stroke:#e2faff;opacity:1}.cf-display-led[data-tone="yellow"]{fill:#ffd24d;stroke:#fff4cb;opacity:1}.cf-display-led[data-tone="unknown"]{opacity:.15}.cf-display-led[data-blink="slow"]{animation:cf-led 2.5s steps(1,end) infinite}.cf-display-led[data-blink="fast"]{animation:cf-led .7s steps(1,end) infinite}

  .cf-display-hit{position:absolute;z-index:6;left:32.9%;top:4.6%;width:34.2%;height:14.4%;border:0;border-radius:10px;background:transparent;cursor:pointer}
  .cf-display-hit ha-icon{position:absolute;right:-8px;top:-8px;display:grid;place-items:center;--mdc-icon-size:clamp(12px,1.6cqw,18px);width:clamp(22px,3cqw,32px);height:clamp(22px,3cqw,32px);border:1px solid rgba(95,210,255,.6);border-radius:50%;background:#0a2939;color:#68d9ff;box-shadow:0 5px 16px rgba(0,0,0,.35)}
  .cf-pump-hit{position:absolute;z-index:6;border:0;border-radius:50%;background:transparent;cursor:pointer}
  /* Square info button centred between the display and the right edge of the black hood. */
  .cf-info{position:absolute;z-index:6;left:82.3%;top:10.8%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:max(44px,12.4%);aspect-ratio:1;padding:0;border:1px solid rgba(95,200,235,.55);border-radius:clamp(8px,1.1cqw,12px);background:linear-gradient(160deg,rgba(14,48,64,.94),rgba(5,22,32,.94));color:#9fe6ff;box-shadow:0 6px 16px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.08);font-size:clamp(10px,2.1cqw,14px);font-weight:800;letter-spacing:.03em;transform:translate(-50%,-50%);cursor:pointer}
  .cf-info ha-icon{--mdc-icon-size:clamp(15px,3.6cqw,26px)}.cf-info:hover{background:linear-gradient(160deg,#124a61,#0a2c3d)}
  .cf-fault{position:absolute;z-index:7;left:17.7%;top:10.8%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:max(44px,12.4%);aspect-ratio:1;padding:0;border:1px solid #f6b950;border-radius:clamp(8px,1.1cqw,12px);background:linear-gradient(160deg,#513612ef,#251b12f2);color:#ffd783;box-shadow:0 0 18px #ffb43b40,inset 0 1px 0 #fff3;font-size:clamp(10px,2.1cqw,14px);font-weight:800;transform:translate(-50%,-50%);cursor:pointer}.cf-fault[data-severity="error"]{border-color:#ff6b68;background:linear-gradient(160deg,#5c2424ed,#2b171af2);color:#ffb5b2;box-shadow:0 0 20px #ff534a55}.cf-fault ha-icon{--mdc-icon-size:clamp(17px,3.8cqw,28px)}.cf-fault b{position:absolute;right:2px;top:2px;display:grid;place-items:center;min-width:15px;height:15px;padding:0 3px;border-radius:50%;background:#f7c654;color:#261a10;font-size:9px}.cf-fault[data-severity="error"] b{background:#ff6963;color:#fff}.cf-fault:hover{filter:brightness(1.14)}
  .cf-fault-modal{position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:max(16px,env(safe-area-inset-top,0px)) 12px max(16px,env(safe-area-inset-bottom,0px))}.cf-fault-backdrop{position:absolute;inset:0;background:#071019c9;backdrop-filter:blur(5px)}.cf-fault-panel{position:relative;display:flex;flex-direction:column;width:min(100%,520px);max-height:100%;overflow:hidden;border:1px solid #b85b55;border-radius:18px;background:linear-gradient(145deg,#253441,#101d27);box-shadow:0 24px 65px #000a;color:#f3f7fa;outline:none}.cf-fault-panel header{display:flex;align-items:center;gap:10px;padding:15px 16px;border-bottom:1px solid #ffffff20}.cf-fault-panel header>ha-icon{--mdc-icon-size:26px;color:#ff8175}.cf-fault-panel header strong{flex:1;font-size:18px}.cf-fault-panel header button{width:36px;height:36px;border:1px solid #ffffff35;border-radius:50%;background:#ffffff12;color:#fff;font-size:24px;cursor:pointer}.cf-fault-list{display:grid;gap:8px;padding:14px;overflow:auto}.cf-fault-list p{margin:4px 0;color:#b8cbd4}.cf-fault-row{display:flex;align-items:center;gap:10px;width:100%;min-height:62px;padding:10px;border:1px solid #e4a75b80;border-radius:12px;background:#ffffff0b;color:#f2f7fa;text-align:left;cursor:pointer}.cf-fault-row[data-severity="error"]{border-color:#f46e6c99}.cf-fault-row>ha-icon:first-child{--mdc-icon-size:22px;color:#f4c568}.cf-fault-row[data-severity="error"]>ha-icon:first-child{color:#ff7773}.cf-fault-row span{display:flex;flex:1;flex-direction:column;min-width:0;gap:3px}.cf-fault-row strong{font-size:13px;line-height:1.25}.cf-fault-row small{color:#b6c9d1;font-size:11px;line-height:1.3}.cf-fault-row>ha-icon:last-child{--mdc-icon-size:17px;color:#9db4c1}
  .cf-ports{position:relative;height:clamp(14px,2cqw,22px);margin-top:-1.2%}
  .cf-ports span{position:absolute;top:0;color:var(--tone);font-size:clamp(10px,1.15cqw,13px);font-weight:800;letter-spacing:.04em;line-height:1;transform:translateX(-50%)}

  .cf-footer{display:flex;max-width:1000px;margin:clamp(6px,1.2cqw,14px) auto 0;padding-top:clamp(6px,1cqw,12px);border-top:1px solid var(--cf-line)}
  .cf-footer button{display:flex;align-items:center;gap:8px;flex:1 1 0;min-width:0;min-height:44px;padding:4px clamp(6px,1.2cqw,14px);border:0;border-left:1px solid var(--cf-line);background:none;text-align:left;cursor:pointer}.cf-footer button:first-child{border-left:0}
  .cf-footer ha-icon{--mdc-icon-size:clamp(16px,2cqw,22px);color:#b8ccd8}.cf-footer span{min-width:0}.cf-footer small,.cf-footer strong{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.cf-footer small{color:var(--cf-muted);font-size:clamp(10px,1.1cqw,12px)}.cf-footer strong{font-size:clamp(12px,1.4cqw,16px)}

  @keyframes cf-spin{to{transform:rotate(360deg)}}
  @keyframes cf-fog-drift{to{transform:translate3d(0,-50%,0)}}
  @keyframes cf-pulse{50%{transform:scale(1.12);opacity:.1}}
  @keyframes cf-led{50%{opacity:.12}}
  @keyframes cf-valve-run{0%{transform:rotate(0deg);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:rotate(var(--cf-valve-sweep,0deg));opacity:0}}
  .cf.is-paused .cf-anim *,.cf.is-paused .cf-delta:after,.cf.is-paused .cf-pump-rotor,.cf.is-paused .cf-fog i{animation-play-state:paused!important}
  .cf.no-anim .cf-anim *,.cf.no-anim .cf-delta:after,.cf.no-anim .cf-pump-rotor,.cf.no-anim .cf-fog i{animation:none!important}
  @media(prefers-reduced-motion:reduce){.cf-anim *,.cf-delta:after,.cf-modal *,.cf-pump-rotor,.cf-fog i{animation:none!important;transition:none!important}}

  @container cf-stage (max-width:360px){.cf-minor{display:none}}
  @container calefa-card (max-width:520px){.cf-tile>ha-icon{display:none}.cf-tile i{display:none}.cf-tile strong em{font-size:9px}.cf-delta small{display:none}.cf-delta strong em{display:none}.cf-footer button{gap:5px}.cf-footer ha-icon{display:none}}
  @container calefa-card (max-width:520px){.cf-main{grid-template-columns:minmax(0,20fr) minmax(0,60fr) minmax(0,20fr)}}
  @container calefa-card (max-width:360px){.cf-main{column-gap:6px}.cf-tile{padding:4px}}
  /* Controller popup: the Calefa II V / DHW 212 V ITC fascia, measured on the controller photo (672 x 480). */
  .cf-modal{position:fixed;inset:0;z-index:999998;display:flex;align-items:center;justify-content:center;padding:max(14px,env(safe-area-inset-top,0px)) 12px max(14px,env(safe-area-inset-bottom,0px));overflow:auto}
  .cf-modal-backdrop{position:fixed;inset:0;background:rgba(3,9,14,.8);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  .ctl-wrap{position:relative;width:min(100%,640px,calc((100vh - 120px) * 1.4));width:min(100%,640px,calc((100dvh - 120px) * 1.4));margin:auto;padding-top:50px;outline:none}
  .ctl-close{position:absolute;top:0;right:0;display:grid;place-items:center;width:40px;height:40px;padding:0;border:1px solid rgba(255,255,255,.28);border-radius:50%;background:rgba(18,30,38,.9);color:#f2f6f8;cursor:pointer}.ctl-close svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}.ctl-close:hover{background:#243844}
  .ctl-hint{margin:12px 0 0;color:#c2d0d7;font:600 12px/1.35 system-ui,sans-serif;text-align:center}
  .ctl-device{position:relative;container:ctl / inline-size;aspect-ratio:672/480;border-radius:3.2% / 4.5%;background:radial-gradient(130% 100% at 28% 8%,#f5f6f5,#e6e8e7 52%,#d7dad9);box-shadow:0 26px 60px rgba(0,0,0,.55),0 5px 12px rgba(0,0,0,.3),inset 0 2px 0 rgba(255,255,255,.95),inset 0 -4px 7px rgba(0,0,0,.15),inset -3px 0 5px rgba(0,0,0,.06),inset 3px 0 4px rgba(255,255,255,.6);color:#2f3435;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
  .ctl-logo{position:absolute;left:81.4%;top:6.6%;display:grid;place-items:center;width:14.4%;height:5.2%;border:.42cqw solid #414647;border-radius:99px;color:#414647;font:900 3cqw/1 "Arial Rounded MT Bold","Helvetica Rounded","Nunito","Varela Round",Arial,sans-serif;letter-spacing:.03em}
  .ctl-lcd{position:absolute;left:23.4%;top:12.3%;box-sizing:border-box;width:54%;height:42%;padding:1.3cqw 1.7cqw 1.1cqw;overflow:hidden;border:.3cqw solid #97a09e;border-radius:.5cqw;background:linear-gradient(172deg,#dbe2e0,#c5cecb 70%,#bec8c5);box-shadow:inset 0 .7cqw 1.4cqw rgba(38,55,50,.3),inset 0 -.2cqw .4cqw rgba(255,255,255,.35),0 0 0 .55cqw #d0d3d2,0 .25cqw 0 .6cqw rgba(255,255,255,.7);color:#131818;font-family:"Roboto Condensed","Arial Narrow","Liberation Sans Narrow","Nimbus Sans Narrow",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:4.2cqw;line-height:1.12;text-shadow:.1cqw .12cqw 0 rgba(19,24,24,.16)}
  .ctl-lcd:before,.ctl-lcd:after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none}
  .ctl-lcd:before{background:linear-gradient(158deg,rgba(255,255,255,.22),transparent 38%)}
  .ctl-lcd:after{background-image:linear-gradient(rgba(214,223,220,.2) 1px,transparent 1px),linear-gradient(90deg,rgba(214,223,220,.2) 1px,transparent 1px);background-size:3px 3px}
  .ctl-lcd>div{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;min-height:0}
  .lcd-icon{flex:none;width:1em;height:1em}.lcd-icon.is-lock{width:.78em;height:.78em;opacity:.85}.lcd-icon.is-large{width:12cqw;height:12cqw}
  .lcd-head{display:flex;flex:none;align-items:baseline;justify-content:space-between;gap:1.2cqw;padding:0 .4cqw .5cqw;border-bottom:.32cqw solid currentColor;font-size:4.5cqw;font-weight:700}
  .lcd-head b{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.lcd-head span{flex:none;font-size:4.1cqw}
  .lcd-list{display:flex;flex:1;gap:1cqw;min-height:0;padding-top:.8cqw}
  .lcd-rows{display:grid;flex:1;grid-template-rows:repeat(3,minmax(0,1fr));min-width:0}
  .lcd-row{display:flex;align-items:center;justify-content:space-between;gap:1cqw;min-width:0;padding:0 .9cqw;font-weight:500}
  .lcd-row span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.lcd-row em{display:flex;flex:none;align-items:center;gap:.5cqw;font-style:normal;white-space:nowrap}
  .lcd-row.is-selected{background:#131818;color:#d3dbd8;text-shadow:none}
  .lcd-scroll{display:flex;flex:none;flex-direction:column;align-items:center;gap:.5cqw;width:2.4cqw}
  .lcd-scroll i{width:0;height:0;border-right:1.05cqw solid transparent;border-left:1.05cqw solid transparent}.lcd-scroll i.is-up{border-bottom:1.5cqw solid currentColor}.lcd-scroll i.is-down{border-top:1.5cqw solid currentColor}
  .lcd-scroll span{position:relative;flex:1;box-sizing:border-box;width:1.9cqw;border:.28cqw solid currentColor}.lcd-scroll span b{position:absolute;right:0;left:0;min-height:1cqw;background:currentColor}
  .lcd-rule{display:flex;flex:none;align-items:center;gap:1.4cqw;font-size:4.5cqw;font-weight:700}.lcd-rule b{white-space:nowrap}.lcd-rule i{flex:1;height:1.5cqw;background:repeating-linear-gradient(currentColor 0 .28cqw,transparent .28cqw .6cqw)}
  .lcd-grid{display:grid;flex:1;grid-template-columns:1fr 1fr;grid-auto-rows:minmax(0,1fr);column-gap:3cqw;min-height:0;padding:.5cqw .4cqw 0}
  .lcd-grid div,.lcd-lines div{display:flex;align-items:center;justify-content:space-between;gap:1cqw;min-width:0;white-space:nowrap}.lcd-grid strong,.lcd-lines strong{overflow:hidden;font-weight:500;text-overflow:ellipsis}
  .lcd-grid.has-divider{padding-top:.8cqw;background:linear-gradient(currentColor,currentColor) center / .28cqw 100% no-repeat}
  .lcd-lines{display:grid;flex:1;grid-template-rows:repeat(3,minmax(0,1fr));min-height:0;padding:.3cqw .4cqw 0}.lcd-lines p{margin:auto}
  .lcd-exit{display:grid;flex:none;grid-template-columns:3cqw 1fr 3cqw;align-items:center;justify-items:center;font-size:5cqw;font-weight:700;line-height:1.15}
  .is-sensors .lcd-exit{grid-template-columns:0 1fr 3cqw;justify-items:start;padding:.3cqw .4cqw 0;border-top:.32cqw solid currentColor}
  .lcd-tri{width:0;height:0;border-top:1.5cqw solid transparent;border-bottom:1.5cqw solid transparent}.lcd-tri.is-right{border-left:2cqw solid currentColor}.lcd-tri.is-left{border-right:2cqw solid currentColor}
  .lcd-big{display:grid;flex:1;place-items:center;min-height:0;overflow:hidden;font-size:11cqw;font-weight:700;letter-spacing:-.02em;line-height:1;white-space:nowrap}
  .is-options .lcd-big{font-size:7.6cqw}
  .lcd-bar{display:grid;flex:none;grid-template-columns:1fr 2fr 1fr;align-items:center;justify-items:center;padding-top:.3cqw;border-top:.32cqw solid currentColor;font-size:4.8cqw;font-weight:700}
  .lcd-bar b{width:100%;border-right:.32cqw solid currentColor;border-left:.32cqw solid currentColor;text-align:center}.lcd-bar span{font-size:6cqw;line-height:1}
  .is-options .lcd-bar{border-top:0}.is-options .lcd-bar b{border:0}
  .lcd-message{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:.8cqw;min-height:0;text-align:center}.lcd-message b{font-size:4.8cqw}.lcd-message small{max-width:100%;overflow:hidden;font-size:3.6cqw;text-overflow:ellipsis}
  .ctl-lcd>.lcd-front{flex-direction:row;border:.32cqw solid currentColor}
  .lcd-front-main{display:flex;flex:1;flex-direction:column;min-width:0}
  .lcd-front-title{display:flex;align-items:center;gap:1.4cqw;padding:.8cqw 1.2cqw 0;font-size:5.2cqw}.lcd-front-title .lcd-icon{width:6.2cqw;height:6.2cqw}.lcd-front-title b{font-weight:600}
  .lcd-front-value{display:flex;flex:1;align-items:center;justify-content:space-around;min-height:0;padding:0 1cqw}.lcd-front-value>span{font-size:6cqw;font-weight:500}.lcd-front-value .lcd-big{flex:none;padding:0 .8cqw}
  .lcd-front-value.is-shift{justify-content:center;gap:3.5cqw}.lcd-front-value.is-shift .lcd-big{font-size:8.6cqw}
  .lcd-big.is-pending{background:#131818;color:#d3dbd8;text-shadow:none;animation:lcd-blink 1.1s steps(1,end) infinite}
  .lcd-thermo{position:relative;width:3cqw;height:12cqw;box-sizing:border-box;border:.4cqw solid currentColor;border-radius:1.5cqw 1.5cqw 2cqw 2cqw}.lcd-thermo b{position:absolute;right:.4cqw;bottom:.4cqw;left:.4cqw;height:max(1cqw,calc(var(--level) - .8cqw));border-radius:.6cqw;background:currentColor}
  .lcd-thermo i{position:absolute;bottom:calc(var(--level) - 1.1cqw);left:calc(100% + .7cqw);width:0;height:0;border-top:1.1cqw solid transparent;border-right:1.6cqw solid currentColor;border-bottom:1.1cqw solid transparent}
  .lcd-front-center{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:1cqw}.lcd-front-center b{font-size:5.4cqw;font-weight:600}.lcd-front-center small{font-size:4cqw}
  .lcd-rail{display:grid;flex:none;grid-template-rows:repeat(3,minmax(0,1fr));width:12.5cqw;border-left:.32cqw solid currentColor}
  .lcd-rail span{display:grid;place-items:center;font-size:4.4cqw;font-weight:600;white-space:nowrap}.lcd-rail span+span{border-top:.32cqw solid currentColor}.lcd-rail .lcd-icon{width:5cqw;height:5cqw}
  .ctl-leds{position:absolute;left:22.15%;top:62.6%;display:grid;grid-template-columns:repeat(5,1fr);width:61.5%;height:12.5%}
  .ctl-led{display:flex;flex-direction:column;align-items:center;justify-content:space-between}
  .ctl-led svg{width:4.4cqw;height:4.4cqw;fill:none;stroke:#34393a;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  .ctl-led i{width:2.2cqw;height:2.2cqw;border-radius:50%;background:radial-gradient(circle at 35% 30%,#8b9090,#4f5455 70%);box-shadow:inset 0 .15cqw .3cqw rgba(0,0,0,.45),0 .12cqw 0 rgba(255,255,255,.8);transition:background .3s,box-shadow .3s}
  .ctl-led i[data-tone="green"]{background:radial-gradient(circle at 40% 35%,#e9ffe9,#3df06a 45%,#16b53f);box-shadow:0 0 .9cqw .25cqw rgba(61,240,106,.55),0 0 0 .3cqw rgba(61,240,106,.22)}
  .ctl-led i[data-tone="red"]{background:radial-gradient(circle at 40% 35%,#ffe1e4,#ff2d44 45%,#c20a22);box-shadow:0 0 .9cqw .25cqw rgba(255,45,68,.55),0 0 0 .3cqw rgba(255,45,68,.2)}
  .ctl-led i[data-tone="cyan"]{background:radial-gradient(circle at 40% 35%,#e6fbff,#3ad7ff 45%,#0a9ec4);box-shadow:0 0 .9cqw .25cqw rgba(58,215,255,.55),0 0 0 .3cqw rgba(58,215,255,.2)}
  .ctl-led i[data-tone="yellow"]{background:radial-gradient(circle at 40% 35%,#fff9df,#ffd23d 45%,#d49a00);box-shadow:0 0 .9cqw .25cqw rgba(255,210,61,.55),0 0 0 .3cqw rgba(255,210,61,.2)}
  .ctl-led i[data-blink="slow"]{animation:cf-led 2.5s steps(1,end) infinite}.ctl-led i[data-blink="fast"]{animation:cf-led .7s steps(1,end) infinite}
  .ctl-usb{position:absolute;left:5%;top:76%;display:grid;place-items:center;width:14%;height:18%;border-radius:1.5cqw;background:linear-gradient(150deg,#eef0ef,#dcdfde);box-shadow:inset 0 0 0 .25cqw #b6bbba,inset .4cqw .5cqw .7cqw rgba(255,255,255,.85),inset -.3cqw -.4cqw .6cqw rgba(0,0,0,.08),0 .35cqw .7cqw rgba(0,0,0,.14)}
  .ctl-usb:before{content:"";position:absolute;left:-.9cqw;top:24%;width:1.6cqw;height:52%;border-radius:.5cqw;background:linear-gradient(90deg,#d9dcdb,#eceeed);box-shadow:inset 0 0 0 .22cqw #b6bbba}
  .ctl-usb svg{width:48%;fill:none;stroke:#a2a8a7;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}.ctl-usb .is-fill{fill:#a2a8a7;stroke:none}
  .ctl-keys{position:absolute;left:23.8%;top:80.4%;display:grid;grid-template-columns:32.7fr 34.6fr 32.7fr;width:59.2%;height:12.2%;border-radius:99px;background:linear-gradient(#d4d7d6,#e2e4e3 70%);box-shadow:inset 0 .55cqw 1.1cqw rgba(0,0,0,.2),inset 0 -.25cqw .35cqw rgba(255,255,255,.75),0 .3cqw 0 rgba(255,255,255,.9),0 -.15cqw 0 rgba(0,0,0,.05)}
  .ctl-keys button{position:relative;display:grid;place-items:center;min-width:0;height:100%;padding:0;border:0;border-radius:0;background:transparent;color:#2c3132;cursor:pointer;touch-action:manipulation;-webkit-touch-callout:none;transition:background .12s}
  .ctl-keys button:after{content:"";position:absolute;inset:-9px 0}.ctl-keys button:first-child{border-radius:99px 0 0 99px}.ctl-keys button:last-child{border-radius:0 99px 99px 0}
  .ctl-keys button+button{box-shadow:inset .15cqw 0 0 rgba(0,0,0,.16),inset .32cqw 0 0 rgba(255,255,255,.55)}
  .ctl-keys button svg{width:4.6cqw;height:4.6cqw;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.ctl-keys button .is-fill{fill:currentColor;stroke:none}
  .ctl-keys button:hover{background:rgba(0,0,0,.035)}.ctl-keys button.is-pressed,.ctl-keys button:active{background:rgba(0,0,0,.1);box-shadow:inset 0 .4cqw .8cqw rgba(0,0,0,.18)}
  .ctl-keys button:focus-visible{outline:.45cqw solid #1f8fd6;outline-offset:-.6cqw}
  @keyframes lcd-blink{50%{background:transparent;color:inherit}}
  @media(prefers-reduced-motion:reduce){.lcd-big.is-pending,.ctl-led i{animation:none!important}}

  /* "I dag": consumption, price and an hourly chart at the bottom of the card. */
  .cf-today{max-width:980px;margin:clamp(8px,1.4cqw,16px) auto 0;padding-top:clamp(8px,1.2cqw,14px);border-top:1px solid var(--cf-line)}
  .cf-today-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:clamp(6px,1cqw,12px)}
  .cf-stat{display:flex;flex-direction:column;justify-content:center;min-width:0;min-height:44px;padding:clamp(5px,.8cqw,9px) clamp(7px,1cqw,12px);border:1px solid var(--cf-line);border-radius:clamp(9px,1.2cqw,13px);background:rgba(5,13,20,.55);color:var(--cf-text);text-align:left;cursor:pointer}
  .cf-stat:disabled{cursor:default}.cf-stat small{overflow:hidden;color:var(--cf-muted);font-size:clamp(10px,1.1cqw,12px);white-space:nowrap;text-overflow:ellipsis}
  .cf-stat strong{display:flex;align-items:baseline;gap:3px;font-size:clamp(16px,2.1cqw,24px);line-height:1.1;white-space:nowrap}.cf-stat strong b{font-weight:850;font-variant-numeric:tabular-nums}.cf-stat strong em{color:var(--cf-muted);font-size:clamp(10px,1.1cqw,13px);font-style:normal;font-weight:600}
  .cf-stat>i{color:var(--cf-muted);font-size:clamp(10px,1cqw,11px);font-style:normal}.cf-stat>i:empty{display:none}
  .cf-stat:nth-child(1) strong b{color:#ffb070}.cf-stat:nth-child(2) strong b{color:#f5c451}
  .cf-stat-split{cursor:default;gap:2px}.cf-stat-split span{display:flex;align-items:center;gap:5px;overflow:hidden;font-size:clamp(11px,1.15cqw,13px);white-space:nowrap}.cf-stat-split b{margin-left:auto;font-variant-numeric:tabular-nums}
  .cf-key{display:inline-block;flex:0 0 auto;width:9px;height:9px;border-radius:3px;background:#ff9a3c}.cf-key-dhw{background:#ff4f5a}.cf-key-cost{width:14px;height:3px;border-radius:2px;background:#f5c451}
  .cf-chart{position:relative;height:clamp(96px,17cqw,160px);margin:clamp(10px,1.4cqw,16px) 0 18px;padding:0 clamp(34px,4.6cqw,48px)}
  .cf-chart svg{display:block;width:100%;height:100%;overflow:visible}
  .cf-chart-grid{fill:none;stroke:rgba(255,255,255,.08);stroke-width:1;vector-effect:non-scaling-stroke}
  .cf-bar-slot{fill:rgba(255,255,255,.028)}.cf-bar{transition:y .5s ease,height .5s ease}.cf-bar-heat{fill:#ff9a3c}.cf-bar-dhw{fill:#ff4f5a}
  .cf-hour.is-now .cf-bar{opacity:.72}.cf-hour.is-now .cf-bar-slot{fill:rgba(111,214,255,.1)}.cf-hour.is-future .cf-bar-slot{fill:rgba(255,255,255,.015)}
  .cf-cost-line{fill:none;stroke:#f5c451;stroke-width:2.2;stroke-linejoin:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 3px rgba(245,196,81,.55))}.cf-cost-area{fill:rgba(245,196,81,.09)}
  .cf-now-line{fill:none;stroke:rgba(111,214,255,.55);stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}
  .cf-chart-y,.cf-chart-r{position:absolute;top:0;color:var(--cf-muted);font-size:clamp(10px,1cqw,11px);line-height:1;white-space:nowrap}.cf-chart-y{left:0}.cf-chart-r{right:0;color:#f5c451}
  .cf-chart-x{position:absolute;left:clamp(34px,4.6cqw,48px);right:clamp(34px,4.6cqw,48px);bottom:-17px;height:14px}.cf-chart-x span{position:absolute;color:var(--cf-muted);font-size:clamp(10px,1cqw,11px);line-height:1;transform:translateX(-50%)}
  .cf-chart-legend{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;color:var(--cf-muted);font-size:clamp(10px,1cqw,12px)}.cf-chart-legend span{display:flex;align-items:center;gap:5px}
  @container calefa-card (max-width:520px){.cf-today-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.cf-stat-split{grid-column:1/-1;flex-direction:row;flex-wrap:wrap;align-items:center;gap:2px 14px}.cf-stat-split small{flex:1 0 100%}.cf-stat-split span{font-size:12px}.cf-stat-split b{margin-left:4px}.cf-stat strong{font-size:17px}}
  @media(prefers-reduced-motion:reduce){.cf-bar{transition:none}}
`;

if (!customElements.get("ha-calefa-flow-card")) customElements.define("ha-calefa-flow-card", HaCalefaFlowCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "ha-calefa-flow-card")) {
  window.customCards.push({ type: "ha-calefa-flow-card", name: "HA Calefa Flow Card", description: "Responsive animated Calefa II flow card", preview: false, documentationURL: "https://github.com/MRDonnii/ha-smart-home-cards/blob/main/docs/CALEFA_FLOW_CARD.md" });
}
console.info(`%c HA CALEFA FLOW CARD %c v${CALEFA_FLOW_CARD_VERSION} `, "background:#087ea4;color:#fff;font-weight:700;padding:2px 5px", "background:#102631;color:#8fe7ff;padding:2px 5px");
