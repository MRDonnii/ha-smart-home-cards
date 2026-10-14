import "./ha-card-list-editor.js";
import { AC_UNIT_VISUAL_STYLE, acUnitVisualMarkup } from "../shared/ac-unit-visual.js";

const VERSION = "0.7.1";

const STATUS_LABELS = { off: "Slukket", manual: "Manuel overstyring", opening_off: "Slukket – dør/vindue åben", opening_reduced: "Skruet ned – dør/vindue åben", opening_resume_wait: "Venter på at genoptage", opening_reduce_wait: "Dør/vindue åben", sensor_lost: "Sensor væk", start_wait: "Venter på start", heating: "Varmer", cooling: "Køler", drying: "Affugter", fan_only: "Kun blæser", idle: "Tomgang" };
const WAITING = ["manual", "opening_off", "opening_reduced", "opening_resume_wait", "opening_reduce_wait", "start_wait", "sensor_lost"];
const EVENT_LABELS = { manual_override: "Manuel overstyring slutter", opening_reduce: "Skrues ned", opening_off: "Slukker", opening_resume: "Genoptager", start_allowed: "Starter", min_run: "Min. kørsel slutter", sensor_loss: "Pause pga. sensor" };
const PROGRAM_LABELS = { none: "Normal", eco: "Eco", comfort: "Komfort", boost: "Boost", sleep: "Nat", "freeze protection": "Frost 8°", freeze_protection: "Frost 8°" };
const FAN_LABELS = { auto: "Auto", low: "Lav", medium: "Mellem", mid: "Mellem", high: "Høj", quiet: "Stille", silent: "Stille", turbo: "Turbo", max: "Maks" };
const MODES = [
  { id: "heat", label: "Varme", icon: "mdi:fire" },
  { id: "cool", label: "Køl", icon: "mdi:snowflake" },
  { id: "heat_cool", label: "Auto", icon: "mdi:thermostat-auto" },
  { id: "dry", label: "Affugt", icon: "mdi:water-percent" },
  { id: "fan_only", label: "Blæser", icon: "mdi:fan" },
  { id: "off", label: "Sluk", icon: "mdi:power" },
];
const TONES = { heat: "heat", cool: "cool", heat_cool: "auto", dry: "dry", fan_only: "fan" };
const FIELDS = [
  ["name", "Navn"], ["climate", "Climate", "entity"], ["output", "Varmeeffekt", "entity"], ["input", "Elforbrug (W)", "entity"], ["cop", "COP", "entity"],
  ["daily_energy", "Dagligt forbrug", "entity"], ["daily_cost", "Daglig pris", "entity"], ["heat_price", "Varmepris", "entity"], ["hour_cost", "Pris pr. time", "entity"],
  ["unit", "Fysisk anlæg (climate)", "entity"], ["status", "Status-sensor", "entity"], ["next_change", "Næste skift", "entity"], ["release", "Frigiv-knap", "entity"],
  ["program", "Program (select)", "entity"], ["outdoor", "Udetemperatur", "entity"], ["unit_temp", "Anlæggets føler", "entity"], ["humidity", "Rumfugtighed", "entity"],
  ["follow_me", "Follow Me", "entity"], ["filter_hours", "Timer siden filterrens", "entity"], ["filter_reset", "Nulstil filter-knap", "entity"], ["online", "Anlæg svarer", "entity"],
  ["swing_toggle", "Sving til/fra (knap)", "entity"], ["swing_step", "Lamel ét trin (knap)", "entity"], ["display", "Display (knap)", "entity"], ["beep", "Bip (switch)", "entity"],
  ["supply", "Strøm til anlæg (switch)", "entity"], ["restart", "Genstart anlæg (knap)", "entity"], ["openings", "Reagér på døre/vinduer (switch)", "entity"],
  ["reduce_after", "Skru ned efter (number)", "entity"], ["off_after", "Sluk efter (number)", "entity"], ["resume_after", "Genoptag efter (number)", "entity"],
  ["turbo", "Turbo 30 min (switch)", "entity"], ["price_control", "Prisstyring (switch)", "entity"], ["price_level", "Prisniveau (sensor)", "entity"],
  ["auto_wake", "Vækning ved slumring (switch)", "entity"], ["wake_status", "Vækning (sensor)", "entity"],
  ["max_power", "Maks. effekt (W)"], ["filter_alarm", "Filter-påmindelse (timer)"],
];
const PRICE_TEXT = { cheap: "Billig strøm", normal: "Normal pris", expensive: "Dyr strøm", unknown: "Ingen prisprognose", off: "Slået fra" };
const WAKE_TEXT = { off: "Slået fra", busy: "Genstarter anlægget", not_running: "Venter – varmer ikke nu", unit_not_on: "Anlægget er ikke tændt", defrosting: "Afrimer", no_data: "Mangler målinger", on_target: "Rummet er på mål", working: "Anlægget arbejder", stalled: "Slumrer" };

class HAACClimateCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._signature = "";
  }

  static getStubConfig() { return { title: "AC & varmepumper", units: [] }; }

  static getConfigElement() {
    const e = document.createElement("ha-card-list-editor");
    e.definition = {
      roots: [{ key: "title", label: "Titel" }, { key: "animation", label: "Animation", type: "boolean" }],
      collections: [{ key: "units", label: "AC-anlæg", itemLabel: "anlæg", defaults: { name: "Nyt anlæg" }, fields: FIELDS.map(([key, label, type]) => ({ key, label, ...(type ? { type } : {}) })) }],
    };
    return e;
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.units)) throw new Error("AC-kortet kræver en units-liste");
    this._config = { title: "AC & varmepumper", animation: true, ...config };
    this._signature = "";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const ids = (this._config.units || []).flatMap((u) => Object.values(u)).filter((v) => typeof v === "string" && v.includes("."));
    const sig = JSON.stringify(ids.map((id) => {
      const e = hass?.states?.[id];
      const a = e?.attributes || {};
      return [id, e?.state, a.current_temperature, a.temperature, a.fan_mode, a.preset_mode, a.event, a.until, a.wake_at, a.wakes_today, a.offset_heat, a.offset_cool];
    }).concat(Math.floor(Date.now() / 30000)));
    if (sig === this._signature) return;
    this._signature = sig;
    this._render();
  }

  getCardSize() { return 9; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }

  // --- helpers -----------------------------------------------------------
  _raw(id) { return id ? this._hass?.states?.[id] : undefined; }
  _entity(id) { const e = this._raw(id); return e && !["unknown", "unavailable", ""].includes(e.state) ? e : undefined; }
  _exists(id) { const e = this._raw(id); return !!e && e.state !== "unavailable"; }
  _num(id) { const n = Number(this._entity(id)?.state); return Number.isFinite(n) ? n : undefined; }
  _format(v, d = 0) { if (v === undefined || v === null || !Number.isFinite(v)) return "—"; const l = this._hass?.locale?.language || "da"; return v.toLocaleString(l, { minimumFractionDigits: d, maximumFractionDigits: d }); }
  _esc(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  _label(map, v) { const k = String(v ?? "").toLowerCase(); return map[k] || String(v ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()); }

  _state(unit) {
    const climate = this._entity(unit.climate);
    const a = climate?.attributes || {};
    const mode = String(climate?.state || "unknown").toLowerCase();
    const num = (v) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
    const status = this._entity(unit.status)?.state;
    const online = this._entity(unit.online);
    const offline = !!online && online.state === "off";
    const active = !["off", "unknown", "unavailable"].includes(mode);
    let tone = active ? TONES[mode] || "fan" : "off";
    if (!climate || offline) tone = "problem";
    const statusText = !climate ? "Utilgængelig" : offline ? "Anlægget svarer ikke" : STATUS_LABELS[status] || this._hass?.formatEntityState?.(climate) || mode;
    return {
      climate, mode, active, tone, offline, status, waiting: WAITING.includes(status), statusText,
      current: num(a.current_temperature), target: num(a.temperature), fan: a.fan_mode,
      fans: Array.isArray(a.fan_modes) ? a.fan_modes : [],
      power: this._num(unit.input), output: this._num(unit.output), cop: this._num(unit.cop),
      daily: this._num(unit.daily_energy), dailyCost: this._num(unit.daily_cost), heatPrice: this._num(unit.heat_price), hourCost: this._num(unit.hour_cost),
      outdoor: this._num(unit.outdoor), unitTemp: this._num(unit.unit_temp), humidity: this._num(unit.humidity), filter: this._num(unit.filter_hours),
    };
  }

  _nextText(id) {
    const e = this._entity(id);
    if (!e) return "";
    const at = Date.parse(e.state);
    if (!Number.isFinite(at)) return "";
    const mins = Math.round((at - Date.now()) / 60000);
    const clock = new Date(at).toLocaleTimeString(this._hass?.locale?.language || "da", { hour: "2-digit", minute: "2-digit" });
    return `${EVENT_LABELS[e.attributes?.event] || "Næste skift"} ${mins <= 0 ? "nu" : mins < 60 ? `om ${mins} min` : `kl. ${clock}`}`;
  }

  // --- sections ----------------------------------------------------------
  _hero(unit, s) {
    const label = s.mode === "off" ? "OFF" : `${this._format(s.target)}°`;
    const next = this._nextText(unit.next_change);
    const release = this._exists(unit.release);
    const modeIcon = (MODES.find((m) => m.id === s.mode) || {}).icon || "mdi:power";
    return `<section class="hero">
      <div class="stage">
        <div class="halo"></div>
        <div class="unit-art">${acUnitVisualMarkup(this._esc(label), s.active && !s.offline)}</div>
      </div>
      <div class="hero-main">
        <div class="hero-top">
          <div>
            <h3>${this._esc(unit.name)}</h3>
            <div class="pill ${s.waiting ? "wait" : ""} ${s.offline ? "bad" : ""}"><ha-icon icon="${s.offline ? "mdi:lan-disconnect" : modeIcon}"></ha-icon><span>${this._esc(s.statusText)}</span></div>
          </div>
          <div class="room"><strong>${this._format(s.current, 1)}<small>°</small></strong><span>i rummet</span></div>
        </div>
        ${next || release ? `<div class="next"><span>${this._esc(next)}</span>${release ? `<button class="release ${s.waiting ? "ready" : ""}" data-action="release"><ha-icon icon="mdi:play-circle-outline"></ha-icon>Frigiv</button>` : ""}</div>` : ""}
        <div class="target">
          <button data-action="temp-down" aria-label="Sænk">−</button>
          <div><span>Mål</span><strong>${this._format(s.target)}°</strong></div>
          <button data-action="temp-up" aria-label="Hæv">+</button>
        </div>
      </div>
    </section>`;
  }

  _controls(unit, s) {
    const modes = Array.isArray(s.climate?.attributes?.hvac_modes) ? s.climate.attributes.hvac_modes : MODES.map((m) => m.id);
    const shown = MODES.filter((m) => modes.includes(m.id));
    const modeRow = shown.map((m) => `<button class="seg ${s.mode === m.id ? "on" : ""}" data-mode="${m.id}"><ha-icon icon="${m.icon}"></ha-icon><span>${m.label}</span></button>`).join("");
    const opt = (v, cur, map) => `<option value="${this._esc(v)}" ${v === cur ? "selected" : ""}>${this._esc(this._label(map, v))}</option>`;
    const dropdown = (kind, icon, label, values, cur, map) => values.length ? `<label class="dd"><span><ha-icon icon="${icon}"></ha-icon>${label}</span><div class="dd-box"><select data-select="${kind}">${values.map((v) => opt(v, cur, map)).join("")}</select><ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></div></label>` : "";
    const select = this._entity(unit.program);
    const climateObj = select ? undefined : this._entity(unit.unit || unit.climate);
    const options = select ? select.attributes?.options || [] : climateObj?.attributes?.preset_modes || [];
    const current = select ? select.state : climateObj?.attributes?.preset_mode;
    const fanDd = dropdown("fan", "mdi:fan", "Blæser", s.fans, s.fan, FAN_LABELS);
    const progDd = dropdown("program", "mdi:tune-variant", "Program", options, current, PROGRAM_LABELS);
    return `<section class="controls">
      <div class="segs" style="--n:${shown.length}">${modeRow}</div>
      ${fanDd || progDd ? `<div class="dds">${fanDd}${progDd}</div>` : ""}
    </section>`;
  }

  _live(unit, s) {
    const maxPower = Number(unit.max_power) || 1500;
    const pct = s.power !== undefined ? Math.max(2, Math.min(100, (s.power / maxPower) * 100)) : 0;
    const copPct = s.cop !== undefined ? Math.max(0.001, Math.min(1, s.cop / 6)) : 0.001;
    const a = Math.PI * (1 - copPct);
    const end = `${(40 + 32 * Math.cos(a)).toFixed(1)} ${(40 - 32 * Math.sin(a)).toFixed(1)}`;
    const tile = (icon, label, value) => `<div class="tile"><ha-icon icon="${icon}"></ha-icon><div><span>${label}</span><strong>${value}</strong></div></div>`;
    const tiles = [];
    if (unit.input) tiles.push(`<div class="tile wide"><ha-icon icon="mdi:lightning-bolt"></ha-icon><div><span>Elforbrug</span><strong>${this._format(s.power)} W</strong><i class="bar"><b style="width:${pct}%"></b></i></div></div>`);
    if (unit.output) tiles.push(tile("mdi:radiator", "Varme", s.output !== undefined ? `${this._format(s.output / 1000, 1)} kW` : "—"));
    if (unit.cop) tiles.push(`<div class="tile gauge"><svg viewBox="0 0 80 46"><path d="M8 40 A32 32 0 0 1 72 40" class="track"/><path d="M8 40 A32 32 0 0 1 ${end}" class="val"/></svg><div><strong>${this._format(s.cop, 1)}</strong><span>COP</span></div></div>`);
    if (unit.outdoor) tiles.push(tile("mdi:sun-thermometer-outline", "Ude", `${this._format(s.outdoor, 1)}°`));
    if (unit.unit_temp) tiles.push(tile("mdi:thermometer-lines", "Anlæg", `${this._format(s.unitTemp, 1)}°`));
    if (unit.humidity) tiles.push(tile("mdi:water-percent", "Fugt", `${this._format(s.humidity)} %`));
    return tiles.length ? `<section class="live">${tiles.join("")}</section>` : "";
  }

  _functions(unit, s) {
    const btn = (action, icon, label, on, show) => (show ? `<button class="fn ${on ? "on" : ""}" data-action="${action}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>` : "");
    const follow = this._entity(unit.follow_me);
    const beep = this._entity(unit.beep);
    const supply = this._entity(unit.supply);
    const items = [
      btn("swing-ir", "mdi:arrow-up-down", "Sving", false, this._exists(unit.swing_toggle)),
      btn("swing-step", "mdi:arrow-up-down-bold-outline", "Lamel trin", false, this._exists(unit.swing_step)),
      btn("display", "mdi:monitor", "Display", false, this._exists(unit.display)),
      btn("follow-me", "mdi:home-thermometer", "Follow Me", follow?.state === "on", !!follow),
      btn("beep", beep?.state === "on" ? "mdi:volume-high" : "mdi:volume-off", "Bip", beep?.state === "on", !!beep),
      btn("supply", supply?.state === "on" ? "mdi:power-plug" : "mdi:power-plug-off", "Strøm", supply?.state === "on", !!supply),
      btn("restart", "mdi:restart-alert", "Genstart", false, this._exists(unit.restart)),
      this._turboButton(unit, s),
    ].join("");
    return items ? `<section class="block"><h4><ha-icon icon="mdi:gesture-tap-button"></ha-icon>Funktioner</h4><div class="fns">${items}</div></section>` : "";
  }

  _turboButton(unit, s) {
    const turbo = this._raw(unit.turbo);
    if (!turbo || turbo.state === "unavailable") return "";
    const on = turbo.state === "on";
    const running = ["heat", "cool"].includes(String(this._raw(unit.unit)?.state || s?.mode || ""));
    if (!on && !running) return `<button class="fn turbo idle" disabled title="Turbo virker kun, mens anlægget varmer eller køler"><ha-icon icon="mdi:rocket-launch-outline"></ha-icon><span>Turbo</span></button>`;
    const until = Date.parse(turbo.attributes?.until || "");
    const left = on && Number.isFinite(until) ? Math.max(1, Math.round((until - Date.now()) / 60000)) : 0;
    return `<button class="fn turbo ${on ? "on" : ""}" data-action="turbo" title="${on ? "Stop turbo" : "Anlæggets boost i 30 minutter"}"><ha-icon icon="mdi:rocket-launch-outline"></ha-icon><span>${on ? `Turbo ${left} min` : "Turbo"}</span></button>`;
  }

  _clock(iso) {
    const at = Date.parse(iso || "");
    return Number.isFinite(at) ? new Date(at).toLocaleTimeString(this._hass?.locale?.language || "da", { hour: "2-digit", minute: "2-digit" }) : "";
  }

  _smart(unit, s) {
    const rows = [];
    const priceSw = this._entity(unit.price_control);
    const level = this._entity(unit.price_level);
    if (priceSw || level) {
      const on = priceSw ? priceSw.state === "on" : level?.state !== "off";
      const lvl = on ? level?.state || "unknown" : "off";
      const a = level?.attributes || {};
      const offset = s.mode === "cool" ? Number(a.offset_cool) : Number(a.offset_heat);
      const shift = Number.isFinite(offset) && offset !== 0 ? ` · mål ${offset > 0 ? "+" : "−"}${Math.abs(offset)}°` : "";
      const end = lvl !== "off" && a.period_end ? ` til ${this._clock(a.period_end)}` : "";
      const price = Number(a.price);
      const priceTxt = lvl !== "off" && Number.isFinite(price) ? ` · ${this._format(price, 2)} kr/kWh` : "";
      rows.push(`<div class="srow p-${lvl}"><ha-icon icon="mdi:cash-sync"></ha-icon><div><strong>Prisstyring</strong><span>${PRICE_TEXT[lvl] || lvl}${shift}${end}${priceTxt}</span></div>${priceSw ? `<button class="toggle ${on ? "on" : ""}" data-action="price" aria-pressed="${on}" title="Prisstyring"><i></i></button>` : ""}</div>`);
    }
    const wakeSw = this._entity(unit.auto_wake);
    const wake = this._entity(unit.wake_status);
    if (wakeSw || wake) {
      const on = wakeSw ? wakeSw.state === "on" : wake?.state !== "off";
      const reason = on ? wake?.state || "off" : "off";
      const a = wake?.attributes || {};
      let text = WAKE_TEXT[reason] || reason;
      if (reason === "stalled" && a.wake_at) text = `Slumrer – vækkes kl. ${this._clock(a.wake_at)}`;
      const count = Number(a.wakes_today) || 0;
      const last = count && a.last_wake ? ` · vækket ${count}× i dag, sidst ${this._clock(a.last_wake)}` : "";
      rows.push(`<div class="srow w-${reason}"><ha-icon icon="mdi:alarm-light-outline"></ha-icon><div><strong>Vækning ved slumring</strong><span>${this._esc(text)}${last}</span></div>${wakeSw ? `<button class="toggle ${on ? "on" : ""}" data-action="wake" aria-pressed="${on}" title="Vækning ved slumring"><i></i></button>` : ""}</div>`);
    }
    return rows.length ? `<section class="block smart"><h4><ha-icon icon="mdi:brain"></ha-icon>Smart styring</h4>${rows.join("")}</section>` : "";
  }

  _openings(unit) {
    const sw = this._entity(unit.openings);
    const delays = [["reduce_after", "Skru ned efter"], ["off_after", "Sluk efter"], ["resume_after", "Genoptag efter lukket"]].filter(([k]) => this._entity(unit[k]));
    if (!sw && !delays.length) return "";
    const on = sw ? sw.state === "on" : true;
    return `<section class="block doors ${on ? "" : "muted"}">
      <h4><ha-icon icon="mdi:door-open"></ha-icon>Døre og vinduer${sw ? `<button class="toggle ${on ? "on" : ""}" data-action="openings" aria-pressed="${on}" title="Reagér på døre og vinduer"><i></i></button>` : ""}</h4>
      <div class="delays">${delays.map(([k, label]) => `<div class="delay"><span>${label}</span><div class="step"><button data-step="${k}" data-delta="-1">−</button><strong>${this._format(this._num(unit[k]))}<small> min</small></strong><button data-step="${k}" data-delta="1">+</button></div></div>`).join("")}</div>
    </section>`;
  }

  _economy(unit, s) {
    const cell = (label, value) => `<div><span>${label}</span><strong>${value}</strong></div>`;
    const cells = [];
    if (unit.daily_energy) cells.push(cell("I dag", `${this._format(s.daily, 2)} kWh`));
    if (unit.daily_cost) cells.push(cell("Pris i dag", `${this._format(s.dailyCost, 2)} kr.`));
    if (unit.heat_price) cells.push(cell("Varmepris", `${this._format(s.heatPrice, 2)} kr/kWh`));
    if (unit.hour_cost) cells.push(cell("Pris pr. time", `${this._format(s.hourCost, 2)} kr.`));
    const alarm = Number(unit.filter_alarm) || 500;
    const fpct = s.filter !== undefined ? Math.min(100, (s.filter / alarm) * 100) : 0;
    const filter = unit.filter_hours ? `<div class="filter ${fpct >= 100 ? "due" : ""}"><span><ha-icon icon="mdi:air-filter"></ha-icon>Filter ${this._format(s.filter)} / ${this._format(alarm)} t</span><i class="bar"><b style="width:${Math.max(2, fpct)}%"></b></i>${this._exists(unit.filter_reset) ? `<button data-action="filter-reset" title="Nulstil efter filterrens"><ha-icon icon="mdi:restore"></ha-icon></button>` : ""}</div>` : "";
    return cells.length || filter ? `<section class="block econ">${cells.length ? `<div class="cells">${cells.join("")}</div>` : ""}${filter}</section>` : "";
  }

  _unit(unit, index) {
    const s = this._state(unit);
    return `<article class="unit t-${s.tone} ${s.active ? "active" : ""}" data-index="${index}">
      ${this._hero(unit, s)}
      ${this._controls(unit, s)}
      ${this._live(unit, s)}
      ${this._functions(unit, s)}
      ${this._smart(unit, s)}
      ${this._openings(unit)}
      ${this._economy(unit, s)}
      <button class="details" data-action="details">Flere indstillinger<ha-icon icon="mdi:chevron-right"></ha-icon></button>
    </article>`;
  }

  // --- actions -----------------------------------------------------------
  async _action(unit, button) {
    const d = button.dataset;
    const call = (domain, service, data) => this._hass.callService(domain, service, data);
    try {
      if (d.step) {
        const id = unit[d.step];
        const cur = this._num(id) ?? 0;
        const delta = Number(d.delta) * (cur >= 30 ? 5 : 1);
        return await call("number", "set_value", { entity_id: id, value: Math.max(0, cur + delta) });
      }
      if (d.fanMode !== undefined) return await call("climate", "set_fan_mode", { entity_id: unit.climate, fan_mode: d.fanMode });
      if (d.program !== undefined) {
        if (unit.program && this._entity(unit.program)) return await call("select", "select_option", { entity_id: unit.program, option: d.program });
        return await call("climate", "set_preset_mode", { entity_id: unit.unit || unit.climate, preset_mode: d.program });
      }
      if (d.mode) return await call("climate", "set_hvac_mode", { entity_id: unit.climate, hvac_mode: d.mode });
      switch (d.action) {
        case "release": return await call("button", "press", { entity_id: unit.release });
        case "swing-ir": return await call("button", "press", { entity_id: unit.swing_toggle });
        case "swing-step": return await call("button", "press", { entity_id: unit.swing_step });
        case "display": return await call("button", "press", { entity_id: unit.display });
        case "follow-me": return await call("switch", "toggle", { entity_id: unit.follow_me });
        case "beep": return await call("switch", "toggle", { entity_id: unit.beep });
        case "openings": return await call("switch", "toggle", { entity_id: unit.openings });
        case "price": return await call("switch", "toggle", { entity_id: unit.price_control });
        case "wake": return await call("switch", "toggle", { entity_id: unit.auto_wake });
        case "turbo": return await call("switch", "toggle", { entity_id: unit.turbo });
        case "supply": {
          const on = this._entity(unit.supply)?.state === "on";
          if (on && !confirm("Slå strømmen til anlægget fra?")) return;
          return await call("homeassistant", on ? "turn_off" : "turn_on", { entity_id: unit.supply });
        }
        case "restart":
          if (!confirm("Genstart anlægget? Strømmen slukkes i 30 sekunder.")) return;
          return await call("button", "press", { entity_id: unit.restart });
        case "filter-reset":
          if (!confirm("Nulstil filtertælleren? Gør det kun efter filterrens.")) return;
          return await call("button", "press", { entity_id: unit.filter_reset });
        case "temp-down": case "temp-up": {
          const c = this._entity(unit.climate);
          const cur = Number(c?.attributes?.temperature);
          if (!Number.isFinite(cur)) return;
          const step = Number(c.attributes.target_temp_step) || 1;
          const min = Number(c.attributes.min_temp ?? 16), max = Number(c.attributes.max_temp ?? 30);
          const temperature = Math.max(min, Math.min(max, cur + (d.action === "temp-up" ? step : -step)));
          return await call("climate", "set_temperature", { entity_id: unit.climate, temperature });
        }
        case "details":
          this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: unit.climate } }));
          return;
        default:
          return;
      }
    } catch (error) {
      console.warn("HA AC Climate Card action failed", error);
    }
  }

  // --- render ------------------------------------------------------------
  _render() {
    const units = this._config.units || [];
    const states = units.map((u) => this._state(u));
    const single = units.length === 1;
    const active = states.filter((s) => s.active).length;
    const power = states.reduce((sum, s) => sum + (s.power || 0), 0);
    this.shadowRoot.innerHTML = `<style>${STYLE}${AC_UNIT_VISUAL_STYLE}</style>
      <ha-card class="${this._config.animation === false ? "no-animation" : ""} ${single ? "single" : ""}">
        <div class="shell">
          <header>
            <div><div class="eyebrow"><i class="${active ? "on" : ""}"></i>Smart klimastyring</div><h2>${this._esc(this._config.title)}</h2></div>
            ${single ? "" : `<div class="summary"><div><span>Aktive</span><strong>${active} / ${units.length}</strong></div><div><span>El nu</span><strong>${this._format(power)} W</strong></div></div>`}
          </header>
          <div class="grid">${units.map((u, i) => this._unit(u, i)).join("")}</div>
        </div>
      </ha-card>`;
    this.shadowRoot.querySelectorAll(".unit").forEach((article) => {
      const unit = units[Number(article.dataset.index)];
      article.querySelectorAll("button").forEach((button) => button.addEventListener("click", (ev) => { ev.stopPropagation(); this._action(unit, button); }));
      article.querySelectorAll("select").forEach((select) => {
        select.addEventListener("click", (ev) => ev.stopPropagation());
        select.addEventListener("change", (ev) => {
          ev.stopPropagation();
          const value = select.value;
          this._action(unit, { dataset: select.dataset.select === "fan" ? { fanMode: value } : { program: value } });
        });
      });
    });
  }
}

const STYLE = `
:host{display:block;--heat:#ff9850;--cool:#55b9ff;--fan:#63d4c1;--dry:#a28bff;--auto:#ffc65c;--off:#8390a2;--bad:#ff667a;--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.1)));--surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)))}
*{box-sizing:border-box}
ha-card{overflow:hidden;border-radius:24px;background:var(--surface);color:var(--primary-text-color)}
.shell{padding:20px}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:14px}
.eyebrow{display:flex;align-items:center;gap:8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--off)}.eyebrow i.on{background:var(--heat);box-shadow:0 0 10px var(--heat);animation:pulse 2s ease-in-out infinite}
h2{margin:4px 0 0;font-size:23px;letter-spacing:-.03em}
.summary{display:flex;gap:8px}.summary div{padding:8px 12px;border:1px solid var(--edge);border-radius:12px;background:rgba(0,0,0,.08)}.summary span{display:block;color:var(--secondary-text-color);font-size:9px;font-weight:800;text-transform:uppercase}.summary strong{font-size:15px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px}
.unit{--tone:var(--off);position:relative;display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid color-mix(in srgb,var(--tone) 22%,var(--edge));border-radius:22px;background:radial-gradient(120% 70% at 0% 0%,color-mix(in srgb,var(--tone) 12%,transparent),transparent 60%),linear-gradient(180deg,rgba(255,255,255,.025),rgba(0,0,0,.06));container-type:inline-size}
.t-heat{--tone:var(--heat)}.t-cool{--tone:var(--cool)}.t-fan{--tone:var(--fan)}.t-dry{--tone:var(--dry)}.t-auto{--tone:var(--auto)}.t-problem{--tone:var(--bad)}
.hero{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center}
.stage{position:relative;width:190px;height:150px;display:grid;place-items:center}
.halo{position:absolute;inset:6px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--tone) 30%,transparent),transparent 65%);filter:blur(10px);opacity:.55}
.unit.active .halo{animation:breathe 3.2s ease-in-out infinite}
.unit-art{position:relative;transform:scale(1.32);transform-origin:center;margin-top:-6px}
.hero-main{display:flex;flex-direction:column;gap:10px;min-width:0}
.hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
h3{margin:0 0 6px;font-size:19px;letter-spacing:-.02em}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px 5px 8px;border-radius:999px;background:color-mix(in srgb,var(--tone) 16%,transparent);color:var(--tone);font-size:12px;font-weight:800}
.pill ha-icon{--mdc-icon-size:15px}.pill.wait{background:color-mix(in srgb,var(--auto) 18%,transparent);color:var(--auto)}.pill.bad{background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad)}
.room{text-align:right}.room strong{display:block;font-size:40px;font-weight:700;line-height:1;letter-spacing:-.04em}.room small{font-size:20px;opacity:.7}.room span{color:var(--secondary-text-color);font-size:10px}
.next{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:30px;color:var(--secondary-text-color);font-size:12px}
.release{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border:1px solid var(--edge);border-radius:999px;background:rgba(255,255,255,.04);color:var(--primary-text-color);font:inherit;font-size:12px;font-weight:700;cursor:pointer}.release ha-icon{--mdc-icon-size:16px}
.release.ready{border-color:color-mix(in srgb,var(--auto) 60%,transparent);background:color-mix(in srgb,var(--auto) 16%,transparent);color:var(--auto)}
.target{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:8px;padding:5px;border:1px solid var(--edge);border-radius:16px;background:rgba(0,0,0,.12)}
.target button{height:40px;border:0;border-radius:12px;background:rgba(255,255,255,.06);color:var(--primary-text-color);font-size:22px;cursor:pointer}.target button:hover{background:color-mix(in srgb,var(--tone) 22%,transparent)}
.target div{text-align:center}.target span{display:block;color:var(--secondary-text-color);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.target strong{font-size:22px}
.controls{display:flex;flex-direction:column;gap:8px}
.segs{display:grid;grid-template-columns:repeat(var(--n,6),minmax(0,1fr));gap:4px;padding:4px;border-radius:16px;background:rgba(0,0,0,.14)}
.seg{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 2px;border:0;border-radius:12px;background:transparent;color:var(--secondary-text-color);font:inherit;font-size:11px;font-weight:700;cursor:pointer;transition:background .2s,color .2s}
.seg ha-icon{--mdc-icon-size:19px}.seg.on{background:color-mix(in srgb,var(--tone) 22%,transparent);color:var(--tone);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tone) 45%,transparent)}
.row{display:flex;align-items:center;gap:10px}
.lbl{display:flex;align-items:center;gap:5px;min-width:78px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.lbl ha-icon{--mdc-icon-size:15px}
.chips{display:flex;flex-wrap:wrap;gap:5px}
.chip{padding:6px 11px;border:1px solid var(--edge);border-radius:999px;background:rgba(255,255,255,.03);color:var(--secondary-text-color);font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.chip.on{border-color:color-mix(in srgb,var(--tone) 55%,transparent);background:color-mix(in srgb,var(--tone) 16%,transparent);color:var(--tone)}
.dds{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.dd{display:flex;flex-direction:column;gap:4px;min-width:0}
.dd>span{display:flex;align-items:center;gap:5px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.dd>span ha-icon{--mdc-icon-size:15px}
.dd-box{position:relative}
.dd select{width:100%;appearance:none;-webkit-appearance:none;padding:10px 36px 10px 12px;border:1px solid color-mix(in srgb,var(--tone) 30%,var(--edge));border-radius:12px;background:linear-gradient(180deg,color-mix(in srgb,var(--tone) 10%,transparent),rgba(0,0,0,.12));color:var(--primary-text-color);font:inherit;font-size:14px;font-weight:700;cursor:pointer;color-scheme:dark}
.dd select:focus{outline:2px solid var(--tone);outline-offset:1px}
.dd option{background:var(--surface,#121a24);color:var(--primary-text-color)}
.dd .chev{position:absolute;right:10px;top:50%;transform:translateY(-50%);--mdc-icon-size:18px;color:var(--tone);pointer-events:none}
.live{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:7px}
.tile{display:flex;align-items:center;gap:8px;min-height:56px;padding:9px 11px;border:1px solid var(--edge);border-radius:14px;background:rgba(0,0,0,.1)}
.tile>ha-icon{--mdc-icon-size:19px;color:var(--tone)}.tile>div{min-width:0;flex:1}
.tile span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--secondary-text-color);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.tile strong{display:block;overflow:hidden;text-overflow:ellipsis;font-size:15px;white-space:nowrap}
.tile.wide{grid-column:span 2}
.bar{display:block;height:5px;margin-top:5px;border-radius:5px;background:rgba(255,255,255,.08);overflow:hidden}.bar b{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,color-mix(in srgb,var(--tone) 55%,transparent),var(--tone));transition:width .6s}
.gauge{flex-direction:column;justify-content:center;gap:0;padding:6px}.gauge svg{width:74px;height:40px}.gauge .track{fill:none;stroke:rgba(255,255,255,.09);stroke-width:7;stroke-linecap:round}.gauge .val{fill:none;stroke:var(--tone);stroke-width:7;stroke-linecap:round}
.gauge div{text-align:center;margin-top:-16px}.gauge strong{font-size:15px}
.block{padding:12px;border:1px solid var(--edge);border-radius:16px;background:rgba(0,0,0,.08)}
h4{display:flex;align-items:center;gap:7px;margin:0 0 10px;color:var(--secondary-text-color);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}h4 ha-icon{--mdc-icon-size:16px}
.fns{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:6px}
.fn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border:1px solid var(--edge);border-radius:13px;background:rgba(255,255,255,.03);color:var(--primary-text-color);font:inherit;font-size:11px;font-weight:700;cursor:pointer}
.fn ha-icon{--mdc-icon-size:20px;color:var(--secondary-text-color)}.fn:hover{border-color:color-mix(in srgb,var(--tone) 45%,transparent)}
.fn.on{border-color:color-mix(in srgb,var(--tone) 50%,transparent);background:color-mix(in srgb,var(--tone) 13%,transparent)}.fn.on ha-icon{color:var(--tone)}
.toggle{margin-left:auto;width:40px;height:22px;padding:0;border:0;border-radius:999px;background:rgba(255,255,255,.14);cursor:pointer;position:relative}
.toggle i{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s}.toggle.on{background:var(--tone)}.toggle.on i{transform:translateX(18px)}
.doors.muted .delays{opacity:.4;pointer-events:none}
.smart{display:flex;flex-direction:column;gap:8px}.smart h4{margin-bottom:2px}
.srow{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--edge);border-radius:13px;background:rgba(255,255,255,.025)}
.srow>ha-icon{--mdc-icon-size:19px;color:var(--secondary-text-color)}.srow div{min-width:0}.srow strong{display:block;font-size:13px}.srow span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;color:var(--secondary-text-color);font-size:11px;line-height:1.35}
.srow .toggle{margin-left:0}
.p-cheap>ha-icon,.p-cheap span{color:#4ade80}.p-expensive>ha-icon,.p-expensive span{color:var(--bad)}.w-stalled>ha-icon,.w-stalled span,.w-busy span{color:var(--auto)}.w-working>ha-icon{color:var(--tone)}
.fn:disabled{opacity:.4;cursor:default}.fn.turbo.on{border-color:color-mix(in srgb,var(--auto) 60%,transparent);background:color-mix(in srgb,var(--auto) 15%,transparent)}.fn.turbo.on ha-icon{color:var(--auto)}
.delays{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:7px}
.delay span{display:block;margin-bottom:4px;color:var(--secondary-text-color);font-size:11px}
.step{display:grid;grid-template-columns:32px 1fr 32px;align-items:center;border:1px solid var(--edge);border-radius:12px;overflow:hidden}
.step button{height:34px;border:0;background:rgba(255,255,255,.05);color:var(--primary-text-color);font-size:18px;cursor:pointer}.step strong{text-align:center;font-size:15px}.step small{font-size:10px;color:var(--secondary-text-color)}
.econ{display:flex;flex-direction:column;gap:10px}
.cells{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px}
.cells span{display:block;color:var(--secondary-text-color);font-size:9px;font-weight:800;text-transform:uppercase}.cells strong{font-size:14px}
.filter{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;font-size:12px;color:var(--secondary-text-color)}
.filter span{display:flex;align-items:center;gap:5px}.filter ha-icon{--mdc-icon-size:16px}.filter .bar{margin:0}.filter.due .bar b{background:var(--bad)}.filter.due span{color:var(--bad)}
.filter button{border:0;background:none;color:var(--secondary-text-color);cursor:pointer;padding:2px}
.details{display:flex;align-items:center;justify-content:flex-end;gap:2px;border:0;background:none;color:var(--secondary-text-color);font:inherit;font-size:11px;cursor:pointer;padding:0}.details ha-icon{--mdc-icon-size:16px}
button:focus-visible{outline:2px solid var(--tone);outline-offset:2px}
@container (max-width:520px){.hero{grid-template-columns:1fr}.stage{width:100%;height:130px}.row{flex-direction:column;align-items:flex-start;gap:5px}.seg{font-size:10px;padding:7px 0}.seg ha-icon{--mdc-icon-size:17px}}
@keyframes pulse{50%{opacity:.4;transform:scale(1.4)}}
@keyframes breathe{50%{opacity:.85;transform:scale(1.08)}}
.no-animation *{animation:none!important}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

if (!customElements.get("ha-ac-climate-card")) customElements.define("ha-ac-climate-card", HAACClimateCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-ac-climate-card", name: "HA AC Climate Card", description: "Animeret og interaktiv styring af AC og varmepumper", preview: true });
console.info(`%c HA AC CLIMATE CARD %c v${VERSION} `, "color:white;background:#357fc4;font-weight:700", "color:#69c4ff;background:#161b22");
