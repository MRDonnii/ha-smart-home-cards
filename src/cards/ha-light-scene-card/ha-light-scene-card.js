const VERSION = "0.3.0";

const COLOR_SWATCH = {
  "Varm orange": "#ff9f43",
  Lilla: "#a463f2",
  Rosa: "#ff6fb1",
  Blå: "#4dabf7",
  Turkis: "#2dd4bf",
  Grøn: "#51cf66",
  Rød: "#ff6b6b",
  Varmhvid: "#ffe9c7",
};

class HALightSceneCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
  }
  static getStubConfig() {
    return {
      title: "Lysscene",
      toggle_entity: "input_boolean.example_scene_active",
      toggle_name: "Aktiv",
      lights: [
        {
          name: "Lampe",
          icon: "mdi:floor-lamp",
          brightness_entity: "input_number.example_brightness",
          color_entity: "input_select.example_color",
        },
      ],
    };
  }
  setConfig(config) {
    if (!config?.lights?.length) throw new Error("Kortet kræver mindst ét lys");
    this._config = { title: "", lights: [], ...config };
    this._render();
  }
  _watchedIds() {
    return [
      this._config.toggle_entity,
      ...(this._config.lights || []).flatMap((l) => [l.brightness_entity, l.color_entity]),
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
  _fmt(v) {
    return Number.isFinite(v) ? Math.round(v) : "—";
  }
  _toggleMain() {
    if (!this._config.toggle_entity) return;
    this._hass?.callService("homeassistant", "toggle", { entity_id: this._config.toggle_entity });
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
  _pickColor(entityId, option) {
    if (!entityId) return;
    this._hass?.callService("input_select", "select_option", { entity_id: entityId, option });
  }
  _lightColor(light) {
    const cE = this._e(light.color_entity);
    return COLOR_SWATCH[cE?.state] || "var(--secondary-text-color)";
  }
  _lightBlock(light) {
    const bE = this._e(light.brightness_entity);
    const value = Number(bE?.state);
    const min = Number(bE?.attributes?.min) || 0;
    const max = Number(bE?.attributes?.max) || 100;
    const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
    const unit = bE?.attributes?.unit_of_measurement || "%";
    const cE = this._e(light.color_entity);
    const options = cE?.attributes?.options || [];
    const current = cE?.state;
    const color = this._lightColor(light);
    return `<div class="light-block" style="--lc:${color}">
      <div class="light-head">
        <span class="light-icon"><ha-icon icon="${this._esc(light.icon || "mdi:lightbulb")}"></ha-icon></span>
        <span class="light-name">${this._esc(light.name)}</span>
        ${
          light.brightness_entity
            ? `<div class="stepper">
          <button class="step-btn" data-step="-1" data-entity="${this._esc(light.brightness_entity)}"><ha-icon icon="mdi:minus"></ha-icon></button>
          <span class="light-value">${this._fmt(value)}<small>${this._esc(unit)}</small></span>
          <button class="step-btn" data-step="1" data-entity="${this._esc(light.brightness_entity)}"><ha-icon icon="mdi:plus"></ha-icon></button>
        </div>`
            : ""
        }
      </div>
      ${light.brightness_entity ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ""}
      ${
        light.color_entity && options.length
          ? `<div class="swatches">${options
              .map(
                (opt) => `<button class="swatch ${opt === current ? "selected" : ""}" data-color-entity="${this._esc(light.color_entity)}" data-color="${this._esc(opt)}" style="--sw:${COLOR_SWATCH[opt] || "#888"}" title="${this._esc(opt)}">${opt === current ? '<ha-icon icon="mdi:check"></ha-icon>' : ""}</button>`,
              )
              .join("")}</div>`
          : ""
      }
    </div>`;
  }
  _render() {
    if (!this.shadowRoot) return;
    const on = this._config.toggle_entity ? this._e(this._config.toggle_entity)?.state === "on" : true;
    const lights = this._config.lights || [];
    const heroColor = on ? this._lightColor(lights[0] || {}) : "var(--secondary-text-color)";

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #54d9aa));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)))}
      *{box-sizing:border-box}
      ha-card{position:relative;overflow:hidden;padding:18px;border-radius:22px;border-left:calc(var(--dashboard-left-accent-width, 1) * 4px) solid ${heroColor};background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow);transition:border-color .4s}
      ha-card:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 100% 0%,color-mix(in srgb,${heroColor} ${on ? "16%" : "6%"},transparent),transparent 60%);pointer-events:none;transition:background .4s}
      .head{position:relative;display:flex;align-items:center;gap:12px;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid var(--edge)}
      .head-icon{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border-radius:14px;background:color-mix(in srgb,${heroColor} 20%,transparent);color:${heroColor};transition:background .4s,color .4s}
      .head-icon ha-icon{--mdc-icon-size:22px}
      .head strong{flex:1;font-size:15px;font-weight:750}
      .switch{position:relative;flex:0 0 auto;width:40px;height:23px;border-radius:999px;background:var(--edge);cursor:pointer;transition:background .2s}
      .switch.on{background:var(--good)}
      .switch i{position:absolute;top:2px;left:2px;width:19px;height:19px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s}
      .switch.on i{transform:translateX(17px)}
      .lights{position:relative;display:flex;flex-direction:column;gap:18px;transition:opacity .3s;opacity:${on ? "1" : ".4"}}
      .light-block{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;background:color-mix(in srgb,var(--lc) 6%,transparent);border:1px solid color-mix(in srgb,var(--lc) 22%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--lc);box-shadow:0 4px 12px rgba(0,0,0,.08)}
      .light-head{display:flex;align-items:center;gap:8px}
      .light-icon{display:grid;place-items:center;width:26px;height:26px;border-radius:9px;background:color-mix(in srgb,var(--lc) 24%,transparent);color:var(--lc);flex:0 0 auto}
      .light-icon ha-icon{--mdc-icon-size:15px}
      .light-name{flex:1;font-size:12px;font-weight:750}
      .stepper{display:flex;align-items:center;gap:6px}
      .step-btn{width:25px;height:25px;border-radius:999px;border:1px solid color-mix(in srgb,var(--lc) 22%,var(--edge));background:transparent;color:var(--primary-text-color);display:grid;place-items:center;cursor:pointer;flex:0 0 auto}
      .step-btn:hover{border-color:var(--lc);color:var(--lc)}
      .step-btn ha-icon{--mdc-icon-size:14px}
      .light-value{font-size:13px;font-weight:800;min-width:34px;text-align:center}
      .light-value small{font-size:9px;font-weight:700;color:var(--secondary-text-color);margin-left:1px}
      .bar{height:5px;border-radius:999px;background:var(--edge);overflow:hidden}
      .bar i{display:block;height:100%;background:var(--lc);border-radius:999px;transition:width .3s}
      .swatches{display:flex;flex-wrap:wrap;gap:7px;padding-left:34px}
      .swatch{display:grid;place-items:center;width:23px;height:23px;border-radius:50%;border:2px solid transparent;background:var(--sw);cursor:pointer;padding:0;color:#fff}
      .swatch ha-icon{--mdc-icon-size:13px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))}
      .swatch.selected{border-color:var(--primary-text-color);box-shadow:0 0 0 2px var(--ha-card-background,var(--card-background-color)),0 0 10px color-mix(in srgb,var(--sw) 70%,transparent)}
      @media(prefers-reduced-motion:reduce){*{transition:none!important}}
    </style>
    <ha-card>
      <div class="head">
        <span class="head-icon"><ha-icon icon="${this._esc(this._config.toggle_icon || "mdi:movie-open")}"></ha-icon></span>
        <strong>${this._esc(this._config.title || this._config.toggle_name)}</strong>
        ${this._config.toggle_entity ? `<div class="switch ${on ? "on" : ""}" data-main-switch><i></i></div>` : ""}
      </div>
      <div class="lights">${lights.map((l) => this._lightBlock(l)).join("")}</div>
    </ha-card>`;

    this.shadowRoot.querySelector("[data-main-switch]")?.addEventListener("click", () => this._toggleMain());
    this.shadowRoot.querySelectorAll(".step-btn").forEach((btn) => {
      btn.addEventListener("click", () => this._step(btn.dataset.entity, Number(btn.dataset.step)));
    });
    this.shadowRoot.querySelectorAll(".swatch").forEach((btn) => {
      btn.addEventListener("click", () => this._pickColor(btn.dataset.colorEntity, btn.dataset.color));
    });
  }
  getCardSize() {
    return (this._config.lights || []).length * 2 + 2;
  }
}

if (!customElements.get("ha-light-scene-card"))
  customElements.define("ha-light-scene-card", HALightSceneCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-light-scene-card",
  name: "HA Light Scene Card",
  description: "Samlet kort til en lysscene med hoved-toggle, lysstyrke og farvevalg pr. lys",
  preview: true,
});
console.info(
  `%c HA LIGHT SCENE CARD %c v${VERSION} `,
  "color:white;background:#b0559b;font-weight:700",
  "color:#f0c6e6;background:#161b22",
);
