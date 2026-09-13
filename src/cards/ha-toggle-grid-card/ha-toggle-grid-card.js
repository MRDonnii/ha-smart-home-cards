const VERSION = "0.5.0";

const ACTIVE_STATES = ["on", "open", "unlocked", "home", "cleaning", "playing"];

class HAToggleGridCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return {
      title: "Til / fra",
      columns: 1,
      items: [{ entity: "switch.example", name: "Eksempel", icon: "mdi:toggle-switch-outline" }],
    };
  }
  setConfig(config) {
    if (!config?.items?.length) throw new Error("Kortet kræver mindst ét item");
    this._config = { title: "", columns: 1, items: [], ...config };
    this._render();
  }
  _watchedIds() {
    return (this._config.items || []).map((i) => i.entity).filter(Boolean);
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
  _label(e, on) {
    if (!e) return "—";
    const domain = e.entity_id.split(".")[0];
    if (domain === "valve") return on ? "Åben" : "Lukket";
    if (domain === "automation") return on ? "Aktiveret" : "Deaktiveret";
    return on ? "Til" : "Fra";
  }
  _row(item) {
    const e = this._e(item.entity);
    const on = e ? ACTIVE_STATES.includes(e.state) : false;
    const unavailable = !e || e.state === "unavailable";
    return `<div class="row ${on ? "on" : ""} ${unavailable ? "unavailable" : ""}" data-entity="${this._esc(item.entity)}">
      <ha-icon class="row-icon" icon="${this._esc(item.icon || e?.attributes?.icon || "mdi:toggle-switch-outline")}"></ha-icon>
      <span class="row-name">${this._esc(item.name || e?.attributes?.friendly_name || item.entity)}</span>
      <span class="row-state">${this._esc(unavailable ? "—" : this._label(e, on))}</span>
      <span class="switch ${on ? "on" : ""}"><i></i></span>
    </div>`;
  }
  _tile(item) {
    const e = this._e(item.entity);
    const on = e ? ACTIVE_STATES.includes(e.state) : false;
    const unavailable = !e || e.state === "unavailable";
    return `<button class="tile ${on ? "on" : ""} ${unavailable ? "unavailable" : ""}" data-entity="${this._esc(item.entity)}">
      <ha-icon class="tile-icon" icon="${this._esc(item.icon || e?.attributes?.icon || "mdi:toggle-switch-outline")}"></ha-icon>
      <span class="tile-name">${this._esc(item.name || e?.attributes?.friendly_name || item.entity)}</span>
      <span class="tile-state">${this._esc(unavailable ? "—" : this._label(e, on))}</span>
    </button>`;
  }
  _render() {
    if (!this.shadowRoot) return;
    const items = this._config.items || [];
    const tiles = this._config.layout === "tiles";
    const cols = Number(this._config.columns) || (tiles ? 3 : 1);

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--good:var(--dashboard-success, var(--success-color, #54d9aa));--warn:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{padding:16px 18px;border-radius:20px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{margin-bottom:6px}
      .head strong{font-size:14px;display:block;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.05em;font-size:10px;font-weight:800}
      .head span{display:block;margin-top:2px;font-size:11px;color:var(--secondary-text-color)}
      .rows{display:grid;grid-template-columns:repeat(${cols},1fr);column-gap:18px}
      .row{display:flex;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid var(--edge);cursor:pointer}
      .rows > .row:nth-last-child(-n+${cols}){border-bottom:0}
      .row:hover{background:color-mix(in srgb,var(--primary-text-color) 4%,transparent)}
      .row.unavailable{opacity:.4;pointer-events:none}
      .row-icon{--mdc-icon-size:18px;color:var(--secondary-text-color);flex:0 0 auto}
      .row.on .row-icon{color:var(--good)}
      .row-name{flex:1;min-width:0;font-size:12px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .row-state{font-size:10px;font-weight:700;color:var(--secondary-text-color);flex:0 0 auto}
      .row.on .row-state{color:var(--good)}
      .switch{position:relative;flex:0 0 auto;width:32px;height:19px;border-radius:999px;background:var(--edge);transition:background .2s}
      .switch.on{background:var(--good)}
      .switch i{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:transform .2s}
      .switch.on i{transform:translateX(13px)}
      .tiles{display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px}
      .tile{--tone:var(--accent);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px 10px;border:1px solid color-mix(in srgb,var(--tone) 16%,var(--edge));border-left:3px solid var(--tone);border-radius:18px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 6%,transparent),transparent 55%);box-shadow:0 4px 12px rgba(0,0,0,.08);color:var(--primary-text-color);cursor:pointer;text-align:center;min-height:96px}
      .tile:hover{border-color:var(--primary-text-color)}
      .tile.on{--tone:var(--good);background:linear-gradient(145deg,color-mix(in srgb,var(--good) 12%,transparent),transparent 55%)}
      .tile.unavailable{opacity:.4;pointer-events:none}
      .tile-icon{--mdc-icon-size:30px;color:var(--secondary-text-color)}
      .tile.on .tile-icon{color:var(--good)}
      .tile-name{font-size:13px;font-weight:750;line-height:1.2}
      .tile-state{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--secondary-text-color)}
      .tile.on .tile-state{color:var(--good)}
      @media(max-width:480px){.tiles{grid-template-columns:repeat(2,1fr)}}
    </style>
    <ha-card>
      ${this._config.title ? `<div class="head"><strong>${this._esc(this._config.title)}</strong>${this._config.subtitle ? `<span>${this._esc(this._config.subtitle)}</span>` : ""}</div>` : ""}
      ${tiles ? `<div class="tiles">${items.map((i) => this._tile(i)).join("")}</div>` : `<div class="rows">${items.map((i) => this._row(i)).join("")}</div>`}
    </ha-card>`;

    this.shadowRoot.querySelectorAll(".row[data-entity], .tile[data-entity]").forEach((el) => {
      this._bind(el, el.dataset.entity);
    });
  }
  getCardSize() {
    const tiles = this._config.layout === "tiles";
    const cols = Number(this._config.columns) || (tiles ? 3 : 1);
    const rows = Math.ceil((this._config.items || []).length / cols);
    return tiles ? rows * 2 + 1 : Math.max(2, Math.round(rows * 0.7) + 1);
  }
}

if (!customElements.get("ha-toggle-grid-card"))
  customElements.define("ha-toggle-grid-card", HAToggleGridCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-toggle-grid-card",
  name: "HA Toggle Grid Card",
  description: "Poleret grid af til/fra-kontroller til switches, automations og input_booleans",
  preview: true,
});
console.info(
  `%c HA TOGGLE GRID CARD %c v${VERSION} `,
  "color:white;background:#4a8f5c;font-weight:700",
  "color:#a6e6b6;background:#161b22",
);
