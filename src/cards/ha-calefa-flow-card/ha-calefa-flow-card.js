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
    menu("ITC", [value("Status", "heating_active", "text")]),
    menu("Rum", [value("Temperatur", "room_temperature")]),
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

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[c]);
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
    if (typeof IntersectionObserver === "undefined" || this._observer) return;
    this._observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      this._refs.root?.classList.toggle("is-offscreen", entry ? !entry.isIntersecting : false);
    }, { rootMargin: "100px" });
    this._observer.observe(this);
  }

  disconnectedCallback() {
    this._observer?.disconnect();
    this._observer = null;
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
    const dhwPrimary = dhwValveOpen ?? (dhwTap || dhwBypass);
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
    return `<div class="cf-pair ${compact ? "is-compact" : ""}">${this._metricMarkup(first, compact)}<div class="cf-delta" data-delta="${delta}"><small>ΔT</small><strong>–</strong></div>${this._metricMarkup(second, compact)}</div>`;
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
  }

  _markup() {
    return `<ha-card><div class="cf ${this._config.animations ? "" : "no-anim"}" data-ref="root">
      <header class="cf-top"><div class="cf-brand"><span class="cf-brand-mark">wavin</span><h2>${escapeHtml(this._config.title)}</h2><p>${escapeHtml(this._config.subtitle)}</p></div><div class="cf-statuses"><div class="cf-status cf-status-heating" data-ref="heat-status-card"><ha-icon icon="mdi:heat-wave"></ha-icon><span><small>Varmedrift</small><strong data-ref="heat-status-text">standby</strong><em>Leverer varme til boligen</em></span></div><div class="cf-status cf-status-water" data-ref="dhw-status-card"><ha-icon icon="mdi:water"></ha-icon><span><small>Brugsvand</small><strong data-ref="dhw-status-text">standby</strong><em>Ingen tapning lige nu</em></span></div></div></header>
      <div class="cf-mobile-pairs">${this._pairMarkup("fjv_supply", "fjv_return", "fjv", true)}${this._pairMarkup("heating_supply", "heating_return", "heating", true)}</div>
      <div class="cf-main">
        <aside class="cf-side cf-left">${this._pairMarkup("fjv_supply", "fjv_return", "fjv")}${this._componentMarkup("pump", "cf-side-component")}</aside>
        <section class="cf-stage"><div class="cf-stage-box">${this._svgMarkup()}${this._waterMarkup("dhw_temperature", "cf-water-hot")}${this._waterMarkup("cold_water_temperature", "cf-water-cold")}${this._componentMarkup("dhw_valve", "cf-component-dhw")}${this._componentMarkup("heating_valve", "cf-component-heat")}${this._componentMarkup("pump", "cf-component-pump")}<button class="cf-display-hit" type="button" data-action="open-display" aria-label="Åbn Calefa-display"><ha-icon icon="mdi:gesture-tap"></ha-icon></button></div></section>
        <aside class="cf-side cf-right">${this._waterMarkup("dhw_temperature", "cf-side-water")}${this._pairMarkup("heating_supply", "heating_return", "heating")}${this._componentMarkup("heating_valve", "cf-side-component")}</aside>
      </div>
      <div class="cf-mobile-components">${this._componentMarkup("pump", "cf-mobile-component")}${this._componentMarkup("heating_valve", "cf-mobile-component")}${this._componentMarkup("dhw_valve", "cf-mobile-component")}${this._waterMarkup("dhw_temperature", "cf-mobile-water")}${this._waterMarkup("cold_water_temperature", "cf-mobile-water")}</div>
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
      </defs>
      ${photo}
      <g class="cf-unit ${photo ? "has-photo" : ""}" filter="url(#shadow)">
        <rect x="75" y="215" width="450" height="675" rx="30" fill="url(#body)" stroke="#20272b" stroke-width="2"/><rect x="75" y="215" width="450" height="675" rx="30" fill="url(#epp)" opacity=".82"/><g class="cf-grooves">${grooves}</g>
        <rect x="58" y="44" width="484" height="210" rx="42" fill="url(#hood)" stroke="#292e32" stroke-width="2"/><rect x="58" y="44" width="484" height="210" rx="42" fill="url(#epp)" opacity=".58"/>
        <rect class="cf-control" x="194" y="88" width="212" height="126" rx="10"/><rect x="242" y="105" width="116" height="58" rx="4" fill="url(#lcd)" stroke="#68838c" stroke-width="2"/><text class="cf-mini-title" x="300" y="124" text-anchor="middle" data-ref="mini-title">STANDBY</text><text class="cf-mini-value" x="300" y="154" text-anchor="middle" data-ref="mini-value">–</text>
        <circle class="cf-status-dot cf-status-heat" data-ref="status-heat" cx="287" cy="184" r="6"/><circle class="cf-status-dot cf-status-dhw" data-ref="status-dhw" cx="313" cy="184" r="6"/><circle class="cf-small-led" cx="257" cy="184" r="3.7"/><circle class="cf-small-led" cx="343" cy="184" r="3.7"/>
        <g class="cf-pipes-base"><path d="M105 875 V360 H454 V432"/><path d="M165 875 V408 H404 V492"/><path d="M300 875 V760 H445 V690"/><path d="M370 875 V780 H480 V690"/><path d="M465 875 V790 H520 V748"/><path d="M535 875 V748"/></g><g class="cf-pipe-shine"><path d="M105 875 V360 H454 V432"/><path d="M165 875 V408 H404 V492"/><path d="M300 875 V760 H445 V690"/><path d="M370 875 V780 H480 V690"/><path d="M465 875 V790 H520 V748"/><path d="M535 875 V748"/></g>
        <g class="cf-hx" data-ref="hx-heat"><rect x="420" y="430" width="82" height="302" rx="13" fill="url(#copper)"/><path d="M438 448 V714 M451 448 V714 M464 448 V714 M477 448 V714 M490 448 V714"/></g><g class="cf-hx" data-ref="hx-dhw"><rect x="475" y="482" width="84" height="316" rx="13" fill="url(#copper)"/><path d="M492 500 V780 M505 500 V780 M518 500 V780 M531 500 V780 M544 500 V780"/></g><g class="cf-hx-label"><text x="458" y="610" transform="rotate(-90 458 610)">VARME</text><text x="517" y="650" transform="rotate(-90 517 650)">BRUGSVAND</text></g>
        <g class="cf-valve" data-ref="heat-valve"><path d="M388 560 L403 575 L388 590 M418 560 L403 575 L418 590" fill="url(#brass)"/><rect x="378" y="530" width="48" height="45" rx="9"/></g><g class="cf-valve" data-ref="dhw-valve"><path d="M438 433 L453 448 L438 463 M468 433 L453 448 L468 463" fill="url(#brass)"/><rect x="428" y="398" width="50" height="46" rx="9"/></g>
        <g class="cf-pump" data-ref="pump"><rect x="258" y="790" width="84" height="86" rx="26"/><circle cx="300" cy="833" r="31"/><path class="cf-pump-spin" d="M300 808 C326 812 332 833 318 852 C294 847 284 826 300 808Z"/></g>
        <g class="cf-flow cf-flow-primary" data-ref="flow-primary"><path d="M75 900 V440 H445 V395"/><path class="return" d="M440 515 H145 V900"/></g><g class="cf-flow cf-flow-heat" data-ref="flow-heat"><path d="M290 900 V735 H350 V675 H450"/><path class="return" d="M505 650 V715 H365 V900"/></g><g class="cf-flow cf-flow-dhw" data-ref="flow-dhw"><path d="M530 900 V720 H470"/><path class="hot" d="M445 440 V515 H475 V900"/></g>
        <g class="cf-connections">${connections}</g>
      </g>
    </svg>`;
  }

  _modalMarkup() {
    return `<div class="cf-modal" data-ref="modal" hidden><div class="cf-modal-backdrop" data-action="close-display"></div><section class="cf-device" role="dialog" aria-modal="true" tabindex="-1" data-ref="device"><div class="cf-device-head"><div><strong>Calefa II V</strong><small>Virtuelt betjeningspanel</small></div><button type="button" data-action="close-display" aria-label="Luk display"><ha-icon icon="mdi:close"></ha-icon></button></div><div class="cf-device-face"><div class="cf-screen"><div class="cf-screen-head"><ha-icon data-ref="screen-icon" icon="mdi:water-thermometer"></ha-icon><strong data-ref="screen-title">BV</strong><span data-ref="screen-index">1/4</span></div><div class="cf-screen-body" data-ref="screen-body"></div><div class="cf-screen-hint" data-ref="screen-hint">Langt ENTER: menu</div></div><div class="cf-keys"><button type="button" data-action="display-down" aria-label="Ned"><ha-icon icon="mdi:chevron-down"></ha-icon><span>NED</span></button><button type="button" data-action="display-enter" aria-label="Enter"><ha-icon icon="mdi:keyboard-return"></ha-icon><span>ENTER</span></button><button type="button" data-action="display-up" aria-label="Op"><ha-icon icon="mdi:chevron-up"></ha-icon><span>OP</span></button></div><button class="cf-long-enter" type="button" data-action="display-long-enter" aria-label="Langt Enter">Hold ENTER · menu / tilbage</button></div></section></div>`;
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
    if (id.startsWith("fjv_")) on = model.primary;
    else if (id.startsWith("heating_")) on = model.heatLoop;
    else if (id === "dhw_temperature" || id === "cold_water_temperature") on = model.dhwTap;
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

  _applyDeltas(model) {
    const values = { fjv: model.cooling, heating: model.heatingDelta };
    this.shadowRoot.querySelectorAll("[data-delta]").forEach((node) => {
      const value = values[node.dataset.delta];
      this._text(node.querySelector("strong"), value === null ? "–" : `${this._formatNumber(value, 1)}°`);
      this._toggle(node, "is-muted", value === null);
    });
  }

  _applyDiagram(model) {
    this._setFlowDuration(this._refs["flow-primary"], model.pumpSpeed ?? model.heatingValve ?? model.dhwValve);
    this._setFlowDuration(this._refs["flow-heat"], model.pumpSpeed ?? model.heatingValve);
    this._setFlowDuration(this._refs["flow-dhw"], this._num("water_flow"), this._unit("water_flow"));
    this._toggle(this._refs["heat-status-card"], "is-active", model.heatingActive);
    this._toggle(this._refs["dhw-status-card"], "is-active", model.dhwTap || model.dhwBypass);
    this._text(this._refs["heat-status-text"], model.heatingActive ? "aktiv" : "standby");
    this._text(this._refs["dhw-status-text"], model.dhwTap ? "aktiv" : model.dhwBypass ? "bypass" : "standby");
    this._toggle(this._refs["flow-primary"], "is-on", model.primary);
    this._toggle(this._refs["flow-heat"], "is-on", model.heatLoop);
    this._toggle(this._refs["flow-dhw"], "is-on", model.dhwTap);
    this._toggle(this._refs.pump, "is-on", model.pumpActive);
    this._toggle(this._refs["heat-valve"], "is-on", Boolean(model.heatValveOpen ?? model.heatPrimary));
    this._toggle(this._refs["dhw-valve"], "is-on", Boolean(model.dhwValveOpen ?? model.dhwPrimary));
    this._toggle(this._refs["hx-heat"], "is-on", model.heatPrimary || model.heatLoop);
    this._toggle(this._refs["hx-dhw"], "is-on", model.dhwPrimary || model.dhwTap);
    this._toggle(this._refs["status-heat"], "active", model.heatingActive);
    this._toggle(this._refs["status-dhw"], "active", model.dhwTap || model.dhwBypass);
    const key = model.dhwTap && this._config.dhw_temperature ? "dhw_temperature" : this._config.heating_supply ? "heating_supply" : "fjv_supply";
    this._text(this._refs["mini-title"], model.dhwTap ? "BRUGSVAND" : model.heatingActive ? "VARME" : model.dhwBypass ? "BYPASS" : "STANDBY");
    this._text(this._refs["mini-value"], this._config[key] ? this._format(key, "temperature").replace(" °C", "°") : "–");
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
      const start = Math.max(0, Math.min(this._menuIndex - 2, children.length - 5));
      rows = children.length ? children.slice(start, start + 5).map((item, offset) => `<div class="cf-screen-row ${start + offset === this._menuIndex ? "selected" : ""}"><span>${escapeHtml(item.label)}${item.children ? " ›" : ""}</span><strong>${item.children ? "" : escapeHtml(this._menuValue(item))}</strong></div>`).join("") : `<div class="cf-screen-note">${node.service ? "Kun visning · ingen fysisk handling" : escapeHtml(this._menuValue(node))}</div>`;
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
        const options = selected.options ? this._editOptions(selected, state) : null;
        this._edit = { node: selected, value: options && !options.includes(state.state) ? options[0] : String(state.state), options, confirm: false };
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
  *{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}ha-card{position:relative;display:block;overflow:hidden;border:1px solid rgba(145,177,199,.16);border-radius:var(--ha-card-border-radius,24px);background:radial-gradient(95% 55% at 50% 31%,rgba(43,95,125,.29),transparent 70%),linear-gradient(155deg,#0b1924,#102535 54%,#07121b);color:var(--cf-text);box-shadow:0 18px 52px rgba(0,0,0,.3)}.cf{padding:12px 16px 15px;min-width:0}.cf-main{display:grid;grid-template-columns:minmax(160px,250px) minmax(330px,540px) minmax(160px,250px);align-items:center;justify-content:center;gap:18px;max-width:1180px;margin:0 auto}.cf-side{min-width:0}.cf-stage{min-width:0}.cf-stage-box{position:relative;width:100%;aspect-ratio:600/920;isolation:isolate}.cf-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.cf-photo{opacity:.84}.cf-unit.has-photo{opacity:.18}
  .cf-grooves path{fill:none;stroke:#050607;stroke-width:3;opacity:.42}.cf-control{fill:#e8ecec;stroke:#a8b0b3;stroke-width:2}.cf-mini-title{fill:#243a44;font:800 11px system-ui,sans-serif;letter-spacing:.05em}.cf-mini-value{fill:#173442;font:850 26px system-ui,sans-serif}.cf-status-dot{fill:#9aa5a9;stroke:#738087;stroke-width:1.2}.cf-status-heat.active{fill:#ff3f4b;stroke:#ff8790;filter:drop-shadow(0 0 7px rgba(255,63,75,.95))}.cf-status-dhw.active{fill:#269dff;stroke:#8ccaff;filter:drop-shadow(0 0 7px rgba(38,157,255,.95))}.cf-small-led{fill:#39d77b;filter:drop-shadow(0 0 3px rgba(57,215,123,.7))}.cf-pipes-base path{fill:none;stroke:url(#steel);stroke-width:15;stroke-linecap:round;stroke-linejoin:round}.cf-pipe-shine path{fill:none;stroke:rgba(255,255,255,.5);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.cf-hx{filter:drop-shadow(0 6px 7px rgba(0,0,0,.45))}.cf-hx path{fill:none;stroke:#5f2b1c;stroke-width:2.5;opacity:.72}.cf-hx.is-on{filter:drop-shadow(0 0 12px rgba(255,131,70,.28)) drop-shadow(0 7px 7px rgba(0,0,0,.42))}.cf-hx-label text{fill:#fff;font:800 14px system-ui,sans-serif;letter-spacing:1px}.cf-valve rect{fill:#10181d;stroke:#52636c;stroke-width:2}.cf-valve.is-on rect{stroke:var(--cf-ok);filter:drop-shadow(0 0 6px rgba(53,223,156,.45))}.cf-pump>rect{fill:#202a30;stroke:#44535b;stroke-width:2}.cf-pump>circle{fill:#10181d;stroke:#39484f;stroke-width:3}.cf-pump-spin{fill:#54656e;transform-origin:300px 833px}.cf-pump.is-on .cf-pump-spin{fill:#76a8bf;animation:cf-spin 1.2s linear infinite}.cf-flow path{fill:none;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:2 18;opacity:0}.cf-flow.is-on path{opacity:1;animation:cf-flow var(--cf-flow-duration,1.1s) linear infinite}.cf-flow-primary path{stroke:var(--cf-supply);filter:url(#hotGlow)}.cf-flow-primary .return{stroke:var(--cf-return);filter:url(#blueGlow)}.cf-flow-heat path{stroke:var(--cf-heat);filter:url(#hotGlow)}.cf-flow-heat .return{stroke:var(--cf-heat-return);filter:url(#blueGlow)}.cf-flow-dhw path{stroke:var(--cf-cold);filter:url(#blueGlow)}.cf-flow-dhw .hot{stroke:var(--cf-dhw);filter:url(#hotGlow)}.cf-connections circle{fill:#192228;stroke:#89969c;stroke-width:4}.cf-connections text{fill:#879aa6;font:750 18px system-ui,sans-serif}.cf-display-hit{position:absolute;z-index:8;left:32.3%;top:6.3%;width:35.4%;height:14.2%;border:0;background:transparent;cursor:pointer}.cf-display-hit ha-icon{position:absolute;right:-7px;top:-7px;--mdc-icon-size:18px;width:31px;height:31px;padding:7px;border:1px solid rgba(95,210,255,.58);border-radius:50%;background:#0a2939;color:#68d9ff;box-shadow:0 5px 16px rgba(0,0,0,.35)}
  .cf-pair{display:grid;grid-template-columns:1fr;gap:3px}.cf-metric{--tone:#68808e;display:flex;align-items:center;gap:7px;min-width:0;min-height:58px;padding:7px 9px;border:1px solid color-mix(in srgb,var(--tone) 38%,transparent);border-radius:14px;background:linear-gradient(135deg,color-mix(in srgb,var(--tone) 9%,transparent),rgba(5,13,20,.8) 72%);text-align:left;cursor:pointer}.cf-metric[data-tone="supply"]{--tone:var(--cf-supply)}.cf-metric[data-tone="return"]{--tone:var(--cf-return)}.cf-metric[data-tone="heat"]{--tone:var(--cf-heat)}.cf-metric[data-tone="heat-return"]{--tone:var(--cf-heat-return)}.cf-metric.is-on{border-color:color-mix(in srgb,var(--tone) 70%,transparent);box-shadow:0 0 17px color-mix(in srgb,var(--tone) 10%,transparent)}.cf-metric>ha-icon{--mdc-icon-size:22px;flex:0 0 25px;color:var(--tone)}.cf-metric>span{display:flex;flex-direction:column;min-width:0}.cf-metric small{font-size:10px;color:#dbe6ec}.cf-metric strong{display:flex;align-items:baseline;color:var(--tone);font-size:18px;line-height:1.05;white-space:nowrap}.cf-metric strong b{font-weight:850}.cf-metric strong em{margin-left:2px;color:var(--cf-muted);font-size:10px;font-style:normal;font-weight:500}.cf-metric i{margin-top:1px;overflow:hidden;color:var(--cf-muted);font-size:8px;font-style:normal;white-space:nowrap;text-overflow:ellipsis}.cf-metric.is-unavailable{opacity:.45}.cf-delta{justify-self:center;display:flex;align-items:center;gap:5px;min-height:23px;padding:2px 9px;border:1px solid rgba(147,210,239,.2);border-radius:999px;background:rgba(12,29,40,.9);color:#cfe8f4;box-shadow:0 3px 10px rgba(0,0,0,.2);z-index:2}.cf-delta small{font-size:7px;font-weight:800;letter-spacing:.08em}.cf-delta strong{font-size:11px;font-variant-numeric:tabular-nums}.cf-delta.is-muted{opacity:.4}.cf-missing{display:block}
  .cf-water{--tone:#fff;position:absolute;z-index:6;display:flex;flex-direction:column;min-width:96px;padding:5px 7px;border:1px solid color-mix(in srgb,var(--tone) 52%,transparent);border-radius:10px;background:rgba(5,14,21,.83);box-shadow:0 6px 15px rgba(0,0,0,.25);backdrop-filter:blur(4px);text-align:left;cursor:pointer}.cf-water[data-tone="dhw"]{--tone:var(--cf-dhw)}.cf-water[data-tone="cold"]{--tone:var(--cf-cold)}.cf-water-hot{right:1%;top:48%}.cf-water-cold{right:1%;top:75%}.cf-water small{font-size:8px;color:#dce6eb}.cf-water strong{display:flex;align-items:baseline;color:var(--tone);font-size:15px}.cf-water strong b{font-weight:850}.cf-water strong em{margin-left:2px;color:var(--cf-muted);font-size:8px;font-style:normal}.cf-water i{font-size:7px;color:var(--cf-muted);font-style:normal}
  .cf-component{position:absolute;z-index:7;display:flex;align-items:center;gap:4px;max-width:94px;padding:4px 5px;border:1px solid rgba(53,223,156,.26);border-radius:8px;background:rgba(5,14,20,.79);box-shadow:0 5px 13px rgba(0,0,0,.25);backdrop-filter:blur(4px);color:#dce8ed;text-align:left;cursor:pointer}.cf-component>ha-icon{--mdc-icon-size:13px;color:var(--cf-ok)}.cf-component>span{display:flex;flex-direction:column;min-width:0}.cf-component small{font-size:7px;color:var(--cf-muted);white-space:nowrap}.cf-component strong{display:flex;align-items:baseline;font-size:10px;line-height:1.05;white-space:nowrap}.cf-component strong b{font-weight:800}.cf-component strong em{margin-left:2px;font-size:7px;color:var(--cf-muted);font-style:normal}.cf-component i{font-size:7px;color:var(--cf-muted);font-style:normal;white-space:nowrap}.cf-component.is-on{border-color:rgba(53,223,156,.58);box-shadow:0 0 14px rgba(53,223,156,.1)}.cf-component-dhw{right:12%;top:42%}.cf-component-heat{right:20%;top:59%}.cf-component-pump{left:35%;top:82%}
  .cf-mobile-pairs{display:none}.cf-footer{display:flex;gap:0;max-width:1180px;margin:8px auto 0;padding-top:10px;border-top:1px solid var(--cf-line)}.cf-footer button{display:flex;align-items:center;gap:7px;flex:1 1 0;min-width:0;padding:5px 9px;border:0;border-left:1px solid var(--cf-line);background:none;text-align:left;cursor:pointer}.cf-footer button:first-child{border-left:0}.cf-footer ha-icon{--mdc-icon-size:19px;color:#b8ccd8}.cf-footer small,.cf-footer strong{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.cf-footer small{color:var(--cf-muted);font-size:8px}.cf-footer strong{font-size:12px}
  .cf-modal{position:absolute;inset:0;z-index:30;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto}.cf-modal-backdrop{position:absolute;inset:0;background:rgba(2,8,13,.76);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}.cf-device{position:relative;width:min(100%,450px);margin:auto;padding:12px;border-radius:24px;background:linear-gradient(155deg,#f0f2f1,#d9dedf 60%,#c5cbcd);color:#1d2b31;box-shadow:0 30px 80px rgba(0,0,0,.5)}.cf-device-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.cf-device-head strong,.cf-device-head small{display:block}.cf-device-head small{color:#607078;font-size:10px}.cf-device-head button{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:50%;background:rgba(20,35,43,.08);color:#2c3f48}.cf-device-face{padding:9px;border-radius:14px;background:linear-gradient(#e7eae9,#d3d8d9)}.cf-screen{min-height:230px;padding:10px;border:2px solid #576a71;border-radius:7px;background:linear-gradient(#c5d9d3,#aec4bc);color:#142820}.cf-screen-head{display:flex;align-items:center;gap:7px;padding-bottom:6px;border-bottom:2px solid rgba(20,40,32,.5)}.cf-screen-head ha-icon{--mdc-icon-size:18px}.cf-screen-head strong{flex:1;letter-spacing:.07em}.cf-screen-head span{font-size:11px;font-weight:800}.cf-screen-body{padding-top:5px}.cf-screen-row{display:flex;justify-content:space-between;gap:10px;min-height:30px;padding:4px 5px;border-bottom:1px solid rgba(20,40,32,.15);font-size:12px}.cf-screen-row strong{max-width:55%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.cf-keys{display:flex;justify-content:center;gap:15px;margin-top:9px}.cf-keys button{display:grid;place-items:center;width:44px;height:44px;border:1px solid rgba(0,0,0,.13);border-radius:50%;background:linear-gradient(#fafafa,#dfe4e4);color:#2e4048}.cf-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:8px}.cf-tabs button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0;min-height:47px;padding:4px 2px;border:1px solid rgba(0,0,0,.1);border-radius:10px;background:rgba(255,255,255,.52);color:#364a52;font-size:9px;font-weight:750}.cf-tabs button ha-icon{--mdc-icon-size:17px}.cf-tabs button span{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.cf-tabs button.active{background:#1c3139;color:#eef6f7}
  .cf-top{position:relative;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;max-width:1180px;margin:8px auto -8px}.cf-brand-mark{display:inline-block;padding:0 13px 1px;border:4px solid #37baff;border-radius:100px;color:#4fc2ff;font-size:26px;font-weight:950;letter-spacing:.03em;line-height:1}.cf-brand h2{margin:9px 0 0;font-size:clamp(24px,3cqw,42px);line-height:1.05;letter-spacing:.01em}.cf-brand p{margin:4px 0;color:#aebfc9;font-size:clamp(12px,1.5cqw,19px)}.cf-statuses{display:flex;gap:9px}.cf-status{display:flex;align-items:center;gap:11px;min-width:155px;min-height:82px;padding:11px 13px;border:1px solid #526675;border-radius:16px;background:linear-gradient(125deg,#243444bb,#111d29cc);box-shadow:0 12px 28px #0004}.cf-status ha-icon{--mdc-icon-size:37px;color:#788995}.cf-status span{display:flex;flex-direction:column}.cf-status small{font-size:13px}.cf-status strong{font-size:20px;line-height:1.1}.cf-status em{margin-top:5px;color:#a7b8c4;font-size:10px;font-style:normal}.cf-status-heating.is-active{border-color:#d17840}.cf-status-heating.is-active ha-icon{color:#ff9252;filter:drop-shadow(0 0 9px #ff6d3d)}.cf-status-water.is-active{border-color:#6ba9e5}.cf-status-water.is-active ha-icon{color:#6fbdff;filter:drop-shadow(0 0 9px #4ba7ff)}.cf-photo{opacity:1}.cf-unit.has-photo{opacity:1}.cf-unit.has-photo>rect,.cf-unit.has-photo>.cf-grooves,.cf-unit.has-photo>.cf-pipes-base,.cf-unit.has-photo>.cf-pipe-shine,.cf-unit.has-photo>.cf-hx,.cf-unit.has-photo>.cf-hx-label,.cf-unit.has-photo>.cf-valve,.cf-unit.has-photo>.cf-pump,.cf-unit.has-photo>.cf-connections,.cf-unit.has-photo>.cf-status-dot,.cf-unit.has-photo>.cf-small-led,.cf-unit.has-photo>text{display:none}.cf-side{align-self:stretch;display:flex;flex-direction:column;justify-content:space-evenly;gap:18px}.cf-side .cf-component,.cf-side .cf-water{position:relative;inset:auto;max-width:none;min-width:0;transform:none}.cf-side .cf-component{min-height:64px;padding:8px 10px;border-radius:13px}.cf-side .cf-component>ha-icon{--mdc-icon-size:25px}.cf-side .cf-component small{font-size:11px}.cf-side .cf-component strong{font-size:18px}.cf-side .cf-component i{font-size:9px}.cf-side .cf-water{min-height:64px;padding:8px 10px;border-radius:13px}.cf-side .cf-water small{font-size:11px}.cf-side .cf-water strong{font-size:19px}.cf-left .cf-metric,.cf-left .cf-component{position:relative}.cf-right .cf-metric,.cf-right .cf-component,.cf-right .cf-water{position:relative}.cf-left .cf-metric:after,.cf-left .cf-component:after{content:"";position:absolute;left:100%;top:50%;width:22px;height:1px;background:var(--tone,var(--cf-ok));opacity:.7}.cf-right .cf-metric:before,.cf-right .cf-component:before,.cf-right .cf-water:before{content:"";position:absolute;right:100%;top:50%;width:22px;height:1px;background:var(--tone,var(--cf-ok));opacity:.7}
  .cf-mobile-components{display:none}.cf-screen{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.cf-screen.is-front .cf-screen-head{display:none}.cf-screen-front{display:grid;grid-template-columns:minmax(0,1fr) 70px;min-height:170px;border:2px solid #1a302a}.cf-screen-front-main{display:flex;flex-direction:column;justify-content:space-between;padding:12px 8px}.cf-screen-front-main small{font-size:16px;font-weight:800}.cf-screen-front-main strong{font-size:35px;line-height:1.1}.cf-screen-front-rail{display:flex;flex-direction:column;border-left:2px solid #1a302a}.cf-screen-front-rail span{display:grid;place-items:center;flex:1;border-bottom:2px solid #1a302a;font-size:10px;font-weight:800}.cf-screen-front-rail span:last-child{border:0}.cf-screen-row.selected{background:#1b342d;color:#ddf6e6}.cf-screen-row.selected strong{color:#fff}.cf-screen-note{padding:12px 5px;font-size:11px}.cf-screen-hint{border-top:1px solid #6d857a;padding-top:5px;font-size:10px}.cf-keys button{display:flex;flex-direction:column;gap:0;font-size:9px;font-weight:800}.cf-keys button span{line-height:1}.cf-long-enter{display:block;width:100%;min-height:44px;margin-top:8px;border:1px solid #9daeb1;border-radius:9px;background:#e1e8e8;color:#24383d;font-size:11px;font-weight:700}button:focus-visible{outline:3px solid #49bdff;outline-offset:2px}
  @keyframes cf-flow{to{stroke-dashoffset:-40}}@keyframes cf-spin{to{transform:rotate(360deg)}}.cf.no-anim .cf-svg *,.cf.is-offscreen .cf-svg *{animation:none!important}@media(prefers-reduced-motion:reduce){.cf-svg *,.cf-modal *{animation:none!important;transition:none!important}}
  @container calefa-card (max-width:520px){
    ha-card{border-radius:20px}.cf{padding:6px 7px calc(14px + env(safe-area-inset-bottom,0px))}.cf-main{display:block}.cf-side{display:none}.cf-mobile-pairs{display:grid;gap:5px;margin-bottom:3px}.cf-mobile-pairs .cf-pair{grid-template-columns:minmax(0,1fr) 39px minmax(0,1fr);align-items:center;gap:3px}.cf-mobile-pairs .cf-delta{justify-self:stretch;flex-direction:column;justify-content:center;gap:0;min-height:38px;padding:2px}.cf-mobile-pairs .cf-metric{min-height:46px;padding:5px 6px;border-radius:11px;gap:4px}.cf-mobile-pairs .cf-metric>ha-icon{--mdc-icon-size:17px;flex-basis:18px}.cf-mobile-pairs .cf-metric small{font-size:8px}.cf-mobile-pairs .cf-metric strong{font-size:15px}.cf-mobile-pairs .cf-metric strong em{font-size:8px}.cf-mobile-pairs .cf-metric i{display:none}.cf-stage{width:100%;max-width:300px;margin:0 auto}.cf-stage-box{aspect-ratio:600/920}.cf-water{min-width:80px;padding:4px 5px}.cf-water small{font-size:7px}.cf-water strong{font-size:13px}.cf-water strong em{font-size:7px}.cf-water i{display:none}.cf-water-hot{right:-1%;top:48%}.cf-water-cold{right:-1%;top:75%}.cf-component{max-width:76px;padding:3px 4px}.cf-component>ha-icon{display:none}.cf-component small{font-size:6px}.cf-component strong{font-size:9px}.cf-component i{font-size:6px}.cf-component-dhw{right:12%;top:42%}.cf-component-heat{right:20%;top:59%}.cf-component-pump{left:35%;top:82%}.cf-footer{display:none}.cf-modal{padding:7px 7px calc(10px + env(safe-area-inset-bottom,0px))}.cf-device{padding:9px;border-radius:18px}.cf-screen{min-height:205px}.cf-screen-row{min-height:28px;font-size:11px}
  }
  @container calefa-card (max-width:380px){.cf{padding-left:5px;padding-right:5px}.cf-mobile-pairs .cf-pair{grid-template-columns:minmax(0,1fr) 35px minmax(0,1fr)}.cf-mobile-pairs .cf-metric>ha-icon{display:none}.cf-stage{max-width:286px}.cf-water{min-width:74px}.cf-component{max-width:70px}}
  @container calefa-card (min-width:521px) and (max-width:899px){.cf-main{grid-template-columns:minmax(150px,210px) minmax(315px,1fr) minmax(150px,210px);gap:12px}.cf-stage{max-width:450px}.cf-metric{min-height:52px;padding:6px 8px}.cf-metric>ha-icon{--mdc-icon-size:19px;flex-basis:21px}.cf-metric strong{font-size:16px}.cf-delta{min-height:21px}.cf-water{transform:scale(.9);transform-origin:right center}.cf-component{transform:scale(.86);transform-origin:center}}
  @container calefa-card (min-width:900px){.cf{padding:12px 22px 16px}.cf-top{margin-bottom:12px}.cf-main{grid-template-columns:minmax(160px,250px) minmax(330px,570px) minmax(160px,250px);gap:18px}.cf-stage{max-width:570px}.cf-stage .cf-water,.cf-stage .cf-component{display:none}.cf-metric{min-height:82px;padding:10px 12px}.cf-metric>ha-icon{--mdc-icon-size:27px;flex-basis:30px}.cf-metric small{font-size:12px}.cf-metric strong{font-size:25px}.cf-delta{min-height:25px}.cf-water{min-width:104px}.cf-water strong{font-size:21px}.cf-status{min-width:205px;min-height:104px}.cf-status strong{font-size:24px}.cf-side .cf-component{min-height:82px}.cf-side .cf-component strong{font-size:22px}}
  @container calefa-card (max-width:899px){.cf-top{display:block;margin:6px 2px 12px}.cf-brand-mark{font-size:17px;border-width:3px;padding:0 8px}.cf-brand h2{margin-top:5px;font-size:24px}.cf-brand p{font-size:12px}.cf-statuses{margin-top:10px}.cf-status{flex:1;min-width:0;min-height:58px;padding:6px 8px;border-radius:12px}.cf-status ha-icon{--mdc-icon-size:25px}.cf-status small{font-size:10px}.cf-status strong{font-size:15px}.cf-status em{display:none}}
  @container calefa-card (min-width:521px) and (max-width:899px){.cf-main{grid-template-columns:1fr;gap:10px}.cf-stage{grid-row:1;justify-self:center;width:min(100%,420px)}.cf-left{grid-row:2}.cf-right{grid-row:3}.cf-side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.cf-side .cf-pair{grid-column:1/-1;grid-template-columns:minmax(0,1fr) 45px minmax(0,1fr);align-items:center}.cf-side .cf-component{grid-column:1/-1}.cf-side .cf-water{grid-column:1/-1}.cf-side .cf-metric:before,.cf-side .cf-metric:after,.cf-side .cf-component:before,.cf-side .cf-component:after,.cf-side .cf-water:before{display:none}}
  @container calefa-card (max-width:520px){.cf-top{margin-bottom:9px}.cf-brand h2{font-size:21px}.cf-statuses{gap:5px}.cf-status{gap:5px}.cf-status ha-icon{--mdc-icon-size:21px}.cf-status small{font-size:9px}.cf-status strong{font-size:13px}.cf-stage .cf-water,.cf-stage .cf-component{display:none}.cf-mobile-components{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:5px}.cf-mobile-components .cf-component,.cf-mobile-components .cf-water{position:relative;inset:auto;max-width:none;min-width:0;min-height:45px;padding:6px 8px;transform:none}.cf-mobile-components .cf-component>ha-icon{display:block;--mdc-icon-size:19px}.cf-mobile-components .cf-component small,.cf-mobile-components .cf-water small{font-size:9px}.cf-mobile-components .cf-component strong,.cf-mobile-components .cf-water strong{font-size:16px}.cf-mobile-components .cf-component i,.cf-mobile-components .cf-water i{font-size:8px}.cf-footer{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin-top:10px}.cf-footer button{min-width:0}}
`;

if (!customElements.get("ha-calefa-flow-card")) customElements.define("ha-calefa-flow-card", HaCalefaFlowCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "ha-calefa-flow-card")) {
  window.customCards.push({ type: "ha-calefa-flow-card", name: "HA Calefa Flow Card", description: "Responsive animated Calefa II flow card", preview: false, documentationURL: "https://github.com/MRDonnii/ha-smart-home-cards/blob/main/docs/CALEFA_FLOW_CARD.md" });
}
console.info(`%c HA CALEFA FLOW CARD %c v${CALEFA_FLOW_CARD_VERSION} `, "background:#087ea4;color:#fff;font-weight:700;padding:2px 5px", "background:#102631;color:#8fe7ff;padding:2px 5px");
