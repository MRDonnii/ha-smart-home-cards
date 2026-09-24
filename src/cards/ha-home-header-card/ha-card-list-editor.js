class HACardListEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._definition = { roots: [], collections: [] };
    this._configSig = "";
    this._activeItem = "";
    this._activeRootPicker = "";
    this._pages = {};
  }

  // hass opdateres kontinuerligt mens editoren er aaben (ikke kun naar man
  // aendrer noget). Foer blev hele formularen genopbygget her - med fx 30
  // alarmregler betoed det dusinvis af <ha-entity-picker> der blev smidt vaek
  // og genskabt flere gange i sekundet, hvilket goerede editoren maerkbart
  // langsom/uresponsiv at bruge. Nu opdateres kun .hass paa de allerede
  // monterede pickers.
  set hass(hass) {
    this._hass = hass;
    if (!this._activeItem && !this._activeRootPicker) return;
    this.shadowRoot?.querySelectorAll("ha-entity-picker").forEach((picker) => { picker.hass = hass; });
  }
  setConfig(config) {
    const next = config || {};
    const sig = this._sig(next);
    // HA's editor-vaert sender typisk configen tilbage igen umiddelbart efter
    // vi selv har emit'et den (standard config-changed-roundtrip). Er den
    // uaendret siden sidste render, er der intet at opdatere - kun en aegte
    // ekstern aendring (nyt kort, fortrudt aendring) skal udloese en fuld
    // genopbygning, som ellers ville tage fokus fra det felt man sidder i.
    // OBS: HA's vaert normaliserer/geninstantierer configen paa vejen tilbage
    // (fx via websocket-roundtrip), saa noegle-raekkefoelgen i objektet kan
    // skifte selv naar INGEN vaerdi rent faktisk er aendret. Almindelig
    // JSON.stringify er raekkefoelge-foelsom og ville derfor fejlagtigt tolke
    // det som en aegte aendring hver gang - og udloese en fuld genopbygning,
    // som stjaeler fokus fra det felt man lige sidder og skriver i (opleves
    // som "blinker og kan ikke redigeres"). _sig() sorterer noegler paa alle
    // niveauer foerst, saa signaturen kun aendrer sig ved en AEGTE vaerdi-aendring.
    this._config = structuredClone(next);
    if (sig === this._configSig) return;
    this._configSig = sig;
    this._render();
  }
  set definition(value) { this._definition = value || { roots: [], collections: [] }; this._render(); }

  _sig(value) {
    if (Array.isArray(value)) return `[${value.map((item) => this._sig(item)).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${this._sig(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }
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
    this._configSig = this._sig(this._config);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: structuredClone(this._config) }, bubbles: true, composed: true }));
  }
  _control(field, value, scope, index = -1) {
    const common = `data-scope="${scope}" data-index="${index}" data-key="${field.key}"`;
    if (field.type === "entity") {
      const lazyRoot = scope === "root";
      if (lazyRoot && this._activeRootPicker !== field.key) return `<label><span>${field.label}</span><span class="entity-lazy"><input ${common} type="text" value="${this._escape(value || "")}" placeholder="entity_id"><button class="pick" type="button" data-root-picker="${this._escape(field.key)}">Vælg</button></span></label>`;
      return `<label><span>${field.label}</span><ha-entity-picker ${common} value="${this._escape(value || "")}" allow-custom-entity></ha-entity-picker>${lazyRoot ? `<button class="pick" type="button" data-root-picker="${this._escape(field.key)}">Skjul vælger</button>` : ""}</label>`;
    }
    if (field.type === "boolean") return `<label class="check"><input ${common} type="checkbox" ${value !== false ? "checked" : ""}><span>${field.label}</span></label>`;
    if (field.type === "number") return `<label><span>${field.label}</span><input ${common} type="number" value="${this._escape(value ?? "")}" min="${field.min ?? ""}" max="${field.max ?? ""}" step="${field.step ?? 1}"></label>`;
    return `<label><span>${field.label}</span><input ${common} type="text" value="${this._escape(value || "")}" placeholder="${this._escape(field.placeholder || "")}"></label>`;
  }
  _escape(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  _render() {
    if (!this.shadowRoot) return;
    const roots = this._definition.roots || [];
    const collections = this._definition.collections || [];
    this.shadowRoot.innerHTML = `<style>
      *{box-sizing:border-box}.editor{display:grid;gap:14px;padding:8px 0;color:var(--primary-text-color)}.section{display:grid;gap:10px;padding:14px;border:1px solid var(--divider-color);border-radius:14px;background:var(--card-background-color)}h3{margin:0;font-size:14px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}label>span{display:block;margin-bottom:5px;color:var(--secondary-text-color);font-size:11px}input{width:100%;min-height:42px;padding:8px 10px;border:1px solid var(--divider-color);border-radius:9px;background:var(--input-fill-color,rgba(0,0,0,.05));color:var(--primary-text-color);font:inherit}.entity-lazy{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;margin:0}.check{display:flex;align-items:center;gap:8px}.check input{width:18px;min-height:18px}.check span{margin:0}.item{display:grid;gap:10px;padding:11px;border:1px solid var(--divider-color);border-radius:11px}.item-head,.item-actions{display:flex;align-items:center;gap:8px}.item-head{justify-content:space-between}.item-head strong{font-size:12px}.edit,.pick,.remove,.add{min-height:36px;border:1px solid var(--primary-color);border-radius:9px;background:transparent;color:var(--primary-color);font:inherit;font-weight:700;cursor:pointer}.edit,.pick,.remove{padding:0 10px}.pick{margin-top:6px}.entity-lazy .pick{margin-top:0}.remove{border-color:var(--error-color);color:var(--error-color)}ha-entity-picker{display:block}@media(max-width:600px){.fields{grid-template-columns:1fr}}
    </style><div class="editor">${roots.length ? `<section class="section"><h3>Generelt</h3><div class="fields">${roots.map((field) => this._control(field, this._get(field.key), "root")).join("")}</div></section>` : ""}${collections.map((collection) => {
      const items = Array.isArray(this._config[collection.key]) ? this._config[collection.key] : [];
      const pageSize = 12;
      const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
      const page = Math.min(this._pages[collection.key] || 0, pageCount - 1);
      this._pages[collection.key] = page;
      const start = page * pageSize;
      return `<section class="section"><h3>${collection.label} (${items.length})</h3>${items.slice(start, start + pageSize).map((item, offset) => { const index = start + offset; const key = `${collection.key}:${index}`; const active = this._activeItem === key; return `<div class="item"><div class="item-head"><strong>${this._escape(item.name || `${collection.itemLabel || "Element"} ${index + 1}`)}</strong><span class="item-actions"><button class="edit" data-edit="${key}" aria-expanded="${active}">${active ? "Luk" : "Redigér"}</button><button class="remove" data-remove="${collection.key}" data-index="${index}">Fjern</button></span></div>${active ? `<div class="fields">${collection.fields.map((field) => this._control(field, this._get(field.key, item), collection.key, index)).join("")}</div>` : ""}</div>`; }).join("")}${pageCount > 1 ? `<div class="item-actions"><button class="edit" data-page="${collection.key}" data-direction="-1" ${page === 0 ? "disabled" : ""}>Forrige</button><span>Side ${page + 1} af ${pageCount}</span><button class="edit" data-page="${collection.key}" data-direction="1" ${page === pageCount - 1 ? "disabled" : ""}>Næste</button></div>` : ""}<button class="add" data-add="${collection.key}">+ Tilføj ${collection.itemLabel || "element"}</button></section>`;
    }).join("")}</div>`;
    this._configSig = this._sig(this._config);
    this._bindFields(this.shadowRoot);
    this.shadowRoot.querySelectorAll("[data-root-picker]").forEach((button) => button.addEventListener("click", () => { this._activeRootPicker = this._activeRootPicker === button.dataset.rootPicker ? "" : button.dataset.rootPicker; this._render(); }));
    this.shadowRoot.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => {
      const next = this._activeItem === button.dataset.edit ? "" : button.dataset.edit;
      const previous = this._activeItem;
      this._activeItem = next;
      for (const key of [previous, next]) {
        if (!key) continue;
        const itemButton = [...this.shadowRoot.querySelectorAll("[data-edit]")].find((node) => node.dataset.edit === key);
        if (!itemButton) continue;
        const item = itemButton.closest(".item");
        item.querySelector(".fields")?.remove();
        const active = key === next;
        itemButton.textContent = active ? "Luk" : "Redigér";
        itemButton.setAttribute("aria-expanded", String(active));
        if (!active) continue;
        const [collectionKey, rawIndex] = key.split(":");
        const collection = collections.find((entry) => entry.key === collectionKey);
        const index = Number(rawIndex);
        const fields = document.createElement("div");
        fields.className = "fields";
        fields.innerHTML = collection.fields.map((field) => this._control(field, this._get(field.key, this._config[collectionKey][index]), collectionKey, index)).join("");
        item.appendChild(fields);
        this._bindFields(fields);
      }
    }));
    this.shadowRoot.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => { this._pages[button.dataset.page] += Number(button.dataset.direction); this._activeItem = ""; this._render(); }));
    this.shadowRoot.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => { const collection = collections.find((item) => item.key === button.dataset.add); const index = (this._config[collection.key] || []).length; this._config[collection.key] = [...(this._config[collection.key] || []), structuredClone(collection.defaults || {})]; this._pages[collection.key] = Math.floor(index / 12); this._activeItem = `${collection.key}:${index}`; this._emit(); this._render(); }));
    this.shadowRoot.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => { this._config[button.dataset.remove].splice(Number(button.dataset.index), 1); this._activeItem = ""; this._emit(); this._render(); }));
  }
  _bindFields(root) {
    root.querySelectorAll("ha-entity-picker").forEach((control) => {
      if (this._hass) control.hass = this._hass;
      control.addEventListener("value-changed", (event) => this._change(control, event.detail.value));
    });
    root.querySelectorAll("input").forEach((control) => control.addEventListener("change", () => this._change(control, control.type === "checkbox" ? control.checked : control.type === "number" ? Number(control.value) : control.value)));
  }
  _change(control, value) {
    const source = control.dataset.scope === "root" ? this._config : this._config[control.dataset.scope][Number(control.dataset.index)];
    const current = this._get(control.dataset.key, source);
    if (Object.is(current, value) || ((current === undefined || current === "") && (value === undefined || value === ""))) return;
    this._set(control.dataset.key, value, source);
    this._emit();
  }
}

if (!customElements.get("ha-home-header-card-editor")) customElements.define("ha-home-header-card-editor", HACardListEditor);
