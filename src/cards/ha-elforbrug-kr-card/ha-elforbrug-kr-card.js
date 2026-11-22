/*
 * ha-elforbrug-kr-card – elforbruget i kroner, måned for måned og år for år (Claude AI, 2026-11-13).
 * Brugeren: "Der skal laves en graf mere som den med elforbrug, men forbrug i kr., så jeg kan se måneds- og årsforbrug."
 * Samme udseende som ha-elforbrug-historik-card. Kilder pr. måned, i denne rækkefølge:
 *   1. Regningerne fra Elregning (fordelt på kalendermåneder efter dage) – fuld søjle.
 *   2. HA's egen måling (omkostningssensoren fra energi-dashboardet) × forholdet regning/måling – skraveret.
 *   3. Anslået: målt kWh (historiksensoren, netselskabets data) × den gennemsnitlige pris på regningerne – lys og skraveret.
 * Gas (Elregning 0.2.0's gasregninger) kan vælges, når der er gasregninger.
 */
import { buildCostSeries, key, sumYear, heatMonths, heatingSeries, heatingCompare, DEFAULT_HEAT_TARIFFS } from "./cost-series.js";

const CARD_TAG = "ha-elforbrug-kr-card";
const VERSION = "1.2.0"; // 1.2.0: naturgas alt inkl. – Evida + afgifter efter officielle satser pr. periode. // 1.1.0: "Opvarmning" – naturgas og fjernvarme på én tidslinje + sammenligning. // 1.0.1: "Naturgas" – energy-fjernvarme-labels.js omdøber ordet "Gas" på energi-siden
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MONTHS_LONG = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const PALETTE = ["var(--ec-accent)", "var(--c-heat)", "var(--c-ev)", "var(--c-water)", "var(--c-price)", "var(--ec-muted)"];
const KIND = { bill: "faktureret", measured: "målt i HA", estimate: "anslået" };
const nf = (d = 0) => new Intl.NumberFormat("da-DK", { maximumFractionDigits: d, minimumFractionDigits: d });
const fmt = (n, d = 0) => (n == null || !Number.isFinite(n) ? "–" : nf(d).format(n));
const pct = (a, b) => (b > 0 && a != null ? ((a - b) / b) * 100 : null);
const fmtPct = (p) => (p == null ? "–" : `${p > 0 ? "+" : p < 0 ? "−" : ""}${nf(0).format(Math.abs(p))} %`);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);


function niceMax(v) {
  if (!(v > 0)) return 100;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= s * e) return s * e;
  return 10 * e;
}


const STYLE = `
:host{
  --c-gas:var(--amber,#f59e0b);
  --c-fv:var(--deep-orange,#ef5350);
  --ec-text:var(--primary-text-color,#e8eef8);
  --ec-muted:var(--secondary-text-color,#8e9cb4);
  --ec-faint:color-mix(in srgb,var(--ec-muted) 78%,transparent);
  --ec-surface:var(--ha-card-background,var(--card-background-color,#161f33));
  --ec-surface-2:var(--contrast1,color-mix(in srgb,var(--ec-text) 4%,transparent));
  --ec-border:var(--divider-color,rgba(148,163,194,.14));
  --ec-line:color-mix(in srgb,var(--ec-text) 9%,transparent);
  --ec-accent:var(--dashboard-accent,var(--primary-color,#4f8cff));
  --ec-shadow:var(--ha-card-box-shadow,0 8px 24px -12px rgba(0,0,0,.5));
  --c-el:var(--energy-grid-consumption-color,var(--blue-dark,#4f8cff));
  --c-heat:var(--orange,#ff8a3d);
  --c-water:var(--energy-water-color,#26c6da);
  --c-ev:var(--energy-ev-charging,var(--green,#2fd3a0));
  --c-warn:var(--dashboard-warning,var(--warning-color,#f4b740));
  --c-bad:var(--dashboard-danger,var(--error-color,#ff5d6c));
  --c-ok:var(--dashboard-success,var(--success-color,#34d399));
  --c-price:var(--yellow,#ffd400);
  --r:var(--ha-card-border-radius,18px);
  display:block;container-type:inline-size;color:var(--ec-text);
  font-family:var(--primary-font-family,var(--ha-font-family-body,system-ui,sans-serif));
  -webkit-tap-highlight-color:transparent;
}
*{box-sizing:border-box}
[hidden]{display:none!important}
button{font:inherit;color:inherit;background:none;border:0;padding:0;text-align:inherit;cursor:pointer}
.ic{--mdc-icon-size:20px;display:inline-flex;flex:none}
.num{font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.tone-el{--tone:var(--c-el)}.tone-heat{--tone:var(--c-heat)}.tone-ev{--tone:var(--c-ev)}.tone-ok{--tone:var(--c-ok)}
.tone-bad{--tone:var(--c-bad)}.tone-warn{--tone:var(--c-warn)}.tone-muted{--tone:var(--ec-muted)}
.shell{position:relative;display:flex;flex-direction:column;gap:18px;min-width:0;padding:16px;border-radius:var(--r);background:var(--dashboard-card-bg,var(--ec-surface));border:var(--ha-card-border-width,1px) solid var(--ec-border);box-shadow:var(--ec-shadow)}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px 24px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:14px;min-width:0}
.brand-mark{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;color:var(--ec-accent);background:color-mix(in srgb,var(--ec-accent) 12%,transparent);border:1px solid color-mix(in srgb,var(--ec-accent) 32%,transparent)}
.brand-mark .ic{--mdc-icon-size:26px}
.brand h2{margin:0;font-size:22px;line-height:1.15;font-weight:700;letter-spacing:-.015em}
.brand p{margin:3px 0 0;font-size:13px;color:var(--ec-muted)}
.hero-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.hero-item{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:14px;position:relative;overflow:hidden;background:var(--ec-surface-2)}
.hero-item::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:0 3px 3px 0;background:var(--tone,var(--ec-muted));opacity:.85}
.hi-label{font-size:12px;font-weight:650;text-transform:uppercase;letter-spacing:.07em;color:var(--ec-muted)}
.hi-val{display:flex;align-items:baseline;gap:6px}
.hi-val b{font-size:26px;font-weight:700;line-height:1.05}
.hi-val small{font-size:14px;font-weight:600;color:var(--ec-muted)}
.hi-sub{font-size:12.5px;color:var(--ec-muted)}
.hi-sub .d{font-weight:700;color:var(--tone,var(--ec-muted))}
.ctrl{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.seg{display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--ec-surface-2);border:1px solid var(--ec-border)}
.seg button{padding:6px 12px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--ec-muted);transition:color .15s ease,background-color .15s ease}
.seg button:hover{color:var(--ec-text)}
.seg button.on{color:var(--ec-text);background:color-mix(in srgb,var(--ec-accent) 24%,transparent)}
.years{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;max-width:100%}
.years::-webkit-scrollbar{display:none}
.yr{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:9px;font-size:12.5px;font-weight:650;color:var(--ec-muted);background:transparent;border:1px solid var(--ec-border);white-space:nowrap;transition:color .15s ease,background-color .15s ease,border-color .15s ease}
.yr i{width:9px;height:9px;border-radius:3px;background:var(--yc);opacity:.35}
.yr.on{color:var(--ec-text);background:color-mix(in srgb,var(--yc) 14%,transparent);border-color:color-mix(in srgb,var(--yc) 45%,transparent)}
.yr.on i{opacity:1}
button:focus-visible{outline:2px solid var(--ec-accent);outline-offset:2px}
.chart{position:relative;min-width:0}
.chart svg{display:block;width:100%;height:auto;overflow:visible}
.grid line{stroke:var(--ec-line);stroke-width:1}
.axis text{fill:var(--ec-muted);font-size:11px}
.bar{transition:opacity .15s ease}
.hit{fill:transparent}
.hit:hover,.hit.sel{fill:color-mix(in srgb,var(--ec-text) 5%,transparent)}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--ec-muted)}.legend span{display:inline-flex;align-items:center;gap:6px}.legend i{width:12px;height:12px;border-radius:3px;background:var(--ec-accent)}.legend i.h{background:repeating-linear-gradient(45deg,var(--ec-accent) 0 2px,color-mix(in srgb,var(--ec-accent) 45%,transparent) 2px 5px)}.legend i.e{background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--ec-accent) 55%,transparent) 0 2px,transparent 2px 5px);border:1px dashed var(--ec-accent)}
.tip .kinds{margin-top:4px;font-size:11.5px;color:var(--ec-muted)}
.vlabel{fill:var(--ec-text);font-size:11.5px;font-weight:650}
.tip{position:absolute;z-index:2;min-width:150px;max-width:230px;padding:10px 12px;border-radius:12px;background:var(--ha-card-background,var(--ec-surface));border:1px solid var(--ec-border);box-shadow:var(--ec-shadow);font-size:12.5px;pointer-events:none}
.tip h4{margin:0 0 6px;font-size:13px;font-weight:700}
.tip .row{display:flex;align-items:center;gap:8px;padding:2px 0}
.tip .row i{width:9px;height:9px;border-radius:3px;background:var(--yc)}
.tip .row .nm{color:var(--ec-muted)}
.tip .row .v{margin-left:auto;font-weight:650}
.tip .row .dd{font-size:11.5px;color:var(--ec-muted);min-width:44px;text-align:right}
.note{font-size:12px;color:var(--ec-muted);line-height:1.5}
.state{padding:28px 8px;text-align:center;color:var(--ec-muted);font-size:13.5px}
@container (max-width:760px){.hero-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container (max-width:420px){.hi-val b{font-size:22px}.brand h2{font-size:19px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

const TEMPLATE = `
<style>${STYLE}</style>
<section class="shell" part="shell">
  <div class="top">
    <div class="brand">
      <span class="brand-mark"><ha-icon class="ic" icon="mdi:cash-multiple"></ha-icon></span>
      <div><h2 data-ref="title"></h2><p data-ref="subtitle"></p></div>
    </div>
    <div class="seg" data-ref="util" role="tablist" aria-label="Forsyning" hidden><button type="button" data-util="el" class="on">El</button><button type="button" data-util="heat">Opvarmning</button></div>
  </div>
  <div class="hero-grid" data-ref="kpis"></div>
  <div class="ctrl">
    <div class="seg" role="tablist" aria-label="Visning"><button type="button" data-view="month" class="on">Måned for måned</button><button type="button" data-view="year">År for år</button></div>
    <div class="years swiper" data-ref="years" role="group" aria-label="Vælg år"></div>
  </div>
  <div class="chart" data-ref="chart"><div class="state">Henter …</div></div>
  <div class="legend" data-ref="legend"></div>
  <p class="note" data-ref="note"></p>
</section>`;

class HaElforbrugKrCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = TEMPLATE;
    this._ref = (n) => this.shadowRoot.querySelector(`[data-ref="${n}"]`);
    this._view = "month";
    this._util = "el";
    this._sel = null;
    this._stats = null;
    this._pinned = null;
    this._sig = "";
    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this._ro = new ResizeObserver(() => this._drawChart());
  }

  static getStubConfig() {
    return { type: `custom:${CARD_TAG}`, bills_entity: "sensor.elregning_seneste_regning", forecast_entity: "sensor.elregning_prognose_denne_maned", cost_entity: "sensor.teknikrum_hovedmaler_energy_cost", history_entity: "sensor.elforbrug_historik",
      heat_entity: "sensor.kamstrup_multical_total_energi", heat_start: "2026-04-27", heat_meter_start: 0, heat_m2: 179, heat_tariffs: DEFAULT_HEAT_TARIFFS, gas_kwh_per_m3: 11, gas_efficiency: 0.9 };
  }

  setConfig(config) {
    this.config = { ...HaElforbrugKrCard.getStubConfig(), title: "Elforbrug i kr", subtitle: "Måned for måned og år for år", ...config };
    this._ref("title").textContent = this.config.title;
    this._ref("subtitle").textContent = this.config.subtitle;
    this._stats = null;
    if (this._hass) this._load();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first && this.config) { this._load(); return; }
    const b = hass.states[this.config?.bills_entity];
    const sig = b ? b.last_updated : "";
    if (sig !== this._sig) { this._sig = sig; this._render(); }
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  connectedCallback() {
    this._ro.observe(this._ref("chart"));
    this._timer = setInterval(() => { if (!document.hidden) this._load(); }, 30 * 60 * 1000);
    if (this._hass && this.config && !this._stats) this._load();
  }

  disconnectedCallback() {
    this._ro.disconnect();
    clearInterval(this._timer);
  }

  async _load() {
    if (this._loading || !this._hass || !this.config) return;
    this._loading = true;
    const ids = [this.config.cost_entity, this.config.history_entity].filter(Boolean);
    try {
      const res = ids.length ? await this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: "2015-01-01T00:00:00Z",
        end_time: new Date(Date.now() + 36e5).toISOString(),
        statistic_ids: ids,
        period: "month",
        types: ["change"],
      }) : {};
      const toMap = (rows) => Object.fromEntries((rows || []).filter((r) => Number.isFinite(Number(r.change))).map((r) => { const d = new Date(r.start); return [key(d.getFullYear(), d.getMonth()), Number(r.change)]; }));
      this._stats = { cost: toMap(res?.[this.config.cost_entity]), kwh: toMap(res?.[this.config.history_entity]), heat: null };
      const he = this.config.heat_entity;
      if (he) {
        const ws = (period, types, start) => this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start, end_time: new Date(Date.now() + 36e5).toISOString(), statistic_ids: [he], period, types });
        const start = new Date(`${this.config.heat_start || "2015-01-01"}T00:00:00`).toISOString();
        const [mon, day] = await Promise.all([ws("month", ["change", "state"], start), ws("day", ["change"], start)]);
        const rows = (mon?.[he] || []).filter((r) => Number.isFinite(Number(r.change)));
        const first = rows[0];
        // Målerstand før statistikken: slutstand i første måned − ændringen i den måned − målerstanden ved start
        const pre = first && Number.isFinite(Number(first.state)) ? Number(first.state) - Number(first.change) - Number(this.config.heat_meter_start || 0) : 0;
        const firstDay = (day?.[he] || [])[0];
        this._stats.heat = heatMonths({ change: toMap(rows), pre, start: this.config.heat_start, statsStart: firstDay ? new Date(firstDay.start).toISOString() : null, tariffs: this.config.heat_tariffs, m2: this.config.heat_m2 });
        this._stats.heatPre = pre;
      }
      this._error = null;
    } catch (err) {
      this._stats = this._stats || { cost: {}, kwh: {} };
      this._error = err?.message || String(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _series() {
    const h = this._hass;
    const b = h?.states[this.config.bills_entity];
    const el = b?.attributes?.regninger || [];
    const gas = b?.attributes?.gasregninger || [];
    const heatBills = b?.attributes?.fjernvarmeregninger || [];
    const canHeat = gas.length || heatBills.length || this._stats?.heat;
    this._ref("util").hidden = !canHeat;
    if (!canHeat) this._util = "el";
    if (this._util === "heat") {
      const c = this.config;
      const opts = { kwhPerM3: Number(c.gas_kwh_per_m3) || 11, efficiency: Number(c.gas_efficiency) || 0.9 };
      const months = heatingSeries({ gasBills: gas, heatBills, heat: this._stats?.heat || {}, opts });
      this._heat = { months, cmp: heatingCompare(months, { tariffs: c.heat_tariffs, m2: c.heat_m2 }), opts };
      const years = {};
      for (const [k, cell] of Object.entries(months)) { const [y, m] = k.split("-").map(Number); (years[y] ||= Array(12).fill(null))[m - 1] = cell; }
      return { years };
    }
    this._heat = null;
    const ratio = Number(h?.states[this.config.forecast_entity]?.attributes?.forhold_regning_maaling) || null;
    const s = this._stats || { cost: {}, kwh: {} };
    return buildCostSeries({ bills: el, cost: s.cost, kwh: s.kwh, ratio });
  }

  _yearsAvailable() { return Object.keys(this._data?.years || {}).map(Number).sort((a, b) => a - b); }

  _render() {
    if (!this.config || !this._hass) return;
    this._data = this._series();
    const chart = this._ref("chart");
    const years = this._yearsAvailable();
    if (!years.length) {
      this._ref("kpis").innerHTML = "";
      this._ref("years").innerHTML = "";
      this._ref("legend").innerHTML = "";
      chart.innerHTML = `<div class="state">${this._stats ? `Ingen regninger endnu i <b>${esc(this.config.bills_entity)}</b>.` : "Henter …"}</div>`;
      return;
    }
    if (!this._sel || ![...this._sel].some((y) => years.includes(y))) this._sel = new Set(years.slice(-3));
    if (this._heat) { this._renderHeat(); return; }
    this._ref("title").textContent = this.config.title;
    this._ref("subtitle").textContent = this.config.subtitle;
    this._ref("kpis").classList.remove("heat");
    this._renderKpis();
    this._renderYears(years);
    this._drawChart();
    this._ref("legend").innerHTML = `<span><i></i>Faktureret</span><span><i class="h"></i>Målt i HA</span><span><i class="e"></i>Anslået</span>`;
    this._ref("note").textContent = `Faktureret = regningerne i Elregning, fordelt på måneder efter dage. Målt = HA's egen måling × forholdet regning/måling. Anslået = netselskabets kWh × kr/kWh lagt mellem de nærmeste regninger før og efter, for måneder uden regning eller måling. Den igangværende måned er foreløbig.`;
  }

  _renderKpis() {
    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth();
    const yrs = this._data.years;
    const cells = [];
    for (const y of this._yearsAvailable()) (yrs[y] || []).forEach((c, m) => { if (c && !(y === cy && m === cm)) cells.push({ y, m, ...c }); });
    const last12 = cells.slice(-12);
    const s12 = last12.length === 12 ? last12.reduce((s, c) => s + c.v, 0) : null;
    const ytd = sumYear(yrs[cy], cm);
    const ytdPrev = sumYear(yrs[cy - 1], cm);
    const prevFull = sumYear(yrs[cy - 1]);
    const tone = (d) => (d == null ? "tone-muted" : d > 3 ? "tone-bad" : d < -3 ? "tone-ok" : "tone-muted");
    const dYtd = ytd && ytdPrev && ytdPrev.n === ytd.n ? pct(ytd.v, ytdPrev.v) : null;
    const peak = last12.length ? last12.reduce((a, b) => (b.v > a.v ? b : a)) : null;
    const items = [];
    items.push(`<div class="hero-item tone-el"><span class="hi-label">I år hidtil</span><span class="hi-val num"><b>${fmt(ytd?.v)}</b><small>kr</small></span><span class="hi-sub ${tone(dYtd)}">${dYtd != null ? `<span class="d">${fmtPct(dYtd)}</span> mod samme periode sidste år` : ytd ? `${ytd.n} hele måneder` : "–"}</span></div>`);
    items.push(`<div class="hero-item tone-heat"><span class="hi-label">Seneste 12 mdr</span><span class="hi-val num"><b>${fmt(s12)}</b><small>kr</small></span><span class="hi-sub">${s12 != null ? `ca. ${fmt(s12 / 12)} kr pr. måned` : "Under 12 måneder"}</span></div>`);
    items.push(`<div class="hero-item tone-ev"><span class="hi-label">Hele ${cy - 1}</span><span class="hi-val num"><b>${fmt(prevFull?.v)}</b><small>kr</small></span><span class="hi-sub">${prevFull ? `${prevFull.n} måneder${prevFull.measured + prevFull.estimate > 1 ? ` · ${fmt(((prevFull.measured + prevFull.estimate) / prevFull.v) * 100)} % målt/anslået` : " · alt faktureret"}` : "–"}</span></div>`);
    items.push(`<div class="hero-item tone-warn"><span class="hi-label">Dyreste måned (12 mdr)</span><span class="hi-val num"><b>${fmt(peak?.v)}</b><small>kr</small></span><span class="hi-sub">${peak ? `${MONTHS_LONG[peak.m]} ${peak.y}` : "–"}</span></div>`);
    this._ref("kpis").innerHTML = items.join("");
  }

  _color(year) {
    const maxY = Math.max(...this._yearsAvailable());
    return PALETTE[Math.min(maxY - year, PALETTE.length - 1)];
  }

  _renderYears(years) {
    const box = this._ref("years");
    box.hidden = this._view !== "month" || !!this._heat; // Opvarmning er én tidslinje uden år-valg
    box.innerHTML = [...years].reverse().map((y) => `<button type="button" class="yr ${this._sel.has(y) ? "on" : ""}" data-year="${y}" style="--yc:${this._color(y)}" aria-pressed="${this._sel.has(y)}"><i></i>${y}</button>`).join("");
  }

  _onClick(e) {
    const u = e.target.closest("[data-util]");
    if (u) {
      this._util = u.dataset.util;
      this.shadowRoot.querySelectorAll("[data-util]").forEach((b) => b.classList.toggle("on", b === u));
      this._pinned = null; this._sel = null;
      this._render();
      return;
    }
    const seg = e.target.closest("[data-view]");
    if (seg) {
      this._view = seg.dataset.view;
      this.shadowRoot.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("on", b === seg));
      this._pinned = null;
      this._renderYears(this._yearsAvailable());
      this._drawChart();
      return;
    }
    const yr = e.target.closest("[data-year]");
    if (yr) {
      const y = Number(yr.dataset.year);
      if (this._sel.has(y)) { if (this._sel.size > 1) this._sel.delete(y); } else this._sel.add(y);
      this._pinned = null;
      this._renderYears(this._yearsAvailable());
      this._drawChart();
    }
  }

  _drawChart() {
    const host = this._ref("chart");
    if (!this._data || !host.isConnected) return;
    if (this._heat) { this._drawHeat(host); return; }
    const years = this._yearsAvailable();
    if (!years.length) return;
    const w = Math.max(280, Math.round(host.clientWidth || 600));
    const h = w < 520 ? 240 : 290;
    const pad = { l: 52, r: 6, t: 20, b: 26 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const now = new Date();
    const cy = now.getFullYear();
    const month = this._view === "month";
    const sel = month ? [...this._sel].sort((a, b) => a - b) : years;
    const groups = month ? 12 : years.length;
    const values = month
      ? Array.from({ length: 12 }, (_, m) => sel.map((y) => ({ y, ...(this._data.years[y]?.[m] || { v: null }) })))
      : years.map((y) => { const t = sumYear(this._data.years[y]); return [{ y, ...(t || { v: null }), partial: y === cy }]; });
    const max = niceMax(Math.max(1, ...values.flat().map((x) => x.v || 0)) * 1.08);
    const gw = pw / groups;
    const per = values[0].length;
    const bw = Math.max(3, Math.min(34, (gw * 0.78) / per));
    const y = (v) => pad.t + ph - (v / max) * ph;
    let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${month ? "Elforbrug i kr pr. måned" : "Elforbrug i kr pr. år"}">`;
    s += `<defs><pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="none"/><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="2" opacity=".5"/></pattern></defs>`;
    s += `<g class="grid axis">`;
    for (let i = 0; i <= 4; i++) {
      const gv = (max / 4) * i;
      const gy = y(gv);
      s += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${gy}" y2="${gy}"/><text x="${pad.l - 8}" y="${gy + 4}" text-anchor="end">${fmt(gv)}</text>`;
    }
    s += `</g><g class="axis">`;
    for (let g = 0; g < groups; g++) {
      const cx = pad.l + gw * g + gw / 2;
      const label = month ? MONTHS[g] : `${years[g]}${years[g] === cy ? "*" : ""}`;
      s += `<text x="${cx}" y="${h - 7}" text-anchor="middle">${label}</text>`;
    }
    s += `</g>`;
    for (let g = 0; g < groups; g++) {
      const x0 = pad.l + gw * g + (gw - bw * per) / 2;
      values[g].forEach((d, i) => {
        if (d.v == null) return;
        const col = this._color(d.y);
        const x = x0 + i * bw;
        const bwx = (bw - 2).toFixed(1);
        // Stablet: faktureret (fuld) nederst, så målt (skraveret) og anslået (lys + skraveret)
        let base = 0;
        const open = month && d.partial; // kun den igangværende måned er foreløbig; året har "*" ved navnet
        for (const [k, op, hatch] of [["bill", open ? 0.55 : 1, open], ["measured", 0.8, true], ["estimate", 0.4, true]]) {
          const v = d[k] || 0;
          if (!(v > 0)) continue;
          const top = y(base + v);
          const bh = Math.max(1, (v / max) * ph);
          s += `<rect class="bar" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bwx}" height="${bh.toFixed(1)}" rx="3" style="fill:${col};color:${col};opacity:${op}"/>`;
          if (hatch) s += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bwx}" height="${bh.toFixed(1)}" rx="3" fill="url(#hatch)" style="color:var(--ec-text)" opacity="${k === "estimate" ? 0.5 : 0.35}"/>`;
          base += v;
        }
        if (!month || (per === 1 && gw > 44)) s += `<text class="vlabel" x="${(x + (bw - 2) / 2).toFixed(1)}" y="${(y(d.v) - 6).toFixed(1)}" text-anchor="middle">${fmt(d.v)}</text>`;
      });
      s += `<rect class="hit ${this._pinned === g ? "sel" : ""}" data-g="${g}" x="${(pad.l + gw * g).toFixed(1)}" y="${pad.t}" width="${gw.toFixed(1)}" height="${ph}"/>`;
    }
    s += `</svg><div class="tip" hidden></div>`;
    host.innerHTML = s;
    host.querySelectorAll(".hit").forEach((r) => {
      const show = () => this._tip(host, Number(r.dataset.g), values, month, gw, pad);
      r.addEventListener("pointerenter", show);
      r.addEventListener("click", () => { this._pinned = this._pinned === Number(r.dataset.g) ? null : Number(r.dataset.g); show(); });
      r.addEventListener("pointerleave", () => { if (this._pinned == null) host.querySelector(".tip").hidden = true; });
    });
    if (this._pinned != null) this._tip(host, this._pinned, values, month, gw, pad);
  }

  /* ---------- Opvarmning ---------- */
  _renderHeat() {
    const { cmp, opts } = this._heat;
    this._ref("title").textContent = "Opvarmning i kr";
    this._ref("subtitle").textContent = "Naturgas og fjernvarme på samme skala";
    const kr0 = (v) => (v == null ? "–" : `${fmt(v)} kr`);
    const kr2 = (v) => (v == null ? "–" : `${fmt(v, 2)} kr`);
    const items = [];
    items.push(`<div class="hero-item tone-heat"><span class="hi-label">Pris pr. kWh varme</span><span class="hi-val num"><b>${fmt(cmp.heatPerKwh, 2)}</b><small>kr fjernvarme</small></span><span class="hi-sub">Naturgas alt inkl. <span class="d">${kr2(cmp.gasPerKwhEvida)}</span> · kun Norlys-delen ${kr2(cmp.gasPerKwh)}</span></div>`);
    const sm = cmp.same;
    if (sm) {
      const names = sm.months.map((k) => MONTHS[Number(k.slice(5)) - 1]);
      const label = names.length > 1 ? `${names[0]}–${names[names.length - 1]}` : names[0];
      const d = pct(sm.heat, sm.gas + sm.gasEvida);
      items.push(`<div class="hero-item tone-el"><span class="hi-label">Samme måneder (${label})</span><span class="hi-val num"><b>${fmt(sm.heat)}</b><small>kr fjernvarme ${sm.months[0].slice(0, 4)}</small></span><span class="hi-sub">Naturgas året før alt inkl. ${kr0(sm.gas + sm.gasEvida)} <span class="d">${fmtPct(d)}</span> (Norlys-delen ${kr0(sm.gas)})</span></div>`);
    }
    const yr = cmp.year;
    if (yr) items.push(`<div class="hero-item tone-ev"><span class="hi-label">Et helt år (varmen fra ${yr.gasYear})</span><span class="hi-val num"><b>${fmt(yr.heatNow)}</b><small>kr fjernvarme</small></span><span class="hi-sub">Fra feb. 2027: ${kr0(yr.heat2027)} · naturgassen kostede alt inkl. ${kr0(yr.gasBill + yr.gasEvida)} (Norlys ${kr0(yr.gasBill)} + Evida/afgifter ${kr0(yr.gasEvida)})</span></div>`);
    const ks = cmp.acontoMonths;
    if (ks.length) {
      const m = this._heat.months;
      const paid = ks.reduce((s, k) => s + m[k].aconto, 0), used = ks.reduce((s, k) => s + m[k].heatMeasured + m[k].heatEstimate, 0);
      const diff = paid - used;
      items.push(`<div class="hero-item ${diff >= 0 ? "tone-ok" : "tone-bad"}"><span class="hi-label">A conto mod målt (${ks.length} mdr)</span><span class="hi-val num"><b>${fmt(Math.abs(diff))}</b><small>kr ${diff >= 0 ? "tilbage" : "efterbetaling"}</small></span><span class="hi-sub">Betalt ${kr0(paid)} · målt ${kr0(used)} – ved årsopgørelsen</span></div>`);
    } else {
      items.push(`<div class="hero-item tone-muted"><span class="hi-label">A conto mod målt</span><span class="hi-val num"><b>–</b></span><span class="hi-sub">Ingen fjernvarmeregninger i Elregning endnu</span></div>`);
    }
    this._ref("kpis").innerHTML = items.join("");
    this._ref("years").innerHTML = "";
    this._ref("years").hidden = true;
    this._drawChart();
    this._ref("legend").innerHTML = `<span><i style="background:var(--c-gas)"></i>Naturgas (regning)</span><span><i class="h" style="--ec-accent:var(--c-gas)"></i>Evida + afgifter (beregnet)</span><span><i class="h" style="--ec-accent:var(--c-fv)"></i>Fjernvarme målt</span><span><i class="e" style="--ec-accent:var(--c-fv)"></i>Fjernvarme skønnet</span><span><i style="background:none;border:2px solid var(--ec-text);height:2px;border-radius:0"></i>A conto</span>`;
    this._ref("note").textContent = `Alle beløb er inkl. moms og alle afgifter og tillæg. Naturgas: Norlys-regningerne (gaspris, transmission, abonnement) + den del, Evida fakturerer selv fra maj 2023 – distribution, fast grundpris/kapacitet/måler, nødforsyningstarif og statens energi-, CO2- og NOx-afgift – beregnet ud fra officielle satser for hver periode, indtil Evidas egne regninger er lagt ind (kilder: Skattestyrelsen, Juridisk vejledning E.A.4.4.7.1, E.A.4.5.6 og E.A.7.20.6; Evida "Historiske tariffer" Evida Nord og tarifblad 01.01.2025; administrationsbidrag 2023–24 fra husets egen Evida-regning). Varmen = m³ × ${fmt(opts.kwhPerM3)} kWh × ${fmt(opts.efficiency * 100)} % kedelvirkningsgrad (antagelse). Fjernvarme: HA's varmemåler × Verdos takst inkl. moms + abonnement, m²-bidrag og konverteringstillæg pr. dag (2027-taksten fra 1. februar 2027; konverteringstillægget antaget uændret). Dagene før HA's statistik er skønnet ud fra målerstanden. Ingen graddagekorrektion – HA har ingen udetemperatur fra før 30.05.2026.`
  }

  _drawHeat(host) {
    const months = this._heat.months;
    const keys = Object.keys(months).sort();
    if (!keys.length) { host.innerHTML = `<div class="state">Ingen data</div>`; return; }
    const month = this._view === "month";
    const w = Math.max(280, Math.round(host.clientWidth || 600));
    const h = w < 520 ? 240 : 290;
    const pad = { l: 52, r: 6, t: 20, b: 26 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    let groups;
    if (month) groups = keys.map((k) => ({ k, ...months[k] }));
    else {
      const by = {};
      for (const k of keys) { const y = k.slice(0, 4); const c = months[k]; const o = by[y] || (by[y] = { k: y, gasBill: 0, gasEvida: 0, heatMeasured: 0, heatEstimate: 0, aconto: 0, partial: false }); for (const f of ["gasBill", "gasEvida", "heatMeasured", "heatEstimate", "aconto"]) o[f] += c[f]; o.partial ||= c.partial; }
      groups = Object.values(by);
    }
    groups.forEach((g) => { g.v = g.gasBill + g.gasEvida + g.heatMeasured + g.heatEstimate; });
    const max = niceMax(Math.max(1, ...groups.map((g) => Math.max(g.v, g.aconto))) * 1.08);
    const gw = pw / groups.length;
    const bw = Math.max(3, Math.min(34, gw * 0.72));
    const y = (v) => pad.t + ph - (v / max) * ph;
    let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Opvarmning i kr"><defs><pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="none"/><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="2" opacity=".5"/></pattern></defs><g class="grid axis">`;
    for (let i = 0; i <= 4; i++) { const gv = (max / 4) * i; s += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(gv)}" y2="${y(gv)}"/><text x="${pad.l - 8}" y="${y(gv) + 4}" text-anchor="end">${fmt(gv)}</text>`; }
    s += `</g><g class="axis">`;
    const every = month ? Math.max(1, Math.ceil(groups.length / (w < 520 ? 7 : 14))) : 1;
    groups.forEach((g, i) => {
      if (i % every) return;
      const label = month ? `${MONTHS[Number(g.k.slice(5)) - 1]} ${g.k.slice(2, 4)}` : `${g.k}${g.partial ? "*" : ""}`;
      s += `<text x="${pad.l + gw * i + gw / 2}" y="${h - 7}" text-anchor="middle">${label}</text>`;
    });
    s += `</g>`;
    groups.forEach((g, i) => {
      const x = pad.l + gw * i + (gw - bw) / 2;
      let base = 0;
      for (const [f, col, op, hatch] of [["gasBill", "var(--c-gas)", 1, false], ["gasEvida", "var(--c-gas)", 0.35, true], ["heatMeasured", "var(--c-fv)", 0.85, true], ["heatEstimate", "var(--c-fv)", 0.4, true]]) {
        const v = g[f]; if (!(v > 0)) continue;
        const top = y(base + v), bh = Math.max(1, (v / max) * ph);
        s += `<rect class="bar" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" style="fill:${col};color:${col};opacity:${g.partial && month ? op * 0.6 : op}"/>`;
        if (hatch) s += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="url(#hatch)" style="color:var(--ec-text)" opacity=".35"/>`;
        base += v;
      }
      if (g.aconto > 0) s += `<line x1="${(x - 2).toFixed(1)}" x2="${(x + bw + 2).toFixed(1)}" y1="${y(g.aconto).toFixed(1)}" y2="${y(g.aconto).toFixed(1)}" stroke="var(--ec-text)" stroke-width="2"/>`;
      if (!month) s += `<text class="vlabel" x="${(x + bw / 2).toFixed(1)}" y="${(y(g.v) - 6).toFixed(1)}" text-anchor="middle">${fmt(g.v)}</text>`;
      s += `<rect class="hit ${this._pinned === i ? "sel" : ""}" data-g="${i}" x="${(pad.l + gw * i).toFixed(1)}" y="${pad.t}" width="${gw.toFixed(1)}" height="${ph}"/>`;
    });
    s += `</svg><div class="tip" hidden></div>`;
    host.innerHTML = s;
    const tip = host.querySelector(".tip");
    const show = (i) => {
      const g = groups[i];
      const title = month ? `${MONTHS_LONG[Number(g.k.slice(5)) - 1]} ${g.k.slice(0, 4)}` : `${g.k}${g.partial ? " (indtil nu)" : ""}`;
      const row = (c, n, v) => (v > 0.5 ? `<div class="row" style="--yc:${c}"><i></i><span class="nm">${n}</span><span class="v num">${fmt(v)} kr</span></div>` : "");
      tip.innerHTML = `<h4>${esc(title)}</h4>${row("var(--c-gas)", "Naturgas (Norlys)", g.gasBill)}${row("var(--c-gas)", "Evida + afgifter (beregnet)", g.gasEvida)}${row("var(--c-fv)", "Fjernvarme målt", g.heatMeasured)}${row("var(--c-fv)", "Fjernvarme skønnet", g.heatEstimate)}${row("var(--ec-text)", "A conto", g.aconto)}`;
      tip.hidden = false;
      const cx = pad.l + gw * i + gw / 2, tw = tip.offsetWidth || 180;
      tip.style.left = `${Math.max(0, Math.min(host.clientWidth - tw, cx - tw / 2))}px`; tip.style.top = "0px";
    };
    host.querySelectorAll(".hit").forEach((r) => {
      const i = Number(r.dataset.g);
      r.addEventListener("pointerenter", () => show(i));
      r.addEventListener("click", () => { this._pinned = this._pinned === i ? null : i; show(i); });
      r.addEventListener("pointerleave", () => { if (this._pinned == null) tip.hidden = true; });
    });
    if (this._pinned != null && groups[this._pinned]) show(this._pinned);
  }

  _tip(host, g, values, month, gw, pad) {
    const tip = host.querySelector(".tip");
    const rows = values[g].filter((d) => d.v != null);
    if (!rows.length) { tip.hidden = true; return; }
    const title = month ? MONTHS_LONG[g] : `${rows[0].y}${rows[0].partial ? " (indtil nu)" : ""}`;
    const kinds = (d) => Object.keys(KIND).filter((k) => d[k] > 0.5).map((k) => `${KIND[k]} ${fmt(d[k])}`).join(" · ");
    tip.innerHTML = `<h4>${esc(title)}</h4>` + [...rows].reverse().map((d) => `<div class="row" style="--yc:${this._color(d.y)}"><i></i><span class="nm">${d.y}${d.partial ? "*" : ""}</span><span class="v num">${fmt(d.v)} kr</span></div>${Object.keys(KIND).filter((k) => d[k] > 0.5).length > 1 || !(d.bill > 0.5) ? `<div class="kinds">${kinds(d)}</div>` : ""}`).join("") + (rows.some((d) => d.partial) ? `<div class="note" style="margin-top:4px">* foreløbig</div>` : "");
    tip.hidden = false;
    const cx = pad.l + gw * g + gw / 2;
    const tw = tip.offsetWidth || 180;
    tip.style.left = `${Math.max(0, Math.min(host.clientWidth - tw, cx - tw / 2))}px`;
    tip.style.top = "0px";
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, HaElforbrugKrCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({ type: CARD_TAG, name: "Elforbrug i kr", description: `Elforbruget i kroner måned for måned og år for år, fra regningerne og HA's måling (v${VERSION}).`, preview: false });
}
