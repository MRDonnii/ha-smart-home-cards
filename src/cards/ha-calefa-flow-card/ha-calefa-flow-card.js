const CALEFA_FLOW_CARD_VERSION = "0.4.1";
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
  pump: { label: "Pumpe", icon: "mdi:pump", tone: "component", kind: "pump" },
  heating_valve: { label: "Varmeventil", icon: "mdi:valve", tone: "component", kind: "valve" },
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
const flowTrack = (path, type = "") => `<g class="cf-track ${type}"><path class="cf-track-glow" d="${path}"/><path class="cf-track-core" d="${path}"/><path class="cf-track-dash" d="${path}"/>${[0, 1, 2].map((index) => `<path class="cf-track-marker" d="M-5 -3 L4 0 L-5 3 Z"><animateMotion path="${path}" dur="2.2s" begin="-${(index * 0.73).toFixed(2)}s" repeatCount="indefinite"/></path>`).join("")}</g>`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

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
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
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
    const config = { title: "Calefa II 40/40", subtitle: "Fjernvarmeunit" };
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
    for (const [key, id] of [["fjv_flow", "sensor.calefa_fjernvarme_flow_aktiv"], ["heating_flow", "sensor.calefa_radiator_flow_aktiv"]]) {
      if (hass?.states?.[id]) config[key] = id;
    }
    return config;
  }

  setConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("ha-calefa-flow-card requires a configuration object");
    }
    const text = (value, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;
    this._config = {
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
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config || !hass) return;
    if (!this._built) this._build();
    if (this._hasChanges(hass)) this._update();
  }

  get hass() { return this._hass; }
  getCardSize() { return 9; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }

  connectedCallback() {
    if (typeof IntersectionObserver !== "undefined" && !this._observer) {
      this._observer = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        this._refs.root?.classList.toggle("is-offscreen", entry ? !entry.isIntersecting : false);
      }, { rootMargin: "100px" });
      this._observer.observe(this);
    }
    if (typeof ResizeObserver !== "undefined" && !this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => this._positionCallouts());
      this._resizeObserver.observe(this);
    }
    requestAnimationFrame(() => this._positionCallouts());
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

  _metricMarkup(id, compact = false) {
    if (!this._configured(id)) return '<span class="cf-missing"></span>';
    const metric = METRICS[id];
    return `<button class="cf-metric ${compact ? "is-compact" : ""}" type="button" data-metric="${id}" data-tone="${metric.tone}" data-action="more-info" data-key="${id}"><ha-icon icon="${metric.icon}"></ha-icon><span><small>${metric.label}</small><strong><b data-num>–</b><em data-unit></em></strong><i data-sub></i></span></button>`;
  }

  _pairMarkup(first, second, delta, compact = false) {
    if (!this._configured(first) && !this._configured(second)) return "";
    return `<div class="cf-pair ${compact ? "is-compact" : ""}">${this._metricMarkup(first, compact)}<div class="cf-delta" data-delta="${delta}" role="status" aria-label="Temperaturforskel mellem frem og retur"><small>ΔT</small><strong>–</strong></div>${this._metricMarkup(second, compact)}</div>`;
  }

  _componentMarkup(id, cls) {
    if (!this._configured(id)) return "";
    const metric = METRICS[id];
    return `<button class="cf-component ${cls}" type="button" data-metric="${id}" data-tone="component" data-action="more-info" data-key="${id}"><ha-icon icon="${metric.icon}"></ha-icon><span><small>${metric.label}</small><strong><b data-num>–</b><em data-unit></em></strong><i data-sub></i></span></button>`;
  }

  _waterMarkup(id, cls) {
    if (!this._configured(id)) return "";
    const metric = METRICS[id];
    return `<button class="cf-water ${cls}" type="button" data-metric="${id}" data-tone="${metric.tone}" data-action="more-info" data-key="${id}"><small>${metric.label}</small><strong><b data-num>–</b><em data-unit></em></strong><i data-sub></i></button>`;
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
    const photo = this.shadowRoot.querySelector(".cf-photo");
    photo?.addEventListener("error", () => {
      photo.remove();
      this.shadowRoot.querySelector(".cf-unit")?.classList.remove("has-photo");
    }, { once: true });
    this._built = true;
    this._seen.clear();
    if (this.isConnected) requestAnimationFrame(() => this._positionCallouts());
  }

  _positionCallouts() {
    const main = this._refs.main;
    const overlay = this._refs.callouts;
    const stage = this.shadowRoot.querySelector(".cf-stage-box");
    if (!main || !overlay || !stage || !main.clientWidth) return;
    const bounds = main.getBoundingClientRect();
    const picture = stage.getBoundingClientRect();
    overlay.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    const anchors = {
      fjv_supply: [105, 530], fjv_return: [165, 620], pump: [300, 750],
      dhw_temperature: [500, 475], heating_supply: [490, 610],
      heating_return: [485, 720], heating_valve: [225, 660], dhw_valve: [300, 475],
    };
    for (const [key, [x, y]] of Object.entries(anchors)) {
      const line = overlay.querySelector(`[data-callout="${key}"]`);
      const button = main.querySelector(`.cf-side [data-metric="${key}"]`);
      if (!line || !button) continue;
      const box = button.getBoundingClientRect();
      const left = button.closest(".cf-left") !== null;
      const sx = (left ? box.right : box.left) - bounds.left;
      const sy = box.top + box.height / 2 - bounds.top;
      const tx = picture.left - bounds.left + x / 600 * picture.width;
      const ty = picture.top - bounds.top + (y - 30) / 920 * picture.height;
      line.querySelector("path").setAttribute("d", `M${sx} ${sy} H${sx + (left ? 20 : -20)} L${tx} ${ty}`);
      const dot = line.querySelector("circle");
      dot.setAttribute("cx", tx);
      dot.setAttribute("cy", ty);
      line.hidden = !button.offsetParent;
    }
  }

  _markup() {
    return `<ha-card><div class="cf ${this._config.animations ? "" : "no-anim"}" data-ref="root">
      <div class="cf-mobile-pairs">${this._pairMarkup("fjv_supply", "fjv_return", "fjv", true)}${this._pairMarkup("heating_supply", "heating_return", "heating", true)}</div>
      <div class="cf-main" data-ref="main">
        <aside class="cf-side cf-left">${this._pairMarkup("fjv_supply", "fjv_return", "fjv")}</aside>
        <section class="cf-stage"><div class="cf-stage-box">${this._svgMarkup()}${this._waterMarkup("dhw_temperature", "cf-water-hot")}${this._waterMarkup("cold_water_temperature", "cf-water-cold")}${this._componentMarkup("dhw_valve", "cf-component-dhw")}${this._componentMarkup("heating_valve", "cf-component-heat")}<button class="cf-pump-hit" type="button" data-action="more-info" data-key="pump" aria-label="Pumpe status og detaljer"></button><button class="cf-legacy-hit" type="button" data-action="open-legacy-popup" aria-label="Åbn Calefa styring og forbrug"><ha-icon icon="mdi:chart-box-outline"></ha-icon><span>Styring · forbrug</span></button><button class="cf-display-hit" type="button" data-action="open-display" aria-label="Åbn Calefa-display"><ha-icon icon="mdi:gesture-tap"></ha-icon></button></div></section>
        <aside class="cf-side cf-right">${this._waterMarkup("dhw_temperature", "cf-side-water")}${this._pairMarkup("heating_supply", "heating_return", "heating")}</aside>
        <svg class="cf-callouts" data-ref="callouts" aria-hidden="true">${[["fjv_supply","supply"],["fjv_return","return"],["dhw_temperature","dhw"],["heating_supply","heat"],["heating_return","heat-return"]].map(([key,tone]) => `<g data-callout="${key}" data-tone="${tone}"><path/><circle r="5"/></g>`).join("")}</svg>
      </div>
      <div class="cf-mobile-components">${this._waterMarkup("dhw_temperature", "cf-mobile-water")}${this._waterMarkup("cold_water_temperature", "cf-mobile-water")}</div>
      ${this._footerMarkup()}
    </div>${this._modalMarkup()}</ha-card>`;
  }

  _footerMarkup() {
    if (!this._config.show_footer) return "";
    const items = [["room_temperature", "Bolig", "mdi:home-thermometer-outline"], ["outdoor_temperature", "Ude", "mdi:thermometer"], ["power", "Effekt", "mdi:flash-outline"], ["pressure", "Tryk", "mdi:gauge"]].filter(([key]) => this._config[key]);
    if (!items.length) return "";
    return `<footer class="cf-footer">${items.map(([key, label, icon]) => `<button type="button" data-action="more-info" data-key="${key}" data-footer="${key}"><ha-icon icon="${icon}"></ha-icon><span><small>${label}</small><strong>–</strong></span></button>`).join("")}</footer>`;
  }

  _svgMarkup() {
    const photo = this._config.background_image ? `<image class="cf-photo" href="${escapeHtml(this._config.background_image)}" x="0" y="30" width="600" height="920" preserveAspectRatio="none"/>` : "";
    const grooves = Array.from({ length: 15 }, (_, i) => `<path d="M${92 + i * 28} 232 C${105 + i * 28} 280 ${82 + i * 28} 328 ${99 + i * 28} 380"/>`).join("");
    const connections = [[105,"FF"],[165,"FR"],[300,"VR"],[370,"VF"],[465,"BV"],[535,"KV"]].map(([x,t]) => `<circle cx="${x}" cy="875" r="12"/><text x="${x}" y="914" text-anchor="middle">${t}</text>`).join("");
    return `<svg class="cf-svg" viewBox="0 30 600 920" role="img" aria-label="Calefa II flowdiagram">
      <defs>
        <linearGradient id="hood" x1="0" x2="1"><stop stop-color="#141719"/><stop offset=".48" stop-color="#343a3f"/><stop offset="1" stop-color="#0f1214"/></linearGradient>
        <linearGradient id="body" x1="0" x2="1"><stop stop-color="#080b0d"/><stop offset=".5" stop-color="#1a1f22"/><stop offset="1" stop-color="#060708"/></linearGradient>
        <linearGradient id="steel" x1="0" x2="1"><stop stop-color="#59656a"/><stop offset=".18" stop-color="#edf3f4"/><stop offset=".5" stop-color="#89999f"/><stop offset=".76" stop-color="#f8fbfc"/><stop offset="1" stop-color="#68757b"/></linearGradient>
        <linearGradient id="copper" x1="0" x2="1"><stop stop-color="#642e1d"/><stop offset=".16" stop-color="#d87943"/><stop offset=".5" stop-color="#854128"/><stop offset=".82" stop-color="#ea8f54"/><stop offset="1" stop-color="#69321f"/></linearGradient>
        <linearGradient id="brass" x1="0" x2="1"><stop stop-color="#76500f"/><stop offset=".35" stop-color="#f2c14f"/><stop offset=".7" stop-color="#b47a1d"/><stop offset="1" stop-color="#68410d"/></linearGradient>
        <linearGradient id="lcd" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d0e4e8"/><stop offset="1" stop-color="#9abac1"/></linearGradient>
        <pattern id="epp" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#2a3034" opacity=".48"/><circle cx="8" cy="7" r=".8" fill="#050607" opacity=".7"/></pattern>
        <filter id="shadow"><feDropShadow dx="0" dy="7" stdDeviation="8" flood-opacity=".5"/></filter>
        <filter id="hotGlow"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="blueGlow"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <linearGradient id="cfDhwThermal" x1="0" y1="0" x2="0" y2="1"><stop data-ref="dhw-in-color" offset="0" stop-color="#f47643"/><stop data-ref="dhw-out-color" offset="1" stop-color="#6c9cbe"/></linearGradient>
        <linearGradient id="cfHeatThermal" x1="0" y1="0" x2="0" y2="1"><stop data-ref="heat-in-color" offset="0" stop-color="#f47643"/><stop data-ref="heat-out-color" offset="1" stop-color="#6c9cbe"/></linearGradient>
      </defs>
      ${photo}
      <g class="cf-unit ${photo ? "has-photo" : ""}" filter="url(#shadow)">
        <rect x="75" y="215" width="450" height="675" rx="30" fill="url(#body)" stroke="#20272b" stroke-width="2"/><rect x="75" y="215" width="450" height="675" rx="30" fill="url(#epp)" opacity=".82"/><g class="cf-grooves">${grooves}</g>
        <rect x="58" y="44" width="484" height="210" rx="42" fill="url(#hood)" stroke="#292e32" stroke-width="2"/><rect x="58" y="44" width="484" height="210" rx="42" fill="url(#epp)" opacity=".58"/>
        <rect class="cf-control" x="194" y="88" width="212" height="126" rx="10"/><rect x="242" y="105" width="116" height="58" rx="4" fill="url(#lcd)" stroke="#68838c" stroke-width="2"/><text class="cf-mini-title" x="300" y="124" text-anchor="middle" data-ref="mini-title">STANDBY</text><text class="cf-mini-value" x="300" y="154" text-anchor="middle" data-ref="mini-value">–</text>
        <g class="cf-pipes-base"><path d="M105 875 V360 H454 V432"/><path d="M165 875 V408 H404 V492"/><path d="M300 875 V760 H445 V690"/><path d="M370 875 V780 H480 V690"/><path d="M465 875 V790 H520 V748"/><path d="M535 875 V748"/></g><g class="cf-pipe-shine"><path d="M105 875 V360 H454 V432"/><path d="M165 875 V408 H404 V492"/><path d="M300 875 V760 H445 V690"/><path d="M370 875 V780 H480 V690"/><path d="M465 875 V790 H520 V748"/><path d="M535 875 V748"/></g>
        <g class="cf-hx" data-ref="hx-heat"><rect x="420" y="590" width="82" height="194" rx="13" fill="url(#copper)"/><path d="M438 608 V766 M451 608 V766 M464 608 V766 M477 608 V766 M490 608 V766"/></g><g class="cf-hx" data-ref="hx-dhw"><rect x="420" y="430" width="82" height="153" rx="13" fill="url(#copper)"/><path d="M438 448 V565 M451 448 V565 M464 448 V565 M477 448 V565 M490 448 V565"/></g><g class="cf-hx-label"><text x="458" y="540" transform="rotate(-90 458 540)">BRUGSVAND</text><text x="458" y="720" transform="rotate(-90 458 720)">VARME</text></g>
        <g class="cf-valve" data-ref="heat-valve"><path d="M388 560 L403 575 L388 590 M418 560 L403 575 L418 590" fill="url(#brass)"/><rect x="378" y="530" width="48" height="45" rx="9"/></g><g class="cf-valve" data-ref="dhw-valve"><path d="M438 433 L453 448 L438 463 M468 433 L453 448 L468 463" fill="url(#brass)"/><rect x="428" y="398" width="50" height="46" rx="9"/></g>
        <g class="cf-pump" data-ref="pump"><rect x="258" y="790" width="84" height="86" rx="26"/><circle cx="300" cy="833" r="31"/><path class="cf-pump-spin" d="M300 808 C326 812 332 833 318 852 C294 847 284 826 300 808Z"/></g>
        <g class="cf-flow cf-flow-primary" data-ref="flow-primary">${flowTrack("M75 900 V440 H445 V395", "supply")}${flowTrack("M440 515 H145 V900", "return")}</g><g class="cf-flow cf-flow-heat" data-ref="flow-heat">${flowTrack("M290 900 V735 H350 V675 H450", "heat")}${flowTrack("M505 650 V715 H365 V900", "return")}</g><g class="cf-flow cf-flow-dhw" data-ref="flow-dhw">${flowTrack("M530 900 V720 H470", "cold")}${flowTrack("M445 440 V515 H475 V900", "hot")}</g>
        <g class="cf-exchangers"><rect class="cf-exchanger cf-exchanger-dhw" data-ref="exchanger-dhw" x="463" y="385" width="75" height="173" rx="8" fill="url(#cfDhwThermal)"/><rect class="cf-exchanger cf-exchanger-heat" data-ref="exchanger-heat" x="463" y="560" width="75" height="192" rx="8" fill="url(#cfHeatThermal)"/></g>
        <circle class="cf-pump-halo" data-ref="pump-halo" cx="300" cy="735" r="74"/>
        <g class="cf-pump-indicator" data-ref="pump-indicator" transform="translate(300 735)"><circle class="cf-pump-indicator-ring" r="70"/><g transform="scale(2.15)"><g class="cf-pump-indicator-fan"><path d="M0 -5 C-10 -30 8 -30 6 -10Z M4 2 C30 0 28 18 9 11Z M-4 2 C-16 27 -29 13 -10 4Z"/></g></g><circle r="6"/></g>
        <g class="cf-connections">${connections}</g>
      </g>
      <g class="cf-display-status" aria-label="Statusdioder under Calefa displayet">${[["power",270,"Strøm"],["fault",285,"Fejl"],["mode",300,"Driftstilstand"],["lan",315,"LAN"],["peripheral",330,"Ekstern enhed"]].map(([key,x,label]) => `<circle class="cf-display-led" data-ref="led-${key}" cx="${x}" cy="148" r="2.7" aria-label="${label}"/>`).join("")}</g>
    </svg>`;
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
      return { parts: this._split(text), sub: model.pumpActive ? "Kører" : "Stop", on: model.pumpActive, available: text !== "–" };
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
      this._text(node.querySelector("strong"), value === null ? "–" : `${this._formatNumber(value, 1)} °C`);
      const status = this._deltaStatus(node.dataset.delta, value);
      this._toggle(node, "is-muted", status === "unavailable");
      this._toggle(node, "is-good", status === "good");
      this._toggle(node, "is-bad", status === "bad");
      node.setAttribute("aria-label", `${node.dataset.delta === "fjv" ? "Fjernvarme" : "Varme"} afkøling ${value === null ? "ikke tilgængelig" : `${this._formatNumber(value, 1)} grader, ${status === "good" ? "god" : "lav"}`}`);
    });
  }

  _applyDiagram(model) {
    this._setFlowDuration(this._refs["flow-primary"], this._num("fjv_flow"), this._unit("fjv_flow"));
    this._setFlowDuration(this._refs["flow-heat"], this._num("heating_flow"), this._unit("heating_flow"));
    this._setFlowDuration(this._refs["flow-dhw"], this._num("water_flow"), this._unit("water_flow"));
    this._toggle(this._refs["flow-primary"], "is-on", model.primaryMoving);
    this._toggle(this._refs["flow-heat"], "is-on", model.heatMoving);
    this._toggle(this._refs["flow-dhw"], "is-on", model.waterMoving);
    this._toggle(this._refs.pump, "is-on", model.pumpActive);
    this._toggle(this._refs["heat-valve"], "is-on", Boolean(model.heatValveOpen ?? model.heatPrimary));
    this._toggle(this._refs["dhw-valve"], "is-on", Boolean(model.dhwValveOpen ?? model.dhwPrimary));
    this._toggle(this._refs["hx-heat"], "is-on", model.heatPrimary || model.heatLoop);
    this._toggle(this._refs["hx-dhw"], "is-on", model.dhwPrimary || model.dhwTap);
    this._setThermalGradient("dhw", this._num("fjv_supply"), this._num("fjv_return"), model.primaryMoving || model.waterMoving || model.dhwBypass);
    this._setThermalGradient("heat", this._num("heating_supply"), this._num("heating_return"), model.heatMoving);
    this._toggle(this._refs["pump-halo"], "is-on", model.pumpActive);
    this._toggle(this._refs["pump-indicator"], "is-on", model.pumpActive);
    this._applyStatusLeds(model);
    const key = model.dhwTap && this._config.dhw_temperature ? "dhw_temperature" : this._config.heating_supply ? "heating_supply" : "fjv_supply";
    this._text(this._refs["mini-title"], model.dhwTap ? "BRUGSVAND" : model.heatingActive ? "VARME" : model.dhwBypass ? "BYPASS" : "STANDBY");
    this._text(this._refs["mini-value"], this._config[key] ? this._format(key, "temperature").replace(" °C", "°") : "–");
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

  _thermalColor(value) {
    if (!Number.isFinite(value)) return "#647f8b";
    if (value >= 55) return "#ff563d";
    if (value >= 35) return "#ff9d43";
    return "#55baff";
  }

  _setThermalGradient(name, inlet, outlet, active) {
    const layer = this._refs[`exchanger-${name}`];
    this._toggle(layer, "is-active", active);
    const start = this._refs[`${name}-in-color`];
    const end = this._refs[`${name}-out-color`];
    const hot = this._thermalColor(inlet);
    const cool = this._thermalColor(outlet);
    if (start?.getAttribute("stop-color") !== hot) start?.setAttribute("stop-color", hot);
    if (end?.getAttribute("stop-color") !== cool) end?.setAttribute("stop-color", cool);
  }

  _setFlowDuration(node, raw, unit = "%") {
    if (!node?.style) return;
    const amount = Number(raw);
    const valid = Number.isFinite(amount) && amount > 0;
    const normalized = unit === "L/h" ? amount / 1200 : unit === "L/min" ? amount / 20 : amount / 100;
    const duration = valid ? `${(1.55 - 0.9 * clamp(normalized, 0, 1)).toFixed(2)}s` : "1.10s";
    if (node.style.getPropertyValue("--cf-flow-duration") !== duration) node.style.setProperty("--cf-flow-duration", duration);
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
    window.addEventListener("keydown", this._onKeydown);
    this._refs.device?.focus({ preventScroll: true });
  }

  _closeDisplay() {
    this._displayOpen = false;
    this._edit = null;
    if (this._refs.modal) this._refs.modal.hidden = true;
    window.removeEventListener("keydown", this._onKeydown);
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

const CALEFA_STYLES = `
  :host{display:block;container:calefa-card / inline-size;--cf-supply:#ff7a2f;--cf-return:#4096ff;--cf-heat:#ff9a3c;--cf-heat-return:#58b8ff;--cf-dhw:#ff5158;--cf-cold:#35cee5;--cf-ok:#35df9c;--cf-muted:rgba(191,211,226,.72);--cf-text:#f2f7fa;--cf-line:rgba(255,255,255,.09)}
  *{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}ha-card{position:relative;display:block;overflow:hidden;border:1px solid rgba(145,177,199,.16);border-radius:var(--ha-card-border-radius,24px);background:radial-gradient(95% 55% at 50% 31%,rgba(43,95,125,.29),transparent 70%),linear-gradient(155deg,#0b1924,#102535 54%,#07121b);color:var(--cf-text);box-shadow:0 18px 52px rgba(0,0,0,.3)}.cf{padding:12px 16px 15px;min-width:0}.cf-main{position:relative;display:grid;grid-template-columns:minmax(160px,250px) minmax(330px,540px) minmax(160px,250px);align-items:center;justify-content:center;gap:18px;max-width:1180px;margin:0 auto}.cf-side{min-width:0}.cf-stage{min-width:0}.cf-stage-box{position:relative;width:100%;aspect-ratio:600/920;isolation:isolate}.cf-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.cf-photo{opacity:.84}.cf-unit.has-photo{opacity:.18}
  .cf-grooves path{fill:none;stroke:#050607;stroke-width:3;opacity:.42}.cf-control{fill:#e8ecec;stroke:#a8b0b3;stroke-width:2}.cf-mini-title{fill:#243a44;font:800 11px system-ui,sans-serif;letter-spacing:.05em}.cf-mini-value{fill:#173442;font:850 26px system-ui,sans-serif}.cf-status-dot{fill:#9aa5a9;stroke:#738087;stroke-width:1.2}.cf-status-heat.active{fill:#ff3f4b;stroke:#ff8790;filter:drop-shadow(0 0 7px rgba(255,63,75,.95))}.cf-status-dhw.active{fill:#269dff;stroke:#8ccaff;filter:drop-shadow(0 0 7px rgba(38,157,255,.95))}.cf-small-led{fill:#39d77b;filter:drop-shadow(0 0 3px rgba(57,215,123,.7))}.cf-pipes-base path{fill:none;stroke:url(#steel);stroke-width:15;stroke-linecap:round;stroke-linejoin:round}.cf-pipe-shine path{fill:none;stroke:rgba(255,255,255,.5);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.cf-hx{filter:drop-shadow(0 6px 7px rgba(0,0,0,.45))}.cf-hx path{fill:none;stroke:#5f2b1c;stroke-width:2.5;opacity:.72}.cf-hx.is-on{filter:drop-shadow(0 0 12px rgba(255,131,70,.28)) drop-shadow(0 7px 7px rgba(0,0,0,.42))}.cf-hx-label text{fill:#fff;font:800 14px system-ui,sans-serif;letter-spacing:1px}.cf-valve rect{fill:#10181d;stroke:#52636c;stroke-width:2}.cf-valve.is-on rect{stroke:var(--cf-ok);filter:drop-shadow(0 0 6px rgba(53,223,156,.45))}.cf-pump>rect{fill:#202a30;stroke:#44535b;stroke-width:2}.cf-pump>circle{fill:#10181d;stroke:#39484f;stroke-width:3}.cf-pump-spin{fill:#54656e;transform-origin:300px 833px}.cf-pump.is-on .cf-pump-spin{fill:#76a8bf;animation:cf-spin 1.2s linear infinite} .cf-track.supply{color:var(--cf-supply)}.cf-track.return{color:var(--cf-return)}.cf-flow-heat .cf-track.return{color:var(--cf-heat-return)}.cf-track.heat{color:var(--cf-heat)}.cf-track.cold{color:var(--cf-cold)}.cf-track.hot{color:var(--cf-dhw)}.cf-track-glow,.cf-track-core,.cf-track-dash{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round}.cf-track-glow{stroke-width:19;opacity:0;filter:blur(7px)}.cf-track-core{stroke-width:6;opacity:0;filter:drop-shadow(0 0 5px currentColor)}.cf-track-dash{stroke:#fff;stroke-width:2.5;stroke-dasharray:5 25;opacity:0}.cf-track-marker{fill:#fff;opacity:0;filter:drop-shadow(0 0 5px currentColor)}.cf-flow.is-on .cf-track-glow{opacity:.75}.cf-flow.is-on .cf-track-core{opacity:.9}.cf-flow.is-on .cf-track-dash{opacity:.9;animation:cf-flow var(--cf-flow-duration,1.1s) linear infinite}.cf-flow.is-on .cf-track-marker{opacity:.95}.cf-flow:not(.is-on) .cf-track-marker{display:none}.cf-exchanger{mix-blend-mode:screen;opacity:.19;filter:blur(2px);transition:opacity .5s ease}.cf-exchanger.is-active{opacity:.62;animation:cf-exchanger-breathe 4s ease-in-out infinite}@keyframes cf-exchanger-breathe{50%{opacity:.43}}.cf-pump-halo{fill:none;stroke:var(--cf-cold);stroke-width:4;stroke-dasharray:65 205;opacity:0;transform-origin:290px 735px}.cf-pump-halo.is-on{opacity:.85;filter:drop-shadow(0 0 6px var(--cf-cold));animation:cf-spin 1.8s linear infinite}.cf-callouts{position:absolute;inset:0;width:100%;height:100%;overflow:visible;z-index:5;pointer-events:none}.cf-callouts g{color:var(--cf-ok)}.cf-callouts g[data-tone="supply"]{color:var(--cf-supply)}.cf-callouts g[data-tone="return"]{color:var(--cf-return)}.cf-callouts g[data-tone="heat"]{color:var(--cf-heat)}.cf-callouts g[data-tone="heat-return"]{color:var(--cf-heat-return)}.cf-callouts g[data-tone="dhw"]{color:var(--cf-dhw)}.cf-callouts path{fill:none;stroke:currentColor;stroke-width:1.6;opacity:.8;filter:drop-shadow(0 0 5px currentColor)}.cf-callouts circle{fill:#071924;stroke:currentColor;stroke-width:2.5;filter:drop-shadow(0 0 5px currentColor)}.cf-pair{position:relative}.cf-pair:before{content:"";position:absolute;left:50%;top:40px;bottom:40px;width:1px;background:linear-gradient(var(--cf-supply),var(--cf-return));opacity:.7}.cf-right .cf-pair:before{background:linear-gradient(var(--cf-heat),var(--cf-heat-return))}.cf-delta:not(.is-muted){border-color:rgba(149,218,244,.55);box-shadow:0 0 13px rgba(63,162,224,.25)} .cf-connections circle{fill:#192228;stroke:#89969c;stroke-width:4}.cf-connections text{fill:#879aa6;font:750 18px system-ui,sans-serif}.cf-display-hit{position:absolute;z-index:8;left:32.3%;top:6.3%;width:35.4%;height:14.2%;border:0;background:transparent;cursor:pointer}.cf-display-hit ha-icon{position:absolute;right:-7px;top:-7px;--mdc-icon-size:18px;width:31px;height:31px;padding:7px;border:1px solid rgba(95,210,255,.58);border-radius:50%;background:#0a2939;color:#68d9ff;box-shadow:0 5px 16px rgba(0,0,0,.35)}
  .cf-pair{display:grid;grid-template-columns:1fr;gap:3px}.cf-metric{--tone:#68808e;display:flex;align-items:center;gap:7px;min-width:0;min-height:58px;padding:7px 9px;border:1px solid color-mix(in srgb,var(--tone) 38%,transparent);border-radius:14px;background:linear-gradient(135deg,color-mix(in srgb,var(--tone) 9%,transparent),rgba(5,13,20,.8) 72%);text-align:left;cursor:pointer}.cf-metric[data-tone="supply"]{--tone:var(--cf-supply)}.cf-metric[data-tone="return"]{--tone:var(--cf-return)}.cf-metric[data-tone="heat"]{--tone:var(--cf-heat)}.cf-metric[data-tone="heat-return"]{--tone:var(--cf-heat-return)}.cf-metric.is-on{border-color:color-mix(in srgb,var(--tone) 70%,transparent);box-shadow:0 0 17px color-mix(in srgb,var(--tone) 10%,transparent)}.cf-metric>ha-icon{--mdc-icon-size:22px;flex:0 0 25px;color:var(--tone)}.cf-metric>span{display:flex;flex-direction:column;min-width:0}.cf-metric small{font-size:10px;color:#dbe6ec}.cf-metric strong{display:flex;align-items:baseline;color:var(--tone);font-size:18px;line-height:1.05;white-space:nowrap}.cf-metric strong b{font-weight:850}.cf-metric strong em{margin-left:2px;color:var(--cf-muted);font-size:10px;font-style:normal;font-weight:500}.cf-metric i{margin-top:1px;overflow:hidden;color:var(--cf-muted);font-size:8px;font-style:normal;white-space:nowrap;text-overflow:ellipsis}.cf-metric.is-unavailable{opacity:.45}.cf-delta{justify-self:center;display:flex;align-items:center;gap:5px;min-height:23px;padding:2px 9px;border:1px solid rgba(147,210,239,.2);border-radius:999px;background:rgba(12,29,40,.9);color:#cfe8f4;box-shadow:0 3px 10px rgba(0,0,0,.2);z-index:2}.cf-delta small{font-size:7px;font-weight:800;letter-spacing:.08em}.cf-delta strong{font-size:11px;font-variant-numeric:tabular-nums}.cf-delta.is-muted{opacity:.4}.cf-missing{display:block}
  .cf-water{--tone:#fff;position:absolute;z-index:6;display:flex;flex-direction:column;min-width:96px;padding:5px 7px;border:1px solid color-mix(in srgb,var(--tone) 52%,transparent);border-radius:10px;background:rgba(5,14,21,.83);box-shadow:0 6px 15px rgba(0,0,0,.25);backdrop-filter:blur(4px);text-align:left;cursor:pointer}.cf-water[data-tone="dhw"]{--tone:var(--cf-dhw)}.cf-water[data-tone="cold"]{--tone:var(--cf-cold)}.cf-water-hot{right:1%;top:48%}.cf-water-cold{right:1%;top:75%}.cf-water small{font-size:8px;color:#dce6eb}.cf-water strong{display:flex;align-items:baseline;color:var(--tone);font-size:15px}.cf-water strong b{font-weight:850}.cf-water strong em{margin-left:2px;color:var(--cf-muted);font-size:8px;font-style:normal}.cf-water i{font-size:7px;color:var(--cf-muted);font-style:normal}
  .cf-component{position:absolute;z-index:7;display:flex;align-items:center;gap:4px;max-width:94px;padding:4px 5px;border:1px solid rgba(53,223,156,.26);border-radius:8px;background:rgba(5,14,20,.79);box-shadow:0 5px 13px rgba(0,0,0,.25);backdrop-filter:blur(4px);color:#dce8ed;text-align:left;cursor:pointer}.cf-component>ha-icon{--mdc-icon-size:13px;color:var(--cf-ok)}.cf-component>span{display:flex;flex-direction:column;min-width:0}.cf-component small{font-size:7px;color:var(--cf-muted);white-space:nowrap}.cf-component strong{display:flex;align-items:baseline;font-size:10px;line-height:1.05;white-space:nowrap}.cf-component strong b{font-weight:800}.cf-component strong em{margin-left:2px;font-size:7px;color:var(--cf-muted);font-style:normal}.cf-component i{font-size:7px;color:var(--cf-muted);font-style:normal;white-space:nowrap}.cf-component.is-on{border-color:rgba(53,223,156,.58);box-shadow:0 0 14px rgba(53,223,156,.1)}.cf-component-dhw{right:12%;top:42%}.cf-component-heat{right:20%;top:59%}.cf-component-pump{left:35%;top:82%}
  .cf-mobile-pairs{display:none}.cf-footer{display:flex;gap:0;max-width:1180px;margin:8px auto 0;padding-top:10px;border-top:1px solid var(--cf-line)}.cf-footer button{display:flex;align-items:center;gap:7px;flex:1 1 0;min-width:0;padding:5px 9px;border:0;border-left:1px solid var(--cf-line);background:none;text-align:left;cursor:pointer}.cf-footer button:first-child{border-left:0}.cf-footer ha-icon{--mdc-icon-size:19px;color:#b8ccd8}.cf-footer small,.cf-footer strong{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.cf-footer small{color:var(--cf-muted);font-size:8px}.cf-footer strong{font-size:12px}
  .cf-modal{position:absolute;inset:0;z-index:30;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto}.cf-modal-backdrop{position:absolute;inset:0;background:rgba(2,8,13,.76);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}.cf-device{position:relative;width:min(100%,450px);margin:auto;padding:12px;border-radius:24px;background:linear-gradient(155deg,#f0f2f1,#d9dedf 60%,#c5cbcd);color:#1d2b31;box-shadow:0 30px 80px rgba(0,0,0,.5)}.cf-device-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.cf-device-head strong,.cf-device-head small{display:block}.cf-device-head small{color:#607078;font-size:10px}.cf-device-head button{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:50%;background:rgba(20,35,43,.08);color:#2c3f48}.cf-device-face{padding:9px;border-radius:14px;background:linear-gradient(#e7eae9,#d3d8d9)}.cf-screen{min-height:230px;padding:10px;border:2px solid #576a71;border-radius:7px;background:linear-gradient(#c5d9d3,#aec4bc);color:#142820}.cf-screen-head{display:flex;align-items:center;gap:7px;padding-bottom:6px;border-bottom:2px solid rgba(20,40,32,.5)}.cf-screen-head ha-icon{--mdc-icon-size:18px}.cf-screen-head strong{flex:1;letter-spacing:.07em}.cf-screen-head span{font-size:11px;font-weight:800}.cf-screen-body{padding-top:5px}.cf-screen-row{display:flex;justify-content:space-between;gap:10px;min-height:30px;padding:4px 5px;border-bottom:1px solid rgba(20,40,32,.15);font-size:12px}.cf-screen-row strong{max-width:55%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.cf-keys{display:flex;justify-content:center;gap:15px;margin-top:9px}.cf-keys button{display:grid;place-items:center;width:44px;height:44px;border:1px solid rgba(0,0,0,.13);border-radius:50%;background:linear-gradient(#fafafa,#dfe4e4);color:#2e4048}.cf-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:8px}.cf-tabs button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0;min-height:47px;padding:4px 2px;border:1px solid rgba(0,0,0,.1);border-radius:10px;background:rgba(255,255,255,.52);color:#364a52;font-size:9px;font-weight:750}.cf-tabs button ha-icon{--mdc-icon-size:17px}.cf-tabs button span{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.cf-tabs button.active{background:#1c3139;color:#eef6f7}
  .cf-top{position:relative;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;max-width:1180px;margin:8px auto -8px}.cf-brand-mark{display:inline-block;padding:0 13px 1px;border:4px solid #37baff;border-radius:100px;color:#4fc2ff;font-size:26px;font-weight:950;letter-spacing:.03em;line-height:1}.cf-brand h2{margin:9px 0 0;font-size:clamp(24px,3cqw,42px);line-height:1.05;letter-spacing:.01em}.cf-brand p{margin:4px 0;color:#aebfc9;font-size:clamp(12px,1.5cqw,19px)}.cf-statuses{display:flex;gap:9px}.cf-status{display:flex;align-items:center;gap:11px;min-width:155px;min-height:82px;padding:11px 13px;border:1px solid #526675;border-radius:16px;background:linear-gradient(125deg,#243444bb,#111d29cc);box-shadow:0 12px 28px #0004}.cf-status ha-icon{--mdc-icon-size:37px;color:#788995}.cf-status span{display:flex;flex-direction:column}.cf-status small{font-size:13px}.cf-status strong{font-size:20px;line-height:1.1}.cf-status em{margin-top:5px;color:#a7b8c4;font-size:10px;font-style:normal}.cf-status-heating.is-active{border-color:#d17840}.cf-status-heating.is-active ha-icon{color:#ff9252;filter:drop-shadow(0 0 9px #ff6d3d)}.cf-status-water.is-active{border-color:#6ba9e5}.cf-status-water.is-active ha-icon{color:#6fbdff;filter:drop-shadow(0 0 9px #4ba7ff)}.cf-photo{opacity:1}.cf-unit.has-photo{opacity:1}.cf-unit.has-photo>rect,.cf-unit.has-photo>.cf-grooves,.cf-unit.has-photo>.cf-pipes-base,.cf-unit.has-photo>.cf-pipe-shine,.cf-unit.has-photo>.cf-hx,.cf-unit.has-photo>.cf-hx-label,.cf-unit.has-photo>.cf-valve,.cf-unit.has-photo>.cf-pump,.cf-unit.has-photo>.cf-connections,.cf-unit.has-photo>.cf-status-dot,.cf-unit.has-photo>.cf-small-led,.cf-unit.has-photo>text{display:none}.cf-side{align-self:stretch;display:flex;flex-direction:column;justify-content:space-evenly;gap:18px}.cf-side .cf-component,.cf-side .cf-water{position:relative;inset:auto;max-width:none;min-width:0;transform:none}.cf-side .cf-component{min-height:64px;padding:8px 10px;border-radius:13px}.cf-side .cf-component>ha-icon{--mdc-icon-size:25px}.cf-side .cf-component small{font-size:11px}.cf-side .cf-component strong{font-size:18px}.cf-side .cf-component i{font-size:9px}.cf-side .cf-water{min-height:64px;padding:8px 10px;border-radius:13px}.cf-side .cf-water small{font-size:11px}.cf-side .cf-water strong{font-size:19px}.cf-left .cf-metric,.cf-left .cf-component{position:relative}.cf-right .cf-metric,.cf-right .cf-component,.cf-right .cf-water{position:relative}
  .cf-mobile-components{display:none}.cf-screen{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.cf-screen.is-front .cf-screen-head{display:none}.cf-screen-front{display:grid;grid-template-columns:minmax(0,1fr) 70px;min-height:170px;border:2px solid #1a302a}.cf-screen-front-main{display:flex;flex-direction:column;justify-content:space-between;padding:12px 8px}.cf-screen-front-main small{font-size:16px;font-weight:800}.cf-screen-front-main strong{font-size:35px;line-height:1.1}.cf-screen-front-rail{display:flex;flex-direction:column;border-left:2px solid #1a302a}.cf-screen-front-rail span{display:grid;place-items:center;flex:1;border-bottom:2px solid #1a302a;font-size:10px;font-weight:800}.cf-screen-front-rail span:last-child{border:0}.cf-screen-row.selected{background:#1b342d;color:#ddf6e6}.cf-screen-row.selected strong{color:#fff}.cf-screen-note{padding:12px 5px;font-size:11px}.cf-screen-hint{border-top:1px solid #6d857a;padding-top:5px;font-size:10px}.cf-keys button{display:flex;flex-direction:column;gap:0;font-size:9px;font-weight:800}.cf-keys button span{line-height:1}.cf-long-enter{display:block;width:100%;min-height:44px;margin-top:8px;border:1px solid #9daeb1;border-radius:9px;background:#e1e8e8;color:#24383d;font-size:11px;font-weight:700}button:focus-visible{outline:3px solid #49bdff;outline-offset:2px}
  @keyframes cf-flow{to{stroke-dashoffset:-40}}@keyframes cf-spin{to{transform:rotate(360deg)}}.cf.no-anim .cf-svg *,.cf.is-offscreen .cf-svg *{animation:none!important}.cf.no-anim .cf-track-marker,.cf.is-offscreen .cf-track-marker{display:none}@media(prefers-reduced-motion:reduce){.cf-svg *,.cf-modal *{animation:none!important;transition:none!important}.cf-track-marker{display:none}}
  @container calefa-card (max-width:520px){
    ha-card{border-radius:20px}.cf{padding:6px 7px calc(14px + env(safe-area-inset-bottom,0px))}.cf-main{display:block}.cf-side{display:none}.cf-mobile-pairs{display:grid;gap:5px;margin-bottom:3px}.cf-mobile-pairs .cf-pair{grid-template-columns:minmax(0,1fr) 39px minmax(0,1fr);align-items:center;gap:3px}.cf-mobile-pairs .cf-delta{justify-self:stretch;flex-direction:column;justify-content:center;gap:0;min-height:38px;padding:2px}.cf-mobile-pairs .cf-metric{min-height:46px;padding:5px 6px;border-radius:11px;gap:4px}.cf-mobile-pairs .cf-metric>ha-icon{--mdc-icon-size:17px;flex-basis:18px}.cf-mobile-pairs .cf-metric small{font-size:8px}.cf-mobile-pairs .cf-metric strong{font-size:15px}.cf-mobile-pairs .cf-metric strong em{font-size:8px}.cf-mobile-pairs .cf-metric i{display:none}.cf-stage{width:100%;max-width:300px;margin:0 auto}.cf-stage-box{aspect-ratio:600/920}.cf-water{min-width:80px;padding:4px 5px}.cf-water small{font-size:7px}.cf-water strong{font-size:13px}.cf-water strong em{font-size:7px}.cf-water i{display:none}.cf-water-hot{right:-1%;top:48%}.cf-water-cold{right:-1%;top:75%}.cf-component{max-width:76px;padding:3px 4px}.cf-component>ha-icon{display:none}.cf-component small{font-size:6px}.cf-component strong{font-size:9px}.cf-component i{font-size:6px}.cf-component-dhw{right:12%;top:42%}.cf-component-heat{right:20%;top:59%}.cf-component-pump{left:35%;top:82%}.cf-footer{display:none}.cf-modal{padding:7px 7px calc(10px + env(safe-area-inset-bottom,0px))}.cf-device{padding:9px;border-radius:18px}.cf-screen{min-height:205px}.cf-screen-row{min-height:28px;font-size:11px}
  }
  @container calefa-card (max-width:380px){.cf{padding-left:5px;padding-right:5px}.cf-mobile-pairs .cf-pair{grid-template-columns:minmax(0,1fr) 35px minmax(0,1fr)}.cf-mobile-pairs .cf-metric>ha-icon{display:none}.cf-stage{max-width:286px}.cf-water{min-width:74px}.cf-component{max-width:70px}}
  @container calefa-card (min-width:521px) and (max-width:899px){.cf-main{grid-template-columns:minmax(150px,210px) minmax(315px,1fr) minmax(150px,210px);gap:12px}.cf-stage{max-width:450px}.cf-metric{min-height:52px;padding:6px 8px}.cf-metric>ha-icon{--mdc-icon-size:19px;flex-basis:21px}.cf-metric strong{font-size:16px}.cf-delta{min-height:21px}.cf-water{transform:scale(.9);transform-origin:right center}.cf-component{transform:scale(.86);transform-origin:center}}
  @container calefa-card (min-width:900px){.cf{padding:12px 22px 16px}.cf-top{margin-bottom:12px}.cf-main{grid-template-columns:minmax(160px,250px) minmax(330px,570px) minmax(160px,250px);gap:18px}.cf-stage{max-width:570px}.cf-stage .cf-water,.cf-stage .cf-component{display:none}.cf-metric{min-height:82px;padding:10px 12px}.cf-metric>ha-icon{--mdc-icon-size:27px;flex-basis:30px}.cf-metric small{font-size:12px}.cf-metric strong{font-size:25px}.cf-delta{min-height:25px}.cf-water{min-width:104px}.cf-water strong{font-size:21px}.cf-status{min-width:205px;min-height:104px}.cf-status strong{font-size:24px}.cf-side .cf-component{min-height:82px}.cf-side .cf-component strong{font-size:22px}}
  @container calefa-card (max-width:899px){.cf-callouts{display:none}.cf-pair:before{left:20px;right:20px;top:50%;bottom:auto;width:auto;height:1px;background:linear-gradient(90deg,var(--cf-supply),var(--cf-return))}.cf-right .cf-pair:before{background:linear-gradient(90deg,var(--cf-heat),var(--cf-heat-return))}.cf-top{display:block;margin:6px 2px 12px}.cf-brand-mark{font-size:17px;border-width:3px;padding:0 8px}.cf-brand h2{margin-top:5px;font-size:24px}.cf-brand p{font-size:12px}.cf-statuses{margin-top:10px}.cf-status{flex:1;min-width:0;min-height:58px;padding:6px 8px;border-radius:12px}.cf-status ha-icon{--mdc-icon-size:25px}.cf-status small{font-size:10px}.cf-status strong{font-size:15px}.cf-status em{display:none}}
  @container calefa-card (min-width:521px) and (max-width:899px){.cf-main{grid-template-columns:1fr;gap:10px}.cf-stage{grid-row:1;justify-self:center;width:min(100%,420px)}.cf-left{grid-row:2}.cf-right{grid-row:3}.cf-side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.cf-side .cf-pair{grid-column:1/-1;grid-template-columns:minmax(0,1fr) 45px minmax(0,1fr);align-items:center}.cf-side .cf-component{grid-column:1/-1}.cf-side .cf-water{grid-column:1/-1}.cf-side .cf-metric:before,.cf-side .cf-metric:after,.cf-side .cf-component:before,.cf-side .cf-component:after,.cf-side .cf-water:before{display:none}}
  @container calefa-card (max-width:520px){.cf-top{margin-bottom:9px}.cf-brand h2{font-size:21px}.cf-statuses{gap:5px}.cf-status{gap:5px}.cf-status ha-icon{--mdc-icon-size:21px}.cf-status small{font-size:9px}.cf-status strong{font-size:13px}.cf-stage .cf-water,.cf-stage .cf-component{display:none}.cf-mobile-components{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:5px}.cf-mobile-components .cf-component,.cf-mobile-components .cf-water{position:relative;inset:auto;max-width:none;min-width:0;min-height:45px;padding:6px 8px;transform:none}.cf-mobile-components .cf-component>ha-icon{display:block;--mdc-icon-size:19px}.cf-mobile-components .cf-component small,.cf-mobile-components .cf-water small{font-size:9px}.cf-mobile-components .cf-component strong,.cf-mobile-components .cf-water strong{font-size:16px}.cf-mobile-components .cf-component i,.cf-mobile-components .cf-water i{font-size:8px}.cf-footer{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin-top:10px}.cf-footer button{min-width:0}}

  .cf{padding-top:8px}.cf-side{align-self:center;justify-content:center;gap:14px}.cf-side .cf-metric,.cf-side .cf-component,.cf-side .cf-water{min-height:0;padding:8px 10px}.cf-side .cf-component,.cf-side .cf-water{min-height:0}.cf-side .cf-pair{gap:5px}.cf-delta{min-height:22px;padding:2px 8px}.cf-main{margin-top:0}
  .cf-display-led{fill:#6f8288;stroke:#b9c4c6;stroke-width:.55;opacity:.5;filter:none}.cf-display-led[data-tone="green"]{fill:#27f05b;stroke:#caffd5;opacity:1;filter:drop-shadow(0 0 3px #28ef61)}.cf-display-led[data-tone="red"]{fill:#fb2558;stroke:#ffd8e1;opacity:1;filter:drop-shadow(0 0 3px #ff315b)}.cf-display-led[data-tone="cyan"]{fill:#52dcff;stroke:#e2faff;opacity:1;filter:drop-shadow(0 0 3px #42cbf4)}.cf-display-led[data-tone="yellow"]{fill:#ffd24d;stroke:#fff4cb;opacity:1;filter:drop-shadow(0 0 3px #ffd45b)}.cf-display-led[data-tone="unknown"]{opacity:.18}.cf-display-led[data-blink="slow"]{animation:cf-led-slow 2.5s steps(1,end) infinite}.cf-display-led[data-blink="fast"]{animation:cf-led-slow .7s steps(1,end) infinite}@keyframes cf-led-slow{50%{opacity:.12}}
  .cf-device{width:min(100%,350px);padding:11px;border:1px solid #adb9ba;border-radius:17px;background:linear-gradient(145deg,#e7ebeb,#bec7c9);box-shadow:0 28px 70px #0009}.cf-device-head{padding:0 5px}.cf-device-head strong{font-size:17px;letter-spacing:.08em}.cf-device-head small{font-size:9px}.cf-device-face{border:1px solid #b9c0c0;border-radius:9px;padding:12px 14px;background:linear-gradient(#e4e6e5,#cbd1d2)}.cf-screen{min-height:158px;border:3px solid #51605d;border-radius:3px;padding:6px;background:linear-gradient(145deg,#bfd6ce,#a3beb4);box-shadow:inset 0 3px 9px #3251444f;font-size:10px}.cf-screen-head{min-height:21px;padding:0 3px 3px;border-color:#4e685c}.cf-screen-head strong{font-size:11px}.cf-screen-front{min-height:105px;grid-template-columns:minmax(0,1fr) 56px;border-width:1px}.cf-screen-front-main{padding:7px}.cf-screen-front-main small{font-size:10px}.cf-screen-front-main strong{font-size:27px}.cf-screen-front-rail{border-left-width:1px}.cf-screen-front-rail span{border-bottom-width:1px;font-size:8px}.cf-screen-row{min-height:30px;padding:5px 4px;font-size:11px}.cf-screen-row.selected{background:#162c23;color:#e6f4e9}.cf-screen-hint{font-size:8px;margin-top:3px}.cf-keys{gap:10px;margin-top:10px}.cf-keys button{width:39px;height:39px}.cf-long-enter{min-height:35px;margin-top:8px;font-size:9px}
  .cf.no-anim .cf-exchanger,.cf.is-offscreen .cf-exchanger,.cf.no-anim .cf-led-dhw,.cf.is-offscreen .cf-led-dhw{animation:none!important}
  @media(prefers-reduced-motion:reduce){.cf-exchanger,.cf-display-led{animation:none!important}}
  @container calefa-card (min-width:900px){.cf-side .cf-metric,.cf-side .cf-component,.cf-side .cf-water{min-height:0;padding:9px 11px}.cf-side .cf-metric strong{font-size:24px}.cf-side .cf-component strong{font-size:21px}.cf-side{gap:16px}}

  .cf-stage .cf-component{display:flex;position:absolute;z-index:8;inset:auto;width:84px;max-width:84px;min-height:38px;padding:4px 5px;background:rgba(6,19,27,.86);border-color:rgba(69,227,161,.42);border-radius:9px}.cf-stage .cf-component>ha-icon{display:none}.cf-stage .cf-component small{font-size:8px}.cf-stage .cf-component strong{font-size:13px}.cf-stage .cf-component i{font-size:7px}.cf-stage .cf-component-dhw{left:48%;top:43%}.cf-stage .cf-component-heat{left:26%;top:65%}
  .cf-pump-indicator{opacity:.75;color:#7c949f;filter:drop-shadow(0 0 4px #102e39)}.cf-pump-indicator-ring{fill:rgba(5,25,34,.48);stroke:currentColor;stroke-width:2;stroke-dasharray:17 10}.cf-pump-indicator-fan{fill:currentColor;transform-origin:center}.cf-pump-indicator>circle:last-child{fill:#d6e5e9}.cf-pump-indicator.is-on{opacity:1;color:#4ef0b1;filter:drop-shadow(0 0 8px #2cf0ad)}.cf-pump-indicator.is-on .cf-pump-indicator-fan{animation:cf-spin .92s linear infinite}.cf-pump-indicator.is-on .cf-pump-indicator-ring{animation:cf-spin 2.4s linear reverse infinite}.cf-pump-hit{position:absolute;z-index:9;left:43%;top:73%;width:16%;height:12%;border:0;background:transparent;cursor:pointer}.cf-pump-hit:focus-visible{outline:2px solid var(--cf-ok);border-radius:50%}
  .cf-legacy-hit{position:absolute;z-index:9;left:71%;top:7.5%;display:flex;align-items:center;justify-content:center;gap:5px;width:24%;min-height:35px;padding:4px 6px;border:1px solid #3e94af;border-radius:9px;background:rgba(5,28,41,.92);color:#93e5ff;box-shadow:0 0 13px rgba(62,190,224,.15);font-size:9px;font-weight:750;cursor:pointer}.cf-legacy-hit ha-icon{--mdc-icon-size:17px}.cf-legacy-hit:hover{background:#0b384a}
  .cf-side{gap:10px}.cf-left .cf-pair,.cf-right .cf-pair{margin:0}.cf-mobile-components{grid-template-columns:repeat(2,minmax(0,1fr))}
  @container calefa-card (max-width:899px){.cf-stage .cf-component{display:flex}.cf-stage .cf-component-dhw{left:47%;top:43%}.cf-stage .cf-component-heat{left:24%;top:65%}.cf-legacy-hit{left:72%;top:7%;width:21%;min-height:29px;padding:2px}.cf-legacy-hit span{display:none}}
  @container calefa-card (max-width:520px){.cf-mobile-components .cf-water{min-height:38px;padding:5px 7px}.cf-stage .cf-component{width:57px;max-width:57px;min-height:27px;padding:3px}.cf-stage .cf-component small{font-size:6px}.cf-stage .cf-component strong{font-size:9px}.cf-stage .cf-component i{display:none}.cf-pump-hit{left:43%;top:74%;width:17%}.cf-legacy-hit{min-height:25px}}
  .cf.no-anim .cf-pump-indicator *,.cf.is-offscreen .cf-pump-indicator *{animation:none!important}@media(prefers-reduced-motion:reduce){.cf-pump-indicator *{animation:none!important}}

  .cf-pair{gap:0}.cf-delta{--cf-delta-tone:#7b99a8;position:relative;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:0;width:56px;height:56px;min-height:56px;padding:3px;border:3px solid var(--cf-delta-tone);border-radius:50%;background:radial-gradient(circle,#15313d 0%,#0a1d29 74%);box-shadow:0 0 0 3px rgba(24,49,62,.75),0 0 14px color-mix(in srgb,var(--cf-delta-tone) 30%,transparent);color:#e7f7fa;text-align:center}.cf-delta.is-good{--cf-delta-tone:#3bdf9c}.cf-delta.is-bad{--cf-delta-tone:#ff685a}.cf-delta.is-muted{opacity:.55}.cf-delta small{font-size:9px;letter-spacing:.04em}.cf-delta strong{font-size:11px;line-height:1.05;white-space:nowrap}.cf-delta:not(.is-muted):after{content:"";position:absolute;inset:-6px;border:1px solid var(--cf-delta-tone);border-radius:50%;opacity:.35;animation:cf-delta-pulse 2.8s ease-in-out infinite}@keyframes cf-delta-pulse{50%{transform:scale(1.12);opacity:.1}}
  .cf-mobile-pairs .cf-pair,.cf-side .cf-pair{grid-template-columns:minmax(0,1fr) 56px minmax(0,1fr);align-items:center;gap:4px}.cf-side .cf-pair{grid-template-columns:1fr;gap:0}.cf-mobile-pairs .cf-delta{width:48px;height:48px;min-height:48px;justify-self:center;padding:2px}.cf-mobile-pairs .cf-delta strong{font-size:9px}.cf-mobile-pairs .cf-delta small{font-size:8px}
  .cf.no-anim .cf-delta:after,.cf.is-offscreen .cf-delta:after{animation:none!important}@media(prefers-reduced-motion:reduce){.cf-delta:after{animation:none!important}}
  @container calefa-card (min-width:521px) and (max-width:899px){.cf-side .cf-pair{grid-template-columns:minmax(0,1fr) 56px minmax(0,1fr)}}
  @container calefa-card (max-width:380px){.cf-mobile-pairs .cf-pair{grid-template-columns:minmax(0,1fr) 48px minmax(0,1fr)}.cf-mobile-pairs .cf-delta{width:43px;height:43px;min-height:43px}.cf-mobile-pairs .cf-delta strong{font-size:8px}}

  .cf-delta.is-good{--cf-delta-tone:#3bdf9c}.cf-delta.is-bad{--cf-delta-tone:#ff685a}.cf-delta.is-muted{--cf-delta-tone:#7b99a8;opacity:.55}
  .cf-pair .cf-metric{position:relative;overflow:visible}.cf-side .cf-delta{z-index:4;margin-block:-9px}.cf-mobile-pairs .cf-pair{grid-template-columns:minmax(0,1fr) 40px minmax(0,1fr);gap:2px}.cf-mobile-pairs .cf-delta{z-index:4;width:54px;height:54px;min-height:54px;margin-inline:-7px}.cf-mobile-pairs .cf-metric:first-child:after,.cf-mobile-pairs .cf-metric:last-child:before{content:"";position:absolute;top:50%;width:17px;height:38px;transform:translateY(-50%);border:1.5px solid var(--tone);pointer-events:none}.cf-mobile-pairs .cf-metric:first-child:after{right:-6px;border-left:0;border-radius:0 22px 22px 0}.cf-mobile-pairs .cf-metric:last-child:before{left:-6px;border-right:0;border-radius:22px 0 0 22px}.cf-side .cf-pair .cf-metric:first-child:after,.cf-side .cf-pair .cf-metric:last-child:before{content:"";position:absolute;left:50%;width:39px;height:17px;transform:translateX(-50%);border:1.5px solid var(--tone);pointer-events:none}.cf-side .cf-pair .cf-metric:first-child:after{bottom:-6px;border-top:0;border-radius:0 0 22px 22px}.cf-side .cf-pair .cf-metric:last-child:before{top:-6px;border-bottom:0;border-radius:22px 22px 0 0}
  @container calefa-card (max-width:899px){.cf-side .cf-pair{gap:2px}.cf-side .cf-delta{margin:0}.cf-side .cf-pair .cf-metric:first-child:after,.cf-side .cf-pair .cf-metric:last-child:before{display:none}.cf-mobile-pairs .cf-pair{grid-template-columns:minmax(0,1fr) 40px minmax(0,1fr)}}
  @container calefa-card (max-width:380px){.cf-mobile-pairs .cf-pair{grid-template-columns:minmax(0,1fr) 36px minmax(0,1fr)}.cf-mobile-pairs .cf-delta{width:49px;height:49px;min-height:49px;margin-inline:-6px}}
`;

if (!customElements.get("ha-calefa-flow-card")) customElements.define("ha-calefa-flow-card", HaCalefaFlowCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "ha-calefa-flow-card")) {
  window.customCards.push({ type: "ha-calefa-flow-card", name: "HA Calefa Flow Card", description: "Responsive animated Calefa II flow card", preview: false, documentationURL: "https://github.com/MRDonnii/ha-smart-home-cards/blob/main/docs/CALEFA_FLOW_CARD.md" });
}
console.info(`%c HA CALEFA FLOW CARD %c v${CALEFA_FLOW_CARD_VERSION} `, "background:#087ea4;color:#fff;font-weight:700;padding:2px 5px", "background:#102631;color:#8fe7ff;padding:2px 5px");
