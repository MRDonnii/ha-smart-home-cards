const VERSION = "0.4.0";

class HASimpleVacuumCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return {
      title: "Robotstøvsuger",
      vacuum: "vacuum.robot_vacuum",
      battery: "sensor.robot_vacuum_batteri",
      bin_full: "binary_sensor.robot_vacuum_bin_full",
      average_mission_time: "sensor.robot_vacuum_average_mission_time",
      battery_cycles: "sensor.robot_vacuum_battery_cycles",
      missions_total: "sensor.robot_vacuum_total_missions",
      missions_successful: "sensor.robot_vacuum_successful_missions",
      missions_failed: "sensor.robot_vacuum_failed_missions",
      missions_canceled: "sensor.robot_vacuum_canceled_missions",
      total_cleaning_time: "sensor.robot_vacuum_total_cleaning_time",
      tank_level: "sensor.robot_vacuum_tank_level",
      dock_tank_level: "sensor.robot_vacuum_dock_tank_level",
    };
  }
  setConfig(config) {
    if (!config?.vacuum) throw new Error("Kortet kræver en vacuum-entity");
    this._config = { title: "Robotstøvsuger", ...config };
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    const ids = [
      this._config.vacuum,
      this._config.battery,
      this._config.bin_full,
      this._config.average_mission_time,
      this._config.battery_cycles,
      this._config.missions_total,
      this._config.missions_successful,
      this._config.missions_failed,
      this._config.missions_canceled,
      this._config.total_cleaning_time,
      this._config.tank_level,
      this._config.dock_tank_level,
    ].filter(Boolean);
    const sig = JSON.stringify(
      ids.map((id) => [id, hass?.states?.[id]?.state]),
    );
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }
  getCardSize() {
    return 6;
  }
  getGridOptions() {
    return { columns: 6, rows: "auto", min_columns: 4 };
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
      cleaning: "Rengør",
      docked: "Ladestation",
      idle: "Klar",
      paused: "Pause",
      returning: "På vej hjem",
      error: "Fejl",
    };
    return map[state] || state || "Ukendt";
  }
  _call(service) {
    if (!this._config.vacuum) return;
    this._hass?.callService("vacuum", service, {
      entity_id: this._config.vacuum,
    });
  }
  _render() {
    if (!this.shadowRoot) return;
    const vacuum = this._e(this._config.vacuum);
    const state = vacuum?.state || "unknown";
    const battery = this._config.battery
      ? this._num(this._config.battery)
      : Number(vacuum?.attributes?.battery_level);
    const active = state === "cleaning" || state === "returning";
    const binFull = this._config.bin_full
      ? this._e(this._config.bin_full)?.state === "on"
      : false;
    const hasError = state === "error" || binFull;
    const total = this._num(this._config.missions_total);
    const successful = this._num(this._config.missions_successful);
    const successRate =
      Number.isFinite(total) && total > 0 && Number.isFinite(successful)
        ? (successful / total) * 100
        : undefined;
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{position:relative;overflow:hidden;padding:16px;border-left:4px solid var(--accent);border-radius:18px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      ha-card.has-error{border-left-color:var(--danger);animation:pulse-danger 1.8s ease-in-out infinite}
      @keyframes pulse-danger{0%,100%{box-shadow:var(--ha-card-box-shadow)}50%{box-shadow:0 0 0 6px color-mix(in srgb,var(--danger) 22%,transparent),var(--ha-card-box-shadow)}}
      @media(prefers-reduced-motion:reduce){ha-card.has-error{animation:none}}
      .head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .identity{display:flex;align-items:center;gap:10px;min-width:0}
      .icon{display:grid;place-items:center;width:40px;height:40px;flex:0 0 40px;border-radius:12px;background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent)}
      .icon ha-icon{--mdc-icon-size:24px}
      .identity strong{display:block;font-size:16px}
      .status{display:flex;align-items:center;gap:6px;color:var(--secondary-text-color);font-size:11px;font-weight:700}
      .status i{width:7px;height:7px;border-radius:50%;background:${active ? "var(--good)" : state === "error" ? "var(--danger)" : "var(--secondary-text-color)"};box-shadow:0 0 8px currentColor}
      .battery{text-align:right}
      .battery strong{font-size:20px}
      .battery span{display:block;color:var(--secondary-text-color);font-size:10px}
      .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
      .chip{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:10px;font-size:10px;font-weight:700;background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
      .section-title{margin:14px 0 8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .stat{padding:8px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:10px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);text-align:center}
      .stat span{display:block;color:var(--secondary-text-color);font-size:8px;text-transform:uppercase;font-weight:700}
      .stat b{display:block;margin-top:3px;font-size:13px}
      .success{margin-top:8px}
      .success-head{display:flex;justify-content:space-between;font-size:10px;color:var(--secondary-text-color)}
      .track{height:6px;margin-top:4px;border-radius:6px;overflow:hidden;background:rgba(127,145,165,.18)}
      .track i{display:block;height:100%;background:linear-gradient(90deg,var(--danger),var(--good))}
      .controls{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:14px}
      .controls button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 2px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:10px;background:transparent;color:var(--secondary-text-color);font-size:9px;font-weight:700;cursor:pointer}
      .controls button:hover{border-color:var(--accent);color:var(--primary-text-color)}
      .controls button.primary{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--primary-text-color)}
      .controls ha-icon{--mdc-icon-size:18px}
      @media(max-width:420px){.stats{grid-template-columns:repeat(2,1fr)}}
    </style>
    <ha-card class="${hasError ? "has-error" : ""}">
      <div class="head">
        <div class="identity">
          <span class="icon"><ha-icon icon="mdi:robot-vacuum"></ha-icon></span>
          <div>
            <strong>${this._esc(this._config.title)}</strong>
            <span class="status"><i></i>${this._esc(this._statusLabel(state))}</span>
          </div>
        </div>
        <div class="battery"><strong>${Number.isFinite(battery) ? Math.round(battery) : "—"}%</strong><span>Batteri</span></div>
      </div>
      ${binFull ? `<div class="chips"><span class="chip"><ha-icon icon="mdi:delete-alert"></ha-icon>Beholder fuld</span></div>` : ""}
      ${
        this._config.missions_total
          ? `<div class="section-title">Missioner</div><div class="stats">
        <div class="stat"><span>Total</span><b>${this._fmt(total)}</b></div>
        <div class="stat"><span>Gennemført</span><b>${this._fmt(successful)}</b></div>
        <div class="stat"><span>Fejlet</span><b>${this._fmt(this._num(this._config.missions_failed))}</b></div>
      </div>
      ${
        successRate !== undefined
          ? `<div class="success"><div class="success-head"><span>Succesrate</span><b>${this._fmt(successRate, 0)}%</b></div><div class="track"><i style="width:${successRate}%"></i></div></div>`
          : ""
      }`
          : ""
      }
      ${
        this._config.average_mission_time || this._config.total_cleaning_time || this._config.battery_cycles
          ? `<div class="section-title">Statistik</div><div class="stats">
        ${this._config.average_mission_time ? `<div class="stat"><span>Snit / tur</span><b>${this._fmt(this._num(this._config.average_mission_time))} min</b></div>` : ""}
        ${this._config.total_cleaning_time ? `<div class="stat"><span>Total tid</span><b>${this._fmt((this._num(this._config.total_cleaning_time) || 0) / 60, 0)} t</b></div>` : ""}
        ${this._config.battery_cycles ? `<div class="stat"><span>Batteri-cyklusser</span><b>${this._fmt(this._num(this._config.battery_cycles))}</b></div>` : ""}
      </div>`
          : ""
      }
      <div class="controls">
        <button data-action="start"><ha-icon icon="mdi:play"></ha-icon>Start</button>
        <button data-action="pause"><ha-icon icon="mdi:pause"></ha-icon>Pause</button>
        <button data-action="stop"><ha-icon icon="mdi:stop"></ha-icon>Stop</button>
        <button class="primary" data-action="return_to_base"><ha-icon icon="mdi:home-import-outline"></ha-icon>Hjem</button>
        <button data-action="locate"><ha-icon icon="mdi:map-marker-radius"></ha-icon>Find</button>
      </div>
    </ha-card>`;
    this.shadowRoot.querySelectorAll("[data-action]").forEach((btn) =>
      btn.addEventListener("click", () => this._call(btn.dataset.action)),
    );
  }
}

if (!customElements.get("ha-simple-vacuum-card"))
  customElements.define("ha-simple-vacuum-card", HASimpleVacuumCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-simple-vacuum-card",
  name: "HA Simple Vacuum Card",
  description: "Kompakt kort til en almindelig robotstøvsuger",
  preview: true,
});
console.info(
  `%c HA SIMPLE VACUUM CARD %c v${VERSION} `,
  "color:white;background:#357fc4;font-weight:700",
  "color:#69c4ff;background:#161b22",
);
