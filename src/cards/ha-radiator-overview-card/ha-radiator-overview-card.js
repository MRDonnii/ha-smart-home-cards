import "./ha-card-list-editor.js";
const VERSION = "0.3.0";

class HARadiatorOverviewCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._signature = "";
    this._history = {};
    this._historyLoading = false;
    this._historyTimer = undefined;
  }

  static getStubConfig() {
    return { title: "Radiatoroverblik", rooms: [] };
  }
  static getConfigElement(){const e=document.createElement("ha-card-list-editor");e.definition={roots:[{key:"title",label:"Titel"},{key:"animation",label:"Animation",type:"boolean"}],collections:[{key:"rooms",label:"Radiatorer og rum",itemLabel:"rum",defaults:{name:"Nyt rum",icon:"mdi:radiator"},fields:[{key:"name",label:"Navn"},{key:"icon",label:"Ikon"},{key:"temperature",label:"Temperatur",type:"entity"},{key:"humidity",label:"Luftfugtighed",type:"entity"},{key:"comfort",label:"Komfortstatus",type:"entity"},{key:"climate",label:"Termostat",type:"entity"},{key:"valve",label:"Ventilåbning",type:"entity"},{key:"battery",label:"Batteri",type:"entity"},{key:"battery_state",label:"Batteristatus",type:"entity"}]}]};return e;}

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms)) throw new Error("Radiatoroverblik kræver en rooms-liste");
    this._config = { title: "Radiatoroverblik", animation: true, history_hours: 24, ...config };
    this._signature = "";
    this._render();
    this._requestHistory();
  }

  connectedCallback() {
    this._requestHistory();
    if (!this._historyTimer) this._historyTimer = setInterval(() => this._fetchHistory(), 300000);
  }

  disconnectedCallback() {
    clearInterval(this._historyTimer);
    this._historyTimer = undefined;
  }

  set hass(hass) {
    this._hass = hass;
    const ids = this._config.rooms?.flatMap((room) => [room.climate, room.temperature, room.humidity, room.window, room.comfort]).filter(Boolean) || [];
    const signature = JSON.stringify(ids.map((id) => {
      const entity = hass?.states?.[id];
      return [id, entity?.state, entity?.attributes?.current_temperature, entity?.attributes?.temperature, entity?.attributes?.hvac_action];
    }));
    if (signature !== this._signature) {
      this._signature = signature;
      this._render();
    }
    this._requestHistory();
  }

  getCardSize() { return 12; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }

  _entity(id) {
    const entity = id ? this._hass?.states?.[id] : undefined;
    return entity && !["unknown", "unavailable", ""].includes(entity.state) ? entity : undefined;
  }

  _number(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  _object(value) {
    if (value && typeof value === "object") return value;
    if (typeof value !== "string" || !value.trim()) return {};
    try { return JSON.parse(value); } catch { return {}; }
  }

  _roomState(room) {
    const climate = this._entity(room.climate);
    const temperatureEntity = this._entity(room.temperature);
    const humidityEntity = this._entity(room.humidity);
    const comfortEntity = this._entity(room.comfort);
    const current = this._number(climate?.attributes?.current_temperature ?? temperatureEntity?.state);
    const target = this._number(climate?.attributes?.temperature);
    const humidity = this._number(climate?.attributes?.current_humidity ?? humidityEntity?.state);
    const windowOpen = ["on", "open", "opening"].includes(String(this._entity(room.window)?.state).toLowerCase()) || climate?.attributes?.window_open === true || climate?.attributes?.door_open === true;
    const off = climate ? climate.state === "off" : false;
    const delta = current !== undefined && target !== undefined ? current - target : undefined;
    const comfortable = comfortEntity?.attributes?.is_comfortable;
    const valveValues = Object.values(this._object(climate?.attributes?.calibration_balance))
      .map((entry) => this._number(entry?.["valve%"] ?? entry?.valve ?? entry?.position))
      .filter((value) => value !== undefined);
    const valve = valveValues.length ? Math.max(...valveValues) : undefined;
    const heating = climate?.attributes?.hvac_action === "heating" && !windowOpen && (valve === undefined || valve > 0);
    const batteryValues = Object.entries(this._object(climate?.attributes?.batteries))
      .filter(([entityId]) => entityId.startsWith("climate."))
      .map(([, entry]) => this._number(entry?.battery))
      .filter((value) => value !== undefined);
    const batteries = batteryValues.length ? batteryValues : [];
    let tone = "neutral";
    if (delta !== undefined && delta < -0.4) tone = "cold";
    else if (delta !== undefined && delta > 0.7) tone = "warm";
    else if (target !== undefined && current !== undefined) tone = "ok";
    else if (comfortable === false) tone = "warn";
    else if (current !== undefined) tone = "ok";
    return { climate, current, target, humidity, windowOpen, heating, off, delta, comfortable, valve, batteries, tone };
  }

  _format(value, digits = 1) {
    if (value === undefined) return "—";
    const language = this._hass?.locale?.language || this._hass?.language || "da";
    return value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  _escape(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  _requestHistory() {
    if (!this._hass || this._historyLoading || Object.keys(this._history).length) return;
    this._fetchHistory();
  }

  async _fetchHistory() {
    if (!this._hass?.callApi || this._historyLoading) return;
    this._historyLoading = true;
    try {
      const ids = (this._config.rooms || []).map((room) => room.temperature).filter(Boolean);
      const start = new Date(Date.now() - (this._config.history_hours || 24) * 3600000).toISOString();
      const path = `history/period/${encodeURIComponent(start)}?filter_entity_id=${encodeURIComponent(ids.join(","))}&minimal_response&no_attributes`;
      const result = await this._hass.callApi("GET", path);
      const history = {};
      for (const series of Array.isArray(result) ? result : []) {
        const entityId = series.find((entry) => entry.entity_id)?.entity_id;
        if (entityId) history[entityId] = series;
      }
      this._history = history;
      this._render();
    } catch (error) {
      console.warn("HA Radiator Overview Card: history could not be loaded", error);
    } finally {
      this._historyLoading = false;
    }
  }

  _backgroundGraph(room, state, index) {
    const now = Date.now();
    const start = now - (this._config.history_hours || 24) * 3600000;
    const values = (this._history[room.temperature] || [])
      .map((entry) => ({ time: new Date(entry.last_changed || entry.last_updated).getTime(), value: this._number(entry.state) }))
      .filter((point) => Number.isFinite(point.time) && point.value !== undefined && point.time >= start);
    if (state.current !== undefined && (!values.length || values[values.length - 1].time < now - 60000)) values.push({ time: now, value: state.current });
    if (values.length < 2) return "";
    const numbers = values.map((point) => point.value);
    let min = Math.min(...numbers), max = Math.max(...numbers);
    const span = Math.max(max - min, 0.8);
    min -= span * .25; max += span * .25;
    const width = 360, height = 150;
    const x = (time) => Math.max(0, Math.min(width, (time - start) / (now - start) * width));
    const y = (value) => 8 + (max - value) / (max - min) * (height - 16);
    const points = values.map((point) => `${x(point.time).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
    const fill = `0,${height} ${points} ${width},${height}`;
    return `<div class="room-chart" aria-hidden="true"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><linearGradient id="room-fill-${index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".34"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><polygon points="${fill}" fill="url(#room-fill-${index})"/><polyline points="${points}" fill="none" vector-effect="non-scaling-stroke"/></svg></div>`;
  }

  _status(state) {
    if (state.tone === "cold") return "Under mål";
    if (state.tone === "warm") return "Over mål";
    if (state.current === undefined) return "Ingen data";
    return state.target !== undefined ? "På mål" : "Måling";
  }

  _roomMarkup(room, index) {
    const state = this._roomState(room);
    const target = state.target === undefined ? "" : `<div class="metric"><span>Mål</span><strong>${this._format(state.target)}°</strong></div>`;
    const humidity = state.humidity === undefined ? "" : `<div class="metric"><span>Fugt</span><strong>${this._format(state.humidity, 0)}%</strong></div>`;
    const valve = state.valve === undefined ? "" : `<div class="metric equipment valve"><span>Ventil</span><strong>${this._format(state.valve, 0)}%</strong></div>`;
    const batteryLow = state.batteries.some((value) => value <= 20);
    const battery = !state.batteries.length ? "" : `<div class="metric equipment battery ${batteryLow ? "low" : ""}"><span>${state.batteries.length > 1 ? "Batterier" : "Batteri"}</span><strong>${state.batteries.map((value) => `${this._format(value, 0)}%`).join(" · ")}</strong></div>`;
    const radiator = room.climate ? `
      <div class="radiator" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i>
      </div>` : `<ha-icon class="sensor-icon" icon="${this._escape(room.icon || "mdi:home-thermometer-outline")}"></ha-icon>`;
    return `
      <button class="room ${state.tone} ${state.heating ? "radiator-heating" : ""}" data-index="${index}" ${room.climate ? "" : "disabled"}>
        <div class="room-glow"></div>
        ${this._backgroundGraph(room, state, index)}
        <div class="room-head">
          <div><span class="room-name">${this._escape(room.name)}</span><span class="room-status"><b></b>${this._status(state)}</span></div>
        </div>
        <div class="room-body">
          ${radiator}
          <div class="temperature"><strong>${this._format(state.current)}</strong><span>°C</span></div>
        </div>
        <div class="room-foot">${target}${humidity}${state.delta === undefined ? "" : `<div class="metric"><span>Afvigelse</span><strong>${state.delta > 0 ? "+" : ""}${this._format(state.delta)}°</strong></div>`}${valve}${battery}</div>
      </button>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const rooms = this._config.rooms || [];
    const states = rooms.map((room) => this._roomState(room));
    const radiatorStates = states.filter((state) => state.climate);
    const heating = radiatorStates.filter((state) => state.heating).length;
    const open = radiatorStates.filter((state) => state.windowOpen).length;
    const values = rooms
      .map((room, i) => (room.outdoor ? undefined : states[i].current))
      .filter((value) => value !== undefined);
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
    const animationClass = this._config.animation === false ? "no-animation" : "";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; --hot:#ff8a3d; --hot2:#ffca62; --cool:var(--state-cool-icon, var(--info-color, #58aaf8)); --ok:var(--dashboard-success, var(--success-color, #5bc99a)); --accent:var(--dashboard-accent, var(--info-color, #38bdf8)); --edge:var(--dashboard-border-neutral, var(--divider-color, rgba(255,255,255,.11))); }
        * { box-sizing:border-box; }
        ha-card { position:relative; overflow:hidden; border-radius:24px; background:var(--dashboard-card-bg, var(--surface, var(--ha-card-background, var(--card-background-color, #111820)))); box-shadow:var(--ha-card-box-shadow); color:var(--primary-text-color); }
        .shell { position:relative; padding:22px; isolation:isolate; }
        .ambient { position:absolute; inset:-30%; z-index:-1; opacity:.28; background:radial-gradient(circle at 18% 2%,rgba(255,138,61,.35),transparent 27%),radial-gradient(circle at 90% 22%,rgba(88,170,248,.2),transparent 24%); pointer-events:none; }
        header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:18px; }
        .eyebrow { display:flex; align-items:center; gap:8px; color:var(--secondary-text-color); font-size:11px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
        .eyebrow b { width:7px; height:7px; border-radius:50%; background:${heating ? "var(--hot)" : "var(--ok)"}; box-shadow:0 0 14px ${heating ? "var(--hot)" : "var(--ok)"}; }
        h2 { margin:5px 0 0; font-size:25px; line-height:1.08; letter-spacing:-.035em; }
        .summary { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        .summary-item { min-width:84px; padding:9px 12px; border:1px solid color-mix(in srgb,var(--accent) 16%,transparent); border-left:3px solid var(--accent); border-radius:14px; background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 7%,transparent),transparent 55%),rgba(0,0,0,.08); box-shadow:0 4px 12px rgba(0,0,0,.1); }
        .summary-item span { display:block; color:var(--secondary-text-color); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
        .summary-item strong { display:block; margin-top:3px; font-size:17px; }
        .system { position:relative; height:86px; margin:4px 0 20px; border:1px solid color-mix(in srgb,var(--accent) 18%,var(--edge)); border-radius:19px; background:linear-gradient(90deg,rgba(255,138,61,.08),rgba(255,255,255,.025),rgba(88,170,248,.07)); overflow:hidden; }
        .system-line { position:absolute; left:8%; right:8%; top:50%; height:4px; transform:translateY(-50%); border-radius:99px; background:linear-gradient(90deg,var(--hot),var(--hot2) 46%,rgba(255,255,255,.16) 55%,var(--cool)); box-shadow:0 0 18px rgba(255,138,61,.25); }
        .system-line::after { content:""; position:absolute; inset:-1px; width:45px; border-radius:99px; background:linear-gradient(90deg,transparent,rgba(255,255,255,.9),transparent); animation:flow 2.8s linear infinite; }
        .hub { position:absolute; top:50%; transform:translateY(-50%); display:flex; align-items:center; gap:9px; padding:9px 12px; border:1px solid color-mix(in srgb,var(--hot) 22%,var(--edge)); border-radius:13px; background:var(--ha-card-background); box-shadow:0 8px 24px rgba(0,0,0,.18); }
        .hub.return { border-color:color-mix(in srgb,var(--cool) 22%,var(--edge)); }
        .hub ha-icon { width:22px; color:var(--hot); }
        .hub span { display:block; font-size:9px; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.09em; }
        .hub strong { display:block; font-size:12px; }
        .hub.source { left:3%; } .hub.house { left:50%; transform:translate(-50%,-50%); } .hub.return { right:3%; }
        .hub.return ha-icon { color:var(--cool); }
        .rooms { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr)); gap:12px; }
        .room { position:relative; min-width:0; min-height:206px; padding:15px; overflow:hidden; border:1px solid color-mix(in srgb,var(--room-color) 22%,var(--edge)); border-left:4px solid var(--room-color); border-radius:18px; background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(0,0,0,.04)); color:inherit; font:inherit; text-align:left; cursor:pointer; box-shadow:0 8px 24px rgba(0,0,0,.08); transition:transform .2s ease,border-color .25s ease,box-shadow .25s ease; }
        .room > *:not(.room-chart):not(.room-glow) { position:relative; z-index:2; }
        .room:hover { transform:translateY(-2px); border-color:color-mix(in srgb,var(--room-color) 48%,transparent); box-shadow:0 12px 30px rgba(0,0,0,.15),0 0 0 1px color-mix(in srgb,var(--room-color) 12%,transparent); }
        .room:disabled { cursor:default; opacity:1; } .room:disabled:hover { transform:none; }
        .room { --room-color:var(--ok); } .room.cold { --room-color:var(--cool); } .room.warm,.room.warn { --room-color:var(--hot2); } .room.neutral { --room-color:var(--secondary-text-color); }
        .room-glow { position:absolute; width:150px; height:150px; right:-60px; bottom:-70px; border-radius:50%; background:var(--room-color); opacity:.10; filter:blur(28px); pointer-events:none; }
        .room-chart { position:absolute; z-index:0; left:0; right:0; top:47px; bottom:8px; color:var(--room-color); opacity:.14; pointer-events:none; mask-image:linear-gradient(to bottom,transparent 0,#000 28%,#000 72%,transparent 100%); }
        .room-chart svg { display:block; width:100%; height:100%; }
        .room-chart polyline { stroke:currentColor; stroke-width:1.35; stroke-linecap:round; stroke-linejoin:round; filter:drop-shadow(0 0 3px currentColor); }
        .room-head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
        .room-head > div { min-width:0; }
        .room-name { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; font-weight:800; }
        .room-status { display:flex; align-items:center; gap:6px; margin-top:4px; color:var(--secondary-text-color); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; }
        .room-status b { width:6px; height:6px; border-radius:50%; background:var(--room-color); box-shadow:0 0 8px var(--room-color); }
        .room-body { display:flex; align-items:flex-end; justify-content:space-between; height:74px; margin:4px 0; }
        .temperature { display:flex; align-items:flex-start; letter-spacing:-.05em; }
        .temperature strong { font-size:31px; line-height:1; font-weight:750; } .temperature span { margin:2px 0 0 3px; font-size:12px; color:var(--secondary-text-color); letter-spacing:0; }
        .radiator { position:relative; display:flex; gap:3px; align-items:flex-end; height:45px; padding:0 4px 6px; color:rgba(145,158,171,.62); }
        .radiator::before { content:""; position:absolute; left:2px; right:2px; bottom:3px; height:3px; border-radius:9px; background:currentColor; opacity:.45; }
        .radiator::after { content:""; display:none; position:absolute; left:2px; bottom:2px; width:13px; height:5px; border-radius:9px; background:linear-gradient(90deg,transparent,var(--hot2),#fff,var(--hot2),transparent); filter:drop-shadow(0 0 5px var(--hot)); }
        .radiator i { display:block; width:6px; height:29px; border:1px solid currentColor; border-radius:3px; background:rgba(145,158,171,.10); box-shadow:inset 0 0 4px rgba(145,158,171,.16); }
        .room.radiator-heating .radiator { color:var(--hot); }
        .room.radiator-heating .radiator::before { opacity:.8; box-shadow:0 0 6px rgba(255,138,61,.45); }
        .room.radiator-heating .radiator::after { display:block; animation:radiatorFlow 1.25s linear infinite; }
        .room.radiator-heating .radiator i { background:linear-gradient(180deg,rgba(255,202,98,.72),rgba(255,138,61,.12) 46%,rgba(255,138,61,.03) 72%); background-size:100% 230%; animation:radiatorFill 1.35s ease-in-out infinite; box-shadow:inset 0 0 7px rgba(255,202,98,.45),0 0 7px rgba(255,138,61,.22); }
        .room.radiator-heating .radiator i:nth-child(2){animation-delay:.12s}.room.radiator-heating .radiator i:nth-child(3){animation-delay:.24s}.room.radiator-heating .radiator i:nth-child(4){animation-delay:.36s}.room.radiator-heating .radiator i:nth-child(5){animation-delay:.48s}
        .sensor-icon { width:38px; height:38px; color:var(--room-color); opacity:.8; }
        .room-foot { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9px 12px; padding-top:10px; border-top:1px solid var(--edge); }
        .metric { min-width:0; } .metric span { display:block; color:var(--secondary-text-color); font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; } .metric strong { display:block; margin-top:2px; font-size:12px; white-space:nowrap; }
        .metric.equipment strong { color:var(--primary-text-color); }
        .metric.battery.low strong { color:var(--error-color,#db4437); }
        .no-animation * { animation:none!important; }
        @keyframes flow { from{transform:translateX(-60px)} to{transform:translateX(calc(100vw - 30px))} }
        @keyframes pulse { 0%,100%{transform:scale(.9);opacity:.15} 50%{transform:scale(1.15);opacity:.28} }
        @keyframes radiatorFlow { from{transform:translateX(-13px)} to{transform:translateX(43px)} }
        @keyframes radiatorFill { 0%,100%{background-position:0 100%;opacity:.62} 50%{background-position:0 0;opacity:1} }
        @media (max-width:760px) { .shell{padding:15px} header{display:block}.summary{justify-content:flex-start;margin-top:13px}.summary-item{flex:1}.rooms{grid-template-columns:repeat(2,1fr);gap:9px}.system{height:76px}.hub{padding:7px}.hub span{display:none}.room{min-height:196px;padding:13px} }
        @media (max-width:410px) { .rooms{grid-template-columns:1fr}.room{min-height:184px}.system .hub.house{display:none}.system-line{left:14%;right:14%} }
        @media (prefers-reduced-motion:reduce) { *{animation:none!important;scroll-behavior:auto!important} }
      </style>
      <ha-card class="${animationClass}">
        <div class="shell"><div class="ambient"></div>
          <header>
            <div><div class="eyebrow"><b></b>Levende varmekort</div><h2>${this._escape(this._config.title)}</h2></div>
            <div class="summary">
              <div class="summary-item"><span>Varmer nu</span><strong>${heating} rum</strong></div>
              <div class="summary-item"><span>Åbne</span><strong>${open}</strong></div>
              <div class="summary-item"><span>Gennemsnit</span><strong>${this._format(average)}°</strong></div>
            </div>
          </header>
          <div class="system">
            <div class="system-line"></div>
            <div class="hub source"><ha-icon icon="mdi:heat-wave"></ha-icon><div><span>Varmekilde</span><strong>${heating ? "Leverer varme" : "I hvile"}</strong></div></div>
            <div class="hub house"><ha-icon icon="mdi:home-thermometer"></ha-icon><div><span>Huset</span><strong>${radiatorStates.length} zoner</strong></div></div>
            <div class="hub return"><ha-icon icon="mdi:water-thermometer-outline"></ha-icon><div><span>Retur</span><strong>Radiatorkreds</strong></div></div>
          </div>
          <div class="rooms">${rooms.map((room, index) => this._roomMarkup(room, index)).join("")}</div>
        </div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll(".room[data-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const room = rooms[Number(button.dataset.index)];
        if (!room?.climate) return;
        this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: room.climate } }));
      });
    });
  }
}

if (!customElements.get("ha-radiator-overview-card")) customElements.define("ha-radiator-overview-card", HARadiatorOverviewCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-radiator-overview-card", name: "HA Radiator Overview Card", description: "Animeret radiator- og temperaturkort", preview: true });
console.info(`%c HA RADIATOR OVERVIEW CARD %c v${VERSION} `, "color:white;background:#ef7d32;font-weight:700", "color:#ef7d32;background:#161b22");
