const VERSION = "0.2.0";

class HAKioskServerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return {
      title: "Kiosk-pc",
      health_entity: "binary_sensor.example_kiosk_health",
      status_entity: "sensor.example_status",
      cpu_entity: "sensor.example_cpu",
      ram_entity: "sensor.example_ram",
      actions: [],
    };
  }
  setConfig(config) {
    this._config = { title: "Kiosk-pc", actions: [], ...config };
    this._render();
  }
  _watchedIds() {
    const c = this._config;
    return [
      c.health_entity,
      c.status_entity,
      c.chrome_entity,
      c.cpu_entity,
      c.ram_entity,
      c.temp_entity,
      c.uptime_entity,
      c.upgrades_entity,
      c.last_active_entity,
      c.power_entity,
      c.energy_entity,
      c.ip_entity,
      c.glances_cpu_entity,
      c.glances_ram_entity,
      c.glances_disk_entity,
      c.glances_load_entity,
      c.glances_uptime_entity,
      c.glances_disk_free_entity,
      c.glances_ram_free_entity,
      c.glances_threads_entity,
      c.screen_light_entity,
      c.volume_entity,
      c.zoom_entity,
      c.window_mode_entity,
      c.theme_entity,
      c.url_entity,
      c.keyboard_switch_entity,
      c.smartplug_switch_entity,
      c.screenshot_entity,
      ...(c.actions || []).map((a) => a.entity),
    ].filter(Boolean);
  }
  set hass(hass) {
    this._hass = hass;
    const ids = this._watchedIds();
    const sig = JSON.stringify(ids.map((id) => [id, hass?.states?.[id]?.state]));
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
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
    return v.toLocaleString("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  _uptime(id) {
    const min = this._num(id);
    if (!Number.isFinite(min)) return "—";
    const days = Math.floor(min / 1440);
    const hours = Math.floor((min % 1440) / 60);
    return `${days}d ${hours}t`;
  }
  _relTime(id) {
    const s = this._s(id);
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "Nu";
    if (mins < 60) return `${mins} min siden`;
    return `${Math.round(mins / 60)} t siden`;
  }
  _more(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
    );
  }
  _toggle(entityId) {
    if (!entityId) return;
    this._hass?.callService("homeassistant", "toggle", { entity_id: entityId });
  }
  _bind(el, entityId) {
    let timer = null,
      held = false;
    const start = () => {
      held = false;
      timer = setTimeout(() => {
        held = true;
        this._more(entityId);
      }, 550);
    };
    const cancel = () => clearTimeout(timer);
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("click", () => {
      const wasHeld = held;
      held = false;
      if (!wasHeld) this._toggle(entityId);
    });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  _barColor(pct) {
    if (!Number.isFinite(pct)) return "var(--secondary-text-color)";
    return pct >= 85 ? "var(--danger)" : pct >= 65 ? "var(--warn)" : "var(--good)";
  }
  _statTile(label, value, icon) {
    return `<div class="stat-tile"><ha-icon icon="${this._esc(icon)}"></ha-icon><span class="stat-text"><b>${this._esc(value)}</b><span>${this._esc(label)}</span></span></div>`;
  }
  _gauge(label, id, unit) {
    const v = this._num(id);
    const color = this._barColor(v);
    return `<div class="gauge" data-more="${this._esc(id)}">
      <div class="gauge-head"><span>${this._esc(label)}</span><b style="color:${color}">${Number.isFinite(v) ? `${this._fmt(v, 1)}${unit}` : "—"}</b></div>
      <div class="track"><i style="width:${Math.min(100, v || 0)}%;background:${color}"></i></div>
    </div>`;
  }
  _infoChip(label, value) {
    return `<div class="info-chip"><span>${this._esc(label)}</span><b>${this._esc(value)}</b></div>`;
  }
  _runAction(action) {
    if (!action?.entity) return;
    if (action.confirm_text && !window.confirm(action.confirm_text)) return;
    this._hass?.callService("button", "press", { entity_id: action.entity });
  }
  _actionBtn(action, i) {
    return `<button class="action-btn" data-action="${i}">
      <ha-icon icon="${this._esc(action.icon || "mdi:play")}"></ha-icon>
      <span>${this._esc(action.name)}</span>
    </button>`;
  }
  _selectRow(label, id, icon) {
    const e = this._e(id);
    const options = e?.attributes?.options || [];
    if (!options.length) return "";
    return `<div class="select-row">
      <ha-icon icon="${this._esc(icon)}"></ha-icon>
      <span class="select-label">${this._esc(label)}</span>
      <select data-select="${this._esc(id)}">${options.map((o) => `<option value="${this._esc(o)}" ${o === e?.state ? "selected" : ""}>${this._esc(o)}</option>`).join("")}</select>
    </div>`;
  }
  _render() {
    if (!this.shadowRoot) return;
    const c = this._config;
    const healthy = this._on(c.health_entity);
    const cpu = this._num(c.cpu_entity);
    const ram = this._num(c.ram_entity);
    const temp = this._num(c.temp_entity);
    const power = this._num(c.power_entity);
    const volume = this._num(c.volume_entity);
    const screenshotUrl = c.screenshot_entity ? this._e(c.screenshot_entity)?.attributes?.entity_picture : undefined;
    const actions = c.actions || [];

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{position:relative;overflow:hidden;padding:18px;border-left:4px solid ${healthy ? "var(--good)" : "var(--danger)"};border-radius:20px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
      .head-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:color-mix(in srgb,${healthy ? "var(--good)" : "var(--danger)"} 18%,transparent);color:${healthy ? "var(--good)" : "var(--danger)"};flex:0 0 auto}
      .head-icon ha-icon{--mdc-icon-size:22px}
      .head strong{flex:1;font-size:16px}
      .head .pill{padding:4px 10px;border-radius:999px;font-size:10px;font-weight:800;background:color-mix(in srgb,${healthy ? "var(--good)" : "var(--danger)"} 16%,transparent);color:${healthy ? "var(--good)" : "var(--danger)"}}
      .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
      .stat-tile{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:13px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08)}
      .stat-tile ha-icon{--mdc-icon-size:18px;color:var(--secondary-text-color);flex:0 0 auto}
      .stat-text{display:flex;flex-direction:column;min-width:0}
      .stat-text b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .stat-text span{font-size:9px;color:var(--secondary-text-color)}
      .section-title{margin:16px 0 8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .section-title:first-of-type{margin-top:0}
      .gauges{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .gauge{cursor:pointer}
      .gauge-head{display:flex;justify-content:space-between;font-size:10px;color:var(--secondary-text-color);margin-bottom:3px}
      .gauge-head b{font-size:11px}
      .track{height:6px;border-radius:999px;background:var(--edge);overflow:hidden}
      .track i{display:block;height:100%;border-radius:999px;transition:width .3s}
      .info-row{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 14px;margin-top:10px}
      .info-chip{display:flex;justify-content:space-between;font-size:11px;padding:6px 0;border-bottom:1px solid var(--edge)}
      .info-chip span{color:var(--secondary-text-color)}
      .info-chip b{font-weight:700}
      .actions{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      .action-btn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:14px;background:transparent;color:var(--primary-text-color);cursor:pointer}
      .action-btn:hover{border-color:var(--good);color:var(--good)}
      .action-btn ha-icon{--mdc-icon-size:19px}
      .action-btn span{font-size:9px;font-weight:700;text-align:center}
      .toggle-row{display:flex;align-items:center;gap:8px;padding:8px 2px;border-bottom:1px solid var(--edge);cursor:pointer}
      .toggle-row:last-child{border-bottom:0}
      .toggle-row:hover{background:color-mix(in srgb,var(--primary-text-color) 4%,transparent)}
      .toggle-icon{--mdc-icon-size:17px;color:var(--secondary-text-color);flex:0 0 auto}
      .toggle-row.on .toggle-icon{color:var(--good)}
      .toggle-name{flex:1;font-size:12px;font-weight:650}
      .switch{position:relative;flex:0 0 auto;width:30px;height:18px;border-radius:999px;background:var(--edge);transition:background .2s}
      .switch.on{background:var(--good)}
      .switch i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .2s}
      .switch.on i{transform:translateX(12px)}
      .stepper-row{display:flex;align-items:center;gap:8px;padding:8px 2px}
      .stepper-row ha-icon{--mdc-icon-size:17px;color:var(--secondary-text-color)}
      .stepper-row .lbl{flex:1;font-size:12px;font-weight:650}
      .stepper{display:flex;align-items:center;gap:6px}
      .step-btn{width:24px;height:24px;border-radius:999px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));background:transparent;color:var(--primary-text-color);display:grid;place-items:center;cursor:pointer}
      .step-btn:hover{border-color:var(--good);color:var(--good)}
      .step-btn ha-icon{--mdc-icon-size:14px}
      .step-value{font-size:12px;font-weight:800;min-width:32px;text-align:center}
      .select-row{display:flex;align-items:center;gap:8px;padding:8px 2px}
      .select-row ha-icon{--mdc-icon-size:17px;color:var(--secondary-text-color)}
      .select-label{flex:1;font-size:12px;font-weight:650}
      .select-row select{background:transparent;color:var(--primary-text-color);border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:10px;padding:5px 8px;font-size:11px;font-family:inherit}
      .url-row{display:flex;align-items:center;gap:8px;padding:8px 2px;cursor:pointer}
      .url-row ha-icon{--mdc-icon-size:17px;color:var(--secondary-text-color)}
      .url-row span{font-size:11px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .screenshot{margin-top:8px;border-radius:14px;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge))}
      .screenshot img{display:block;width:100%}
      @media(max-width:520px){.stat-grid{grid-template-columns:repeat(2,1fr)}.gauges{grid-template-columns:1fr}.info-row{grid-template-columns:1fr}.actions{grid-template-columns:repeat(3,1fr)}}
    </style>
    <ha-card>
      <div class="head">
        <span class="head-icon"><ha-icon icon="mdi:ubuntu"></ha-icon></span>
        <strong>${this._esc(c.title)}</strong>
        <span class="pill">${healthy ? "Online" : "Offline"}</span>
      </div>
      <div class="stat-grid">
        ${this._statTile("CPU", Number.isFinite(cpu) ? `${this._fmt(cpu, 1)}%` : "—", "mdi:cpu-64-bit")}
        ${this._statTile("RAM", Number.isFinite(ram) ? `${this._fmt(ram, 1)}%` : "—", "mdi:memory")}
        ${this._statTile("Temp", Number.isFinite(temp) ? `${this._fmt(temp, 1)}°C` : "—", "mdi:thermometer")}
        ${this._statTile("Oppetid", this._uptime(c.uptime_entity), "mdi:clock-outline")}
        ${this._statTile("Chrome", this._on(c.chrome_entity) || this._s(c.chrome_entity) === "on" ? "Kører" : this._s(c.chrome_entity) || "—", "mdi:google-chrome")}
        ${this._statTile("Opgraderinger", this._s(c.upgrades_entity) || "0", "mdi:package-up")}
        ${this._statTile("Sidst aktiv", this._relTime(c.last_active_entity), "mdi:motion-sensor")}
        ${this._statTile("Effekt", Number.isFinite(power) ? `${this._fmt(power)} W` : "—", "mdi:flash")}
      </div>

      ${
        c.glances_cpu_entity || c.glances_ram_entity || c.glances_disk_entity
          ? `<div class="section-title">Glances</div>
        <div class="gauges">
          ${c.glances_cpu_entity ? this._gauge("CPU", c.glances_cpu_entity, "%") : ""}
          ${c.glances_ram_entity ? this._gauge("RAM", c.glances_ram_entity, "%") : ""}
          ${c.glances_disk_entity ? this._gauge("Disk", c.glances_disk_entity, "%") : ""}
        </div>
        <div class="info-row">
          ${c.glances_load_entity ? this._infoChip("CPU load", this._s(c.glances_load_entity) || "—") : ""}
          ${c.glances_uptime_entity ? this._infoChip("Uptime", this._s(c.glances_uptime_entity) || "—") : ""}
          ${c.glances_disk_free_entity ? this._infoChip("Ledig disk", this._s(c.glances_disk_free_entity) || "—") : ""}
          ${c.glances_ram_free_entity ? this._infoChip("Ledig RAM", this._s(c.glances_ram_free_entity) || "—") : ""}
          ${c.glances_threads_entity ? this._infoChip("Threads", this._s(c.glances_threads_entity) || "—") : ""}
          ${c.ip_entity ? this._infoChip("IP", this._s(c.ip_entity) || "—") : ""}
        </div>`
          : ""
      }

      ${
        actions.length
          ? `<div class="section-title">Styring</div><div class="actions">${actions.map((a, i) => this._actionBtn(a, i)).join("")}</div>`
          : ""
      }

      ${c.screen_light_entity || c.keyboard_switch_entity || c.smartplug_switch_entity
        ? `<div class="section-title">Til / fra</div>
        ${c.screen_light_entity ? `<div class="toggle-row ${this._on(c.screen_light_entity) ? "on" : ""}" data-entity="${this._esc(c.screen_light_entity)}"><ha-icon class="toggle-icon" icon="mdi:monitor"></ha-icon><span class="toggle-name">Skærm</span><span class="switch ${this._on(c.screen_light_entity) ? "on" : ""}"><i></i></span></div>` : ""}
        ${c.keyboard_switch_entity ? `<div class="toggle-row ${this._on(c.keyboard_switch_entity) ? "on" : ""}" data-entity="${this._esc(c.keyboard_switch_entity)}"><ha-icon class="toggle-icon" icon="mdi:keyboard"></ha-icon><span class="toggle-name">Tastatur</span><span class="switch ${this._on(c.keyboard_switch_entity) ? "on" : ""}"><i></i></span></div>` : ""}
        ${c.smartplug_switch_entity ? `<div class="toggle-row ${this._on(c.smartplug_switch_entity) ? "on" : ""}" data-entity="${this._esc(c.smartplug_switch_entity)}"><ha-icon class="toggle-icon" icon="mdi:power-plug"></ha-icon><span class="toggle-name">Strømstik</span><span class="switch ${this._on(c.smartplug_switch_entity) ? "on" : ""}"><i></i></span></div>` : ""}`
        : ""
      }

      ${
        c.volume_entity || c.zoom_entity || c.window_mode_entity || c.theme_entity || c.url_entity
          ? `<div class="section-title">Kiosk-indstillinger</div>
        ${
          c.volume_entity
            ? `<div class="stepper-row"><ha-icon icon="mdi:volume-high"></ha-icon><span class="lbl">Lydstyrke</span><div class="stepper">
          <button class="step-btn" data-vol-step="-5"><ha-icon icon="mdi:minus"></ha-icon></button>
          <span class="step-value">${Number.isFinite(volume) ? `${this._fmt(volume)}%` : "—"}</span>
          <button class="step-btn" data-vol-step="5"><ha-icon icon="mdi:plus"></ha-icon></button>
        </div></div>`
            : ""
        }
        ${this._selectRow("Zoom", c.zoom_entity, "mdi:magnify-plus")}
        ${this._selectRow("Vindue", c.window_mode_entity, "mdi:window-maximize")}
        ${this._selectRow("Tema", c.theme_entity, "mdi:theme-light-dark")}
        ${c.url_entity ? `<div class="url-row" data-more="${this._esc(c.url_entity)}"><ha-icon icon="mdi:web"></ha-icon><span>${this._esc(this._s(c.url_entity) || "—")}</span></div>` : ""}`
          : ""
      }

      ${
        c.energy_entity
          ? `<div class="section-title">Strøm & net</div><div class="info-row">
        ${this._infoChip("Energi", this._s(c.energy_entity) ? `${this._fmt(Number(this._s(c.energy_entity)), 1)} kWh` : "—")}
        ${c.ip_entity ? this._infoChip("IP", this._s(c.ip_entity) || "—") : ""}
      </div>`
          : ""
      }

      ${screenshotUrl ? `<div class="screenshot" data-more="${this._esc(c.screenshot_entity)}"><img src="${this._esc(screenshotUrl)}" alt="Kiosk screenshot"></div>` : ""}
    </ha-card>`;

    this.shadowRoot.querySelectorAll(".toggle-row[data-entity]").forEach((el) => {
      this._bind(el, el.dataset.entity);
    });
    this.shadowRoot.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", () => this._runAction(actions[Number(el.dataset.action)]));
    });
    this.shadowRoot.querySelectorAll(".gauge[data-more], [data-more]").forEach((el) => {
      el.addEventListener("click", () => this._more(el.dataset.more));
    });
    this.shadowRoot.querySelectorAll("[data-vol-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!c.volume_entity) return;
        const next = Math.max(0, Math.min(100, (volume || 0) + Number(btn.dataset.volStep)));
        this._hass?.callService("number", "set_value", { entity_id: c.volume_entity, value: next });
      });
    });
    this.shadowRoot.querySelectorAll("select[data-select]").forEach((sel) => {
      sel.addEventListener("change", () => {
        this._hass?.callService("select", "select_option", {
          entity_id: sel.dataset.select,
          option: sel.value,
        });
      });
    });
  }
  getCardSize() {
    return 18;
  }
}

if (!customElements.get("ha-kiosk-server-card"))
  customElements.define("ha-kiosk-server-card", HAKioskServerCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-kiosk-server-card",
  name: "HA Kiosk Server Card",
  description: "Samlet kort til kiosk-pc: status, Glances, styring og kiosk-indstillinger",
  preview: true,
});
console.info(
  `%c HA KIOSK SERVER CARD %c v${VERSION} `,
  "color:white;background:#5a3ea8;font-weight:700",
  "color:#d3c6f5;background:#161b22",
);
