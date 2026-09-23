const CALEFA_FLOW_CARD_VERSION = "0.1.0";

class HaCalefaFlowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._lastSignature = "";
    this._displayOpen = false;
    this._displayPage = "home";
    this._boundClick = (event) => this._handleClick(event);
    this._boundKeydown = (event) => this._handleKeydown(event);
    this.shadowRoot.addEventListener("click", this._boundClick);
    this.shadowRoot.addEventListener("keydown", this._boundKeydown);
  }

  static getStubConfig() {
    return {
      title: "Calefa II 40/40",
      subtitle: "Fjernvarmeunit",
      fjv_supply: "sensor.calefa_fjv_frem",
      fjv_return: "sensor.calefa_fjv_retur",
      heating_supply: "sensor.calefa_varme_frem",
      heating_return: "sensor.calefa_varme_retur",
      dhw_temperature: "sensor.calefa_varmt_vand",
      pump_speed: "sensor.calefa_pumpe",
      heating_valve: "sensor.calefa_varmeventil",
    };
  }

  setConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("ha-calefa-flow-card requires a configuration object");
    }

    this._config = {
      title: config.title || "Calefa II 40/40",
      subtitle: config.subtitle || "Fjernvarmeunit",
      background_image: config.background_image || "",
      fjv_supply: config.fjv_supply || "",
      fjv_return: config.fjv_return || "",
      heating_supply: config.heating_supply || "",
      heating_return: config.heating_return || "",
      dhw_temperature: config.dhw_temperature || "",
      cold_water_temperature: config.cold_water_temperature || "",
      pump: config.pump || "",
      pump_speed: config.pump_speed || "",
      heating_valve: config.heating_valve || "",
      dhw_valve: config.dhw_valve || "",
      heating_flow: config.heating_flow || "",
      water_flow: config.water_flow || "",
      heating_active: config.heating_active || "",
      dhw_active: config.dhw_active || "",
      power: config.power || "",
      room_temperature: config.room_temperature || "",
      outdoor_temperature: config.outdoor_temperature || "",
      flow_threshold: Number.isFinite(Number(config.flow_threshold)) ? Number(config.flow_threshold) : 0.05,
      valve_threshold: Number.isFinite(Number(config.valve_threshold)) ? Number(config.valve_threshold) : 1,
      show_footer: config.show_footer !== false,
      show_labels: config.show_labels !== false,
    };
    this._lastSignature = "";
    this._render(true);
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 8;
  }

  _entityKeys() {
    return [
      "fjv_supply",
      "fjv_return",
      "heating_supply",
      "heating_return",
      "dhw_temperature",
      "cold_water_temperature",
      "pump",
      "pump_speed",
      "heating_valve",
      "dhw_valve",
      "heating_flow",
      "water_flow",
      "heating_active",
      "dhw_active",
      "power",
      "room_temperature",
      "outdoor_temperature",
    ];
  }

  _state(key) {
    const entityId = this._config?.[key];
    if (!entityId || !this._hass) return null;
    return this._hass.states?.[entityId] || null;
  }

  _num(key) {
    const state = this._state(key);
    if (!state || ["unknown", "unavailable", "none", "null", ""].includes(String(state.state).toLowerCase())) return null;
    const value = Number(state.state);
    return Number.isFinite(value) ? value : null;
  }

  _isOn(key) {
    const state = this._state(key);
    if (!state) return null;
    const normalized = String(state.state).toLowerCase();
    if (["on", "true", "open", "opening", "heat", "heating", "active", "running", "home"].includes(normalized)) return true;
    if (["off", "false", "closed", "closing", "idle", "standby", "inactive", "not_home"].includes(normalized)) return false;
    const numeric = Number(state.state);
    return Number.isFinite(numeric) ? numeric > 0 : null;
  }

  _available(key) {
    const state = this._state(key);
    if (!state) return false;
    return !["unknown", "unavailable", "none", "null", ""].includes(String(state.state).toLowerCase());
  }

  _unit(key, fallback = "") {
    return this._state(key)?.attributes?.unit_of_measurement || fallback;
  }

  _format(key, fallback = "–", decimals = 0, fallbackUnit = "") {
    const value = this._num(key);
    if (value === null) return fallback;
    const language = this._hass?.locale?.language || navigator.language || "da-DK";
    const text = new Intl.NumberFormat(language, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
    const unit = this._unit(key, fallbackUnit);
    return unit ? `${text} ${unit}` : text;
  }

  _temperature(key) {
    return this._format(key, "–", 1, "°C");
  }

  _percent(key) {
    return this._format(key, "–", 0, "%");
  }

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _flowState() {
    const flowThreshold = this._config.flow_threshold;
    const valveThreshold = this._config.valve_threshold;
    const heatingFlow = this._num("heating_flow");
    const waterFlow = this._num("water_flow");
    const heatingValve = this._num("heating_valve");
    const dhwValve = this._num("dhw_valve");
    const configuredHeat = this._isOn("heating_active");
    const configuredDhw = this._isOn("dhw_active");
    const pump = this._isOn("pump");
    const pumpSpeed = this._num("pump_speed");

    const heating = configuredHeat ?? (
      (heatingFlow !== null && heatingFlow > flowThreshold) ||
      (heatingValve !== null && heatingValve > valveThreshold) ||
      pump === true ||
      (pumpSpeed !== null && pumpSpeed > 0)
    );

    const dhw = configuredDhw ?? (
      (waterFlow !== null && waterFlow > flowThreshold) ||
      (dhwValve !== null && dhwValve > valveThreshold)
    );

    const pumpActive = pump ?? (pumpSpeed !== null ? pumpSpeed > 0 : heating);
    const primary = heating || dhw;

    const heatIntensity = Math.max(
      0.18,
      Math.min(1, heatingFlow !== null ? heatingFlow / 10 : heatingValve !== null ? heatingValve / 100 : 0.55),
    );
    const dhwIntensity = Math.max(
      0.18,
      Math.min(1, waterFlow !== null ? waterFlow / 16 : dhwValve !== null ? dhwValve / 100 : 0.6),
    );

    return { heating, dhw, pumpActive, primary, heatIntensity, dhwIntensity };
  }

  _signature() {
    if (!this._config || !this._hass) return "";
    const states = this._entityKeys().map((key) => {
      const state = this._state(key);
      return [key, state?.state || "", state?.last_changed || ""];
    });
    return JSON.stringify([
      this._config.title,
      this._config.subtitle,
      this._config.background_image,
      this._config.show_footer,
      this._config.show_labels,
      this._displayOpen,
      this._displayPage,
      states,
    ]);
  }

  _handleKeydown(event) {
    if (!["Enter", " ", "Escape"].includes(event.key)) return;
    if (event.key === "Escape" && this._displayOpen) {
      event.preventDefault();
      this._displayOpen = false;
      this._displayPage = "home";
      this._lastSignature = "";
      this._render(true);
      return;
    }
    const action = event.composedPath().find((node) => node?.dataset?.action);
    if (!action || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    action.click();
  }

  _handleClick(event) {
    const action = event.composedPath().find((node) => node?.dataset?.action);
    if (!action) return;
    const type = action.dataset.action;

    if (type === "open-display") {
      this._displayOpen = true;
      this._displayPage = "home";
      this._lastSignature = "";
      this._render(true);
      return;
    }
    if (type === "close-display") {
      this._displayOpen = false;
      this._displayPage = "home";
      this._lastSignature = "";
      this._render(true);
      return;
    }
    if (type === "display-page") {
      this._displayPage = action.dataset.page || "home";
      this._lastSignature = "";
      this._render(true);
      return;
    }
    if (type === "more-info") {
      const key = action.dataset.entityKey;
      const entityId = this._config?.[key];
      if (!entityId) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId },
      }));
    }
  }

  _metric({ key, label, icon, tone = "neutral", value = null }) {
    const entityId = this._config[key];
    const shownValue = value ?? (key.includes("temperature") || ["fjv_supply", "fjv_return", "heating_supply", "heating_return"].includes(key)
      ? this._temperature(key)
      : key.includes("valve") || key.includes("speed") ? this._percent(key) : this._format(key));
    const clickable = Boolean(entityId);
    return `
      <button class="metric ${tone}" ${clickable ? `data-action="more-info" data-entity-key="${this._escape(key)}"` : "disabled"} aria-label="${this._escape(label)}: ${this._escape(shownValue)}">
        <span class="metric-icon"><ha-icon icon="${this._escape(icon)}"></ha-icon></span>
        <span class="metric-copy"><span class="metric-label">${this._escape(label)}</span><strong>${this._escape(shownValue)}</strong></span>
      </button>`;
  }

  _displayContent(flow) {
    const page = this._displayPage;
    const back = page === "home" ? "" : `<button class="display-back" data-action="display-page" data-page="home" aria-label="Tilbage"><ha-icon icon="mdi:chevron-left"></ha-icon></button>`;

    if (page === "heating") {
      return `
        <div class="display-screen-title">${back}<span>Varme</span></div>
        <div class="display-list">
          <div><span>Fremløb</span><strong>${this._escape(this._temperature("heating_supply"))}</strong></div>
          <div><span>Retur</span><strong>${this._escape(this._temperature("heating_return"))}</strong></div>
          <div><span>Pumpe</span><strong>${this._escape(this._available("pump_speed") ? this._percent("pump_speed") : flow.pumpActive ? "Kører" : "Stop")}</strong></div>
          <div><span>Varmeventil</span><strong>${this._escape(this._percent("heating_valve"))}</strong></div>
        </div>`;
    }
    if (page === "dhw") {
      return `
        <div class="display-screen-title">${back}<span>Brugsvand</span></div>
        <div class="display-list">
          <div><span>Varmt vand</span><strong>${this._escape(this._temperature("dhw_temperature"))}</strong></div>
          <div><span>Koldt vand</span><strong>${this._escape(this._temperature("cold_water_temperature"))}</strong></div>
          <div><span>Flow</span><strong>${this._escape(this._format("water_flow"))}</strong></div>
          <div><span>Ventil</span><strong>${this._escape(this._percent("dhw_valve"))}</strong></div>
        </div>`;
    }
    if (page === "status") {
      return `
        <div class="display-screen-title">${back}<span>Driftsstatus</span></div>
        <div class="display-list">
          <div><span>FJV frem</span><strong>${this._escape(this._temperature("fjv_supply"))}</strong></div>
          <div><span>FJV retur</span><strong>${this._escape(this._temperature("fjv_return"))}</strong></div>
          <div><span>Varme</span><strong>${flow.heating ? "Aktiv" : "Standby"}</strong></div>
          <div><span>Brugsvand</span><strong>${flow.dhw ? "Aktiv" : "Standby"}</strong></div>
          <div><span>Effekt</span><strong>${this._escape(this._format("power"))}</strong></div>
        </div>`;
    }

    return `
      <div class="display-home-top">
        <div class="display-home-temp"><span>Varme frem</span><strong>${this._escape(this._temperature("heating_supply"))}</strong></div>
        <div class="display-home-state"><span class="dot ${flow.primary ? "active" : ""}"></span>${flow.primary ? "Drift" : "Standby"}</div>
      </div>
      <div class="display-menu-grid">
        <button data-action="display-page" data-page="heating"><ha-icon icon="mdi:radiator"></ha-icon><span>Varme</span></button>
        <button data-action="display-page" data-page="dhw"><ha-icon icon="mdi:water-thermometer"></ha-icon><span>Brugsvand</span></button>
        <button data-action="display-page" data-page="status"><ha-icon icon="mdi:gauge"></ha-icon><span>Status</span></button>
        <button class="disabled-menu" disabled><ha-icon icon="mdi:cog-outline"></ha-icon><span>Indstillinger</span></button>
      </div>`;
  }

  _render(force = false) {
    if (!this._config || !this._hass) return;
    const signature = this._signature();
    if (!force && signature === this._lastSignature) return;
    this._lastSignature = signature;

    const flow = this._flowState();
    const heatSpeed = `${Math.max(0.75, 2.5 - flow.heatIntensity * 1.5).toFixed(2)}s`;
    const dhwSpeed = `${Math.max(0.65, 2.3 - flow.dhwIntensity * 1.45).toFixed(2)}s`;
    const photo = this._config.background_image
      ? `<img class="unit-photo" src="${this._escape(this._config.background_image)}" alt="${this._escape(this._config.title)}">`
      : "";
    const photoClass = photo ? "photo-mode" : "schematic-mode";
    const heatingStatus = flow.heating ? "aktiv" : "standby";
    const dhwStatus = flow.dhw ? "aktiv" : "standby";
    const pumpValue = this._available("pump_speed") ? this._percent("pump_speed") : flow.pumpActive ? "Kører" : "Stop";
    const heatValveValue = this._available("heating_valve") ? this._percent("heating_valve") : flow.heating ? "Åben" : "Lukket";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; min-width:0; --hot:#ff7138; --hot2:#ffad46; --cold:#38a8ff; --cold2:#64d5ff; --ok:#45e3ad; --muted:rgba(188,210,228,.62); }
        * { box-sizing:border-box; }
        button { font:inherit; }
        ha-card {
          overflow:hidden;
          border:1px solid color-mix(in srgb, var(--divider-color, #506070) 38%, transparent);
          border-radius:24px;
          background:
            radial-gradient(circle at 50% 28%, rgba(38,87,119,.24), transparent 36%),
            linear-gradient(145deg, #08141f 0%, #0c1c2a 50%, #07131d 100%);
          color:#f4f8fb;
          box-shadow:0 20px 55px rgba(0,0,0,.28);
          position:relative;
        }
        .head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:22px 22px 12px; }
        .brand h2 { margin:0; font-size:clamp(24px, 4vw, 38px); line-height:1; letter-spacing:-.035em; font-weight:800; }
        .brand p { margin:7px 0 0; color:var(--muted); font-size:14px; }
        .statuses { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        .status-pill { display:flex; align-items:center; gap:8px; min-height:48px; padding:9px 12px; border:1px solid rgba(255,255,255,.09); border-radius:14px; background:rgba(255,255,255,.035); color:var(--muted); }
        .status-pill ha-icon { --mdc-icon-size:21px; }
        .status-pill strong { display:block; color:#fff; font-size:13px; }
        .status-pill span { display:block; font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
        .status-pill.hot.active { border-color:color-mix(in srgb, var(--hot) 65%, transparent); box-shadow:0 0 28px rgba(255,113,56,.12); }
        .status-pill.hot.active ha-icon { color:var(--hot); }
        .status-pill.water.active { border-color:color-mix(in srgb, var(--cold2) 65%, transparent); box-shadow:0 0 28px rgba(70,185,255,.12); }
        .status-pill.water.active ha-icon { color:var(--cold2); }

        .main { display:grid; grid-template-columns:minmax(145px, .72fr) minmax(320px, 1.65fr) minmax(145px, .72fr); gap:12px; align-items:center; padding:4px 18px 18px; }
        .rail { display:flex; flex-direction:column; gap:12px; min-width:0; }
        .metric { width:100%; min-height:82px; display:flex; align-items:center; gap:11px; padding:12px; text-align:left; border:1px solid rgba(255,255,255,.1); border-radius:17px; background:rgba(4,14,23,.58); color:#fff; cursor:pointer; transition:transform .15s ease, border-color .2s ease, background .2s ease; }
        .metric:disabled { cursor:default; opacity:.82; }
        .metric:not(:disabled):active { transform:scale(.98); }
        .metric.hot { border-color:rgba(255,113,56,.38); }
        .metric.cold { border-color:rgba(56,168,255,.38); }
        .metric.ok { border-color:rgba(69,227,173,.38); }
        .metric-icon { width:38px; height:38px; flex:0 0 38px; display:grid; place-items:center; border-radius:12px; background:rgba(255,255,255,.06); }
        .metric.hot .metric-icon { color:var(--hot); background:rgba(255,113,56,.1); }
        .metric.cold .metric-icon { color:var(--cold2); background:rgba(56,168,255,.1); }
        .metric.ok .metric-icon { color:var(--ok); background:rgba(69,227,173,.1); }
        .metric-copy { min-width:0; display:flex; flex-direction:column; gap:4px; }
        .metric-label { font-size:11px; color:var(--muted); line-height:1.1; }
        .metric strong { font-size:clamp(15px, 2vw, 22px); line-height:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        .unit-stage { position:relative; width:100%; max-width:620px; margin:0 auto; aspect-ratio:0.82; border-radius:28px; overflow:hidden; background:radial-gradient(circle at 50% 45%, rgba(28,50,66,.72), rgba(5,12,18,.15) 65%, transparent 72%); }
        .unit-photo { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; filter:saturate(.9) contrast(1.04) brightness(.78); z-index:0; }
        .diagram { position:absolute; inset:0; width:100%; height:100%; z-index:1; }
        .photo-mode .hardware { opacity:.12; }
        .photo-mode .hardware-label { opacity:0; }
        .schematic-mode .hardware { opacity:1; }
        .housing { fill:#101a22; stroke:#233747; stroke-width:4; }
        .housing-top { fill:url(#caseGrad); stroke:#263c4d; stroke-width:4; }
        .insulation { fill:#17242e; stroke:#263b49; stroke-width:2; }
        .pipe-base { fill:none; stroke:#a78358; stroke-width:18; stroke-linecap:round; stroke-linejoin:round; filter:url(#pipeShadow); }
        .pipe-metal { fill:none; stroke:#8ca2af; stroke-width:14; stroke-linecap:round; stroke-linejoin:round; opacity:.9; }
        .flow { fill:none; stroke-width:8; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:2 19; opacity:.12; }
        .flow.active { opacity:1; filter:url(#hotGlow); animation:flowMove var(--flow-speed, 1.25s) linear infinite; }
        .flow.hot { stroke:var(--hot); }
        .flow.cold { stroke:var(--cold); filter:url(#coldGlow); }
        .flow.cold.active { filter:url(#coldGlow); }
        .flow.dhw { stroke:#ff524f; }
        .hx { fill:#8d5c42; stroke:#c88c68; stroke-width:3; }
        .hx-lines { stroke:#e2a078; stroke-width:3; opacity:.8; }
        .pump-body { fill:#111b24; stroke:#607d8e; stroke-width:4; }
        .pump-ring { fill:none; stroke:#1d3341; stroke-width:7; }
        .pump-ring.active { stroke:var(--cold2); stroke-dasharray:22 8; animation:pumpSpin 1.15s linear infinite; filter:url(#coldGlow); transform-origin:500px 770px; }
        .valve { fill:#171f25; stroke:#82a0b0; stroke-width:3; }
        .valve.active { stroke:var(--ok); filter:url(#greenGlow); }
        .display-hit { cursor:pointer; }
        .display-frame { fill:#e4e6e5; stroke:#98a2a8; stroke-width:3; }
        .display-lcd { fill:#b7d4dc; stroke:#6e858c; stroke-width:2; }
        .display-text { fill:#20323a; font:700 18px system-ui, sans-serif; text-anchor:middle; }
        .display-sub { fill:#38515c; font:600 9px system-ui, sans-serif; text-anchor:middle; }
        .hardware-label { fill:#d5e2e9; font:600 13px system-ui, sans-serif; text-anchor:middle; opacity:.7; }
        .display-hint { position:absolute; left:50%; top:15.3%; transform:translate(-50%, -50%); z-index:3; pointer-events:none; padding:4px 7px; border-radius:999px; background:rgba(3,12,19,.72); color:#9dc7dc; font-size:9px; letter-spacing:.03em; opacity:0; transition:opacity .2s ease; }
        .unit-stage:hover .display-hint { opacity:1; }
        @keyframes flowMove { to { stroke-dashoffset:-42; } }
        @keyframes pumpSpin { to { transform:rotate(360deg); } }

        .footer { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); margin:0 20px 20px; border-top:1px solid rgba(255,255,255,.09); border-bottom:1px solid rgba(255,255,255,.06); }
        .footer-item { display:flex; align-items:center; gap:9px; min-width:0; padding:13px 10px; color:var(--muted); border-right:1px solid rgba(255,255,255,.07); }
        .footer-item:last-child { border-right:0; }
        .footer-item ha-icon { --mdc-icon-size:20px; color:#a6c5d8; flex:0 0 auto; }
        .footer-item div { min-width:0; }
        .footer-item span { display:block; font-size:9px; text-transform:uppercase; letter-spacing:.08em; }
        .footer-item strong { display:block; margin-top:2px; color:#fff; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        .display-modal { position:absolute; inset:0; z-index:20; display:grid; place-items:center; padding:20px; background:rgba(1,7,11,.72); backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); }
        .display-panel { width:min(560px, 95%); border:1px solid rgba(255,255,255,.16); border-radius:26px; padding:18px; background:linear-gradient(145deg, #d9dcda, #f0f1ef 45%, #c5c9c8); color:#233139; box-shadow:0 28px 80px rgba(0,0,0,.42); }
        .display-panel-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
        .display-panel-head strong { font-size:13px; color:#59676d; letter-spacing:.04em; }
        .display-close { width:38px; height:38px; display:grid; place-items:center; border:0; border-radius:50%; background:rgba(26,40,47,.08); color:#3b4e57; cursor:pointer; }
        .display-shell { position:relative; border:2px solid #76848a; border-radius:8px; background:#e7e9e8; padding:16px 16px 13px; box-shadow:inset 0 0 0 2px rgba(255,255,255,.7), 0 5px 12px rgba(0,0,0,.15); }
        .display-screen { min-height:270px; border:2px solid #70858d; border-radius:5px; padding:16px; background:linear-gradient(#c9e0e5, #adcbd2); box-shadow:inset 0 0 14px rgba(50,89,101,.22); color:#19323c; }
        .display-screen-title { display:grid; grid-template-columns:34px 1fr 34px; align-items:center; font-weight:800; font-size:19px; text-align:center; }
        .display-screen-title span { grid-column:2; }
        .display-back { grid-column:1; width:31px; height:31px; display:grid; place-items:center; border:1px solid rgba(38,67,77,.24); border-radius:6px; background:rgba(255,255,255,.2); color:#284955; cursor:pointer; }
        .display-home-top { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; margin-bottom:17px; }
        .display-home-temp span { display:block; color:#42616c; font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
        .display-home-temp strong { display:block; font-size:38px; line-height:1.05; letter-spacing:-.04em; }
        .display-home-state { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; color:#42616c; }
        .display-home-state .dot { width:8px; height:8px; border-radius:50%; background:#81969e; }
        .display-home-state .dot.active { background:#2b9a72; box-shadow:0 0 0 4px rgba(43,154,114,.12); }
        .display-menu-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
        .display-menu-grid button { min-height:78px; display:flex; align-items:center; gap:11px; padding:12px; border:1px solid rgba(38,67,77,.24); border-radius:7px; background:rgba(255,255,255,.22); color:#1c3b46; text-align:left; cursor:pointer; }
        .display-menu-grid button ha-icon { --mdc-icon-size:26px; }
        .display-menu-grid button span { font-weight:800; font-size:14px; }
        .display-menu-grid .disabled-menu { opacity:.42; cursor:default; }
        .display-list { display:flex; flex-direction:column; gap:7px; margin-top:14px; }
        .display-list > div { min-height:43px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 10px; border-bottom:1px solid rgba(35,67,77,.16); }
        .display-list span { color:#42616c; font-size:13px; }
        .display-list strong { font-size:15px; }
        .display-buttons { display:flex; justify-content:center; gap:18px; padding-top:12px; }
        .display-buttons span { width:9px; height:9px; border-radius:50%; background:#a6acad; box-shadow:inset 0 1px 2px rgba(0,0,0,.2); }
        .display-note { margin:11px 3px 0; color:#66767d; font-size:10px; line-height:1.4; text-align:center; }

        @media (max-width: 780px) {
          .head { padding:17px 15px 9px; }
          .statuses { max-width:51%; }
          .status-pill { min-height:42px; padding:7px 9px; }
          .status-pill span { display:none; }
          .main { grid-template-columns:1fr; padding:0 12px 14px; }
          .unit-stage { order:1; max-width:520px; }
          .rail { order:2; display:grid; grid-template-columns:1fr 1fr; gap:8px; }
          .rail.left { order:2; }
          .rail.right { order:3; }
          .metric { min-height:66px; }
          .metric strong { font-size:17px; }
          .footer { grid-template-columns:1fr 1fr; margin:0 12px 14px; }
          .footer-item:nth-child(2) { border-right:0; }
          .footer-item:nth-child(-n+2) { border-bottom:1px solid rgba(255,255,255,.07); }
          .display-hint { display:none; }
        }
        @media (max-width: 450px) {
          ha-card { border-radius:20px; }
          .brand h2 { font-size:24px; }
          .brand p { font-size:12px; }
          .statuses { gap:5px; }
          .status-pill { min-width:42px; justify-content:center; }
          .status-pill > div { display:none; }
          .rail { grid-template-columns:1fr 1fr; }
          .metric { padding:9px; }
          .metric-icon { width:32px; height:32px; flex-basis:32px; }
          .metric-label { font-size:9px; }
          .metric strong { font-size:14px; }
          .display-screen { min-height:245px; padding:12px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .flow.active, .pump-ring.active { animation:none !important; }
        }
      </style>

      <ha-card>
        <div class="head">
          <div class="brand">
            <h2>${this._escape(this._config.title)}</h2>
            <p>${this._escape(this._config.subtitle)}</p>
          </div>
          <div class="statuses">
            <div class="status-pill hot ${flow.heating ? "active" : ""}"><ha-icon icon="mdi:heat-wave"></ha-icon><div><span>Varmedrift</span><strong>${heatingStatus}</strong></div></div>
            <div class="status-pill water ${flow.dhw ? "active" : ""}"><ha-icon icon="mdi:water"></ha-icon><div><span>Brugsvand</span><strong>${dhwStatus}</strong></div></div>
          </div>
        </div>

        <div class="main">
          <div class="rail left">
            ${this._metric({ key:"fjv_supply", label:"FJV frem", icon:"mdi:transmission-tower-import", tone:"hot" })}
            ${this._metric({ key:"fjv_return", label:"FJV retur", icon:"mdi:transmission-tower-export", tone:"cold" })}
            ${this._metric({ key:"pump_speed", label:"Pumpe", icon:"mdi:pump", tone:"ok", value:pumpValue })}
          </div>

          <div class="unit-stage ${photoClass}">
            ${photo}
            <span class="display-hint">Tryk på displayet</span>
            <svg class="diagram" viewBox="0 0 1000 1220" role="img" aria-label="Animeret Calefa flowdiagram">
              <defs>
                <linearGradient id="caseGrad" x1="0" x2="1"><stop offset="0" stop-color="#1b2730"/><stop offset=".5" stop-color="#313d45"/><stop offset="1" stop-color="#151f26"/></linearGradient>
                <filter id="hotGlow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <filter id="coldGlow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <filter id="greenGlow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <filter id="pipeShadow"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity=".42"/></filter>
              </defs>

              <g class="hardware">
                <rect class="housing" x="174" y="102" width="652" height="1005" rx="45"/>
                <rect class="housing-top" x="140" y="72" width="720" height="255" rx="54"/>
                <rect class="insulation" x="188" y="330" width="624" height="744" rx="28"/>

                <path class="pipe-base" d="M240 585 H420 V520 H720"/>
                <path class="pipe-base" d="M240 960 V680 H380 V585"/>
                <path class="pipe-metal" d="M320 1055 V720 H560 V535 H700"/>
                <path class="pipe-metal" d="M470 1055 V880 H640 V680 H730"/>
                <path class="pipe-base" d="M610 1055 V930 H748 V850"/>
                <path class="pipe-base" d="M700 1055 V930 H820"/>

                <rect class="hx" x="725" y="470" width="105" height="310" rx="16"/>
                <g class="hx-lines">
                  <line x1="744" y1="490" x2="744" y2="760"/><line x1="758" y1="490" x2="758" y2="760"/><line x1="772" y1="490" x2="772" y2="760"/><line x1="786" y1="490" x2="786" y2="760"/><line x1="800" y1="490" x2="800" y2="760"/><line x1="814" y1="490" x2="814" y2="760"/>
                </g>
                <rect class="hx" x="744" y="790" width="86" height="208" rx="14"/>
                <g class="hx-lines">
                  <line x1="759" y1="808" x2="759" y2="980"/><line x1="772" y1="808" x2="772" y2="980"/><line x1="785" y1="808" x2="785" y2="980"/><line x1="798" y1="808" x2="798" y2="980"/><line x1="811" y1="808" x2="811" y2="980"/>
                </g>

                <circle class="pump-body" cx="500" cy="770" r="94"/>
                <circle class="pump-ring ${flow.pumpActive ? "active" : ""}" cx="500" cy="770" r="72"/>
                <circle cx="500" cy="770" r="28" fill="#304654"/>
                <path d="M500 742 C530 748 540 770 526 794 C500 786 489 764 500 742Z" fill="#8299a7"/>

                <rect class="valve ${flow.heating ? "active" : ""}" x="603" y="902" width="88" height="54" rx="18"/>
                <rect class="valve ${flow.dhw ? "active" : ""}" x="402" y="540" width="86" height="50" rx="18"/>
                <text class="hardware-label" x="775" y="625">Brugsvand</text>
                <text class="hardware-label" x="785" y="905">Varme</text>
              </g>

              <g class="display-hit" data-action="open-display" tabindex="0" role="button" aria-label="Åbn Calefa betjeningsdisplay">
                <rect class="display-frame" x="360" y="135" width="280" height="150" rx="13"/>
                <rect class="display-lcd" x="414" y="172" width="172" height="70" rx="3"/>
                <text class="display-text" x="500" y="204">${this._escape(this._format("heating_supply", "50", 0))}</text>
                <text class="display-sub" x="500" y="224">VARME</text>
                <circle cx="440" cy="261" r="5" fill="#a8adae"/><circle cx="480" cy="261" r="5" fill="#a8adae"/><circle cx="520" cy="261" r="5" fill="#a8adae"/><circle cx="560" cy="261" r="5" fill="#a8adae"/>
              </g>

              <g aria-hidden="true">
                <path class="flow hot ${flow.primary ? "active" : ""}" style="--flow-speed:${flow.heating && flow.dhw ? heatSpeed : dhwSpeed}" d="M240 585 H420 V520 H720"/>
                <path class="flow dhw ${flow.dhw ? "active" : ""}" style="--flow-speed:${dhwSpeed}" d="M720 520 H777 V760 H690"/>
                <path class="flow cold ${flow.dhw ? "active" : ""}" style="--flow-speed:${dhwSpeed}" d="M820 680 H777 V470 H710"/>
                <path class="flow cold ${flow.primary ? "active" : ""}" style="--flow-speed:${heatSpeed}" d="M240 960 V680 H380 V585"/>
                <path class="flow cold ${flow.heating ? "active" : ""}" style="--flow-speed:${heatSpeed}" d="M320 1055 V720 H560 V535 H700"/>
                <path class="flow hot ${flow.heating ? "active" : ""}" style="--flow-speed:${heatSpeed}" d="M748 850 V930 H610 V1055"/>
              </g>
            </svg>
          </div>

          <div class="rail right">
            ${this._metric({ key:"dhw_temperature", label:"Varmt vand", icon:"mdi:water-thermometer", tone:"hot" })}
            ${this._metric({ key:"heating_supply", label:"Varme frem", icon:"mdi:radiator", tone:"hot" })}
            ${this._metric({ key:"heating_return", label:"Varme retur", icon:"mdi:radiator-disabled", tone:"cold" })}
            ${this._metric({ key:"heating_valve", label:"Varmeventil", icon:"mdi:valve", tone:"ok", value:heatValveValue })}
          </div>
        </div>

        ${this._config.show_footer ? `
          <div class="footer">
            <div class="footer-item"><ha-icon icon="mdi:home-thermometer-outline"></ha-icon><div><span>Bolig</span><strong>${this._escape(this._temperature("room_temperature"))}</strong></div></div>
            <div class="footer-item"><ha-icon icon="mdi:thermometer"></ha-icon><div><span>Ude</span><strong>${this._escape(this._temperature("outdoor_temperature"))}</strong></div></div>
            <div class="footer-item"><ha-icon icon="mdi:flash-outline"></ha-icon><div><span>Effekt</span><strong>${this._escape(this._format("power"))}</strong></div></div>
            <div class="footer-item"><ha-icon icon="mdi:connection"></ha-icon><div><span>Status</span><strong>${flow.primary ? "Aktiv" : "Standby"}</strong></div></div>
          </div>` : ""}

        ${this._displayOpen ? `
          <div class="display-modal" role="dialog" aria-modal="true" aria-label="Calefa betjeningsdisplay">
            <div class="display-panel">
              <div class="display-panel-head"><strong>${this._escape(this._config.title)} · virtuelt display</strong><button class="display-close" data-action="close-display" aria-label="Luk"><ha-icon icon="mdi:close"></ha-icon></button></div>
              <div class="display-shell">
                <div class="display-screen">${this._displayContent(flow)}</div>
                <div class="display-buttons"><span></span><span></span><span></span><span></span></div>
              </div>
              <div class="display-note">Første version viser live Home Assistant-data. Menustruktur og styring kan efterfølgende matches mod fotos af det rigtige Calefa-display.</div>
            </div>
          </div>` : ""}
      </ha-card>
    `;
  }
}

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
