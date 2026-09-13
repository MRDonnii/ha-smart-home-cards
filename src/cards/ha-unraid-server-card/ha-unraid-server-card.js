const VERSION = "0.2.0";

class HAUnraidServerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return {
      title: "Unraid-server",
      ssh_entity: "binary_sensor.example_ssh_online",
      array_state_entity: "sensor.example_array_state",
      disk_health_entity: "sensor.example_disk_health",
      docker_running_entity: "sensor.example_docker_running",
      vm_running_entity: "sensor.example_vm_running",
      power_entity: "sensor.example_power",
      cpu_entity: "sensor.example_cpu_usage",
      ram_entity: "sensor.example_ram_usage",
      cpu_temp_entity: "sensor.example_cpu_temperature",
      array_usage_entity: "sensor.example_array_usage",
      disks: [],
      containers: [],
      vms: [],
    };
  }
  setConfig(config) {
    this._config = { title: "Server", disks: [], containers: [], vms: [], ...config };
    this._render();
  }
  _watchedIds() {
    return [
      this._config.ssh_entity,
      this._config.array_state_entity,
      this._config.disk_health_entity,
      this._config.docker_running_entity,
      this._config.vm_running_entity,
      this._config.power_entity,
      this._config.cpu_entity,
      this._config.ram_entity,
      this._config.cpu_temp_entity,
      this._config.array_usage_entity,
      this._config.version_entity,
      this._config.api_version_entity,
      this._config.up_since_entity,
      this._config.notifications_entity,
      this._config.updates_entity,
      this._config.array_started_entity,
      this._config.parity_valid_entity,
      this._config.parity_check_entity,
      this._config.docker_cpu_entity,
      this._config.docker_ram_entity,
      this._config.docker_updates_entity,
      ...(this._config.disks || []).flatMap((d) => [d.usage_entity, d.health_entity]),
      ...(this._config.containers || []).map((c) => c.entity),
      ...(this._config.vms || []).map((v) => v.entity),
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
  _relTime(id) {
    const s = this._s(id);
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return days <= 0 ? "I dag" : `${days}d siden`;
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
  _diskRow(disk) {
    const usage = this._num(disk.usage_entity);
    const healthy = disk.health_entity ? this._on(disk.health_entity) : undefined;
    const color = this._barColor(usage);
    return `<div class="disk-row">
      <span class="disk-name">${this._esc(disk.name)}</span>
      <div class="track"><i style="width:${Math.min(100, usage || 0)}%;background:${color}"></i></div>
      <span class="disk-usage">${Number.isFinite(usage) ? `${this._fmt(usage, 1)}%` : "—"}</span>
      ${healthy !== undefined ? `<ha-icon class="disk-health ${healthy ? "ok" : "bad"}" icon="${healthy ? "mdi:check-circle" : "mdi:alert-circle"}"></ha-icon>` : ""}
    </div>`;
  }
  _toggleRow(item) {
    const on = this._on(item.entity);
    const unavailable = this._s(item.entity) === "unavailable" || this._s(item.entity) === undefined;
    return `<div class="toggle-row ${on ? "on" : ""} ${unavailable ? "unavailable" : ""}" data-entity="${this._esc(item.entity)}">
      <ha-icon class="toggle-icon" icon="${this._esc(item.icon || "mdi:docker")}"></ha-icon>
      <span class="toggle-name">${this._esc(item.name)}</span>
      <span class="switch ${on ? "on" : ""}"><i></i></span>
    </div>`;
  }
  _render() {
    if (!this.shadowRoot) return;
    const c = this._config;
    const sshOn = this._on(c.ssh_entity);
    const power = this._num(c.power_entity);
    const cpu = this._num(c.cpu_entity);
    const ram = this._num(c.ram_entity);
    const cpuTemp = this._num(c.cpu_temp_entity);

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{position:relative;overflow:hidden;padding:18px;border-left:4px solid ${sshOn ? "var(--good)" : "var(--danger)"};border-radius:20px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
      .head-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:color-mix(in srgb,${sshOn ? "var(--good)" : "var(--danger)"} 18%,transparent);color:${sshOn ? "var(--good)" : "var(--danger)"};flex:0 0 auto}
      .head-icon ha-icon{--mdc-icon-size:22px}
      .head strong{flex:1;font-size:16px}
      .head .pill{padding:4px 10px;border-radius:999px;font-size:10px;font-weight:800;background:color-mix(in srgb,${sshOn ? "var(--good)" : "var(--danger)"} 16%,transparent);color:${sshOn ? "var(--good)" : "var(--danger)"}}
      .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
      .stat-tile{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:13px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08)}
      .stat-tile ha-icon{--mdc-icon-size:18px;color:var(--secondary-text-color);flex:0 0 auto}
      .stat-text{display:flex;flex-direction:column;min-width:0}
      .stat-text b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .stat-text span{font-size:9px;color:var(--secondary-text-color)}
      .section-title{display:flex;align-items:center;gap:6px;margin:16px 0 8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .section-title:first-of-type{margin-top:0}
      .gauges{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
      .gauge{cursor:pointer}
      .gauge-head{display:flex;justify-content:space-between;font-size:10px;color:var(--secondary-text-color);margin-bottom:3px}
      .gauge-head b{font-size:11px}
      .track{height:6px;border-radius:999px;background:var(--edge);overflow:hidden}
      .track i{display:block;height:100%;border-radius:999px;transition:width .3s}
      .info-row{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 14px;margin-top:10px}
      .info-chip{display:flex;justify-content:space-between;font-size:11px;padding:6px 0;border-bottom:1px solid var(--edge)}
      .info-chip span{color:var(--secondary-text-color)}
      .info-chip b{font-weight:700}
      .disks{display:flex;flex-direction:column;gap:8px}
      .disk-row{display:grid;grid-template-columns:70px 1fr 44px 18px;align-items:center;gap:8px}
      .disk-name{font-size:11px;font-weight:700}
      .disk-usage{font-size:10px;color:var(--secondary-text-color);text-align:right}
      .disk-health{--mdc-icon-size:16px}
      .disk-health.ok{color:var(--good)}
      .disk-health.bad{color:var(--danger)}
      .toggles{display:grid;grid-template-columns:repeat(2,1fr);column-gap:16px}
      .toggle-row{display:flex;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px solid var(--edge);cursor:pointer}
      .toggle-row:hover{background:color-mix(in srgb,var(--primary-text-color) 4%,transparent)}
      .toggle-row.unavailable{opacity:.35;pointer-events:none}
      .toggle-icon{--mdc-icon-size:16px;color:var(--secondary-text-color);flex:0 0 auto}
      .toggle-row.on .toggle-icon{color:var(--good)}
      .toggle-name{flex:1;min-width:0;font-size:11px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .switch{position:relative;flex:0 0 auto;width:28px;height:17px;border-radius:999px;background:var(--edge);transition:background .2s}
      .switch.on{background:var(--good)}
      .switch i{position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;transition:transform .2s}
      .switch.on i{transform:translateX(11px)}
      @media(max-width:520px){.stat-grid{grid-template-columns:repeat(2,1fr)}.gauges{grid-template-columns:1fr}.info-row{grid-template-columns:1fr}.toggles{grid-template-columns:1fr}}
    </style>
    <ha-card>
      <div class="head">
        <span class="head-icon"><ha-icon icon="mdi:server"></ha-icon></span>
        <strong>${this._esc(c.title)}</strong>
        <span class="pill">${sshOn ? "Online" : "Offline"}</span>
      </div>
      <div class="stat-grid">
        ${this._statTile("Array", this._s(c.array_state_entity) || "—", "mdi:harddisk")}
        ${this._statTile("Disk health", this._s(c.disk_health_entity) || "—", "mdi:heart-pulse")}
        ${this._statTile("Docker", this._s(c.docker_running_entity) || "—", "mdi:docker")}
        ${this._statTile("VM", this._s(c.vm_running_entity) || "—", "mdi:monitor")}
        ${this._statTile("Power", Number.isFinite(power) ? `${this._fmt(power)} W` : "—", "mdi:flash")}
        ${this._statTile("CPU temp", Number.isFinite(cpuTemp) ? `${this._fmt(cpuTemp, 1)}°C` : "—", "mdi:thermometer")}
        ${this._statTile("Notifikationer", this._s(c.notifications_entity) || "0", "mdi:bell-outline")}
        ${this._statTile("Opdateringer", this._s(c.updates_entity) || "0", "mdi:package-up")}
      </div>

      <div class="section-title">Unraid load</div>
      <div class="gauges">
        ${this._gauge("Array", c.array_usage_entity, "%")}
        ${this._gauge("CPU", c.cpu_entity, "%")}
        ${this._gauge("RAM", c.ram_entity, "%")}
        ${this._gauge("CPU temp", c.cpu_temp_entity, "°C")}
      </div>
      <div class="info-row">
        ${c.version_entity ? this._infoChip("Unraid", this._s(c.version_entity) || "—") : ""}
        ${c.api_version_entity ? this._infoChip("API", this._s(c.api_version_entity) || "—") : ""}
        ${c.up_since_entity ? this._infoChip("Oppe siden", this._relTime(c.up_since_entity)) : ""}
        ${c.array_started_entity ? this._infoChip("Array startet", this._on(c.array_started_entity) ? "Ja" : "Nej") : ""}
        ${c.parity_valid_entity ? this._infoChip("Paritet", this._on(c.parity_valid_entity) ? "Ugyldig" : "Gyldig") : ""}
        ${c.parity_check_entity ? this._infoChip("Paritetstjek", this._on(c.parity_check_entity) ? "Kører" : "Idle") : ""}
      </div>

      ${
        (c.disks || []).length
          ? `<div class="section-title">Diske</div><div class="disks">${c.disks.map((d) => this._diskRow(d)).join("")}</div>`
          : ""
      }

      ${
        (c.containers || []).length
          ? `<div class="section-title">Docker containere</div>
        <div class="info-row">
          ${c.docker_cpu_entity ? this._infoChip("Docker CPU", Number.isFinite(this._num(c.docker_cpu_entity)) ? `${this._fmt(this._num(c.docker_cpu_entity), 1)}%` : "—") : ""}
          ${c.docker_ram_entity ? this._infoChip("Docker RAM", Number.isFinite(this._num(c.docker_ram_entity)) ? `${this._fmt(this._num(c.docker_ram_entity), 1)}%` : "—") : ""}
        </div>
        <div class="toggles" style="margin-top:8px">${c.containers.map((ct) => this._toggleRow(ct)).join("")}</div>`
          : ""
      }

      ${
        (c.vms || []).length
          ? `<div class="section-title">Virtuelle maskiner</div><div class="toggles">${c.vms.map((v) => this._toggleRow(v)).join("")}</div>`
          : ""
      }
    </ha-card>`;

    this.shadowRoot.querySelectorAll(".toggle-row[data-entity]").forEach((el) => {
      this._bind(el, el.dataset.entity);
    });
    this.shadowRoot.querySelectorAll(".gauge[data-more]").forEach((el) => {
      el.addEventListener("click", () => this._more(el.dataset.more));
    });
  }
  getCardSize() {
    return 20;
  }
}

if (!customElements.get("ha-unraid-server-card"))
  customElements.define("ha-unraid-server-card", HAUnraidServerCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-unraid-server-card",
  name: "HA Unraid Server Card",
  description: "Samlet kort til Unraid-server: status, load, diske, Docker-containere og VM'er",
  preview: true,
});
console.info(
  `%c HA UNRAID SERVER CARD %c v${VERSION} `,
  "color:white;background:#f15a24;font-weight:700",
  "color:#ffcbb0;background:#161b22",
);
