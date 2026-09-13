import "./ha-card-list-editor.js";

const VERSION = "0.2.1";

class HAPetCareCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._signature = "";
  }

  static getStubConfig() {
    return { title: "Kæledyrspleje", pet_name: "Kæledyr", icon: "mdi:dog-side", meals: [] };
  }

  static getConfigElement() {
    const editor = document.createElement("ha-card-list-editor");
    editor.definition = {
      roots: [
        { key: "title", label: "Titel" }, { key: "pet_name", label: "Kæledyrsnavn" },
        { key: "icon", label: "Ikon" }, { key: "animation", label: "Animation", type: "boolean" },
        { key: "water", label: "Vandstatus", type: "entity" }, { key: "water_battery", label: "Vandsensor batteri", type: "entity" },
        { key: "feeder_mode", label: "Fodermode", type: "entity" }, { key: "daily_amount", label: "Daglig mængde", type: "entity" },
        { key: "feeder_error", label: "Foderfejl", type: "entity" }, { key: "container_grams", label: "Beholder gram", type: "entity" },
        { key: "container_percent", label: "Beholder procent", type: "entity" }, { key: "refill_action", label: "Genopfyld handling", type: "entity" }
      ],
      collections: [{
        key: "meals", label: "Måltider", itemLabel: "måltid", defaults: { name: "Nyt måltid", time: "12:00", icon: "mdi:bowl-mix" },
        fields: [
          { key: "name", label: "Navn" }, { key: "time", label: "Tid" }, { key: "icon", label: "Ikon" },
          { key: "enabled", label: "Aktiv", type: "entity" }, { key: "status", label: "Status", type: "entity" },
          { key: "feed_action", label: "Giv nu handling", type: "entity" },
          { key: "skip", label: "Spring over i dag", type: "entity" }
        ]
      }]
    };
    return editor;
  }

  setConfig(config) {
    if (!config) throw new Error("Kæledyrskortet kræver en konfiguration");
    this._config = { title: "Kæledyrspleje", pet_name: "Kæledyr", icon: "mdi:dog-side", animation: true, meals: [], ...config };
    this._signature = "";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const ids = ["water", "water_battery", "feeder_mode", "daily_amount", "feeder_error", "container_grams", "container_percent", "refill_action"]
      .map((key) => this._config[key]).concat((this._config.meals || []).flatMap((meal) => [meal.enabled, meal.status, meal.feed_action, meal.skip])).filter(Boolean);
    const signature = JSON.stringify(ids.map((id) => [id, hass?.states?.[id]?.state, hass?.states?.[id]?.last_updated]));
    if (signature === this._signature) return;
    this._signature = signature;
    this._render();
  }

  getCardSize() { return 7; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }
  _entity(id) { return id ? this._hass?.states?.[id] : undefined; }
  _state(id) { return this._entity(id)?.state; }
  _on(id) { return this._state(id) === "on"; }
  _number(id) { const value = Number(this._state(id)); return Number.isFinite(value) ? value : undefined; }
  _escape(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
  _format(value, digits = 0) { return Number.isFinite(value) ? value.toLocaleString(this._hass?.locale?.language || "da", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—"; }
  _status(value) {
    const map = { done: ["Uddelt", "done"], pending: ["Afventer", "pending"], missed: ["Misset", "danger"] };
    return map[value] || [value && !["unknown", "unavailable"].includes(value) ? value : "Ukendt", "muted"];
  }
  _waterOk() { return this._on(this._config.water); }
  _error() { return this._on(this._config.feeder_error); }
  _showMore(id) { if (!id) return; this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true })); }
  async _toggle(id) { if (!id || !this._hass) return; const domain = id.split(".")[0]; await this._hass.callService(domain, "toggle", { entity_id: id }); }
  async _mode() {
    const id = this._config.feeder_mode; if (!id || !this._hass) return;
    const next = this._state(id) === "schedule" ? "manual" : "schedule";
    await this._hass.callService("select", "select_option", { entity_id: id, option: next });
  }
  async _script(id, message) {
    if (!id || !this._hass || !window.confirm(message)) return;
    await this._hass.callService("script", "turn_on", { entity_id: id });
  }
  async _skip(id, name, skipped) {
    if (!id || !this._hass) return;
    const message = skipped
      ? `Vil du sætte ${name || "måltidet"} tilbage på planen i dag?`
      : `Vil du springe ${name || "måltidet"} over i dag? Det kommer automatisk med igen i morgen.`;
    if (!window.confirm(message)) return;
    await this._hass.callService("input_boolean", skipped ? "turn_off" : "turn_on", { entity_id: id });
  }
  _meal(meal, index) {
    const skipped = this._on(meal.skip);
    const [label, tone] = skipped ? ["Sprunget over", "skipped"] : this._status(this._state(meal.status));
    const enabled = this._on(meal.enabled);
    return `<article class="meal ${tone} ${enabled ? "enabled" : "disabled"}" style="--delay:${index * 65}ms">
      <div class="meal-head"><span class="meal-icon"><ha-icon icon="${this._escape(meal.icon || "mdi:bowl-mix")}"></ha-icon></span><div><span>${this._escape(meal.time || "—")}</span><h3>${this._escape(meal.name || `Måltid ${index + 1}`)}</h3></div><button class="switch" data-toggle="${this._escape(meal.enabled)}" aria-label="Slå ${this._escape(meal.name)} til eller fra"><i></i></button></div>
      <div class="meal-status"><span><i></i>${this._escape(label)}</span><strong>${skipped ? "Kun i dag" : enabled ? "Planlagt" : "Deaktiveret"}</strong></div>
      <div class="meal-actions"><button class="skip" data-skip="${this._escape(meal.skip)}" data-name="${this._escape(meal.name)}" data-skipped="${skipped}"><ha-icon icon="${skipped ? "mdi:undo-variant" : "mdi:skip-next"}"></ha-icon>${skipped ? "Fortryd" : "Spring over"}</button><button class="feed" data-feed="${this._escape(meal.feed_action)}" data-name="${this._escape(meal.name)}"><ha-icon icon="mdi:silverware-fork-knife"></ha-icon>Giv nu</button></div>
    </article>`;
  }
  _render() {
    const meals = this._config.meals || [];
    const percent = Math.max(0, Math.min(100, this._number(this._config.container_percent) ?? 0));
    const grams = this._number(this._config.container_grams);
    const daily = this._number(this._config.daily_amount);
    const mode = this._state(this._config.feeder_mode);
    const water = this._waterOk();
    const error = this._error();
    const scheduledMeals = meals.filter((meal) => this._on(meal.enabled) && !this._on(meal.skip));
    const completed = scheduledMeals.filter((meal) => this._state(meal.status) === "done").length;
    const skipped = meals.filter((meal) => this._on(meal.skip)).length;
    const next = scheduledMeals.find((meal) => this._state(meal.status) === "pending");
    const levelTone = percent <= 10 ? "danger" : percent <= 30 ? "warning" : "good";
    const noAnimation = this._config.animation === false ? "no-animation" : "";
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--pet-accent:var(--dashboard-accent,#62b5ff);--pet-good:var(--dashboard-success,#54d9aa);--pet-warning:var(--dashboard-warning,#ffbd59);--pet-danger:var(--dashboard-danger,#ff667a);--pet-muted:var(--dashboard-icon-muted,#8390a2);--pet-edge:var(--dashboard-border-neutral,rgba(255,255,255,.11));--pet-surface:var(--surface,var(--ha-card-background,#142131))}*{box-sizing:border-box}button{font:inherit}ha-card{overflow:hidden;border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--pet-edge));border-radius:28px;background:linear-gradient(145deg,color-mix(in srgb,var(--pet-surface) 96%,var(--pet-accent) 4%),var(--pet-surface));color:var(--primary-text-color);box-shadow:var(--dashboard-shadow-deep,var(--ha-card-box-shadow));}.shell{position:relative;padding:24px;isolation:isolate}.ambient{position:absolute;inset:-20%;z-index:-1;pointer-events:none;background:radial-gradient(circle at 4% 0,color-mix(in srgb,var(--pet-accent) 16%,transparent),transparent 27%),radial-gradient(circle at 95% 15%,color-mix(in srgb,var(--pet-good) 10%,transparent),transparent 25%)}
      header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}.eyebrow{display:flex;align-items:center;gap:8px;color:var(--pet-accent);font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.eyebrow i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 12px currentColor;animation:pulse 2.4s ease-in-out infinite}h2{margin:6px 0 2px;font-size:clamp(25px,3vw,36px);letter-spacing:-.045em}.subtitle{color:var(--secondary-text-color);font-size:12px}.summary{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.summary>div{min-width:92px;padding:10px 13px;border:1px solid var(--pet-edge);border-radius:14px;background:color-mix(in srgb,var(--pet-surface) 87%,transparent)}.summary span{display:block;color:var(--secondary-text-color);font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.summary strong{display:block;margin-top:3px;font-size:15px}.summary .danger strong{color:var(--pet-danger)}.summary .good strong{color:var(--pet-good)}
      .dashboard{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(250px,.65fr);gap:12px}.main,.feeder{min-width:0;padding:16px;border:1px solid var(--pet-edge);border-radius:21px;background:rgba(0,0,0,.055)}.care-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.care{display:flex;align-items:center;gap:11px;min-width:0;padding:12px;border:1px solid var(--pet-edge);border-radius:15px;background:rgba(255,255,255,.025);cursor:pointer}.care-icon{display:grid;place-items:center;position:relative;flex:0 0 42px;width:42px;height:42px;border-radius:13px;background:color-mix(in srgb,var(--tone) 14%,transparent);color:var(--tone)}.care-icon ha-icon{width:24px;height:24px;--mdc-icon-size:24px}.water{--tone:var(--pet-good)}.water.low{--tone:var(--pet-warning)}.water.ok .care-icon:after{content:"";position:absolute;inset:5px;border-radius:50%;border:1px solid currentColor;opacity:.4;animation:ripple 2s ease-out infinite}.mode{--tone:var(--pet-accent)}.care span{display:block;color:var(--secondary-text-color);font-size:8px;font-weight:800;text-transform:uppercase}.care strong{display:block;overflow:hidden;margin-top:3px;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.care small{display:block;margin-top:2px;color:var(--secondary-text-color);font-size:8px}
      .section-title{display:flex;align-items:end;justify-content:space-between;margin:5px 2px 9px}.section-title span{color:var(--secondary-text-color);font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.section-title strong{font-size:10px}.meals{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:9px}.meal{--tone:var(--pet-muted);min-width:0;padding:12px;border:1px solid color-mix(in srgb,var(--tone) 24%,var(--pet-edge));border-radius:16px;background:linear-gradient(150deg,color-mix(in srgb,var(--tone) 7%,transparent),rgba(0,0,0,.035));animation:rise .35s both;animation-delay:var(--delay)}.meal.done{--tone:var(--pet-good)}.meal.pending{--tone:var(--pet-accent)}.meal.danger{--tone:var(--pet-danger)}.meal.skipped{--tone:var(--pet-warning)}.meal.disabled{opacity:.66}.meal-head{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:8px}.meal-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:color-mix(in srgb,var(--tone) 13%,transparent);color:var(--tone)}.meal-icon ha-icon{width:20px;height:20px;--mdc-icon-size:20px}.meal-head div>span{display:block;color:var(--tone);font-size:9px;font-weight:800}.meal h3{overflow:hidden;margin:2px 0 0;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.switch{position:relative;width:31px;height:18px;padding:0;border:1px solid var(--pet-edge);border-radius:12px;background:rgba(255,255,255,.08);cursor:pointer}.switch i{position:absolute;top:3px;left:3px;width:10px;height:10px;border-radius:50%;background:var(--pet-muted);transition:.2s}.enabled .switch{background:color-mix(in srgb,var(--pet-good) 25%,transparent)}.enabled .switch i{left:16px;background:var(--pet-good);box-shadow:0 0 7px var(--pet-good)}.meal-status{display:flex;align-items:center;justify-content:space-between;gap:7px;margin:11px 0 9px;color:var(--secondary-text-color);font-size:8px}.meal-status span{display:flex;align-items:center;gap:5px;color:var(--tone);font-weight:800;text-transform:uppercase}.meal-status i{width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 7px currentColor}.meal-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}.feed,.skip{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;min-height:34px;padding:0 6px;border:1px solid color-mix(in srgb,var(--tone) 30%,var(--pet-edge));border-radius:10px;background:color-mix(in srgb,var(--tone) 9%,transparent);color:var(--tone);font-size:8px;font-weight:800;cursor:pointer}.feed:hover,.skip:hover{background:color-mix(in srgb,var(--tone) 16%,transparent)}.feed ha-icon,.skip ha-icon{width:14px;height:14px;--mdc-icon-size:14px}
      .feeder{display:flex;flex-direction:column}.feeder-head{display:flex;align-items:center;justify-content:space-between}.feeder-head span{color:var(--secondary-text-color);font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.health{display:flex;align-items:center;gap:6px;color:var(--pet-good);font-size:8px;font-weight:800;text-transform:uppercase}.health.error{color:var(--pet-danger)}.health i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}.health.error i{animation:pulse 1.3s infinite}.tank-wrap{display:grid;grid-template-columns:86px 1fr;align-items:center;gap:14px;margin:18px 0}.tank{position:relative;width:78px;height:112px;margin:auto;border:2px solid color-mix(in srgb,var(--${levelTone === "good" ? "pet-good" : levelTone === "warning" ? "pet-warning" : "pet-danger"}) 45%,var(--pet-edge));border-radius:17px 17px 24px 24px;overflow:hidden;background:rgba(0,0,0,.1)}.fill{position:absolute;right:0;bottom:0;left:0;height:${percent}%;background:linear-gradient(180deg,color-mix(in srgb,var(--${levelTone === "good" ? "pet-good" : levelTone === "warning" ? "pet-warning" : "pet-danger"}) 68%,var(--pet-accent)),var(--${levelTone === "good" ? "pet-good" : levelTone === "warning" ? "pet-warning" : "pet-danger"}));transition:height .8s ease}.fill:before{content:"";position:absolute;top:-5px;left:-10%;width:120%;height:10px;border-radius:50%;background:color-mix(in srgb,var(--${levelTone === "good" ? "pet-good" : levelTone === "warning" ? "pet-warning" : "pet-danger"}) 72%,white);animation:wave 3s ease-in-out infinite}.tank strong{position:absolute;inset:0;display:grid;place-items:center;z-index:1;font-size:20px;text-shadow:0 1px 5px rgba(0,0,0,.55)}.tank-data span{display:block;color:var(--secondary-text-color);font-size:8px;text-transform:uppercase}.tank-data strong{display:block;margin:3px 0 12px;font-size:14px}.metric-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:auto}.metric{padding:10px;border:1px solid var(--pet-edge);border-radius:12px;background:rgba(255,255,255,.025);cursor:pointer}.metric span{display:block;color:var(--secondary-text-color);font-size:7px;text-transform:uppercase}.metric strong{display:block;margin-top:4px;font-size:11px}.refill{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;min-height:39px;margin-top:9px;border:1px solid color-mix(in srgb,var(--pet-accent) 35%,var(--pet-edge));border-radius:12px;background:color-mix(in srgb,var(--pet-accent) 10%,transparent);color:var(--pet-accent);font-size:9px;font-weight:800;cursor:pointer}.refill ha-icon{width:17px;height:17px;--mdc-icon-size:17px}.no-animation *{animation:none!important;transition:none!important}
      @keyframes pulse{50%{opacity:.45;transform:scale(1.35)}}@keyframes ripple{0%{transform:scale(.65);opacity:.6}100%{transform:scale(1.3);opacity:0}}@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes wave{50%{transform:translateX(7%) rotate(2deg)}}@media(max-width:760px){.shell{padding:15px}header{display:block}.summary{justify-content:flex-start;margin-top:13px}.summary>div{flex:1}.dashboard{grid-template-columns:1fr}.care-row{grid-template-columns:1fr 1fr}.meals{grid-template-columns:repeat(auto-fit,minmax(135px,1fr))}.tank-wrap{margin:12px 0}}@media(max-width:420px){.care-row{grid-template-columns:1fr}.summary>div{min-width:80px;padding:9px}.meal-head{grid-template-columns:32px minmax(0,1fr) auto}.meal-icon{width:32px;height:32px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
    </style><ha-card class="${noAnimation}"><div class="shell"><div class="ambient"></div><header><div><div class="eyebrow"><i></i>${this._escape(this._config.title)}</div><h2>${this._escape(this._config.pet_name)}</h2><div class="subtitle">Vand, måltider og foder samlet ét sted</div></div><div class="summary"><div class="${water ? "good" : "danger"}"><span>Vand</span><strong>${water ? "Klar" : "Fyld op"}</strong></div><div><span>I dag</span><strong>${completed} / ${scheduledMeals.length}${skipped ? ` · ${skipped} sprunget` : ""}</strong></div><div class="${error ? "danger" : "good"}"><span>Foderautomat</span><strong>${error ? "Fejl" : "Klar"}</strong></div></div></header><div class="dashboard"><section class="main"><div class="care-row"><div class="care water ${water ? "ok" : "low"}" data-info="${this._escape(this._config.water)}"><span class="care-icon"><ha-icon icon="mdi:water"></ha-icon></span><div><span>Vandskål</span><strong>${water ? "Der er vand" : "Skal fyldes"}</strong><small>${this._config.water_battery ? `Sensorbatteri ${this._format(this._number(this._config.water_battery))}%` : "Tryk for detaljer"}</small></div></div><div class="care mode" data-mode><span class="care-icon"><ha-icon icon="${mode === "schedule" ? "mdi:calendar-clock" : "mdi:gesture-tap-button"}"></ha-icon></span><div><span>Fodertilstand</span><strong>${mode === "schedule" ? "Automatisk plan" : "Manuel styring"}</strong><small>Tryk for at skifte</small></div></div></div><div class="section-title"><span>Dagens måltider</span><strong>${next ? `Næste: ${this._escape(next.name)} ${this._escape(next.time)}` : "Dagens plan er afsluttet"}</strong></div><div class="meals">${meals.map((meal, index) => this._meal(meal, index)).join("")}</div></section><aside class="feeder"><div class="feeder-head"><span>Foderbeholder</span><div class="health ${error ? "error" : ""}"><i></i>${error ? "Kræver tilsyn" : "System OK"}</div></div><div class="tank-wrap"><div class="tank"><div class="fill"></div><strong>${this._format(percent)}%</strong></div><div class="tank-data"><span>Resterende</span><strong>${this._format(grams)} g</strong><span>Daglig portion</span><strong>${this._format(daily)} g</strong></div></div><div class="metric-grid"><div class="metric" data-info="${this._escape(this._config.container_percent)}"><span>Kapacitet</span><strong>${levelTone === "danger" ? "Kritisk lav" : levelTone === "warning" ? "Snart tom" : "Godt niveau"}</strong></div><div class="metric" data-info="${this._escape(this._config.feeder_error)}"><span>Kontrol</span><strong>${error ? "Fejl fundet" : "Ingen fejl"}</strong></div></div><button class="refill" data-refill><ha-icon icon="mdi:reload"></ha-icon>Nulstil efter opfyldning</button></aside></div></div></ha-card>`;
    this.shadowRoot.querySelectorAll("[data-info]").forEach((el) => el.addEventListener("click", () => this._showMore(el.dataset.info)));
    this.shadowRoot.querySelector("[data-mode]")?.addEventListener("click", () => this._mode());
    this.shadowRoot.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", () => this._toggle(button.dataset.toggle)));
    this.shadowRoot.querySelectorAll("[data-feed]").forEach((button) => button.addEventListener("click", () => this._script(button.dataset.feed, `Vil du give ${button.dataset.name || "måltidet"} nu?`)));
    this.shadowRoot.querySelectorAll("[data-skip]").forEach((button) => button.addEventListener("click", () => this._skip(button.dataset.skip, button.dataset.name, button.dataset.skipped === "true")));
    this.shadowRoot.querySelector("[data-refill]")?.addEventListener("click", () => this._script(this._config.refill_action, "Er foderbeholderen fyldt op og skal tælleren nulstilles?"));
  }
}

if (!customElements.get("ha-pet-care-card")) customElements.define("ha-pet-care-card", HAPetCareCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-pet-care-card", name: "HA Pet Care Card", description: "Samlet kæledyrs-, vand- og foderoversigt", preview: true });
console.info(`%c HA PET CARE CARD %c v${VERSION} `, "color:white;background:#357fc4;font-weight:700", "color:#69c4ff;background:#161b22");
