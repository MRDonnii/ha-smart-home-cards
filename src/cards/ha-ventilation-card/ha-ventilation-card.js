const VERSION = "0.7.7";

const ENTITY_FIELDS = [
  ["outdoor_temperature", "Udeluft"], ["supply_temperature", "Indblæsning"],
  ["extract_temperature", "Udsugning"], ["exhaust_temperature", "Afkast"],
  ["afterheat_after", "Luft efter varmeflade"],
  ["supply_fan_rpm", "Indblæsningsblæser, RPM"], ["extract_fan_rpm", "Udsugningsblæser, RPM"],
  ["supply_fan_percent", "Indblæsning, hastighed %"], ["extract_fan_percent", "Udsugning, hastighed %"],
  ["room_temperature", "Rumtemperatur"], ["humidity", "Luftfugtighed"],
  ["co2", "CO₂"], ["power", "Effekt"], ["heat_recovery", "Varmegenvinding"],
  ["level", "Ventilatortrin"], ["mode", "Driftstilstand"], ["bypass", "Bypass"],
  ["filter_days", "Filter, dage tilbage"], ["air_quality", "Luftkvalitet"],
  ["heat_transfer", "Varmeoverførsel"], ["alarm", "Alarm"],
  ["afterheat_active", "Varmeflade aktiv"], ["water_flow", "Varmeflade fremløb"],
  ["water_return", "Varmeflade retur"], ["water_delta", "Varmeflade ΔT (beregnet hvis ikke sat)"],
  ["active_master", "Aktiv master"], ["rs485_healthy", "RS485 sund"],
  ["smart_age", "Smart Auto inputalder"], ["desired_level", "Pi ønsket niveau"],
  ["effective_level", "Effektivt niveau"], ["effective_source", "Effektiv kilde"],
  ["effective_reason", "Effektiv årsag"], ["mode_control", "Driftstilstand"],
  ["level_control", "Ventilationsniveau"], ["fireplace_control", "Pejsetid"],
  ["fireplace_remaining", "Pejsetid tilbage"], ["afterheat_climate", "Eftervarme climate"],
  ["afterheat_valve", "Eftervarme ventil"], ["afterheat_before", "Luft før varmeflade"],
  ["afterheat_frost", "Eftervarme frostføler"], ["highest_co2", "Højeste CO₂"],
  ["highest_co2_room", "Højeste CO₂ rum"], ["highest_rh", "Højeste RH"],
  ["highest_rh_room", "Højeste RH rum"], ["controlling_room", "Styrende rum"]
];

// Patches an existing DOM tree to match a freshly-built one in place,
// instead of the caller replacing innerHTML wholesale. Used by _render()
// once the card's *shape* (bypass/coil-visible/mobile/size) hasn't
// changed since the last render -- only text/attribute values have --
// so a routine sensor tick never destroys and recreates a single element.
// That matters for two independent reasons: it stops the flow/fan
// animations from visibly restarting every tick (previously masked with
// an animation-delay recompute, which is why "style" is skipped below --
// leaving it alone is what actually gives the animation continuity now,
// the delay only ever needs to be set once, at first mount), and it stops
// Safari from losing its scroll anchor over many focusable
// (tabindex="0") elements being torn down and rebuilt under the user's
// finger, which showed up as the page jumping to the top on every
// update on iOS specifically.
function morphNode(oldNode, newNode) {
  if (newNode.nodeType === 3 || newNode.nodeType === 8) {
    if (oldNode.nodeType !== newNode.nodeType) { oldNode.replaceWith(newNode.cloneNode()); return; }
    if (oldNode.textContent !== newNode.textContent) oldNode.textContent = newNode.textContent;
    return;
  }
  if (oldNode.nodeType !== 1 || oldNode.tagName !== newNode.tagName) { oldNode.replaceWith(newNode.cloneNode(true)); return; }
  const oldAttrNames = Array.from(oldNode.attributes, (a) => a.name);
  for (const name of oldAttrNames) {
    if (oldNode.tagName === "DETAILS" && name === "open") continue;
    if (name !== "style" && !newNode.hasAttribute(name)) oldNode.removeAttribute(name);
  }
  for (const attr of Array.from(newNode.attributes)) {
    if (attr.name === "style") continue;
    if (oldNode.getAttribute(attr.name) !== attr.value) oldNode.setAttribute(attr.name, attr.value);
  }
  if (oldNode.hasAttribute("data-preserve-children")) return;
  const oldChildren = Array.from(oldNode.childNodes);
  const newChildren = Array.from(newNode.childNodes);
  const max = Math.max(oldChildren.length, newChildren.length);
  for (let i = 0; i < max; i += 1) {
    const oc = oldChildren[i], nc = newChildren[i];
    if (!nc) { oc.remove(); continue; }
    if (!oc) { oldNode.appendChild(nc.cloneNode(true)); continue; }
    morphNode(oc, nc);
  }
}

class HAVentilationCard extends HTMLElement {
  static getStubConfig() {
    return {
      title: "Ventilation",
      animation: true,
      show_afterheat: false,
      entities: {
        outdoor_temperature: "sensor.outdoor_temperature",
        supply_temperature: "sensor.supply_temperature",
        extract_temperature: "sensor.extract_temperature",
        exhaust_temperature: "sensor.exhaust_temperature",
        supply_fan_rpm: "sensor.supply_fan_speed",
        extract_fan_rpm: "sensor.extract_fan_speed"
      }
    };
  }
  static async getConfigElement() { return document.createElement("ha-ventilation-card-editor"); }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._signature = "";
    this._id = `hav-${Math.random().toString(36).slice(2, 9)}`;
    this._viewWidth = 440;
    this._resizeObserver = undefined;
    this._lastRecovery = undefined;
    this._renderTimer = undefined;
    this._pendingSignature = undefined;
    this._historyCards = [];
    this._historyMountId = 0;
    this._detachedSignature = undefined;
    this._detailsPopupEl = undefined;
    this._detailsPopupCard = undefined;
  }

  connectedCallback() {
    // Catch up on whatever arrived while this tab was unselected. _signature is
    // cleared first so the card takes the full structural rebuild path: a fresh
    // build is what reliably (re)starts the duct/fan CSS animations, same reason
    // the shapeKey logic in _render() forces a rebuild on running-state changes.
    if (this._detachedSignature !== undefined) {
      const pending = this._detachedSignature;
      this._detachedSignature = undefined;
      this._signature = "";
      this._render(pending);
    }
    if (this._config.show_history === true && this._historyCards.length === 0) this._mountOverviewHistory();
    if (this._resizeObserver || typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => {
      const next = this._responsiveViewWidth();
      if (Math.abs(next - this._viewWidth) < 2) return;
      this._viewWidth = next;
      this._render(this._signature);
    });
    this._resizeObserver.observe(this);
  }

  disconnectedCallback() {
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._historyMountId += 1;
    clearTimeout(this._renderTimer);
    this._renderTimer = undefined;
    this._closeDetailsPopup();
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = {
      title: "Ventilation",
      animation: true,
      show_afterheat: false,
      show_history: false,details_title: "Detaljer",
      ...config,
      entities: { ...(config.entities || {}) },
      details_entities: { ...(config.details_entities || {}) }
    };
    this._signature = "";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._historyCards.forEach(card => { card.hass = hass; });
    if (this._detailsPopupCard) this._detailsPopupCard.hass = hass;
    const signature = JSON.stringify(Object.values(this._config.entities || {}).map(id => {
      const entity = hass?.states?.[id];
      return entity ? [entity.state, entity.attributes?.temperature, entity.attributes?.current_temperature, entity.attributes?.hvac_action] : null;
    }));
    if (signature === this._signature && signature === this._pendingSignature) return;
    // A card sitting behind an unselected tab is detached from the DOM, but the
    // wrapper keeps forwarding every hass tick to it. Rendering here would build
    // the whole SVG and morph a tree nobody can see, continuously, for as long
    // as the other tab is open. Remember that we fell behind and catch up in
    // connectedCallback() when the tab is actually selected.
    if (!this.isConnected) {
      clearTimeout(this._renderTimer);
      this._renderTimer = undefined;
      this._pendingSignature = undefined;
      this._detachedSignature = signature;
      return;
    }
    // setConfig() renders once immediately with no entity data at all
    // (this._signature stays "" until the first real hass tick) -- that
    // render must never sit behind the throttle below, or the card shows
    // its empty "--" placeholder for up to a second on every page load
    // before anything real appears. Only real *updates* need coalescing.
    if (this._signature === "") {
      clearTimeout(this._renderTimer);
      this._renderTimer = undefined;
      this._pendingSignature = undefined;
      this._render(signature);
      return;
    }
    // With ~24 tracked entities (several of them fast-changing sensors:
    // temperatures, fan speed, power draw) a full rebuild on every single
    // state tick fires several times a second on a busy Dantherm setup --
    // recreating the animated duct/fan SVG elements that often visibly
    // restarts their flow animation, and is needless render churn besides.
    // Coalescing bursts into one rebuild per second is imperceptible for a
    // physical airflow/temperature display and keeps the animation (and
    // everything else on the dashboard) smooth.
    this._pendingSignature = signature;
    if (this._renderTimer) return;
    this._renderTimer = setTimeout(() => {
      this._renderTimer = undefined;
      const next = this._pendingSignature;
      this._pendingSignature = undefined;
      if (next !== this._signature) this._render(next);
    }, 1000);
  }

  getCardSize() { return 10; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }

  _responsiveViewWidth() {
    const cardWidth = this.getBoundingClientRect?.().width || 0;
    const mobile = cardWidth > 0 ? cardWidth < 700 : window.matchMedia?.("(max-width: 700px)")?.matches === true;
    if (cardWidth < 1) return mobile ? 440 : 520;
    if (mobile) return 440;
    const diagramWidth = Math.max(440, cardWidth - (mobile ? 20 : 108));
    const diagramHeight = mobile ? 390 : 390;
    const viewHeight = mobile ? 340 : 320;
    return Math.max(440, viewHeight * (diagramWidth / diagramHeight));
  }

  _state(key) {
    const id = this._config.entities?.[key];
    const entity = id ? this._hass?.states?.[id] : undefined;
    return entity && !["unknown", "unavailable", ""].includes(entity.state) ? entity : undefined;
  }

  _number(key, suffix = "", digits = 0) {
    const value = Number(this._state(key)?.state);
    const language = this._hass?.locale?.language || this._hass?.language || "en";
    return Number.isFinite(value) ? `${value.toLocaleString(language, { maximumFractionDigits: digits })}${suffix}` : "—";
  }

  _recoveryValue() {
    const language = this._hass?.locale?.language || this._hass?.language || "en";
    const measured = Number(this._state("heat_recovery")?.state);
    if (Number.isFinite(measured)) {
      this._lastRecovery = measured;
      return `${measured.toLocaleString(language, { maximumFractionDigits: 0 })}%`;
    }
    const outdoor = Number(this._state("outdoor_temperature")?.state);
    const extract = Number(this._state("extract_temperature")?.state);
    const exhaust = Number(this._state("exhaust_temperature")?.state);
    const span = extract - outdoor;
    if ([outdoor, extract, exhaust].every(Number.isFinite) && Math.abs(span) >= 0.1) {
      const estimated = Math.max(0, Math.min(100, (extract - exhaust) / span * 100));
      this._lastRecovery = estimated;
      return `≈${estimated.toLocaleString(language, { maximumFractionDigits: 0 })}%`;
    }
    return Number.isFinite(this._lastRecovery)
      ? `≈${this._lastRecovery.toLocaleString(language, { maximumFractionDigits: 0 })}%`
      : "—";
  }

  _on(key) {
    return ["on", "open", "opening", "true", "active"].includes(String(this._state(key)?.state).toLowerCase());
  }

  _entityValue(key, fallbackSuffix = "", digits = 0) {
    const entity = this._state(key);
    if (!entity) return "—";
    const value = Number(entity.state);
    if (!Number.isFinite(value)) return this._escape(entity.state);
    const language = this._hass?.locale?.language || this._hass?.language || "en";
    const suffix = entity.attributes?.unit_of_measurement || fallbackSuffix;
    return `${value.toLocaleString(language, { maximumFractionDigits: digits })}${suffix ? ` ${suffix}` : ""}`;
  }

  _statusValue(key, active, inactive) {
    return this._state(key) ? (this._on(key) ? active : inactive) : "—";
  }

  _modeLabel() {
    const raw = String(this._state("mode")?.state || "").trim();
    if (!raw) return "—";
    const normalized = raw.toLowerCase().replace(/[ -]+/g, "_");
    const labels = {
      auto_or_scheduled: "Auto / plan",
      auto: "Auto",
      scheduled: "Planlagt",
      manual: "Manuel",
      away: "Ude",
      standby: "Standby",
      summer: "Sommer",
      bypass: "Bypass"
    };
    return labels[normalized] || raw.replace(/_/g, " ");
  }

  _airQualityValue() {
    const state = String(this._state("air_quality")?.state || "").toLowerCase();
    return ({ good: "God", moderate: "Moderat", poor: "Dårlig" })[state] || (state ? this._escape(this._state("air_quality").state) : "—");
  }

  _detail(label, value, stateClass = "", key = "") {
    return `<div class="detail ${stateClass} ${key ? "entity-hit" : ""}"${key ? ` data-key="${key}" tabindex="0"` : ""}><small>${label}</small><strong>${value}</strong></div>`;
  }

  _temperatureColor(key) {
    const value = Number(this._state(key)?.state);
    if (!Number.isFinite(value)) return "#8c9aa8";
    const stops = [[-10,[42,91,201]],[14,[57,125,219]],[22,[235,126,70]],[30,[235,84,61]],[40,[215,48,57]]];
    if (value <= stops[0][0]) return `rgb(${stops[0][1].join(",")})`;
    for (let i = 1; i < stops.length; i++) {
      if (value <= stops[i][0]) {
        const [a, ca] = stops[i - 1], [b, cb] = stops[i], amount = (value - a) / (b - a);
        return `rgb(${ca.map((channel, index) => Math.round(channel + (cb[index] - channel) * amount)).join(",")})`;
      }
    }
    return `rgb(${stops[stops.length - 1][1].join(",")})`;
  }

  _relativeTemperatureColors(keys) {
    const samples = keys.map(key => ({ key, value: Number(this._state(key)?.state) })).filter(sample => Number.isFinite(sample.value));
    if (samples.length < 2) return Object.fromEntries(keys.map(key => [key, this._temperatureColor(key)]));
    const minimum = Math.min(...samples.map(sample => sample.value));
    const maximum = Math.max(...samples.map(sample => sample.value));
    const span = maximum - minimum;
    if (span < .2) return Object.fromEntries(keys.map(key => [key, "rgb(165,180,185)"]));
    const palette = [[24,96,235], [64,185,222], [230,180,80], [230,42,38]];
    const colorFor = value => {
      const position = Math.max(0, Math.min(1, (value - minimum) / span));
      const scaled = position * (palette.length - 1);
      const index = Math.min(palette.length - 2, Math.floor(scaled));
      const amount = scaled - index;
      return `rgb(${palette[index].map((channel, channelIndex) => Math.round(channel + (palette[index + 1][channelIndex] - channel) * amount)).join(",")})`;
    };
    return Object.fromEntries(keys.map(key => {
      const sample = samples.find(item => item.key === key);
      return [key, sample ? colorFor(sample.value) : this._temperatureColor(key)];
    }));
  }

  _escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  _mixTemperatureColor(stops, position) {
    const sorted = [...stops].sort((a, b) => a.offset - b.offset);
    const upperIndex = sorted.findIndex(stop => position <= stop.offset);
    if (upperIndex < 0) return sorted[sorted.length - 1].color;
    if (upperIndex === 0) return sorted[0].color;
    const lower = sorted[upperIndex - 1], upper = sorted[upperIndex];
    const amount = (position - lower.offset) / Math.max(.001, upper.offset - lower.offset);
    const from = lower.color.match(/\d+/g)?.map(Number), to = upper.color.match(/\d+/g)?.map(Number);
    if (!from || !to) return lower.color;
    return `rgb(${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount)).join(",")})`;
  }

  _temperatureLayers(route, path, stops) {
    const segments = 48, overlap = .42;
    return Array.from({ length: segments }, (_, index) => {
      const start = index * 100 / segments;
      const length = 100 / segments + overlap;
      const color = this._mixTemperatureColor(stops, (index + .5) / segments);
      return `<path class="temperature-segment ${route}" pathLength="100" d="${path}" stroke="${color}" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${-start}"/>`;
    }).join("");
  }

  _duct(route, path, rpmKey, temperatureStops) {
    const rpm = Number(this._state(rpmKey)?.state);
    const running = Number.isFinite(rpm) && rpm > 0;
    const duration = Math.max(3.6, Math.min(7.2, 8.1 - rpm / 650));
    // Same phase-continuity trick as the fan-wind animation below: without
    // it, every rebuild recreates these paths and their flow-march
    // animation restarts from stroke-dashoffset:0, which reads as a visible
    // stutter/reset on a card that rebuilds this often. Negative
    // animation-delay resumes at the position it would already be at.
    const phase = -((Date.now() / 1000) % duration);
    return `<g class="duct ${route} ${running ? "running" : ""}" style="--flow-duration:${duration}s">
      <path class="rim" d="${path}"/><path class="shade" d="${path}"/><path class="inner" d="${path}"/>
      ${this._temperatureLayers(route, path, temperatureStops)}
      <path class="seams" d="${path}"/><path class="gloss" d="${path}"/>
      <path class="flow-stream haze" pathLength="100" d="${path}" style="animation-delay:${phase}s"/>
      <path class="flow-stream glow" pathLength="100" d="${path}" style="animation-delay:${phase}s"/>
      <path class="flow-stream pulse" pathLength="100" d="${path}" style="animation-delay:${phase}s"/>
    </g>`;
  }

  _temperature(key, label, x, y, anchor, extraClass = "") {
    return `<g class="temp ${extraClass} entity-hit" data-key="${key}" tabindex="0" transform="translate(${x} ${y})" text-anchor="${anchor}"><text class="label">${label}</text><text class="value" y="24">${this._number(key, "°", 1)}</text></g>`;
  }

  _bindMoreInfo() {
    const open = key => {
      const entityId = this._config.entities?.[key];
      if (!entityId) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
    };
    this.shadowRoot.querySelectorAll("[data-key]").forEach(element => {
      element.addEventListener("click", event => { event.stopPropagation(); open(element.dataset.key); });
      element.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(element.dataset.key); }
      });
    });
    this.shadowRoot.querySelector("[data-open-details]")?.addEventListener("click", event => {
      event.stopPropagation();
      this._openDetailsPopup();
    });
    this.shadowRoot.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      this._select("mode_control", button.dataset.mode);
    }));
    this.shadowRoot.querySelectorAll("[data-level]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      this._select("level_control", button.dataset.level);
    }));
    this.shadowRoot.querySelectorAll("[data-fireplace]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      this._select("fireplace_control", button.dataset.fireplace);
    }));
    this.shadowRoot.querySelectorAll("[data-climate-delta]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      const entity = this._state("afterheat_climate");
      const current = Number(entity?.attributes?.temperature);
      if (!Number.isFinite(current)) return;
      const min = Number(entity.attributes?.min_temp ?? 18), max = Number(entity.attributes?.max_temp ?? 30);
      const temperature = Math.max(min, Math.min(max, current + Number(button.dataset.climateDelta)));
      this._hass?.callService("climate", "set_temperature", { entity_id: entity.entity_id, temperature });
    }));
    this.shadowRoot.querySelectorAll("[data-number-key]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      const key = button.dataset.numberKey, entity = this._state(key);
      const current = Number(entity?.state), step = Number(entity?.attributes?.step ?? 1);
      if (!Number.isFinite(current) || !Number.isFinite(step)) return;
      const min = Number(entity.attributes?.min ?? -Infinity), max = Number(entity.attributes?.max ?? Infinity);
      const value = Math.max(min, Math.min(max, current + step * Number(button.dataset.numberDirection)));
      this._hass?.callService("number", "set_value", { entity_id: entity.entity_id, value });
    }));
  }

  _select(key, option) {
    const entity = this._state(key);
    if (entity) this._hass?.callService("select", "select_option", { entity_id: entity.entity_id, option });
  }

  _modeText() {
    return ({ local_auto: "Auto", smart_auto: "Auto + HA", manual: "Manuel" })[this._state("mode_control")?.state] || "—";
  }

  _masterText() {
    return ({ pi: "Raspberry Pi", hcp4: "HCP4", waiting: "Afventer" })[this._state("active_master")?.state] || "Afventer";
  }

  _controllerPanel() {
    if (!this._config.entities?.active_master) return "";
    const mode = this._state("mode_control")?.state;
    const effective = String(this._state("effective_level")?.state || "—");
    const desired = String(this._state("desired_level")?.state || "—");
    const actualExtract = this._number("extract_fan_percent", "%");
    const actualSupply = this._number("supply_fan_percent", "%");
    const targetExtract = this._number(`profile_${effective}_extract`, "%");
    const targetSupply = this._number(`profile_${effective}_supply`, "%");
    const age = this._number("smart_age", " s", 0);
    const reason = this._entityValue("effective_reason");
    const source = this._entityValue("effective_source");
    const climate = this._state("afterheat_climate");
    const target = Number(climate?.attributes?.temperature);
    const current = Number(climate?.attributes?.current_temperature);
    const heating = climate?.attributes?.hvac_action === "heating";
    const fireplace = this._state("fireplace_control")?.state || "Slukket";
    const profileRows = Array.from({ length: 6 }, (_, index) => {
      const level = index + 1;
      return `<div class="profile-row"><b>${level}${level === 6 ? " · BOOST" : ""}</b>${this._numberControl(`profile_${level}_extract`, "Udsug")}${this._numberControl(`profile_${level}_supply`, "Indblæs")}</div>`;
    }).join("");
    const settingKeys = [
      ["rh_setpoint", "RH setpunkt"], ["rh_hysteresis", "RH hysterese"],
      ["co2_setpoint", "CO₂ setpunkt"], ["co2_hysteresis", "CO₂ hysterese"],
      ["auto_normal", "Normalniveau"], ["downshift", "Nedregulering"],
      ["boost_hold", "Boost hold"], ["rh_step", "RH trin"],
      ["co2_step", "CO₂ trin"], ["ha_timeout", "HA timeout"]
    ];
    return `<section class="controller-panel">
      <div class="status-strip">
        <div><small>MODE</small><strong>${this._modeText()}</strong></div>
        <div><small>MASTER</small><strong>${this._masterText()}</strong></div>
        <div><small>RS485</small><strong class="${this._on("rs485_healthy") ? "good-text" : "bad-text"}">${this._statusValue("rs485_healthy", "OK", "Fejl")}</strong></div>
        <div><small>SMART INPUT</small><strong>${age}</strong></div>
      </div>
      <div class="control-grid">
        <div class="control-block"><small>DAGLIG STYRING</small><div class="segmented mode-buttons">
          ${[["local_auto","AUTO"],["smart_auto","AUTO + HA"],["manual","MANUEL"]].map(([value,label]) => `<button data-mode="${value}" class="${mode === value ? "active" : ""}">${label}</button>`).join("")}
        </div><div class="segmented level-buttons">${Array.from({ length: 6 }, (_, index) => { const level = String(index + 1); return `<button data-level="${level}" class="${effective === level ? "active" : ""}">${level === "6" ? "6 BOOST" : level}</button>`; }).join("")}</div></div>
        <div class="state-block"><div><small>PI DESIRED</small><strong>${desired}</strong></div><div><small>EFFECTIVE</small><strong>${effective} · ${this._escape(source)}</strong></div><div><small>TARGET PROFILE</small><strong>${targetExtract} / ${targetSupply}</strong></div><div><small>ACTUAL FAN</small><strong>${actualExtract} / ${actualSupply}</strong></div><div><small>RPM</small><strong>${this._number("extract_fan_rpm")} / ${this._number("supply_fan_rpm")}</strong></div></div>
      </div>
      <div class="reason"><small>EFFEKTIV ÅRSAG</small><strong>${this._escape(reason)}</strong></div>
      <div class="feature-grid">
        <div class="feature"><small>SMART AUTO</small><div class="smart-grid"><span>Højeste CO₂ <b>${this._number("highest_co2", " ppm")} · ${this._entityValue("highest_co2_room")}</b></span><span>Højeste RH <b>${this._number("highest_rh", "%", 1)} · ${this._entityValue("highest_rh_room")}</b></span><span>Styrende rum <b>${this._entityValue("controlling_room")}</b></span></div></div>
        <div class="feature"><small>EFTERVARME</small><div class="climate-control"><button data-climate-delta="-1">−</button><div><b>${Number.isFinite(target) ? `${target.toLocaleString("da-DK")}°` : "—"}</b><span>${Number.isFinite(current) ? `${current.toLocaleString("da-DK", { maximumFractionDigits: 1 })}°` : "—"} · ${heating ? "Varmer" : "Inaktiv"}</span></div><button data-climate-delta="1">+</button></div><div class="subline">Ventil ${this._number("afterheat_valve", "%")} · før ${this._number("afterheat_before", "°", 1)} · frost ${this._number("afterheat_frost", "°", 1)}</div></div>
        <div class="feature"><small>PEJS</small><div class="segmented fireplace-buttons">${[["Slukket","FRA"],["15 min","15 MIN"],["30 min","30 MIN"]].map(([value,label]) => `<button data-fireplace="${value}" class="${fireplace === value ? "active" : ""}">${label}</button>`).join("")}</div><div class="subline">Resterende ${this._number("fireplace_remaining", " s")}</div></div>
      </div>
      <details class="advanced"><summary>Avanceret · profiler og Auto-indstillinger</summary><div class="advanced-grid"><div><h3>Fanprofiler</h3>${profileRows}</div><div><h3>Auto-indstillinger</h3>${settingKeys.map(([key,label]) => this._numberControl(key,label)).join("")}</div></div></details>
    </section>`;
  }

  _numberControl(key, label) {
    return `<div class="number-control"><span>${label}</span><button data-number-key="${key}" data-number-direction="-1">−</button><b>${this._entityValue(key)}</b><button data-number-key="${key}" data-number-direction="1">+</button></div>`;
  }

  _openDetailsPopup() {
    if (!Object.keys(this._config.details_entities || {}).length) return;
    this._closeDetailsPopup();
    const backdrop = document.createElement("div");
    // Padding keeps the dialog clear of the OS status bar / notch: without it
    // the panel reaches the very top of the viewport on mobile and the close
    // button ends up underneath the clock. env() covers notched devices; the
    // max() floor covers webviews that report no safe-area inset at all.
    backdrop.style.cssText = "position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding-top:max(calc(env(safe-area-inset-top,0px) + 12px),48px);padding-bottom:max(calc(env(safe-area-inset-bottom,0px) + 12px),16px);padding-left:calc(env(safe-area-inset-left,0px) + 8px);padding-right:calc(env(safe-area-inset-right,0px) + 8px);background:rgba(5,9,15,.68);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)";
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", `${this._config.details_title || "Detaljer"}`);
    panel.tabIndex = -1;
    // The panel itself must never scroll: the close button is absolutely
    // positioned against it, so if the panel were the scroll container the
    // button would scroll out of reach on tall content. Only `host` scrolls.
    panel.style.cssText = "position:relative;display:flex;flex-direction:column;width:min(100%,900px);max-height:100%;overflow:hidden;border-radius:24px;box-shadow:0 28px 80px rgba(0,0,0,.58);outline:none";
    const closeBtn = document.createElement("button");
    closeBtn.setAttribute("aria-label", "Luk popup");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = "position:absolute;top:12px;right:12px;z-index:20;min-width:40px;min-height:40px;border:1px solid rgba(255,255,255,.22);border-radius:50%;background:rgba(10,14,20,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#fff;font-size:20px;line-height:1;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.45)";
    closeBtn.addEventListener("click", () => this._closeDetailsPopup());
    const host = document.createElement("div");
    host.style.cssText = "flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch";
    panel.appendChild(closeBtn);
    panel.appendChild(host);
    backdrop.appendChild(panel);
    backdrop.addEventListener("click", event => { if (event.target === backdrop) this._closeDetailsPopup(); });
    this._escapeHandler = event => { if (event.key === "Escape") this._closeDetailsPopup(); };
    document.addEventListener("keydown", this._escapeHandler);
    this._bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.appendChild(backdrop);
    this._detailsPopupEl = backdrop;
    panel.focus();
    this._mountDetailsCard(host, backdrop);
  }

  async _mountDetailsCard(host, backdrop) {
    const tag = "ha-ventilation-details-card";
    const showError = message => {
      host.innerHTML = `<div style="padding:22px;color:#fca5a5;background:#3a1416;border-radius:16px;font:13px/1.5 -apple-system,sans-serif;white-space:pre-wrap">${this._escape(message)}</div>`;
    };
    // Same tag ships from this very file, but the popup must not assume that:
    // waiting on whenDefined() instead of a synchronous get() keeps it correct
    // no matter when the module finishes evaluating. The timeout only exists so
    // a genuinely missing resource reports something actionable.
    if (!customElements.get(tag)) {
      host.innerHTML = `<div style="padding:22px;color:var(--secondary-text-color,#9ba9b7);font:13px/1.5 -apple-system,sans-serif">Indlæser ${this._escape(tag)}…</div>`;
      let timeoutId;
      try {
        await Promise.race([
          customElements.whenDefined(tag),
          new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error("timeout")), 10000); })
        ]);
      } catch {
        showError(`Kortet "${tag}" blev ikke indlæst.\nTjek at ressourcen ha-ventilation-card.js er registreret under Indstillinger → Dashboards → Ressourcer.`);
        console.error(`HA Ventilation Card: custom element "${tag}" never got defined`);
        return;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    if (this._detailsPopupEl !== backdrop) return;
    let card;
    try {
      card = document.createElement(tag);
      card.setConfig({ title: this._config.details_title || "Detaljer", entities: { ...this._config.entities, ...this._config.details_entities } });
    } catch (error) {
      showError(`Fejl i ${tag}:\n${error?.message || error}`);
      console.error(`HA Ventilation Card: ${tag} setConfig() threw`, error);
      return;
    }
    if (this._detailsPopupEl !== backdrop) return;
    card.hass = this._hass;
    host.replaceChildren(card);
    this._detailsPopupCard = card;
  }

  _closeDetailsPopup() {
    this._detailsPopupEl?.remove();
    this._detailsPopupEl = undefined;
    this._detailsPopupCard = undefined;
    if (this._bodyOverflow !== undefined) document.body.style.overflow = this._bodyOverflow;
    this._bodyOverflow = undefined;
    if (this._escapeHandler) document.removeEventListener("keydown", this._escapeHandler);
    this._escapeHandler = undefined;
  }

  async _mountOverviewHistory() {
    this._historyCards = [];
    if (this._config.show_history !== true || !window.loadCardHelpers) return;
    const mountId = ++this._historyMountId;
    const helpers = await window.loadCardHelpers();
    const definitions = {
      temperatures: [
        ["outdoor_temperature", "Ude", "#42a5f5"], ["supply_temperature", "Indblæsning", "#f59e0b"],
        ["extract_temperature", "Udsugning", "#00bfa5"], ["exhaust_temperature", "Afkast", "#ab47bc"]
      ],
      co2: [["co2", "CO₂", "#22c55e"]],
      recovery: [["heat_recovery", "Genvindingsgrad", "#26c6da"]]
    };
    for (const [name, series] of Object.entries(definitions)) {
      if (mountId !== this._historyMountId) return;
      const target = this.shadowRoot.querySelector(`[data-overview-history="${name}"]`);
      const entities = series.map(([key, label, color]) => ({ entity: this._config.entities?.[key], name: label, color })).filter(item => item.entity);
      if (!target || !entities.length) continue;
      const compact = name !== "temperatures";
      const card = await helpers.createCardElement({ type: "custom:mini-graph-card", name: name === "temperatures" ? "Temperaturer" : name === "co2" ? "CO₂" : "Varmegenvinding", entities, hours_to_show: 24, points_per_hour: 2, line_width: 3, height: compact ? 122 : 165, font_size: 68, animate: false, hour24: true, show: { icon: false, name: true, state: true, legend: !compact, labels: false, points: false, fill: compact ? true : "fade" } });
      if (mountId !== this._historyMountId || !target.isConnected) return;
      card.hass = this._hass;
      target.replaceChildren(card);
      this._historyCards.push(card);
    }
  }

  _render(signature = "") {
    if (!this.shadowRoot) return;
    this._signature = signature;
    const bypass = this._on("bypass");
    const afterheat = this._config.show_afterheat === true;
    const showAfterheatValues = afterheat && !bypass;
    const heating = this._on("afterheat_active");
    const supplyKey = afterheat && !bypass && this._config.entities?.afterheat_after ? "afterheat_after" : "supply_temperature";
    const supplyRunning = Number(this._state("supply_fan_rpm")?.state) > 0;
    const extractRunning = Number(this._state("extract_fan_rpm")?.state) > 0;
    const cardWidth = this.getBoundingClientRect?.().width || 0;
    const mobile = cardWidth > 0 ? cardWidth < 700 : window.matchMedia?.("(max-width: 700px)")?.matches === true;
    const viewWidth = this._viewWidth || this._responsiveViewWidth();
    const viewHeight = mobile ? 370 : 320;
    const scaleX = viewWidth / 440;
    const centerX = 194 * scaleX;
    const right = viewWidth - 24;
    const top = mobile ? 158 : 140;
    const bottom = mobile ? 242 : 220;
    const centerY = (top + bottom) / 2;
    const coreOffsetY = centerY - 144;
    const topTemperatureY = mobile ? 94 : 82;
    // Keep the three lower readings visually tied to the lower duct instead
    // of floating at the bottom of the house. Their shared baseline moves by
    // half of the former pipe-to-label gap at each responsive size.
    const bottomTemperatureY = mobile ? 273 : 244;
    const cold = bypass
      ? `M24 ${top} H${right}`
      : `M24 ${top} H${centerX - 61} C${centerX - 50} ${top} ${centerX - 43} ${centerY - 33} ${centerX - 35} ${centerY - 27} L${centerX + 35} ${centerY + 27} C${centerX + 43} ${centerY + 33} ${centerX + 50} ${bottom} ${centerX + 61} ${bottom} H${right}`;
    const warm = bypass
      ? `M${right} ${bottom} H24`
      : `M${right} ${top} H${centerX + 61} C${centerX + 50} ${top} ${centerX + 43} ${centerY - 33} ${centerX + 35} ${centerY - 27} L${centerX - 35} ${centerY + 27} C${centerX - 43} ${centerY + 33} ${centerX - 50} ${bottom} ${centerX - 61} ${bottom} H24`;
    const temperatureColors = this._relativeTemperatureColors(["outdoor_temperature", "supply_temperature", supplyKey, "extract_temperature", "exhaust_temperature"]);
    const supplyStart = temperatureColors.outdoor_temperature;
    const supplyMiddle = temperatureColors.supply_temperature;
    const supplyEnd = temperatureColors[supplyKey];
    const extract = temperatureColors.extract_temperature;
    const exhaust = temperatureColors.exhaust_temperature;
    const mode = this._modeLabel();
    const level = String(this._state("level")?.state || "—").replace(/^level_/, "");
    const flow = Number(this._state("water_flow")?.state), waterReturn = Number(this._state("water_return")?.state);
    const measuredDelta = Number(this._state("water_delta")?.state);
    const deltaValue = Number.isFinite(measuredDelta) ? measuredDelta : Number.isFinite(flow) && Number.isFinite(waterReturn) ? flow - waterReturn : NaN;
    const delta = Number.isFinite(deltaValue) ? `${deltaValue.toLocaleString(undefined, { maximumFractionDigits: 1 })}°` : "—";
    // Treat both readings and the heater as one responsive group. Labels keep
    // a safe inset at narrow widths, the heater always sits at their exact
    // midpoint, and its box grows only while there is room around it.
    const afterheatSpan = right - centerX;
    const afterheatReadingGap = Math.max(76, Math.min(126, afterheatSpan * .24));
    const rightTemperatureX = viewWidth - (mobile ? 48 : 58);
    const afterHeatX = rightTemperatureX;
    const coilX = afterHeatX - afterheatReadingGap;
    const beforeHeatX = coilX - afterheatReadingGap;
    const coilWidth = Math.max(92, Math.min(136, (afterHeatX - beforeHeatX) * .72));
    const coilHeight = Math.max(46, Math.min(58, coilWidth * .44));
    const coilBottom = bottomTemperatureY - (mobile ? 27 : 18);
    const coilTop = coilBottom - coilHeight;
    const coilLeft = coilX - coilWidth / 2;
    const coilRadius = Math.min(11, coilHeight * .2);
    const coilFlowX = coilX - coilWidth * .25;
    const coilReturnX = coilX + coilWidth * .25;
    const coilLabelY = coilTop + coilHeight * .34;
    const coilValueY = coilTop + coilHeight * .76;
    const alarmActive = this._on("alarm");
    const fanAnimationDelay = -((Date.now() / 1000) % 2.8);
    // Everything below the current sensor readings (paths, transforms,
    // viewBox) is driven entirely by these -- unchanged between two
    // renders means the new markup is byte-identical in *shape*, just
    // different numbers/colors in the same slots, safe to morph in place
    // instead of rebuilding. Changed means an actually different diagram
    // (bypass open/closed swaps duct routing, coil show/hide, mobile
    // breakpoint, a real resize) -- or a fan/coil actually starting or
    // stopping. That last one isn't a *shape* change in the geometric
    // sense, but it's included deliberately: a freshly-added "running"/
    // "active" class reliably starts its CSS animation only when the
    // element carrying it is created with the class already present (a
    // full rebuild), not when the class lands via setAttribute on an
    // already-connected element (tried forcing that to work with a
    // reflow, on- and off-thread; neither reliably started the animation
    // on iOS Safari, and the synchronous version reintroduced the
    // scroll-to-top this whole rewrite exists to fix). Fan/coil state
    // changes a few times a day, not several times a second like every
    // other value here, so routing just those through a full rebuild is
    // a fair trade for animations that reliably work.
    const shapeKey = `${bypass}:${showAfterheatValues}:${this._config.show_history === true}:${mobile}:${viewWidth}:${supplyRunning}:${extractRunning}:${heating}`;

    const history = this._config.show_history === true ? `<section class="overview-history" aria-label="Ventilationshistorik"><div class="history-heading"><div><small>HISTORIK</small><h3>Seneste 24 timer</h3></div><span>Live udvikling</span></div><div class="overview-history-grid"><div class="history-slot wide" data-preserve-children data-overview-history="temperatures"></div><div class="history-slot compact" data-preserve-children data-overview-history="co2"></div><div class="history-slot compact" data-preserve-children data-overview-history="recovery"></div></div></section>` : "";

    const html = `<style>${this._styles()}</style><style>${this._controllerStyles()}</style><style>${this._responsiveStyles()}</style><ha-card class="${bypass ? "bypass " : ""}${this._config.show_history === true ? "with-history" : ""}">
      <header><div><small>VENTILATION</small><h2>${this._escape(this._config.title)}</h2></div><div class="header-actions">${Object.keys(this._config.details_entities || {}).length ? `<button class="details-btn" data-open-details><ha-icon icon="mdi:tune-variant"></ha-icon>${this._escape(this._config.details_title || "Detaljer")}</button>` : ""}<span class="entity-hit" data-key="mode" tabindex="0">${this._escape(mode)}</span></div></header>
      <div class="body"><aside class="left">
        <div class="entity-hit ${bypass ? "info" : ""}" data-key="bypass" tabindex="0"><strong>${this._statusValue("bypass", "Åben", "Lukket")}</strong><small>Bypass</small></div>
        <div class="entity-hit" data-key="air_quality" tabindex="0"><strong>${this._airQualityValue()}</strong><small>Luftkvalitet</small></div>
        <div class="entity-hit" data-key="heat_transfer" tabindex="0"><strong>${this._entityValue("heat_transfer", "W")}</strong><small>Varmeoverførsel</small></div>
        <div class="entity-hit ${alarmActive ? "danger" : this._state("alarm") ? "ok" : ""}" data-key="alarm" tabindex="0"><strong>${this._state("alarm") ? (alarmActive ? "Alarm" : "OK") : "—"}</strong><small>Alarm</small></div>
      </aside><div class="diagram"><svg viewBox="0 0 ${viewWidth} ${viewHeight}" role="img" aria-label="Ventilation airflow">
        <defs>
          <linearGradient id="${this._id}-cold" gradientUnits="userSpaceOnUse" x1="24" x2="${right}"><stop offset="0" stop-color="${supplyStart}"/><stop offset=".53" stop-color="${supplyMiddle}"/><stop offset="1" stop-color="${supplyEnd}"/></linearGradient>
          <linearGradient id="${this._id}-warm" gradientUnits="userSpaceOnUse" x1="24" x2="${right}"><stop offset="0" stop-color="${exhaust}"/><stop offset=".47" stop-color="${exhaust}"/><stop offset="1" stop-color="${extract}"/></linearGradient>
        </defs>
        <path class="house" d="M${112 * scaleX} ${mobile ? 72 : 60} L${273 * scaleX} 2 L${436 * scaleX} ${mobile ? 72 : 60} V${viewHeight - 7} H${112 * scaleX} Z"/>
        <text class="zone" x="14" y="${mobile ? 61 : 54}">UDE</text><text class="zone" x="${273 * scaleX}" y="${mobile ? 43 : 43}" text-anchor="middle">INDE</text>
        <g class="climate" transform="translate(${273 * scaleX} ${mobile ? 69 : 64})" text-anchor="middle"><g class="entity-hit" data-key="room_temperature" tabindex="0"><text x="-35">Rum</text><text class="climate-value" x="-35" y="19">${this._number("room_temperature", "°", 1)}</text></g><path d="M0 -4 V22"/><g class="entity-hit" data-key="humidity" tabindex="0"><text x="35">Fugt</text><text class="climate-value" x="35" y="19">${this._number("humidity", "%")}</text></g></g>
        ${this._duct("cold", cold, "supply_fan_rpm", heating ? [{ offset: 0, color: supplyStart }, { offset: .43, color: supplyStart }, { offset: .60, color: supplyMiddle }, { offset: .77, color: supplyMiddle }, { offset: .90, color: supplyEnd }, { offset: 1, color: supplyEnd }] : [{ offset: 0, color: supplyStart }, { offset: .43, color: supplyStart }, { offset: .60, color: supplyMiddle }, { offset: 1, color: supplyMiddle }])}${this._duct("warm", warm, "extract_fan_rpm", [{ offset: 0, color: extract }, { offset: .43, color: extract }, { offset: .60, color: exhaust }, { offset: 1, color: exhaust }])}
        <path class="core" transform="translate(${centerX - 194} ${coreOffsetY})" d="M194 96 L242 144 194 192 146 144Z"/><path class="fin" transform="translate(${centerX - 194} ${coreOffsetY})" d="M165 132 L181 116 M207 172 L223 156"/>
        <g class="core-label entity-hit" data-key="heat_recovery" tabindex="0" transform="translate(${centerX} ${centerY})" text-anchor="middle"><text class="core-value" y="-2">${bypass ? "—" : this._recoveryValue()}</text><text class="core-caption" y="11">Genvinding</text></g>
        <g class="fan supply entity-hit" data-key="supply_fan_percent" tabindex="0" transform="translate(${86 * scaleX} ${top})"><text y="-27" text-anchor="middle">${this._number("supply_fan_percent", "%")}</text><rect x="-9" y="-21" width="18" height="42" rx="8"/><ellipse cx="4" cy="0" rx="3" ry="15"/></g>
        <g transform="translate(${86 * scaleX} ${top})"><g class="fan-wind supply ${supplyRunning ? "running" : ""}" style="stroke:${this._temperatureColor("outdoor_temperature")};animation-delay:${fanAnimationDelay}s"><path d="M11 -7 C23 -7 24 -14 35 -14"/><path d="M11 0 H43"/><path d="M11 7 C23 7 26 14 37 14"/></g></g>
        <g class="fan extract entity-hit" data-key="extract_fan_percent" tabindex="0" transform="translate(${86 * scaleX} ${bottom})"><text y="-27" text-anchor="middle">${this._number("extract_fan_percent", "%")}</text><rect x="-9" y="-21" width="18" height="42" rx="8"/><ellipse cx="-4" cy="0" rx="3" ry="15"/></g>
        <g transform="translate(${86 * scaleX} ${bottom})"><g class="fan-wind extract ${extractRunning ? "running" : ""}" style="stroke:${this._temperatureColor("exhaust_temperature")};animation-delay:${fanAnimationDelay}s"><path d="M-11 -7 C-23 -7 -24 -14 -35 -14"/><path d="M-11 0 H-43"/><path d="M-11 7 C-23 7 -26 14 -37 14"/></g></g>
        ${showAfterheatValues ? `<g class="coil ${heating ? "active" : ""}"><text class="entity-hit" data-key="water_delta" tabindex="0" x="${coilX}" y="${coilTop - 10}" text-anchor="middle">ΔT ${delta}</text><rect class="glow" x="${coilLeft - 2}" y="${coilTop - 2}" width="${coilWidth + 4}" height="${coilHeight + 4}" rx="${coilRadius + 2}"/><rect class="face" x="${coilLeft}" y="${coilTop}" width="${coilWidth}" height="${coilHeight}" rx="${coilRadius}"/><path d="M${coilX} ${coilTop + 7} V${coilBottom - 7}"/><g class="entity-hit" data-key="water_flow" tabindex="0"><text class="small" x="${coilFlowX}" y="${coilLabelY}" text-anchor="middle">Fremløb</text><text class="coil-value" x="${coilFlowX}" y="${coilValueY}" text-anchor="middle">${this._number("water_flow", "°", 1)}</text></g><g class="entity-hit" data-key="water_return" tabindex="0"><text class="small" x="${coilReturnX}" y="${coilLabelY}" text-anchor="middle">Retur</text><text class="coil-value" x="${coilReturnX}" y="${coilValueY}" text-anchor="middle">${this._number("water_return", "°", 1)}</text></g></g>` : ""}
        ${this._temperature("outdoor_temperature", "Udeluft", 14, topTemperatureY, "start")}${this._temperature(bypass ? supplyKey : "extract_temperature", bypass ? "Indblæsning" : "Udsugning", rightTemperatureX, topTemperatureY, "middle")}${this._temperature("exhaust_temperature", "Afkast", 14, bottomTemperatureY, "start")}${showAfterheatValues && this._config.entities?.afterheat_before ? this._temperature("afterheat_before", "Før", beforeHeatX, bottomTemperatureY, "middle", "afterheat-reading") : ""}${this._temperature(bypass ? "extract_temperature" : supplyKey, bypass ? "Udsugning" : showAfterheatValues ? "Efter" : "Indblæsning", showAfterheatValues ? afterHeatX : rightTemperatureX, bottomTemperatureY, "middle", showAfterheatValues ? "afterheat-reading" : "")}
      </svg></div><aside class="right"><div class="entity-hit" data-key="co2" tabindex="0"><strong>${this._number("co2")}</strong><small>CO₂ · ppm</small></div><div class="entity-hit" data-key="level" tabindex="0"><strong>${this._escape(level)}</strong><small>Ventilatortrin</small></div><div class="entity-hit" data-key="power" tabindex="0"><strong>${this._number("power", " W")}</strong><small>Effekt</small></div><div class="entity-hit" data-key="filter_days" tabindex="0"><strong>${this._number("filter_days", " d")}</strong><small>Filter tilbage</small></div></aside></div>${history}${this._controllerPanel()}
    </ha-card>`;

    if (this._shapeKey !== shapeKey || !this.shadowRoot.firstElementChild) {
      this._shapeKey = shapeKey;
      this.shadowRoot.innerHTML = html;
      this._bindMoreInfo();
      this._mountOverviewHistory();
    } else {
      // shapeKey already covers every fan/coil running-state transition
      // (see above), so reaching this branch means running/active classes
      // are identical before and after -- nothing here needs to start or
      // restart an animation, only patch values, so there is nothing to
      // force a reflow for.
      const template = document.createElement("template");
      template.innerHTML = html;
      const oldNodes = Array.from(this.shadowRoot.childNodes);
      const newNodes = Array.from(template.content.childNodes);
      const max = Math.max(oldNodes.length, newNodes.length);
      for (let i = 0; i < max; i += 1) {
        const oldNode = oldNodes[i], newNode = newNodes[i];
        if (!newNode) { oldNode.remove(); continue; }
        if (!oldNode) { this.shadowRoot.appendChild(newNode.cloneNode(true)); continue; }
        morphNode(oldNode, newNode);
      }
      // Existing nodes keep their already-wired more-info listeners; only a
      // full rebuild above needs a fresh _bindMoreInfo() pass.
    }
  }

  _styles() {
    return `:host{display:block}ha-card{display:block;box-sizing:border-box;min-height:465px;padding:12px 14px;overflow:hidden;background:none;color:var(--primary-text-color);border:0;border-radius:0;box-shadow:none}header{display:flex;align-items:center;justify-content:space-between;gap:8px}header small{display:block;font-size:9px;letter-spacing:.15em;color:var(--secondary-text-color)}h2{margin:2px 0 0;font-size:20px}.header-actions{display:flex;align-items:center;gap:6px}header span{max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid color-mix(in srgb,var(--success-color,#59cbaa) 30%,transparent);border-radius:20px;padding:5px 9px;color:var(--success-color,#81d7bd);font-size:11px}.details-btn{display:flex;align-items:center;gap:4px;border:1px solid var(--dashboard-border-neutral,color-mix(in srgb,var(--primary-text-color) 14%,transparent));border-radius:20px;background:transparent;color:var(--secondary-text-color);font:inherit;font-size:11px;font-weight:700;padding:5px 10px 5px 8px;cursor:pointer}.details-btn ha-icon{--mdc-icon-size:14px}.details-btn:hover{color:var(--primary-text-color)}.body{display:grid;grid-template-columns:72px minmax(0,1fr) 72px;grid-template-areas:"left diagram right";gap:8px;height:340px}.diagram{min-width:0;position:relative;grid-area:diagram}.diagram svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.house{fill:#f2994a14;stroke:#86afc244;stroke-width:1.3}.zone{font-size:10px;font-weight:600;letter-spacing:1.5px;fill:var(--secondary-text-color)}.climate{font-size:9px;fill:var(--secondary-text-color)}.climate path{stroke:#ffffff24}.climate-value{font-size:17px;font-weight:500;fill:var(--primary-text-color)}.rim{fill:none;stroke:#8295a5;stroke-width:22;opacity:.7}.shade{fill:none;stroke:#0d151c;stroke-width:20;opacity:.55}.inner{fill:none;stroke:#1d2b36;stroke-width:18}.temperature-segment{fill:none;stroke-width:15;opacity:.76;stroke-linecap:butt}.seams{fill:none;stroke:#ffffff14;stroke-width:21;stroke-dasharray:1.6 15;stroke-linecap:butt;pointer-events:none}.gloss{fill:none;stroke:#ffffff1c;stroke-width:5;stroke-linecap:round;filter:blur(1.5px);pointer-events:none}.core-label{pointer-events:auto}.core-value{font-size:14px;font-weight:650;fill:var(--primary-text-color)}.core-caption{font-size:6px;letter-spacing:.04em;fill:var(--secondary-text-color)}.flow-stream{display:none;fill:none;stroke-linecap:round;pointer-events:none}.running .flow-stream{display:inline;animation-timing-function:linear;animation-iteration-count:infinite}.flow-stream.haze{stroke:#ffffff12;stroke-width:13;stroke-dasharray:16 38;filter:blur(4px);animation-name:flow-54;animation-duration:calc(var(--flow-duration,5.5s)*1.9)}.flow-stream.glow{stroke:#ffffff2b;stroke-width:6.5;stroke-dasharray:5 19;filter:blur(2px);animation-name:flow-24;animation-duration:calc(var(--flow-duration,5.5s)*1.3)}.flow-stream.pulse{stroke:#ffffffe6;stroke-width:2.6;stroke-dasharray:1.6 10.4;filter:drop-shadow(0 0 2.5px #ffffffaa);animation-name:flow-12;animation-duration:var(--flow-duration,5.5s)}.core{fill:#192531;stroke:#7c9aad;stroke-width:1.5}.fin{fill:none;stroke:#86afc2;opacity:.6}.bypass .core,.bypass .fin{opacity:.3}.fan rect{fill:#1b2935;stroke:#89a8b9}.fan ellipse{fill:#0c1822}.fan text{font-size:12px;fill:var(--primary-text-color)}.fan-wind{fill:none;stroke-width:1.5;stroke-linecap:round;opacity:0;will-change:transform,opacity}.fan-wind.running.supply{animation:wind-supply 2.8s linear infinite}.fan-wind.running.extract{animation:wind-extract 2.8s linear infinite}.temp .label{font-size:11px;fill:var(--secondary-text-color)}.temp .value{font-size:24px;font-weight:600}.temp.afterheat-reading .value{font-size:20px}.coil text{font-size:12px;fill:var(--primary-text-color)}.coil .face{fill:#222c38;stroke:#ad927877}.coil .face,.coil path,.coil text{transition:opacity .45s ease,filter .45s ease,stroke .45s ease}.coil:not(.active) .face,.coil:not(.active) path{opacity:.24}.coil:not(.active) text{opacity:.38}.coil.active .face{stroke:#ff6655;filter:drop-shadow(0 0 5px #ff4f3f)}.coil .glow{fill:#ff4f3f;filter:blur(9px);opacity:0}.coil.active .glow{animation:afterheat-glow 2.4s ease-in-out infinite;opacity:.58}.coil path{stroke:#ffffff25}.coil.active path{stroke:#ffb0a2aa}.coil .small{font-size:9px;fill:var(--secondary-text-color)}.coil .coil-value{font-size:17px;font-weight:600}aside{display:grid;grid-template-rows:repeat(4,1fr)}aside.right{grid-area:right;border-left:1px solid #ffffff12}aside.left{grid-area:left;border-right:1px solid #ffffff12}aside div{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:3px;min-width:0}aside strong,aside small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}aside strong{font-size:15px;font-weight:500}aside small{font-size:8px;color:var(--secondary-text-color)}aside div.info strong{color:#69cfe8}aside div.ok strong{color:var(--success-color,#73d2ae)}aside div.danger strong{color:#f08383}@keyframes flow-12{from{stroke-dashoffset:0}to{stroke-dashoffset:-12}}@keyframes flow-24{from{stroke-dashoffset:0}to{stroke-dashoffset:-24}}@keyframes flow-54{from{stroke-dashoffset:0}to{stroke-dashoffset:-54}}@keyframes pulse{0%,100%{opacity:.12}50%{opacity:.4}}@keyframes afterheat-glow{0%,100%{opacity:.38}50%{opacity:.82}}@keyframes wind-supply{0%{transform:translateX(0);opacity:0}12%{opacity:.82}88%{opacity:.82}100%{transform:translateX(14px);opacity:0}}@keyframes wind-extract{0%{transform:translateX(0);opacity:0}12%{opacity:.82}88%{opacity:.82}100%{transform:translateX(-14px);opacity:0}}${this._config.animation === false ? ".air,.flow-stream,.fan-wind{display:none!important}.coil .glow{animation:none!important}" : ""}@media(prefers-reduced-motion:reduce){.air,.flow-stream,.fan-wind{display:none!important}.coil .glow{animation:none!important}}@media(max-width:500px){ha-card{min-height:460px;padding:10px 7px}.body{grid-template-columns:62px minmax(0,1fr) 62px;height:310px}.temp .value{font-size:20px}}`;
  }

  _controllerStyles() {
    return `.controller-panel{margin:12px 0 8px;padding:12px;border:1px solid var(--dashboard-border-neutral,#ffffff16);border-radius:18px;background:color-mix(in srgb,var(--primary-text-color) 3%,transparent)}.status-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.status-strip>div,.state-block>div{padding:9px 10px;border-radius:12px;background:#ffffff08;min-width:0}.controller-panel small{display:block;color:var(--secondary-text-color);font-size:8px;letter-spacing:.12em}.controller-panel strong{display:block;margin-top:3px;font-size:13px;overflow:hidden;text-overflow:ellipsis}.good-text{color:var(--success-color,#73d2ae)}.bad-text{color:var(--error-color,#ef7777)}.control-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,1fr);gap:10px;margin-top:10px}.control-block,.state-block,.feature,.reason{border:1px solid #ffffff0e;border-radius:14px;padding:10px;background:#0000000a}.segmented{display:flex;gap:5px;margin-top:7px}.segmented button,.climate-control button,.number-control button{appearance:none;border:1px solid #ffffff18;border-radius:10px;background:#ffffff08;color:var(--primary-text-color);font:inherit;font-size:11px;font-weight:750;padding:8px 10px;cursor:pointer}.segmented button:hover,.climate-control button:hover,.number-control button:hover{background:#ffffff12}.segmented button.active{border-color:color-mix(in srgb,var(--primary-color,#4aa3ff) 65%,transparent);background:color-mix(in srgb,var(--primary-color,#4aa3ff) 24%,transparent);color:var(--primary-color,#79baff)}.mode-buttons button{flex:1}.level-buttons{display:grid;grid-template-columns:repeat(6,1fr)}.level-buttons button{padding-inline:4px}.state-block{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.state-block>div{padding:6px 8px}.reason{margin-top:10px}.reason strong{white-space:normal}.feature-grid{display:grid;grid-template-columns:1.15fr 1fr .8fr;gap:10px;margin-top:10px}.smart-grid{display:grid;gap:6px;margin-top:8px}.smart-grid span{font-size:10px;color:var(--secondary-text-color)}.smart-grid b{display:block;color:var(--primary-text-color);font-size:12px;margin-top:2px}.climate-control{display:grid;grid-template-columns:38px 1fr 38px;align-items:center;gap:7px;margin-top:7px}.climate-control button{font-size:20px;padding:5px}.climate-control div{text-align:center}.climate-control b{display:block;font-size:22px}.climate-control span,.subline{display:block;margin-top:4px;color:var(--secondary-text-color);font-size:10px}.fireplace-buttons button{flex:1;padding-inline:5px}.advanced{margin-top:10px;border-top:1px solid #ffffff12;padding-top:9px}.advanced summary{cursor:pointer;color:var(--secondary-text-color);font-size:11px;font-weight:700}.advanced-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px}.advanced h3{font-size:12px;margin:0 0 7px}.profile-row{display:grid;grid-template-columns:68px 1fr 1fr;align-items:center;gap:6px;margin-bottom:5px}.profile-row>b{font-size:10px}.number-control{display:grid;grid-template-columns:minmax(72px,1fr) 28px 54px 28px;align-items:center;gap:4px;margin-bottom:5px}.number-control span{font-size:9px;color:var(--secondary-text-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.number-control b{text-align:center;font-size:10px}.number-control button{padding:3px}@media(max-width:700px){.status-strip{grid-template-columns:repeat(2,1fr)}.control-grid,.feature-grid,.advanced-grid{grid-template-columns:1fr}.state-block{grid-template-columns:repeat(2,1fr)}.level-buttons{grid-template-columns:repeat(3,1fr)}.controller-panel{padding:9px;margin-inline:-2px}.feature-grid{gap:7px}}`;
  }

  _responsiveStyles() {
    return `
      :host {
        container-type: inline-size;
        --vent-bg: var(--primary-background-color, #1c1c1c);
        --vent-fg: var(--primary-text-color);
        --vent-muted: var(--secondary-text-color);
        --vent-component: color-mix(in srgb, var(--vent-bg) 91%, var(--vent-fg) 9%);
        --vent-component-strong: color-mix(in srgb, var(--vent-bg) 68%, var(--vent-fg) 32%);
        --vent-line: color-mix(in srgb, var(--vent-fg) 18%, transparent);
      }
      ha-card {
        /* Ingen baggrund her. Denne blok skrives i et <style> EFTER _styles(),
           saa den vandt over background:none deroppe og malede kortets egen
           flade hen over stack-in-card'et - det var det der fik kortene til at
           se ud som om de laa oven paa hinanden. */
        color: var(--vent-fg);
        /* Ingen kant: kortet sidder i en stack-in-card sammen med kort der
           ikke har en, og --vent-line er afledt af --primary-text-color, saa
           den blev til en hvid haarfin ramme om netop dette kort i moerkt tema. */
        border: 0;
      }
      ha-card.with-history { min-height: 680px; }
      /* Was an opaque color-mix off --vent-bg, which resolves to the *page*
         background (--primary-background-color), not the card surface — so this
         block painted a darker rectangle and read as a separate card dropped on
         top. A translucent white overlay sits on whatever surface is beneath,
         which is the pattern ha-radiator-overview-card uses for .hero. */
      .overview-history { margin-top: 10px; padding: 12px; border: 1px solid color-mix(in srgb, var(--vent-fg) 11%, transparent); border-radius: 18px; background: rgba(255, 255, 255, .035); }
      .history-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      .history-heading small { display: block; font-size: 9px; letter-spacing: .15em; color: var(--secondary-text-color); }
      .history-heading h3 { margin: 2px 0 0; font-size: 17px; }
      .history-heading > span { color: var(--success-color, #20e3a2); font-size: 10px; font-weight: 700; }
      .overview-history-grid { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(250px, .85fr); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 8px; }
      /* Transparent so the graphs read as part of this card instead of as
         separate cards stacked on top of it. overflow+radius stay so the
         chart canvas is still clipped to a soft corner. */
      .history-slot { min-width: 0; min-height: 172px; overflow: hidden; border-radius: 13px; background: transparent; }
      .history-slot.wide { grid-row: 1 / span 2; min-height: 352px; }
      .history-slot.compact { min-height: 172px; }
      .history-slot > * { display: block; height: 100%; --ha-card-border-width: 0; --ha-card-box-shadow: none; --ha-card-background: transparent; }
      .temp .value, .climate-value, .coil .coil-value {
        fill: color-mix(in srgb, var(--vent-fg) 78%, var(--vent-bg));
      }
      .temp .label { font-size: 12.5px; }
      .temp .value { font-size: 22px; }
      .climate { font-size: 10px; }
      .climate-value { font-size: 16px; }
      .coil .small { font-size: 10px; }
      .coil .coil-value { font-size: 16px; }
      .house { fill: #f2994a14; stroke: var(--vent-line); }
      .rim { stroke: color-mix(in srgb, var(--vent-fg) 42%, var(--vent-bg)); }
      .inner { stroke: color-mix(in srgb, var(--vent-bg) 54%, var(--vent-fg) 46%); }
      .core, .fan rect, .coil .face { fill: var(--vent-component); stroke: color-mix(in srgb, var(--vent-fg) 38%, transparent); }
      .fan ellipse { fill: var(--vent-component-strong); }
      .fin, .coil path, .climate path { stroke: color-mix(in srgb, var(--vent-fg) 25%, transparent); }
      .entity-hit { cursor: pointer; }
      .entity-hit:focus-visible { outline: 2px solid var(--info-color, #4aa3ff); outline-offset: 2px; }
      @media (max-width: 700px) {
        :host { width: calc(100% + 20px); margin-inline: -10px; max-width: none; }
        ha-card, ha-card.with-history { min-height: 0; padding: 12px 4px; }
        header { padding: 0 9px 6px; }
        header small { font-size: 11px; }
        h2 { font-size: 30px; }
        header span { max-width: 46%; font-size: 12px; padding: 7px 9px; }
        .body {
          grid-template-columns: 1fr;
          grid-template-rows: 380px auto auto;
          grid-template-areas: "diagram" "left" "right";
          gap: 8px;
          height: auto;
        }
        .diagram { min-height: 380px; }
        aside {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          grid-template-rows: auto;
          border: 0;
          border-top: 1px solid var(--vent-line);
          gap: 0;
          padding: 10px 2px 2px;
        }
        aside div { min-width: 0; min-height: 54px; padding: 4px 5px; }
        aside div + div { border-left: 1px solid color-mix(in srgb, var(--vent-fg) 10%, transparent); }
        aside strong { font-size: 18px; line-height: 1; font-weight: 700; letter-spacing: -.02em; white-space: nowrap; }
        aside small { margin-top: 5px; font-size: 10px; line-height: 1.15; text-wrap: balance; }
        .zone { font-size: 13px; }
        .climate { font-size: 13px; }
        .climate-value { font-size: 21px; font-weight: 600; }
        .temp .label { font-size: 15px; }
        .temp .value { font-size: 27px; font-weight: 650; }
        .fan text { font-size: 15px; }
        .coil text { font-size: 15px; }
        .coil .small { font-size: 11px; }
        .coil .coil-value { font-size: 18px; }
        .overview-history { margin-top: 8px; padding: 10px; }
        .overview-history-grid { display: flex; gap: 8px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
        .overview-history-grid::-webkit-scrollbar { display: none; }
        .history-slot, .history-slot.wide, .history-slot.compact { flex: 0 0 84%; min-height: 165px; scroll-snap-align: start; }
      }
    `;
  }
}

class HAVentilationCardEditor extends HTMLElement {
  setConfig(config) { this._config = config || {}; this._render(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; }
  _render() {
    if (!this._config) return;
    this.innerHTML = `<style>:host{display:block;padding:12px}.hint{color:var(--secondary-text-color);font-size:12px;margin:0 0 12px}</style><p class="hint">Alle felter kan ændres. Tomme felter vises som — på kortet.</p><ha-form></ha-form>`;
    this._form = this.querySelector("ha-form"); this._form.hass = this._hass; this._form.data = this._config;
    this._form.schema = [
      { name: "title", selector: { text: {} } },
      { name: "animation", selector: { boolean: {} } },
      { name: "show_afterheat", selector: { boolean: {} } },
      { name: "show_history", label: "Vis historikgrafer i kortet", selector: { boolean: {} } },
      { type: "expandable", name: "entities", title: "Entiteter", schema: ENTITY_FIELDS.map(([name, label]) => ({ name, label, selector: { entity: {} } })) }
    ];
    this._form.computeLabel = s => s.label || s.name;
    this._form.addEventListener("value-changed", e => { this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: e.detail.value }, bubbles: true, composed: true })); });
  }
}

const DETAIL_FIELDS = [
  ["house_temperature","Hustemperatur"],["temperature_delta","Ind/ud delta"],
  ["heat_recovery_status","Varmegenvinding"],["heat_recovery_trend","Udvikling i ydelse"],
  ["fan_control_balance","Styringsbalance"],["fan_speed_balance","Omdrejningsbalance"],
  ["last_filter_change","Seneste filterskift"],["filter_changes","Filterhistorik"],
  ["extract_control","Udsugning styring"],["supply_control","Indblæsning styring"],
  ["extract_speed","Udsugning RPM"],["supply_speed","Indblæsning RPM"],
  ["night_mode","Natdrift"],["fireplace_mode","Pejsefunktion"],["standby","Standby"],
  ["afterheat_setpoint","Indblæsning setpunkt"],["room_setpoint","Rum setpunkt"],
  ["extract_setpoint","Udsugning setpunkt"],["air_before_coil","Luft før varmeflade"],
  ["air_after_coil","Luft efter varmeflade"],["air_delta","Luft delta-T"],
  ["water_flow","Vand fremløb"],["water_return","Vand retur"],["water_delta","Vand delta-T"],
  ["afterheat_active","Eftervarme aktiv"],["hac1_connection","HAC1 forbindelse"],
  ["rs485_traffic","RS485 bustrafik"],["outdoor_source","Udetemperaturkilde"],
  ["rs485_frames","RS485 telegrammer"],["filter_reset","Nulstil filterinterval"]
];

class HAVentilationDetailsCard extends HTMLElement {
  static getStubConfig(){return{title:"Dantherm detaljer",entities:Object.fromEntries(DETAIL_FIELDS.map(([key])=>[key,""]))};}
  static async getConfigElement(){return document.createElement("ha-ventilation-details-card-editor");}
  constructor(){super();this.attachShadow({mode:"open"});this._signature="";this._historyCards=[];this.shadowRoot.addEventListener("click",event=>this._click(event));}
  setConfig(config){if(!config)throw new Error("Ugyldig konfiguration");const next={title:"Dantherm detaljer",...config,entities:{...(config.entities||{})}};const sig=JSON.stringify(next);this._config=next;if(sig===this._configSignature)return;this._configSignature=sig;this._render();}
  set hass(hass){this._hass=hass;const ids=Object.values(this._config?.entities||{}).filter(Boolean);const sig=JSON.stringify(ids.map(id=>[id,hass?.states?.[id]?.state,hass?.states?.[id]?.last_changed]));if(sig!==this._signature){this._signature=sig;this._update();this._historyCards.forEach(card=>card.hass=hass);}}
  getCardSize(){return 9;}
  _state(key){const id=this._config?.entities?.[key];return id?this._hass?.states?.[id]:undefined;}
  _esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
  _metric(key,label,icon){return `<button class="metric" data-more="${key}"><ha-icon class="metric-bg" icon="${icon}"></ha-icon><span class="metric-icon"><ha-icon icon="${icon}"></ha-icon></span><span><small>${label}</small><strong data-value="${key}">—</strong></span></button>`;}
  _section(title,subtitle,icon,content){return `<section><div class="section-title"><ha-icon icon="${icon}"></ha-icon><div><h3>${title}</h3><p>${subtitle}</p></div></div>${content}</section>`;}
  _render(){
    const m=(...args)=>this._metric(...args);
    this.shadowRoot.innerHTML=`<style>${this._styles()}</style><ha-card><header><div><small>DANTHERM HCH</small><h2>${this._esc(this._config.title)}</h2><p>Drift, ydelse, eftervarme og diagnose samlet</p></div><span class="health" data-health>Indlæser…</span></header>
      <nav>${[["overview","mdi:view-dashboard-outline","Overblik"],["fans","mdi:fan","Ventilatorer"],["heat","mdi:radiator","Eftervarme"],["system","mdi:router-network","System"],["history","mdi:chart-line","Historik"]].map(([id,icon,label],i)=>`<button class="${i?"":"active"}" data-tab="${id}"><ha-icon icon="${icon}"></ha-icon>${label}</button>`).join("")}</nav>
      <div class="panel active" data-panel="overview"><div class="sections two">${this._section("Luft og temperatur","Indeklima og temperaturbalance","mdi:home-thermometer-outline",`<div class="metrics">${m("house_temperature","Hustemperatur","mdi:home-thermometer-outline")}${m("temperature_delta","Ind/ud delta","mdi:swap-vertical")}${m("heat_recovery_status","Varmegenvinding","mdi:heat-wave")}${m("heat_recovery_trend","Udvikling","mdi:chart-timeline-variant")}</div>`)}${this._section("Balance og filter","Ydelse og vedligeholdelse","mdi:air-filter",`<div class="metrics">${m("fan_control_balance","Styringsbalance","mdi:fan-chevron-down")}${m("fan_speed_balance","Omdrejningsbalance","mdi:fan-speed-2")}${m("last_filter_change","Seneste filterskift","mdi:air-filter")}${m("filter_changes","Filterhistorik","mdi:history")}</div>`)}</div></div>
      <div class="panel" data-panel="fans"><div class="sections two">${this._section("Ventilatorer","Styring og aktuelle omdrejninger","mdi:fan",`<div class="metrics">${m("extract_control","Udsugning styring","mdi:gauge")}${m("supply_control","Indblæsning styring","mdi:gauge")}${m("extract_speed","Udsugning RPM","mdi:fan-speed-2")}${m("supply_speed","Indblæsning RPM","mdi:fan-speed-2")}</div>`)}${this._section("Driftstilstand","Aktive specialfunktioner","mdi:hvac",`<div class="metrics">${m("night_mode","Natdrift","mdi:weather-night")}${m("fireplace_mode","Pejsefunktion","mdi:fireplace")}${m("standby","Standby","mdi:power-sleep")}</div>`)}</div></div>
      <div class="panel" data-panel="heat"><div class="sections two">${this._section("Setpunkter","Mål for luft og rum","mdi:thermostat",`<div class="metrics">${m("afterheat_setpoint","Indblæsning","mdi:thermostat")}${m("room_setpoint","Rum","mdi:home-thermometer-outline")}${m("extract_setpoint","Udsugning","mdi:thermometer-off")}${m("afterheat_active","Eftervarme","mdi:radiator")}</div>`)}${this._section("Varmeflade","Aktuelle luft- og vandtemperaturer","mdi:heating-coil",`<div class="metrics">${m("air_before_coil","Luft før","mdi:thermometer-low")}${m("air_after_coil","Luft efter","mdi:thermometer-high")}${m("air_delta","Luft delta-T","mdi:delta")}${m("water_flow","Vand fremløb","mdi:thermometer-chevron-up")}${m("water_return","Vand retur","mdi:thermometer-chevron-down")}${m("water_delta","Vand delta-T","mdi:delta")}</div>`)}</div></div>
      <div class="panel" data-panel="system">${this._section("System og diagnostik","Live forbindelse og busstatus","mdi:router-network",`<div class="metrics system">${m("hac1_connection","HAC1 forbindelse","mdi:lan-connect")}${m("rs485_traffic","Bustrafik","mdi:transit-connection-variant")}${m("outdoor_source","Udetemperaturkilde","mdi:thermometer-check")}${m("rs485_frames","Telegrammer pr. minut","mdi:pulse")}</div><button class="reset" data-reset><ha-icon icon="mdi:air-filter"></ha-icon><span><b>Filter skiftet</b><small>Nulstil filterintervallet til i dag</small></span><strong>Udfør</strong></button>`)}</div>
      <div class="panel" data-panel="history"><div class="history-grid">${this._section("Ventilatorer · 24 timer","Udsugning og indblæsning","mdi:fan",`<div data-history="fans"></div>`)}${this._section("Eftervarme · 24 timer","Luft- og vandkreds","mdi:radiator",`<div data-history="heat"></div>`)}${this._section("Temperaturer · 24 timer","Ude, indblæsning, udsugning og afkast","mdi:thermometer",`<div data-history="temperatures"></div>`)}${this._section("CO₂ · 24 timer","Luftkvalitet i udsugningen","mdi:molecule-co2",`<div data-history="co2"></div>`)}${this._section("Varmegenvinding · 24 timer","Temperatur-virkningsgrad","mdi:heat-wave",`<div data-history="recovery"></div>`)}</div></div>
      <ha-icon class="watermark" icon="mdi:fan"></ha-icon></ha-card>`;
    this._mountHistory();this._update();
  }
  _format(state,key){if(!state||["unknown","unavailable",""].includes(state.state))return"—";if(state.state==="on")return"Aktiv";if(state.state==="off")return"Ikke aktiv";const labels={good:"God",acceptable:"Acceptabel",low:"Lav",normal:"Stabil",watch:"Hold øje",degraded:"Faldende",unit_sensor:"Enhedens føler",weather_entity:"Vejrentitet",OFF:"Fra"};if(labels[state.state])return labels[state.state];if(key==="last_filter_change"){const date=new Date(state.state);if(!Number.isNaN(date.getTime()))return date.toLocaleDateString("da-DK",{day:"2-digit",month:"short",year:"numeric"});}const n=Number(String(state.state).replace(",","."));if(Number.isFinite(n)){const digits=Math.abs(n)>=100||Number.isInteger(n)?0:1;return`${n.toLocaleString("da-DK",{maximumFractionDigits:digits})}${state.attributes?.unit_of_measurement?` ${state.attributes.unit_of_measurement}`:""}`;}return state.state.replaceAll("_"," ");}
  _tone(key,state){if(!state||["unknown","unavailable",""].includes(state.state))return"bad";if(key==="heat_recovery_status")return state.state==="good"?"good":state.state==="acceptable"?"warn":"bad";if(key==="heat_recovery_trend")return state.state==="normal"?"good":state.state==="watch"?"warn":"bad";if(["hac1_connection","rs485_traffic"].includes(key))return state.state==="on"?"good":"bad";if(["night_mode","fireplace_mode","standby","afterheat_active"].includes(key))return state.state==="on"?"warn":"good";return"info";}
  _update(){if(!this._hass||!this.shadowRoot.querySelector("ha-card"))return;for(const [key] of DETAIL_FIELDS){const state=this._state(key),node=this.shadowRoot.querySelector(`[data-value="${key}"]`),tile=this.shadowRoot.querySelector(`[data-more="${key}"]`);if(node)node.textContent=this._format(state,key);if(tile)tile.dataset.tone=this._tone(key,state);}const alarm=["hac1_connection","rs485_traffic"].some(k=>this._tone(k,this._state(k))==="bad");const h=this.shadowRoot.querySelector("[data-health]");h.textContent=alarm?"Kræver opmærksomhed":"System online";h.classList.toggle("bad",alarm);}
  _click(event){const tab=event.target.closest?.("[data-tab]");if(tab){this.shadowRoot.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===tab));this.shadowRoot.querySelectorAll("[data-panel]").forEach(x=>x.classList.toggle("active",x.dataset.panel===tab.dataset.tab));return;}const more=event.target.closest?.("[data-more]");if(more){const entityId=this._config.entities?.[more.dataset.more];if(entityId)this.dispatchEvent(new CustomEvent("hass-more-info",{detail:{entityId},bubbles:true,composed:true}));return;}if(event.target.closest?.("[data-reset]")){const entity_id=this._config.entities?.filter_reset;if(entity_id&&window.confirm("Nulstil filterintervallet til i dag?"))this._hass?.callService("button","press",{entity_id});}}
  async _mountHistory(){this._historyCards=[];if(!window.loadCardHelpers)return;const helpers=await window.loadCardHelpers();const defs={fans:[["extract_speed","Udsugning","#00bfa5"],["supply_speed","Indblæsning","#42a5f5"]],temperatures:[["outdoor_temperature","Ude","#42a5f5"],["supply_temperature","Indblæsning","#f59e0b"],["extract_temperature","Udsugning","#00bfa5"],["exhaust_temperature","Afkast","#ab47bc"]],co2:[["co2","CO₂","#22c55e"]],recovery:[["heat_recovery","Genvindingsgrad","#26c6da"]],heat:[["air_before_coil","Luft før","#42a5f5"],["air_after_coil","Luft efter","#f59e0b"],["air_delta","Luft delta-T","#ab47bc"],["water_flow","Vand fremløb","#ef5350"],["water_return","Vand retur","#26c6da"],["water_delta","Vand delta-T","#22c55e"]]};for(const [name,series] of Object.entries(defs)){const target=this.shadowRoot.querySelector(`[data-history="${name}"]`);const entities=series.map(([key,label,color])=>({entity:this._config.entities?.[key],name:label,color})).filter(x=>x.entity);if(!target||!entities.length)continue;const card=await helpers.createCardElement({type:"custom:mini-graph-card",entities,hours_to_show:24,points_per_hour:2,line_width:3,height:170,animate:false,hour24:true,show:{icon:false,name:false,state:true,legend:true,labels:false,points:false,fill:"fade"}});card.hass=this._hass;target.replaceChildren(card);this._historyCards.push(card);}}
  _styles(){return`:host{display:block;container-type:inline-size;--surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#15191f)));--panel:var(--surface,var(--ha-card-background,var(--card-background-color,#171b22)));--line:color-mix(in srgb,var(--primary-text-color,#fff) 11%,transparent);--accent:var(--dashboard-accent,var(--primary-color,#20aee8));--good:var(--success-color,#20e3a2);--warn:var(--warning-color,#f59e0b);--bad:var(--error-color,#ef4444)}*{box-sizing:border-box}ha-card{position:relative;overflow:hidden;padding:20px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 4px) solid var(--good);border-radius:20px;background:var(--surface);box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 12px 28px rgba(0,0,0,.2)));color:var(--primary-text-color,#fff)}header{display:flex;justify-content:space-between;gap:16px;margin-bottom:14px}header small{font-size:9px;letter-spacing:.16em;color:var(--secondary-text-color)}h2{margin:3px 0;font-size:25px}header p,.section-title p{margin:0;color:var(--secondary-text-color);font-size:12px}.health{align-self:flex-start;padding:7px 11px;border-radius:99px;background:color-mix(in srgb,var(--good) 14%,transparent);color:var(--good);font-size:11px;font-weight:800}.health.bad{background:color-mix(in srgb,var(--bad) 14%,transparent);color:var(--bad)}nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-bottom:12px}nav button{display:flex;align-items:center;justify-content:center;gap:6px;min-height:42px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid color-mix(in srgb,var(--secondary-text-color) 35%,transparent);border-radius:12px;background:var(--panel);color:var(--secondary-text-color);font:inherit;font-size:12px;font-weight:750;cursor:pointer}nav button.active{border-left-color:var(--accent);color:var(--primary-text-color);background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 12%,transparent),transparent),var(--panel)}nav ha-icon{--mdc-icon-size:18px}.panel{display:none}.panel.active{display:block}.sections,.history-grid{display:grid;gap:10px}.sections.two,.history-grid{grid-template-columns:repeat(2,minmax(0,1fr))}section{min-width:0;padding:14px;border:1px solid var(--line);border-radius:16px;background:color-mix(in srgb,var(--black,#000) 10%,transparent)}.section-title{display:flex;align-items:center;gap:9px;margin-bottom:11px}.section-title>ha-icon{color:var(--accent);--mdc-icon-size:23px}.section-title h3{margin:0 0 2px;font-size:16px}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.metrics.system{grid-template-columns:repeat(4,minmax(0,1fr))}.metric{--tone:var(--accent);position:relative;isolation:isolate;display:flex;align-items:center;gap:9px;min-width:0;min-height:67px;padding:10px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--tone);border-radius:13px;background:var(--panel);color:inherit;text-align:left;overflow:hidden;cursor:pointer}.metric[data-tone=good]{--tone:var(--good)}.metric[data-tone=warn]{--tone:var(--warn)}.metric[data-tone=bad]{--tone:var(--bad)}.metric-icon{display:grid;place-items:center;width:31px;height:31px;flex:0 0 31px;border-radius:10px;background:color-mix(in srgb,var(--tone) 14%,transparent);color:var(--tone)}.metric-icon ha-icon{--mdc-icon-size:18px}.metric span,.metric small,.metric strong{display:block;min-width:0}.metric small{font-size:9px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.metric strong{margin-top:4px;font-size:15px;text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.metric-bg{position:absolute;right:-9px;bottom:-10px;z-index:-1;color:var(--tone);opacity:.12;--mdc-icon-size:58px;animation:detailDrift 5s ease-in-out infinite}.reset{display:grid;grid-template-columns:35px 1fr auto;align-items:center;gap:10px;width:100%;margin-top:9px;padding:11px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--warn);border-radius:13px;background:var(--panel);color:inherit;text-align:left;cursor:pointer}.reset>ha-icon{color:var(--warn)}.reset b,.reset small{display:block}.reset small{margin-top:2px;color:var(--secondary-text-color)}.reset strong{color:var(--warn)}.watermark{position:absolute;right:15px;bottom:8px;opacity:.035;--mdc-icon-size:100px;pointer-events:none}@keyframes detailDrift{50%{transform:translate(-4px,-3px) scale(1.04) rotate(-5deg);opacity:.22}}@media(prefers-reduced-motion:reduce){.metric-bg{animation:none}}@container(max-width:850px){.sections.two,.history-grid{grid-template-columns:1fr}.metrics.system{grid-template-columns:repeat(2,minmax(0,1fr))}}@container(max-width:560px){ha-card{padding:14px}header{display:block}.health{display:inline-block;margin-top:9px}nav{grid-template-columns:repeat(3,minmax(0,1fr))}nav button{font-size:10px}.metrics,.metrics.system{grid-template-columns:1fr}.metric{min-height:60px}}`;}
}

class HAVentilationDetailsCardEditor extends HTMLElement{
  setConfig(config){this._config=config||{};if(!this._form)this._render();else this._form.data=this._config;}
  set hass(hass){this._hass=hass;if(this._form)this._form.hass=hass;}
  _render(){this.innerHTML=`<style>:host{display:block;padding:12px}</style><ha-form></ha-form>`;this._form=this.querySelector("ha-form");this._form.hass=this._hass;this._form.data=this._config;this._form.schema=[{name:"title",selector:{text:{}}},{type:"expandable",name:"entities",title:"Detalje-entiteter",schema:DETAIL_FIELDS.map(([name,label])=>({name,label,selector:{entity:{}}}))}];this._form.computeLabel=s=>s.label||s.name;this._form.addEventListener("value-changed",e=>this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:e.detail.value},bubbles:true,composed:true})));}
}

if (!customElements.get("ha-ventilation-card")) customElements.define("ha-ventilation-card", HAVentilationCard);
if (!customElements.get("ha-ventilation-card-editor")) customElements.define("ha-ventilation-card-editor", HAVentilationCardEditor);
if (!customElements.get("ha-ventilation-details-card")) customElements.define("ha-ventilation-details-card", HAVentilationDetailsCard);
if (!customElements.get("ha-ventilation-details-card-editor")) customElements.define("ha-ventilation-details-card-editor", HAVentilationDetailsCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-ventilation-card", name: "HA Ventilation Card", description: "Temperature-aware heat-recovery ventilation card", preview: true });
window.customCards.push({ type: "ha-ventilation-details-card", name: "HA Ventilation Details Card", description: "Samlet Dantherm drift, eftervarme, diagnose og historik", preview: true });
console.info(`%c HA-VENTILATION-CARD %c ${VERSION} `, "color:#fff;background:#28789f;font-weight:700", "color:#28789f;background:#fff");
