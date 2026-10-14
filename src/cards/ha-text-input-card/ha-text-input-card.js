// HA Text Input Card – et let tekstfelt til en input_text (Claude AI, 2026-10-14).
// Erstatter custom-card-features' input-felt, som hentede hele entity-registret (MB) ved hver
// sideindlæsning. Skriver værdien med input_text.set_value ved Enter eller når feltet forlades, og
// følger med, når værdien ændres andre steder fra (fx en Ryd-knap), så længe feltet ikke har fokus.
// 0.1.0 – første version.

const VERSION = "0.1.0";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

class HATextInputCard extends HTMLElement {
  static getStubConfig() {
    return { entity: "input_text.message", name: "Besked", icon: "mdi:text-box-outline", height: 90 };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: ["input_text", "text"] } } },
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "height", selector: { number: { min: 48, max: 200, step: 1, mode: "box", unit_of_measurement: "px" } } },
      ],
      computeLabel: (s) => ({ entity: "Tekst-entitet", name: "Navn (vises i feltet)", icon: "Ikon", height: "Højde" })[s.name] || s.name,
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._value = null;
  }

  setConfig(config) {
    if (!config?.entity) throw new Error("Angiv en input_text-entitet");
    this._config = { ...HATextInputCard.getStubConfig(), ...config };
    this._value = null;
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    const st = hass.states[this._config.entity];
    const value = st && !["unknown", "unavailable"].includes(st.state) ? st.state : "";
    const input = this.shadowRoot.querySelector("input");
    if (!input) return;
    input.maxLength = Number(st?.attributes?.max) || 255;
    input.disabled = !st || st.state === "unavailable";
    // Overskriv ikke det brugeren er ved at skrive
    if (value !== this._value && this.shadowRoot.activeElement !== input) input.value = value;
    this._value = value;
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { columns: 12, rows: 2, min_rows: 1 };
  }

  _build() {
    const c = this._config;
    const h = Math.max(48, Number(c.height) || 90);
    this.shadowRoot.innerHTML = `<style>
      :host{display:block}
      ha-card{display:block;overflow:hidden;padding:6px 6px 2px 6px}
      label{position:relative;display:flex;align-items:center;gap:12px;height:${h - 12}px;padding:0 16px;box-sizing:border-box;cursor:text;
        border-radius:var(--ha-text-input-radius,10px) var(--ha-text-input-radius,10px) 0 0;background:var(--ha-text-input-fill,var(--input-fill-color,#000));
        border-bottom:1px solid var(--input-idle-line-color,rgba(255,255,255,.28));transition:border-color .2s}
      label:focus-within{border-bottom-color:var(--primary-color)}
      label:focus-within::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--primary-color)}
      ha-icon{--mdc-icon-size:22px;color:var(--secondary-text-color);flex:none}
      input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;color:var(--primary-text-color);font:inherit;font-size:17px;letter-spacing:.01em}
      input::placeholder{color:var(--secondary-text-color);opacity:.85}
      input:disabled{opacity:.5}
    </style>
    <ha-card><label><ha-icon icon="${esc(c.icon)}"></ha-icon><input type="text" enterkeyhint="send" autocomplete="off" placeholder="${esc(c.name)}" aria-label="${esc(c.name)}"></label></ha-card>`;
    const input = this.shadowRoot.querySelector("input");
    const commit = () => {
      if (!this._hass || input.value === this._value) return;
      this._hass.callService(c.entity.split(".")[0], "set_value", { entity_id: c.entity, value: input.value });
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { commit(); input.blur(); } });
    if (this._hass) this.hass = this._hass;
  }
}

if (!customElements.get("ha-text-input-card")) customElements.define("ha-text-input-card", HATextInputCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-text-input-card", name: "HA Text Input Card", description: "Let tekstfelt til en input_text", preview: true });
console.info(`%c HA TEXT INPUT %c v${VERSION} `, "color:white;background:#3b82f6;font-weight:700", "color:#bfdbfe;background:#111827");
