const CALEFA_FLOW_CARD_VERSION = "0.2.0";

const ENTITY_KEYS = [
  "fjv_supply",
  "fjv_return",
  "fjv_flow",
  "heating_supply",
  "heating_return",
  "heating_setpoint",
  "heating_flow",
  "dhw_temperature",
  "dhw_setpoint",
  "cold_water_temperature",
  "water_flow",
  "pump",
  "pump_speed",
  "heating_valve",
  "dhw_valve",
  "heating_active",
  "dhw_active",
  "power",
  "pressure",
  "room_temperature",
  "outdoor_temperature",
];

// State vocabulary. Calefa integrations report Danish text states such as
// "Til", "Fra", "Opvarmning", "Standby" and "Bypass"; generic HA entities use on/off.
const UNAVAILABLE_STATES = new Set(["unknown", "unavailable", "none", "null", ""]);
const ON_WORDS = new Set(["on", "true", "yes", "ja", "open", "opening", "åben", "aaben", "heat", "heating", "active", "aktiv", "running", "kører", "korer", "drift", "i drift", "til", "tændt", "taendt", "opvarmning", "demand"]);
const OFF_WORDS = new Set(["off", "false", "no", "nej", "closed", "closing", "lukket", "idle", "standby", "stand-by", "inactive", "inaktiv", "stop", "stopped", "stoppet", "fra", "slukket", "ingen", "sommer", "sommerstop", "summer"]);
const HEATING_WORDS = new Set(["radiator", "radiatorer", "varme", "rumvarme", "centralvarme", "gulvvarme", "space heating"]);
const DHW_WORDS = new Set(["varmt vand", "varmtvand", "brugsvand", "bv", "bvv", "dhw", "hot water", "tapning", "tapping", "kold", "varm"]);
const STATE_SEPARATOR = /\s*(?:\+|&|,|\/|\bog\b|\band\b)\s*/;
const BLANK_BEFORE_PERCENT = new Set(["cs", "de", "fi", "fr", "sk", "sv"]);

const FLOW_TO_LITRES_PER_MINUTE = {
  "l/min": 1,
  "l/h": 1 / 60,
  "l/s": 60,
  "ml/s": 0.06,
  "m³/h": 1000 / 60,
  "m3/h": 1000 / 60,
  "m³/min": 1000,
  "m³/s": 60000,
  "gal/min": 3.78541,
  "gpm": 3.78541,
  "ft³/min": 28.3168,
};
// Flow (L/min) that maps to the fastest animation speed for each circuit.
const NOMINAL_FLOW = { primary: 10, heat: 6, dhw: 12 };
// Seconds per dash period (28 viewBox units) and per pump rotation, indexed by speed level 1-5.
const FLOW_DURATIONS = [0, 1.7, 1.25, 0.95, 0.72, 0.55];
const PUMP_DURATIONS = [0, 2.8, 2.1, 1.55, 1.15, 0.85];

// Geometry in a 600 x 1000 viewBox (3:5, close to the 530 x 854 mm unit plus connections).
// Modelled on photos of a Calefa II 40/40: black EPP cabinet with the controller in the top hood,
// stainless pipes with brass fittings, two copper plate heat exchangers staggered on the right,
// a UPM3-style pump at the bottom and six bottom connections (left-handed order FF FR VR VF BV KV).
const VIEW = { width: 600, height: 1000 };
const DISPLAY_BOX = { x: 196, y: 50, width: 208, height: 132 };
const CONNECTIONS = [
  { id: "FF", x: 72 },
  { id: "FR", x: 142 },
  { id: "VR", x: 290 },
  { id: "VF", x: 380 },
  { id: "BV", x: 470 },
  { id: "KV", x: 548 },
];
// The heating exchanger sits behind the DHW exchanger, offset up and to the left.
const HX = {
  heat: { x: 430, y: 376, width: 86, height: 330 },
  dhw: { x: 486, y: 436, width: 84, height: 364 },
};

// Drawn back to front, so later pipes pass in front of earlier ones. Every path runs in the flow
// direction so the moving light and the arrows point the right way.
const PIPES = [
  { id: "vr", circuit: "heatLoop", speed: "heat", tone: "heat-return", points: [[290, 930], [290, 760], [452, 760], [452, 706]] },
  { id: "vf", circuit: "heatLoop", speed: "heat", tone: "heat", points: [[476, 706], [476, 790], [380, 790], [380, 930]] },
  { id: "kv", circuit: "dhwTap", speed: "dhw", tone: "cold", points: [[548, 930], [548, 800]] },
  { id: "bv", circuit: "dhwTap", speed: "dhw", tone: "dhw", points: [[510, 800], [510, 850], [470, 850], [470, 930]] },
  { id: "ff", circuit: "primary", speed: "primary", tone: "supply", points: [[72, 930], [72, 330], [470, 330]] },
  { id: "ff-heat", circuit: "heatPrimary", speed: "primary", tone: "supply", points: [[470, 330], [470, 376]] },
  { id: "ff-dhw", circuit: "dhwPrimary", speed: "primary", tone: "supply", points: [[470, 330], [548, 330], [548, 436]] },
  { id: "fr-heat", circuit: "heatPrimary", speed: "primary", tone: "return", points: [[430, 680], [412, 680], [412, 460]] },
  { id: "fr-dhw", circuit: "dhwPrimary", speed: "primary", tone: "return", points: [[486, 460], [412, 460]] },
  { id: "fr", circuit: "primary", speed: "primary", tone: "return", points: [[412, 460], [412, 372], [142, 372], [142, 930]] },
];

// rail: side in the wide layout. order: position in the compact 2-column grid.
// anchor: point in the drawing that the callout line points to (wide layout).
const METRICS = [
  { id: "fjv_supply", rail: "left", order: 1, label: "FJV frem", icon: "mdi:transmission-tower-import", tone: "supply", kind: "temperature", circuit: "primary", subKey: "fjv_flow", subText: "Fjernvarme ind", anchor: [72, 470] },
  { id: "fjv_return", rail: "left", order: 2, label: "FJV retur", icon: "mdi:transmission-tower-export", tone: "return", kind: "temperature", circuit: "primary", subDerived: "cooling", subText: "Retur til nettet", anchor: [142, 520] },
  { id: "pump", rail: "left", order: 7, label: "Pumpe", icon: "mdi:fan", tone: "component", kind: "pump", anchor: [290, 836] },
  { id: "heating_valve", rail: "left", order: 8, label: "Varmeventil", icon: "mdi:valve", tone: "component", kind: "valve", anchor: [378, 582] },
  { id: "dhw_temperature", rail: "right", order: 5, label: "Varmt vand", icon: "mdi:water-thermometer", tone: "dhw", kind: "temperature", circuit: "dhwTap", subKey: "water_flow", subText: "Brugsvand", anchor: [533, 560] },
  { id: "heating_supply", rail: "right", order: 3, label: "Varme frem", icon: "mdi:radiator", tone: "heat", kind: "temperature", circuit: "heatLoop", subKey: "heating_flow", subText: "Til boligen", anchor: [476, 744] },
  { id: "heating_return", rail: "right", order: 4, label: "Varme retur", icon: "mdi:radiator-disabled", tone: "heat-return", kind: "temperature", circuit: "heatLoop", subText: "Fra boligen", anchor: [360, 760] },
  { id: "cold_water_temperature", rail: "right", order: 6, label: "Koldt vand", icon: "mdi:water-outline", tone: "cold", kind: "temperature", circuit: "dhwTap", subText: "Fra vandværket", anchor: [548, 900] },
  { id: "dhw_valve", rail: "right", order: 9, label: "BV-ventil", icon: "mdi:valve", tone: "component", kind: "valve", anchor: [452, 426] },
];

const FOOTER_ITEMS = [
  { id: "room_temperature", label: "Bolig", icon: "mdi:home-outline", kind: "temperature" },
  { id: "outdoor_temperature", label: "Udetemperatur", icon: "mdi:thermometer", kind: "temperature" },
  { id: "power", label: "Effekt", icon: "mdi:flash-outline", kind: "power" },
  { id: "cooling", label: "Afkøling", icon: "mdi:delta", derived: "cooling", requires: ["fjv_supply", "fjv_return"] },
  { id: "pressure", label: "Tryk", icon: "mdi:gauge", kind: "pressure" },
  { id: "connection", label: "Forbindelse", icon: "mdi:link-variant", derived: "connection", always: true },
];

// Status lights on the controller, as described in the Calefa II V manual.
const LEDS = [
  { id: "power", label: "Strøm", icon: "mdi:power" },
  { id: "warning", label: "Advarsel", icon: "mdi:alert-outline" },
  { id: "mode", label: "Mode", icon: "mdi:sync" },
  { id: "lan", label: "LAN", icon: "mdi:lan" },
  { id: "peripheral", label: "Perifer", icon: "mdi:access-point" },
];

// Virtual display menu. The structure is data driven so labels, icons, sub pages and (later)
// confirmed service calls can be swapped to match the real Calefa menus without touching the renderer.
// Rows: { label, key, kind } reads an entity; { label, derived, requires } shows a computed value.
// A row may later get { page: "<id>" } for sub menus; the display stays read-only in this version.
const CALEFA_DISPLAY_MENU = [
  {
    id: "home",
    tab: "Forside",
    icon: "mdi:home-outline",
    title: "CALEFA",
    hero: [
      { key: "heating_supply", caption: "Varme frem" },
      { key: "fjv_supply", caption: "FJV frem" },
    ],
    rows: [
      { label: "Drift", derived: "mode" },
      { label: "Varme", derived: "heatingState" },
      { label: "Brugsvand", derived: "dhwState" },
      { label: "Ude", key: "outdoor_temperature", kind: "temperature" },
      { label: "Bolig", key: "room_temperature", kind: "temperature" },
      { label: "Effekt", key: "power", kind: "power" },
    ],
  },
  {
    id: "heating",
    tab: "Varme",
    icon: "mdi:radiator",
    title: "VARME",
    hero: [
      { key: "heating_setpoint", caption: "Ønsket frem" },
      { key: "heating_supply", caption: "Fremløb" },
    ],
    rows: [
      { label: "Fremløb", key: "heating_supply", kind: "temperature" },
      { label: "Retur", key: "heating_return", kind: "temperature" },
      { label: "Ønsket fremløb", key: "heating_setpoint", kind: "temperature" },
      { label: "Varmeventil", key: "heating_valve", kind: "valve" },
      { label: "Pumpe", derived: "pump", requires: ["pump", "pump_speed"], any: true },
      { label: "Flow", key: "heating_flow", kind: "flow" },
      { label: "Status", derived: "heatingState" },
    ],
  },
  {
    id: "dhw",
    tab: "Brugsvand",
    icon: "mdi:water-thermometer",
    title: "BV",
    hero: [
      { key: "dhw_setpoint", caption: "Setpunkt" },
      { key: "dhw_temperature", caption: "Varmt vand" },
    ],
    rows: [
      { label: "Temperatur", key: "dhw_temperature", kind: "temperature" },
      { label: "Setpunkt", key: "dhw_setpoint", kind: "temperature" },
      { label: "Koldt vand", key: "cold_water_temperature", kind: "temperature" },
      { label: "Flow", key: "water_flow", kind: "flow" },
      { label: "Ventil", key: "dhw_valve", kind: "valve" },
      { label: "Status", derived: "dhwState" },
    ],
  },
  {
    id: "status",
    tab: "Status",
    icon: "mdi:information-outline",
    title: "STATUS",
    rows: [
      { label: "FJV frem", key: "fjv_supply", kind: "temperature" },
      { label: "FJV retur", key: "fjv_return", kind: "temperature" },
      { label: "Afkøling", derived: "cooling", requires: ["fjv_supply", "fjv_return"] },
      { label: "FJV flow", key: "fjv_flow", kind: "flow" },
      { label: "Effekt", key: "power", kind: "power" },
      { label: "Anlægstryk", key: "pressure", kind: "pressure" },
      { label: "Varmekreds", derived: "heatingState" },
      { label: "Brugsvand", derived: "dhwState" },
    ],
  },
];

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(",", ".");
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

// Interprets an activity entity. Returns true, false, "bypass" (DHW only) or null when undetermined.
function interpretActivity(stateObj, context = "") {
  if (!stateObj) return null;
  const raw = String(stateObj.state ?? "").trim().toLowerCase();
  if (UNAVAILABLE_STATES.has(raw)) return null;
  const numeric = toNumber(raw);
  if (numeric !== null) return numeric > 0;
  if (OFF_WORDS.has(raw)) return false;
  const tokens = raw.split(STATE_SEPARATOR).filter(Boolean);
  const own = context === "dhw" ? DHW_WORDS : context === "heating" ? HEATING_WORDS : null;
  const other = context === "dhw" ? HEATING_WORDS : context === "heating" ? DHW_WORDS : null;
  if (tokens.some((token) => ON_WORDS.has(token) || own?.has(token))) return true;
  if (context === "dhw" && tokens.some((token) => token.includes("bypass"))) return "bypass";
  if (other && tokens.some((token) => other.has(token))) return false;
  if (tokens.length && tokens.every((token) => OFF_WORDS.has(token))) return false;
  if (toNumber(stateObj.attributes?.raw_value) === 0) return false;
  return null;
}

function roundedPath(points, radius) {
  let path = `M${points[0][0]} ${points[0][1]}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const [px, py] = points[index - 1];
    const [x, y] = points[index];
    const [nx, ny] = points[index + 1];
    const inLength = Math.hypot(x - px, y - py);
    const outLength = Math.hypot(nx - x, ny - y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const ax = round1(x - ((x - px) / inLength) * r);
    const ay = round1(y - ((y - py) / inLength) * r);
    const bx = round1(x + ((nx - x) / outLength) * r);
    const by = round1(y + ((ny - y) / outLength) * r);
    path += ` L${ax} ${ay} Q${x} ${y} ${bx} ${by}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${path} L${lx} ${ly}`;
}

const flowLevel = (fraction) => (fraction === null ? 3 : 1 + Math.round(Math.sqrt(clamp(fraction, 0, 1)) * 4));

let calefaCardInstances = 0;

class HaCalefaFlowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._uid = `calefa${(calefaCardInstances += 1)}`;
    this._config = null;
    this._hass = null;
    this._built = false;
    this._refs = {};
    this._pipes = [];
    this._metrics = new Map();
    this._footer = new Map();
    this._seen = new Map();
    this._formatters = new Map();
    this._model = null;
    this._displayOpen = false;
    this._displayPage = 0;
    this._selection = -1;
    this._lcd = null;
    this._offscreen = false;
    this._onClick = (event) => this._handleClick(event);
    this._onKeydown = (event) => this._handleKeydown(event);
    this.shadowRoot.addEventListener("click", this._onClick);
  }

  static getStubConfig(hass) {
    const config = { title: "Calefa II 40/40", subtitle: "Fjernvarmeunit" };
    // Entity-id endings used by the Wavin Calefa integration; only used when present.
    const endings = {
      fjv_supply: "fjernvarme_fremlob_temperatur",
      fjv_return: "fjernvarme_retur_temperatur",
      heating_supply: "cvv_fremlob_temperatur",
      heating_return: "cvv_retur_temperatur",
      dhw_temperature: "brugsvand_ud_temperatur",
      cold_water_temperature: "koldtvandsfoler_ved_veksler",
      water_flow: "brugsvandsflow",
      heating_valve: "cvv_ventilposition",
      pump: "heating_pump_status_itc",
      heating_active: "heating_state_ch",
      dhw_active: "brugsvand_status",
      pressure: "anlaegstryk",
      outdoor_temperature: "udetemperatur_ut",
    };
    const ids = Object.keys(hass?.states || {}).filter((id) => id.startsWith("sensor.") && id.includes("calefa"));
    for (const [key, ending] of Object.entries(endings)) {
      const match = ids.find((id) => id.endsWith(`_${ending}`));
      if (match) config[key] = match;
    }
    return config;
  }

  setConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("ha-calefa-flow-card requires a configuration object");
    }
    const text = (value, fallback = "") => (typeof value === "string" && value.trim() ? value.trim() : fallback);
    const number = (value, fallback) => toNumber(value) ?? fallback;
    const next = {
      title: text(config.title, "Calefa II 40/40"),
      subtitle: text(config.subtitle, "Fjernvarmeunit"),
      background_image: text(config.background_image),
      background_fit: config.background_fit === "cover" ? "cover" : "contain",
      flow_threshold: Math.max(0, number(config.flow_threshold, 0.05)),
      valve_threshold: Math.max(0, number(config.valve_threshold, 1)),
      show_footer: config.show_footer !== false,
      show_labels: config.show_labels !== false,
      animations: config.animations !== false,
    };
    for (const key of ENTITY_KEYS) next[key] = text(config[key]);
    this._config = next;
    this._entityIds = [...new Set(ENTITY_KEYS.map((key) => next[key]).filter(Boolean))];
    this._build();
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config || !hass) return;
    if (!this._built) this._build();
    if (this._hasChanges(hass)) this._update();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    const tiles = this._config ? METRICS.filter((metric) => this._metricConfigured(metric)).length : METRICS.length;
    const footer = this._config?.show_footer === false ? 0 : 110;
    return Math.max(8, Math.round((110 + 600 + Math.ceil(tiles / 2) * 66 + footer) / 50));
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  connectedCallback() {
    this._observeLayout();
    if (this._observer || typeof IntersectionObserver === "undefined") return;
    this._observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) this._setOffscreen(!entry.isIntersecting);
    }, { rootMargin: "120px" });
    this._observer.observe(this);
  }

  disconnectedCallback() {
    this._layoutObserver?.disconnect();
    this._layoutObserver = null;
    this._observer?.disconnect();
    this._observer = null;
    if (this._displayOpen) this._closeDisplay(false);
  }

  // ---------------------------------------------------------------- state helpers

  _stateObj(key) {
    const entityId = this._config?.[key];
    if (!entityId || !this._hass?.states) return null;
    return this._hass.states[entityId] || null;
  }

  _available(key) {
    const stateObj = this._stateObj(key);
    return Boolean(stateObj) && !UNAVAILABLE_STATES.has(String(stateObj.state ?? "").trim().toLowerCase());
  }

  _num(key) {
    const stateObj = this._stateObj(key);
    return stateObj ? toNumber(stateObj.state) : null;
  }

  _unit(key) {
    const unit = this._stateObj(key)?.attributes?.unit_of_measurement;
    return typeof unit === "string" ? unit : "";
  }

  _activity(key, context) {
    return interpretActivity(this._stateObj(key), context);
  }

  _valvePosition(key) {
    const stateObj = this._stateObj(key);
    if (!stateObj) return null;
    const numeric = toNumber(stateObj.state);
    if (numeric !== null) return clamp(numeric, 0, 100);
    const position = toNumber(stateObj.attributes?.current_position ?? stateObj.attributes?.position);
    if (position !== null) return clamp(position, 0, 100);
    const active = interpretActivity(stateObj, "valve");
    return active === true ? 100 : active === false ? 0 : null;
  }

  _flowFraction(key, nominal) {
    const value = this._num(key);
    if (value === null) return null;
    const factor = FLOW_TO_LITRES_PER_MINUTE[this._unit(key).trim().toLowerCase()];
    return factor ? (value * factor) / nominal : null;
  }

  _hasChanges(hass) {
    if (hass.locale !== this._seenLocale || hass.entities !== this._seenEntities || hass.connected !== this._seenConnected) return true;
    for (const entityId of this._entityIds) {
      if (hass.states?.[entityId] !== this._seen.get(entityId)) return true;
    }
    return false;
  }

  _rememberStates(hass) {
    this._seenLocale = hass.locale;
    this._seenEntities = hass.entities;
    this._seenConnected = hass.connected;
    this._seen.clear();
    for (const entityId of this._entityIds) this._seen.set(entityId, hass.states?.[entityId]);
  }

  // ---------------------------------------------------------------- formatting

  _syncLocale() {
    const locale = this._hass?.locale;
    if (locale === this._localeSource && this._lang) return;
    this._localeSource = locale;
    const language = locale?.language || this._hass?.language || (typeof navigator !== "undefined" && navigator.language) || "da";
    const format = locale?.number_format;
    this._lang = String(language).split("-")[0].toLowerCase();
    this._grouping = format !== "none";
    this._numberLocale = format === "comma_decimal" ? ["en-US", "en"]
      : format === "decimal_comma" ? ["de", "es", "it"]
        : format === "space_comma" ? ["fr", "sv", "cs"]
          : format === "system" ? undefined
            : language;
    this._formatters.clear();
  }

  _formatNumber(value, decimals) {
    const key = `${decimals}`;
    let formatter = this._formatters.get(key);
    if (!formatter) {
      const options = { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: this._grouping !== false };
      try {
        formatter = new Intl.NumberFormat(this._numberLocale, options);
      } catch (error) {
        formatter = new Intl.NumberFormat(undefined, options);
      }
      this._formatters.set(key, formatter);
    }
    return formatter.format(value);
  }

  _withUnit(text, unit) {
    if (!unit) return text;
    if (unit === "%") return `${text}${BLANK_BEFORE_PERCENT.has(this._lang) ? " " : ""}%`;
    if (unit === "°") return `${text}°`;
    return `${text} ${unit}`;
  }

  _precision(key) {
    const precision = this._hass?.entities?.[this._config?.[key]]?.display_precision;
    return Number.isInteger(precision) && precision >= 0 && precision <= 6 ? precision : null;
  }

  _stateText(key) {
    const stateObj = this._stateObj(key);
    if (!stateObj || !this._available(key)) return "–";
    try {
      const formatted = this._hass.formatEntityState?.(stateObj);
      if (typeof formatted === "string" && formatted) return formatted;
    } catch (error) {
      // Fall back to the raw state below.
    }
    return String(stateObj.state);
  }

  _format(key, kind = "number") {
    if (!this._available(key)) return "–";
    const value = this._num(key);
    if (value === null) return kind === "valve" ? this._valveText(key) : this._stateText(key);
    const unit = this._unit(key);
    let decimals;
    let shownUnit = unit;
    if (kind === "temperature") {
      decimals = 1;
      shownUnit = unit || "°C";
    } else if (kind === "short-temperature") {
      decimals = 0;
      shownUnit = "°";
    } else if (kind === "valve" || kind === "percent") {
      decimals = 0;
      shownUnit = unit || "%";
    } else if (kind === "flow") {
      const lower = unit.toLowerCase();
      decimals = lower.startsWith("m³") || lower.startsWith("m3") ? (Math.abs(value) < 1 ? 3 : 2) : lower === "l/min" ? 1 : Math.abs(value) < 10 ? 1 : 0;
    } else if (kind === "power") {
      decimals = unit === "W" || Math.abs(value) >= 100 ? 0 : 1;
    } else if (kind === "pressure") {
      decimals = 1;
    } else {
      decimals = Math.abs(value) < 10 ? 1 : 0;
    }
    if (kind !== "short-temperature") decimals = this._precision(key) ?? decimals;
    return this._withUnit(this._formatNumber(value, decimals), shownUnit);
  }

  _valveText(key) {
    const position = this._valvePosition(key);
    if (position === null) return this._stateText(key);
    return this._withUnit(this._formatNumber(position, 0), "%");
  }

  _formatParts(key, kind) {
    const text = this._format(key, kind);
    const unit = kind === "temperature" ? this._unit(key) || "°C" : kind === "valve" || kind === "percent" ? "%" : this._unit(key);
    if (text === "–" || !unit || !text.endsWith(unit)) return [text, ""];
    const number = text.slice(0, -unit.length).trim();
    return unit.startsWith("°") ? [`${number}°`, unit.slice(1)] : [number, unit];
  }

  _derived(name, model) {
    if (name === "mode") {
      if (model.dhwTap && model.heatingActive) return "Varme + brugsvand";
      if (model.dhwTap) return "Brugsvand";
      if (model.dhwBypass) return model.heatingActive ? "Varme + bypass" : "Bypass";
      return model.heatingActive ? "Varme" : "Standby";
    }
    if (name === "heatingState") {
      if (this._config.heating_active && this._available("heating_active")) return this._stateText("heating_active");
      return model.heatingActive ? "Aktiv" : "Standby";
    }
    if (name === "dhwState") {
      if (this._config.dhw_active && this._available("dhw_active")) return this._stateText("dhw_active");
      return model.dhwTap ? "Aktiv" : model.dhwBypass ? "Bypass" : "Standby";
    }
    if (name === "pump") return model.pumpText;
    if (name === "connection") return this._hass?.connected === false ? "Offline" : "Online";
    if (name === "cooling") {
      return model.cooling === null ? "–" : this._withUnit(this._formatNumber(model.cooling, 1), this._unit("fjv_supply") || "°C");
    }
    return "–";
  }

  // ---------------------------------------------------------------- model

  _computeModel() {
    const config = this._config;
    const flowThreshold = config.flow_threshold;
    const valveThreshold = config.valve_threshold;
    const heatingFlow = this._num("heating_flow");
    const waterFlow = this._num("water_flow");
    const heatingValve = this._valvePosition("heating_valve");
    const dhwValve = this._valvePosition("dhw_valve");
    const pumpState = this._activity("pump", "pump");
    const pumpSpeed = this._num("pump_speed");
    const explicitHeat = this._activity("heating_active", "heating");
    const explicitDhw = this._activity("dhw_active", "dhw");

    const heatValveOpen = heatingValve === null ? null : heatingValve > valveThreshold;
    const dhwValveOpen = dhwValve === null ? null : dhwValve > valveThreshold;
    const pumpRunning = typeof pumpState === "boolean" ? pumpState : pumpSpeed !== null ? pumpSpeed > 0 : null;

    // Explicit activity entities win; otherwise activity is derived from flow, valve and pump.
    const heatingActive = typeof explicitHeat === "boolean"
      ? explicitHeat
      : (heatingFlow !== null && heatingFlow > flowThreshold) || heatValveOpen === true || pumpRunning === true;

    let dhwState;
    if (explicitDhw === "bypass") dhwState = "bypass";
    else if (explicitDhw === true) dhwState = "active";
    else if (explicitDhw === false) dhwState = "idle";
    else if (waterFlow !== null) dhwState = waterFlow > flowThreshold ? "active" : "idle";
    else dhwState = dhwValveOpen ? "active" : "idle";

    const dhwTap = dhwState === "active";
    const dhwBypass = dhwState === "bypass";
    // District heating only flows through an exchanger when its valve is open (bypass keeps the DHW side warm).
    const heatPrimary = heatValveOpen ?? heatingActive;
    const dhwPrimary = dhwValveOpen ?? (dhwTap || dhwBypass);
    const pumpActive = pumpRunning ?? heatingActive;

    const valveFraction = (position) => (position === null ? null : position / 60);
    const primaryFraction = this._flowFraction("fjv_flow", NOMINAL_FLOW.primary)
      ?? (heatingValve !== null || dhwValve !== null ? valveFraction(Math.max(heatPrimary ? heatingValve ?? 0 : 0, dhwPrimary ? dhwValve ?? 0 : 0)) : null);
    const heatFraction = this._flowFraction("heating_flow", NOMINAL_FLOW.heat) ?? (pumpSpeed !== null ? pumpSpeed / 100 : null);
    const dhwFraction = this._flowFraction("water_flow", NOMINAL_FLOW.dhw) ?? valveFraction(dhwValve);

    const supply = this._num("fjv_supply");
    const returnTemperature = this._num("fjv_return");
    let unavailable = 0;
    let withData = 0;
    for (const entityId of this._entityIds) {
      const stateObj = this._hass?.states?.[entityId];
      if (!stateObj || stateObj.state === "unavailable") unavailable += 1;
      else withData += 1;
    }

    let pumpText = "–";
    if (this._config.pump_speed && pumpSpeed !== null) pumpText = this._format("pump_speed", "percent");
    else if (typeof pumpRunning === "boolean" && (this._config.pump || this._config.pump_speed)) pumpText = pumpRunning ? "Kører" : "Stop";

    return {
      heatingActive,
      heatLoop: heatingActive || pumpActive,
      heatPrimary,
      heatValveOpen,
      heatingValve,
      dhwState,
      dhwTap,
      dhwBypass,
      dhwPrimary,
      dhwValveOpen,
      dhwValve,
      primary: heatPrimary || dhwPrimary,
      pumpActive,
      pumpText,
      levels: {
        primary: flowLevel(primaryFraction),
        heat: flowLevel(heatFraction),
        dhw: flowLevel(dhwFraction),
        pump: flowLevel(pumpSpeed !== null ? pumpSpeed / 100 : null),
      },
      cooling: supply !== null && returnTemperature !== null ? supply - returnTemperature : null,
      unavailable,
      hasData: withData > 0,
    };
  }

  _metricConfigured(metric) {
    if (metric.id === "pump") return Boolean(this._config.pump || this._config.pump_speed);
    return Boolean(this._config[metric.id]);
  }

  _metricTarget(metric) {
    if (metric.id === "pump") return this._config.pump ? "pump" : "pump_speed";
    return metric.id;
  }

  // ---------------------------------------------------------------- DOM build (only on config changes)

  _build() {
    if (!this._config) return;
    if (this._displayOpen) this._closeDisplay(false);
    this.shadowRoot.innerHTML = `<style>${CALEFA_STYLES}</style>${this._markup()}`;
    this._refs = {};
    for (const element of this.shadowRoot.querySelectorAll("[data-ref]")) this._refs[element.getAttribute("data-ref")] = element;
    this._pipes = [...this.shadowRoot.querySelectorAll(".cf-pipe")].map((element) => ({ element, circuit: element.getAttribute("data-circuit") }));
    this._metrics = new Map();
    for (const element of this.shadowRoot.querySelectorAll("[data-metric]")) {
      this._metrics.set(element.getAttribute("data-metric"), {
        element,
        num: element.querySelector(".cf-num"),
        unit: element.querySelector(".cf-unit"),
        sub: element.querySelector(".cf-metric-sub"),
      });
    }
    this._footer = new Map();
    for (const element of this.shadowRoot.querySelectorAll("[data-foot]")) this._footer.set(element.getAttribute("data-foot"), element.querySelector("strong"));
    this._seen.clear();
    this._seenLocale = undefined;
    this._model = null;
    this._built = true;
    if (this._offscreen) this._refs.root?.classList.add("is-offscreen");
    this._leaderMarkup = "";
    this._layoutObserver?.disconnect();
    this._layoutObserver = null;
    this._observeLayout();
  }

  _markup() {
    const config = this._config;
    const metrics = METRICS.filter((metric) => this._metricConfigured(metric));
    const byAnchor = (a, b) => a.anchor[1] - b.anchor[1];
    const left = metrics.filter((metric) => metric.rail === "left").sort(byAnchor);
    const right = metrics.filter((metric) => metric.rail === "right").sort(byAnchor);
    const lastCompact = metrics.length % 2 === 1 ? [...metrics].sort((a, b) => a.order - b.order).at(-1) : null;
    const tile = (metric, index, list) => {
      const spanRail = list.length % 2 === 1 && index === list.length - 1;
      const classes = ["cf-metric", metric === lastCompact ? "span-mobile" : "", spanRail ? "span-rail" : ""].filter(Boolean).join(" ");
      return `
        <button class="${classes}" type="button" style="--o:${metric.order}" data-metric="${metric.id}" data-tone="${metric.tone}" data-action="more-info" data-key="${this._metricTarget(metric)}">
          <span class="cf-metric-icon"><ha-icon icon="${metric.icon}"></ha-icon></span>
          <span class="cf-metric-text">
            <span class="cf-metric-label">${escapeHtml(metric.label)}</span>
            <span class="cf-metric-value"><span class="cf-num">–</span><span class="cf-unit"></span></span>
            <span class="cf-metric-sub"></span>
          </span>
        </button>`;
    };
    const pill = (type, key, icon, label) => {
      const tag = config[key] ? "button" : "div";
      const action = config[key] ? ` type="button" data-action="more-info" data-key="${key}"` : "";
      return `
        <${tag} class="cf-pill cf-pill-${type}" data-ref="pill-${type}"${action}>
          <span class="cf-pill-icon"><ha-icon icon="${icon}"></ha-icon></span>
          <span class="cf-pill-text"><small>${label}</small><strong data-ref="pill-${type}-text">standby</strong><em data-ref="pill-${type}-desc"></em></span>
        </${tag}>`;
    };
    const footerItems = config.show_footer
      ? FOOTER_ITEMS.filter((item) => item.always || (item.requires ? item.requires.every((key) => config[key]) : config[item.id]))
      : [];
    const footer = footerItems.length ? `
      <div class="cf-footer">
        ${footerItems.map((item) => {
          const tag = item.derived ? "div" : "button";
          const action = item.derived ? "" : ` type="button" data-action="more-info" data-key="${item.id}"`;
          return `<${tag} class="cf-foot" data-foot="${item.id}"${action}><ha-icon icon="${item.icon}"></ha-icon><span><small>${escapeHtml(item.label)}</small><strong>–</strong></span></${tag}>`;
        }).join("")}
        <button class="cf-foot-more" type="button" data-action="open-display" aria-label="Åbn Calefa-display"><ha-icon icon="mdi:dots-vertical"></ha-icon></button>
      </div>` : "";
    const pct = (value, total) => `${round1((value / total) * 1000) / 10}%`;
    const hit = `left:${pct(DISPLAY_BOX.x, VIEW.width)};top:${pct(DISPLAY_BOX.y, VIEW.height)};width:${pct(DISPLAY_BOX.width, VIEW.width)};height:${pct(DISPLAY_BOX.height, VIEW.height)}`;

    return `
      <ha-card>
        <div class="cf${config.animations ? "" : " no-anim"}" data-ref="root">
          <div class="cf-head">
            <div class="cf-brand">
              <h2>${escapeHtml(config.title)}</h2>
              ${config.subtitle ? `<p>${escapeHtml(config.subtitle)}</p>` : ""}
            </div>
            <div class="cf-pills">
              ${pill("heat", "heating_active", "mdi:heat-wave", "Varmedrift")}
              ${pill("dhw", "dhw_active", "mdi:water", "Brugsvand")}
            </div>
          </div>
          <div class="cf-main" data-ref="main">
            <svg class="cf-leaders" data-ref="leaders" aria-hidden="true"></svg>
            <div class="cf-rail cf-rail-left" data-ref="railLeft">${left.map(tile).join("")}</div>
            <div class="cf-stage">
              <div class="cf-stage-box" data-ref="stageBox">
                ${this._svgMarkup()}
                <button class="cf-display-hit" type="button" style="${hit}" data-ref="displayHit" data-action="open-display" aria-haspopup="dialog" aria-label="Åbn Calefa-display">
                  <span class="cf-display-badge" aria-hidden="true"><ha-icon icon="mdi:gesture-tap"></ha-icon></span>
                </button>
              </div>
            </div>
            <div class="cf-rail cf-rail-right" data-ref="railRight">${right.map(tile).join("")}</div>
          </div>
          ${footer}
        </div>
        ${this._modalMarkup()}
      </ha-card>`;
  }

  _svgMarkup() {
    const config = this._config;
    const id = (name) => `${this._uid}-${name}`;
    const url = (name) => `url(#${id(name)})`;
    const photo = config.background_image
      ? `<image class="cf-photo" href="${escapeHtml(config.background_image)}" x="0" y="0" width="${VIEW.width}" height="${VIEW.height}" preserveAspectRatio="xMidYMid ${config.background_fit === "cover" ? "slice" : "meet"}"/>`
      : "";

    const nut = (x, y, vertical = true) => (vertical
      ? `<rect class="cf-nut" x="${x - 10}" y="${y - 7}" width="20" height="14" rx="2.5"/><path class="cf-nut-line" d="M${x - 10} ${y} H${x + 10}"/>`
      : `<rect class="cf-nut" x="${x - 7}" y="${y - 10}" width="14" height="20" rx="2.5"/><path class="cf-nut-line" d="M${x} ${y - 10} V${y + 10}"/>`);

    const chevrons = (points) => {
      const marks = [];
      for (let index = 0; index < points.length - 1; index += 1) {
        const [x1, y1] = points[index];
        const [x2, y2] = points[index + 1];
        const length = Math.hypot(x2 - x1, y2 - y1);
        if (length < 70) continue;
        const angle = Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
        for (let at = 44; at < length - 30; at += 68) {
          const x = round1(x1 + ((x2 - x1) * at) / length);
          const y = round1(y1 + ((y2 - y1) * at) / length);
          marks.push(`<path d="M-3.5 -4.5 L2.5 0 L-3.5 4.5" transform="translate(${x} ${y}) rotate(${angle})"/>`);
        }
      }
      return marks.join("");
    };

    const pipes = PIPES.map((pipe) => {
      const d = roundedPath(pipe.points, 16);
      return `
        <g class="cf-pipe s-${pipe.speed}" data-circuit="${pipe.circuit}" style="--pipe:var(--cf-${pipe.tone})">
          <path class="cf-p-casing" d="${d}"/><path class="cf-p-body" d="${d}"/><path class="cf-p-shine" d="${d}"/>
          <path class="cf-p-glow" d="${d}"/><path class="cf-p-core" d="${d}"/><path class="cf-p-hot" d="${d}"/>
          <path class="cf-p-flow" d="${d}"/>
          <g class="cf-p-arrows">${chevrons(pipe.points)}</g>
        </g>`;
    }).join("");

    const exchanger = (key, hx, label, ref, labelAt, labelWidth) => {
      const face = { x: hx.x + 20, y: hx.y + 12, width: hx.width - 30, height: hx.height - 24 };
      const fins = [];
      for (let y = hx.y + 6; y < hx.y + hx.height - 4; y += 5) fins.push(`M${hx.x + 2} ${y} H${hx.x + 14}`);
      const zig = [`M${face.x + 6} ${face.y + 8}`];
      let right = true;
      for (let y = face.y + 18; y <= face.y + face.height - 8; y += 10) {
        zig.push(`L${right ? face.x + face.width - 6 : face.x + 6} ${y}`);
        right = !right;
      }
      const zd = zig.join(" ");
      return `
        <g class="cf-hx" data-ref="${ref}">
          <rect class="cf-hx-shadow" x="${hx.x + 4}" y="${hx.y + 6}" width="${hx.width}" height="${hx.height}" rx="7"/>
          <rect class="cf-hx-body" x="${hx.x}" y="${hx.y}" width="${hx.width}" height="${hx.height}" rx="7" fill="${url("copper")}"/>
          <path class="cf-hx-fins" d="${fins.join(" ")}"/>
          <rect class="cf-hx-face" x="${face.x}" y="${face.y}" width="${face.width}" height="${face.height}" rx="4"/>
          <path class="cf-hx-zig-glow" d="${zd}" stroke="${url(`zig-${key}`)}"/>
          <path class="cf-hx-zig" d="${zd}"/>
          <path class="cf-hx-zig-on" d="${zd}" stroke="${url(`zig-${key}`)}"/>
          <g class="cf-hx-tag cf-label" transform="translate(${labelAt[0]} ${labelAt[1]}) rotate(-90)"><rect x="${-labelWidth / 2}" y="-12" width="${labelWidth}" height="24" rx="12"/><text class="cf-hx-label" x="0" y="1">${label}</text></g>
        </g>`;
    };

    const grooves = Array.from({ length: 21 }, (_, index) => {
      const x0 = 60 + index * 24;
      const x1 = round1(x0 + (x0 - 300) * 0.1);
      return `M${x0} 218 C${x0} 250 ${x1} 262 ${x1} 296`;
    }).join(" ");
    const hoodtex = `<pattern id="${id("hoodtex")}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#16191c"/><circle cx="1.5" cy="1.5" r="1" fill="#24282c"/><circle cx="4.5" cy="4.5" r="1" fill="#0d0f11"/></pattern>`;
    const ribs = `<pattern id="${id("ribs")}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#14171a"/><rect x="1" width="6" height="12" fill="#1d2125"/><rect x="7" width="1.5" height="12" fill="#0b0d0f"/></pattern>`;
    const foam = `<pattern id="${id("foam")}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#121417"/><circle cx="3" cy="4" r="1.1" fill="#1a1d21"/><circle cx="11" cy="2" r=".8" fill="#191c20"/><circle cx="8" cy="10" r="1.2" fill="#0d0f11"/><circle cx="14" cy="13" r=".9" fill="#1b1e22"/><circle cx="2" cy="13" r=".7" fill="#0e1012"/></pattern>`;
    const zigGradient = (key, top, bottom, hx) => `<linearGradient id="${id(`zig-${key}`)}" gradientUnits="userSpaceOnUse" x1="0" y1="${hx.y}" x2="0" y2="${hx.y + hx.height}"><stop offset="0" stop-color="${top}"/><stop offset=".5" stop-color="${top}"/><stop offset=".62" stop-color="${bottom}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
    const connections = CONNECTIONS.map(({ x }) => `
      <rect class="cf-conn-nut" x="${x - 11}" y="910" width="22" height="18" rx="3" fill="${url("brass")}"/>
      <path class="cf-nut-line" d="M${x - 11} 919 H${x + 11}"/>
      <rect class="cf-conn-stub" x="${x - 7}" y="928" width="14" height="22" rx="2" fill="${url("steelv")}"/>
      <rect class="cf-conn-ring" x="${x - 9}" y="944" width="18" height="6" rx="2"/>`).join("");
    const connectionLabels = CONNECTIONS.map(({ id: code, x }) => `<text class="cf-conn-label" x="${x}" y="982">${code}</text>`).join("");
    const miniLeds = LEDS.map((led, index) => `<g class="cf-led" data-ref="mled-${led.id}" data-led="off"><circle class="cf-led-halo" cx="${256 + index * 22}" cy="140" r="7.5"/><circle class="cf-led-dot" cx="${256 + index * 22}" cy="140" r="3.8"/></g>`).join("");

    return `
      <svg class="cf-svg cf-svg-back${config.background_image ? " is-photo" : ""}${config.show_labels ? "" : " no-labels"}" viewBox="0 0 ${VIEW.width} ${VIEW.height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          ${ribs}${foam}${hoodtex}
          <linearGradient id="${id("hood-shade")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
          <linearGradient id="${id("side-shade")}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".4"/><stop offset=".08" stop-color="#000" stop-opacity="0"/><stop offset=".92" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
          <linearGradient id="${id("copper")}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e3d22"/><stop offset=".25" stop-color="#b8744a"/><stop offset=".55" stop-color="#e2a67c"/><stop offset=".8" stop-color="#a9653d"/><stop offset="1" stop-color="#6a3a20"/></linearGradient>
          <linearGradient id="${id("brass")}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a6420"/><stop offset=".45" stop-color="#e8c567"/><stop offset="1" stop-color="#8f6a24"/></linearGradient>
          <linearGradient id="${id("steelv")}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6d767b"/><stop offset=".45" stop-color="#e3e8ea"/><stop offset="1" stop-color="#737c81"/></linearGradient>
          <linearGradient id="${id("rail")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dfe2"/><stop offset=".5" stop-color="#9aa4a9"/><stop offset="1" stop-color="#5f686d"/></linearGradient>
          ${zigGradient("heat", "#ff7a2f", "#3d9bff", HX.heat)}
          ${zigGradient("dhw", "#ff4438", "#3fd0ff", HX.dhw)}
        </defs>

        ${photo}

        <g class="cf-hw">
          <rect x="30" y="206" width="552" height="712" rx="22" fill="rgba(0,0,0,.45)"/>
          <rect class="cf-body" x="22" y="196" width="556" height="710" rx="18" fill="${url("foam")}"/>
          <path class="cf-grooves" d="${grooves}"/>
          <path class="cf-grooves-hi" d="${grooves}"/>
          <rect class="cf-cavity" x="38" y="300" width="524" height="596" rx="14"/>
          <rect x="22" y="196" width="556" height="710" rx="18" fill="${url("side-shade")}"/>
          <rect x="18" y="16" width="564" height="210" rx="34" fill="rgba(0,0,0,.55)"/>
          <rect class="cf-hood" x="12" y="8" width="576" height="208" rx="34" fill="${url("hoodtex")}"/>
          <rect x="12" y="8" width="576" height="208" rx="34" fill="${url("hood-shade")}"/>
          <rect class="cf-rail-bar" x="34" y="896" width="532" height="14" rx="3" fill="${url("rail")}"/>
          ${[108, 214, 330, 428, 520].map((x) => `<rect class="cf-bracket" x="${x - 10}" y="886" width="20" height="12" rx="2"/><circle class="cf-screw" cx="${x}" cy="903" r="3.5"/>`).join("")}
          ${connections}
          ${exchanger("heat", HX.heat, "VARME", "hxHeat", [466, 560], 78)}
          ${exchanger("dhw", HX.dhw, "BRUGSVAND", "hxDhw", [533, 640], 122)}
        </g>
        <g class="cf-labels">${connectionLabels}</g>
      </svg>

      <svg class="cf-svg cf-svg-front${config.background_image ? " is-photo" : ""}${config.show_labels ? "" : " no-labels"}" data-ref="svg" viewBox="0 0 ${VIEW.width} ${VIEW.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Calefa flowdiagram">
        <defs>
          <linearGradient id="${id("brass2")}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0d27a"/><stop offset=".5" stop-color="#c79a3c"/><stop offset="1" stop-color="#7d5a1c"/></linearGradient>
          <linearGradient id="${id("panel")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f6"/><stop offset="1" stop-color="#cfd5d7"/></linearGradient>
          <linearGradient id="${id("lcd")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3ea"/><stop offset="1" stop-color="#a9c6d0"/></linearGradient>
          <radialGradient id="${id("vessel")}" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#b9c2c7"/><stop offset="1" stop-color="#5c666c"/></radialGradient>
        </defs>

        <g class="cf-pipes">${pipes}</g>

        <g class="cf-cables"><path d="M300 222 C300 300 250 420 330 500 C360 530 372 540 372 562 M312 222 C318 300 400 330 440 404 M292 222 C280 420 230 600 250 700 C262 760 318 760 323 800"/></g>

        <g class="cf-comp">
          ${nut(72, 330)}${nut(470, 330)}${nut(548, 330)}${nut(470, 376, false)}${nut(548, 436, false)}
          ${nut(412, 372)}${nut(142, 372)}${nut(412, 460)}${nut(486, 460, false)}${nut(430, 680, false)}
          ${nut(452, 706, false)}${nut(476, 706, false)}${nut(510, 800, false)}${nut(548, 800, false)}
          ${nut(290, 760)}${nut(380, 790)}${nut(72, 700)}${nut(142, 700)}

          <g class="cf-strainer"><path d="M258 330 L286 294" stroke="${url("brass2")}"/><rect x="276" y="278" width="26" height="20" rx="5" transform="rotate(-52 289 288)" fill="${url("brass2")}"/><rect x="228" y="318" width="60" height="24" rx="7" fill="${url("brass2")}"/><path class="cf-nut-line" d="M240 318 V342 M276 318 V342"/></g>
          <g class="cf-ball"><rect x="60" y="500" width="24" height="34" rx="5" fill="${url("brass2")}"/><rect x="84" y="508" width="18" height="18" rx="4" fill="${url("brass2")}"/><circle class="cf-dot-green" cx="93" cy="517" r="5.5"/></g>
          <g class="cf-ball"><rect x="130" y="846" width="24" height="34" rx="5" fill="${url("brass2")}"/><rect x="154" y="854" width="18" height="18" rx="4" fill="${url("brass2")}"/><circle class="cf-dot-red" cx="163" cy="863" r="5.5"/></g>
          <g class="cf-meter"><rect x="130" y="560" width="24" height="96" rx="5"/><path d="M130 584 H154 M130 632 H154"/></g>
          <g class="cf-safety"><rect x="371" y="846" width="18" height="24" rx="4" fill="${url("brass2")}"/><rect x="356" y="850" width="16" height="16" rx="4"/></g>
          <g class="cf-vessel"><path d="M526 878 H542"/><circle cx="506" cy="878" r="21" fill="${url("vessel")}"/><circle cx="506" cy="878" r="8"/></g>

          <g class="cf-valve" data-ref="valveHeat">
            <path class="cf-valve-body" d="M400 568 L412 582 L424 568 Z M400 596 L412 582 L424 596 Z" fill="${url("brass2")}"/>
            <rect class="cf-actuator-stem" x="396" y="577" width="10" height="10" rx="2" fill="${url("brass2")}"/>
            <rect class="cf-actuator" x="358" y="562" width="40" height="40" rx="9"/>
            <circle class="cf-actuator-led" cx="390" cy="570" r="3.5"/>
            <rect class="cf-actuator-track" x="365" y="588" width="26" height="4" rx="2"/>
            <rect class="cf-actuator-fill" x="365" y="588" width="26" height="4" rx="2"/>
            <text class="cf-actuator-text cf-label cf-minor" x="352" y="588" text-anchor="end" data-ref="valveHeatText">–</text>
          </g>
          <g class="cf-valve" data-ref="valveDhw">
            <path class="cf-valve-body" d="M438 448 L452 460 L438 472 Z M466 448 L452 460 L466 472 Z" fill="${url("brass2")}"/>
            <rect class="cf-actuator-stem" x="447" y="442" width="10" height="10" rx="2" fill="${url("brass2")}"/>
            <rect class="cf-actuator" x="432" y="404" width="40" height="40" rx="9"/>
            <circle class="cf-actuator-led" cx="464" cy="412" r="3.5"/>
            <rect class="cf-actuator-track" x="439" y="430" width="26" height="4" rx="2"/>
            <rect class="cf-actuator-fill" x="439" y="430" width="26" height="4" rx="2"/>
            <text class="cf-actuator-text cf-label cf-minor" x="426" y="428" text-anchor="end" data-ref="valveDhwText">–</text>
          </g>

          <g class="cf-pump" data-ref="pump">
            <rect class="cf-pump-volute" x="274" y="790" width="32" height="96" rx="8" fill="${url("brass2")}"/>
            <rect class="cf-pump-motor" x="246" y="794" width="88" height="84" rx="22"/>
            <circle class="cf-pump-face" cx="290" cy="836" r="30"/>
            <rect class="cf-pump-badge" x="274" y="831" width="32" height="10" rx="5"/>
            <rect class="cf-pump-box" x="316" y="800" width="14" height="22" rx="3"/>
            <circle class="cf-pump-led" cx="290" cy="818" r="3.2"/>
            <g class="cf-pump-ring">
              <circle cx="290" cy="836" r="52" fill="none" stroke="none"/>
              <path d="M290 784 A52 52 0 1 1 238 836"/>
              <path class="cf-pump-arrow" d="M230 830 L238 844 L246 830 Z"/>
            </g>
            <text class="cf-pump-text cf-label cf-minor" x="230" y="800" text-anchor="end" data-ref="pumpText">–</text>
          </g>
        </g>

        <g class="cf-ctrl">
          <rect x="${DISPLAY_BOX.x + 4}" y="${DISPLAY_BOX.y + 6}" width="${DISPLAY_BOX.width}" height="${DISPLAY_BOX.height}" rx="10" fill="rgba(0,0,0,.45)"/>
          <rect class="cf-ctrl-panel" x="${DISPLAY_BOX.x}" y="${DISPLAY_BOX.y}" width="${DISPLAY_BOX.width}" height="${DISPLAY_BOX.height}" rx="10" fill="${url("panel")}"/>
          <rect class="cf-ctrl-lcd" x="244" y="62" width="112" height="60" rx="4" fill="${url("lcd")}"/>
          <text class="cf-lcd-title cf-minor" x="252" y="78" data-ref="miniTitle">CALEFA</text>
          <text class="cf-lcd-big" x="300" y="113" data-ref="miniValue">–</text>
          <rect class="cf-ctrl-tag" x="364" y="62" width="28" height="8" rx="4"/>
          ${miniLeds}
          <path class="cf-ctrl-glyph" d="M280 156 H290 L285 163 Z"/>
          <circle class="cf-ctrl-glyph" cx="300" cy="159" r="4"/>
          <path class="cf-ctrl-glyph" d="M310 163 H320 L315 156 Z"/>
          <rect class="cf-ctrl-square" x="212" y="154" width="14" height="14" rx="2"/>
        </g>
      </svg>`;
  }

  _modalMarkup() {
    const tabs = CALEFA_DISPLAY_MENU.map((page, index) => `
      <button class="cf-tab" type="button" role="tab" data-action="display-page" data-page="${index}" aria-selected="false">
        <ha-icon icon="${page.icon}"></ha-icon><span>${escapeHtml(page.tab)}</span>
      </button>`).join("");
    const leds = LEDS.map((led) => `<span class="cf-dled" data-ref="dled-${led.id}" data-led="off" role="img" aria-label="${led.label}"><i></i><ha-icon icon="${led.icon}"></ha-icon></span>`).join("");
    return `
      <div class="cf-modal" data-ref="modal" hidden>
        <div class="cf-modal-backdrop" data-action="close-display"></div>
        <section class="cf-device" data-ref="device" role="dialog" aria-modal="true" aria-labelledby="${this._uid}-device-title" tabindex="-1">
          <div class="cf-device-head">
            <div class="cf-device-name"><strong id="${this._uid}-device-title">${escapeHtml(this._config.title)}</strong><small>Virtuelt display · kun visning</small></div>
            <button class="cf-device-close" type="button" data-ref="closeButton" data-action="close-display" aria-label="Luk display"><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="cf-device-face">
            <div class="cf-lcd">
              <div class="cf-lcd-head"><ha-icon data-ref="lcdIcon" icon="mdi:home-outline"></ha-icon><strong data-ref="lcdTitle">CALEFA</strong><span data-ref="lcdIndex">1/${CALEFA_DISPLAY_MENU.length}</span></div>
              <div class="cf-lcd-body" data-ref="lcdBody"></div>
              <div class="cf-lcd-scroll" aria-hidden="true"><span data-ref="lcdThumb"></span></div>
            </div>
            <div class="cf-device-controls">
              <div class="cf-dleds">${leds}</div>
              <div class="cf-keys">
                <button class="cf-key" type="button" data-action="lcd-down" aria-label="Pil ned"><ha-icon icon="mdi:menu-down"></ha-icon></button>
                <button class="cf-key" type="button" data-action="lcd-enter" aria-label="Enter – næste menu"><ha-icon icon="mdi:keyboard-return"></ha-icon></button>
                <button class="cf-key" type="button" data-action="lcd-up" aria-label="Pil op"><ha-icon icon="mdi:menu-up"></ha-icon></button>
              </div>
            </div>
          </div>
          <div class="cf-tabs" role="tablist" aria-label="Displaymenu">${tabs}</div>
          <p class="cf-device-note">Live data fra Home Assistant. Displayet kan ikke ændre indstillinger på anlægget.</p>
        </section>
      </div>`;
  }

  // ---------------------------------------------------------------- incremental updates

  _text(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  _toggle(element, name, on) {
    if (element && element.classList.contains(name) !== on) element.classList.toggle(name, on);
  }

  _attr(element, name, value) {
    if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  _prop(element, name, value) {
    if (element && element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }

  _update() {
    if (!this._built || !this._hass || !this._config) return;
    this._rememberStates(this._hass);
    try {
      this._syncLocale();
      const model = this._computeModel();
      this._model = model;
      this._applyHeader(model);
      this._applyMetrics(model);
      this._applyDiagram(model);
      this._applyFooter(model);
      if (this._displayOpen) this._applyDisplay(model);
    } catch (error) {
      if (!this._reportedError) {
        this._reportedError = true;
        console.warn("ha-calefa-flow-card: could not update", error);
      }
    }
  }

  _applyHeader(model) {
    const refs = this._refs;
    this._text(refs["pill-heat-text"], model.heatingActive ? "aktiv" : "standby");
    this._text(refs["pill-heat-desc"], model.heatingActive ? "Leverer varme til boligen" : model.pumpActive ? "Pumpen cirkulerer" : "Intet varmebehov lige nu");
    this._toggle(refs["pill-heat"], "is-heat", model.heatingActive);
    this._text(refs["pill-dhw-text"], model.dhwTap ? "aktiv" : model.dhwBypass ? "bypass" : "standby");
    this._text(refs["pill-dhw-desc"], model.dhwTap ? "Tapning i gang" : model.dhwBypass ? "Cirkulation holder rør varme" : "Ingen tapning lige nu");
    this._toggle(refs["pill-dhw"], "is-dhw", model.dhwTap);
    this._toggle(refs["pill-dhw"], "is-bypass", model.dhwBypass);
  }

  _valveStatus(position, open) {
    if (position === null) return open ? "Åben" : "Lukket";
    if (position <= this._config.valve_threshold) return "Lukket";
    return position >= 99 ? "Fuldt åben" : "Regulerer";
  }

  _applyMetrics(model) {
    const circuits = { primary: model.primary, heatLoop: model.heatLoop, dhwTap: model.dhwTap };
    for (const metric of METRICS) {
      const nodes = this._metrics.get(metric.id);
      if (!nodes) continue;
      let parts;
      let sub = "";
      let on = false;
      let available = true;
      if (metric.kind === "pump") {
        on = model.pumpActive;
        const speed = this._config.pump_speed && this._num("pump_speed") !== null;
        parts = speed ? this._formatParts("pump_speed", "percent") : [model.pumpText, ""];
        sub = speed ? (on ? "Kører" : "Stop") : "";
        available = model.pumpText !== "–";
      } else if (metric.kind === "valve") {
        const heat = metric.id === "heating_valve";
        on = heat ? Boolean(model.heatValveOpen ?? model.heatPrimary) : Boolean(model.dhwValveOpen ?? model.dhwPrimary);
        parts = this._formatParts(metric.id, "valve");
        sub = !heat && model.dhwBypass ? "Bypass" : this._valveStatus(heat ? model.heatingValve : model.dhwValve, on);
        available = this._available(metric.id);
      } else {
        parts = this._formatParts(metric.id, metric.kind);
        on = Boolean(circuits[metric.circuit]);
        available = this._available(metric.id);
        if (metric.subKey && this._config[metric.subKey] && this._available(metric.subKey)) sub = this._format(metric.subKey, "flow");
        else if (metric.subDerived === "cooling" && model.cooling !== null) sub = `Afkøling ${this._derived("cooling", model)}`;
        else sub = metric.subText || "";
      }
      this._text(nodes.num, parts[0]);
      this._text(nodes.unit, parts[1]);
      this._text(nodes.sub, sub);
      this._toggle(nodes.element, "is-on", on);
      this._toggle(nodes.element, "is-unavailable", !available);
      this._attr(nodes.element, "aria-disabled", this._stateObj(this._metricTarget(metric)) ? "false" : "true");
      this._attr(nodes.element, "aria-label", `${metric.label}: ${parts.join(" ").trim()}${sub ? `, ${sub}` : ""}`);
    }
  }

  _applyDiagram(model) {
    const refs = this._refs;
    const circuits = {
      primary: model.primary,
      heatPrimary: model.heatPrimary,
      dhwPrimary: model.dhwPrimary,
      heatLoop: model.heatLoop,
      dhwTap: model.dhwTap,
    };
    for (const pipe of this._pipes) this._toggle(pipe.element, "is-on", Boolean(circuits[pipe.circuit]));
    this._toggle(refs.hxHeat, "is-on", model.heatPrimary || model.heatLoop);
    this._toggle(refs.hxDhw, "is-on", model.dhwPrimary || model.dhwTap);
    this._toggle(refs.pump, "is-on", model.pumpActive);

    const heatValveOn = Boolean(model.heatValveOpen ?? model.heatPrimary);
    const dhwValveOn = Boolean(model.dhwValveOpen ?? model.dhwPrimary);
    this._toggle(refs.valveHeat, "is-on", heatValveOn);
    this._toggle(refs.valveDhw, "is-on", dhwValveOn);
    this._prop(refs.valveHeat, "--pos", String(round1((model.heatingValve ?? (heatValveOn ? 100 : 0)) / 100)));
    this._prop(refs.valveDhw, "--pos", String(round1((model.dhwValve ?? (dhwValveOn ? 100 : 0)) / 100)));
    this._text(refs.valveHeatText, this._config.heating_valve ? this._format("heating_valve", "valve") : heatValveOn ? "Åben" : "Luk");
    this._text(refs.valveDhwText, this._config.dhw_valve ? this._format("dhw_valve", "valve") : dhwValveOn ? "Åben" : "Luk");
    this._text(refs.pumpText, model.pumpText === "–" ? (model.pumpActive ? "Kører" : "Stop") : model.pumpText);

    const svg = refs.svg;
    this._prop(svg, "--cf-dur-primary", `${FLOW_DURATIONS[model.levels.primary]}s`);
    this._prop(svg, "--cf-dur-heat", `${FLOW_DURATIONS[model.levels.heat]}s`);
    this._prop(svg, "--cf-dur-dhw", `${FLOW_DURATIONS[model.levels.dhw]}s`);
    this._prop(svg, "--cf-dur-pump", `${PUMP_DURATIONS[model.levels.pump]}s`);

    const dhwFirst = model.dhwTap && this._config.dhw_temperature;
    const mainKey = dhwFirst ? "dhw_temperature" : this._config.heating_supply ? "heating_supply" : "fjv_supply";
    this._text(refs.miniTitle, model.dhwTap ? "BV" : model.heatingActive ? "VARME" : model.dhwBypass ? "BYPASS" : "STANDBY");
    this._text(refs.miniValue, this._config[mainKey] ? this._format(mainKey, "short-temperature") : "–");

    const leds = this._leds(model);
    for (const led of LEDS) this._attr(refs[`mled-${led.id}`], "data-led", leds[led.id].color);

    const summary = `Calefa flowdiagram. Varme ${model.heatingActive ? "aktiv" : "standby"}, brugsvand ${model.dhwTap ? "aktiv" : model.dhwBypass ? "bypass" : "standby"}, pumpe ${model.pumpActive ? "kører" : "stoppet"}.`;
    this._attr(svg, "aria-label", summary);
  }

  _applyFooter(model) {
    for (const [id, element] of this._footer) {
      const item = FOOTER_ITEMS.find((entry) => entry.id === id);
      this._text(element, item.derived ? this._derived(item.derived, model) : this._format(id, item.kind));
      if (id === "connection") this._toggle(element, "is-ok", this._hass?.connected !== false);
    }
  }

  // ---------------------------------------------------------------- callout lines (wide layout)

  _observeLayout() {
    if (this._layoutObserver || typeof ResizeObserver === "undefined" || !this._built || !this.isConnected) return;
    this._layoutObserver = new ResizeObserver(() => this._layoutLeaders());
    for (const key of ["main", "stageBox", "railLeft", "railRight"]) {
      if (this._refs[key]) this._layoutObserver.observe(this._refs[key]);
    }
  }

  _layoutLeaders() {
    const { leaders, main, stageBox } = this._refs;
    if (!leaders || !main || !stageBox) return;
    const mainRect = main.getBoundingClientRect();
    const stage = stageBox.getBoundingClientRect();
    const parts = [];
    // Callouts only in the wide layout, where tiles sit on both sides of the unit.
    const railLeft = this._refs.railLeft?.getBoundingClientRect();
    const wide = Boolean(railLeft?.width) && railLeft.right <= stage.left + 1;
    if (wide && mainRect.width && stage.width) {
      for (const [id, nodes] of this._metrics) {
        const metric = METRICS.find((entry) => entry.id === id);
        const rect = nodes.element.getBoundingClientRect();
        const leftSide = rect.right <= stage.left + 1;
        const rightSide = rect.left >= stage.right - 1;
        if (!metric?.anchor || !rect.width || (!leftSide && !rightSide)) continue;
        const sx = round1((leftSide ? rect.right : rect.left) - mainRect.left);
        const sy = round1(rect.top + rect.height / 2 - mainRect.top);
        const ax = round1(stage.left - mainRect.left + (metric.anchor[0] / VIEW.width) * stage.width);
        const ay = round1(stage.top - mainRect.top + (metric.anchor[1] / VIEW.height) * stage.height);
        const kx = round1(sx + (leftSide ? 14 : -14));
        parts.push(`<g data-tone="${metric.tone}"><path d="M${sx} ${sy} H${kx} L${ax} ${ay}"/><circle cx="${ax}" cy="${ay}" r="6"/><circle class="cf-leader-dot" cx="${ax}" cy="${ay}" r="2.4"/></g>`);
      }
    }
    const markup = parts.join("");
    if (markup === this._leaderMarkup) return;
    this._leaderMarkup = markup;
    this._attr(leaders, "viewBox", `0 0 ${round1(mainRect.width) || 1} ${round1(mainRect.height) || 1}`);
    leaders.innerHTML = markup;
  }

  _leds(model) {
    const mode = model.dhwTap
      ? { color: "cyan", text: "Brugsvand tændt" }
      : model.dhwBypass
        ? { color: "cyan-blink", text: "Bypass aktiv" }
        : model.heatingActive
          ? { color: "red", text: "Varme tændt" }
          : { color: "off", text: "Ingen brugsvand eller varme" };
    const peripheral = this._config.outdoor_temperature && this._available("outdoor_temperature");
    return {
      power: model.hasData ? { color: "green", text: "Strømmen er tændt" } : { color: "off", text: "Ingen data" },
      warning: model.unavailable > 0
        ? { color: "yellow", text: `${model.unavailable} ${model.unavailable === 1 ? "enhed" : "enheder"} utilgængelig` }
        : { color: "off", text: "Alle systemer OK" },
      mode,
      lan: this._hass?.connected === false ? { color: "off", text: "Ingen forbindelse" } : { color: "green", text: "Forbundet" },
      peripheral: peripheral ? { color: "green", text: "Udeføler aktiv" } : { color: "off", text: "Ingen periferiudstyr" },
    };
  }

  // ---------------------------------------------------------------- virtual display

  _pageRows(page) {
    const configured = (key) => Boolean(this._config[key]);
    return page.rows.filter((row) => {
      if (row.key) return configured(row.key);
      if (row.requires) return row.any ? row.requires.some(configured) : row.requires.every(configured);
      return true;
    });
  }

  _renderDisplayPage() {
    const page = CALEFA_DISPLAY_MENU[this._displayPage];
    const refs = this._refs;
    const rows = this._pageRows(page);
    const heroes = (page.hero || []).filter((hero) => this._config[hero.key]);
    const hero = heroes.length ? `<div class="cf-lcd-hero"><strong>–</strong><span></span></div>` : "";
    const list = rows.length
      ? rows.map((row) => `<li class="cf-lcd-row"><span>${escapeHtml(row.label)}</span><strong>–</strong></li>`).join("")
      : `<li class="cf-lcd-row is-empty"><span>Ingen entities valgt</span></li>`;
    refs.lcdBody.innerHTML = `${hero}<ul class="cf-lcd-list">${list}</ul>`;
    const listElement = refs.lcdBody.querySelector(".cf-lcd-list");
    this._lcd = {
      page,
      rows,
      heroes,
      heroValue: refs.lcdBody.querySelector(".cf-lcd-hero strong"),
      heroCaption: refs.lcdBody.querySelector(".cf-lcd-hero span"),
      list: listElement,
      items: rows.length ? [...listElement.querySelectorAll(".cf-lcd-row")] : [],
    };
    listElement.addEventListener("scroll", () => this._updateScrollThumb(), { passive: true });
    this._selection = -1;
    this._attr(refs.lcdIcon, "icon", page.icon);
    this._text(refs.lcdTitle, page.title);
    this._text(refs.lcdIndex, `${this._displayPage + 1}/${CALEFA_DISPLAY_MENU.length}`);
    for (const tab of this.shadowRoot.querySelectorAll(".cf-tab")) {
      this._attr(tab, "aria-selected", tab.getAttribute("data-page") === String(this._displayPage) ? "true" : "false");
    }
    if (this._model) this._applyDisplay(this._model);
    this._updateScrollThumb();
  }

  _applyDisplay(model) {
    const lcd = this._lcd;
    if (!lcd) return;
    if (lcd.heroValue) {
      const hero = lcd.heroes.find((entry) => this._available(entry.key)) || lcd.heroes[0];
      this._text(lcd.heroValue, this._format(hero.key, "short-temperature"));
      this._text(lcd.heroCaption, hero.caption);
    }
    lcd.rows.forEach((row, index) => {
      const value = row.derived ? this._derived(row.derived, model) : this._format(row.key, row.kind);
      this._text(lcd.items[index]?.querySelector("strong"), value);
    });
    const leds = this._leds(model);
    for (const led of LEDS) {
      const element = this._refs[`dled-${led.id}`];
      this._attr(element, "data-led", leds[led.id].color);
      this._attr(element, "aria-label", `${led.label}: ${leds[led.id].text}`);
      this._attr(element, "title", `${led.label}: ${leds[led.id].text}`);
    }
  }

  _updateScrollThumb() {
    const list = this._lcd?.list;
    const thumb = this._refs.lcdThumb;
    if (!list || !thumb) return;
    const visible = list.scrollHeight > 0 ? clamp(list.clientHeight / list.scrollHeight, 0.12, 1) : 1;
    const maxScroll = Math.max(1, list.scrollHeight - list.clientHeight);
    const offset = (list.scrollTop / maxScroll) * (1 - visible);
    this._prop(thumb, "height", `${round1(visible * 100)}%`);
    this._prop(thumb, "top", `${round1(offset * 100)}%`);
  }

  _moveSelection(step) {
    const items = this._lcd?.items || [];
    if (!items.length) return;
    this._selection = this._selection < 0 ? (step > 0 ? 0 : items.length - 1) : (this._selection + step + items.length) % items.length;
    items.forEach((item, index) => this._toggle(item, "is-selected", index === this._selection));
    const item = items[this._selection];
    const list = this._lcd.list;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    this._updateScrollThumb();
  }

  _setDisplayPage(index) {
    const count = CALEFA_DISPLAY_MENU.length;
    this._displayPage = ((index % count) + count) % count;
    this._renderDisplayPage();
  }

  _openDisplay() {
    const refs = this._refs;
    if (!refs.modal || this._displayOpen) return;
    this._displayOpen = true;
    this._displayPage = 0;
    if (!this._model && this._hass) this._model = this._computeModel();
    refs.modal.hidden = false;
    this._toggle(refs.root, "modal-open", true);
    this._renderDisplayPage();
    this._positionDisplay();
    window.addEventListener("keydown", this._onKeydown);
    refs.device?.focus({ preventScroll: true });
    refs.device?.scrollIntoView?.({ block: "nearest" });
  }

  _positionDisplay() {
    const refs = this._refs;
    const card = refs.modal?.parentElement;
    const stage = this.shadowRoot.querySelector(".cf-stage");
    if (!card || !stage || !refs.device) return;
    const stageTop = stage.getBoundingClientRect().top - card.getBoundingClientRect().top;
    const room = card.clientHeight - refs.device.offsetHeight - 12;
    this._prop(refs.modal, "--cf-modal-top", `${Math.round(clamp(Math.min(stageTop, room), 12, Math.max(12, room)))}px`);
  }

  _closeDisplay(restoreFocus = true) {
    const refs = this._refs;
    this._displayOpen = false;
    this._lcd = null;
    window.removeEventListener("keydown", this._onKeydown);
    if (refs.modal) refs.modal.hidden = true;
    this._toggle(refs.root, "modal-open", false);
    if (restoreFocus) refs.displayHit?.focus({ preventScroll: true });
  }

  _setOffscreen(offscreen) {
    this._offscreen = offscreen;
    this._toggle(this._refs.root, "is-offscreen", offscreen);
  }

  // ---------------------------------------------------------------- events

  _handleClick(event) {
    const target = event.composedPath().find((node) => typeof node?.getAttribute === "function" && node.getAttribute("data-action"));
    if (!target) return;
    const action = target.getAttribute("data-action");
    if (action === "more-info") {
      const entityId = this._config?.[target.getAttribute("data-key")];
      if (!entityId || !this._hass?.states?.[entityId]) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }));
    } else if (action === "open-display") {
      this._openDisplay();
    } else if (action === "close-display") {
      this._closeDisplay();
    } else if (action === "display-page") {
      this._setDisplayPage(Number(target.getAttribute("data-page")) || 0);
    } else if (action === "lcd-enter") {
      this._setDisplayPage(this._displayPage + 1);
    } else if (action === "lcd-up") {
      this._moveSelection(-1);
    } else if (action === "lcd-down") {
      this._moveSelection(1);
    }
  }

  _handleKeydown(event) {
    if (!this._displayOpen) return;
    const inside = event.composedPath().includes(this);
    const active = document.activeElement;
    const nothingFocused = !active || active === document.body || active === document.documentElement;
    if (event.key === "Escape" && (inside || nothingFocused)) {
      event.preventDefault();
      event.stopPropagation();
      this._closeDisplay(inside);
      return;
    }
    if (!inside) return;
    const moves = { ArrowDown: () => this._moveSelection(1), ArrowUp: () => this._moveSelection(-1), ArrowRight: () => this._setDisplayPage(this._displayPage + 1), ArrowLeft: () => this._setDisplayPage(this._displayPage - 1) };
    if (moves[event.key]) {
      event.preventDefault();
      moves[event.key]();
    }
  }
}

const CALEFA_STYLES = `
  :host {
    display: block;
    container: calefa-card / inline-size;
    --cf-supply: #ff7a2f;
    --cf-return: #3d95ff;
    --cf-heat: #ff9a3c;
    --cf-heat-return: #56b4ff;
    --cf-dhw: #ff4d4d;
    --cf-cold: #33d1e6;
    --cf-ok: #35e39a;
    --cf-idle: #5f6f7b;
    --cf-component: #35e39a;
    --cf-text: #eef5fa;
    --cf-muted: rgba(186, 206, 222, 0.72);
    --cf-line: rgba(255, 255, 255, 0.09);
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  button { font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
  ha-card {
    display: block;
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(140, 170, 195, 0.16);
    border-radius: var(--ha-card-border-radius, 24px);
    background:
      radial-gradient(90% 55% at 50% 38%, rgba(32, 74, 104, 0.3), transparent 70%),
      linear-gradient(160deg, #0a1722 0%, #0c1b28 50%, #07121b 100%);
    color: var(--cf-text);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
  }
  .cf { padding: 16px 14px 14px; }

  /* ---------- header ---------- */
  .cf-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 16px; margin-bottom: 12px; }
  .cf-brand { flex: 1 1 200px; min-width: 0; }
  .cf-brand h2 { margin: 0; font-size: 26px; font-size: clamp(23px, 4.6cqw, 46px); font-weight: 800; line-height: 1.04; letter-spacing: -0.03em; overflow-wrap: anywhere; }
  .cf-brand p { margin: 6px 0 0; color: var(--cf-muted); font-size: 14px; font-size: clamp(13px, 1.8cqw, 20px); }
  .cf-pills { display: flex; gap: 10px; min-width: 0; }
  .cf-pill { display: flex; align-items: center; gap: 12px; min-width: 0; min-height: 56px; padding: 10px 16px 10px 12px; border: 1px solid var(--cf-line); border-radius: 16px; background: rgba(255, 255, 255, 0.035); color: var(--cf-muted); text-align: left; transition: border-color .3s, background .3s, box-shadow .3s; }
  button.cf-pill { cursor: pointer; }
  .cf-pill-icon { display: grid; place-items: center; flex: 0 0 auto; color: var(--cf-idle); }
  .cf-pill-icon ha-icon { --mdc-icon-size: 30px; }
  .cf-pill-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
  .cf-pill small { color: #dbe6ee; font-size: 13px; }
  .cf-pill strong { overflow: hidden; color: var(--cf-text); font-size: 19px; white-space: nowrap; text-overflow: ellipsis; }
  .cf-pill em { overflow: hidden; margin-top: 2px; color: var(--cf-muted); font-size: 12px; font-style: normal; white-space: nowrap; text-overflow: ellipsis; }
  .cf-pill.is-heat { border-color: rgba(255, 122, 47, .6); background: linear-gradient(135deg, rgba(255, 122, 47, .14), rgba(255, 122, 47, .03)); box-shadow: 0 0 26px rgba(255, 122, 47, .12); }
  .cf-pill.is-heat .cf-pill-icon { color: var(--cf-supply); }
  .cf-pill.is-dhw { border-color: rgba(255, 77, 77, .6); background: linear-gradient(135deg, rgba(255, 77, 77, .14), rgba(255, 77, 77, .03)); }
  .cf-pill.is-dhw .cf-pill-icon { color: var(--cf-dhw); }
  .cf-pill-dhw:not(.is-dhw) .cf-pill-icon { color: #5aa9ff; }
  .cf-pill.is-bypass { border-style: dashed; border-color: rgba(51, 209, 230, .5); }
  .cf-pill.is-bypass .cf-pill-icon { color: var(--cf-cold); }

  /* ---------- layout (compact first) ---------- */
  .cf-main { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .cf-rail { display: contents; }
  .cf-stage { grid-column: 1 / -1; order: -1; justify-self: center; width: 100%; max-width: 440px; margin-bottom: 6px; }
  .cf-stage-box { position: relative; width: 100%; aspect-ratio: 3 / 5; container: cf-stage / inline-size; }
  @supports not (aspect-ratio: 3 / 5) { .cf-stage-box { height: 0; padding-bottom: 166.667%; } }
  .cf-leaders { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .cf-leaders path { fill: none; stroke: var(--tone); stroke-width: 1.5; stroke-opacity: .8; }
  .cf-leaders circle { fill: #09121a; stroke: var(--tone); stroke-width: 2; }
  .cf-leaders .cf-leader-dot { fill: var(--tone); stroke: none; }

  /* ---------- metric tiles ---------- */
  .cf-metric { --tone: var(--cf-idle); position: relative; z-index: 2; display: flex; align-items: center; gap: 11px; order: var(--o, 0); width: 100%; min-width: 0; min-height: 62px; padding: 9px 12px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--tone) 38%, transparent); border-radius: 16px; background: linear-gradient(135deg, color-mix(in srgb, var(--tone) 11%, transparent), rgba(6, 13, 20, .78) 70%); text-align: left; cursor: pointer; transition: border-color .3s, transform .12s, box-shadow .3s; }
  [data-tone="supply"] { --tone: var(--cf-supply); }
  [data-tone="return"] { --tone: var(--cf-return); }
  [data-tone="heat"] { --tone: var(--cf-heat); }
  [data-tone="heat-return"] { --tone: var(--cf-heat-return); }
  [data-tone="dhw"] { --tone: var(--cf-dhw); }
  [data-tone="cold"] { --tone: var(--cf-cold); }
  .cf-leaders [data-tone="component"] { --tone: var(--cf-ok); }
  .cf-metric[data-tone="component"].is-on { --tone: var(--cf-ok); }
  .cf-metric.is-on { border-color: color-mix(in srgb, var(--tone) 70%, transparent); box-shadow: 0 0 22px color-mix(in srgb, var(--tone) 14%, transparent); }
  .cf-metric[aria-disabled="true"] { cursor: default; }
  .cf-metric:not([aria-disabled="true"]):active { transform: scale(.985); }
  .cf-metric-icon { display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; color: var(--tone); }
  .cf-metric-icon ha-icon { --mdc-icon-size: 28px; }
  .cf-metric-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .cf-metric-label, .cf-metric-sub { overflow: hidden; line-height: 1.15; white-space: nowrap; text-overflow: ellipsis; }
  .cf-metric-label { color: #dbe6ee; font-size: 12px; }
  .cf-metric-sub { color: var(--cf-muted); font-size: 11px; }
  .cf-metric-sub:empty { display: none; }
  .cf-metric-value { display: flex; align-items: baseline; gap: 3px; min-width: 0; overflow: hidden; white-space: nowrap; line-height: 1.05; }
  .cf-num { overflow: hidden; color: var(--tone); font-size: 21px; font-weight: 800; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .cf-unit { color: var(--cf-muted); font-size: 13px; font-weight: 500; }
  .cf-metric[data-tone="component"] .cf-num { color: var(--cf-text); }
  .cf-metric.is-unavailable .cf-num { color: var(--cf-muted); }
  .cf-metric.span-mobile { grid-column: 1 / -1; }

  /* ---------- footer ---------- */
  .cf-footer { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--cf-line); }
  .cf-foot { display: flex; align-items: center; gap: 10px; min-width: 0; min-height: 48px; padding: 8px 10px; border: 1px solid var(--cf-line); border-radius: 13px; background: rgba(255, 255, 255, 0.025); text-align: left; }
  button.cf-foot { cursor: pointer; }
  .cf-foot ha-icon { --mdc-icon-size: 24px; flex: 0 0 auto; color: #b9cfdd; }
  .cf-foot span { min-width: 0; }
  .cf-foot small { display: block; overflow: hidden; color: var(--cf-muted); font-size: 11px; white-space: nowrap; text-overflow: ellipsis; }
  .cf-foot strong { display: block; overflow: hidden; font-size: 15px; white-space: nowrap; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .cf-foot strong.is-ok { color: var(--cf-ok); }
  .cf-foot-more { display: none; place-items: center; justify-self: end; width: 48px; height: 48px; border: 1px solid rgba(255, 255, 255, .16); border-radius: 50%; background: rgba(255, 255, 255, .03); cursor: pointer; }
  .cf-foot-more ha-icon { --mdc-icon-size: 22px; }

  button:focus-visible, .cf-device:focus-visible { outline: 2px solid #7fdcff; outline-offset: 2px; }
  .cf-device:focus:not(:focus-visible) { outline: none; }

  /* ---------- unit drawing ---------- */
  .cf-svg { position: absolute; inset: 0; display: block; width: 100%; height: 100%; overflow: visible; font-family: inherit; }
  .cf-svg text { font-variant-numeric: tabular-nums; }
  .cf-svg-front { transform: translateZ(0); }
  .cf-hood { stroke: #262b30; stroke-width: 2; }
  .cf-body { stroke: #1d2226; stroke-width: 2; }
  .cf-grooves { fill: none; stroke: #07080a; stroke-width: 4; stroke-linecap: round; }
  .cf-grooves-hi { fill: none; stroke: rgba(255, 255, 255, .06); stroke-width: 1.2; transform: translateX(3px); }
  .cf-cavity { fill: rgba(0, 0, 0, .14); stroke: rgba(255, 255, 255, .035); stroke-width: 2; }
  .cf-rail-bar { stroke: #3d4549; stroke-width: 1; }
  .cf-bracket { fill: #aab3b7; stroke: #4f585c; stroke-width: 1; }
  .cf-screw { fill: #d7dde0; stroke: #555e62; stroke-width: 1; }
  .cf-conn-nut { stroke: #5b4416; stroke-width: 1.2; }
  .cf-conn-stub { stroke: #4b5458; stroke-width: 1; }
  .cf-conn-ring { fill: #3b4347; }
  .cf-conn-label { fill: rgba(190, 210, 225, .7); font-size: 18px; font-weight: 700; letter-spacing: 1px; text-anchor: middle; }

  .cf-hx-shadow { fill: rgba(0, 0, 0, .45); }
  .cf-hx-body { stroke: #4a2814; stroke-width: 1.5; }
  .cf-hx-fins { fill: none; stroke: rgba(60, 30, 14, .75); stroke-width: 1.6; }
  .cf-hx-face { fill: rgba(95, 52, 28, .45); stroke: rgba(240, 190, 150, .35); stroke-width: 1; }
  .cf-hx-zig { fill: none; stroke: rgba(70, 36, 18, .8); stroke-width: 3; stroke-linejoin: round; }
  .cf-hx-zig-on, .cf-hx-zig-glow { fill: none; stroke-linejoin: round; opacity: 0; transition: opacity .6s; }
  .cf-hx-zig-on { stroke-width: 3.5; }
  .cf-hx-zig-glow { stroke-width: 11; }
  .cf-hx.is-on .cf-hx-zig-on { opacity: 1; }
  .cf-hx.is-on .cf-hx-zig-glow { opacity: .28; }
  .cf-hx-tag rect { fill: rgba(8, 14, 20, .82); }
  .cf-hx-label { fill: #e6eef2; font-size: 13px; font-weight: 800; letter-spacing: 2px; text-anchor: middle; dominant-baseline: central; }

  .cf-p-casing, .cf-p-body, .cf-p-shine, .cf-p-glow, .cf-p-core, .cf-p-hot, .cf-p-flow { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .cf-p-casing { stroke: #05080a; stroke-width: 19; }
  .cf-p-body { stroke: #8f999e; stroke-width: 12; }
  .cf-p-shine { stroke: #eef3f5; stroke-width: 3; stroke-opacity: .55; transform: translate(-1.5px, -1.5px); }
  .cf-p-glow { stroke: var(--pipe); stroke-width: 26; stroke-opacity: 0; transition: stroke-opacity .5s; }
  .cf-p-core { stroke: var(--pipe); stroke-width: 10; stroke-opacity: 0; transition: stroke-opacity .5s; }
  .cf-p-hot { stroke: #fff4e8; stroke-width: 2.5; stroke-opacity: 0; transition: stroke-opacity .5s; }
  .cf-p-flow { display: none; stroke: #fff; stroke-width: 4; stroke-dasharray: 5 23; stroke-opacity: .85; }
  .cf-p-arrows path { fill: none; stroke: #fff; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; opacity: 0; transition: opacity .5s; }
  .cf-pipe.is-on .cf-p-glow { stroke-opacity: .2; }
  .cf-pipe.is-on .cf-p-core { stroke-opacity: .95; }
  .cf-pipe.is-on .cf-p-hot { stroke-opacity: .45; }
  .cf-pipe.is-on .cf-p-flow { display: inline; animation: cf-flow var(--dur, 1s) linear infinite; }
  .cf-pipe.is-on .cf-p-arrows path { opacity: .8; }
  .s-primary { --dur: var(--cf-dur-primary, 1s); }
  .s-heat { --dur: var(--cf-dur-heat, 1s); }
  .s-dhw { --dur: var(--cf-dur-dhw, 1s); }

  .cf-cables path { fill: none; stroke: #030405; stroke-width: 4; stroke-linecap: round; }
  .cf-nut { fill: #c9a24a; stroke: #5b4416; stroke-width: 1.2; }
  .cf-nut-line { stroke: rgba(70, 50, 12, .7); stroke-width: 1.2; }
  .cf-strainer path { fill: none; stroke-width: 20; stroke-linecap: round; }
  .cf-strainer path.cf-nut-line { stroke: rgba(70, 50, 12, .7); stroke-width: 1.2; }
  .cf-strainer rect, .cf-ball rect, .cf-safety rect:first-child, .cf-pump-volute { stroke: #5b4416; stroke-width: 1.2; }
  .cf-dot-green { fill: #2fd08a; stroke: #0d4f33; stroke-width: 1.5; }
  .cf-dot-red { fill: #e2463c; stroke: #5a1a14; stroke-width: 1.5; }
  .cf-meter rect { fill: #1b2127; stroke: #7a878e; stroke-width: 1.5; stroke-dasharray: 5 4; }
  .cf-meter path { stroke: #7a878e; stroke-width: 1.2; }
  .cf-safety rect:last-child { fill: #d2433a; stroke: #5a1a14; stroke-width: 1.2; }
  .cf-vessel path { stroke: #9aa4a9; stroke-width: 7; }
  .cf-vessel circle { stroke: #4b5458; stroke-width: 1.5; }
  .cf-vessel circle:last-child { fill: rgba(255, 255, 255, .25); }

  .cf-valve-body { stroke: #5b4416; stroke-width: 1.2; }
  .cf-actuator { fill: #15191c; stroke: #3b444a; stroke-width: 2; transition: stroke .4s; }
  .cf-actuator-led { fill: #3a464f; transition: fill .4s; }
  .cf-actuator-track { fill: #05080a; }
  .cf-actuator-fill { fill: var(--cf-idle); transform-box: fill-box; transform-origin: 0 50%; transform: scaleX(var(--pos, 0)); transition: transform .6s ease, fill .4s; }
  .cf-actuator-text { fill: #d6e5ee; font-size: 17px; font-weight: 750; }
  .cf-valve.is-on .cf-actuator { stroke: var(--cf-ok); }
  .cf-valve.is-on .cf-actuator-led, .cf-valve.is-on .cf-actuator-fill { fill: var(--cf-ok); }

  .cf-pump-motor { fill: #141719; stroke: #30373c; stroke-width: 3; }
  .cf-pump-face { fill: #1d2226; stroke: #2c3338; stroke-width: 2; }
  .cf-pump-badge { fill: #0c0f11; stroke: #3d464c; stroke-width: 1; }
  .cf-pump-box { fill: #202529; stroke: #394147; stroke-width: 1; }
  .cf-pump-led { fill: #3a464f; transition: fill .4s; }
  .cf-pump-ring { opacity: 0; transform-box: fill-box; transform-origin: 50% 50%; transition: opacity .4s; }
  .cf-pump-ring path { fill: none; stroke: #3aa0ff; stroke-width: 5; stroke-linecap: round; }
  .cf-pump-ring .cf-pump-arrow { fill: #3aa0ff; stroke: none; }
  .cf-pump-text { fill: #d6e5ee; font-size: 17px; font-weight: 750; }
  .cf-pump.is-on .cf-pump-ring { opacity: 1; animation: cf-spin var(--cf-dur-pump, 1.5s) linear infinite; }
  .cf-pump.is-on .cf-pump-led { fill: var(--cf-ok); }

  .cf-ctrl-panel { stroke: #8e9aa0; stroke-width: 1.5; }
  .cf-ctrl-lcd { stroke: #5a7179; stroke-width: 1.5; }
  .cf-ctrl-tag { fill: #c3cacd; }
  .cf-ctrl-square { fill: none; stroke: #9aa5a9; stroke-width: 1.5; }
  .cf-lcd-title { fill: #1f3a57; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
  .cf-lcd-big { fill: #16324a; font-size: 30px; font-weight: 800; letter-spacing: -1px; text-anchor: middle; }
  .cf-ctrl-glyph { fill: #9aa5a9; }
  .cf-led-halo { fill: transparent; }
  .cf-led-dot { fill: #b4bcc0; stroke: rgba(0, 0, 0, .2); stroke-width: 1; }
  .cf-led[data-led="green"] .cf-led-dot { fill: #22c55e; }
  .cf-led[data-led="green"] .cf-led-halo { fill: rgba(34, 197, 94, .28); }
  .cf-led[data-led="yellow"] .cf-led-dot { fill: #f5b82e; }
  .cf-led[data-led="yellow"] .cf-led-halo { fill: rgba(245, 184, 46, .3); }
  .cf-led[data-led="red"] .cf-led-dot { fill: #ef4444; }
  .cf-led[data-led="red"] .cf-led-halo { fill: rgba(239, 68, 68, .3); }
  .cf-led[data-led^="cyan"] .cf-led-dot { fill: #22d3ee; }
  .cf-led[data-led^="cyan"] .cf-led-halo { fill: rgba(34, 211, 238, .3); }
  .cf-led[data-led="cyan-blink"] { animation: cf-blink 1.8s ease-in-out infinite; }

  .cf-svg.is-photo .cf-hw { display: none; }
  .cf-svg.is-photo .cf-comp, .cf-svg.is-photo .cf-ctrl { opacity: .35; }
  .cf-svg.is-photo .cf-pipe:not(.is-on) .cf-p-body, .cf-svg.is-photo .cf-pipe:not(.is-on) .cf-p-shine, .cf-svg.is-photo .cf-p-casing { stroke-opacity: .3; }
  .cf-svg.no-labels .cf-label, .cf-svg.no-labels .cf-labels { display: none; }

  .cf-display-hit { position: absolute; z-index: 2; padding: 0; border: 0; border-radius: 10px; background: transparent; cursor: pointer; }
  .cf-display-hit::after { content: ""; position: absolute; inset: -4px; border: 2px solid transparent; border-radius: 14px; transition: border-color .2s, box-shadow .2s; }
  .cf-display-hit:focus-visible { outline: none; }
  .cf-display-hit:focus-visible::after { border-color: #7fdcff; }
  @media (hover: hover) {
    .cf-display-hit:hover::after { border-color: rgba(127, 220, 255, .55); box-shadow: 0 0 22px rgba(80, 200, 255, .22); }
  }
  .cf-display-badge { position: absolute; top: -9px; right: -9px; display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid rgba(127, 220, 255, .5); border-radius: 50%; background: #0d2130; color: #7fdcff; box-shadow: 0 3px 8px rgba(0, 0, 0, .35); }
  .cf-display-badge ha-icon { --mdc-icon-size: 14px; }

  @keyframes cf-flow { to { stroke-dashoffset: -28; } }
  @keyframes cf-spin { to { transform: rotate(360deg); } }
  @keyframes cf-blink { 50% { opacity: .25; } }
  @keyframes cf-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }

  .cf.is-offscreen .cf-svg *, .cf.modal-open .cf-svg * { animation-play-state: paused !important; }
  .cf.no-anim .cf-svg *, .cf.no-anim ~ .cf-modal * { animation: none !important; }
  @media (prefers-reduced-motion: reduce) {
    .cf-svg *, .cf-modal * { animation: none !important; transition: none !important; }
  }

  /* ---------- virtual display ---------- */
  .cf-modal { position: absolute; inset: 0; z-index: 10; display: flex; align-items: flex-start; justify-content: center; padding: var(--cf-modal-top, 16px) 12px 12px; overflow-y: auto; overscroll-behavior: contain; }
  .cf-modal-backdrop { position: absolute; inset: 0; background: rgba(2, 8, 13, .82); }
  @supports ((-webkit-backdrop-filter: blur(4px)) or (backdrop-filter: blur(4px))) {
    .cf-modal-backdrop { background: rgba(2, 8, 13, .68); -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px); }
  }
  .cf-device { position: relative; width: min(100%, 440px); padding: 14px; border-radius: 26px; background: linear-gradient(160deg, #eef0ef 0%, #dde1e2 55%, #c8ced0 100%); color: #1d2a31; box-shadow: 0 30px 80px rgba(0, 0, 0, .5), inset 0 1px 0 rgba(255, 255, 255, .85), inset 0 -2px 0 rgba(0, 0, 0, .08); container: cf-device / inline-size; animation: cf-pop .18s ease-out; }
  .cf-device-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 10px 4px; }
  .cf-device-name { min-width: 0; }
  .cf-device-name strong { display: block; overflow: hidden; font-size: 15px; white-space: nowrap; text-overflow: ellipsis; }
  .cf-device-name small { display: block; color: #5a6a72; font-size: 11px; }
  .cf-device-close { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; border: 0; border-radius: 50%; background: rgba(20, 35, 43, .09); color: #2c3f48; cursor: pointer; }
  .cf-device-close ha-icon { --mdc-icon-size: 22px; }
  .cf-device-face { display: grid; gap: 12px; padding: 12px; border-radius: 16px; background: linear-gradient(#e9eceb, #d5dadb); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .08), inset 0 2px 6px rgba(0, 0, 0, .08); }
  .cf-lcd { position: relative; display: flex; flex-direction: column; height: 256px; height: clamp(214px, 64cqw, 270px); padding: 9px 20px 9px 12px; border: 2px solid #56686f; border-radius: 8px; background: linear-gradient(180deg, #c7d7d0, #afc2ba); box-shadow: inset 0 0 18px rgba(40, 70, 60, .28); color: #13241e; font-variant-numeric: tabular-nums; }
  .cf-lcd-head { display: flex; align-items: center; gap: 8px; padding-bottom: 6px; border-bottom: 2px solid rgba(19, 36, 30, .55); }
  .cf-lcd-head ha-icon { --mdc-icon-size: 20px; flex: 0 0 auto; }
  .cf-lcd-head strong { flex: 1; min-width: 0; overflow: hidden; font-size: 16px; letter-spacing: .08em; white-space: nowrap; text-overflow: ellipsis; }
  .cf-lcd-head span { font-size: 12px; font-weight: 800; }
  .cf-lcd-body { display: flex; flex: 1; flex-direction: column; min-height: 0; animation: cf-pop .16s ease-out; }
  .cf-lcd-hero { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 6px 2px 4px; }
  .cf-lcd-hero strong { font-size: 42px; font-size: clamp(32px, 11.5cqw, 50px); line-height: 1; letter-spacing: -.03em; }
  .cf-lcd-hero span { overflow: hidden; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-align: right; text-transform: uppercase; white-space: nowrap; text-overflow: ellipsis; }
  .cf-lcd-list { flex: 1; min-height: 0; margin: 2px 0 0; padding: 0; overflow-y: auto; list-style: none; scrollbar-width: none; }
  .cf-lcd-list::-webkit-scrollbar { display: none; }
  .cf-lcd-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 30px; padding: 3px 6px; border-radius: 3px; font-size: 14px; }
  .cf-lcd-row span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .cf-lcd-row strong { flex: 0 0 auto; max-width: 58%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .cf-lcd-row.is-selected { background: #13241e; color: #c9d8d1; }
  .cf-lcd-row.is-empty { justify-content: center; opacity: .7; }
  .cf-lcd-scroll { position: absolute; top: 44px; right: 7px; bottom: 10px; width: 5px; border-radius: 3px; background: rgba(19, 36, 30, .16); }
  .cf-lcd-scroll span { position: absolute; left: 0; right: 0; top: 0; height: 100%; border-radius: 3px; background: #13241e; }
  .cf-device-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 12px; }
  .cf-dleds { display: flex; gap: 8px; }
  .cf-dled { display: grid; justify-items: center; gap: 4px; min-width: 24px; color: #56666e; }
  .cf-dled i { width: 10px; height: 10px; border-radius: 50%; background: #9aa5a9; box-shadow: inset 0 1px 2px rgba(0, 0, 0, .3); }
  .cf-dled ha-icon { --mdc-icon-size: 14px; }
  .cf-dled[data-led="green"] i { background: #22c55e; box-shadow: 0 0 8px rgba(34, 197, 94, .85); }
  .cf-dled[data-led="yellow"] i { background: #f5b82e; box-shadow: 0 0 8px rgba(245, 184, 46, .85); }
  .cf-dled[data-led="red"] i { background: #ef4444; box-shadow: 0 0 8px rgba(239, 68, 68, .85); }
  .cf-dled[data-led^="cyan"] i { background: #22d3ee; box-shadow: 0 0 8px rgba(34, 211, 238, .85); }
  .cf-dled[data-led="cyan-blink"] i { animation: cf-blink 1.8s ease-in-out infinite; }
  .cf-keys { display: flex; gap: 10px; margin-left: auto; }
  .cf-key { display: grid; place-items: center; width: 48px; height: 48px; border: 1px solid rgba(0, 0, 0, .14); border-radius: 50%; background: linear-gradient(#f7f8f7, #dde2e2); box-shadow: 0 2px 4px rgba(0, 0, 0, .15), inset 0 1px 0 #fff; color: #2b3b42; cursor: pointer; }
  .cf-key ha-icon { --mdc-icon-size: 24px; }
  .cf-key:active { transform: translateY(1px); box-shadow: inset 0 2px 4px rgba(0, 0, 0, .18); }
  .cf-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 12px; }
  .cf-tab { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-width: 0; min-height: 50px; padding: 5px 3px; border: 1px solid rgba(0, 0, 0, .1); border-radius: 12px; background: rgba(255, 255, 255, .55); color: #33444c; font-size: 11px; font-weight: 750; cursor: pointer; }
  .cf-tab ha-icon { --mdc-icon-size: 18px; }
  .cf-tab span { max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .cf-tab[aria-selected="true"] { border-color: #1c2f37; background: #1c2f37; color: #e9f2f5; }
  .cf-device-note { margin: 10px 4px 0; color: #5d6c73; font-size: 11px; line-height: 1.35; text-align: center; }
  @container cf-device (max-width: 330px) {
    .cf-dled ha-icon { display: none; }
    .cf-key { width: 44px; height: 44px; }
    .cf-tab { font-size: 10px; }
    .cf-lcd-row { font-size: 13px; }
  }

  /* Keep drawing labels readable when the unit itself is rendered small. */
  @container cf-stage (max-width: 380px) {
    .cf-svg .cf-minor { display: none; }
    .cf-hx-label { font-size: 21px; letter-spacing: 1px; }
    .cf-hx-tag rect { display: none; }
    .cf-conn-label { font-size: 22px; }
  }

  /* ---------- card width based layouts ---------- */
  @container calefa-card (max-width: 399px) {
    .cf { padding: 13px 10px 10px; }
    .cf-pills { flex: 1 1 100%; }
    .cf-pill { flex: 1 1 0; gap: 8px; padding: 8px 10px; }
    .cf-pill-icon ha-icon { --mdc-icon-size: 24px; }
    .cf-pill strong { font-size: 16px; }
    .cf-pill em { display: none; }
    .cf-metric { gap: 8px; padding: 8px 9px; }
    .cf-metric-icon { flex-basis: 26px; width: 26px; height: 26px; }
    .cf-metric-icon ha-icon { --mdc-icon-size: 22px; }
    .cf-num { font-size: 18px; }
    .cf-device { padding: 10px; border-radius: 22px; }
    .cf-device-face { padding: 9px; }
  }
  @container calefa-card (max-width: 639px) {
    .cf-pills { flex: 1 1 100%; }
    .cf-pill { flex: 1 1 0; }
  }
  @container calefa-card (min-width: 640px) {
    .cf { padding: 20px 20px 16px; }
    .cf-main { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); grid-template-areas: "stage left" "stage right"; gap: 10px 20px; align-items: center; }
    .cf-stage { grid-area: stage; order: 0; margin: 0; }
    .cf-rail { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-content: start; }
    .cf-rail-left { grid-area: left; align-self: end; }
    .cf-rail-right { grid-area: right; align-self: start; }
    .cf-metric { order: 0; }
    .cf-metric.span-mobile { grid-column: auto; }
    .cf-metric.span-rail { grid-column: 1 / -1; }
    .cf-footer { display: flex; flex-wrap: wrap; gap: 0; }
    .cf-foot { flex: 1 1 130px; border: 0; border-left: 1px solid var(--cf-line); border-radius: 0; background: none; padding: 6px 14px; }
    .cf-foot:first-child { border-left: 0; padding-left: 4px; }
    .cf-foot-more { display: grid; margin-left: 8px; align-self: center; }
  }
  @container calefa-card (min-width: 940px) {
    .cf { padding: 26px 28px 20px; }
    .cf-main { grid-template-columns: minmax(210px, 300px) minmax(340px, 540px) minmax(210px, 300px); grid-template-areas: "left stage right"; justify-content: space-between; max-width: 1280px; margin: 0 auto; gap: 18px 40px; }
    .cf-stage { max-width: none; }
    .cf-rail { display: flex; flex-direction: column; gap: 14px; }
    .cf-rail-left, .cf-rail-right { align-self: center; }
    .cf-metric { min-height: 84px; gap: 14px; padding: 14px 16px; border-radius: 18px; }
    .cf-metric-icon { flex-basis: 42px; width: 42px; height: 42px; }
    .cf-metric-icon ha-icon { --mdc-icon-size: 36px; }
    .cf-metric-label { font-size: 15px; }
    .cf-metric-sub { font-size: 13px; }
    .cf-num { font-size: 30px; }
    .cf-unit { font-size: 17px; }
    .cf-metric.span-rail { grid-column: auto; }
    .cf-pill { min-height: 76px; padding: 12px 20px 12px 14px; }
    .cf-pill-icon ha-icon { --mdc-icon-size: 38px; }
    .cf-pill small { font-size: 16px; }
    .cf-pill strong { font-size: 24px; }
    .cf-pill em { font-size: 13px; }
    .cf-footer { max-width: 1280px; margin: 18px auto 0; padding-top: 18px; }
    .cf-foot ha-icon { --mdc-icon-size: 30px; }
    .cf-foot small { font-size: 13px; }
    .cf-foot strong { font-size: 17px; }
  }
`;

if (!customElements.get("ha-calefa-flow-card")) {
  customElements.define("ha-calefa-flow-card", HaCalefaFlowCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "ha-calefa-flow-card")) {
  window.customCards.push({
    type: "ha-calefa-flow-card",
    name: "HA Calefa Flow Card",
    description: "Animated Wavin Calefa II flow visualization with an interactive virtual display",
    preview: false,
    documentationURL: "https://github.com/MRDonnii/ha-smart-home-cards/blob/main/docs/CALEFA_FLOW_CARD.md",
  });
}

console.info(`%c HA CALEFA FLOW CARD %c v${CALEFA_FLOW_CARD_VERSION} `, "background:#0a7fb4;color:white;font-weight:700;padding:2px 5px;border-radius:3px 0 0 3px", "background:#11232f;color:#8fdcff;padding:2px 5px;border-radius:0 3px 3px 0");
