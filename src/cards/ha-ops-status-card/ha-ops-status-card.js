const VERSION = "0.3.0";

const BAD_STATES = ["off", "critical", "error", "unavailable"];
const WARN_STATES = ["warn", "warning"];

class HAOpsStatusCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return { title: "Driftstatus", actions: [], health_items: [] };
  }
  setConfig(config) {
    this._config = { title: "Driftstatus", actions: [], health_items: [], ...config };
    this._render();
  }
  _watchedIds() {
    return [
      this._config.ha_uptime,
      this._config.ha_core,
      this._config.ha_supervisor,
      this._config.kiosk_uptime,
      this._config.kiosk_cpu,
      this._config.kiosk_memory,
      this._config.backup_entity,
      ...(this._config.actions || []).map((a) => a.target_entity),
      ...(this._config.health_items || []).map((h) => h.entity),
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
  _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  _more(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
    );
  }
  _haInfo() {
    if (!this._config.ha_uptime) return null;
    const uptime = this._e(this._config.ha_uptime)?.state || "N/A";
    const core = this._e(this._config.ha_core)?.attributes?.installed_version || "N/A";
    const supervisor = this._e(this._config.ha_supervisor)?.attributes?.installed_version || "N/A";
    return { name: "Home Assistant", icon: "mdi:home-assistant", line1: `Oppetid: ${uptime}`, line2: `Core: ${core} · Supervisor: ${supervisor}` };
  }
  _kioskInfo() {
    if (!this._config.kiosk_uptime) return null;
    const minutes = Number(this._e(this._config.kiosk_uptime)?.state);
    const cpu = this._e(this._config.kiosk_cpu)?.state ?? "N/A";
    const mem = this._e(this._config.kiosk_memory)?.state ?? "N/A";
    let uptimeTxt = "N/A";
    if (Number.isFinite(minutes)) {
      const days = Math.floor(minutes / (60 * 24));
      const hours = Math.floor((minutes % (60 * 24)) / 60);
      uptimeTxt = `${days}d ${hours}t`;
    }
    return { name: "Kiosk", icon: "mdi:tablet-dashboard", line1: `Oppetid: ${uptimeTxt}`, line2: `CPU: ${cpu}% · RAM: ${mem}%` };
  }
  _backupInfo() {
    if (!this._config.backup_entity) return null;
    const e = this._e(this._config.backup_entity);
    const st = e?.state;
    const ok = st === "backed_up";
    const last = e?.attributes?.last_backup;
    let whenTxt = "Seneste backup: N/A";
    if (last) {
      const date = new Date(last);
      const now = new Date();
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const time = date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", ".");
      if (date.toDateString() === now.toDateString()) whenTxt = `Seneste: I dag kl. ${time}`;
      else if (date.toDateString() === yesterday.toDateString()) whenTxt = `Seneste: I går kl. ${time}`;
      else whenTxt = `Seneste: ${date.toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" })} kl. ${time}`;
    }
    return { name: "Backup", icon: ok ? "mdi:cloud-check-outline" : "mdi:cloud-alert-outline", ok, line1: ok ? "Alt ok" : "Kræver opmærksomhed", line2: whenTxt };
  }
  _statusTile(info) {
    if (!info) return "";
    const badClass = info.ok === false ? "bad" : "";
    return `<div class="stile ${badClass}">
      <span class="stile-icon"><ha-icon icon="${this._esc(info.icon)}"></ha-icon></span>
      <span class="stile-text"><b>${this._esc(info.name)}</b><span>${this._esc(info.line1)}</span><span>${this._esc(info.line2)}</span></span>
    </div>`;
  }
  _runAction(action) {
    if (!action?.service) return;
    const [domain, service] = action.service.split(".");
    if (!domain || !service) return;
    this._hass?.callService(domain, service, { entity_id: action.target_entity });
  }
  _healthState(e) {
    if (!e) return "unknown";
    const s = (e.state || "").toLowerCase();
    if (BAD_STATES.includes(s)) return "bad";
    if (WARN_STATES.includes(s)) return "warn";
    return "good";
  }
  _healthTile(item) {
    const e = this._e(item.entity);
    const level = this._healthState(e);
    const icon = level === "bad" ? "mdi:alert-circle" : level === "warn" ? "mdi:alert" : "mdi:check-circle";
    const label = item.state_labels?.[e?.state] || e?.state || "—";
    return `<button class="htile ${level}" data-entity="${this._esc(item.entity)}">
      <ha-icon icon="${this._esc(item.icon || icon)}"></ha-icon>
      <span class="htile-text"><b>${this._esc(item.name)}</b><span>${this._esc(label)}</span></span>
    </button>`;
  }
  _render() {
    if (!this.shadowRoot) return;
    const statuses = [this._haInfo(), this._kioskInfo(), this._backupInfo()].filter(Boolean);
    const actions = this._config.actions || [];
    const healthItems = this._config.health_items || [];

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{padding:18px;border-radius:20px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{margin-bottom:14px}
      .head strong{font-size:16px}
      .statuses{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .stile{--tone:var(--good);display:flex;align-items:center;gap:10px;padding:12px;border:1px solid color-mix(in srgb,var(--tone) 16%,var(--edge));border-left:3px solid var(--tone);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08)}
      .stile.bad{--tone:var(--danger)}
      .stile-icon{--mdc-icon-size:22px;color:var(--tone);flex:0 0 auto}
      .stile-text{min-width:0;display:flex;flex-direction:column}
      .stile-text b{font-size:12px}
      .stile-text span{font-size:10px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .section-title{margin:16px 0 8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .actions{display:grid;grid-template-columns:repeat(${Math.max(actions.length, 1)},1fr);gap:8px}
      .action-btn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:13px 6px;border:1px solid color-mix(in srgb,var(--accent) 16%,var(--edge));border-radius:14px;background:transparent;color:var(--primary-text-color);cursor:pointer}
      .action-btn:hover{border-color:var(--good);color:var(--good)}
      .action-btn ha-icon{--mdc-icon-size:20px}
      .action-btn span{font-size:10px;font-weight:700}
      .health{display:grid;grid-template-columns:repeat(${Math.max(healthItems.length, 1)},1fr);gap:8px;margin-top:8px}
      .htile{--tone:var(--good);display:flex;align-items:center;gap:8px;padding:10px;border:1px solid color-mix(in srgb,var(--tone) 16%,var(--edge));border-left:3px solid var(--tone);border-radius:13px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 6%,transparent),transparent 55%);color:var(--primary-text-color);cursor:pointer;text-align:left}
      .htile ha-icon{--mdc-icon-size:18px;color:var(--tone)}
      .htile.warn{--tone:var(--warn)}
      .htile.bad{--tone:var(--danger)}
      .htile-text{display:flex;flex-direction:column;min-width:0}
      .htile-text b{font-size:11px}
      .htile-text span{font-size:9px;color:var(--secondary-text-color)}
      @media(max-width:600px){.statuses{grid-template-columns:1fr}.actions{grid-template-columns:repeat(2,1fr)}.health{grid-template-columns:repeat(2,1fr)}}
    </style>
    <ha-card>
      <div class="head"><strong>${this._esc(this._config.title)}</strong></div>
      <div class="statuses">${statuses.map((s) => this._statusTile(s)).join("")}</div>
      ${
        actions.length
          ? `<div class="section-title">Handlinger</div><div class="actions">${actions
              .map(
                (a, i) => `<button class="action-btn" data-action="${i}">
            <ha-icon icon="${this._esc(a.icon || "mdi:play")}"></ha-icon>
            <span>${this._esc(a.name)}</span>
          </button>`,
              )
              .join("")}</div>`
          : ""
      }
      ${
        healthItems.length
          ? `<div class="health">${healthItems.map((h) => this._healthTile(h)).join("")}</div>`
          : ""
      }
    </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", () => this._runAction(actions[Number(el.dataset.action)]));
    });
    this.shadowRoot.querySelectorAll(".htile[data-entity]").forEach((el) => {
      el.addEventListener("click", () => this._more(el.dataset.entity));
    });
  }
  getCardSize() {
    return 5;
  }
}

if (!customElements.get("ha-ops-status-card"))
  customElements.define("ha-ops-status-card", HAOpsStatusCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-ops-status-card",
  name: "HA Ops Status Card",
  description: "Samlet driftstatus for Home Assistant, kiosk og backup med handlinger",
  preview: true,
});
console.info(
  `%c HA OPS STATUS CARD %c v${VERSION} `,
  "color:white;background:#4f6d8f;font-weight:700",
  "color:#b8d0e8;background:#161b22",
);
