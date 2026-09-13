const VERSION = "0.3.0";

const DEFAULT_ICONS = {
  Normal: "mdi:home",
  Stille: "mdi:volume-mute",
  Nat: "mdi:weather-night",
  "Ingen hjemme": "mdi:home-export-outline",
  Ferie: "mdi:palm-tree",
  Gæster: "mdi:account-group",
};

class HAHouseModeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return {
      title: "Hus-mode",
      mode_entity: "input_select.house_mode",
      notification_entity: "sensor.example_notification_level",
      auto_away_entity: "input_boolean.example_auto_away",
      overrides: [{ entity: "input_boolean.example_guest", name: "Gæster", icon: "mdi:account-group" }],
    };
  }
  setConfig(config) {
    if (!config?.mode_entity) throw new Error("Kortet kræver en mode_entity");
    this._config = { title: "Hus-mode", overrides: [], mode_icons: {}, ...config };
    this._render();
  }
  _watchedIds() {
    return [
      this._config.mode_entity,
      this._config.notification_entity,
      this._config.auto_away_entity,
      ...(this._config.overrides || []).map((o) => o.entity),
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
  _selectMode(option) {
    if (!this._config.mode_entity) return;
    this._hass?.callService("input_select", "select_option", {
      entity_id: this._config.mode_entity,
      option,
    });
  }
  _toggle(entityId) {
    if (!entityId) return;
    this._hass?.callService("homeassistant", "toggle", { entity_id: entityId });
  }
  _icon(option) {
    return this._config.mode_icons?.[option] || DEFAULT_ICONS[option] || "mdi:home-outline";
  }
  _render() {
    if (!this.shadowRoot) return;
    const modeEntity = this._e(this._config.mode_entity);
    const options = modeEntity?.attributes?.options || [];
    const current = modeEntity?.state;
    const notif = this._e(this._config.notification_entity);
    const autoAway = this._e(this._config.auto_away_entity)?.state === "on";
    const overrides = this._config.overrides || [];

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{padding:18px;border-radius:20px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
      .head strong{font-size:16px}
      .current{display:flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;font-size:11px;font-weight:800;background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good)}
      .current ha-icon{--mdc-icon-size:14px}
      .modes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .mode-tile{--tone:var(--accent);display:flex;flex-direction:column;align-items:center;gap:6px;padding:13px 6px;border:1px solid color-mix(in srgb,var(--tone) 16%,var(--edge));border-left:3px solid var(--tone);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);color:var(--primary-text-color);cursor:pointer;text-align:center}
      .mode-tile:hover{border-color:var(--primary-text-color)}
      .mode-tile.active{--tone:var(--good);background:linear-gradient(145deg,color-mix(in srgb,var(--good) 12%,transparent),transparent 55%)}
      .mode-tile ha-icon{--mdc-icon-size:22px;color:var(--secondary-text-color)}
      .mode-tile.active ha-icon{color:var(--good)}
      .mode-tile span{font-size:10px;font-weight:700}
      .section-title{margin:16px 0 8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
      .row{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid color-mix(in srgb,var(--accent) 14%,var(--edge));border-left:3px solid var(--accent);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 5%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);cursor:pointer}
      .row ha-icon{--mdc-icon-size:20px;color:var(--secondary-text-color);flex:0 0 auto}
      .row .row-text{min-width:0;flex:1;display:flex;flex-direction:column}
      .row .row-text b{font-size:12px}
      .row .row-text span{font-size:10px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .switch-row{justify-content:space-between;cursor:default}
      .switch{position:relative;flex:0 0 auto;width:38px;height:22px;border-radius:999px;background:var(--edge);cursor:pointer;transition:background .2s}
      .switch.on{background:var(--good)}
      .switch i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s}
      .switch.on i{transform:translateX(16px)}
      .overrides{display:grid;grid-template-columns:repeat(${Math.max(overrides.length, 1)},1fr);gap:8px;margin-top:8px}
      .ov-tile{--tone:var(--accent);display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;border:1px solid color-mix(in srgb,var(--tone) 16%,var(--edge));border-left:3px solid var(--tone);border-radius:13px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 6%,transparent),transparent 55%);color:var(--primary-text-color);cursor:pointer}
      .ov-tile.on{--tone:var(--warn);background:linear-gradient(145deg,color-mix(in srgb,var(--warn) 12%,transparent),transparent 55%)}
      .ov-tile ha-icon{--mdc-icon-size:18px;color:var(--secondary-text-color)}
      .ov-tile.on ha-icon{color:var(--warn)}
      .ov-tile span{font-size:9px;font-weight:700}
      @media(max-width:480px){.modes{grid-template-columns:repeat(3,1fr)}}
    </style>
    <ha-card>
      <div class="head">
        <strong>${this._esc(this._config.title)}</strong>
        ${current ? `<span class="current"><ha-icon icon="${this._esc(this._icon(current))}"></ha-icon>${this._esc(current)}</span>` : ""}
      </div>
      <div class="modes">
        ${options
          .map(
            (opt) => `<button class="mode-tile ${opt === current ? "active" : ""}" data-mode="${this._esc(opt)}">
          <ha-icon icon="${this._esc(this._icon(opt))}"></ha-icon>
          <span>${this._esc(opt)}</span>
        </button>`,
          )
          .join("")}
      </div>
      ${
        this._config.notification_entity || this._config.auto_away_entity
          ? `<div class="section-title">Adfærd</div>
        ${
          this._config.notification_entity
            ? `<div class="row" data-more="${this._esc(this._config.notification_entity)}">
          <ha-icon icon="${this._esc(notif?.attributes?.icon || "mdi:message-alert-outline")}"></ha-icon>
          <span class="row-text"><b>Notifikationer: ${this._esc(notif?.state || "—")}</b><span>${this._esc(notif?.attributes?.beskrivelse || "")}</span></span>
        </div>`
            : ""
        }
        ${
          this._config.auto_away_entity
            ? `<div class="row switch-row" style="margin-top:8px">
          <ha-icon icon="mdi:home-export-outline"></ha-icon>
          <span class="row-text"><b>Automatisk fravær</b><span>${autoAway ? "Aktiv" : "Inaktiv"}</span></span>
          <div class="switch ${autoAway ? "on" : ""}" data-switch="${this._esc(this._config.auto_away_entity)}"><i></i></div>
        </div>`
            : ""
        }`
          : ""
      }
      ${
        overrides.length
          ? `<div class="section-title">Overstyringer</div>
        <div class="overrides">${overrides
          .map((o) => {
            const on = this._e(o.entity)?.state === "on";
            return `<button class="ov-tile ${on ? "on" : ""}" data-entity="${this._esc(o.entity)}">
              <ha-icon icon="${this._esc(o.icon || "mdi:toggle-switch-outline")}"></ha-icon>
              <span>${this._esc(o.name || o.entity)}</span>
            </button>`;
          })
          .join("")}</div>`
          : ""
      }
    </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-mode]").forEach((el) => {
      el.addEventListener("click", () => this._selectMode(el.dataset.mode));
    });
    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => {
      el.addEventListener("click", () => this._more(el.dataset.more));
    });
    this.shadowRoot.querySelectorAll("[data-switch]").forEach((el) => {
      el.addEventListener("click", () => this._toggle(el.dataset.switch));
    });
    this.shadowRoot.querySelectorAll(".ov-tile[data-entity]").forEach((el) => {
      el.addEventListener("click", () => this._toggle(el.dataset.entity));
    });
  }
  getCardSize() {
    return 6;
  }
}

if (!customElements.get("ha-house-mode-card"))
  customElements.define("ha-house-mode-card", HAHouseModeCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-house-mode-card",
  name: "HA House Mode Card",
  description: "Samlet kort til hus-mode, notifikationsniveau og overstyringer",
  preview: true,
});
console.info(
  `%c HA HOUSE MODE CARD %c v${VERSION} `,
  "color:white;background:#c27a3f;font-weight:700",
  "color:#f5d3ab;background:#161b22",
);
