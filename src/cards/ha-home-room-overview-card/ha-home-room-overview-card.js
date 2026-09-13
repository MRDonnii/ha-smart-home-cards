import "./ha-card-list-editor.js";
const ROOM_OVERVIEW_VERSION = "0.3.0";

class HaHomeRoomOverviewCard extends HTMLElement {
  static getStubConfig() {
    return {
      title: "Alle rum",
      rooms: [
        { name: "Living room", icon: "mdi:sofa", temperature: "sensor.living_room_temperature", humidity: "sensor.living_room_humidity", light: "light.living_room", presence: "binary_sensor.living_room_presence", popup: "#living-room" }
      ]
    };
  }
  static getConfigElement(){const e=document.createElement("ha-card-list-editor");e.definition={roots:[{key:"title",label:"Titel"},{key:"desktop_columns",label:"PC-kolonner",type:"number"}],collections:[{key:"rooms",label:"Rum",itemLabel:"rum",defaults:{name:"Nyt rum",icon:"mdi:home-outline"},fields:[{key:"name",label:"Navn"},{key:"icon",label:"Ikon"},{key:"accent",label:"Accentfarve"},{key:"temperature",label:"Temperatur",type:"entity"},{key:"humidity",label:"Luftfugtighed",type:"entity"},{key:"light",label:"Lys",type:"entity"},{key:"presence",label:"Tilstedeværelse",type:"entity"},{key:"opening",label:"Vindue/dør",type:"entity"},{key:"alert.entity",label:"Advarsel",type:"entity"},{key:"alert.icon",label:"Advarselsikon"},{key:"popup",label:"Popup-id"}]}]};return e;}
  setConfig(config) {
    if (!config || !Array.isArray(config.rooms) || !config.rooms.length) throw new Error("rooms is required");
    this.config = config;
    this._history = new Map();
    this._historyLoading = false;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const signature = this._stateSignature();
    if (signature !== this._lastStateSignature) {
      this._lastStateSignature = signature;
      this._render();
    }
    this._loadHistory();
  }

  getCardSize() { return 9; }

  _state(entity) { return this._hass?.states?.[entity]; }
  _number(entity) {
    const n = Number(this._state(entity)?.state);
    return Number.isFinite(n) ? n : null;
  }
  _active(entity) { return ["on", "open", "opening", "playing", "home"].includes(this._state(entity)?.state); }
  _fmt(value, digits = 1) { if (value == null) return "–"; const lang = this._hass?.locale?.language || this._hass?.language || "da"; return value.toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
  _stateSignature() {
    if (!this.config || !this._hass) return "";
    const entities = this.config.rooms.flatMap((room) => [
      room.temperature, room.humidity, room.light, room.presence, room.opening,
      room.alert?.entity
    ]).filter(Boolean);
    return entities.map((entity) => `${entity}:${this._hass.states[entity]?.state ?? "missing"}`).join("|");
  }

  _roomState(room) {
    const temp = this._number(room.temperature);
    const humidity = this._number(room.humidity);
    const light = this._state(room.light)?.state === "on";
    const presence = room.presence ? this._active(room.presence) : false;
    const open = room.opening ? this._active(room.opening) : false;
    const alert = room.alert ? this._active(room.alert.entity) : false;
    return { temp, humidity, light, presence, open, alert };
  }

  _sparkline(entity) {
    const points = this._history.get(entity) || [];
    if (points.length < 2) return "";
    const values = points.map((p) => p.v);
    let min = Math.min(...values), max = Math.max(...values);
    if (max - min < .5) { min -= .25; max += .25; }
    return points.map((p, i) => `${(i / (points.length - 1) * 100).toFixed(1)},${(42 - ((p.v - min) / (max - min) * 31)).toFixed(1)}`).join(" ");
  }

  async _loadHistory() {
    if (!this._hass || this._historyLoading || this._history.size) return;
    this._historyLoading = true;
    try {
      const entities = [...new Set(this.config.rooms.map((r) => r.temperature).filter(Boolean))];
      const start = new Date(Date.now() - 24 * 3600e3).toISOString();
      const data = await this._hass.callApi("GET", `history/period/${start}?filter_entity_id=${encodeURIComponent(entities.join(","))}&minimal_response&no_attributes&significant_changes_only`);
      for (const series of data || []) {
        if (!series?.length) continue;
        const entity = series[0].entity_id;
        const raw = series.map((s) => ({ v: Number(s.state), t: s.last_changed || s.last_updated })).filter((p) => Number.isFinite(p.v));
        const step = Math.max(1, Math.ceil(raw.length / 48));
        this._history.set(entity, raw.filter((_, i) => i % step === 0 || i === raw.length - 1));
      }
    } catch (err) { console.warn("Room overview history", err); }
    finally { this._historyLoading = false; this._render(); }
  }

  _navigate(path) {
    if (!path) return;
    const hash = path.startsWith("#") ? path : `#${path}`;
    const sameHash = window.location.hash === hash;
    if (!sameHash) history.pushState(null, "", hash);
    window.dispatchEvent(new CustomEvent("location-changed", {
      detail: { source: "bubble-popup-add-hash", sameHash, replace: false }
    }));
  }
  _toggleLight(event, entity) {
    event.stopPropagation();
    if (entity) this._hass.callService("light", "toggle", { entity_id: entity });
  }

  _render() {
    if (!this.shadowRoot || !this.config || !this._hass) return;
    const states = this.config.rooms.map((r) => ({ room: r, state: this._roomState(r) }));
    const occupied = states.filter((x) => x.state.presence).length;
    const lights = states.filter((x) => x.state.light).length;
    const openings = states.filter((x) => x.state.open).length;
    const indoorTemps = states.filter((x) => !x.room.outdoor && x.state.temp != null).map((x) => x.state.temp);
    const average = indoorTemps.length ? indoorTemps.reduce((a, b) => a + b, 0) / indoorTemps.length : null;
    const desktopColumns = Math.min(6, Math.max(2, Number(this.config.desktop_columns) || 4));

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,Inter,system-ui,sans-serif)}
      *{box-sizing:border-box}.shell{position:relative;overflow:hidden;padding:26px;border:1px solid color-mix(in srgb,var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.14))) 78%,transparent);border-radius:30px;background:radial-gradient(circle at 92% 3%,color-mix(in srgb,var(--dashboard-accent,var(--primary-color,#58aeff)) 13%,transparent),transparent 28%),var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#1b1f27)));box-shadow:var(--dashboard-shadow-deep,0 20px 50px rgba(0,0,0,.25))}
      .shell:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.2;background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:42px 42px}
      header{position:relative;display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:23px}.eyebrow{display:flex;align-items:center;gap:9px;color:var(--dashboard-accent,var(--primary-color,#58aeff));font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}.eyebrow i{width:8px;height:8px;border-radius:50%;background:var(--dashboard-success,var(--success-color,#4caf82));box-shadow:0 0 14px var(--dashboard-success,var(--success-color,#4caf82))}h1{margin:7px 0 3px;font-size:clamp(28px,3vw,43px);line-height:1.05;letter-spacing:-.045em}.subtitle{color:var(--secondary-text-color);font-size:14px}
      .summary{display:grid;grid-template-columns:repeat(4,minmax(82px,1fr));gap:9px}.sum{min-width:95px;padding:11px 13px;border:1px solid color-mix(in srgb,var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.14))) 65%,transparent);border-radius:15px;background:var(--contrast1,rgba(255,255,255,.045))}.sum span{display:block;color:var(--secondary-text-color);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.sum strong{display:block;margin-top:4px;font-size:18px}.sum.warn strong{color:var(--dashboard-warning,var(--warning-color,#ffb74d))}
      .grid{position:relative;display:grid;grid-template-columns:repeat(var(--desktop-columns,4),minmax(0,1fr));grid-auto-rows:190px;gap:14px}.room{--accent:var(--dashboard-accent,var(--primary-color,#58aeff));position:relative;isolation:isolate;overflow:hidden;height:190px;padding:19px;border:1px solid color-mix(in srgb,var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.14))) 68%,transparent);border-radius:22px;background:var(--surface-soft-gradient,linear-gradient(145deg,rgba(255,255,255,.035),rgba(0,0,0,.02)));cursor:pointer;transition:transform .22s ease,border-color .22s ease,box-shadow .22s ease}.room:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--accent) 55%,transparent);box-shadow:var(--dashboard-shadow-strong, var(--ha-card-box-shadow, 0 14px 32px rgba(0,0,0,.22)))}.room.on{border-color:color-mix(in srgb,var(--accent) 45%,transparent);background:radial-gradient(circle at 85% 100%,color-mix(in srgb,var(--accent) 12%,transparent),transparent 45%),var(--surface,var(--ha-card-background,var(--card-background-color,#1e222a)))}.room.alert{--accent:var(--dashboard-warning,var(--warning-color,#ffb74d))}.room.opening{--accent:var(--dashboard-danger,var(--error-color,#ff6f79))}
      .graph{position:absolute;left:-2%;right:-2%;bottom:25px;height:64px;z-index:-1;opacity:.13}.graph polyline{fill:none;stroke:var(--accent);stroke-width:1.35;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 5px var(--accent))}.graph path{fill:url(#fade)}
      .top{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:12px}.identity{display:flex;gap:12px;min-width:0}.identity>div{min-width:0}.icon{display:grid;place-items:center;width:42px;height:42px;flex:0 0 42px;border-radius:13px;background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent)}ha-icon{--mdc-icon-size:25px}.name{max-width:100%;font-size:19px;font-weight:780;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status{display:flex;align-items:center;gap:7px;min-width:0;margin-top:5px;color:var(--secondary-text-color);font-size:10px;font-weight:750;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dot{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:var(--dashboard-icon-muted, var(--disabled-text-color, var(--secondary-text-color,#8a97a8)))}.dot.present{background:var(--dashboard-success,var(--success-color,#4caf82));box-shadow:0 0 10px var(--dashboard-success,var(--success-color,#4caf82))}.temp{flex:0 0 auto;text-align:right;font-size:30px;font-weight:800;letter-spacing:-.055em;line-height:1;white-space:nowrap}.temp small{margin-left:2px;color:var(--secondary-text-color);font-size:12px;font-weight:500;letter-spacing:0}
      .climate{position:absolute;left:19px;top:103px}.humidity span{display:block;color:var(--secondary-text-color);font-size:10px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.humidity strong{display:block;margin-top:3px;font-size:15px}.foot{position:absolute;left:19px;right:19px;bottom:13px;display:flex;align-items:center;justify-content:space-between;gap:10px;height:39px;padding-top:8px;border-top:1px solid color-mix(in srgb,var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.14))) 60%,transparent)}.room-note{display:flex;align-items:center;gap:7px;min-width:0;color:var(--secondary-text-color);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.room-note.warn{color:var(--dashboard-warning,var(--warning-color,#ffb74d))}.room-note ha-icon{--mdc-icon-size:16px;flex:0 0 auto}.actions{display:flex;flex:0 0 auto;gap:7px}.button{display:grid;place-items:center;width:31px;height:31px;border:1px solid color-mix(in srgb,var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.14))) 65%,transparent);border-radius:10px;background:var(--contrast1,rgba(255,255,255,.045));color:var(--dashboard-icon-muted, var(--disabled-text-color, var(--secondary-text-color,#8a97a8)))}.button.light-on{color:var(--dashboard-warning,var(--warning-color,#ffb74d));background:color-mix(in srgb,var(--dashboard-warning,var(--warning-color,#ffb74d)) 12%,transparent);box-shadow:0 0 18px color-mix(in srgb,var(--dashboard-warning,var(--warning-color,#ffb74d)) 10%,transparent)}.button ha-icon{--mdc-icon-size:18px}.arrow{color:var(--accent)}
      @media(max-width:1100px){.grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))}}
      @media(max-width:1000px){header{align-items:flex-start;flex-direction:column}.summary{width:100%}}
      @media(max-width:650px){.shell{padding:12px;border-radius:20px}header{gap:15px;margin-bottom:15px}h1{font-size:27px}.subtitle{font-size:12px}.summary{grid-template-columns:repeat(2,1fr);gap:6px}.sum{min-width:0;padding:8px 10px}.sum strong{font-size:16px}.grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr));grid-auto-rows:170px;gap:8px}.room{height:170px;padding:11px;border-radius:17px}.top{grid-template-columns:minmax(0,1fr);gap:0}.identity{gap:7px;padding-right:0}.icon{width:31px;height:31px;border-radius:10px;flex:0 0 31px}.icon ha-icon{--mdc-icon-size:19px}.name{font-size:13px}.status{margin-top:3px;font-size:0}.temp{position:absolute;top:55px;left:11px;right:auto;font-size:23px}.temp small{font-size:10px}.climate{left:auto;right:11px;top:55px;text-align:right}.humidity span{font-size:8px}.humidity strong{font-size:12px}.foot{left:11px;right:11px;bottom:9px;height:35px;padding-top:6px}.room-note{font-size:9px;gap:4px}.room-note ha-icon{--mdc-icon-size:13px}.button{width:28px;height:28px;border-radius:9px}.button ha-icon{--mdc-icon-size:16px}.arrow{display:none}.graph{bottom:29px;height:50px}}
    </style><section class="shell"><header><div><div class="eyebrow"><i></i>Hjemmet lige nu</div><h1>${this.config.title || "Alle rum"}</h1><div class="subtitle">Temperatur, aktivitet og hurtig styring samlet ét sted</div></div><div class="summary">
      <div class="sum"><span>Gennemsnit</span><strong>${this._fmt(average)}°</strong></div><div class="sum"><span>Aktive rum</span><strong>${occupied}</strong></div><div class="sum"><span>Lys tændt</span><strong>${lights}</strong></div><div class="sum ${openings ? "warn" : ""}"><span>Åbninger</span><strong>${openings}</strong></div>
    </div></header><div class="grid" style="--desktop-columns:${desktopColumns}">${states.map(({ room, state }) => this._renderRoom(room, state)).join("")}</div></section>`;
    this.shadowRoot.querySelectorAll(".room").forEach((el) => el.addEventListener("click", () => this._navigate(el.dataset.popup)));
    this.shadowRoot.querySelectorAll("[data-light]").forEach((el) => el.addEventListener("click", (e) => this._toggleLight(e, el.dataset.light)));
  }

  _renderRoom(room, s) {
    const line = this._sparkline(room.temperature);
    const status = s.presence ? "Aktivitet i rummet" : s.open ? "Åbning registreret" : "Roligt i rummet";
    const secondary = room.alert ? (s.alert ? room.alert.active : room.alert.idle) : (s.open ? "Åben" : room.opening ? "Lukket" : "Normal");
    const secondaryIcon = room.alert?.icon || (room.opening ? "mdi:door-closed" : "mdi:check-circle-outline");
    return `<article class="room ${s.light ? "on" : ""} ${s.alert ? "alert" : ""} ${s.open ? "opening" : ""}" data-popup="${room.popup}" style="--accent:${room.accent || "var(--dashboard-accent,var(--primary-color,#58aeff))"}">
      ${line ? `<svg class="graph" viewBox="0 0 100 45" preserveAspectRatio="none"><defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".3"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs><polyline points="${line}"/></svg>` : ""}
      <div class="top"><div class="identity"><div class="icon"><ha-icon icon="${room.icon}"></ha-icon></div><div><div class="name">${room.name}</div><div class="status"><i class="dot ${s.presence ? "present" : ""}"></i>${status}</div></div></div><div class="temp">${this._fmt(s.temp)}<small>°C</small></div></div>
      <div class="climate"><div class="humidity"><span>Luftfugtighed</span><strong>${this._fmt(s.humidity,0)}%</strong></div></div>
      <div class="foot"><div class="room-note ${s.alert || s.open ? "warn" : ""}"><ha-icon icon="${secondaryIcon}"></ha-icon>${secondary}</div><div class="actions"><div class="button ${s.light ? "light-on" : ""}" data-light="${room.light}" title="Skift lys"><ha-icon icon="${s.light ? "mdi:lightbulb-on" : "mdi:lightbulb-outline"}"></ha-icon></div><div class="button arrow"><ha-icon icon="mdi:chevron-right"></ha-icon></div></div></div>
    </article>`;
  }
}

if (!customElements.get("ha-home-room-overview-card")) customElements.define("ha-home-room-overview-card", HaHomeRoomOverviewCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-home-room-overview-card", name: "HA Home Room Overview", description: `Room overview ${ROOM_OVERVIEW_VERSION}` });
