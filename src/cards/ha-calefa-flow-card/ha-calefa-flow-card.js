const CALEFA_FLOW_CARD_VERSION = "0.5.0";

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

const METRIC_META = {
  fjv_supply: { label: "FJV frem", tone: "orange", icon: "mdi:transmission-tower-import" },
  fjv_return: { label: "FJV retur", tone: "blue", icon: "mdi:transmission-tower-export" },
  heating_supply: { label: "Varme frem", tone: "amber", icon: "mdi:radiator" },
  heating_return: { label: "Varme retur", tone: "sky", icon: "mdi:radiator-disabled" },
};

class HaCalefaFlowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._built = false;
    this._refs = {};
    this._seen = new Map();
    this._displayOpen = false;
    this._displayPage = 0;
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
      flow_threshold: Math.max(0, toNumber(config.flow_threshold) ?? 0.05),
      valve_threshold: Math.max(0, toNumber(config.valve_threshold) ?? 1),
      show_footer: config.show_footer !== false,
      animations: config.animations !== false,
    };
    for (const key of ENTITY_KEYS) this._config[key] = text(config[key]);
    this._entityIds = [...new Set(ENTITY_KEYS.map((key) => this._config[key]).filter(Boolean))];
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
  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }

  disconnectedCallback() {
    window.removeEventListener("keydown", this._onKeydown);
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
      return new Intl.NumberFormat(language, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
    } catch {
      return Number(value).toFixed(decimals);
    }
  }

  _format(key, kind = "number") {
    if (!this._available(key)) return "–";
    const value = this._num(key);
    if (value === null) return String(this._stateObj(key).state);
    const sourceUnit = this._unit(key);
    let decimals = 1;
    let unit = sourceUnit;
    if (kind === "temperature") unit = sourceUnit || "°C";
    if (kind === "percent" || kind === "valve") { decimals = 0; unit = "%"; }
    if (kind === "flow") decimals = Math.abs(value) < 10 ? 1 : 0;
    if (kind === "power") decimals = Math.abs(value) >= 100 ? 0 : 1;
    if (kind === "pressure") decimals = 1;
    return `${this._formatNumber(value, decimals)}${unit ? ` ${unit}` : ""}`;
  }

  _formatTemp(key) {
    if (!this._available(key)) return ["–", ""];
    const value = this._num(key);
    if (value === null) return [String(this._stateObj(key).state), ""];
    return [this._formatNumber(value, 1), "°C"];
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
    else if (dhwValveOpen === true) dhwState = "active";

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
      heatLoop: Boolean(heatingActive || pumpActive === true),
      heatPrimary: Boolean(heatPrimary),
      heatValveOpen,
      heatingValve: heatValve,
      dhwState,
      dhwTap,
      dhwBypass,
      dhwPrimary: Boolean(dhwPrimary),
      dhwValveOpen,
      dhwValve,
      primary: Boolean(heatPrimary || dhwPrimary),
      pumpActive: pumpActive ?? heatingActive,
      pumpText,
      cooling: supply !== null && ret !== null ? supply - ret : null,
      heatingDelta: heatSupply !== null && heatReturn !== null ? heatSupply - heatReturn : null,
    };
  }

  _build() {
    if (!this._config) return;
    this.shadowRoot.innerHTML = `<style>${CALEFA_STYLES}</style>${this._markup()}`;
    this._refs = {};
    this.shadowRoot.querySelectorAll("[data-ref]").forEach((el) => { this._refs[el.dataset.ref] = el; });
    this._built = true;
    this._seen.clear();
  }

  _markup() {
    return `<ha-card>
      <div class="cf-shell ${this._config.animations ? "" : "no-anim"}">
        <aside class="cf-rail cf-rail-left">${this._pair("fjv_supply", "fjv_return", "fjv")}</aside>
        <section class="cf-unit-zone">
          <div class="cf-unit-frame">
            ${this._svg()}
            ${this._miniBadge("dhw_temperature", "Varmt vand", "hot-water", "red")}
            ${this._miniBadge("cold_water_temperature", "Koldt vand", "cold-water", "cyan")}
            ${this._componentBadge("dhw_valve", "BV-ventil", "dhw-valve")}
            ${this._componentBadge("heating_valve", "Varmeventil", "heat-valve")}
            ${this._componentBadge("pump", "Pumpe", "pump")}
            <button class="cf-display-hit" data-action="open-display" type="button" aria-label="Åbn Calefa display"></button>
          </div>
        </section>
        <aside class="cf-rail cf-rail-right">${this._pair("heating_supply", "heating_return", "heat")}</aside>
        <div class="cf-mobile-pairs">
          ${this._pair("fjv_supply", "fjv_return", "fjv", true)}
          ${this._pair("heating_supply", "heating_return", "heat", true)}
        </div>
        ${this._footer()}
      </div>
      ${this._modal()}
    </ha-card>`;
  }

  _metric(key, compact = false) {
    if (!this._config[key]) return `<div class="cf-metric cf-empty"></div>`;
    const meta = METRIC_META[key];
    return `<button type="button" class="cf-metric ${compact ? "compact" : ""}" data-action="more-info" data-key="${key}" data-tone="${meta.tone}">
      <ha-icon icon="${meta.icon}"></ha-icon>
      <span class="cf-metric-text">
        <small>${meta.label}</small>
        <strong><b data-value="${key}">–</b><em data-unit="${key}"></em></strong>
        <i data-sub="${key}"></i>
      </span>
    </button>`;
  }

  _pair(first, second, deltaKey, compact = false) {
    if (!this._config[first] && !this._config[second]) return "";
    return `<div class="cf-pair ${compact ? "compact" : ""}">
      ${this._metric(first, compact)}
      <div class="cf-delta"><span>ΔT</span><strong data-delta="${deltaKey}">–</strong></div>
      ${this._metric(second, compact)}
    </div>`;
  }

  _miniBadge(key, label, cls, tone) {
    if (!this._config[key]) return "";
    return `<button type="button" class="cf-mini ${cls}" data-action="more-info" data-key="${key}" data-tone="${tone}">
      <small>${label}</small>
      <strong><b data-value="${key}">–</b><em data-unit="${key}"></em></strong>
      <i data-sub="${key}"></i>
    </button>`;
  }

  _componentBadge(key, label, cls) {
    if (key === "pump" ? !(this._config.pump || this._config.pump_speed) : !this._config[key]) return "";
    return `<button type="button" class="cf-component ${cls}" data-action="more-info" data-key="${key}">
      <small>${label}</small><strong data-component="${key}">–</strong><i data-component-sub="${key}"></i>
    </button>`;
  }

  _footer() {
    if (!this._config.show_footer) return "";
    const items = [
      ["outdoor_temperature", "Ude", "mdi:thermometer"],
      ["room_temperature", "Bolig", "mdi:home-thermometer-outline"],
      ["power", "Effekt", "mdi:flash-outline"],
      ["pressure", "Tryk", "mdi:gauge"],
    ].filter(([key]) => this._config[key]);
    if (!items.length) return "";
    return `<footer class="cf-footer">${items.map(([key, label, icon]) =>
      `<button type="button" data-action="more-info" data-key="${key}">
        <ha-icon icon="${icon}"></ha-icon><span><small>${label}</small><strong data-footer="${key}">–</strong></span>
      </button>`).join("")}</footer>`;
  }

  _svg() {
    const grooves = Array.from({ length: 14 }, (_, i) =>
      `<path d="M${144 + i * 24} 198 C${154 + i * 24} 226 ${137 + i * 24} 256 ${149 + i * 24} 286"/>`).join("");
    return `<svg class="cf-svg" viewBox="0 0 620 760" role="img" aria-label="Calefa fjernvarmeunit">
      <defs>
        <linearGradient id="cf-hood" x1="0" x2="1"><stop stop-color="#06090b"/><stop offset=".22" stop-color="#24292d"/><stop offset=".53" stop-color="#101416"/><stop offset=".8" stop-color="#2a3034"/><stop offset="1" stop-color="#050709"/></linearGradient>
        <linearGradient id="cf-body" x1="0" x2="1"><stop stop-color="#070a0c"/><stop offset=".48" stop-color="#171b1e"/><stop offset="1" stop-color="#050709"/></linearGradient>
        <linearGradient id="cf-steel" x1="0" x2="1"><stop stop-color="#4a5358"/><stop offset=".2" stop-color="#dce3e6"/><stop offset=".42" stop-color="#7c888d"/><stop offset=".68" stop-color="#f4f8f9"/><stop offset="1" stop-color="#606b70"/></linearGradient>
        <linearGradient id="cf-copper" x1="0" x2="1"><stop stop-color="#582715"/><stop offset=".13" stop-color="#d4773e"/><stop offset=".33" stop-color="#733319"/><stop offset=".58" stop-color="#e08a4d"/><stop offset=".82" stop-color="#7b381e"/><stop offset="1" stop-color="#4d2112"/></linearGradient>
        <linearGradient id="cf-copper-front" x1="0" x2="1"><stop stop-color="#74361f"/><stop offset=".18" stop-color="#ee9252"/><stop offset=".48" stop-color="#8d4528"/><stop offset=".78" stop-color="#f1a064"/><stop offset="1" stop-color="#6a2f1b"/></linearGradient>
        <linearGradient id="cf-brass" x1="0" x2="1"><stop stop-color="#684408"/><stop offset=".24" stop-color="#f6cb58"/><stop offset=".52" stop-color="#a46d14"/><stop offset=".78" stop-color="#efb83c"/><stop offset="1" stop-color="#5b3908"/></linearGradient>
        <linearGradient id="cf-lcd" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d1e3e8"/><stop offset="1" stop-color="#9ab7bf"/></linearGradient>
        <radialGradient id="cf-pump-face"><stop stop-color="#56656c"/><stop offset=".5" stop-color="#263238"/><stop offset="1" stop-color="#0c1215"/></radialGradient>
        <pattern id="cf-epp" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#30363a" opacity=".7"/><circle cx="7" cy="6" r=".65" fill="#020304" opacity=".9"/></pattern>
        <filter id="cf-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="11" stdDeviation="11" flood-opacity=".55"/></filter>
        <filter id="cf-hot" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="cf-blue" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>

      <ellipse cx="310" cy="720" rx="218" ry="19" fill="rgba(0,0,0,.34)"/>

      <g filter="url(#cf-shadow)">
        <rect x="115" y="160" width="390" height="545" rx="27" fill="url(#cf-body)" stroke="#263036" stroke-width="2"/>
        <rect x="115" y="160" width="390" height="545" rx="27" fill="url(#cf-epp)" opacity=".75"/>
        <g class="cf-grooves">${grooves}</g>

        <rect x="91" y="44" width="438" height="174" rx="42" fill="url(#cf-hood)" stroke="#2c3337" stroke-width="2"/>
        <rect x="91" y="44" width="438" height="174" rx="42" fill="url(#cf-epp)" opacity=".62"/>
        <path d="M111 187 Q310 214 509 187" fill="none" stroke="rgba(255,255,255,.045)" stroke-width="3"/>

        <g class="cf-controller">
          <rect x="205" y="79" width="210" height="112" rx="11" fill="#e8ecec" stroke="#aeb6b8" stroke-width="2"/>
          <rect x="248" y="95" width="124" height="54" rx="4" fill="url(#cf-lcd)" stroke="#607e88" stroke-width="2"/>
          <text x="310" y="112" text-anchor="middle" class="cf-lcd-title" data-ref="lcd-title">STANDBY</text>
          <text x="310" y="141" text-anchor="middle" class="cf-lcd-value" data-ref="lcd-value">–</text>
          <circle cx="294" cy="168" r="6" class="cf-led heat" data-ref="heat-led"/>
          <circle cx="326" cy="168" r="6" class="cf-led dhw" data-ref="dhw-led"/>
          <circle cx="265" cy="168" r="3.5" fill="#39d779"/>
          <circle cx="355" cy="168" r="3.5" fill="#39d779"/>
        </g>

        <g class="cf-pipe-base">
          <path d="M150 686 V292 H258"/>
          <path d="M199 686 V345 H289"/>
          <path d="M315 686 V620 H402 V537"/>
          <path d="M365 686 V646 H438 V404"/>
          <path d="M454 686 V629 H477 V471"/>
          <path d="M493 686 V601 H505 V487"/>
          <path d="M258 292 H468 V390"/>
          <path d="M289 345 H432 V427"/>
          <path d="M402 537 V395 H428"/>
          <path d="M438 404 H447"/>
          <path d="M477 471 H491"/>
          <path d="M505 487 H491"/>
        </g>
        <g class="cf-pipe-shine">
          <path d="M150 686 V292 H258"/>
          <path d="M199 686 V345 H289"/>
          <path d="M315 686 V620 H402 V537"/>
          <path d="M365 686 V646 H438 V404"/>
          <path d="M454 686 V629 H477 V471"/>
          <path d="M493 686 V601 H505 V487"/>
          <path d="M258 292 H468 V390"/>
          <path d="M289 345 H432 V427"/>
          <path d="M402 537 V395 H428"/>
          <path d="M438 404 H447"/>
          <path d="M477 471 H491"/>
          <path d="M505 487 H491"/>
        </g>

        <g class="cf-brass">
          <rect x="139" y="389" width="22" height="31" rx="5"/>
          <rect x="188" y="515" width="22" height="27" rx="5"/>
          <rect x="389" y="610" width="26" height="18" rx="5"/>
          <rect x="425" y="390" width="24" height="22" rx="4"/>
          <rect x="465" y="459" width="23" height="22" rx="4"/>
          <rect x="493" y="475" width="23" height="22" rx="4"/>
          <rect x="457" y="279" width="22" height="18" rx="3"/>
          <rect x="280" y="334" width="20" height="18" rx="3"/>
        </g>

        <g class="cf-hx heat" data-ref="hx-heat">
          <rect x="425" y="350" width="66" height="245" rx="11" fill="url(#cf-copper)" stroke="#7f3e23" stroke-width="2"/>
          <path d="M437 368 L479 382 L437 397 L479 412 L437 427 L479 442 L437 457 L479 472 L437 487 L479 502 L437 517 L479 532 L437 547 L479 562 L437 577"/>
          <rect x="431" y="446" width="54" height="52" rx="9" fill="rgba(9,13,15,.74)"/>
          <text x="458" y="476" text-anchor="middle">VARME</text>
        </g>
        <g class="cf-hx dhw" data-ref="hx-dhw">
          <rect x="474" y="382" width="67" height="233" rx="11" fill="url(#cf-copper-front)" stroke="#8e4528" stroke-width="2"/>
          <path d="M486 399 L529 414 L486 429 L529 444 L486 459 L529 474 L486 489 L529 504 L486 519 L529 534 L486 549 L529 564 L486 579 L529 594"/>
          <rect x="480" y="455" width="55" height="74" rx="9" fill="rgba(9,13,15,.74)"/>
          <text x="507" y="486" text-anchor="middle">BRUGS</text>
          <text x="507" y="506" text-anchor="middle">VAND</text>
        </g>

        <g class="cf-valve" data-ref="dhw-valve-unit">
          <rect x="432" y="318" width="45" height="44" rx="8"/>
          <circle cx="454" cy="340" r="8"/>
          <path d="M454 362 V379"/>
          <path d="M443 373 L454 383 L465 373" fill="url(#cf-brass)"/>
        </g>
        <g class="cf-valve" data-ref="heat-valve-unit">
          <rect x="386" y="422" width="46" height="44" rx="8"/>
          <circle cx="409" cy="444" r="8"/>
          <path d="M432 444 H447"/>
          <path d="M441 433 L451 444 L441 455" fill="url(#cf-brass)"/>
        </g>

        <g class="cf-pump-unit" data-ref="pump-unit">
          <rect x="274" y="571" width="84" height="92" rx="22"/>
          <circle cx="316" cy="617" r="36" fill="url(#cf-pump-face)"/>
          <path class="cf-pump-rotor" d="M315 587 C340 593 346 611 334 631 C320 649 291 645 285 623 C281 604 292 591 315 587Z"/>
          <circle cx="316" cy="617" r="6" fill="#0b1215"/>
        </g>

        <g class="cf-meter">
          <circle cx="454" cy="657" r="22" fill="#d9dede" stroke="#858e91" stroke-width="3"/>
          <circle cx="454" cy="657" r="9" fill="#fafcfc" stroke="#778286" stroke-width="2"/>
        </g>

        <g class="cf-connections">
          ${[[150,"FF"],[199,"FR"],[315,"VR"],[365,"VF"],[454,"BV"],[493,"KV"]].map(([x, t]) =>
            `<circle cx="${x}" cy="689" r="12"/><text x="${x}" y="726" text-anchor="middle">${t}</text>`).join("")}
        </g>

        <g class="cf-flow primary" data-ref="flow-primary">
          <path d="M150 685 V292 H468 V390"/>
          <path class="return" d="M432 427 H289 H199 V685"/>
        </g>
        <g class="cf-flow heat-flow" data-ref="flow-heat">
          <path d="M438 404 V646 H365 V685"/>
          <path class="return" d="M315 685 V620 H402 V537"/>
        </g>
        <g class="cf-flow dhw-flow" data-ref="flow-dhw">
          <path d="M493 685 V601 H505 V487"/>
          <path class="hot" d="M477 471 V629 H454 V685"/>
        </g>
      </g>
    </svg>`;
  }

  _modal() {
    return `<div class="cf-modal" data-ref="modal" hidden>
      <button class="cf-backdrop" data-action="close-display" type="button" aria-label="Luk"></button>
      <section class="cf-device" data-ref="device" tabindex="-1">
        <header><div><strong>CALEFA</strong><small>Live display · read-only</small></div><button type="button" data-action="close-display">×</button></header>
        <div class="cf-screen">
          <div class="cf-screen-top"><span data-ref="screen-title">STATUS</span><b data-ref="screen-index">1/4</b></div>
          <div class="cf-screen-body" data-ref="screen-body"></div>
        </div>
        <div class="cf-screen-keys"><button type="button" data-action="display-prev">◀</button><button type="button" data-action="display-next">▶</button></div>
      </section>
    </div>`;
  }

  _update() {
    if (!this._hass || !this._config || !this._built) return;
    const model = this._computeModel();
    this._model = model;
    this._remember(this._hass);

    for (const key of ["fjv_supply", "fjv_return", "heating_supply", "heating_return", "dhw_temperature", "cold_water_temperature"]) {
      const nodes = this.shadowRoot.querySelectorAll(`[data-value="${key}"]`);
      const [value, unit] = this._formatTemp(key);
      nodes.forEach((node) => { if (node.textContent !== value) node.textContent = value; });
      this.shadowRoot.querySelectorAll(`[data-unit="${key}"]`).forEach((node) => { node.textContent = unit ? ` ${unit}` : ""; });
    }

    const flowSubs = {
      fjv_supply: this._config.fjv_flow ? this._format("fjv_flow", "flow") : "",
      heating_supply: this._config.heating_flow ? this._format("heating_flow", "flow") : "",
      dhw_temperature: this._config.water_flow ? this._format("water_flow", "flow") : "",
    };
    for (const [key, value] of Object.entries(flowSubs)) {
      this.shadowRoot.querySelectorAll(`[data-sub="${key}"]`).forEach((node) => { node.textContent = value === "–" ? "" : value; });
    }

    this.shadowRoot.querySelectorAll('[data-delta="fjv"]').forEach((node) => {
      node.textContent = model.cooling === null ? "–" : `${this._formatNumber(model.cooling, 1)}°`;
    });
    this.shadowRoot.querySelectorAll('[data-delta="heat"]').forEach((node) => {
      node.textContent = model.heatingDelta === null ? "–" : `${this._formatNumber(model.heatingDelta, 1)}°`;
    });

    const heatValve = model.heatingValve;
    const dhwValve = model.dhwValve;
    const pumpValue = model.pumpText;
    this.shadowRoot.querySelectorAll('[data-component="heating_valve"]').forEach((n) => n.textContent = heatValve === null ? "–" : `${this._formatNumber(heatValve, 0)}%`);
    this.shadowRoot.querySelectorAll('[data-component="dhw_valve"]').forEach((n) => n.textContent = dhwValve === null ? "–" : `${this._formatNumber(dhwValve, 0)}%`);
    this.shadowRoot.querySelectorAll('[data-component="pump"]').forEach((n) => n.textContent = pumpValue);
    this.shadowRoot.querySelectorAll('[data-component-sub="heating_valve"]').forEach((n) => n.textContent = heatValve !== null && heatValve > this._config.valve_threshold ? "Regulerer" : "Lukket");
    this.shadowRoot.querySelectorAll('[data-component-sub="dhw_valve"]').forEach((n) => n.textContent = dhwValve !== null && dhwValve > this._config.valve_threshold ? "Regulerer" : "Lukket");
    this.shadowRoot.querySelectorAll('[data-component-sub="pump"]').forEach((n) => n.textContent = model.pumpActive ? "Drift" : "Stop");

    this._toggle("flow-primary", model.primary);
    this._toggle("flow-heat", model.heatLoop);
    this._toggle("flow-dhw", model.dhwTap);
    this._toggle("pump-unit", model.pumpActive);
    this._toggle("heat-valve-unit", Boolean(model.heatValveOpen ?? model.heatPrimary));
    this._toggle("dhw-valve-unit", Boolean(model.dhwValveOpen ?? model.dhwPrimary));
    this._toggle("hx-heat", model.heatPrimary || model.heatLoop);
    this._toggle("hx-dhw", model.dhwPrimary || model.dhwTap);
    this._refs["heat-led"]?.classList.toggle("active", model.heatingActive);
    this._refs["dhw-led"]?.classList.toggle("active", model.dhwTap || model.dhwBypass);

    const displayKey = model.dhwTap && this._config.dhw_temperature
      ? "dhw_temperature"
      : this._config.heating_supply ? "heating_supply" : "fjv_supply";
    const title = model.dhwTap ? "BRUGSVAND" : model.heatingActive ? "VARME" : model.dhwBypass ? "BYPASS" : "STANDBY";
    if (this._refs["lcd-title"]) this._refs["lcd-title"].textContent = title;
    if (this._refs["lcd-value"]) this._refs["lcd-value"].textContent = this._config[displayKey] ? this._format(displayKey, "temperature").replace(" °C", "°") : "–";

    for (const key of ["outdoor_temperature", "room_temperature", "power", "pressure"]) {
      const node = this.shadowRoot.querySelector(`[data-footer="${key}"]`);
      if (!node) continue;
      const kind = key === "power" ? "power" : key === "pressure" ? "pressure" : "temperature";
      node.textContent = this._format(key, kind);
    }
    if (this._displayOpen) this._renderDisplay();
  }

  _toggle(ref, on) {
    const node = this._refs[ref];
    if (node) node.classList.toggle("active", Boolean(on));
  }

  _derived(name) {
    const model = this._model || this._computeModel();
    if (name === "mode") return model.dhwTap ? "Brugsvand" : model.heatingActive ? "Varme" : model.dhwBypass ? "Bypass" : "Standby";
    if (name === "heat") return model.heatingActive ? "Aktiv" : "Standby";
    if (name === "dhw") return model.dhwTap ? "Aktiv" : model.dhwBypass ? "Bypass" : "Standby";
    if (name === "pump") return model.pumpText;
    if (name === "fjvDelta") return model.cooling === null ? "–" : `${this._formatNumber(model.cooling, 1)} °C`;
    if (name === "heatDelta") return model.heatingDelta === null ? "–" : `${this._formatNumber(model.heatingDelta, 1)} °C`;
    return "–";
  }

  _displayPages() {
    return [
      ["STATUS", [["Drift", "derived:mode"], ["Varme", "derived:heat"], ["Brugsvand", "derived:dhw"], ["FJV ΔT", "derived:fjvDelta"]]],
      ["VARME", [["Frem", "heating_supply", "temperature"], ["Retur", "heating_return", "temperature"], ["ΔT", "derived:heatDelta"], ["Pumpe", "derived:pump"]]],
      ["BRUGSVAND", [["Varmt vand", "dhw_temperature", "temperature"], ["Koldt vand", "cold_water_temperature", "temperature"], ["Flow", "water_flow", "flow"], ["Ventil", "dhw_valve", "valve"]]],
      ["ANLÆG", [["Ude", "outdoor_temperature", "temperature"], ["Bolig", "room_temperature", "temperature"], ["Effekt", "power", "power"], ["Tryk", "pressure", "pressure"]]],
    ];
  }

  _renderDisplay() {
    const pages = this._displayPages();
    const [title, rows] = pages[this._displayPage] || pages[0];
    if (this._refs["screen-title"]) this._refs["screen-title"].textContent = title;
    if (this._refs["screen-index"]) this._refs["screen-index"].textContent = `${this._displayPage + 1}/${pages.length}`;
    const html = rows.map(([label, key, kind]) => {
      const value = key.startsWith("derived:") ? this._derived(key.slice(8)) : this._format(key, kind || "number");
      return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    }).join("");
    if (this._refs["screen-body"]) this._refs["screen-body"].innerHTML = html;
  }

  _openDisplay() {
    if (!this._refs.modal) return;
    this._displayOpen = true;
    this._refs.modal.hidden = false;
    this._renderDisplay();
    window.addEventListener("keydown", this._onKeydown);
    this._refs.device?.focus?.({ preventScroll: true });
  }

  _closeDisplay() {
    this._displayOpen = false;
    if (this._refs.modal) this._refs.modal.hidden = true;
    window.removeEventListener("keydown", this._onKeydown);
  }

  _handleClick(event) {
    const target = event.composedPath().find((node) => node?.dataset?.action);
    if (!target) return;
    const action = target.dataset.action;
    if (action === "more-info") {
      const key = target.dataset.key;
      const id = key === "pump" ? (this._config.pump || this._config.pump_speed) : this._config[key];
      if (id && this._hass?.states?.[id]) {
        this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } }));
      }
    } else if (action === "open-display") this._openDisplay();
    else if (action === "close-display") this._closeDisplay();
    else if (action === "display-next") {
      this._displayPage = (this._displayPage + 1) % 4;
      this._renderDisplay();
    } else if (action === "display-prev") {
      this._displayPage = (this._displayPage + 3) % 4;
      this._renderDisplay();
    }
  }

  _handleKeydown(event) {
    if (!this._displayOpen) return;
    if (event.key === "Escape") this._closeDisplay();
    if (event.key === "ArrowRight") { this._displayPage = (this._displayPage + 1) % 4; this._renderDisplay(); }
    if (event.key === "ArrowLeft") { this._displayPage = (this._displayPage + 3) % 4; this._renderDisplay(); }
  }
}

const CALEFA_STYLES = `
:host{
  display:block;
  container:calefa-card / inline-size;
  --orange:#ff7a2f; --blue:#3f9aff; --amber:#ff9d3e; --sky:#55bfff;
  --red:#ff4f5a; --cyan:#37cce5; --green:#39d99d; --text:#eef6fb; --muted:#8fa6b6;
}
*{box-sizing:border-box}
button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}
[hidden]{display:none!important}
ha-card{
  position:relative; overflow:hidden; color:var(--text);
  border:1px solid rgba(134,168,190,.16); border-radius:var(--ha-card-border-radius,24px);
  background:
    radial-gradient(70% 58% at 50% 34%,rgba(53,112,145,.24),transparent 72%),
    linear-gradient(155deg,#0a1721,#102635 58%,#07131c);
  box-shadow:0 20px 56px rgba(0,0,0,.28);
}
.cf-shell{
  display:grid; grid-template-columns:minmax(150px,220px) minmax(330px,520px) minmax(150px,220px);
  grid-template-areas:"left unit right" "footer footer footer";
  gap:18px 24px; align-items:center; justify-content:center; min-width:0;
  max-width:1120px; margin:0 auto; padding:14px 18px 12px;
}
.cf-rail-left{grid-area:left}.cf-unit-zone{grid-area:unit}.cf-rail-right{grid-area:right}
.cf-unit-zone{min-width:0}
.cf-unit-frame{position:relative;width:100%;aspect-ratio:620/760;margin:auto;isolation:isolate}
.cf-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cf-grooves path{fill:none;stroke:#050607;stroke-width:3;opacity:.48}
.cf-lcd-title{fill:#263c46;font:800 11px system-ui,sans-serif;letter-spacing:.055em}
.cf-lcd-value{fill:#173643;font:850 27px system-ui,sans-serif}
.cf-led{fill:#97a3a8;stroke:#6e7b81;stroke-width:1.2}
.cf-led.heat.active{fill:#ff3f4d;stroke:#ff8f97;filter:drop-shadow(0 0 7px #ff3f4d)}
.cf-led.dhw.active{fill:#2f9fff;stroke:#96ceff;filter:drop-shadow(0 0 7px #2f9fff)}
.cf-pipe-base path{fill:none;stroke:url(#cf-steel);stroke-width:14;stroke-linecap:round;stroke-linejoin:round}
.cf-pipe-shine path{fill:none;stroke:rgba(255,255,255,.52);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.cf-brass rect{fill:url(#cf-brass);stroke:#785213;stroke-width:1}
.cf-hx path{fill:none;stroke:#552715;stroke-width:2.3;opacity:.72}
.cf-hx text{fill:#fff;font:800 12px system-ui,sans-serif;letter-spacing:.07em}
.cf-hx.active{filter:drop-shadow(0 0 12px rgba(255,132,67,.3))}
.cf-valve rect{fill:#10181d;stroke:#596970;stroke-width:2}
.cf-valve circle{fill:#0a1114;stroke:#75848b;stroke-width:2}
.cf-valve.active rect{stroke:var(--green);filter:drop-shadow(0 0 6px rgba(57,217,157,.5))}
.cf-pump-unit>rect{fill:#202b31;stroke:#4c5c64;stroke-width:2}
.cf-pump-rotor{fill:#62737b;transform-origin:316px 617px}
.cf-pump-unit.active .cf-pump-rotor{fill:#7ba6b9;animation:cf-spin 1.3s linear infinite}
.cf-connections circle{fill:#182228;stroke:#94a0a5;stroke-width:4}
.cf-connections text{fill:#8599a5;font:800 16px system-ui,sans-serif}
.cf-flow path{fill:none;stroke-width:5.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:2 17;opacity:0}
.cf-flow.active path{opacity:1;animation:cf-flow 1.1s linear infinite}
.cf-flow.primary path{stroke:var(--orange);filter:url(#cf-hot)}
.cf-flow.primary .return{stroke:var(--blue);filter:url(#cf-blue)}
.cf-flow.heat-flow path{stroke:var(--amber);filter:url(#cf-hot)}
.cf-flow.heat-flow .return{stroke:var(--sky);filter:url(#cf-blue)}
.cf-flow.dhw-flow path{stroke:var(--cyan);filter:url(#cf-blue)}
.cf-flow.dhw-flow .hot{stroke:var(--red);filter:url(#cf-hot)}
.cf-display-hit{position:absolute;z-index:10;left:33%;top:10%;width:34%;height:14%;border:0;background:transparent;cursor:pointer}

.cf-pair{display:grid;grid-template-columns:1fr;gap:4px;min-width:0}
.cf-metric{
  --tone:#718897;display:flex;align-items:center;gap:8px;min-width:0;min-height:62px;padding:8px 10px;
  border:1px solid color-mix(in srgb,var(--tone) 48%,transparent);border-radius:14px;
  background:linear-gradient(135deg,color-mix(in srgb,var(--tone) 8%,transparent),rgba(4,12,18,.88) 70%);
  box-shadow:0 8px 22px rgba(0,0,0,.16);text-align:left;cursor:pointer;
}
.cf-metric[data-tone="orange"]{--tone:var(--orange)}.cf-metric[data-tone="blue"]{--tone:var(--blue)}
.cf-metric[data-tone="amber"]{--tone:var(--amber)}.cf-metric[data-tone="sky"]{--tone:var(--sky)}
.cf-metric>ha-icon{--mdc-icon-size:22px;flex:0 0 24px;color:var(--tone)}
.cf-metric-text{display:flex;flex-direction:column;min-width:0}
.cf-metric small{color:#c8d5dd;font-size:10px}
.cf-metric strong{display:flex;align-items:baseline;line-height:1.05;color:var(--tone);white-space:nowrap}
.cf-metric strong b{font-size:20px;font-weight:850}.cf-metric strong em{margin-left:2px;color:#9cafbb;font-size:10px;font-style:normal}
.cf-metric i{height:10px;margin-top:2px;color:#8095a2;font-size:8px;font-style:normal}
.cf-delta{
  justify-self:center;display:flex;align-items:center;gap:5px;min-height:25px;padding:3px 10px;margin:-1px 0;
  border:1px solid rgba(138,194,223,.22);border-radius:999px;background:rgba(10,27,38,.94);
  box-shadow:0 4px 12px rgba(0,0,0,.22);z-index:2;
}
.cf-delta span{font-size:7px;font-weight:850;letter-spacing:.07em;color:#b9d3df}.cf-delta strong{font-size:11px}
.cf-empty{visibility:hidden}

.cf-mini{
  --tone:#fff;position:absolute;z-index:8;display:flex;flex-direction:column;min-width:92px;padding:6px 8px;
  border:1px solid color-mix(in srgb,var(--tone) 55%,transparent);border-radius:10px;
  background:rgba(5,13,19,.88);box-shadow:0 7px 17px rgba(0,0,0,.28);backdrop-filter:blur(5px);
  text-align:left;cursor:pointer;
}
.cf-mini[data-tone="red"]{--tone:var(--red)}.cf-mini[data-tone="cyan"]{--tone:var(--cyan)}
.cf-mini small{font-size:8px;color:#c9d4da}.cf-mini strong{display:flex;align-items:baseline;color:var(--tone)}
.cf-mini strong b{font-size:15px}.cf-mini strong em{margin-left:2px;color:#9cafb9;font-size:8px;font-style:normal}.cf-mini i{font-size:7px;color:#8295a0;font-style:normal}
.hot-water{right:0;top:53%}.cold-water{right:0;top:75%}

.cf-component{
  position:absolute;z-index:9;display:flex;flex-direction:column;min-width:64px;padding:4px 6px;
  border:1px solid rgba(57,217,157,.34);border-radius:8px;background:rgba(4,13,18,.86);
  box-shadow:0 5px 14px rgba(0,0,0,.26);text-align:left;cursor:pointer;
}
.cf-component small{font-size:6px;color:#8fa5b1}.cf-component strong{font-size:10px;color:#eef7f7}.cf-component i{font-size:6px;color:#729088;font-style:normal}
.dhw-valve{right:13%;top:42%}.heat-valve{right:23%;top:57%}.pump{left:34%;top:80%}

.cf-mobile-pairs{display:none}
.cf-footer{grid-area:footer;display:flex;justify-content:center;gap:0;border-top:1px solid rgba(255,255,255,.08);padding-top:8px}
.cf-footer button{display:flex;align-items:center;gap:6px;min-width:0;padding:4px 14px;border:0;border-left:1px solid rgba(255,255,255,.07);background:none;text-align:left;cursor:pointer}
.cf-footer button:first-child{border-left:0}.cf-footer ha-icon{--mdc-icon-size:16px;color:#a9bdc8}
.cf-footer small,.cf-footer strong{display:block;white-space:nowrap}.cf-footer small{font-size:7px;color:#7f96a5}.cf-footer strong{font-size:10px}

.cf-modal{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:14px}
.cf-backdrop{position:absolute;inset:0;border:0;background:rgba(1,6,10,.78);backdrop-filter:blur(8px)}
.cf-device{position:relative;width:min(94%,430px);padding:12px;border-radius:22px;background:linear-gradient(155deg,#f3f5f4,#d1d7d8);color:#19303a;box-shadow:0 28px 80px rgba(0,0,0,.55)}
.cf-device header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.cf-device header strong,.cf-device header small{display:block}.cf-device header small{font-size:9px;color:#65767d}
.cf-device header button{width:44px;height:44px;border:0;border-radius:50%;background:rgba(20,34,42,.08);font-size:24px}
.cf-screen{padding:10px;border:2px solid #667b83;border-radius:8px;background:linear-gradient(#c5dad5,#a9c1ba);color:#132b25}
.cf-screen-top{display:flex;justify-content:space-between;padding-bottom:6px;border-bottom:2px solid rgba(18,42,34,.4);font-size:12px;font-weight:850;letter-spacing:.05em}
.cf-screen-body>div{display:flex;justify-content:space-between;gap:10px;min-height:30px;padding:6px 4px;border-bottom:1px solid rgba(18,42,34,.13);font-size:12px}
.cf-screen-body strong{white-space:nowrap}.cf-screen-keys{display:flex;justify-content:center;gap:14px;margin-top:9px}.cf-screen-keys button{width:48px;height:44px;border:1px solid rgba(0,0,0,.12);border-radius:12px;background:#edf1f0}

@keyframes cf-flow{to{stroke-dashoffset:-38}}@keyframes cf-spin{to{transform:rotate(360deg)}}
.no-anim .cf-flow.active path,.no-anim .cf-pump-unit.active .cf-pump-rotor{animation:none}
@media(prefers-reduced-motion:reduce){.cf-svg *{animation:none!important}}

@container calefa-card (max-width:720px){
  .cf-shell{display:block;padding:8px 8px calc(14px + env(safe-area-inset-bottom,0px))}
  .cf-rail{display:none}.cf-unit-zone{width:100%;max-width:390px;margin:0 auto}
  .cf-unit-frame{aspect-ratio:620/760}
  .cf-mobile-pairs{display:grid;gap:7px;max-width:520px;margin:4px auto 0}
  .cf-mobile-pairs .cf-pair{grid-template-columns:minmax(0,1fr) 42px minmax(0,1fr);align-items:center;gap:4px}
  .cf-mobile-pairs .cf-metric{min-height:50px;padding:6px 7px;border-radius:11px}
  .cf-mobile-pairs .cf-metric>ha-icon{--mdc-icon-size:18px;flex-basis:19px}
  .cf-mobile-pairs .cf-metric small{font-size:8px}.cf-mobile-pairs .cf-metric strong b{font-size:16px}.cf-mobile-pairs .cf-metric strong em{font-size:8px}.cf-mobile-pairs .cf-metric i{display:none}
  .cf-mobile-pairs .cf-delta{align-self:stretch;display:flex;flex-direction:column;justify-content:center;gap:0;padding:2px 3px}
  .cf-footer{display:none}
  .cf-mini{min-width:78px;padding:4px 5px}.cf-mini small{font-size:7px}.cf-mini strong b{font-size:13px}.cf-mini i{display:none}
  .cf-component{min-width:57px;padding:3px 4px}.cf-component small{font-size:5.5px}.cf-component strong{font-size:9px}.cf-component i{font-size:5.5px}
  .hot-water{right:-1%;top:53%}.cold-water{right:-1%;top:75%}
  .dhw-valve{right:12%;top:42%}.heat-valve{right:22%;top:57%}.pump{left:33%;top:80%}
}
@container calefa-card (max-width:390px){
  .cf-shell{padding-left:5px;padding-right:5px}.cf-unit-zone{max-width:350px}
  .cf-mobile-pairs .cf-pair{grid-template-columns:minmax(0,1fr) 38px minmax(0,1fr)}
  .cf-mobile-pairs .cf-metric>ha-icon{display:none}.cf-mobile-pairs .cf-metric{min-height:46px}
  .cf-mini{min-width:72px}.cf-component{min-width:52px}
}
@container calefa-card (min-width:721px) and (max-width:960px){
  .cf-shell{grid-template-columns:minmax(135px,180px) minmax(330px,440px) minmax(135px,180px);gap:14px}
  .cf-metric{min-height:56px;padding:7px 8px}.cf-metric strong b{font-size:17px}.cf-metric>ha-icon{--mdc-icon-size:19px}
}
@container calefa-card (min-width:1100px){
  .cf-shell{grid-template-columns:minmax(170px,230px) minmax(390px,520px) minmax(170px,230px);gap:26px}
}
`;

if (!customElements.get("ha-calefa-flow-card")) customElements.define("ha-calefa-flow-card", HaCalefaFlowCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "ha-calefa-flow-card")) {
  window.customCards.push({
    type: "ha-calefa-flow-card",
    name: "HA Calefa Flow Card",
    description: "Responsive animated Calefa II flow card",
    preview: false,
    documentationURL: "https://github.com/MRDonnii/ha-smart-home-cards/blob/main/docs/CALEFA_FLOW_CARD.md",
  });
}
console.info(`%c HA CALEFA FLOW CARD %c v${CALEFA_FLOW_CARD_VERSION} `, "background:#087ea4;color:#fff;font-weight:700;padding:2px 5px", "background:#102631;color:#8fe7ff;padding:2px 5px");
