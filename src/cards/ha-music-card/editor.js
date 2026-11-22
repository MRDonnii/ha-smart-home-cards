// Visual editor for ha-music-card: a plain ha-form. Players given as objects ({entity_id, name, icon}) keep their extra
// fields when the list is edited. By Claude AI.
const SCHEMA = [
  { name: "entities", selector: { entity: { domain: "media_player", multiple: true } } },
  { name: "ma_url", selector: { text: { type: "url" } } },
  { name: "default_player", selector: { entity: { domain: "media_player" } } },
  { type: "grid", name: "", schema: [
    { name: "fill_height", selector: { boolean: {} } },
    { name: "bottom_offset", selector: { number: { min: 0, max: 400, mode: "box", unit_of_measurement: "px" } } },
    { name: "top_offset", selector: { number: { min: 0, max: 400, mode: "box", unit_of_measurement: "px" } } },
    { name: "accent", selector: { text: {} } }
  ] }
];
const LABELS = {
  entities: "Højttalere (tom = alle Music Assistant-afspillere)", ma_url: "Music Assistant-adresse udefra (til billeder, fx https://music.example.com)",
  default_player: "Standardhøjttaler", fill_height: "Fyld skærmhøjden", bottom_offset: "Plads i bunden (navigationslinje)",
  top_offset: "Plads i toppen", accent: "Accentfarve (tom = farve fra albumcover)"
};

class HaMusicCardEditor extends HTMLElement {
  setConfig(config) { this._config = config || {}; this._render(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; else this._render(); }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => LABELS[s.name] || s.name;
      this._form.addEventListener("value-changed", (e) => this._changed(e.detail.value));
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = SCHEMA;
    const data = { fill_height: true, bottom_offset: 110, top_offset: 8, ...this._config };
    data.entities = (this._config.entities || []).map((e) => (typeof e === "string" ? e : e.entity_id));
    this._form.data = data;
  }

  _changed(value) {
    const old = new Map((this._config.entities || []).filter((e) => typeof e === "object").map((e) => [e.entity_id, e]));
    const config = { ...this._config, ...value, entities: (value.entities || []).map((id) => old.get(id) || id) };
    for (const k of Object.keys(config)) if (config[k] === "" || config[k] == null) delete config[k];
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

if (!customElements.get("ha-music-card-editor")) customElements.define("ha-music-card-editor", HaMusicCardEditor);
