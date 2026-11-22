const ROOM_V2_VERSION = "2.0.0";

const ROOM_V2_ACTIVE = new Set(["on", "open", "opening", "playing", "home", "heat", "cool"]);

class HaHomeRoomOverviewCardV2Editor extends HTMLElement {
  setConfig(config) { this.config = structuredClone(config || {}); this.render(); }
  set hass(hass) { this._hass = hass; if (!this.childElementCount) this.render(); }
  _emit() { this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: structuredClone(this.config) } })); }
  render() {
    if (!this.config) return;
    this.innerHTML = `<style>*{box-sizing:border-box}:host{display:block}.hint{margin:0 0 12px;color:var(--secondary-text-color);font-size:12px}.host{min-height:40px}</style><p class="hint">V2 viser kun hurtig lysstyring på oversigten. Klik på et rum åbner klima, åbninger, gardiner, medier og ekstra entities.</p><div class="host"></div>`;
    const host = this.querySelector(".host");
    const editor = document.createElement("ha-card-list-editor");
    editor.hass = this._hass;
    editor.definition = {
      roots: [
        { key: "title", label: "Titel" },
        { key: "desktop_columns", label: "PC-kolonner", type: "number" },
        { key: "show_summary", label: "Vis opsummering", type: "checkbox" },
      ],
      collections: [{
        key: "rooms", label: "Rum", itemLabel: "rum", defaults: { name: "Nyt rum", icon: "mdi:home-outline" },
        fields: [
          { key: "name", label: "Navn" }, { key: "icon", label: "Ikon" }, { key: "accent", label: "Accentfarve" },
          { key: "temperature", label: "Temperatur", type: "entity" }, { key: "humidity", label: "Luftfugtighed", type: "entity" },
          { key: "light", label: "Samlet lys", type: "entity" }, { key: "presence", label: "Tilstedeværelse", type: "entity" },
          { key: "opening", label: "Vindue/dør", type: "entity" }, { key: "climate", label: "Klima", type: "entity" },
          { key: "cover", label: "Gardin/cover", type: "entity" }, { key: "media_player", label: "Medieafspiller", type: "entity" },
          { key: "extra_entities", label: "Ekstra entities (komma-separeret)" }, { key: "popup", label: "Eksisterende fuld popup (#id)" },
          { key: "alert.entity", label: "Rumstatus", type: "entity" }, { key: "alert.active", label: "Aktiv tekst" },
          { key: "alert.idle", label: "Normal tekst" }, { key: "alert.icon", label: "Statusikon" },
        ],
      }],
    };
    editor.setConfig(this.config);
    editor.addEventListener("config-changed", (event) => { event.stopPropagation(); this.config = structuredClone(event.detail.config); this._emit(); });
    host.append(editor);
  }
}

class HaHomeRoomOverviewCardV2 extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = "";
    this._selected = -1;
    this._built = false;
  }
  static getStubConfig() {
    return {
      title: "Alle rum", desktop_columns: 4, show_summary: true,
      rooms: [{ name: "Stue", icon: "mdi:sofa-outline", temperature: "sensor.living_room_temperature", humidity: "sensor.living_room_humidity", light: "light.living_room" }],
    };
  }
  static getConfigElement() { return document.createElement("ha-home-room-overview-card-v2-editor"); }
  setConfig(config) {
    if (!Array.isArray(config?.rooms) || !config.rooms.length) throw new Error("V2 kræver mindst ét rum");
    this.config = { title: "Alle rum", desktop_columns: 4, show_summary: true, ...structuredClone(config) };
    this._sig = "";
    this._built = false;
    this._build();
    this._update();
  }
  set hass(hass) {
    this._hass = hass;
    const sig = this._signature();
    if (sig !== this._sig) { this._sig = sig; this._update(); }
  }
  getCardSize() { return Math.max(3, Math.ceil(this.config.rooms.length / 2) * 2); }
  _entities(room) {
    const extras = Array.isArray(room.extra_entities) ? room.extra_entities : String(room.extra_entities || "").split(",");
    return [room.temperature, room.humidity, room.light, room.presence, room.opening, room.climate, room.cover, room.media_player, room.alert?.entity, ...extras].map((x) => String(x || "").trim()).filter(Boolean);
  }
  _signature() {
    if (!this._hass || !this.config) return "";
    return [...new Set(this.config.rooms.flatMap((r) => this._entities(r)))].map((id) => {
      const s = this._hass.states[id];
      return `${id}:${s?.state ?? "missing"}:${s?.attributes?.temperature ?? ""}:${s?.attributes?.current_temperature ?? ""}:${s?.attributes?.brightness ?? ""}`;
    }).join("|");
  }
  _state(id) { return id ? this._hass?.states?.[id] : undefined; }
  _number(id) { const value = Number(this._state(id)?.state); return Number.isFinite(value) ? value : null; }
  _active(id) { return ROOM_V2_ACTIVE.has(this._state(id)?.state); }
  _fmt(value, digits = 1) { return value == null ? "–" : value.toLocaleString(this._hass?.locale?.language || "da", { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
  _room(room) {
    const climate = this._state(room.climate);
    return {
      temp: this._number(room.temperature), humidity: this._number(room.humidity), light: this._state(room.light)?.state === "on",
      presence: this._active(room.presence), open: this._active(room.opening), alert: this._active(room.alert?.entity),
      climateState: climate?.state, target: Number.isFinite(Number(climate?.attributes?.temperature)) ? Number(climate.attributes.temperature) : null,
      coverOpen: ["open", "opening"].includes(this._state(room.cover)?.state), mediaOn: ![undefined, "off", "idle", "unavailable"].includes(this._state(room.media_player)?.state),
    };
  }
  _build() {
    if (!this.shadowRoot || this._built) return;
    const columns = Math.min(6, Math.max(2, Number(this.config.desktop_columns) || 4));
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,Inter,system-ui,sans-serif)}*{box-sizing:border-box}button{font:inherit}
      .shell{position:relative;overflow:hidden;padding:20px;border:1px solid var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.22)));border-radius:24px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#171c24)));box-shadow:var(--dashboard-shadow-soft,var(--ha-card-box-shadow,0 10px 28px rgba(0,0,0,.2)))}
      header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:15px}.eyebrow{display:flex;align-items:center;gap:8px;color:var(--dashboard-accent,var(--primary-color,#5ab5ff));font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.live{width:7px;height:7px;border-radius:50%;background:var(--dashboard-success,var(--success-color,#42d696));box-shadow:0 0 11px currentColor}h2{margin:4px 0 0;font-size:25px;letter-spacing:-.04em}.summary{display:flex;gap:7px}.summary span{display:flex;align-items:center;gap:5px;min-height:31px;padding:6px 10px;border:1px solid var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.22)));border-radius:10px;background:var(--contrast1,rgba(255,255,255,.045));color:var(--secondary-text-color);font-size:10px;font-weight:700}.summary b{color:var(--primary-text-color);font-size:12px}.summary .warn b{color:var(--dashboard-warning,var(--warning-color,#ffb34d))}
      .grid{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:10px}.room{--room-accent:var(--dashboard-accent,var(--primary-color,#5ab5ff));position:relative;display:grid;grid-template-rows:auto auto 1fr auto;min-width:0;height:142px;padding:13px;border:1px solid color-mix(in srgb,var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.22))) 78%,transparent);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid color-mix(in srgb,var(--room-accent) 78%,transparent);border-radius:17px;background:linear-gradient(145deg,color-mix(in srgb,var(--room-accent) 5%,transparent),transparent 58%),var(--surface,var(--ha-card-background,var(--card-background-color,#171c24)));color:inherit;text-align:left;cursor:pointer;transition:border-color .2s ease,transform .2s ease,box-shadow .2s ease}.room:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--room-accent) 48%,transparent);box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 12px 25px rgba(0,0,0,.22)))}.room.light-on{background:linear-gradient(145deg,color-mix(in srgb,var(--room-accent) 11%,transparent),transparent 62%),var(--surface,var(--ha-card-background,var(--card-background-color,#171c24)))}.room.warning{border-left-color:var(--dashboard-warning,var(--warning-color,#ffb34d))}
      .room-head{display:flex;align-items:center;gap:9px;min-width:0}.room-icon{display:grid;place-items:center;width:32px;height:32px;flex:0 0 32px;border-radius:10px;background:color-mix(in srgb,var(--room-accent) 15%,transparent);color:var(--room-accent)}ha-icon{--mdc-icon-size:19px}.room-name{min-width:0;font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.presence{width:6px;height:6px;margin-left:auto;border-radius:50%;background:var(--dashboard-icon-muted,var(--disabled-text-color,#64748b))}.presence.on{background:var(--dashboard-success,var(--success-color,#42d696));box-shadow:0 0 8px currentColor}
      .measure{display:flex;align-items:baseline;gap:6px;margin-top:8px}.temperature{font-size:26px;font-weight:850;letter-spacing:-.055em}.temperature small{font-size:10px;color:var(--secondary-text-color)}.humidity{color:var(--secondary-text-color);font-size:10px}.status{align-self:center;display:flex;align-items:center;gap:5px;min-width:0;color:var(--secondary-text-color);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status.warn{color:var(--dashboard-warning,var(--warning-color,#ffb34d))}.status ha-icon{--mdc-icon-size:13px}
      .actions{display:grid;grid-template-columns:minmax(0,1fr) 34px;gap:7px}.quick,.more{height:31px;border:1px solid var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.22)));border-radius:9px;background:var(--contrast1,rgba(255,255,255,.045));color:var(--secondary-text-color);cursor:pointer}.quick{display:flex;align-items:center;justify-content:center;gap:6px;padding:0 8px;font-size:10px;font-weight:800}.quick.on{color:var(--dashboard-warning,var(--warning-color,#ffb34d));border-color:color-mix(in srgb,var(--dashboard-warning,var(--warning-color,#ffb34d)) 38%,transparent);background:color-mix(in srgb,var(--dashboard-warning,var(--warning-color,#ffb34d)) 10%,transparent)}.more{display:grid;place-items:center}.more ha-icon{--mdc-icon-size:17px}
      dialog{width:min(620px,calc(100vw - 24px));max-height:min(760px,calc(100vh - 28px));padding:0;border:1px solid var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.28)));border-radius:24px;background:color-mix(in srgb,var(--surface,var(--ha-card-background,var(--card-background-color,#171c24))) 96%,transparent);color:var(--primary-text-color);box-shadow:0 28px 80px rgba(0,0,0,.55);backdrop-filter:blur(18px);overflow:auto}dialog::backdrop{background:rgba(3,8,16,.72);backdrop-filter:blur(5px)}.popup-head{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:12px;padding:17px 18px;border-bottom:1px solid var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.22)));background:color-mix(in srgb,var(--surface,var(--ha-card-background,var(--card-background-color,#171c24))) 94%,transparent);backdrop-filter:blur(18px)}.popup-head .room-icon{width:38px;height:38px;flex-basis:38px}.popup-title{min-width:0}.popup-title b{display:block;font-size:18px}.popup-title span{display:block;margin-top:2px;color:var(--secondary-text-color);font-size:10px}.close{display:grid;place-items:center;width:36px;height:36px;margin-left:auto;border:1px solid var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.22)));border-radius:11px;background:var(--contrast1,rgba(255,255,255,.045));color:inherit;cursor:pointer}.popup-body{padding:17px}.hero{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:8px}.metric{padding:12px;border:1px solid var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.22)));border-radius:14px;background:var(--contrast1,rgba(255,255,255,.04))}.metric span{display:block;color:var(--secondary-text-color);font-size:9px;text-transform:uppercase;font-weight:750;letter-spacing:.08em}.metric strong{display:block;margin-top:5px;font-size:18px}.control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.control{display:flex;align-items:center;gap:10px;min-height:53px;padding:10px 12px;border:1px solid var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.22)));border-radius:14px;background:var(--contrast1,rgba(255,255,255,.04));color:inherit;text-align:left;cursor:pointer}.control.on{border-color:color-mix(in srgb,var(--room-accent) 45%,transparent);background:color-mix(in srgb,var(--room-accent) 10%,transparent)}.control ha-icon{color:var(--room-accent);--mdc-icon-size:22px}.control div{min-width:0}.control b,.control small{display:block}.control b{font-size:12px}.control small{margin-top:2px;color:var(--secondary-text-color);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.climate-row{display:grid;grid-template-columns:42px minmax(0,1fr) 42px;align-items:center;gap:8px;margin-top:12px}.climate-row button{height:40px;border:1px solid var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.22)));border-radius:12px;background:var(--contrast1,rgba(255,255,255,.045));color:inherit;cursor:pointer}.climate-value{text-align:center}.climate-value b,.climate-value span{display:block}.climate-value b{font-size:19px}.climate-value span{color:var(--secondary-text-color);font-size:9px}.full{width:100%;height:43px;margin-top:12px;border:1px solid color-mix(in srgb,var(--room-accent) 45%,transparent);border-radius:13px;background:color-mix(in srgb,var(--room-accent) 12%,transparent);color:var(--primary-text-color);font-weight:800;cursor:pointer}.hidden{display:none!important}
      @media(max-width:900px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:650px){.shell{padding:11px;border-radius:18px}header{align-items:flex-start;margin-bottom:11px}h2{font-size:20px}.summary{gap:4px}.summary span{padding:5px 7px;font-size:0}.summary span b{font-size:11px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.room{height:132px;padding:10px;border-radius:14px}.room-icon{width:28px;height:28px;flex-basis:28px}.room-name{font-size:12px}.temperature{font-size:22px}.actions{grid-template-columns:minmax(0,1fr) 31px}.quick,.more{height:29px}.hero{grid-template-columns:repeat(3,1fr)}.popup-body{padding:12px}.control-grid{grid-template-columns:1fr}}
    </style><section class="shell"><header><div><div class="eyebrow"><i class="live"></i>Hjemmet lige nu</div><h2></h2></div><div class="summary"><span><ha-icon icon="mdi:thermometer"></ha-icon><b data-summary="temp">–</b></span><span><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon><b data-summary="lights">0</b></span><span class="open"><ha-icon icon="mdi:door-open"></ha-icon><b data-summary="open">0</b></span></div></header><div class="grid" style="--cols:${columns}"></div></section><dialog><div class="popup-head"><span class="room-icon"><ha-icon></ha-icon></span><div class="popup-title"><b></b><span></span></div><button class="close" aria-label="Luk"><ha-icon icon="mdi:close"></ha-icon></button></div><div class="popup-body"><div class="hero"><div class="metric"><span>Temperatur</span><strong data-pop="temp">–</strong></div><div class="metric"><span>Fugt</span><strong data-pop="humidity">–</strong></div><div class="metric"><span>Status</span><strong data-pop="presence">–</strong></div></div><div class="control-grid"></div><div class="climate-row hidden"><button data-climate="down">−</button><div class="climate-value"><b>–</b><span>Ønsket temperatur</span></div><button data-climate="up">+</button></div><button class="full hidden">Åbn fuld rumstyring</button></div></dialog>`;
    const grid = this.shadowRoot.querySelector(".grid");
    this.config.rooms.forEach((room, index) => {
      const el = document.createElement("article"); el.className = "room"; el.dataset.index = index;
      el.innerHTML = `<div class="room-head"><span class="room-icon"><ha-icon></ha-icon></span><span class="room-name"></span><i class="presence"></i></div><div class="measure"><strong class="temperature"><span>–</span><small>°C</small></strong><span class="humidity">–%</span></div><div class="status"><ha-icon></ha-icon><span></span></div><div class="actions"><button class="quick"><ha-icon></ha-icon><span></span></button><button class="more" aria-label="Mere"><ha-icon icon="mdi:dots-horizontal"></ha-icon></button></div>`;
      el.addEventListener("click", () => this._open(index)); el.querySelector(".quick").addEventListener("click", (event) => { event.stopPropagation(); this._toggleLight(index); }); grid.append(el);
    });
    const dialog = this.shadowRoot.querySelector("dialog");
    dialog.querySelector(".close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.querySelectorAll("[data-climate]").forEach((button) => button.addEventListener("click", () => this._adjustClimate(button.dataset.climate === "up" ? .5 : -.5)));
    dialog.querySelector(".full").addEventListener("click", () => { const room = this.config.rooms[this._selected]; dialog.close(); this._navigate(room?.popup); });
    this._built = true;
  }
  _status(room, state) {
    if (state.open) return { icon: "mdi:door-open", text: "Åbning åben", warn: true };
    if (state.alert) return { icon: room.alert?.icon || "mdi:alert-circle-outline", text: room.alert?.active || "Aktiv", warn: true };
    if (room.alert) return { icon: room.alert.icon || "mdi:check-circle-outline", text: room.alert.idle || "Klar", warn: false };
    if (state.presence) return { icon: "mdi:motion-sensor", text: "Aktivitet", warn: false };
    return { icon: "mdi:check-circle-outline", text: "Roligt", warn: false };
  }
  _update() {
    if (!this._built || !this._hass) return;
    const entries = this.config.rooms.map((room) => ({ room, state: this._room(room) }));
    const temps = entries.filter((x) => !x.room.outdoor && x.state.temp != null).map((x) => x.state.temp);
    this.shadowRoot.querySelector("h2").textContent = this.config.title;
    this.shadowRoot.querySelector(".summary").classList.toggle("hidden", this.config.show_summary === false);
    this.shadowRoot.querySelector('[data-summary="temp"]').textContent = temps.length ? `${this._fmt(temps.reduce((a,b)=>a+b,0)/temps.length)}°` : "–";
    this.shadowRoot.querySelector('[data-summary="lights"]').textContent = entries.filter((x) => x.state.light).length;
    const open = entries.filter((x) => x.state.open).length; this.shadowRoot.querySelector('[data-summary="open"]').textContent = open; this.shadowRoot.querySelector(".summary .open").classList.toggle("warn", open > 0);
    [...this.shadowRoot.querySelectorAll(".room")].forEach((el, index) => {
      const { room, state } = entries[index], status = this._status(room, state), accent = room.accent || "var(--dashboard-accent,var(--primary-color,#5ab5ff))";
      el.style.setProperty("--room-accent", accent); el.classList.toggle("light-on", state.light); el.classList.toggle("warning", status.warn);
      el.querySelector(".room-icon ha-icon").setAttribute("icon", room.icon || "mdi:home-outline"); el.querySelector(".room-name").textContent = room.name || "Rum";
      el.querySelector(".presence").classList.toggle("on", state.presence); el.querySelector(".temperature > span").textContent = this._fmt(state.temp); el.querySelector(".humidity").textContent = `${this._fmt(state.humidity,0)}%`;
      const statusEl = el.querySelector(".status"); statusEl.classList.toggle("warn", status.warn); statusEl.querySelector("ha-icon").setAttribute("icon", status.icon); statusEl.querySelector("span").textContent = status.text;
      const quick = el.querySelector(".quick"); quick.classList.toggle("on", state.light); quick.disabled = !room.light; quick.querySelector("ha-icon").setAttribute("icon", state.light ? "mdi:lightbulb-off-outline" : "mdi:lightbulb-on-outline"); quick.querySelector("span").textContent = state.light ? "Sluk alt lys" : "Tænd lys";
    });
    if (this._selected >= 0 && this.shadowRoot.querySelector("dialog").open) this._updatePopup();
  }
  _open(index) { this._selected = index; this._updatePopup(); const dialog = this.shadowRoot.querySelector("dialog"); if (!dialog.open) dialog.showModal(); }
  _updatePopup() {
    const room = this.config.rooms[this._selected]; if (!room) return; const state = this._room(room), dialog = this.shadowRoot.querySelector("dialog"), status = this._status(room, state);
    dialog.style.setProperty("--room-accent", room.accent || "var(--dashboard-accent,var(--primary-color,#5ab5ff))"); dialog.querySelector(".popup-head ha-icon").setAttribute("icon", room.icon || "mdi:home-outline"); dialog.querySelector(".popup-title b").textContent = room.name; dialog.querySelector(".popup-title span").textContent = status.text;
    dialog.querySelector('[data-pop="temp"]').textContent = `${this._fmt(state.temp)}°C`; dialog.querySelector('[data-pop="humidity"]').textContent = `${this._fmt(state.humidity,0)}%`; dialog.querySelector('[data-pop="presence"]').textContent = state.presence ? "Aktiv" : "Rolig";
    const controls = dialog.querySelector(".control-grid"), specs = [
      room.light && { id: room.light, icon: state.light ? "mdi:lightbulb-off-outline" : "mdi:lightbulb-on-outline", title: state.light ? "Sluk alt lys" : "Tænd lys", detail: state.light ? "Lys er tændt" : "Alt lys er slukket", action: "light", on: state.light },
      room.climate && { id: room.climate, icon: "mdi:thermostat", title: "Klima", detail: state.target == null ? state.climateState || "Åbn klima" : `${this._fmt(state.target)}° ønsket`, action: "more", on: ROOM_V2_ACTIVE.has(state.climateState) },
      room.cover && { id: room.cover, icon: state.coverOpen ? "mdi:blinds-open" : "mdi:blinds", title: state.coverOpen ? "Luk gardiner" : "Åbn gardiner", detail: state.coverOpen ? "Åbne" : "Lukkede", action: "cover", on: state.coverOpen },
      room.media_player && { id: room.media_player, icon: "mdi:play-circle-outline", title: "Medier", detail: this._state(room.media_player)?.attributes?.friendly_name || this._state(room.media_player)?.state || "Åbn medier", action: "more", on: state.mediaOn },
      room.opening && { id: room.opening, icon: state.open ? "mdi:door-open" : "mdi:door-closed", title: "Åbninger", detail: state.open ? "Noget står åbent" : "Alt er lukket", action: "more", on: state.open },
      ...this._entities({ extra_entities: room.extra_entities }).map((id) => ({ id, icon: this._state(id)?.attributes?.icon || "mdi:tune-variant", title: this._state(id)?.attributes?.friendly_name || id, detail: this._state(id)?.state || "Ukendt", action: "more", on: this._active(id) })),
    ].filter(Boolean);
    while (controls.children.length < specs.length) { const button = document.createElement("button"); button.className = "control"; button.innerHTML = `<ha-icon></ha-icon><div><b></b><small></small></div>`; controls.append(button); }
    [...controls.children].forEach((button, index) => { const spec = specs[index]; button.classList.toggle("hidden", !spec); if (!spec) return; button.classList.toggle("on", spec.on); button.querySelector("ha-icon").setAttribute("icon", spec.icon); button.querySelector("b").textContent = spec.title; button.querySelector("small").textContent = spec.detail; button.onclick = () => this._control(spec); });
    const climate = dialog.querySelector(".climate-row"); climate.classList.toggle("hidden", !room.climate || state.target == null); climate.querySelector("b").textContent = state.target == null ? "–" : `${this._fmt(state.target)}°`;
    dialog.querySelector(".full").classList.toggle("hidden", !room.popup);
  }
  _toggleLight(index) { const id = this.config.rooms[index]?.light; if (id) this._hass?.callService("light", "toggle", { entity_id: id }); }
  _control(spec) {
    if (spec.action === "light") return this._toggleLight(this._selected);
    if (spec.action === "cover") return this._hass?.callService("cover", spec.on ? "close_cover" : "open_cover", { entity_id: spec.id });
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: spec.id }, bubbles: true, composed: true }));
  }
  _adjustClimate(delta) { const room = this.config.rooms[this._selected], state = this._room(room); if (room?.climate && state.target != null) this._hass?.callService("climate", "set_temperature", { entity_id: room.climate, temperature: state.target + delta }); }
  _navigate(path) { if (!path) return; const hash = path.startsWith("#") ? path : `#${path}`, sameHash = location.hash === hash; if (!sameHash) history.pushState(null, "", hash); window.dispatchEvent(new CustomEvent("location-changed", { detail: { source: "bubble-popup-add-hash", sameHash, replace: false } })); }
}

if (!customElements.get("ha-home-room-overview-card-v2-editor")) customElements.define("ha-home-room-overview-card-v2-editor", HaHomeRoomOverviewCardV2Editor);
if (!customElements.get("ha-home-room-overview-card-v2")) customElements.define("ha-home-room-overview-card-v2", HaHomeRoomOverviewCardV2);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-home-room-overview-card-v2", name: "Home Room Overview Card V2", description: `Professional room overview and control popup v${ROOM_V2_VERSION}`, preview: true });
