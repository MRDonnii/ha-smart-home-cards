const VERSION = "0.2.0";

const CONTROL_FIELDS = [
  ["auto_standby", "Automatisk standby", "switch"],
  ["auto_standby_status", "Automatisk standby status", "sensor"],
  ["curve_type", "Varmekurvetype", "select"], ["curve_value", "Varmekurveværdi", "number"],
  ["curve_offset", "Forskydning", "number"], ["min_supply", "Minimum fremløb", "number"],
  ["max_supply", "Maksimum fremløb", "number"], ["summer_cutoff", "Sommerudkobling", "number"],
  ["return_mode", "Returbegrænser", "select"], ["return_enabled", "Returbegrænser aktiv", "switch"],
  ["max_return", "Maksimum retur", "number"], ["return_gain", "Returforstærkning", "number"],
  ["room_profile", "Komfortprofil", "select"], ["room_schedule", "Planlagt skema", "switch"],
  ["room_temporary_mode", "Midlertidig tilstand", "switch"], ["eco_temperature", "Øko temperatur", "number"],
  ["comfort_temperature", "Komforttemperatur", "number"], ["extra_comfort_temperature", "Ekstra komfort", "number"],
  ["temporary_temperature", "Midlertidig temperatur", "number"], ["temporary_duration", "Varighed", "number"],
  ["standby", "Calefa standby", "switch"], ["circulation_pump", "Cirkulationspumpe", "switch"],
  ["heating_state", "Varmestatus", "sensor"], ["regulator_state", "Regulator", "sensor"],
  ["blocked_reason", "Varme blokeret af", "sensor"]
];

const DATA_FIELDS = [
  ["meter_total_energy", "Total energi"], ["meter_day_energy", "Energi i dag"],
  ["meter_day_cost", "Pris i dag"], ["meter_month_cost", "Pris denne måned"],
  ["meter_total_volume", "Total volumen"], ["meter_flow", "Aktuelt flow"],
  ["meter_supply", "Måler fremløb"], ["meter_return", "Måler retur"],
  ["meter_cooling", "Afkøling"], ["meter_power", "Aktuel effekt"],
  ["meter_hours", "Driftstimer"], ["meter_max_flow_year", "Maks. flow år"],
  ["meter_max_power_year", "Maks. effekt år"], ["meter_energy_e8", "Energi E8"],
  ["meter_energy_e9", "Energi E9"], ["meter_rssi", "Signalstyrke"],
  ["meter_alarm", "Målerstatus"], ["calefa_supply", "Calefa fremløb"],
  ["calefa_return", "Calefa retur"], ["calefa_cooling", "Calefa afkøling"],
  ["cvv_supply", "CVV fremløb"], ["cvv_return", "CVV retur"],
  ["cvv_cooling", "CVV afkøling"], ["cvv_valve", "CVV ventil"],
  ["dhw_power", "Varmtvandseffekt"]
];

class HACalefaDetailsCard extends HTMLElement {
  static getStubConfig() { return { title: "Calefa styring", entities: Object.fromEntries([...CONTROL_FIELDS, ...DATA_FIELDS].map(([key]) => [key, ""])) }; }
  static async getConfigElement() { return document.createElement("ha-calefa-details-card-editor"); }
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {}; this._hass = null; this._signature = ""; this._configSignature = "";
    this.shadowRoot.addEventListener("click", event => this._handleClick(event));
    this.shadowRoot.addEventListener("change", event => this._handleChange(event));
    this.shadowRoot.addEventListener("keydown", event => this._handleKeydown(event));
  }
  setConfig(config) {
    if (!config) throw new Error("Ugyldig konfiguration");
    const next = { title: "Calefa styring",...config, entities: { ...(config.entities || {}) } };
    const signature = JSON.stringify(next);
    this._config = next;
    if (signature === this._configSignature) return;
    this._configSignature = signature; this._signature = ""; this._renderStructure(); this._updateValues(true);
  }
  set hass(hass) {
    this._hass = hass;
    const ids = Object.values(this._config.entities || {}).filter(Boolean);
    const signature = JSON.stringify(ids.map(id => {
      const state = hass?.states?.[id];
      return [id, state?.state, state?.attributes?.min, state?.attributes?.max, state?.attributes?.step, state?.attributes?.options];
    }));
    if (signature !== this._signature) { this._signature = signature; this._updateValues(); this._historyCards?.forEach(card => { card.hass = hass; }); }
  }
  getCardSize() { return 8; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }
  _entity(key) { const id = this._config.entities?.[key]; return id ? this._hass?.states?.[id] : undefined; }
  _escape(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]); }
  _renderStructure() {
    if (!this.shadowRoot) return;
    const number = (key, label, icon) => `<div class="control number-control" data-control="${key}"><button class="info" data-more="${key}" aria-label="Vis ${label}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button><div class="stepper"><button data-step="-1" aria-label="Sænk ${label}">−</button><strong data-value="${key}">—</strong><button data-step="1" aria-label="Hæv ${label}">+</button></div></div>`;
    const toggle = (key, label, description, icon) => `<button class="control toggle" data-toggle="${key}"><span class="control-icon"><ha-icon icon="${icon}"></ha-icon></span><span><b>${label}</b><small>${description}</small></span><span class="switch" aria-hidden="true"><i></i></span></button>`;
    const select = (key, label, icon) => `<label class="control select-control" data-control="${key}"><span class="select-label"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></span><select data-select="${key}" aria-label="${label}"></select></label>`;
    const metric = (key, label, icon, tone) => `<button class="data-metric ${tone}" data-more="${key}"><ha-icon icon="${icon}"></ha-icon><span><small>${label}</small><strong data-value="${key}">—</strong></span></button>`;
    this.shadowRoot.innerHTML = `<style>${this._styles()}</style><ha-card>
      <header><div><small>WAVIN CALEFA</small><h2>${this._escape(this._config.title)}</h2><p>Styring, målerdata og historik samlet</p></div><div class="status" data-summary>Indlæser…</div></header>
      <nav class="category-tabs" aria-label="Detaljekategori"><button class="active" data-tab="control"><ha-icon icon="mdi:tune-variant"></ha-icon>Styring</button><button data-tab="meter"><ha-icon icon="mdi:meter-gas"></ha-icon>Målerdata</button><button data-tab="history"><ha-icon icon="mdi:chart-line"></ha-icon>Historik</button></nav>
      <div class="category-panel active" data-panel="control"><div class="quick">${toggle("auto_standby","Automatisk standby","Stopper varmen, når alle valgte rum er varme","mdi:weather-night")}</div>
      <div class="sections">
        <section><div class="section-title"><ha-icon icon="mdi:chart-bell-curve-cumulative"></ha-icon><div><h3>Varmekurve</h3><p>Fremløbstemperatur efter vejret</p></div></div>${select("curve_type","Kurvetype","mdi:tune-variant")}
          <div class="control-grid">${number("curve_value","Kurveværdi","mdi:chart-bell-curve-cumulative")}${number("curve_offset","Forskydning","mdi:arrow-up-down")}${number("min_supply","Minimum fremløb","mdi:thermometer-chevron-down")}${number("max_supply","Maksimum fremløb","mdi:thermometer-chevron-up")}${number("summer_cutoff","Sommerudkobling","mdi:white-balance-sunny")}</div></section>
        <section><div class="section-title"><ha-icon icon="mdi:thermometer-lines"></ha-icon><div><h3>Returbegrænser</h3><p>Holder returtemperaturen nede</p></div></div>${select("return_mode","Regulering","mdi:tune")}${toggle("return_enabled","Returbegrænser","Aktiver temperaturbegrænsning","mdi:thermometer-alert")}
          <div class="control-grid">${number("max_return","Maksimum retur","mdi:thermometer-high")}${number("return_gain","Forstærkning","mdi:signal")}</div></section>
        <section><div class="section-title"><ha-icon icon="mdi:home-thermometer"></ha-icon><div><h3>RUM</h3><p>Komfortprofil og midlertidig varme</p></div></div>${select("room_profile","Komfortprofil","mdi:home-heart")}
          <div class="toggle-grid">${toggle("room_schedule","Planlagt skema","Brug Calefas tidsplan","mdi:calendar-clock")}${toggle("room_temporary_mode","Midlertidig tilstand","Tidsbegrænset temperatur","mdi:timer-outline")}</div>
          <div class="control-grid">${number("eco_temperature","Øko temperatur","mdi:leaf")}${number("comfort_temperature","Komforttemperatur","mdi:home-heart")}${number("extra_comfort_temperature","Ekstra komfort","mdi:fire")}${number("temporary_temperature","Midlertidig temperatur","mdi:thermometer-plus")}${number("temporary_duration","Varighed","mdi:timer-sand")}</div></section>
        <section><div class="section-title"><ha-icon icon="mdi:cog-outline"></ha-icon><div><h3>Avanceret</h3><p>Direkte drift og diagnose</p></div></div><div class="toggle-grid">${toggle("standby","Calefa standby","Manuel standby for anlægget","mdi:power-sleep")}${toggle("circulation_pump","Cirkulationspumpe","Manuel pumpestyring","mdi:pump")}</div>
          <div class="diagnostics"><button data-more="heating_state"><small>Varmestatus</small><strong data-value="heating_state">—</strong></button><button data-more="regulator_state"><small>Regulator</small><strong data-value="regulator_state">—</strong></button><button data-more="blocked_reason"><small>Blokeret af</small><strong data-value="blocked_reason">—</strong></button></div></section>
      </div></div>
      <div class="category-panel" data-panel="meter"><div class="data-section"><div class="section-title"><ha-icon icon="mdi:cash-clock"></ha-icon><div><h3>Forbrug og økonomi</h3><p>De vigtigste summer og omkostninger</p></div></div><div class="data-grid">${metric("meter_total_energy","Total energi","mdi:counter","red")}${metric("meter_day_energy","Energi i dag","mdi:calendar-today","amber")}${metric("meter_day_cost","Pris i dag","mdi:cash","cyan")}${metric("meter_month_cost","Pris denne måned","mdi:calendar-month","blue")}${metric("meter_total_volume","Total volumen","mdi:water","blue")}</div></div>
        <div class="data-section"><div class="section-title"><ha-icon icon="mdi:transit-connection-variant"></ha-icon><div><h3>Aktuel drift</h3><p>Temperatur, flow og effekt fra MULTICAL</p></div></div><div class="data-grid">${metric("meter_supply","Fremløb","mdi:thermometer-chevron-up","red")}${metric("meter_return","Retur","mdi:thermometer-chevron-down","blue")}${metric("meter_cooling","Afkøling","mdi:snowflake-thermometer","green")}${metric("meter_flow","Flow","mdi:pipe","cyan")}${metric("meter_power","Effekt","mdi:flash","violet")}${metric("meter_alarm","Målerstatus","mdi:shield-check","green")}</div></div>
        <div class="data-section"><div class="section-title"><ha-icon icon="mdi:gauge"></ha-icon><div><h3>Måler og maksimum</h3><p>Tekniske tællere og signal</p></div></div><div class="data-grid compact">${metric("meter_hours","Driftstimer","mdi:timer-outline","slate")}${metric("meter_max_flow_year","Maks. flow år","mdi:waves-arrow-up","cyan")}${metric("meter_max_power_year","Maks. effekt år","mdi:flash-alert","amber")}${metric("meter_energy_e8","Energi E8","mdi:home-lightning-bolt","violet")}${metric("meter_energy_e9","Energi E9","mdi:home-lightning-bolt-outline","blue")}${metric("meter_rssi","Signalstyrke","mdi:signal","slate")}</div></div></div>
      <div class="category-panel" data-panel="history"><div class="history-section"><div class="section-title"><ha-icon icon="mdi:meter-gas"></ha-icon><div><h3>Kamstrup MULTICAL</h3><p>Temperatur, afkøling og effekt · 24 timer</p></div></div><div data-history="meter"></div></div><div class="history-section"><div class="section-title"><ha-icon icon="mdi:radiator"></ha-icon><div><h3>Fjernvarmekreds</h3><p>Calefa fremløb, retur og afkøling · 24 timer</p></div></div><div data-history="calefa"></div></div><div class="history-section"><div class="section-title"><ha-icon icon="mdi:heating-coil"></ha-icon><div><h3>Radiatorkreds</h3><p>CVV temperaturer og ventil · 24 timer</p></div></div><div data-history="cvv"></div></div><div class="history-section"><div class="section-title"><ha-icon icon="mdi:water-boiler"></ha-icon><div><h3>Varmt vand</h3><p>Effektforbrug · 24 timer</p></div></div><div data-history="dhw"></div></div></div>
      <ha-icon class="watermark" icon="mdi:home-thermometer-outline"></ha-icon>
    </ha-card>`;
    this._mountHistoryCards();
  }
  _updateValues(force = false) {
    if (!this._hass || !this.shadowRoot.querySelector("ha-card")) return;
    for (const [key,, type] of CONTROL_FIELDS) {
      const state = this._entity(key);
      if (type === "number" || type === "sensor") {
        const value = this.shadowRoot.querySelector(`[data-value="${key}"]`);
        if (value) value.textContent = state ? `${state.state}${state.attributes?.unit_of_measurement ? ` ${state.attributes.unit_of_measurement}` : ""}` : "—";
        if (type === "number") {
          const holder = this.shadowRoot.querySelector(`[data-control="${key}"]`);
          holder?.querySelectorAll("[data-step]").forEach(button => {
            const direction = Number(button.dataset.step), current = Number(state?.state), bound = direction < 0 ? Number(state?.attributes?.min) : Number(state?.attributes?.max);
            button.disabled = !state || !Number.isFinite(current) || (Number.isFinite(bound) && (direction < 0 ? current <= bound : current >= bound));
          });
        }
      }
      if (type === "switch") {
        const button = this.shadowRoot.querySelector(`[data-toggle="${key}"]`), active = state?.state === "on";
        if (button) { button.classList.toggle("active", active); button.classList.toggle("unavailable", !state || state.state === "unavailable"); button.setAttribute("aria-pressed", String(active)); }
      }
      if (type === "select") {
        const select = this.shadowRoot.querySelector(`[data-select="${key}"]`);
        if (!select) continue;
        const options = Array.isArray(state?.attributes?.options) ? state.attributes.options : [];
        const optionSignature = JSON.stringify(options);
        if (force || select.dataset.options !== optionSignature) {
          const focused = this.shadowRoot.activeElement === select;
          select.replaceChildren(...options.map(option => { const node = document.createElement("option"); node.value = option; node.textContent = option; return node; }));
          select.dataset.options = optionSignature;
          if (focused) select.focus();
        }
        if (state && select.value !== state.state) select.value = state.state;
        select.disabled = !state || state.state === "unavailable";
      }
    }
    for (const [key] of DATA_FIELDS) {
      const state = this._entity(key), value = this.shadowRoot.querySelector(`[data-value="${key}"]`);
      if (value) value.textContent = state && !["unknown","unavailable",""].includes(state.state) ? `${state.state}${state.attributes?.unit_of_measurement ? ` ${state.attributes.unit_of_measurement}` : ""}` : "—";
    }
    const auto = this._entity("auto_standby"), autoStatus = this._entity("auto_standby_status"), heating = this._entity("heating_state");
    const summary = this.shadowRoot.querySelector("[data-summary]");
    const countdown = autoStatus?.attributes?.countdown;
    if (summary) { summary.textContent = auto?.state === "on" && autoStatus ? `${autoStatus.state}${countdown ? ` · ${countdown}` : ""}` : heating?.state || "Klar"; summary.classList.toggle("active", auto?.state === "on"); }
    const autoDescription = this.shadowRoot.querySelector('[data-toggle="auto_standby"] small');
    if (autoDescription) autoDescription.textContent = auto?.state === "on" && autoStatus?.attributes?.description ? `${autoStatus.attributes.description}${countdown ? ` (${countdown})` : ""}` : "Stopper varmen, når alle valgte rum er varme";
  }
  _handleClick(event) {
    const tab = event.target.closest?.("[data-tab]");
    if (tab) {
      this.shadowRoot.querySelectorAll("[data-tab]").forEach(button => button.classList.toggle("active", button === tab));
      this.shadowRoot.querySelectorAll("[data-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === tab.dataset.tab));
      return;
    }
    const step = event.target.closest?.("[data-step]");
    if (step) {
      const holder = step.closest("[data-control]"), key = holder?.dataset.control, state = this._entity(key);
      if (!state) return;
      const amount = Number(state.attributes?.step) || 1, current = Number(state.state), direction = Number(step.dataset.step);
      const min = Number(state.attributes?.min), max = Number(state.attributes?.max);
      let value = current + direction * amount;
      if (Number.isFinite(min)) value = Math.max(min, value); if (Number.isFinite(max)) value = Math.min(max, value);
      this._hass.callService("number", "set_value", { entity_id: state.entity_id, value: Number(value.toFixed(4)) }); return;
    }
    const toggle = event.target.closest?.("[data-toggle]");
    if (toggle && !toggle.classList.contains("unavailable")) {
      const entity = this._config.entities?.[toggle.dataset.toggle];
      if (entity) this._hass.callService("homeassistant", "toggle", { entity_id: entity }); return;
    }
    const more = event.target.closest?.("[data-more]");
    if (more) this._showMore(more.dataset.more);
  }
  _handleChange(event) {
    const select = event.target.closest?.("[data-select]"); if (!select) return;
    const entity = this._config.entities?.[select.dataset.select];
    if (entity) this._hass.callService("select", "select_option", { entity_id: entity, option: select.value });
  }
  _handleKeydown(event) { if ((event.key === "Enter" || event.key === " ") && event.target.closest?.("[data-more]") && event.target.tagName !== "BUTTON") { event.preventDefault(); this._showMore(event.target.closest("[data-more]").dataset.more); } }
  _showMore(key) { const entityId = this._config.entities?.[key]; if (entityId) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true })); }
  async _mountHistoryCards() {
    this._historyCards = [];
    if (!window.loadCardHelpers) return;
    const helpers = await window.loadCardHelpers();
    if (!this.isConnected && !this.shadowRoot.querySelector("ha-card")) return;
    const definitions = {
      meter: [["meter_supply","Fremløb","#ef5350"],["meter_return","Retur","#42a5f5"],["meter_cooling","Afkøling","#22c55e"],["meter_power","Effekt","#ab47bc"]],
      calefa: [["calefa_supply","Fremløb","#ef5350"],["calefa_return","Retur","#42a5f5"],["calefa_cooling","Afkøling","#22c55e"]],
      cvv: [["cvv_supply","Fremløb","#ef5350"],["cvv_return","Retur","#42a5f5"],["cvv_cooling","Afkøling","#22c55e"],["cvv_valve","Ventil","#d07888"]],
      dhw: [["dhw_power","Varmtvand effekt","#f59e0b"]]
    };
    for (const [name, series] of Object.entries(definitions)) {
      const target = this.shadowRoot.querySelector(`[data-history="${name}"]`); if (!target) continue;
      const entities = series.map(([key,label,color]) => ({entity:this._config.entities?.[key],name:label,color})).filter(item => item.entity);
      if (!entities.length) { target.textContent = "Ingen historik-entiteter valgt"; continue; }
      const card = await helpers.createCardElement({type:"custom:mini-graph-card",entities,hours_to_show:24,points_per_hour:2,line_width:3,font_size:72,animate:false,hour24:true,show:{graph:"line",icon:false,name:false,state:true,legend:true,labels:false}});
      card.hass = this._hass; target.replaceChildren(card); this._historyCards.push(card);
    }
  }
  _styles() { return `
    :host{display:block;container-type:inline-size;--surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#15191f)));--panel:var(--dashboard-surface-info-dark,color-mix(in srgb,var(--primary-text-color,#fff) 5%,var(--surface)));--line:color-mix(in srgb,var(--primary-text-color,#fff) 13%,transparent);--accent:var(--dashboard-accent,var(--accent-color,#ff7043))}*{box-sizing:border-box}ha-card{position:relative;overflow:hidden;padding:22px;background:var(--surface);color:var(--primary-text-color,#fff);border:1px solid var(--line);border-left:calc(var(--dashboard-left-accent-width, 1) * 4px) solid var(--accent);border-radius:18px;box-shadow:var(--ha-card-box-shadow,0 10px 28px rgba(0,0,0,.18))}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}header small{font-size:10px;letter-spacing:.16em;color:var(--secondary-text-color,#9ba9b7)}h2{font-size:26px;margin:3px 0}header p,.section-title p{margin:0;color:var(--secondary-text-color,#9ba9b7);font-size:13px}.status{border:1px solid var(--line);border-radius:999px;padding:8px 12px;font-size:12px;color:var(--secondary-text-color,#9ba9b7)}.status.active{color:var(--success-color,#62cf8e);border-color:color-mix(in srgb,var(--success-color,#62cf8e) 45%,transparent)}.category-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:12px;padding:4px;border:1px solid var(--line);border-radius:14px;background:color-mix(in srgb,var(--primary-text-color,#fff) 3%,transparent)}.category-tabs button{display:flex;justify-content:center;align-items:center;gap:7px;min-height:40px;border:0;border-radius:10px;background:transparent;color:var(--secondary-text-color,#9ba9b7);font:inherit;font-weight:700;cursor:pointer}.category-tabs button.active{background:color-mix(in srgb,var(--accent) 17%,transparent);color:var(--primary-text-color,#fff)}.category-tabs ha-icon{--mdc-icon-size:19px}.category-panel{display:none}.category-panel.active{display:block}.quick{margin-bottom:12px}.sections{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sections section,.data-section,.history-section{min-width:0;padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:16px}.data-section+.data-section,.history-section+.history-section{margin-top:10px}.section-title{display:flex;gap:11px;align-items:center;margin-bottom:13px}.section-title>ha-icon{color:var(--accent);--mdc-icon-size:25px}.section-title h3{font-size:18px;margin:0 0 2px}.control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.control{min-width:0;border:1px solid var(--line);border-radius:13px;background:color-mix(in srgb,var(--primary-text-color,#fff) 4%,transparent);color:inherit}.toggle{width:100%;display:grid;grid-template-columns:38px minmax(0,1fr) 40px;gap:10px;align-items:center;text-align:left;padding:11px;cursor:pointer;font:inherit}.toggle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.control-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}.toggle b,.toggle small{display:block}.toggle b{font-size:13px}.toggle small{font-size:10px;color:var(--secondary-text-color,#9ba9b7);margin-top:3px;line-height:1.25}.switch{width:36px;height:21px;padding:2px;border-radius:999px;background:color-mix(in srgb,var(--primary-text-color,#fff) 18%,transparent);transition:.2s}.switch i{display:block;width:17px;height:17px;border-radius:50%;background:var(--secondary-text-color,#9ba9b7);transition:.2s}.toggle.active .switch{background:color-mix(in srgb,var(--success-color,#62cf8e) 52%,transparent)}.toggle.active .switch i{transform:translateX(15px);background:var(--success-color,#62cf8e)}.toggle.unavailable{opacity:.45}.select-control{display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:8px}.select-label{display:flex;align-items:center;gap:8px;min-width:115px;font-size:12px;color:var(--secondary-text-color,#9ba9b7)}.select-label ha-icon{color:var(--accent);--mdc-icon-size:19px}.select-control select{min-width:0;flex:1;padding:9px 32px 9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card-background-color,#1c1f26);color:var(--primary-text-color,#fff);font:inherit;font-size:13px}.number-control{padding:9px}.info{display:flex;align-items:center;gap:7px;width:100%;padding:0 2px 8px;border:0;background:none;color:var(--secondary-text-color,#9ba9b7);font:inherit;font-size:11px;text-align:left;cursor:pointer}.info ha-icon{color:var(--accent);--mdc-icon-size:18px}.stepper{display:grid;grid-template-columns:36px minmax(62px,1fr) 36px;align-items:center;gap:4px}.stepper button{height:34px;border:1px solid var(--line);border-radius:9px;background:color-mix(in srgb,var(--primary-text-color,#fff) 5%,transparent);color:var(--accent);font-size:23px;cursor:pointer}.stepper button:disabled{opacity:.3;cursor:not-allowed}.stepper strong{text-align:center;font-size:18px;white-space:nowrap}.diagnostics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}.diagnostics button{min-width:0;padding:10px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--primary-text-color,#fff) 4%,transparent);color:inherit;text-align:left;cursor:pointer}.diagnostics small,.diagnostics strong{display:block;overflow:hidden;text-overflow:ellipsis}.diagnostics small{color:var(--secondary-text-color,#9ba9b7);font-size:10px}.diagnostics strong{margin-top:4px;font-size:13px;white-space:nowrap}.data-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.data-grid.compact{grid-template-columns:repeat(3,minmax(0,1fr))}.data-metric{min-width:0;display:flex;gap:10px;align-items:center;padding:12px;border:1px solid var(--line);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--tone,#78909c);border-radius:13px;background:color-mix(in srgb,var(--primary-text-color,#fff) 4%,transparent);color:inherit;text-align:left;cursor:pointer}.data-metric>ha-icon{color:var(--tone,#78909c);--mdc-icon-size:23px}.data-metric span,.data-metric small,.data-metric strong{display:block;min-width:0}.data-metric small{color:var(--secondary-text-color,#9ba9b7);font-size:10px}.data-metric strong{margin-top:3px;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.data-metric.red{--tone:#ef5350}.data-metric.amber{--tone:#f59e0b}.data-metric.cyan{--tone:#06b6d4}.data-metric.blue{--tone:#42a5f5}.data-metric.green{--tone:#22c55e}.data-metric.violet{--tone:#ab47bc}.data-metric.slate{--tone:#78909c}.history-section [data-history]{min-height:80px}.watermark{position:absolute;right:18px;bottom:12px;opacity:.045;--mdc-icon-size:92px;pointer-events:none}button:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}@container(max-width:760px){ha-card{padding:16px}.sections{grid-template-columns:1fr}.control-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.data-grid,.data-grid.compact{grid-template-columns:repeat(2,minmax(0,1fr))}}@container(max-width:420px){header{display:block}.status{display:inline-block;margin-top:10px}.category-tabs button{font-size:11px}.control-grid,.toggle-grid,.data-grid,.data-grid.compact{grid-template-columns:1fr}.diagnostics{grid-template-columns:1fr}.select-control{align-items:flex-start;flex-direction:column}.select-control select{width:100%}}
  `; }
}

class HACalefaDetailsCardEditor extends HTMLElement {
  setConfig(config){this._config=config||{};if(!this._form)this._render();else this._form.data=this._config;}
  set hass(hass){this._hass=hass;if(this._form)this._form.hass=hass;}
  _render(){
    if(!this._config)return;
    this.innerHTML=`<style>:host{display:block;padding:12px}.hint{color:var(--secondary-text-color);font-size:12px;margin:0 0 12px}</style><p class="hint">Vælg kun de funktioner, der findes i installationen. Tomme felter vises som utilgængelige.</p><ha-form></ha-form>`;
    this._form=this.querySelector("ha-form");this._form.hass=this._hass;this._form.data=this._config;
    this._form.schema=[{name:"title",selector:{text:{}}},{type:"expandable",name:"entities",title:"Calefa-entiteter",schema:[...CONTROL_FIELDS.map(([name,label,domain])=>({name,label,selector:{entity:domain==="sensor"?{}:{domain}}})),...DATA_FIELDS.map(([name,label])=>({name,label,selector:{entity:{}}}))]}];
    this._form.computeLabel=s=>s.label||s.name;this._form.addEventListener("value-changed",event=>this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:event.detail.value},bubbles:true,composed:true})));
  }
}

if(!customElements.get("ha-calefa-details-card"))customElements.define("ha-calefa-details-card",HACalefaDetailsCard);
if(!customElements.get("ha-calefa-details-card-editor"))customElements.define("ha-calefa-details-card-editor",HACalefaDetailsCardEditor);
window.customCards=window.customCards||[];
window.customCards.push({type:"ha-calefa-details-card",name:"HA Calefa Details Card",description:"Samlet styring af varmekurve, returbegrænser, RUM og Calefa-drift",preview:true});
console.info(`%c HA-FJERNVARME-CARD (Calefa details) %c ${VERSION} `,"color:#fff;background:#bb433f;font-weight:700","color:#bb433f;background:#fff");
