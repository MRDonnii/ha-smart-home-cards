const VERSION = "0.4.0";

class HANumberGridCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return {
      title: "Justeringer",
      columns: 1,
      items: [{ entity: "input_number.example", name: "Eksempel" }],
    };
  }
  setConfig(config) {
    if (!config?.items?.length) throw new Error("Kortet kræver mindst ét item");
    this._config = { title: "", columns: 1, items: [], ...config };
    this._render();
  }
  _watchedIds() {
    return (this._config.items || []).flatMap((i) => [i.entity, i.sensor_entity]).filter(Boolean);
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
  _fmt(v) {
    if (!Number.isFinite(v)) return "—";
    const digits = Math.abs(v) < 10 && !Number.isInteger(v) ? 1 : 0;
    return v.toLocaleString("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  _step(entityId, dir) {
    const e = this._e(entityId);
    if (!e) return;
    const step = Number(e.attributes?.step) || 1;
    const min = Number(e.attributes?.min);
    const max = Number(e.attributes?.max);
    let next = Number(e.state) + dir * step;
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    this._hass?.callService("input_number", "set_value", { entity_id: entityId, value: next });
  }
  _more(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
    );
  }
  _row(item) {
    const e = this._e(item.entity);
    const value = Number(e?.state);
    const unit = item.unit || e?.attributes?.unit_of_measurement || "";
    const sensorVal = item.sensor_entity ? Number(this._e(item.sensor_entity)?.state) : undefined;
    return `<div class="row">
      <span class="row-name" data-more="${this._esc(item.entity)}">${this._esc(item.name || e?.attributes?.friendly_name || item.entity)}${Number.isFinite(sensorVal) ? `<small>Nu: ${this._fmt(sensorVal)}${this._esc(item.sensor_unit || "")}</small>` : ""}</span>
      <div class="stepper">
        <button class="step-btn" data-step="-1" data-entity="${this._esc(item.entity)}"><ha-icon icon="mdi:minus"></ha-icon></button>
        <span class="row-value">${this._fmt(value)}<small>${this._esc(unit)}</small></span>
        <button class="step-btn" data-step="1" data-entity="${this._esc(item.entity)}"><ha-icon icon="mdi:plus"></ha-icon></button>
      </div>
    </div>`;
  }
  _render() {
    if (!this.shadowRoot) return;
    const items = this._config.items || [];
    const cols = Number(this._config.columns) || 1;

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #54d9aa));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{padding:16px 18px;border-radius:20px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{margin-bottom:6px}
      .head strong{display:block;font-size:10px;font-weight:800;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.05em}
      .head span{display:block;margin-top:2px;font-size:11px;color:var(--secondary-text-color)}
      .rows{display:grid;grid-template-columns:repeat(${cols},1fr);column-gap:18px}
      .row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 2px;border-bottom:1px solid var(--edge)}
      .rows > .row:nth-last-child(-n+${cols}){border-bottom:0}
      .row-name{font-size:12px;font-weight:650;display:flex;flex-direction:column;min-width:0}
      .row-name small{font-size:9px;font-weight:700;color:var(--secondary-text-color);margin-top:1px}
      .stepper{display:flex;align-items:center;gap:6px;flex:0 0 auto}
      .step-btn{width:24px;height:24px;border-radius:999px;border:1px solid color-mix(in srgb,var(--good) 16%,var(--edge));background:transparent;color:var(--primary-text-color);display:grid;place-items:center;cursor:pointer;flex:0 0 auto}
      .step-btn:hover{border-color:var(--good);color:var(--good)}
      .step-btn ha-icon{--mdc-icon-size:14px}
      .row-value{font-size:13px;font-weight:800;min-width:34px;text-align:center}
      .row-value small{font-size:9px;font-weight:700;color:var(--secondary-text-color);margin-left:1px}
    </style>
    <ha-card>
      ${this._config.title ? `<div class="head"><strong>${this._esc(this._config.title)}</strong>${this._config.subtitle ? `<span>${this._esc(this._config.subtitle)}</span>` : ""}</div>` : ""}
      <div class="rows">${items.map((i) => this._row(i)).join("")}</div>
    </ha-card>`;

    this.shadowRoot.querySelectorAll(".step-btn").forEach((btn) => {
      btn.addEventListener("click", () => this._step(btn.dataset.entity, Number(btn.dataset.step)));
    });
    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => {
      el.addEventListener("click", () => this._more(el.dataset.more));
    });
  }
  getCardSize() {
    const cols = Number(this._config.columns) || 1;
    const rows = Math.ceil((this._config.items || []).length / cols);
    return Math.max(2, Math.round(rows * 0.7) + 1);
  }
}

if (!customElements.get("ha-number-grid-card"))
  customElements.define("ha-number-grid-card", HANumberGridCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-number-grid-card",
  name: "HA Number Grid Card",
  description: "Poleret grid af justerbare tal-værdier (input_number) med +/- kontroller",
  preview: true,
});
console.info(
  `%c HA NUMBER GRID CARD %c v${VERSION} `,
  "color:white;background:#8a5cc2;font-weight:700",
  "color:#dcc6f5;background:#161b22",
);
