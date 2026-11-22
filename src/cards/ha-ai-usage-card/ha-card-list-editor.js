class HACardListEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._definition = { roots: [], collections: [] };
  }

  set hass(hass) { this._hass = hass; this._render(); }
  setConfig(config) { this._config = structuredClone(config || {}); this._render(); }
  set definition(value) { this._definition = value || { roots: [], collections: [] }; this._render(); }

  _get(path, source = this._config) {
    return path.split(".").reduce((value, key) => value?.[key], source);
  }
  _set(path, value, source = this._config) {
    const parts = path.split(".");
    let target = source;
    parts.slice(0, -1).forEach((key) => { target[key] = target[key] && typeof target[key] === "object" ? target[key] : {}; target = target[key]; });
    if (value === "" || value === undefined) delete target[parts.at(-1)]; else target[parts.at(-1)] = value;
  }
  _emit() {
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: structuredClone(this._config) }, bubbles: true, composed: true }));
  }
  _control(field, value, scope, index = -1) {
    const common = `data-scope="${scope}" data-index="${index}" data-key="${field.key}"`;
    if (field.type === "entity") return `<label><span>${field.label}</span><ha-entity-picker ${common} value="${this._escape(value || "")}" allow-custom-entity></ha-entity-picker></label>`;
    if (field.type === "boolean") return `<label class="check"><input ${common} type="checkbox" ${value !== false ? "checked" : ""}><span>${field.label}</span></label>`;
    if (field.type === "number") return `<label><span>${field.label}</span><input ${common} type="number" value="${this._escape(value ?? "")}" min="${field.min ?? ""}" max="${field.max ?? ""}"></label>`;
    return `<label><span>${field.label}</span><input ${common} type="text" value="${this._escape(value || "")}" placeholder="${this._escape(field.placeholder || "")}"></label>`;
  }
  _escape(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  _render() {
    if (!this.shadowRoot) return;
    const roots = this._definition.roots || [];
    const collections = this._definition.collections || [];
    this.shadowRoot.innerHTML = `<style>
      *{box-sizing:border-box}.editor{display:grid;gap:14px;padding:8px 0;color:var(--primary-text-color)}.section{display:grid;gap:10px;padding:14px;border:1px solid var(--divider-color);border-radius:14px;background:var(--card-background-color)}h3{margin:0;font-size:14px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}label>span{display:block;margin-bottom:5px;color:var(--secondary-text-color);font-size:11px}input{width:100%;min-height:42px;padding:8px 10px;border:1px solid var(--divider-color);border-radius:9px;background:var(--input-fill-color,rgba(0,0,0,.05));color:var(--primary-text-color);font:inherit}.check{display:flex;align-items:center;gap:8px}.check input{width:18px;min-height:18px}.check span{margin:0}.item{display:grid;gap:10px;padding:11px;border:1px solid var(--divider-color);border-radius:11px}.item-head{display:flex;align-items:center;justify-content:space-between}.item-head strong{font-size:12px}.remove,.add{min-height:36px;border:1px solid var(--primary-color);border-radius:9px;background:transparent;color:var(--primary-color);font:inherit;font-weight:700;cursor:pointer}.remove{padding:0 10px;border-color:var(--error-color);color:var(--error-color)}ha-entity-picker{display:block}@media(max-width:600px){.fields{grid-template-columns:1fr}}
    </style><div class="editor">${roots.length ? `<section class="section"><h3>Generelt</h3><div class="fields">${roots.map((field) => this._control(field, this._get(field.key), "root")).join("")}</div></section>` : ""}${collections.map((collection) => {
      const items = Array.isArray(this._config[collection.key]) ? this._config[collection.key] : [];
      return `<section class="section"><h3>${collection.label}</h3>${items.map((item, index) => `<div class="item"><div class="item-head"><strong>${this._escape(item.name || `${collection.itemLabel || "Element"} ${index + 1}`)}</strong><button class="remove" data-remove="${collection.key}" data-index="${index}">Fjern</button></div><div class="fields">${collection.fields.map((field) => this._control(field, this._get(field.key, item), collection.key, index)).join("")}</div></div>`).join("")}<button class="add" data-add="${collection.key}">+ Tilføj ${collection.itemLabel || "element"}</button></section>`;
    }).join("")}</div>`;
    this.shadowRoot.querySelectorAll("ha-entity-picker").forEach((control) => { control.hass = this._hass; control.addEventListener("value-changed", (event) => this._change(control, event.detail.value)); });
    this.shadowRoot.querySelectorAll("input").forEach((control) => control.addEventListener("change", () => this._change(control, control.type === "checkbox" ? control.checked : control.type === "number" ? Number(control.value) : control.value)));
    this.shadowRoot.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => { const collection = collections.find((item) => item.key === button.dataset.add); this._config[collection.key] = [...(this._config[collection.key] || []), structuredClone(collection.defaults || {})]; this._emit(); this._render(); }));
    this.shadowRoot.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => { this._config[button.dataset.remove].splice(Number(button.dataset.index), 1); this._emit(); this._render(); }));
  }
  _change(control, value) {
    if (control.dataset.scope === "root") this._set(control.dataset.key, value);
    else this._set(control.dataset.key, value, this._config[control.dataset.scope][Number(control.dataset.index)]);
    this._emit();
  }
}

if (!customElements.get("ha-card-list-editor")) customElements.define("ha-card-list-editor", HACardListEditor);
