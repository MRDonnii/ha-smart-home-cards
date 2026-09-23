const CALEFA_FLOW_CARD_VERSION = "0.6.0";
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
};
const CALEFA_ALARM_KEYS = new Set([
  "warning_low_energy", "warning_pressure_high", "error_pressure_critical_low", "warning_pressure_low",
  "dhi_sensor_failure", "dho_sensor_failure", "dhw_motor_failure", "dhw_motor_stuck",
  "dhw_sensor_failure", "dcw_sensor_failure", "no_secondary_pressure", "pressure_sensor_failure",
  "flow_sensor_failure", "itc_hs_sensor_failure", "itc_hr_sensor_failure", "outdoor_sensor_failure",
  "itc_motor_failure", "itc_htco_error",
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
  const controls = Object.fromEntries(Object.entries(CALEFA_CONTROL_KEYS)
    .map(([key, unique]) => [key, found.get(unique)]).filter(([, id]) => /^(number|select|switch)\./.test(id || "")));
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
};

// Menu paths and labels follow Wavin's Calefa II V installation guide, pp. 8-20.
// Only explicitly mapped number/select entities can be written; service flows stay read-only.
const DISPLAY_FRONTS = ["bv", "itc", "settings", "alarm"];
const menu = (label, children) => ({ label, children });
const value = (label, key, kind = "temperature", writable = false) => ({ label, key, kind, writable });
const choice = (label, options, writable = false) => ({ label, options, writable });
const service = (label, children) => ({ label, children, service: true });
const dayMenu = () => menu("Planlæg", [
  menu("Ugeplan", [menu("Se tidsplan", []), service("Tilføj periode", [value("Starttid", ""), value("Sluttid", "")]), service("Ryd periode", [value("Starttid", ""), value("Sluttid", "")])]),
  ...["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"].map((day) => menu(day, [menu("Se tidsplan", []), service("Tilføj periode", [value("Starttid", ""), value("Sluttid", "")]), service("Ryd periode", [value("Starttid", ""), value("Sluttid", "")])])),
]);
const MENU_TREE = {
  bv: menu("BV · VARMT VAND", [
    value("Temperatur", "dhw_setpoint", "temperature", true),
    menu("Status", [value("BV føler", "dhw_temperature"), value("Koldtvandsføler", "cold_water_temperature"), value("Flow", "water_flow", "flow"), value("BV ventil", "dhw_valve", "valve")]),
    menu("Bypass", [choice("Mode", ["AUTO", "PLANLÆG", "KOMFORT", "ØKO"], true), dayMenu(), menu("Temperatur", [choice("Type", ["Konstant", "Dynamisk"], true), value("Ønsket temperatur", "", "temperature", true)])]),
  ]),
  itc: menu("VARME · ITC", [
    menu("Status", [value("Varme fremløb", "heating_supply"), value("Varme retur", "heating_return"), value("Pumpe", "pump", "text")]),
    menu("Varmekurve", [menu("Type & værdi", [choice("Type", ["Manuel", "Gulvvarme", "Radiator"], true), value("Hældning", "", "number", true)]), value("Paral-forskyd", "", "temperature", true), value("Min Varme F.", "", "temperature", true), value("Maks Varme F.", "", "temperature", true)]),
    menu("Returbegrænser", [choice("Mode", ["Fra", "Maksimum"], true), value("Maks. retur", "", "temperature", true), value("Forstærkning", "", "number", true)]),
  ]),
  settings: menu("INDSTILLING", [
    menu("BV", [value("Status", "dhw_active", "text")]),
    menu("ITC", [value("Status", "heating_active", "text"), value("Automatisk standby", "", "switch", true), value("Returbegrænser aktiv", "", "switch", true), value("Calefa standby", "", "switch", true), value("Cirkulationspumpe", "", "switch", true)]),
    menu("Rum", [
      choice("Komfortprofil", ["Øko", "Komfort", "Ekstra komfort"], true),
      value("Planlagt skema", "", "switch", true), value("Midlertidig tilstand", "", "switch", true),
      value("Øko temperatur", "", "temperature", true), value("Komforttemperatur", "", "temperature", true),
      value("Ekstra komfort", "", "temperature", true), value("Midlertidig temperatur", "", "temperature", true),
      value("Varighed", "", "number", true),
    ]),
    menu("Programmer", [menu("Temperaturer", [value("Udkobl. temp.", "", "temperature", true)])]),
    menu("Avanceret", [service("Komponenter", [service("Tilmeld", [service("Udendørsføler", [value("Status", "outdoor_temperature")]), service("Termostat", [])]), service("Fjern", []), menu("Exit", [])]), service("BV motorservice", [service("Luk for FJV fors.", []), service("Kør motor retur", []), service("Motor må afmonteres nu", []), service("Er motor genmonteret?", [])]), service("CV motorservice", [service("Luk for FJV fors.", []), service("Kør motor retur", []), service("Motor må afmonteres nu", []), service("Er motor genmonteret?", [])])]),
    menu("Dato og tid", ["År", "Måned", "Dag", "Timer", "Minutter", "Sekunder"].map((label) => value(label, "", "number"))),
    menu("Føler", [value("FJV frem", "fjv_supply"), value("FJV retur", "fjv_return"), value("Varme frem", "heating_supply"), value("Varme retur", "heating_return"), value("BV", "dhw_temperature"), value("Koldt vand", "cold_water_temperature"), value("Ude", "outdoor_temperature"), value("Rum", "room_temperature"), value("Tryk / PRE", "pressure", "pressure")]),
    menu("Exit", []),
  ]),
  alarm: menu("ALARM", [value("Aktuelle alarmer", "", "text")]),
};
const FRONT_VALUES = {
  bv: Object.assign(value("Varmt vand", "dhw_setpoint", "temperature", true), { map: "dhw_setpoint" }),
  itc: Object.assign(value("Parallelforskydning", "", "temperature", true), { map: "parallel_shift" }),
};
MENU_TREE.bv.children[0].map = "dhw_setpoint";
MENU_TREE.bv.children[2].children[0].map = "bypass_mode";
MENU_TREE.bv.children[2].children[2].children[0].map = "bypass_temperature_mode";
MENU_TREE.bv.children[2].children[2].children[1].map = "bypass_temperature";
MENU_TREE.itc.children[1].children[0].children[0].map = "heat_curve_type";
MENU_TREE.itc.children[1].children[0].children[1].map = "heat_curve_slope";
MENU_TREE.itc.children[1].children[1].map = "parallel_shift";
MENU_TREE.itc.children[1].children[2].map = "heat_min_supply";
MENU_TREE.itc.children[1].children[3].map = "heat_max_supply";
MENU_TREE.itc.children[2].children[0].map = "return_limiter_mode";
MENU_TREE.itc.children[2].children[1].map = "heat_max_return";
MENU_TREE.itc.children[2].children[2].map = "return_limiter_gain";
MENU_TREE.settings.children[3].children[0].children[0].map = "summer_shutdown";
for (const [label, key] of [["Komfortprofil","room_profile"],["Planlagt skema","room_schedule"],["Midlertidig tilstand","room_temporary_mode"],["Øko temperatur","eco_temperature"],["Komforttemperatur","comfort_temperature"],["Ekstra komfort","extra_comfort_temperature"],["Midlertidig temperatur","temporary_temperature"],["Varighed","temporary_duration"]]) {
  MENU_TREE.settings.children[2].children.find((item) => item.label === label).map = key;
}
for (const [label, key] of [["Automatisk standby","auto_standby"],["Returbegrænser aktiv","return_enabled"],["Calefa standby","standby"],["Cirkulationspumpe","circulation_pump"]]) {
  MENU_TREE.settings.children[1].children.find((item) => item.label === label).map = key;
}

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
// Hydraulics follow Wavin's principle diagram for the Calefa II V 40/40 (installation guide, Oct. 2025):
// two plate exchangers sit one behind the other. The rear one, whose top shows above the front one,
// is the heating exchanger (02, air vent 49 on its upper port); the large front face is the domestic
// hot water exchanger (01). Where a pipe passes behind another part, `hide` lists the rectangles
// ({x, y, w, h}) or circles ({x, y, r}) that cover it, so glow and arrows disappear behind it.
// Holes of one track must not overlap.
const TRACKS = [
  // District heating supply: FF riser, strainer (53) and the supply tee that feeds both exchangers.
  { id: "ff", circuit: "primary", speed: "primary", tone: "supply", d: "M98.5 1238 V684 Q98.5 668.5 114 668.5 H352" },
  // Supply branch up behind the return manifold and down the diagonal into the heating exchanger's upper port.
  { id: "ff-heat", circuit: "heat-primary", speed: "primary", tone: "supply", d: "M350 646 Q353 610 375 592 L405 563.5 L478 513.8 Q497 500.8 518 499 H537", hide: [{ x: 360, y: 548, w: 56, h: 42 }] },
  // Supply branch over the outer U-bend into the DHW exchanger's lower port.
  { id: "ff-dhw", circuit: "dhw-primary", speed: "primary", tone: "supply", d: "M352 669 Q370 674 390 674 H432 Q455 674 455 697 V915 Q455 938.5 478 938.5 H548" },
  // Heating exchanger return: lower port, behind the U-bends, through the heating valve (22) into the manifold.
  { id: "fr-heat", circuit: "heat-primary", speed: "primary", tone: "return", d: "M442 863.5 H271 Q256 863.5 256 848 V575", hide: [{ x: 242, y: 656, w: 30, h: 26 }] },
  // DHW exchanger return: upper port through the DHW control valve (37) into the manifold.
  { id: "fr-dhw", circuit: "dhw-primary", speed: "primary", tone: "return", d: "M490 574.5 H256" },
  // Return manifold, sensor cross (52) and FR riser, which runs behind the supply line.
  { id: "fr", circuit: "primary", speed: "primary", tone: "return", d: "M256 574.5 H201 Q186.5 574.5 186.5 589 V1238", hide: [{ x: 172, y: 656, w: 30, h: 26 }] },
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
// Callout targets on the drawing, and the side each tile sits on.
const ANCHORS = {
  fjv_supply: [160, 668], fjv_return: [187, 800],
  dhw_valve: [345, 505], heating_valve: [255, 762], pump: [291.9, 987.4],
  heating_supply: [636, 500], heating_return: [486, 876],
  dhw_temperature: [640, 950], cold_water_temperature: [679, 1180],
};
const LAYOUT = {
  left: [["tile", "dhw_valve"], ["pair", "fjv_supply", "fjv_return", "fjv"], ["tile", "heating_valve"], ["tile", "pump"]],
  right: [["tile", "dhw_temperature"], ["pair", "heating_supply", "heating_return", "heating"], ["tile", "cold_water_temperature"]],
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
    this._displayPage = 0;
    this._menuPath = [];
    this._menuIndex = 0;
    this._edit = null;
    this._model = null;
    this._onClick = (event) => this._handleClick(event);
    this._onKeydown = (event) => this._handleKeydown(event);
    this.shadowRoot.addEventListener("click", this._onClick);
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
      animations: config.animations !== false,
      display_entities: config.display_entities && typeof config.display_entities === "object" && !Array.isArray(config.display_entities) ? { ...config.display_entities } : {},
      alarm_entities: Array.isArray(config.alarm_entities) ? config.alarm_entities.filter((id) => typeof id === "string" && id.startsWith("binary_sensor.")) : [],
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

    const heatingActive = typeof explicitHeat === "boolean"
      ? explicitHeat
      : (heatFlow !== null && heatFlow > this._config.flow_threshold) || heatValveOpen === true || pumpActive === true;

    let dhwState = "idle";
    if (explicitDhw === "bypass") dhwState = "bypass";
    else if (explicitDhw === true) dhwState = "active";
    else if (explicitDhw === false) dhwState = "idle";
    else if (waterFlow !== null) dhwState = waterFlow > this._config.flow_threshold ? "active" : "idle";
    else if (dhwValveOpen) dhwState = "active";

    const dhwTap = dhwState === "active";
    const dhwBypass = dhwState === "bypass";
    const heatPrimary = heatValveOpen ?? heatingActive;
    const dhwPrimary = dhwBypass || (dhwValveOpen ?? dhwTap);
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
      dhwPrimary,
      dhwValveOpen,
      dhwValve,
      primary: Boolean(heatPrimary || dhwPrimary),
      primaryMoving: primaryFlow !== null && primaryFlow > this._config.flow_threshold,
      heatMoving: heatFlow !== null && heatFlow > this._config.flow_threshold,
      waterMoving: waterFlow !== null && waterFlow > this._config.flow_threshold,
      pumpActive: pumpActive ?? heatingActive,
      pumpSpeed,
      pumpText,
      cooling: supply !== null && ret !== null ? supply - ret : null,
      heatingDelta: heatSupply !== null && heatReturn !== null ? heatSupply - heatReturn : null,
    };
  }

  _configured(id) {
    if (id === "pump") return Boolean(this._config.pump || this._config.pump_speed);
    return Boolean(this._config[id]);
  }

  _tileMarkup(id) {
    if (!this._configured(id)) return "";
    const metric = METRICS[id];
    return `<button class="cf-tile" type="button" data-metric="${id}" data-tone="${metric.tone}" data-action="more-info" data-key="${id}"><ha-icon icon="${metric.icon}"></ha-icon><span><small>${metric.label}</small><strong><b data-num>–</b><em data-unit></em></strong><i data-sub></i></span></button>`;
  }

  _blockMarkup(spec) {
    const anchorY = (ids) => {
      const ys = ids.filter((id) => this._configured(id)).map((id) => ANCHORS[id][1]);
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
    return tile ? `<div class="cf-block" ${place(ANCHORS[spec[1]][1])}>${tile}</div>` : "";
  }

  _build() {
    if (!this._config) return;
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
    this.shadowRoot.querySelectorAll("[data-circuit]").forEach((el) => {
      const key = el.dataset.circuit;
      if (!this._circuitNodes.has(key)) this._circuitNodes.set(key, []);
      this._circuitNodes.get(key).push(el);
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
    </div>${this._modalMarkup()}</ha-card>`;
  }

  _footerMarkup() {
    if (!this._config.show_footer) return "";
    const items = [["room_temperature", "Bolig", "mdi:home-thermometer-outline"], ["outdoor_temperature", "Ude", "mdi:thermometer"], ["power", "Effekt", "mdi:flash-outline"], ["pressure", "Tryk", "mdi:gauge"]].filter(([key]) => this._config[key]);
    if (!items.length) return "";
    return `<footer class="cf-footer">${items.map(([key, label, icon]) => `<button type="button" data-action="more-info" data-key="${key}" data-footer="${key}"><ha-icon icon="${icon}"></ha-icon><span><small>${label}</small><strong>–</strong></span></button>`).join("")}</footer>`;
  }

  _markersMarkup(track, level) {
    const length = pathLength(track.d);
    const count = Math.max(1, Math.round(length / 54));
    const duration = length / FLOW_SPEEDS[level];
    return Array.from({ length: count }, (_, index) => `<path class="cf-marker" d="M-7 -6.5 L5 0 L-7 6.5 L-3.5 0 Z"><animateMotion path="${track.d}" dur="${duration.toFixed(2)}s" begin="-${((index * duration) / count).toFixed(2)}s" repeatCount="indefinite" rotate="auto"/></path>`).join("");
  }

  _stageMarkup() {
    const clip = (layer, track) => track.hide ? ` clip-path="url(#cf-hide-${layer}-${track.id})"` : "";
    const clips = (layer) => TRACKS.filter((track) => track.hide).map((track) => hideClip(`cf-hide-${layer}-${track.id}`, track.hide)).join("");
    const tracks = TRACKS.map((track) => `<g class="cf-track" data-circuit="${track.circuit}" data-tone="${track.tone}"${clip("g", track)}><path class="cf-track-halo" d="${track.d}"/><path class="cf-track-core" d="${track.d}"/><path class="cf-track-hot" d="${track.d}"/></g>`).join("");
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
      <button class="cf-info" type="button" data-action="open-legacy-popup" aria-label="Info: Calefa styring og forbrug"><ha-icon icon="mdi:information-outline"></ha-icon><span>Info</span></button>`;
  }

  _modalMarkup() {
    return `<div class="cf-modal" data-ref="modal" hidden><div class="cf-modal-backdrop" data-action="close-display"></div><section class="cf-device" role="dialog" aria-modal="true" tabindex="-1" data-ref="device"><div class="cf-device-head"><div><strong>wavin</strong><small>Calefa II V · styring</small></div><button type="button" data-action="close-display" aria-label="Luk display"><ha-icon icon="mdi:close"></ha-icon></button></div><div class="cf-device-face"><div class="cf-screen"><div class="cf-screen-head"><ha-icon data-ref="screen-icon" icon="mdi:water-thermometer"></ha-icon><strong data-ref="screen-title">BV</strong><span data-ref="screen-index">1/4</span></div><div class="cf-screen-body" data-ref="screen-body"></div><div class="cf-screen-hint" data-ref="screen-hint">Langt ENTER: menu</div></div><div class="cf-keys"><button type="button" data-action="display-down" aria-label="Ned"><ha-icon icon="mdi:chevron-down"></ha-icon><span>NED</span></button><button type="button" data-action="display-enter" aria-label="Enter"><ha-icon icon="mdi:keyboard-return"></ha-icon><span>ENTER</span></button><button type="button" data-action="display-up" aria-label="Op"><ha-icon icon="mdi:chevron-up"></ha-icon><span>OP</span></button></div><button class="cf-long-enter" type="button" data-action="display-long-enter" aria-label="Langt Enter">Hold ENTER · menu / tilbage</button></div></section></div>`;
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
    if (this._displayOpen) this._renderDisplay();
  }

  _metricValue(id, model) {
    const metric = METRICS[id];
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
      return { parts: this._split(text), sub: on ? (position !== null && position >= 99 ? "Åben" : "Regulerer") : "Lukket", on, available: this._available(id) };
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
      this._toggle(this._refs.callouts?.querySelector(`[data-callout="${id}"]`), "is-idle", METRICS[id].tone === "component" && !value.on);
      for (const node of nodes) {
        this._text(node.num, value.parts[0]);
        this._text(node.unit, value.parts[1] ? ` ${value.parts[1]}` : "");
        this._text(node.sub, value.sub);
        this._toggle(node.el, "is-on", value.on);
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

  _setMarkerSpeed(speed, level) {
    if (!level || this._markerLevels?.[speed] === level) return;
    this._markerLevels[speed] = level;
    for (const track of TRACKS.filter((entry) => entry.speed === speed)) {
      const group = this.shadowRoot.querySelector(`[data-track="${track.id}"]`);
      if (group) group.innerHTML = this._markersMarkup(track, level);
    }
  }

  _applyDiagram(model) {
    const levels = {
      primary: this._flowLevel(this._num("fjv_flow"), this._unit("fjv_flow")),
      heat: this._flowLevel(this._num("heating_flow"), this._unit("heating_flow")),
      dhw: this._flowLevel(this._num("water_flow"), this._unit("water_flow")),
    };
    this._setMarkerSpeed("primary", levels.primary);
    this._setMarkerSpeed("heat", levels.heat);
    this._setMarkerSpeed("dhw", levels.dhw);
    this._setCircuit("primary", model.primaryMoving);
    this._setCircuit("heat-primary", model.primaryMoving && Boolean(model.heatPrimary));
    this._setCircuit("dhw-primary", model.primaryMoving && Boolean(model.dhwPrimary));
    this._setCircuit("heat", model.heatMoving);
    this._setCircuit("dhw", model.waterMoving);
    // Exchanger fog: the heating exchanger is hot at the top, the DHW exchanger at the bottom.
    const heatFog = this._refs["fog-heat"];
    const dhwFog = this._refs["fog-dhw"];
    this._toggle(heatFog, "is-on", model.heatMoving || (model.primaryMoving && Boolean(model.heatPrimary)));
    this._toggle(dhwFog, "is-on", model.waterMoving);
    this._toggle(dhwFog, "is-warm", !model.waterMoving && model.dhwBypass);
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
      const led = this._refs[`led-${key}`];
      if (!led) continue;
      const [color, blink] = tone.split(" ");
      if (led.dataset.tone !== color) led.dataset.tone = color;
      if (led.dataset.blink !== (blink || "")) led.dataset.blink = blink || "";
      if (led.getAttribute("aria-label") !== label) led.setAttribute("aria-label", label);
    }
  }

  _applyFooter() {
    this.shadowRoot.querySelectorAll("[data-footer]").forEach((el) => {
      const key = el.dataset.footer;
      const kind = key === "power" ? "power" : key === "pressure" ? "pressure" : "temperature";
      this._text(el.querySelector("strong"), this._format(key, kind));
    });
  }

  _derived(name) {
    const model = this._model || this._computeModel();
    if (name === "mode") return model.dhwTap && model.heatingActive ? "Varme + BV" : model.dhwTap ? "Brugsvand" : model.heatingActive ? "Varme" : model.dhwBypass ? "Bypass" : "Standby";
    if (name === "heating") return model.heatingActive ? "Aktiv" : "Standby";
    if (name === "dhw") return model.dhwTap ? "Aktiv" : model.dhwBypass ? "Bypass" : "Standby";
    if (name === "pump") return model.pumpText;
    if (name === "cooling") return model.cooling === null ? "–" : `${this._formatNumber(model.cooling, 1)} °C`;
    if (name === "heatingDelta") return model.heatingDelta === null ? "–" : `${this._formatNumber(model.heatingDelta, 1)} °C`;
    return "–";
  }

  _menuNode() {
    let node = MENU_TREE[this._activeFronts()[this._displayPage] || "bv"];
    for (const index of this._menuPath) node = this._menuChildren(node)[index];
    return node;
  }

  _nodeSupported(node) {
    if (node.service) return false;
    if (node.children) return node.children.some((child) => this._nodeSupported(child));
    if (node.label === "Aktuelle alarmer") return this._config.alarm_entities.some((id) => this._hass?.states?.[id]);
    return Boolean(this._mappedState(node) || (node.key && this._stateObj(node.key)));
  }

  _menuChildren(node) { return (node.children || []).filter((child) => this._nodeSupported(child)); }

  _firstSupportedLeaf(node) {
    if (!node.children) return this._nodeSupported(node) ? node : null;
    for (const child of this._menuChildren(node)) {
      const leaf = this._firstSupportedLeaf(child);
      if (leaf) return leaf;
    }
    return null;
  }

  _activeFronts() {
    return DISPLAY_FRONTS.filter((front) => this._nodeSupported(MENU_TREE[front]) || this._nodeSupported(FRONT_VALUES[front] || {}));
  }

  _mappedState(node) {
    const id = node.map && this._config.display_entities[node.map];
    return id && this._hass?.states?.[id] ? [id, this._hass.states[id]] : null;
  }

  _menuValue(node) {
    if (node.label === "Aktuelle alarmer") {
      const alarms = this._config.alarm_entities.map((id) => this._hass?.states?.[id]).filter(Boolean);
      if (!alarms.length) return "–";
      const active = alarms.filter((state) => interpretActivity(state) === true);
      return active.length ? `${active.length} aktiv${active.length > 1 ? "e" : ""}` : "Ingen alarm";
    }
    const mapped = this._mappedState(node);
    if (mapped) {
      const state = mapped[1];
      if (UNAVAILABLE.has(String(state.state).toLowerCase())) return "–";
      if (node.kind === "switch") return state.state === "on" ? "Til" : state.state === "off" ? "Fra" : "–";
      return node.kind === "temperature" && Number.isFinite(Number(state.state)) ? `${this._formatNumber(Number(state.state), 1)} °C` : String(state.state);
    }
    if (node.key?.startsWith("derived:")) return this._derived(node.key.slice(8));
    if (node.key && this._config[node.key]) return this._format(node.key, node.kind);
    return node.label === "Aktuelle alarmer" ? "Ingen data" : "–";
  }

  _editOptions(node, state) {
    if (!node.options) return [];
    const actual = state.attributes?.options;
    return Array.isArray(actual) && node.options.every((option) => actual.includes(option)) ? node.options : [];
  }

  _canEdit(node) {
    if (!node.writable || node.service) return false;
    const mapped = this._mappedState(node);
    if (!mapped) return false;
    const [id, state] = mapped;
    if (id.startsWith("number.")) return !node.options && Number.isFinite(Number(state.state)) && Number.isFinite(Number(state.attributes?.min)) && Number.isFinite(Number(state.attributes?.max));
    if (id.startsWith("select.")) return Boolean(node.options && this._editOptions(node, state).length);
    if (id.startsWith("switch.")) return node.kind === "switch" && ["on", "off"].includes(state.state);
    return false;
  }

  _renderDisplay() {
    const fronts = this._activeFronts();
    if (this._displayPage >= fronts.length) this._displayPage = 0;
    const front = fronts[this._displayPage] || "bv";
    this._toggle(this._refs["screen-body"]?.parentElement, "is-front", !this._inMenu && !this._edit);
    const node = this._inMenu ? this._menuNode() : MENU_TREE[front];
    this._text(this._refs["screen-title"], node.label);
    this._text(this._refs["screen-index"], this._inMenu ? `${this._menuPath.length + 1} · ${this._menuIndex + 1}/${Math.max(this._menuChildren(node).length, 1)}` : `${this._displayPage + 1}/${Math.max(fronts.length, 1)}`);
    this._refs["screen-icon"]?.setAttribute("icon", { bv: "mdi:water-thermometer", itc: "mdi:radiator", settings: "mdi:cog-outline", alarm: "mdi:alert-circle-outline" }[front]);
    let rows;
    if (this._edit) {
      rows = `<div class="cf-screen-row selected"><span>${escapeHtml(this._edit.node.label)}</span><strong>${escapeHtml(this._edit.value)}</strong></div><div class="cf-screen-note">${this._edit.confirm ? "ENTER bekræfter ændringen på unitten" : "OP/NED ændrer værdien"}</div>`;
    } else if (!this._inMenu) {
      const main = this._nodeSupported(FRONT_VALUES[front] || {}) ? FRONT_VALUES[front] : front === "settings" ? null : this._firstSupportedLeaf(MENU_TREE[front]);
      const labels = { bv: "BV", itc: "VARME", settings: "INDST", alarm: "ALARM" };
      rows = `<div class="cf-screen-front"><div class="cf-screen-front-main"><small>${escapeHtml(main?.label || (front === "alarm" ? "ALARM" : "INDSTIL."))}</small><strong>${fronts.length ? main ? escapeHtml(this._menuValue(main)) : front === "alarm" ? "Ingen data" : "⚙" : "Ingen tilkoblede data"}</strong></div><div class="cf-screen-front-rail">${fronts.filter((item) => item !== front).map((item) => `<span>${labels[item]}</span>`).join("")}</div></div>`;
    } else {
      const children = this._menuChildren(node);
      const start = Math.max(0, Math.min(this._menuIndex - 1, children.length - 3));
      rows = children.length ? children.slice(start, start + 3).map((item, offset) => `<div class="cf-screen-row ${start + offset === this._menuIndex ? "selected" : ""}"><span>${escapeHtml(item.label)}${item.children ? " ›" : ""}</span><strong>${item.children ? "" : escapeHtml(this._menuValue(item))}</strong></div>`).join("") : `<div class="cf-screen-note">${node.service ? "Kun visning · ingen fysisk handling" : escapeHtml(this._menuValue(node))}</div>`;
    }
    if (this._refs["screen-body"]?.innerHTML !== rows) this._refs["screen-body"].innerHTML = rows;
    this._text(this._refs["screen-hint"], this._edit ? (this._edit.confirm ? "Langt ENTER: annullér" : "ENTER: bekræft valg") : this._inMenu ? "Langt ENTER: tilbage" : "BV · VARME · INDST · ALARM");
  }

  _displayMove(direction) {
    if (this._edit) {
      const edit = this._edit;
      const [, state] = this._mappedState(edit.node) || [];
      if (!state) return;
      if (edit.options) {
        const index = edit.options.indexOf(edit.value);
        edit.value = edit.options[(index + direction + edit.options.length) % edit.options.length];
      } else {
        const min = Number(state.attributes.min), max = Number(state.attributes.max), step = Number(state.attributes.step) || 1;
        edit.value = String(clamp(Math.round((Number(edit.value) - direction * step - min) / step) * step + min, min, max));
      }
      edit.confirm = false;
    } else if (this._inMenu) {
      const length = this._menuChildren(this._menuNode()).length;
      if (length) this._menuIndex = (this._menuIndex + direction + length) % length;
    } else {
      const front = FRONT_VALUES[this._activeFronts()[this._displayPage]];
      if (front && this._canEdit(front)) {
        const [, state] = this._mappedState(front);
        this._edit = { node: front, value: String(state.state), options: null, confirm: false };
        return this._displayMove(direction);
      }
    }
    this._renderDisplay();
  }

  _displayEnter(long = false) {
    if (!this._activeFronts().length) return;
    if (long) {
      if (this._edit) this._edit = null;
      else if (this._inMenu && this._menuPath.length) { this._menuIndex = this._menuPath.pop(); }
      else if (this._inMenu) this._inMenu = false;
      else { this._inMenu = true; this._menuPath = []; this._menuIndex = 0; }
    } else if (this._edit) {
      if (!this._edit.confirm) this._edit.confirm = true;
      else this._commitEdit();
    } else if (!this._inMenu) {
      this._displayPage = (this._displayPage + 1) % Math.max(this._activeFronts().length, 1);
    } else {
      const selected = this._menuChildren(this._menuNode())[this._menuIndex];
      if (selected?.children) { this._menuPath.push(this._menuIndex); this._menuIndex = 0; }
      else if (selected && this._canEdit(selected)) {
        const [, state] = this._mappedState(selected);
        const options = state.state === "on" || state.state === "off" ? ["Fra", "Til"] : selected.options ? this._editOptions(selected, state) : null;
        const current = options && selected.kind === "switch" ? state.state === "on" ? "Til" : "Fra" : String(state.state);
        this._edit = { node: selected, value: options && !options.includes(current) ? options[0] : current, options, confirm: false };
      }
    }
    this._renderDisplay();
  }

  _commitEdit() {
    const edit = this._edit;
    if (!edit || !this._canEdit(edit.node) || !this._hass?.callService) { this._edit = null; return; }
    const [id, state] = this._mappedState(edit.node);
    if (id.startsWith("number.")) {
      const value = Number(edit.value), min = Number(state.attributes.min), max = Number(state.attributes.max);
      if (Number.isFinite(value) && value >= min && value <= max) this._hass.callService("number", "set_value", { entity_id: id, value });
    } else if (id.startsWith("select.") && edit.options.includes(edit.value)) {
      this._hass.callService("select", "select_option", { entity_id: id, option: edit.value });
    } else if (id.startsWith("switch.") && ["Til", "Fra"].includes(edit.value)) {
      this._hass.callService("switch", edit.value === "Til" ? "turn_on" : "turn_off", { entity_id: id });
    }
    this._edit = null;
  }

  _openDisplay() {
    if (!this._refs.modal || this._displayOpen) return;
    this._displayOpen = true;
    this._displayPage = 0;
    this._inMenu = false;
    this._menuPath = [];
    this._menuIndex = 0;
    this._edit = null;
    this._refs.modal.hidden = false;
    this._renderDisplay();
    this._syncAnimation();
    window.addEventListener("keydown", this._onKeydown);
    this._refs.device?.focus({ preventScroll: true });
  }

  _closeDisplay() {
    this._displayOpen = false;
    this._edit = null;
    if (this._refs.modal) this._refs.modal.hidden = true;
    window.removeEventListener("keydown", this._onKeydown);
    this._syncAnimation();
  }

  _openLegacyPopup() {
    // The existing card owns and keeps its complete Styring and Forbrug popups.
    // Traverse open dashboard shadow roots only when the button is pressed.
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
      const id = key === "pump" ? (this._config.pump || this._config.pump_speed) : this._config?.[key];
      if (!id || !this._hass?.states?.[id]) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } }));
    } else if (action === "open-display") this._openDisplay();
    else if (action === "open-legacy-popup") this._openLegacyPopup();
    else if (action === "close-display") this._closeDisplay();
    else if (action === "display-up") this._displayMove(-1);
    else if (action === "display-down") this._displayMove(1);
    else if (action === "display-enter") this._displayEnter();
    else if (action === "display-long-enter") this._displayEnter(true);
  }

  _handleKeydown(event) {
    if (!this._displayOpen) return;
    if (event.key === "Escape") { event.preventDefault(); this._closeDisplay(); }
    if (event.key === "ArrowUp") { event.preventDefault(); this._displayMove(-1); }
    if (event.key === "ArrowDown") { event.preventDefault(); this._displayMove(1); }
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
  :host{display:block;container:calefa-card / inline-size;--cf-supply:#ff7a2f;--cf-return:#3f95ff;--cf-heat:#ff9a3c;--cf-heat-return:#5cb8ff;--cf-dhw:#ff4f5a;--cf-cold:#35d3ea;--cf-ok:#35df9c;--cf-off:#ff5463;--cf-muted:rgba(191,211,226,.72);--cf-text:#f2f7fa;--cf-line:rgba(255,255,255,.09)}
  *{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}button:focus-visible{outline:2px solid #49bdff;outline-offset:2px}
  ha-card{position:relative;display:block;overflow:hidden;border:1px solid rgba(145,177,199,.16);border-radius:var(--ha-card-border-radius,24px);background:radial-gradient(90% 55% at 50% 40%,rgba(43,95,125,.26),transparent 70%),linear-gradient(155deg,#0b1924,#102535 54%,#07121b);color:var(--cf-text);box-shadow:0 18px 52px rgba(0,0,0,.3)}
  .cf{padding:clamp(8px,1.8cqw,22px) clamp(6px,1.8cqw,22px) calc(clamp(8px,1.4cqw,16px) + env(safe-area-inset-bottom,0px));min-width:0}
  [data-tone="supply"]{--tone:var(--cf-supply)}[data-tone="return"]{--tone:var(--cf-return)}[data-tone="heat"]{--tone:var(--cf-heat)}[data-tone="heat-return"]{--tone:var(--cf-heat-return)}[data-tone="dhw"]{--tone:var(--cf-dhw)}[data-tone="cold"]{--tone:var(--cf-cold)}[data-tone="component"]{--tone:var(--cf-ok)}

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
  .cf-tile[data-tone="component"]:not(.is-on){--tone:#7e8f99}.cf-tile[data-tone="component"] strong{color:#f2f7fa}.cf-tile.is-unavailable{opacity:.5}
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
  .cf-modal{position:absolute;inset:0;z-index:30;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto}.cf-modal-backdrop{position:absolute;inset:0;background:rgba(2,8,13,.76);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}.cf-device{position:relative;width:min(100%,450px);margin:auto;padding:12px;border-radius:24px;background:linear-gradient(155deg,#f0f2f1,#d9dedf 60%,#c5cbcd);color:#1d2b31;box-shadow:0 30px 80px rgba(0,0,0,.5)}.cf-device-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.cf-device-head strong,.cf-device-head small{display:block}.cf-device-head small{color:#607078;font-size:10px}.cf-device-head button{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:50%;background:rgba(20,35,43,.08);color:#2c3f48}.cf-device-face{padding:9px;border-radius:14px;background:linear-gradient(#e7eae9,#d3d8d9)}.cf-screen{min-height:230px;padding:10px;border:2px solid #576a71;border-radius:7px;background:linear-gradient(#c5d9d3,#aec4bc);color:#142820}.cf-screen-head{display:flex;align-items:center;gap:7px;padding-bottom:6px;border-bottom:2px solid rgba(20,40,32,.5)}.cf-screen-head ha-icon{--mdc-icon-size:18px}.cf-screen-head strong{flex:1;letter-spacing:.07em}.cf-screen-head span{font-size:11px;font-weight:800}.cf-screen-body{padding-top:5px}.cf-screen-row{display:flex;justify-content:space-between;gap:10px;min-height:30px;padding:4px 5px;border-bottom:1px solid rgba(20,40,32,.15);font-size:12px}.cf-screen-row strong{max-width:55%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.cf-keys{display:flex;justify-content:center;gap:15px;margin-top:9px}.cf-keys button{display:grid;place-items:center;width:44px;height:44px;border:1px solid rgba(0,0,0,.13);border-radius:50%;background:linear-gradient(#fafafa,#dfe4e4);color:#2e4048}.cf-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:8px}.cf-tabs button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0;min-height:47px;padding:4px 2px;border:1px solid rgba(0,0,0,.1);border-radius:10px;background:rgba(255,255,255,.52);color:#364a52;font-size:9px;font-weight:750}.cf-tabs button ha-icon{--mdc-icon-size:17px}.cf-tabs button span{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.cf-tabs button.active{background:#1c3139;color:#eef6f7}
  .cf-screen{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.cf-screen.is-front .cf-screen-head{display:none}.cf-screen-front{display:grid;grid-template-columns:minmax(0,1fr) 70px;min-height:170px;border:2px solid #1a302a}.cf-screen-front-main{display:flex;flex-direction:column;justify-content:space-between;padding:12px 8px}.cf-screen-front-main small{font-size:16px;font-weight:800}.cf-screen-front-main strong{font-size:35px;line-height:1.1}.cf-screen-front-rail{display:flex;flex-direction:column;border-left:2px solid #1a302a}.cf-screen-front-rail span{display:grid;place-items:center;flex:1;border-bottom:2px solid #1a302a;font-size:10px;font-weight:800}.cf-screen-front-rail span:last-child{border:0}.cf-screen-row.selected{background:#1b342d;color:#ddf6e6}.cf-screen-row.selected strong{color:#fff}.cf-screen-note{padding:12px 5px;font-size:11px}.cf-screen-hint{border-top:1px solid #6d857a;padding-top:5px;font-size:10px}.cf-keys button{display:flex;flex-direction:column;gap:0;font-size:9px;font-weight:800}.cf-keys button span{line-height:1}.cf-long-enter{display:block;width:100%;min-height:44px;margin-top:8px;border:1px solid #9daeb1;border-radius:9px;background:#e1e8e8;color:#24383d;font-size:11px;font-weight:700}button:focus-visible{outline:3px solid #49bdff;outline-offset:2px}
  .cf-device{width:min(100%,350px);padding:11px;border:1px solid #adb9ba;border-radius:17px;background:linear-gradient(145deg,#e7ebeb,#bec7c9);box-shadow:0 28px 70px #0009}.cf-device-head{padding:0 5px}.cf-device-head strong{font-size:17px;letter-spacing:.08em}.cf-device-head small{font-size:9px}.cf-device-face{border:1px solid #b9c0c0;border-radius:9px;padding:12px 14px;background:linear-gradient(#e4e6e5,#cbd1d2)}.cf-screen{min-height:158px;border:3px solid #51605d;border-radius:3px;padding:6px;background:linear-gradient(145deg,#bfd6ce,#a3beb4);box-shadow:inset 0 3px 9px #3251444f;font-size:10px}.cf-screen-head{min-height:21px;padding:0 3px 3px;border-color:#4e685c}.cf-screen-head strong{font-size:11px}.cf-screen-front{min-height:105px;grid-template-columns:minmax(0,1fr) 56px;border-width:1px}.cf-screen-front-main{padding:7px}.cf-screen-front-main small{font-size:10px}.cf-screen-front-main strong{font-size:27px}.cf-screen-front-rail{border-left-width:1px}.cf-screen-front-rail span{border-bottom-width:1px;font-size:8px}.cf-screen-row{min-height:30px;padding:5px 4px;font-size:11px}.cf-screen-row.selected{background:#162c23;color:#e6f4e9}.cf-screen-hint{font-size:8px;margin-top:3px}.cf-keys{gap:10px;margin-top:10px}.cf-keys button{width:39px;height:39px}.cf-long-enter{min-height:35px;margin-top:8px;font-size:9px}
  @container calefa-card (max-width:520px){.cf-modal{padding:7px 7px calc(10px + env(safe-area-inset-bottom,0px))}.cf-device{padding:9px;border-radius:18px}}
`;

if (!customElements.get("ha-calefa-flow-card")) customElements.define("ha-calefa-flow-card", HaCalefaFlowCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "ha-calefa-flow-card")) {
  window.customCards.push({ type: "ha-calefa-flow-card", name: "HA Calefa Flow Card", description: "Responsive animated Calefa II flow card", preview: false, documentationURL: "https://github.com/MRDonnii/ha-smart-home-cards/blob/main/docs/CALEFA_FLOW_CARD.md" });
}
console.info(`%c HA CALEFA FLOW CARD %c v${CALEFA_FLOW_CARD_VERSION} `, "background:#087ea4;color:#fff;font-weight:700;padding:2px 5px", "background:#102631;color:#8fe7ff;padding:2px 5px");
