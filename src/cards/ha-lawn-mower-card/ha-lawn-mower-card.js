const VERSION = "0.4.0";

class HALawnMowerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return {
      title: "Robotplæneklipper",
      mower: "lawn_mower.lawn_mower_2",
      battery: "sensor.lawn_mower_battery_2",
      error: "sensor.lawn_mower_error_2",
      charging: "binary_sensor.lawn_mower_charging",
      connectivity: "binary_sensor.lawn_mower_mqtt",
      firmware: "update.lawn_mower_firmware",
      signal_strength: "sensor.lawn_mower_signal_strength",
      daily_progress: "sensor.lawn_mower_daily_progress_2",
      next_schedule: "sensor.lawn_mower_next_schedule",
      last_update: "sensor.lawn_mower_last_update_2",
      rain_sensor: "binary_sensor.lawn_mower_rain_sensor",
      rain_delay_remaining: "sensor.lawn_mower_rain_delay_remaining",
      battery_temperature: "sensor.lawn_mower_battery_temperature_2",
      battery_voltage: "sensor.lawn_mower_battery_voltage_2",
      battery_cycles_total: "sensor.lawn_mower_battery_charge_cycles_total",
      battery_cycles_since_reset: "sensor.lawn_mower_battery_charge_cycles_since_reset",
      blade_runtime_total: "sensor.lawn_mower_blade_runtime_total",
      blade_runtime_since_reset: "sensor.lawn_mower_blade_runtime_since_reset",
      distance_driven_total: "sensor.lawn_mower_distance_driven_total",
      mower_runtime_total: "sensor.lawn_mower_mower_runtime_total",
      zone: "select.lawn_mower_zone",
      auto_schedule_boost: "select.lawn_mower_auto_schedule_boost",
      auto_schedule_grass_type: "select.lawn_mower_auto_schedule_grass_type",
      auto_schedule_soil_type: "select.lawn_mower_auto_schedule_soil_type",
      rain_delay: "number.lawn_mower_rain_delay",
      time_extension: "number.lawn_mower_time_extension_2",
      torque: "number.lawn_mower_torque_2",
      lawn_size: "number.lawn_mower_lawn_size",
      lawn_perimeter: "number.lawn_mower_lawn_perimeter",
      auto_schedule: "switch.lawn_mower_auto_schedule",
      firmware_auto_update: "switch.lawn_mower_firmware_auto_update",
      party_mode: "switch.lawn_mower_party_mode_2",
      auto_schedule_irrigation: "switch.lawn_mower_auto_schedule_irrigation",
      auto_schedule_exclude_nights: "switch.lawn_mower_auto_schedule_exclude_nights",
      lock: "switch.lawn_mower_lock",
      acs: "switch.lawn_mower_acs_2",
      edge_cut: "button.lawn_mower_edge_cut",
      reset_blade_runtime: "button.lawn_mower_reset_blade_runtime",
      reset_battery_cycles: "button.lawn_mower_reset_battery_cycles",
    };
  }
  setConfig(config) {
    if (!config?.mower) throw new Error("Kortet kræver en lawn_mower-entity");
    this._config = { title: "Robotplæneklipper", ...config };
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    const ids = Object.values(this._config).filter(
      (v) => typeof v === "string" && v.includes("."),
    );
    const sig = JSON.stringify(
      ids.map((id) => [id, hass?.states?.[id]?.state]),
    );
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }
  getCardSize() {
    return 14;
  }
  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }
  _e(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  _s(id) {
    return this._e(id)?.state;
  }
  _num(id) {
    const n = Number(this._s(id));
    return Number.isFinite(n) ? n : undefined;
  }
  _on(id) {
    return this._s(id) === "on";
  }
  _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  _fmt(v, digits = 0) {
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString("da-DK", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  _statusLabel(state) {
    const map = {
      mowing: "Klipper",
      docked: "Ladestation",
      paused: "Pause",
      returning: "På vej hjem",
      error: "Fejl",
      idle: "Klar",
    };
    return map[state] || state || "Ukendt";
  }
  _hasData(id) {
    if (!id) return false;
    const s = this._s(id);
    return s !== undefined && !["unknown", "unavailable", ""].includes(s);
  }
  _switchChip(id, label, icon) {
    if (!this._hasData(id)) return "";
    const on = this._on(id);
    return `<button class="chip switch ${on ? "" : "off"}" data-switch="${this._esc(id)}"><ha-icon icon="${icon}"></ha-icon>${label} ${on ? "til" : "fra"}</button>`;
  }
  _select(id, label) {
    if (!this._hasData(id)) return "";
    const options = this._e(id)?.attributes?.options || [];
    if (!options.length) return "";
    const current = this._s(id);
    return `<div><label>${label}</label><select data-select="${this._esc(id)}">${options.map((o) => `<option value="${this._esc(o)}" ${o === current ? "selected" : ""}>${this._esc(o)}</option>`).join("")}</select></div>`;
  }
  _numberField(id, label) {
    if (!this._hasData(id)) return "";
    const e = this._e(id);
    const min = e?.attributes?.min ?? 0;
    const max = e?.attributes?.max ?? 100;
    const step = e?.attributes?.step ?? 1;
    const unit = e?.attributes?.unit_of_measurement || "";
    const value = this._num(id);
    return `<div><label>${label}${unit ? ` (${this._esc(unit)})` : ""}</label><input type="number" min="${min}" max="${max}" step="${step}" value="${value ?? ""}" data-number="${this._esc(id)}"></div>`;
  }
  _statItem(id, label, formatter) {
    if (!this._hasData(id)) return "";
    return `<div class="stat"><span>${label}</span><b>${formatter(id)}</b></div>`;
  }
  _call(service) {
    if (!this._config.mower) return;
    this._hass?.callService("lawn_mower", service, {
      entity_id: this._config.mower,
    });
  }
  _render() {
    if (!this.shadowRoot) return;
    const mower = this._e(this._config.mower);
    const state = mower?.state || "unknown";
    const battery = this._config.battery
      ? this._num(this._config.battery)
      : undefined;
    const errorState = this._config.error ? this._s(this._config.error) : undefined;
    const hasError =
      errorState && !["no_error", "unknown", "unavailable"].includes(errorState);
    const active = state === "mowing" || state === "returning";
    const offline = this._config.connectivity
      ? !this._on(this._config.connectivity)
      : false;
    const firmwareUpdate = this._config.firmware
      ? this._on(this._config.firmware)
      : false;
    const rainWet = this._config.rain_sensor
      ? this._on(this._config.rain_sensor)
      : false;
    const rainDelay = this._config.rain_delay_remaining
      ? this._num(this._config.rain_delay_remaining)
      : undefined;
    const supported = mower?.attributes?.supported_features || 0;
    const canStart = (supported & 1) === 1;
    const canPause = (supported & 2) === 2;
    const canDock = (supported & 4) === 4;
    const selectFields = [
      ["zone", "Zone"],
      ["auto_schedule_boost", "Boost"],
      ["auto_schedule_grass_type", "Græstype"],
      ["auto_schedule_soil_type", "Jordtype"],
    ]
      .map(([key, label]) => this._select(this._config[key], label))
      .filter(Boolean);
    const numberFields = [
      ["rain_delay", "Regnforsinkelse"],
      ["time_extension", "Tidsforlængelse"],
      ["torque", "Moment"],
      ["lawn_size", "Plænestørrelse"],
      ["lawn_perimeter", "Plæneomkreds"],
    ]
      .map(([key, label]) => this._numberField(this._config[key], label))
      .filter(Boolean);
    const buttons = [
      ["edge_cut", "Kantklip", "mdi:vector-polyline-edit"],
      ["reset_blade_runtime", "Nulstil knivtid", "mdi:restore"],
      ["reset_battery_cycles", "Nulstil batteri-cyklusser", "mdi:battery-sync"],
    ].filter(
      ([key]) => this._config[key] && this._s(this._config[key]) !== "unavailable",
    );
    const systemChips = [
      this._switchChip(this._config.firmware_auto_update, "Auto-firmware", "mdi:cloud-download"),
      this._switchChip(this._config.auto_schedule_irrigation, "Vanding-pause", "mdi:sprinkler"),
      this._switchChip(this._config.auto_schedule_exclude_nights, "Undgå nat", "mdi:weather-night"),
    ].filter(Boolean);
    const todayStats = [
      this._statItem(this._config.daily_progress, "Fremgang", (id) => `${this._fmt(this._num(id))}%`),
      this._statItem(this._config.next_schedule, "Næste skema", (id) => this._esc(this._s(id))),
      this._statItem(this._config.signal_strength, "Signal", (id) => `${this._fmt(this._num(id))} dBm`),
      this._statItem(this._config.last_update, "Opdateret", (id) => this._esc(this._s(id))),
    ].filter(Boolean);
    const batteryStats = [
      this._statItem(this._config.battery_temperature, "Temperatur", (id) => `${this._fmt(this._num(id), 1)}°`),
      this._statItem(this._config.battery_voltage, "Spænding", (id) => `${this._fmt(this._num(id), 1)} V`),
      this._statItem(this._config.battery_cycles_total, "Cyklusser total", (id) => this._fmt(this._num(id))),
      this._statItem(this._config.battery_cycles_since_reset, "Siden nulstil", (id) => this._fmt(this._num(id))),
    ].filter(Boolean);
    const lifetimeStats = [
      this._statItem(this._config.blade_runtime_total, "Knivtid total", (id) => `${this._fmt((this._num(id) || 0) / 60, 0)} t`),
      this._statItem(this._config.mower_runtime_total, "Køretid total", (id) => `${this._fmt((this._num(id) || 0) / 60, 0)} t`),
      this._statItem(this._config.distance_driven_total, "Kørt distance", (id) => `${this._fmt((this._num(id) || 0) / 1000, 1)} km`),
      this._statItem(this._config.blade_runtime_since_reset, "Knivtid siden nulstil", (id) => `${this._fmt((this._num(id) || 0) / 60, 0)} t`),
    ].filter(Boolean);
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{position:relative;overflow:hidden;padding:16px;border-left:calc(var(--dashboard-left-accent-width, 1) * 4px) solid var(--accent);border-radius:18px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      ha-card.has-error{border-left-color:var(--danger);animation:pulse-danger 1.8s ease-in-out infinite}
      @keyframes pulse-danger{0%,100%{box-shadow:var(--ha-card-box-shadow)}50%{box-shadow:0 0 0 6px color-mix(in srgb,var(--danger) 22%,transparent),var(--ha-card-box-shadow)}}
      @media(prefers-reduced-motion:reduce){ha-card.has-error{animation:none}}
      .head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .identity{display:flex;align-items:center;gap:10px;min-width:0}
      .icon{display:grid;place-items:center;width:40px;height:40px;flex:0 0 40px;border-radius:12px;background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent)}
      .icon ha-icon{--mdc-icon-size:24px}
      .identity strong{display:block;font-size:16px}
      .status{display:flex;align-items:center;gap:6px;color:var(--secondary-text-color);font-size:11px;font-weight:700}
      .status i{width:7px;height:7px;border-radius:50%;background:${hasError ? "var(--danger)" : active ? "var(--good)" : "var(--secondary-text-color)"};box-shadow:0 0 8px currentColor}
      .battery{text-align:right}
      .battery strong{font-size:20px}
      .battery span{display:block;color:var(--secondary-text-color);font-size:10px}
      .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
      .chip{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:10px;font-size:10px;font-weight:700;border:0;font-family:inherit}
      .chip.error{background:color-mix(in srgb,var(--danger) 16%,transparent);color:var(--danger)}
      .chip.warn{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
      .chip.good{background:color-mix(in srgb,var(--good) 14%,transparent);color:var(--good)}
      .chip.neutral{background:color-mix(in srgb,var(--secondary-text-color) 10%,transparent);color:var(--secondary-text-color)}
      .chip.switch{cursor:pointer;background:color-mix(in srgb,var(--good) 12%,transparent);color:var(--good)}
      .chip.switch.off{background:color-mix(in srgb,var(--secondary-text-color) 10%,transparent);color:var(--secondary-text-color)}
      .chip ha-icon{--mdc-icon-size:14px}
      .section-title{margin:14px 0 8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      .stat{padding:8px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:10px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);text-align:center}
      .stat span{display:block;color:var(--secondary-text-color);font-size:8px;text-transform:uppercase;font-weight:700}
      .stat b{display:block;margin-top:3px;font-size:12px}
      .fields{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
      .fields label{display:block;color:var(--secondary-text-color);font-size:9px;font-weight:700;margin-bottom:4px;text-transform:uppercase}
      .fields select,.fields input{width:100%;padding:7px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:8px;background:transparent;color:var(--primary-text-color)}
      .btn-row{display:flex;flex-wrap:wrap;gap:6px}
      .btn-row button{flex:1;min-width:110px;padding:9px 6px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:10px;background:transparent;color:var(--primary-text-color);font-size:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
      .btn-row button:hover{border-color:var(--accent)}
      .btn-row ha-icon{--mdc-icon-size:15px;color:var(--accent)}
      .controls{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:14px}
      .controls button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 2px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:10px;background:transparent;color:var(--secondary-text-color);font-size:9px;font-weight:700;cursor:pointer}
      .controls button:hover{border-color:var(--accent);color:var(--primary-text-color)}
      .controls button.primary{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--primary-text-color)}
      .controls button:disabled{opacity:.35;cursor:default}
      .controls ha-icon{--mdc-icon-size:18px}
      @media(max-width:480px){.stats{grid-template-columns:repeat(2,1fr)}.fields{grid-template-columns:1fr}}
    </style>
    <ha-card class="${hasError ? "has-error" : ""}">
      <div class="head">
        <div class="identity">
          <span class="icon"><ha-icon icon="mdi:robot-mower"></ha-icon></span>
          <div>
            <strong>${this._esc(this._config.title)}</strong>
            <span class="status"><i></i>${this._esc(this._statusLabel(state))}</span>
          </div>
        </div>
        <div class="battery"><strong>${Number.isFinite(battery) ? this._esc(String(Math.round(battery))) : "—"}%</strong><span>Batteri</span></div>
      </div>
      <div class="chips">
        ${hasError ? `<span class="chip error"><ha-icon icon="mdi:alert-circle"></ha-icon>${this._esc(errorState)}</span>` : ""}
        ${this._config.charging && this._on(this._config.charging) ? `<span class="chip good"><ha-icon icon="mdi:battery-charging"></ha-icon>Oplader</span>` : ""}
        ${offline ? `<span class="chip warn"><ha-icon icon="mdi:wifi-off"></ha-icon>Offline</span>` : ""}
        ${firmwareUpdate ? `<span class="chip neutral"><ha-icon icon="mdi:update"></ha-icon>Firmware klar</span>` : ""}
        ${rainWet ? `<span class="chip warn"><ha-icon icon="mdi:weather-pouring"></ha-icon>Regn registreret</span>` : ""}
        ${Number.isFinite(rainDelay) && rainDelay > 0 ? `<span class="chip warn"><ha-icon icon="mdi:timer-sand"></ha-icon>Regnforsinkelse ${this._fmt(rainDelay)} min</span>` : ""}
        ${this._switchChip(this._config.lock, "Lås", "mdi:lock")}
        ${this._switchChip(this._config.acs, "ACS", "mdi:shield-alert")}
        ${this._switchChip(this._config.party_mode, "Partymode", "mdi:party-popper")}
        ${this._switchChip(this._config.auto_schedule, "Auto-skema", "mdi:calendar-sync")}
      </div>
      ${todayStats.length ? `<div class="section-title">I dag</div><div class="stats">${todayStats.join("")}</div>` : ""}
      ${batteryStats.length ? `<div class="section-title">Batteri</div><div class="stats">${batteryStats.join("")}</div>` : ""}
      ${lifetimeStats.length ? `<div class="section-title">Livstid</div><div class="stats">${lifetimeStats.join("")}</div>` : ""}
      ${selectFields.length ? `<div class="section-title">Indstillinger</div><div class="fields">${selectFields.join("")}</div>` : ""}
      ${numberFields.length ? `<div class="section-title">Justeringer</div><div class="fields">${numberFields.join("")}</div>` : ""}
      ${systemChips.length ? `<div class="section-title">System</div><div class="chips">${systemChips.join("")}</div>` : ""}
      ${
        buttons.length
          ? `<div class="section-title">Handlinger</div><div class="btn-row">${buttons.map(([key, label, icon]) => `<button data-press="${this._esc(this._config[key])}"><ha-icon icon="${icon}"></ha-icon>${label}</button>`).join("")}</div>`
          : ""
      }
      <div class="controls">
        <button data-action="start_mowing" ${canStart ? "" : "disabled"}><ha-icon icon="mdi:play"></ha-icon>Start</button>
        <button data-action="pause" ${canPause ? "" : "disabled"}><ha-icon icon="mdi:pause"></ha-icon>Pause</button>
        <button class="primary" data-action="dock" ${canDock ? "" : "disabled"}><ha-icon icon="mdi:home-import-outline"></ha-icon>Hjem</button>
      </div>
    </ha-card>`;
    this.shadowRoot.querySelectorAll("[data-action]").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (!btn.disabled) this._call(btn.dataset.action);
      }),
    );
    this.shadowRoot.querySelectorAll("[data-switch]").forEach((btn) =>
      btn.addEventListener("click", () =>
        this._hass?.callService("switch", "toggle", {
          entity_id: btn.dataset.switch,
        }),
      ),
    );
    this.shadowRoot.querySelectorAll("[data-select]").forEach((sel) =>
      sel.addEventListener("change", () =>
        this._hass?.callService("select", "select_option", {
          entity_id: sel.dataset.select,
          option: sel.value,
        }),
      ),
    );
    this.shadowRoot.querySelectorAll("[data-number]").forEach((input) =>
      input.addEventListener("change", () =>
        this._hass?.callService("number", "set_value", {
          entity_id: input.dataset.number,
          value: input.value,
        }),
      ),
    );
    this.shadowRoot.querySelectorAll("[data-press]").forEach((btn) =>
      btn.addEventListener("click", () =>
        this._hass?.callService("button", "press", {
          entity_id: btn.dataset.press,
        }),
      ),
    );
  }
}

if (!customElements.get("ha-lawn-mower-card"))
  customElements.define("ha-lawn-mower-card", HALawnMowerCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-lawn-mower-card",
  name: "HA Lawn Mower Card",
  description: "Fuldt kort til robotplæneklipper: status, batteri, zoner og justeringer",
  preview: true,
});
console.info(
  `%c HA LAWN MOWER CARD %c v${VERSION} `,
  "color:white;background:#357fc4;font-weight:700",
  "color:#69c4ff;background:#161b22",
);
