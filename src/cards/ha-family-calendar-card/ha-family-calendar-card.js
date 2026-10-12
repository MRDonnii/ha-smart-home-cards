import "../ha-ai-usage-card/ha-card-list-editor.js";
import { luxCss, LUX_ACCENT, LUX_KEYFRAMES } from "../../shared/lux.js";

// Family calendar, rebuilt (Claude AI, 2026-10-13; user: "Den kalender side er virkelig dårlig – lav den langt federe og
// bedre"). Now / next with a countdown, today's timeline, agenda, a real week grid with times and the school timetable;
// calendars switch on and off with their chips, events open a detail sheet. Same config as 0.1.x.
const VERSION = "0.2.1";
const DAY = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const DAY_SHORT = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
const MONTH = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const MONTH_SHORT = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];
const SUBJECTS = { MAT: "Matematik", DAN: "Dansk", IDR: "Idræt", ENG: "Engelsk", MUS: "Musik", KRI: "Kristendom", "N/T": "Natur/teknologi", UDE: "Udeskole", TB: "Temabånd", "FL-D": "Fagdage", Klpæd: "Klassens tid", "2-lærer": "To-lærer" };
const WEATHER = { "clear-night": ["Klart", "mdi:weather-night"], cloudy: ["Overskyet", "mdi:weather-cloudy"], fog: ["Tåge", "mdi:weather-fog"], hail: ["Hagl", "mdi:weather-hail"], lightning: ["Torden", "mdi:weather-lightning"], "lightning-rainy": ["Torden og regn", "mdi:weather-lightning-rainy"], partlycloudy: ["Let skyet", "mdi:weather-partly-cloudy"], pouring: ["Skybrud", "mdi:weather-pouring"], rainy: ["Regn", "mdi:weather-rainy"], snowy: ["Sne", "mdi:weather-snowy"], "snowy-rainy": ["Slud", "mdi:weather-snowy-rainy"], sunny: ["Sol", "mdi:weather-sunny"], windy: ["Blæst", "mdi:weather-windy"], "windy-variant": ["Blæst", "mdi:weather-windy-variant"], exceptional: ["Usædvanligt", "mdi:alert-circle-outline"] };
const HOUR = 3600000;
const STORE = "ha-family-calendar-card";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${pad(d.getHours())}.${pad(d.getMinutes())}`;
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return `${m} min`; const h = Math.floor(m / 60); return m % 60 ? `${h} t ${m % 60} min` : `${h} t`; };
const until = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); if (m < 1) return "nu"; if (m < 60) return `om ${m} min`; if (m < 24 * 60) { const h = Math.floor(m / 60); return `om ${h} t${m % 60 ? ` ${m % 60} min` : ""}`; } const d = Math.round(m / 1440); return d === 1 ? "i morgen" : `om ${d} dage`; };

// The detail sheet sits on the page itself (document.body): inside the card it landed mid-card, off screen on a long
// agenda, and a hover transform on ha-card would also pin a fixed overlay to the card.
const SHEET_CSS = `:host{--a:${LUX_ACCENT};--ink:var(--primary-text-color,#eef3f8);--mut:var(--secondary-text-color,#8d9baa);--soft:color-mix(in srgb,var(--ink) 6%,transparent);color:var(--ink);font-family:var(--primary-font-family,inherit)}
*{box-sizing:border-box}button{font:inherit;color:inherit}
.sheet{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:fade .2s ease-out}
@keyframes fade{from{opacity:0}}
.sheet .box{--c:var(--a);width:min(460px,100%);max-height:100%;overflow:auto;padding:20px 22px;border-radius:22px;background:var(--ha-card-background,var(--card-background-color,#161a21));box-shadow:0 30px 80px -20px rgba(0,0,0,.8),inset 0 0 0 1px color-mix(in srgb,var(--c) 40%,transparent);animation:luxGum .5s ease-out}
.sheet .box .hd2{display:flex;align-items:flex-start;gap:12px}.sheet .box .hd2 .ic{width:44px;height:44px;flex:none;border-radius:14px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent)}
.sheet h4{margin:0;font-size:20px;line-height:1.2}.sheet .cal{font-size:12px;font-weight:800;color:var(--c)}
.sheet .x{margin-left:auto;width:36px;height:36px;flex:none;border:0;border-radius:50%;background:var(--soft);cursor:pointer;display:grid;place-items:center}
.sheet dl{display:grid;grid-template-columns:auto 1fr;gap:9px 12px;margin:16px 0 0;font-size:14px}.sheet dt{color:var(--mut)}.sheet dt ha-icon{--mdc-icon-size:18px}.sheet dd{margin:0;white-space:pre-wrap;word-break:break-word}
.sheet .open{margin-top:16px;width:100%;padding:11px;border:0;border-radius:13px;font-weight:800;cursor:pointer;color:color-mix(in srgb,var(--c) 70%,#fff);background:color-mix(in srgb,var(--c) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 45%,transparent)}
${LUX_KEYFRAMES}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

class HAFamilyCalendarCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this._events = []; this._range = null; this._loading = false; }
  static getStubConfig() { return { title: "Familiekalender", subtitle: "Alt det næste, samlet og overskueligt", days: 30, weather_entity: "", school_entity: "", calendars: [] }; }
  static getConfigElement() {
    const editor = document.createElement("ha-card-list-editor");
    editor.definition = { roots: [{ key: "title", label: "Titel" }, { key: "subtitle", label: "Undertitel" }, { key: "days", label: "Dage frem", type: "number" }, { key: "weather_entity", label: "Vejr", type: "entity" }, { key: "school_entity", label: "Skoleskema", type: "entity" }],
      collections: [{ key: "calendars", label: "Kalendere", itemLabel: "kalender", defaults: { name: "Kalender", entity: "", group: "Familie", color: "#22c9ff", icon: "mdi:calendar" }, fields: [{ key: "name", label: "Navn" }, { key: "entity", label: "Entity", type: "entity" }, { key: "group", label: "Gruppe" }, { key: "color", label: "Farve" }, { key: "icon", label: "Ikon" }] }] };
    return editor;
  }
  setConfig(config) {
    this._config = { ...HAFamilyCalendarCard.getStubConfig(), ...config, calendars: Array.isArray(config?.calendars) ? structuredClone(config.calendars) : [] };
    const saved = this._store();
    this._view = ["agenda", "week", "school"].includes(saved.view) ? saved.view : "agenda";
    if (this._view === "school" && !this._config.school_entity) this._view = "agenda";
    this._hidden = new Set(Array.isArray(saved.hidden) ? saved.hidden : []);
    this._week = monday(new Date()); this._mobileDay = startOfDay(new Date());
    this._range = null; this._built = false;
    if (this._hass) this._build();
  }
  set hass(hass) {
    const first = !this._hass; this._hass = hass;
    if (!this._config) return;
    if (!this._built) this._build();
    this._weather();
    if (first || !this._range || dayKey(new Date()) !== this._loadedDay) this._ensure();
    this._tick();
    if (this._view === "school") { const s = hass.states[this._config.school_entity]; if (s !== this._schoolState) { this._schoolState = s; this._render(); } }
  }
  connectedCallback() { if (this._config && this._hass) this._ensure(); clearInterval(this._clock); this._clock = setInterval(() => this._tick(), 30000); }
  disconnectedCallback() { clearInterval(this._clock); clearTimeout(this._refresh); this._closeSheet(); }
  getCardSize() { return 12; }
  getGridOptions() { return { columns: 12, rows: "auto" }; }

  // ---------- state ----------
  _store(patch) {
    let s = {}; try { s = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { /* private */ }
    if (patch) { s = { ...s, ...patch }; try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* full */ } }
    return s;
  }
  _cal(entity) { return this._config.calendars.find((c) => c.entity === entity) || {}; }
  _groups() { return [...new Set(this._config.calendars.map((c) => c.group).filter(Boolean))]; }
  _val(v) { return new Date(v?.dateTime || `${v?.date}T00:00:00`); }
  _allDay(e) { return Boolean(e.start?.date && !e.start?.dateTime); }
  _visible() { return this._events.filter((e) => !this._hidden.has(e.calendar_entity)); }
  _on(e, now) { return !e.allDay && e.s <= now && e.e > now; }

  // Loads from Monday of the shown week (or this week) to `days` ahead; a week outside it widens the range.
  async _ensure(wantStart, wantEnd) {
    if (!this._hass?.callApi || this._loading) return;
    const today = startOfDay(new Date());
    const start = wantStart || (this._range && dayKey(today) === this._loadedDay ? this._range.start : monday(today));
    const end = wantEnd || addDays(today, Math.max(14, Number(this._config.days) || 30));
    if (this._range && dayKey(today) === this._loadedDay && start >= this._range.start && end <= this._range.end) return;
    const s = this._range && dayKey(today) === this._loadedDay ? new Date(Math.min(start, this._range.start)) : start;
    const e = this._range && dayKey(today) === this._loadedDay ? new Date(Math.max(end, this._range.end)) : end;
    this._loading = true; if (!this._events.length) this._render();
    try {
      const rows = await Promise.all(this._config.calendars.filter((c) => c.entity).map(async (c) => {
        const list = await this._hass.callApi("GET", `calendars/${encodeURIComponent(c.entity)}?start=${encodeURIComponent(s.toISOString())}&end=${encodeURIComponent(e.toISOString())}`).catch(() => []);
        return (list || []).map((ev) => ({ ...ev, calendar_entity: c.entity }));
      }));
      this._events = rows.flat().map((ev) => { const allDay = this._allDay(ev); const st = this._val(ev.start); let en = this._val(ev.end); if (!(en > st)) en = new Date(+st + (allDay ? 864e5 : HOUR)); return { ...ev, allDay, s: +st, e: +en }; })
        .sort((a, b) => a.s - b.s || b.allDay - a.allDay);
      this._range = { start: s, end: e }; this._loadedDay = dayKey(today); this._error = null;
    } catch (err) { this._error = err?.message || "Kalenderdata kunne ikke hentes"; }
    this._loading = false; this._liveKey = null; this._render();
    clearTimeout(this._refresh); this._refresh = setTimeout(() => { this._range = null; this._ensure(); }, 5 * 60000);
  }

  // Every half minute: countdowns and the now line move; a full redraw only when an event starts or ends.
  _tick() {
    if (!this._built) return;
    const now = Date.now();
    const key = this._visible().filter((e) => this._on(e, now)).map((e) => `${e.calendar_entity}|${e.s}`).join("~") + `|${dayKey(new Date())}`;
    if (key !== this._liveKey) { this._liveKey = key; this._render(); return; }
    this._paintNow();
  }

  // ---------- shell ----------
  _build() {
    if (!this._config) return;
    this._built = true;
    const a = LUX_ACCENT;
    this.shadowRoot.innerHTML = `<style>
:host{display:block;--a:${a};--ink:var(--primary-text-color,#eef3f8);--mut:var(--secondary-text-color,#8d9baa);--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(135,155,175,.2)));--soft:color-mix(in srgb,var(--ink) 5%,transparent)}
*{box-sizing:border-box}button{font:inherit;color:inherit}
ha-card{position:relative;overflow:hidden;padding:22px 24px 24px;color:var(--ink)}
.top{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}
.eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--a)}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--a);box-shadow:0 0 10px var(--a);animation:blink 2.4s ease-in-out infinite}@keyframes blink{50%{opacity:.35}}
h2{margin:4px 0 0;font-size:30px;line-height:1.08;font-weight:800;letter-spacing:-.02em}
h2 small{display:block;margin-top:4px;font-size:14px;font-weight:500;letter-spacing:0;color:var(--mut)}
.wx{margin-left:auto;display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:18px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--edge)}
.wx ha-icon{--mdc-icon-size:34px;color:var(--a);filter:drop-shadow(0 0 8px color-mix(in srgb,var(--a) 45%,transparent))}
.wx b{display:block;font-size:24px;font-weight:800;line-height:1}.wx span{display:block;margin-top:3px;font-size:12px;color:var(--mut)}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.35fr);gap:14px;margin-top:18px}
.panel{position:relative;padding:16px 18px;border-radius:20px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--edge);min-width:0}
.panel h3{margin:0 0 10px;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);display:flex;align-items:center;gap:8px}
.panel h3 em{margin-left:auto;font-style:normal;letter-spacing:.04em;text-transform:none;font-weight:700;color:var(--mut)}
.nx{--c:var(--a);display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center;width:100%;padding:0;border:0;background:none;text-align:left;cursor:pointer}
.nx+.nx{margin-top:12px;padding-top:12px;border-top:1px solid var(--edge)}
.nx .ic{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 40%,transparent)}
.nx .ic ha-icon{--mdc-icon-size:24px}
.nx.live .ic{animation:luxGumLoop 3.2s ease-in-out infinite;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 60%,transparent),0 0 20px -4px var(--c)}
.nx b{display:block;font-size:19px;font-weight:800;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nx small{display:block;margin-top:3px;font-size:13px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nx .cd{color:var(--c);font-weight:800}
.prog{grid-column:1/-1;height:6px;border-radius:6px;background:color-mix(in srgb,var(--ink) 8%,transparent);overflow:hidden}
.prog i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 70%,transparent),var(--c));box-shadow:0 0 12px var(--c);transition:width 1s linear}
.empty-nx{color:var(--mut);font-size:14px;padding:6px 0}
.tl{position:relative;height:74px;margin-top:4px}
.tl .hr{position:absolute;top:0;bottom:16px;border-left:1px dashed color-mix(in srgb,var(--ink) 10%,transparent)}
.tl .hr span{position:absolute;bottom:-16px;left:0;transform:translateX(-50%);font-size:10px;color:var(--mut)}
.tl .blk{--c:var(--a);position:absolute;height:22px;border-radius:7px;padding:0 7px;display:flex;align-items:center;font-size:11px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:linear-gradient(180deg,color-mix(in srgb,var(--c) 85%,#fff 0%),color-mix(in srgb,var(--c) 65%,#000));border:0;cursor:pointer;box-shadow:0 4px 14px -6px var(--c)}
.tl .blk.past{opacity:.38}
.tl .now,.wk .now{position:absolute;z-index:3;pointer-events:none}
.tl .now{top:-4px;bottom:12px;width:2px;background:var(--a);box-shadow:0 0 10px var(--a)}
.tl .now::before{content:"";position:absolute;top:-3px;left:-4px;width:10px;height:10px;border-radius:50%;background:var(--a);box-shadow:0 0 12px var(--a)}
.sum{display:flex;gap:18px;margin-top:12px;font-size:12px;color:var(--mut)}.sum b{color:var(--ink);font-size:15px;margin-right:4px}
.bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:18px 0 12px}
.seg{display:inline-flex;gap:3px;padding:4px;border-radius:15px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--edge)}
.seg button{display:flex;align-items:center;gap:7px;padding:9px 16px;border:0;border-radius:11px;background:transparent;color:var(--mut);font-size:13px;font-weight:800;cursor:pointer}
.seg button ha-icon{--mdc-icon-size:18px}
.chips{display:flex;gap:7px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none;padding:2px}.chips::-webkit-scrollbar{display:none}
.chip{--c:var(--a);flex:none;display:flex;align-items:center;gap:7px;padding:7px 12px 7px 8px;border-radius:999px;border:0;background:color-mix(in srgb,var(--c) 13%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 38%,transparent);font-size:12px;font-weight:800;cursor:pointer;transition:transform .25s cubic-bezier(.2,1.4,.4,1),opacity .25s,filter .25s}
.chip:active{transform:scale(.9)}
.chip ha-icon{--mdc-icon-size:16px;color:var(--c)}
.chip .n{min-width:18px;height:18px;padding:0 5px;border-radius:9px;display:grid;place-items:center;font-size:10px;background:var(--c);color:#111}
.chip.off{opacity:.42;filter:saturate(.2);box-shadow:inset 0 0 0 1px var(--edge);background:transparent}
.chip.off .n{background:var(--soft);color:var(--mut)}
.chip.grp{--c:var(--a);padding-left:12px}
.chip.flash{animation:luxGum .6s ease-out}
.sep{flex:none;width:1px;height:22px;background:var(--edge);margin:0 2px}
.wknav{display:flex;align-items:center;gap:6px;margin-left:auto}
.wknav button{display:grid;place-items:center;min-width:38px;height:38px;padding:0 12px;border:0;border-radius:12px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--edge);font-size:12px;font-weight:800;cursor:pointer}
.wknav b{min-width:150px;text-align:center;font-size:14px}
.body{min-height:120px}
.agenda{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;align-items:start}
.day{padding:14px;border-radius:20px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--edge)}
.day.today{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--a) 55%,transparent),0 10px 30px -14px color-mix(in srgb,var(--a) 60%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--a) 9%,transparent),var(--soft))}
.dh{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}
.dh strong{font-size:28px;font-weight:850;line-height:1}.dh b{font-size:15px;text-transform:capitalize}.dh span{font-size:12px;color:var(--mut)}
.dh .tag{margin-left:auto;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:900;color:color-mix(in srgb,var(--a) 70%,#fff);background:color-mix(in srgb,var(--a) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--a) 45%,transparent)}
.alld{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.alld button{--c:var(--a);padding:4px 10px;border:0;border-radius:999px;font-size:11px;font-weight:800;background:color-mix(in srgb,var(--c) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 45%,transparent);cursor:pointer}
.ev{--c:var(--a);position:relative;display:grid;grid-template-columns:52px 4px minmax(0,1fr);gap:10px;width:100%;padding:9px 10px;border:0;border-radius:14px;background:transparent;text-align:left;cursor:pointer;transition:background .2s,transform .25s cubic-bezier(.2,1.4,.4,1)}
.ev:hover{background:color-mix(in srgb,var(--c) 9%,transparent)}.ev:active{transform:scale(.97)}
.ev+.ev{margin-top:2px}
.ev .t{font-size:13px;font-weight:850;line-height:1.25;color:var(--c)}.ev .t small{display:block;font-size:11px;font-weight:600;color:var(--mut)}
.ev .ln{border-radius:4px;background:var(--c);box-shadow:0 0 10px -2px var(--c)}
.ev .x b{display:block;font-size:14px;font-weight:800;line-height:1.25}
.ev .x>span{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:3px;font-size:11.5px;color:var(--mut)}
.ev .x ha-icon{--mdc-icon-size:13px;margin-right:3px;vertical-align:-2px}
.ev.past{opacity:.45}
.ev.live{background:color-mix(in srgb,var(--c) 15%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 55%,transparent);animation:luxGum .8s ease-out,live 2.4s ease-in-out .8s infinite}
@keyframes live{0%,100%{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 55%,transparent)}50%{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 80%,transparent),0 0 24px -4px var(--c)}}
.nu{display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:1px 7px;border-radius:999px;font-size:9.5px;font-weight:900;letter-spacing:.08em;color:#fff;background:var(--c);vertical-align:2px}
.nu i{width:5px;height:5px;border-radius:50%;background:#fff;animation:blink 1.2s ease-in-out infinite}
.wk{position:relative;display:grid;grid-template-columns:46px repeat(7,minmax(0,1fr));border-radius:20px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--edge);overflow:hidden}
.wk .hd{padding:10px 8px;text-align:center;border-bottom:1px solid var(--edge);font-size:12px;color:var(--mut)}
.wk .hd b{display:block;font-size:20px;color:var(--ink);line-height:1.1}.wk .hd.today b{color:var(--a);text-shadow:0 0 14px color-mix(in srgb,var(--a) 60%,transparent)}
.wk .ad{min-height:30px;padding:4px;border-bottom:1px solid var(--edge);display:flex;flex-direction:column;gap:3px}
.wk .ad button{--c:var(--a);padding:2px 6px;border:0;border-radius:6px;font-size:10.5px;font-weight:800;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:color-mix(in srgb,var(--c) 22%,transparent);cursor:pointer}
.wk .ax{position:relative;border-right:1px solid var(--edge)}
.wk .ax span{position:absolute;right:6px;transform:translateY(-50%);font-size:10px;color:var(--mut)}
.wk .col{position:relative;border-left:1px solid color-mix(in srgb,var(--edge) 60%,transparent)}
.wk .col.today{background:color-mix(in srgb,var(--a) 6%,transparent)}
.wk .gl{position:absolute;left:0;right:0;border-top:1px solid color-mix(in srgb,var(--ink) 6%,transparent)}
.wk .blk{--c:var(--a);position:absolute;display:flex;flex-direction:column;justify-content:flex-start;padding:4px 6px;border:0;border-radius:9px;overflow:hidden;text-align:left;font-size:11px;line-height:1.2;cursor:pointer;color:var(--ink);
  background:linear-gradient(180deg,color-mix(in srgb,var(--c) 30%,transparent),color-mix(in srgb,var(--c) 16%,transparent));box-shadow:inset 3px 0 0 var(--c),inset 0 0 0 1px color-mix(in srgb,var(--c) 40%,transparent);transition:transform .25s cubic-bezier(.2,1.4,.4,1),filter .2s}
.wk .blk:hover{filter:brightness(1.15);z-index:2}.wk .blk:active{transform:scale(.96)}
.wk .blk b{display:block;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wk .blk small{display:block;color:var(--mut);font-size:10px}
.wk .blk.past{opacity:.5}.wk .blk.live{animation:luxGum .8s ease-out,live 2.4s ease-in-out .8s infinite}
.wk .now{left:0;right:0;height:2px;background:var(--a);box-shadow:0 0 10px var(--a)}.wk .now::before{content:"";position:absolute;left:-4px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--a)}
.dpick{display:none;gap:6px;overflow-x:auto;margin-bottom:10px;scrollbar-width:none}
.dpick button{flex:1;min-width:44px;padding:7px 0 8px;border:0;border-radius:13px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--edge);font-size:11px;color:var(--mut);cursor:pointer}
.dpick button b{display:block;font-size:17px;color:var(--ink)}.dpick button i{display:block;width:5px;height:5px;margin:3px auto 0;border-radius:50%;background:var(--a)}.dpick button i.no{visibility:hidden}
.dpick button.on{background:linear-gradient(180deg,color-mix(in srgb,var(--a) 28%,transparent),color-mix(in srgb,var(--a) 7%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--a) 45%,transparent),0 8px 24px -8px color-mix(in srgb,var(--a) 60%,transparent);animation:luxGum .6s ease-out}
.msg{display:grid;place-items:center;min-height:180px;color:var(--mut);font-size:14px;text-align:center}
.spin{width:28px;height:28px;margin:0 auto 10px;border-radius:50%;border:3px solid var(--soft);border-top-color:var(--a);animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.school{display:grid;gap:14px}
.school-person{padding:14px;border-radius:20px;background:var(--soft);box-shadow:inset 0 0 0 1px var(--edge)}
.school-title{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:16px;font-weight:900}.school-title i{width:5px;height:22px;border-radius:4px;background:var(--c)}
.school-grid{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:8px;overflow-x:auto}
.school-day{min-width:150px;padding:10px;border-radius:14px;background:color-mix(in srgb,var(--ink) 3%,transparent);box-shadow:inset 0 0 0 1px var(--edge)}
.school-day.today{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--a) 55%,transparent)}
.school-day>header{margin-bottom:6px;font-size:12px;font-weight:800;text-transform:capitalize}
.lesson{--c:var(--a);margin-top:6px;padding:7px 8px;border-left:3px solid var(--c);border-radius:9px;background:color-mix(in srgb,var(--c) 11%,transparent)}
.lesson{cursor:pointer;transition:transform .25s cubic-bezier(.2,1.4,.4,1)}.lesson:active{transform:scale(.96)}.lesson.live{animation:live 2.4s ease-in-out infinite}
.lesson b{display:block;font-size:12px}.lesson span,.lesson small{display:block;margin-top:2px;color:var(--mut);font-size:10.5px}
.foot{display:flex;justify-content:space-between;margin-top:14px;font-size:11px;color:var(--mut)}
${luxCss({ base: ".seg button", active: ".seg button.on" })}
${LUX_KEYFRAMES}
@media (max-width:900px){.hero{grid-template-columns:1fr}}
@media (max-width:700px){ha-card{padding:16px 14px 18px}h2{font-size:24px}h2 small{display:none}.wx{padding:8px 12px}.wx ha-icon{--mdc-icon-size:26px}.wx b{font-size:19px}
  .tlp{display:none}.nx b{font-size:17px}.bar{gap:8px}.seg{width:100%}.seg button{flex:1;justify-content:center;padding:9px 6px}.seg button span{display:none}
  .wknav{width:100%;margin-left:0}.wknav b{flex:1;min-width:0}.agenda{grid-template-columns:1fr}
  .dpick{display:flex}.wk{display:none}.wkday{display:block}}
@media (min-width:701px){.wkday{display:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style><ha-card>
<div class="top"><div><div class="eyebrow"><i></i>${esc(this._config.title || "Familiekalender")}</div><h2 data-date></h2></div>
<div class="wx" data-wx hidden><ha-icon data-wxi></ha-icon><div><b data-wxt></b><span data-wxs></span></div></div></div>
<div class="hero"><section class="panel"><h3 data-nxh>Næste</h3><div data-nx></div></section>
<section class="panel tlp"><h3>I dag<em data-tlh></em></h3><div class="tl" data-tl></div><div class="sum" data-sum></div></section></div>
<div class="bar"><div class="seg" data-seg></div><div class="chips" data-chips></div></div>
<div class="body" data-body></div>
<div class="foot"><span data-range></span><span data-upd></span></div>
</ha-card>`;
    const r = this.shadowRoot;
    r.querySelector("[data-seg]").addEventListener("click", (ev) => { const b = ev.target.closest("[data-view]"); if (!b) return; this._view = b.dataset.view; this._store({ view: this._view }); this._render(); });
    r.querySelector("[data-chips]").addEventListener("click", (ev) => this._chipClick(ev));
    r.querySelector("ha-card").addEventListener("click", (ev) => {
      const nav = ev.target.closest("[data-wk]"); if (nav) { this._weekNav(Number(nav.dataset.wk)); return; }
      const dp = ev.target.closest("[data-dpick]"); if (dp) { this._mobileDay = new Date(Number(dp.dataset.dpick)); this._render(); return; }
      if (ev.target.closest("[data-close]") || ev.target.classList.contains("sheet")) { r.querySelector(".sheet")?.remove(); return; }
      const mi = ev.target.closest("[data-more]"); if (mi) { this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: mi.dataset.more }, bubbles: true, composed: true })); return; }
      const e = ev.target.closest("[data-ev]"); if (e) this._sheet(this._byId.get(e.dataset.ev));
    });
    this._render();
  }

  _weather() {
    const r = this.shadowRoot; const box = r?.querySelector("[data-wx]"); if (!box) return;
    const st = this._hass?.states?.[this._config.weather_entity]; box.hidden = !st;
    if (!st) return;
    const [txt, icon] = WEATHER[st.state] || [st.state, "mdi:weather-cloudy"];
    const t = Number(st.attributes?.temperature); const u = st.attributes?.temperature_unit || "°C";
    const k = `${st.state}|${t}`; if (k === this._wxKey) return; this._wxKey = k;
    r.querySelector("[data-wxi]").setAttribute("icon", icon);
    r.querySelector("[data-wxt]").textContent = Number.isFinite(t) ? `${Math.round(t)}${u}` : "–";
    r.querySelector("[data-wxs]").textContent = txt;
  }

  // ---------- render ----------
  _render() {
    if (!this._built) return;
    const r = this.shadowRoot; const now = new Date(); const t = +now;
    const d = r.querySelector("[data-date]"); const ds = `${DAY[now.getDay()]} ${now.getDate()}. ${MONTH[now.getMonth()]}`;
    d.innerHTML = `${esc(ds[0].toUpperCase() + ds.slice(1))}<small>${esc(this._config.subtitle || "")}</small>`;
    this._byId = new Map(); this._visible().forEach((e, i) => { e._id = e._id || `e${i}-${e.s}`; this._byId.set(e._id, e); });
    this._renderSeg(); this._renderChips(); this._renderHero(t);
    const body = r.querySelector("[data-body]");
    if (this._view === "school") body.innerHTML = this._schoolHtml(now);
    else if (this._loading && !this._events.length) body.innerHTML = '<div class="msg"><div><div class="spin"></div>Henter kalenderaftaler …</div></div>';
    else if (this._error && !this._events.length) body.innerHTML = `<div class="msg">${esc(this._error)}</div>`;
    else body.innerHTML = this._view === "week" ? this._weekHtml(t) : this._agendaHtml(t);
    const rg = r.querySelector("[data-range]"); rg.textContent = this._view === "agenda" ? `Viser ${Math.max(14, Number(this._config.days) || 30)} dage frem` : this._view === "week" ? `Uge ${this._weekNo(this._week)}` : "Skoleskema denne uge";
    r.querySelector("[data-upd]").textContent = this._range ? `Opdateret ${hhmm(new Date())}` : "";
    this._paintNow();
  }
  _renderSeg() {
    const views = [["agenda", "mdi:format-list-text", "Agenda"], ["week", "mdi:calendar-week", "Uge"], ...(this._config.school_entity ? [["school", "mdi:school-outline", "Skoleskema"]] : [])];
    const html = views.map(([k, i, n]) => `<button type="button" data-view="${k}" class="${this._view === k ? "on" : ""}"><ha-icon icon="${i}"></ha-icon><span>${n}</span></button>`).join("");
    const seg = this.shadowRoot.querySelector("[data-seg]"); if (seg._h !== html) { seg._h = html; seg.innerHTML = html; }
  }
  _renderChips() {
    const today = dayKey(new Date()); const counts = new Map();
    this._events.forEach((e) => { if (dayKey(new Date(e.s)) === today || (e.allDay && e.s <= Date.now() && e.e > Date.now())) counts.set(e.calendar_entity, (counts.get(e.calendar_entity) || 0) + 1); });
    const groups = this._groups();
    const html = (groups.length > 1 ? `<button type="button" class="chip grp" data-grp="*">Alle</button>${groups.map((g) => `<button type="button" class="chip grp" data-grp="${esc(g)}">${esc(g)}</button>`).join("")}<span class="sep"></span>` : "")
      + this._config.calendars.filter((c) => c.entity).map((c) => { const n = counts.get(c.entity) || 0; return `<button type="button" class="chip ${this._hidden.has(c.entity) ? "off" : ""}" data-cal="${esc(c.entity)}" style="--c:${esc(c.color || "#22c9ff")}" title="${this._hidden.has(c.entity) ? "Vis" : "Skjul"} ${esc(c.name || c.entity)}"><ha-icon icon="${esc(c.icon || "mdi:calendar")}"></ha-icon>${esc(c.name || c.entity)}${n ? `<span class="n">${n}</span>` : ""}</button>`; }).join("");
    const box = this.shadowRoot.querySelector("[data-chips]"); if (box._h !== html) { const sl = box.scrollLeft; box._h = html; box.innerHTML = html; box.scrollLeft = sl; }
  }
  _chipClick(ev) {
    const b = ev.target.closest("button"); if (!b) return;
    const all = this._config.calendars.filter((c) => c.entity).map((c) => c.entity);
    if (b.dataset.grp) {
      const g = b.dataset.grp; this._hidden = new Set(g === "*" ? [] : all.filter((e) => this._cal(e).group !== g));
    } else if (b.dataset.cal) {
      const e = b.dataset.cal; if (this._hidden.has(e)) this._hidden.delete(e); else this._hidden.add(e);
      if (this._hidden.size === all.length) this._hidden.delete(e); // never hide everything
    }
    this._store({ hidden: [...this._hidden] }); this._liveKey = null; this._render();
    const again = this.shadowRoot.querySelector(b.dataset.grp ? `[data-grp="${CSS.escape(b.dataset.grp)}"]` : `[data-cal="${CSS.escape(b.dataset.cal)}"]`);
    again?.classList.add("flash"); setTimeout(() => again?.classList.remove("flash"), 650);
  }

  // Now (with progress) or the next ones (with countdown), then today's timeline.
  _renderHero(t) {
    const r = this.shadowRoot; const ev = this._visible();
    const live = ev.filter((e) => this._on(e, t));
    const next = ev.filter((e) => !e.allDay && e.s > t).slice(0, live.length ? 1 : 2);
    r.querySelector("[data-nxh]").innerHTML = live.length ? `<span style="color:var(--a)">●</span> Lige nu` : "Næste";
    const item = (e, isLive) => { const c = this._cal(e.calendar_entity); return `<button type="button" class="nx ${isLive ? "live" : ""}" data-ev="${e._id}" style="--c:${esc(c.color || "#22c9ff")}"><span class="ic"><ha-icon icon="${esc(c.icon || "mdi:calendar")}"></ha-icon></span>
      <span><b>${esc(e.summary || "Uden titel")}</b><small>${isLive ? `<span class="cd" data-cd="${e.e}" data-end>${until(e.e - t).replace("om ", "slutter om ")}</span>` : `<span class="cd" data-cd="${e.s}">${until(e.s - t)}</span>`} · ${hhmm(new Date(e.s))}–${hhmm(new Date(e.e))}${dayKey(new Date(e.s)) !== dayKey(new Date(t)) ? ` ${DAY[new Date(e.s).getDay()]}` : ""} · ${esc(c.name || "")}${e.location ? ` · ${esc(e.location)}` : ""}</small></span>
      ${isLive ? `<span class="prog"><i data-prog="${e.s}|${e.e}" style="width:${Math.min(100, ((t - e.s) / (e.e - e.s)) * 100).toFixed(1)}%"></i></span>` : ""}</button>`; };
    r.querySelector("[data-nx]").innerHTML = [...live.map((e) => item(e, true)), ...(live.length ? next.map((e) => item(e, false)) : next.map((e) => item(e, false)))].join("") || '<div class="empty-nx">Ingen flere aftaler i den viste periode 🎉</div>';
    // timeline
    const d0 = +startOfDay(new Date(t)); const d1 = d0 + 864e5;
    const todays = ev.filter((e) => !e.allDay && e.e > d0 && e.s < d1);
    let h0 = 7; let h1 = 22; todays.forEach((e) => { h0 = Math.min(h0, new Date(Math.max(e.s, d0)).getHours()); h1 = Math.max(h1, Math.ceil((Math.min(e.e, d1) - d0) / HOUR)); });
    h1 = Math.min(24, h1); const span = (h1 - h0) * HOUR; const x = (ms) => Math.max(0, Math.min(100, ((ms - d0 - h0 * HOUR) / span) * 100));
    const lanes = []; const blocks = todays.map((e) => { let l = lanes.findIndex((end) => end <= e.s); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = e.e; const c = this._cal(e.calendar_entity); return `<button type="button" class="blk ${e.e <= t ? "past" : ""}" data-ev="${e._id}" style="--c:${esc(c.color || "#22c9ff")};left:${x(e.s)}%;width:max(8px,${(x(e.e) - x(e.s)).toFixed(2)}%);top:${(l % 2) * 26}px" title="${esc(e.summary || "")}">${esc(e.summary || "")}</button>`; });
    const hrs = []; for (let h = h0; h <= h1; h += h1 - h0 > 12 ? 3 : 2) hrs.push(`<div class="hr" style="left:${x(d0 + h * HOUR)}%"><span>${pad(h)}</span></div>`);
    r.querySelector("[data-tl]").innerHTML = hrs.join("") + blocks.join("") + `<div class="now" data-now-tl="${d0 + h0 * HOUR}|${span}"></div>`;
    r.querySelector("[data-tlh]").textContent = todays.length ? `${todays.length} ${todays.length === 1 ? "aftale" : "aftaler"}` : "Fri";
    const wkEnd = +addDays(monday(new Date(t)), 7);
    const week = ev.filter((e) => e.s >= d0 && e.s < wkEnd).length; const left = todays.filter((e) => e.s > t).length;
    r.querySelector("[data-sum]").innerHTML = `<span><b>${left}</b>tilbage i dag</span><span><b>${week}</b>resten af ugen</span>`;
  }

  _agendaHtml(t) {
    const days = new Map(); const ev = this._visible(); const today = startOfDay(new Date(t));
    const put = (d, e, kind) => { const k = dayKey(d); if (!days.has(k)) days.set(k, { d, all: [], timed: [] }); days.get(k)[kind].push(e); };
    ev.forEach((e) => {
      if (e.e <= +today) return;
      // All-day events show on each of their days from today on; a timed one on its start day (today if it began earlier).
      if (e.allDay) { for (let d = startOfDay(new Date(Math.max(e.s, +today))); +d < e.e; d = addDays(d, 1)) put(d, e, "all"); }
      else put(startOfDay(new Date(Math.max(e.s, +today))), e, "timed");
    });
    const list = [...days.values()].filter((x) => +x.d >= +today).sort((a, b) => a.d - b.d);
    if (!list.length) return '<div class="msg">Ingen aftaler i de valgte kalendere 🎉</div>';
    return `<div class="agenda">${list.map((x) => {
      const isToday = +x.d === +today; const tomorrow = +x.d === +addDays(today, 1);
      return `<section class="day ${isToday ? "today" : ""}"><div class="dh"><strong>${x.d.getDate()}</strong><b>${DAY[x.d.getDay()]}</b><span>${MONTH_SHORT[x.d.getMonth()]}</span>${isToday ? '<span class="tag">I dag</span>' : tomorrow ? '<span class="tag" style="opacity:.75">I morgen</span>' : ""}</div>
        ${x.all.length ? `<div class="alld">${x.all.map((e) => `<button type="button" data-ev="${e._id}" style="--c:${esc(this._cal(e.calendar_entity).color || "#22c9ff")}">${esc(e.summary || "")}</button>`).join("")}</div>` : ""}
        ${x.timed.map((e) => this._evHtml(e, t)).join("")}</section>`;
    }).join("")}</div>`;
  }
  _evHtml(e, t) {
    const c = this._cal(e.calendar_entity); const live = this._on(e, t);
    return `<button type="button" class="ev ${live ? "live" : e.e <= t ? "past" : ""}" data-ev="${e._id}" style="--c:${esc(c.color || "#22c9ff")}"><span class="t">${hhmm(new Date(e.s))}<small>${hhmm(new Date(e.e))}</small></span><span class="ln"></span>
      <span class="x"><b>${esc(e.summary || "Uden titel")}${live ? '<span class="nu"><i></i>NU</span>' : ""}</b><span><span><ha-icon icon="${esc(c.icon || "mdi:calendar")}"></ha-icon>${esc(c.name || e.calendar_entity)}</span><span><ha-icon icon="mdi:timer-outline"></ha-icon>${dur(e.e - e.s)}</span>${e.location ? `<span><ha-icon icon="mdi:map-marker-outline"></ha-icon>${esc(e.location)}</span>` : ""}</span></span></button>`;
  }

  // A real week: hours down the side, each day a column, overlapping events side by side.
  _weekHtml(t) {
    const w0 = this._week; const days = [...Array(7)].map((_, i) => addDays(w0, i)); const w1 = +addDays(w0, 7);
    const ev = this._visible().filter((e) => e.e > +w0 && e.s < w1);
    let h0 = 7; let h1 = 21;
    ev.filter((e) => !e.allDay).forEach((e) => { const s = new Date(e.s); const en = new Date(e.e); if (dayKey(s) === dayKey(en) || en - s < 864e5) { h0 = Math.min(h0, s.getHours()); h1 = Math.max(h1, en.getHours() + (en.getMinutes() ? 1 : 0) || 24); } });
    h0 = Math.max(0, h0); h1 = Math.min(24, Math.max(h1, h0 + 6)); const PX = 46; const H = (h1 - h0) * PX;
    const today = dayKey(new Date(t));
    const nav = `<div class="bar" style="margin-top:0"><div class="wknav"><button type="button" data-wk="-1" aria-label="Forrige uge">‹</button><button type="button" data-wk="0">I dag</button><b>Uge ${this._weekNo(w0)} · ${w0.getDate()}. ${MONTH_SHORT[w0.getMonth()]} – ${addDays(w0, 6).getDate()}. ${MONTH_SHORT[addDays(w0, 6).getMonth()]}</b><button type="button" data-wk="1" aria-label="Næste uge">›</button></div></div>`;
    const colHtml = (d, extraCls = "") => {
      const ds = +d; const de = ds + 864e5;
      const items = ev.filter((e) => !e.allDay && e.e > ds && e.s < de).map((e) => ({ e, s: Math.max(e.s, ds), en: Math.min(e.e, de) })).sort((a, b) => a.s - b.s || b.en - a.en);
      // clusters of overlapping events share the width
      const out = []; let cluster = []; let cEnd = 0;
      const flush = () => { const lanes = []; cluster.forEach((it) => { let l = lanes.findIndex((end) => end <= it.s); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = it.en; it.l = l; }); cluster.forEach((it) => { it.n = lanes.length; out.push(it); }); cluster = []; };
      items.forEach((it) => { if (cluster.length && it.s >= cEnd) flush(); cluster.push(it); cEnd = Math.max(cEnd, it.en); }); flush();
      const y = (ms) => ((ms - ds) / HOUR - h0) * PX;
      const blocks = out.map(({ e, s, en, l, n }) => { const c = this._cal(e.calendar_entity); const top = Math.max(0, y(s)); const h = Math.max(20, Math.min(H, y(en)) - top - 2);
        return `<button type="button" class="blk ${this._on(e, t) ? "live" : e.e <= t ? "past" : ""}" data-ev="${e._id}" style="--c:${esc(c.color || "#22c9ff")};top:${top}px;height:${h}px;left:calc(${(l / n) * 100}% + 3px);width:calc(${100 / n}% - 6px)"><b>${esc(e.summary || "")}</b>${h > 34 ? `<small>${hhmm(new Date(e.s))}–${hhmm(new Date(e.e))}</small>` : ""}</button>`; }).join("");
      const grid = [...Array(h1 - h0)].map((_, i) => `<div class="gl" style="top:${i * PX}px"></div>`).join("");
      return `<div class="col ${dayKey(d) === today ? "today" : ""} ${extraCls}" style="height:${H}px">${grid}${blocks}${dayKey(d) === today ? `<div class="now" data-now-wk="${ds}|${h0}|${PX}"></div>` : ""}</div>`;
    };
    const allDay = (d) => { const ds = +d; const de = ds + 864e5; return ev.filter((e) => e.allDay && e.e > ds && e.s < de).map((e) => `<button type="button" data-ev="${e._id}" style="--c:${esc(this._cal(e.calendar_entity).color || "#22c9ff")}">${esc(e.summary || "")}</button>`).join(""); };
    const axis = `<div class="ax" style="height:${H}px">${[...Array(h1 - h0)].map((_, i) => (i ? `<span style="top:${i * PX}px">${pad(h0 + i)}</span>` : "")).join("")}</div>`;
    const desk = `<div class="wk"><div class="hd"></div>${days.map((d) => `<div class="hd ${dayKey(d) === today ? "today" : ""}">${DAY_SHORT[d.getDay()]}<b>${d.getDate()}</b></div>`).join("")}
      <div class="ad" style="border-right:1px solid var(--edge)"></div>${days.map((d) => `<div class="ad">${allDay(d)}</div>`).join("")}
      ${axis}${days.map((d) => colHtml(d)).join("")}</div>`;
    // phones: a day picker and that day's column
    if (+this._mobileDay < +w0 || +this._mobileDay >= w1) this._mobileDay = days.find((d) => dayKey(d) === today) || w0;
    const pick = `<div class="dpick">${days.map((d) => { const has = ev.some((e) => e.e > +d && e.s < +d + 864e5); return `<button type="button" data-dpick="${+d}" class="${dayKey(d) === dayKey(this._mobileDay) ? "on" : ""}">${DAY_SHORT[d.getDay()]}<b>${d.getDate()}</b><i class="${has ? "" : "no"}"></i></button>`; }).join("")}</div>`;
    const md = this._mobileDay; const mAll = allDay(md);
    const mob = `<div class="wkday">${pick}<div class="wk" style="display:grid;grid-template-columns:46px minmax(0,1fr)">${mAll ? `<div class="ad" style="grid-column:1/-1">${mAll}</div>` : ""}${axis}${colHtml(md)}</div></div>`;
    return nav + desk + mob;
  }
  _weekNav(dir) {
    this._week = dir === 0 ? monday(new Date()) : addDays(this._week, dir * 7);
    if (dir === 0) this._mobileDay = startOfDay(new Date()); else this._mobileDay = addDays(this._mobileDay, dir * 7);
    this._render(); this._ensure(this._week, addDays(this._week, 7));
  }
  _weekNo(d) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - y0) / 864e5 + 1) / 7); }

  // Countdowns, progress bars and now lines, without a redraw.
  _paintNow() {
    const r = this.shadowRoot; const t = Date.now();
    r.querySelectorAll("[data-cd]").forEach((el) => { const ms = Number(el.dataset.cd) - t; el.textContent = el.hasAttribute("data-end") ? until(ms).replace("om ", "slutter om ") : until(ms); });
    r.querySelectorAll("[data-prog]").forEach((el) => { const [s, e] = el.dataset.prog.split("|").map(Number); el.style.width = `${Math.min(100, ((t - s) / (e - s)) * 100).toFixed(1)}%`; });
    r.querySelectorAll("[data-now-tl]").forEach((el) => { const [a, span] = el.dataset.nowTl.split("|").map(Number); const p = ((t - a) / span) * 100; el.style.display = p < 0 || p > 100 ? "none" : ""; el.style.left = `${p}%`; });
    r.querySelectorAll("[data-now-wk]").forEach((el) => { const [ds, h0, px] = el.dataset.nowWk.split("|").map(Number); const y = ((t - ds) / HOUR - h0) * px; el.style.display = y < 0 || y > el.parentElement.offsetHeight ? "none" : ""; el.style.top = `${y}px`; });
  }

  _sheet(e) {
    if (!e) return; const c = e._color ? { color: e._color, name: e._name, icon: e._icon } : this._cal(e.calendar_entity); const s = new Date(e.s); const en = new Date(e.e);
    const when = e.allDay ? `${DAY[s.getDay()]} ${s.getDate()}. ${MONTH[s.getMonth()]}${en - s > 864e5 ? ` – ${addDays(en, -1).getDate()}. ${MONTH[addDays(en, -1).getMonth()]}` : ""} · hele dagen` : `${DAY[s.getDay()]} ${s.getDate()}. ${MONTH[s.getMonth()]} · ${hhmm(s)}–${hhmm(en)} (${dur(e.e - e.s)})`;
    const live = this._on(e, Date.now());
    this._closeSheet();
    const host = document.createElement("div"); host.className = "ha-family-calendar-sheet"; const root = host.attachShadow({ mode: "open" });
    const div = document.createElement("div"); div.className = "sheet";
    div.innerHTML = `<div class="box" style="--c:${esc(c.color || "#22c9ff")}"><div class="hd2"><span class="ic"><ha-icon icon="${esc(c.icon || "mdi:calendar")}"></ha-icon></span><div><div class="cal">${esc(c.name || e.calendar_entity)}${live ? ' · <span style="color:inherit">I GANG NU</span>' : ""}</div><h4>${esc(e.summary || "Uden titel")}</h4></div><button type="button" class="x" data-close aria-label="Luk"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <dl><dt><ha-icon icon="mdi:clock-outline"></ha-icon></dt><dd>${esc(when[0].toUpperCase() + when.slice(1))}</dd>
      ${!e.allDay && e.s > Date.now() ? `<dt><ha-icon icon="mdi:timer-sand"></ha-icon></dt><dd>Starter ${until(e.s - Date.now())}</dd>` : ""}
      ${e.location ? `<dt><ha-icon icon="mdi:map-marker-outline"></ha-icon></dt><dd>${esc(e.location)}</dd>` : ""}
      ${e.description ? `<dt><ha-icon icon="mdi:text"></ha-icon></dt><dd>${esc(e.description)}</dd>` : ""}</dl>
      <button type="button" class="open" data-more="${esc(e.calendar_entity)}">${e._color ? "Åbn skoleskema" : "Åbn kalenderen"}</button></div>`;
    root.innerHTML = `<style>${SHEET_CSS}</style>`; root.appendChild(div); document.body.appendChild(host); this._sheetHost = host;
    div.addEventListener("click", (ev) => {
      if (ev.target === div || ev.target.closest("[data-close]")) { this._closeSheet(); return; }
      const mi = ev.target.closest("[data-more]"); if (mi) { this._closeSheet(); this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: mi.dataset.more }, bubbles: true, composed: true })); }
    });
    this._escKey = this._escKey || ((ev) => { if (ev.key === "Escape") this._closeSheet(); });
    document.addEventListener("keydown", this._escKey);
  }
  _closeSheet() { this._sheetHost?.remove(); this._sheetHost = null; if (this._escKey) document.removeEventListener("keydown", this._escKey); }

  // ---------- school ----------
  _schoolHtml(now) {
    const st = this._hass?.states?.[this._config.school_entity]; const data = st?.attributes || {};
    const people = Object.entries(data).filter(([, list]) => Array.isArray(list));
    if (!people.length) return '<div class="msg">Skoleskemaet har ingen data</div>';
    const m = monday(now); const t = +now;
    return `<div class="school">${people.map(([name, list], pi) => {
      const color = pi % 2 ? "#f7b942" : "#28df9d"; this._lessonWho = `Skoleskema · ${name[0].toUpperCase()}${name.slice(1)}`;
      const days = [0, 1, 2, 3, 4].map((o) => { const d = addDays(m, o); const lessons = list.filter((e) => dayKey(new Date(e.start)) === dayKey(d)).sort((a, b) => new Date(a.start) - new Date(b.start));
        return `<section class="school-day ${dayKey(d) === dayKey(now) ? "today" : ""}"><header>${DAY[d.getDay()]} ${d.getDate()}. ${MONTH_SHORT[d.getMonth()]}</header>${lessons.map((e) => this._lesson(e, t)).join("") || '<div style="color:var(--mut);font-size:12px">Ingen timer</div>'}</section>`; });
      return `<div class="school-person"><div class="school-title" style="--c:${color}"><i></i>${esc(name[0].toUpperCase() + name.slice(1))}</div><div class="school-grid">${days.join("")}</div></div>`;
    }).join("")}</div>`;
  }
  _lesson(e, t) {
    const [code, ...teacher] = String(e.summary || "").split(","); const k = code.trim(); const s = new Date(e.start); const en = new Date(e.end);
    // A lesson opens the same sheet (user: no popup in the timetable): subject, time, room and teacher.
    const id = `l${+s}-${k}-${this._byId.size}`;
    this._byId.set(id, { _id: id, summary: SUBJECTS[k] || k, s: +s, e: +en, allDay: false, location: e.location, description: teacher.join(",").trim() ? `Lærer: ${teacher.join(",").trim()}` : "", calendar_entity: this._config.school_entity, _color: this._subjectColor(k), _name: this._lessonWho || "Skoleskema", _icon: "mdi:school-outline" });
    return `<div class="lesson ${+s <= t && +en > t ? "live" : ""}" data-ev="${id}" role="button" tabindex="0" style="--c:${this._subjectColor(k)}"><b>${esc(SUBJECTS[k] || k)}</b><span>${hhmm(s)}–${hhmm(en)}${e.location ? ` · ${esc(e.location)}` : ""}</span>${teacher.length ? `<small>${esc(teacher.join(",").trim())}</small>` : ""}</div>`;
  }
  _subjectColor(code) { const fixed = { MAT: "#4f8cff", DAN: "#ff6b6b", IDR: "#3ecf8e", ENG: "#a86bff", MUS: "#ffb347", KRI: "#3fc6c6", "N/T": "#5ad1e6" }; if (fixed[code]) return fixed[code]; let h = 0; for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 65% 58%)`; }
}

if (!customElements.get("ha-family-calendar-card")) customElements.define("ha-family-calendar-card", HAFamilyCalendarCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-family-calendar-card", name: "HA Family Calendar Card", description: "Familiekalender med nu/næste, tidslinje, agenda, ugeskema, kalenderfiltre og skoleskema", preview: true });
console.info(`%c HA-FAMILY-CALENDAR-CARD %c ${VERSION} `, "color:#00131c;background:#22c9ff;font-weight:800", "color:#22c9ff;background:#102030");
