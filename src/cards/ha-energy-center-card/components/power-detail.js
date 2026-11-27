/*
 * Strøm-detaljer (Claude AI, 2026-11-27): nøgletal, døgnet time for time pr. gruppe med elprisen i sin egen graf
 * under (samme tidsakse), pris pr. time, grundlast, umålt forbrug og top 10 forbrugere i dag.
 *
 *  - Én y-akse pr. graf, forklaring ved 2+ serier, hover/tryk viser et skilt med værdierne.
 *  - Farverne er en fast, farveblind-tjekket rækkefølge; en gruppe beholder sin farve uanset filter.
 *  - Effekt hentes som timegennemsnit (recorder-statistik "mean"); kr og pris pr. time kommer fra
 *    hovedmålerens kWh- og kr-tællere (kr ÷ kWh = timens pris), så også gamle timer får den rigtige pris.
 *  - Data hentes først når fanen vises og fornyes hver hele time.
 */
import { HOUR_MS, addDays, escapeHtml, fmt, icon, pad2, startOfDay } from "../utils/format.js";

const PAL = {
  dark: ["#338ced", "#e76624", "#00a888", "#d28e05", "#e24d8b", "#0aac23", "#9887ef"],
  light: ["#257de0", "#f47230", "#00b894", "#f2a600", "#ee7fac", "#008a17", "#6a4ce2"],
};
const EV_COL = { dark: "#eb6263", light: "#ec4647" };
const UNM_COL = "#7d8794";
const WARN = "#fbb315";
const GOOD = "#0aac23";
const PRICE_COL = "#5a7fa8";
const PAD = { l: 46, r: 12, t: 12, b: 22 };
const RANGE_LABELS = { "24h": "24 t", "7d": "7 dage", "30d": "30 dage" };
const UNM = "Umålt";
const EV = "Billader";

/* ---------------- rene hjælpere (testes i tests/energy-center-power-detail.test.mjs) ---------------- */

/** Grupperne til grafen: billader-gruppen for sig, chart_group slår grupper sammen, for mange samles i "Øvrigt". */
export function buildSeries(groups, evEntity, { maxSeries = 7, otherName = "Øvrigt" } = {}) {
  const evIdx = groups.findIndex((g) => g.ev === true || (evEntity && g.entities.some((m) => m.entity === evEntity)));
  const ev = evIdx >= 0 ? groups[evIdx].entities.map((m) => m.entity) : evEntity ? [evEntity] : [];
  const map = new Map();
  groups.forEach((g, i) => {
    if (i === evIdx) return;
    const name = g.chart_group || g.name;
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(...g.entities.map((m) => m.entity));
  });
  let series = [...map].map(([name, entities]) => ({ name, entities }));
  if (series.length > maxSeries) {
    const other = series.find((s) => s.name === otherName) || { name: otherName, entities: [] };
    const rest = series.filter((s) => s !== other);
    const keep = rest.slice(0, maxSeries - 1);
    rest.slice(maxSeries - 1).forEach((s) => other.entities.push(...s.entities));
    series = [...keep, other];
  }
  const oi = series.findIndex((s) => s.name === otherName);
  if (oi >= 0 && oi < series.length - 1) series.push(...series.splice(oi, 1)); // "Øvrigt" altid sidst
  return { series, ev };
}

/** Statistikrækker → array med én værdi pr. time fra t0 (NaN hvor der mangler data). */
export function hourArray(rows, t0, n, field = "mean") {
  const out = new Array(n).fill(NaN);
  for (const r of rows || []) {
    const t = typeof r.start === "number" ? r.start : Date.parse(r.start);
    const i = Math.round((t - t0) / HOUR_MS);
    const v = r[field];
    if (i >= 0 && i < n && Number.isFinite(v)) out[i] = v;
  }
  return out;
}

/** Timens pris = timens kr ÷ timens kWh (kun når der er brugt lidt strøm, ellers ukendt). */
export function hourPrices(energy, cost) {
  return energy.map((e, i) => (Number.isFinite(e) && e > 0.02 && Number.isFinite(cost[i]) ? cost[i] / e : NaN));
}

/** Laveste timegennemsnit mellem 00 og 06 pr. dag. Kræver mindst 2 af de 6 nattetimer. */
export function nightBase(grid, t0, days) {
  const out = [];
  for (let d = 0; d < days; d++) {
    const dayStart = addDays(startOfDay(t0), d);
    const vals = [];
    for (let h = 0; h < 6; h++) {
      const i = Math.round((dayStart + h * HOUR_MS - t0) / HOUR_MS);
      if (i >= 0 && i < grid.length && Number.isFinite(grid[i])) vals.push(grid[i]);
    }
    out.push({ day: dayStart, w: vals.length >= 2 ? Math.min(...vals) : NaN });
  }
  return out;
}

/** Seneste kørsel (sammenhængende timer over grænsen) og hvad den havde kostet ved billigste start. */
export function shiftTip(profile, prices, hourStart, { minW = 30 } = {}) {
  let end = -1;
  for (let i = profile.length - 1; i >= 0; i--) if (profile[i] > minW) { end = i; break; }
  if (end < 0) return null;
  let start = end;
  while (start > 0 && profile[start - 1] > minW) start--;
  const run = profile.slice(start, end + 1).map((w) => w / 1000);
  const costAt = (s) => {
    let kr = 0;
    for (let k = 0; k < run.length; k++) {
      const p = prices[s + k];
      if (!Number.isFinite(p)) return NaN;
      kr += run[k] * p;
    }
    return kr;
  };
  const actual = costAt(start);
  if (!Number.isFinite(actual)) return null;
  let best = start;
  let bestKr = actual;
  for (let s = Math.max(0, prices.length - 24); s + run.length <= prices.length; s++) {
    const kr = costAt(s);
    if (Number.isFinite(kr) && kr < bestKr - 1e-9) { best = s; bestKr = kr; }
  }
  return { hour: new Date(hourStart(start)).getHours(), kr: actual, bestHour: new Date(hourStart(best)).getHours(), bestKr };
}

function scale(max, ticks = 4) {
  if (!(max > 0)) return { max: 1, step: 0.25 };
  const raw = max / ticks;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * p).find((s) => s >= raw);
  return { max: Math.ceil(max / step - 1e-9) * step, step };
}
const W_FMT = (v) => (v >= 1000 ? `${fmt(v / 1000, 1)} kW` : `${fmt(v, 0)} W`);
const KR = (v, d = 2) => `${fmt(v, d)} kr`;
const avg = (a) => {
  const v = a.filter(Number.isFinite);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
};
const sum = (a) => a.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
const hatch = (id) => `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#3a3f47"/><rect width="2.2" height="5" fill="${UNM_COL}"/></pattern>`;
const HATCH_CSS = `repeating-linear-gradient(45deg,${UNM_COL} 0 2px,#3a3f47 2px 4px)`;

/* ---------------- panel ---------------- */

export class PowerDetail {
  constructor(card) {
    this.card = card;
    this.range = "24h";
    this.withEv = false;
    this.data = null;
    this.day30 = null;
    this.token = 0;
    this.hov = {};
  }

  get cfg() {
    return this.card.config.power_detail || {};
  }

  enabled() {
    const c = this.card;
    return this.cfg.enabled !== false && c.has("grid_power") && c.config.groups.length > 0;
  }

  html() {
    const kpi = (ref, ic, label, sub) => `
      <div class="pd-kpi" data-ref="pdK${ref}">
        <span class="pd-bdg">${icon(ic)}</span>
        <div class="pd-kv"><small>${label}</small><b class="num" data-ref="pdK${ref}V">—</b></div>
        <div class="pd-ksp"><span data-ref="pdK${ref}S"></span><small data-ref="pdK${ref}N">${sub}</small></div>
      </div>`;
    const seg = (key, items, on) => `<div class="seg" data-pd-seg="${key}">${items.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === on ? "on" : ""}">${l}</button>`).join("")}</div>`;
    const head = (ic, title, subRef, sub = "") => `<div class="card-head">${icon(ic)}<div><h3>${title}</h3><small data-ref="${subRef}">${sub}</small></div></div>`;
    return `
  <div class="pd-kpis a-full" data-ref="pdKpis">
    ${kpi("Now", "mdi:flash", "Lige nu", "seneste 24 t")}
    ${kpi("Today", "mdi:cash-multiple", "I dag", "")}
    ${kpi("Price", "mdi:currency-usd", "Elpris nu", "")}
    ${kpi("Base", "mdi:weather-night", "Grundlast i nat", "30 dage")}
  </div>
  <section class="card pd-panel a-full" data-ref="pdMain">
    <div class="sect-head">
      ${head("mdi:chart-bar-stacked", "Døgnet time for time", "pdMainSub", "Forbrug pr. gruppe, og hvad strømmen kostede")}
      <div class="pd-ctr">${seg("range", Object.entries(RANGE_LABELS), this.range)}${seg("ev", [["1", "Med billader"], ["0", "Uden billader"]], this.withEv ? "1" : "0")}</div>
    </div>
    <div class="pd-legend" data-ref="pdLegend"></div>
    <div class="pd-box" data-hov="main" data-ref="pdStack"></div>
    <div class="pd-sub"><b>Elpris</b><small data-ref="pdPriceSub">kr/kWh</small></div>
    <div class="pd-box" data-hov="price" data-ref="pdPrice"></div>
    <div class="pd-tip" data-ref="pdTip" hidden>${icon("mdi:lightbulb-on-outline")}<span data-ref="pdTipT"></span></div>
    <div class="pd-empty" data-ref="pdEmpty" hidden>Henter historik …</div>
  </section>
  <div class="pd-g3 a-full" data-ref="pdG3">
    <section class="card pd-panel" data-ref="pdCostCard">${head("mdi:cash-clock", "Pris pr. time", "pdCostSub")}<div class="pd-box" data-hov="cost" data-ref="pdCost"></div></section>
    <section class="card pd-panel" data-ref="pdBaseCard">${head("mdi:weather-night", "Grundlast", "pdBaseSub")}<div class="pd-box" data-hov="base" data-ref="pdBase"></div></section>
    <section class="card pd-panel" data-ref="pdUnmCard">${head("mdi:help-circle-outline", "Umålt", "pdUnmSub", "Hovedmåler minus alle målere")}<div class="pd-box" data-hov="unm" data-ref="pdUnm"></div></section>
  </div>
  <section class="card pd-panel a-full" data-ref="pdTopCard">
    <div class="sect-head">${head("mdi:trophy-outline", "Top 10 strømforbrugere i dag", "pdTopSub", "kWh og kr siden midnat, med forløbet time for time")}<button type="button" class="pd-units" data-units>${icon("mdi:format-list-bulleted")}Pr. enhed</button></div>
    <div class="pd-top" data-ref="pdTop"></div>
  </section>`;
  }

  mount(root, refs) {
    this.root = root;
    this.refs = refs;
    this.el = refs.pdMain;
    if (!this.el) return;
    const host = this.el.parentElement;
    host.querySelectorAll("[data-pd-seg]").forEach((s) =>
      s.addEventListener("click", (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        s.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        if (s.dataset.pdSeg === "range") {
          this.range = b.dataset.v;
          if (this.range === "30d" && !this.day30) this._loadDays();
        } else this.withEv = b.dataset.v === "1";
        this.render();
      }),
    );
    this._bindHover(host);
    if (typeof ResizeObserver === "function") {
      let w = 0;
      this._ro = new ResizeObserver(() => {
        const nw = this.el.clientWidth;
        if (nw && Math.abs(nw - w) > 4) {
          w = nw;
          cancelAnimationFrame(this._raf);
          this._raf = requestAnimationFrame(() => this.render());
        }
      });
      this._ro.observe(this.el);
    }
  }

  observe() {
    if (this.el && !this.loaded && this.enabled()) this.card.observeLazy(this.el, () => this.load());
  }

  refresh() {
    if (!this.loaded) return;
    this.day30 = null;
    this.load();
    if (this.range === "30d") this._loadDays();
  }

  /* ---------- data ---------- */

  _ids() {
    const c = this.card;
    const { series, ev } = buildSeries(c.config.groups, c.id("ev_power"), this.cfg);
    this.series = series;
    this.evIds = ev;
    const all = new Set([c.id("grid_power"), ...ev]);
    series.forEach((s) => s.entities.forEach((e) => all.add(e)));
    return [...all].filter(Boolean);
  }

  async _ws(msg) {
    const hass = this.card._hass;
    if (!hass?.callWS) return null;
    try {
      return await hass.callWS(msg);
    } catch (err) {
      this.card.warnOnce?.("pd", "Strøm-detaljer: historik kunne ikke hentes", err?.message || err);
      return null;
    }
  }

  async load() {
    if (!this.enabled()) return;
    this.loaded = true;
    const token = ++this.token;
    const c = this.card;
    const ids = this._ids();
    const now = Date.now();
    const t0 = addDays(startOfDay(now), -7); // 7 hele dage + i dag, time for time
    const b0 = addDays(startOfDay(now), -29); // grundlast og snitpris: 30 døgn
    const iso = (t) => new Date(t).toISOString();
    const energyIds = [c.id("grid_energy"), c.id("grid_cost")].filter((id, i) => id && c.has(i ? "grid_cost" : "grid_energy"));
    const [power, base, money] = await Promise.all([
      this._ws({ type: "recorder/statistics_during_period", start_time: iso(t0), end_time: iso(now), statistic_ids: ids, period: "hour", types: ["mean"] }),
      this._ws({ type: "recorder/statistics_during_period", start_time: iso(b0), end_time: iso(now), statistic_ids: [c.id("grid_power")], period: "hour", types: ["mean"] }),
      energyIds.length
        ? this._ws({ type: "recorder/statistics_during_period", start_time: iso(b0), end_time: iso(now), statistic_ids: energyIds, period: "hour", types: ["change"], units: { energy: "kWh" } })
        : null,
    ]);
    if (token !== this.token) return;
    const n = Math.max(1, Math.ceil((now - t0) / HOUR_MS));
    const nb = Math.max(1, Math.ceil((now - b0) / HOUR_MS));
    const arr = (id) => hourArray(power?.[id], t0, n);
    const ent = new Map(ids.map((id) => [id, arr(id)]));
    const energy = hourArray(money?.[c.id("grid_energy")], b0, nb, "change");
    const cost = hourArray(money?.[c.id("grid_cost")], b0, nb, "change");
    const priceAll = hourPrices(energy, cost);
    this._fillFromAttr(priceAll, b0);
    const off = Math.round((t0 - b0) / HOUR_MS);
    const baseGrid = hourArray(base?.[c.id("grid_power")], b0, nb);
    const totE = sum(energy);
    const avgPrice = totE > 0 ? sum(cost) / totE : avg(priceAll);
    // Seneste hele time = sidste time med hovedmålerdata.
    const grid = ent.get(c.id("grid_power"));
    let lastIdx = n - 1;
    while (lastIdx > 0 && !Number.isFinite(grid[lastIdx])) lastIdx--;
    this.data = {
      t0, n, lastIdx, ent, grid,
      price: priceAll.slice(off, off + n),
      energy: energy.slice(off, off + n),
      cost: cost.slice(off, off + n),
      base: nightBase(baseGrid, b0, 30),
      avgPrice,
      hasMoney: energyIds.length === 2,
    };
    this.render();
  }

  /** Huller i timeprisen (ingen kr-tæller) fyldes fra prissensorens prisliste, hvis den har en. */
  _fillFromAttr(prices, t0) {
    const list = this._priceList();
    for (const [t, p] of list) {
      const i = Math.round((t - t0) / HOUR_MS);
      if (i >= 0 && i < prices.length && !Number.isFinite(prices[i])) prices[i] = p;
    }
  }

  /** Prissensorens dagspriser som [[start, kr/kWh]], samlet pr. time. Kendte formater fra de danske prisintegrationer. */
  _priceList() {
    const a = this.card.stateObj("grid_price")?.attributes || {};
    const raw = [a.prices, a.raw_today, a.raw_tomorrow, a.forecast, a.today_prices].filter(Array.isArray).flat();
    const byHour = new Map();
    for (const x of raw) {
      if (!x || typeof x !== "object") continue;
      const t = Date.parse(x.start ?? x.hour ?? x.time ?? x.datetime);
      const p = Number(x.price ?? x.value ?? x.total);
      if (!Number.isFinite(t) || !Number.isFinite(p)) continue;
      const h = Math.floor(t / HOUR_MS) * HOUR_MS;
      const e = byHour.get(h) || [0, 0];
      byHour.set(h, [e[0] + p, e[1] + 1]);
    }
    return [...byHour].sort((a, b) => a[0] - b[0]).map(([h, [s, k]]) => [h, s / k]);
  }

  async _loadDays() {
    const c = this.card;
    const ids = this._ids();
    const now = Date.now();
    const d0 = addDays(startOfDay(now), -29);
    const iso = (t) => new Date(t).toISOString();
    const token = this.token;
    const [res, money] = await Promise.all([
      this._ws({ type: "recorder/statistics_during_period", start_time: iso(d0), end_time: iso(now), statistic_ids: ids, period: "day", types: ["mean"] }),
      c.has("grid_energy") && c.has("grid_cost")
        ? this._ws({ type: "recorder/statistics_during_period", start_time: iso(d0), end_time: iso(now), statistic_ids: [c.id("grid_energy"), c.id("grid_cost")], period: "day", types: ["change"], units: { energy: "kWh" } })
        : null,
    ]);
    if (token !== this.token || !res) return;
    const days = [];
    for (let t = d0; t <= now; t = addDays(t, 1)) days.push(t);
    const at = (rows, field) => {
      const m = new Map((rows || []).map((r) => [startOfDay(typeof r.start === "number" ? r.start : Date.parse(r.start)), r[field]]));
      return days.map((d) => (Number.isFinite(m.get(d)) ? m.get(d) : NaN));
    };
    this.day30 = { days, ent: new Map(ids.map((id) => [id, at(res[id], "mean")])), energy: at(money?.[c.id("grid_energy")], "change"), cost: at(money?.[c.id("grid_cost")], "change") };
    if (this.range === "30d") this.render();
  }

  /* ---------- udregning pr. visning ---------- */

  /** Buckets for valgt periode: 24 t = 24 timer, 7 dage = 3-timers blokke, 30 dage = døgn. */
  _view() {
    const d = this.data;
    const c = this.card;
    const gridId = c.id("grid_power");
    const sumIds = (ids, get) => (k) => {
      let s = 0;
      let any = false;
      for (const id of ids) {
        const v = get(id, k);
        if (Number.isFinite(v)) { s += Math.max(v, 0); any = true; }
      }
      return any ? s : 0;
    };
    if (this.range === "30d") {
      const m = this.day30;
      if (!m) return null;
      const get = (id, b) => m.ent.get(id)?.[b.k];
      const B = m.days.map((t, k) => ({ start: t, hours: k === m.days.length - 1 ? Math.max(1, (Date.now() - t) / HOUR_MS) : 24, k }));
      return this._rows(B, get, sumIds, gridId, (b) => [m.energy[b.k], m.cost[b.k]], (t) => `${new Date(t).getDate()}/${new Date(t).getMonth() + 1}`, 7, (t) => new Date(t).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" }));
    }
    const per = this.range === "7d" ? 3 : 1;
    const end = d.lastIdx + 1;
    const startIdx = this.range === "7d" ? Math.max(0, end - 7 * 24) : Math.max(0, end - 24);
    const B = [];
    let i0 = startIdx;
    while (per > 1 && new Date(d.t0 + i0 * HOUR_MS).getHours() % per) i0++;
    for (let i = i0; i < end; i += per) {
      const idx = [];
      for (let k = Math.max(i, 0); k < Math.min(i + per, end); k++) idx.push(k);
      if (idx.length) B.push({ start: d.t0 + idx[0] * HOUR_MS, idx, hours: idx.length });
    }
    const get = (id, b) => avg(b.idx.map((k) => d.ent.get(id)?.[k]));
    const money = (b) => [sum(b.idx.map((k) => d.energy[k])), sum(b.idx.map((k) => d.cost[k])), avg(b.idx.map((k) => d.price[k]))];
    const lbl = (t) => pad2(new Date(t).getHours());
    const tip = (t, b) => {
      const s = new Date(t);
      const day = startOfDay(t) === startOfDay() ? "I dag" : startOfDay(t) === addDays(startOfDay(), -1) ? "I går" : s.toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" });
      return `${day} kl. ${pad2(s.getHours())}–${pad2((s.getHours() + b.hours) % 24)}`;
    };
    const every = this.range === "7d" ? 8 : 3;
    return this._rows(B, get, sumIds, gridId, money, this.range === "7d" ? (t) => (new Date(t).getHours() === 0 ? new Date(t).toLocaleDateString("da-DK", { weekday: "short" }).replace(".", "") : "") : lbl, every, tip);
  }

  _rows(B, get, sumIds, gridId, money, label, every, tip) {
    const evOn = this.withEv && this.evIds.length > 0;
    const keys = [...this.series.map((s) => s.name), UNM, ...(evOn ? [EV] : [])];
    const rows = B.map((b) => {
      const g = {};
      let measured = 0;
      for (const s of this.series) {
        g[s.name] = sumIds(s.entities, get)(b);
        measured += g[s.name];
      }
      const ev = sumIds(this.evIds, get)(b);
      const grid = get(gridId, b);
      g[UNM] = Number.isFinite(grid) ? Math.max(grid - measured - ev, 0) : 0;
      if (evOn) g[EV] = ev;
      const [kwh, kr, p] = money(b);
      const price = Number.isFinite(p) ? p : kwh > 0 ? kr / kwh : NaN;
      return { b, g, grid, kwh: kwh || (Number.isFinite(grid) ? (grid * b.hours) / 1000 : NaN), kr, price };
    });
    const prices = rows.map((r) => r.price).filter(Number.isFinite).sort((a, b) => a - b);
    const q75 = prices.length ? prices[Math.floor(prices.length * 0.75)] : Infinity;
    rows.forEach((r) => (r.dear = Number.isFinite(r.price) && r.price >= q75));
    return { rows, keys, label, every, tip };
  }

  _colors() {
    const mode = this.card._hass?.themes?.darkMode === false ? "light" : "dark";
    const col = {};
    this.series.forEach((s, i) => (col[s.name] = PAL[mode][i % PAL[mode].length]));
    col[UNM] = UNM_COL;
    col[EV] = EV_COL[mode];
    return col;
  }

  /* ---------- tegning ---------- */

  render() {
    if (!this.el || !this.data || !this.el.clientWidth) return;
    const r = this.refs;
    const v = this._view();
    r.pdEmpty.hidden = Boolean(v);
    if (!v) return;
    const col = this._colors();
    this.col = col;
    this.v = v;
    const mobile = this.el.clientWidth < 560;
    r.pdLegend.innerHTML = v.keys.map((k) => `<span><i style="background:${k === UNM ? HATCH_CSS : col[k]}"></i>${escapeHtml(k)}</span>`).join("") + `<span class="pd-dear"><i></i>${this.range === "30d" ? "Dyr dag" : "Dyr time"}</span>`;
    r.pdPriceSub.textContent = `kr/kWh · gule søjler er dyre ${this.range === "30d" ? "dage" : this.range === "7d" ? "perioder" : "timer"}`;
    r.pdMainSub.textContent = `Forbrug pr. gruppe, og hvad strømmen kostede · ${this.range === "24h" ? "seneste 24 timer" : this.range === "7d" ? "seneste 7 dage, pr. 3 timer" : "seneste 30 dage, pr. døgn"}`;
    r.pdStack.innerHTML = this._stack(r.pdStack.clientWidth, mobile ? 220 : 290, v, col);
    r.pdPrice.innerHTML = this._price(r.pdPrice.clientWidth, mobile ? 90 : 104, v);
    this._renderTip();
    this._renderCards(mobile);
    this._renderKpiSparks();
  }

  _x(w, n) {
    const bw = (w - PAD.l - PAD.r) / n;
    return { bw, x0: (i) => PAD.l + i * bw, cx: (i) => PAD.l + (i + 0.5) * bw };
  }

  _axis(w, h, max, step, f) {
    let s = "";
    for (let v = 0; v <= max + 1e-9; v += step) {
      const y = h - PAD.b - ((h - PAD.t - PAD.b) * v) / max;
      s += `<line x1="${PAD.l}" x2="${w - PAD.r}" y1="${y}" y2="${y}" class="${v ? "pd-grid" : "pd-base"}"/><text x="${PAD.l - 7}" y="${y + 4}" text-anchor="end" class="pd-ax">${f(v)}</text>`;
    }
    return s;
  }

  _xlabels(w, h, v) {
    const X = this._x(w, v.rows.length);
    const minGap = 34;
    let last = -Infinity;
    let s = "";
    v.rows.forEach((r, i) => {
      const t = r.b.start;
      const lab = v.label(t);
      const hr = new Date(t).getHours();
      const show = this.range === "30d" ? (v.rows.length - 1 - i) % v.every === 0 : this.range === "7d" ? Boolean(lab) : hr % v.every === 0;
      if (!show || !lab || X.cx(i) - last < minGap) return;
      last = X.cx(i);
      s += `<text x="${X.cx(i)}" y="${h - 5}" text-anchor="middle" class="pd-ax">${lab}</text>`;
    });
    return s;
  }

  _bands(w, h, v, top = PAD.t) {
    const X = this._x(w, v.rows.length);
    return v.rows.map((r, i) => (r.dear ? `<rect x="${X.x0(i)}" y="${top}" width="${X.bw}" height="${h - PAD.b - top}" class="pd-band"/>` : "")).join("");
  }

  _stack(w, h, v, col) {
    const n = v.rows.length;
    const X = this._x(w, n);
    const tot = v.rows.map((r) => v.keys.reduce((s, k) => s + (r.g[k] || 0), 0));
    const { max, step } = scale(Math.max(1, ...tot) * 1.04);
    const Y = (x) => h - PAD.b - ((h - PAD.t - PAD.b) * x) / max;
    let s = `<svg width="${w}" height="${h}" role="img" aria-label="Forbrug pr. gruppe"><defs>${hatch("pdh")}</defs>${this._bands(w, h, v)}${this._axis(w, h, max, step, W_FMT)}`;
    const bw = Math.max(1, X.bw * (n > 60 ? 0.8 : 0.68));
    v.rows.forEach((r, i) => {
      let cum = 0;
      v.keys.forEach((k, j) => {
        const val = r.g[k] || 0;
        if (val <= 0) return;
        const y0 = Y(cum);
        const y1 = Y(cum + val);
        cum += val;
        const hh = y0 - y1 - (j ? 1 : 0); // 1px luft mellem stablede felter
        if (hh < 0.6) return;
        s += `<rect x="${X.cx(i) - bw / 2}" y="${y1}" width="${bw}" height="${hh}" rx="${Math.min(2, bw / 3)}" fill="${k === UNM ? "url(#pdh)" : col[k]}"/>`;
      });
    });
    this.hov.main = { n, w, render: (i) => this._mainTip(v, i, col), y: (i) => Y(tot[i]) / h };
    return `${s}${this._xlabels(w, h, v)}</svg>`;
  }

  _mainTip(v, i, col) {
    const r = v.rows[i];
    const lines = [...v.keys].reverse().filter((k) => (r.g[k] || 0) >= 1);
    const sw = (k) => `<i style="background:${k === UNM ? HATCH_CSS : col[k]}"></i>`;
    return `<h6>${escapeHtml(v.tip(r.b.start, r.b))}</h6>${lines.map((k) => `<div class="r"><span>${sw(k)}${escapeHtml(k)}</span><b>${W_FMT(r.g[k])}</b></div>`).join("")}
      <div class="r tot"><span>I alt${Number.isFinite(r.kwh) ? ` · ${fmt(r.kwh, r.kwh >= 10 ? 0 : 2)} kWh` : ""}</span><span>${Number.isFinite(r.kr) && r.kr ? KR(r.kr) : ""}</span></div>
      ${Number.isFinite(r.price) ? `<div class="r"><span>Pris${r.dear ? " · dyr" : ""}</span><span>${fmt(r.price, 2)} kr/kWh</span></div>` : ""}`;
  }

  _price(w, h, v) {
    const n = v.rows.length;
    const X = this._x(w, n);
    const ps = v.rows.map((r) => r.price);
    const valid = ps.filter(Number.isFinite);
    if (!valid.length) return `<div class="pd-none">Ingen prisdata</div>`;
    const { max, step } = scale(Math.max(...valid) * 1.1, 3);
    const Y = (x) => h - PAD.b - ((h - PAD.t - PAD.b) * x) / max;
    let s = `<svg width="${w}" height="${h}" role="img" aria-label="Elpris">${this._bands(w, h, v, 2)}${this._axis(w, h, max, step, (x) => `${fmt(x, x % 1 ? 1 : 0)} kr`)}`;
    const bw = Math.max(1, X.bw * (n > 60 ? 0.8 : 0.68));
    const lo = Math.min(...valid);
    const hi = Math.max(...valid);
    let loI = -1;
    let hiI = -1;
    v.rows.forEach((r, i) => {
      if (!Number.isFinite(r.price)) return;
      s += `<rect x="${X.cx(i) - bw / 2}" y="${Y(r.price)}" width="${bw}" height="${Math.max(0, Y(0) - Y(r.price))}" rx="${Math.min(2, bw / 3)}" fill="${r.dear ? WARN : PRICE_COL}" opacity="${r.dear ? 0.95 : 0.8}"/>`;
      if (r.price === lo && loI < 0) loI = i;
      if (r.price === hi && hiI < 0) hiI = i;
    });
    const mark = (i, c, txt, below) => {
      const x = Math.min(Math.max(X.cx(i), PAD.l + 30), w - PAD.r - 30);
      return `<circle cx="${X.cx(i)}" cy="${Y(ps[i])}" r="4" fill="${c}" class="pd-ring"/><text x="${x}" y="${below ? Y(ps[i]) + 15 : Y(ps[i]) - 8}" text-anchor="middle" class="pd-lab">${txt} ${fmt(ps[i], 2)}</text>`;
    };
    if (hiI >= 0) s += mark(hiI, WARN, "Dyrest", false);
    if (loI >= 0 && loI !== hiI) s += mark(loI, GOOD, "Billigst", Y(lo) < h - PAD.b - 20);
    this.hov.price = { n, w, render: (i) => (Number.isFinite(ps[i]) ? `<h6>${escapeHtml(v.tip(v.rows[i].b.start, v.rows[i].b))}</h6><div class="r"><span>Elpris${v.rows[i].dear ? " · dyr" : ""}</span><b>${fmt(ps[i], 2)} kr/kWh</b></div>` : ""), y: (i) => (Number.isFinite(ps[i]) ? Y(ps[i]) / h : null) };
    return `${s}${this._xlabels(w, h, v)}</svg>`;
  }

  _renderTip() {
    const d = this.data;
    const r = this.refs;
    const v = this._view24();
    const parts = [];
    const list = this.cfg.shiftable || [];
    let best = null;
    const end = d.lastIdx + 1;
    const from = Math.max(0, end - 48);
    const prices = d.price.slice(from, end);
    for (const item of list) {
      const id = typeof item === "string" ? item : item.entity;
      const prof = (d.ent.get(id) || this._extra(id))?.slice(from, end);
      if (!prof) continue;
      const t = shiftTip(prof, prices, (k) => d.t0 + (from + k) * HOUR_MS);
      if (t && t.kr - t.bestKr >= 0.2 && (!best || t.kr - t.bestKr > best.kr - best.bestKr)) best = { ...t, name: (typeof item === "object" && item.name) || this.card._hass?.states?.[id]?.attributes?.friendly_name || id };
    }
    if (best) parts.push(`${escapeHtml(best.name)} kl. ${pad2(best.hour)} kostede <b>${KR(best.kr)}</b> – kl. ${pad2(best.bestHour)} havde den kostet <b>${KR(best.bestKr)}</b>.`);
    if (v) {
      const rows = v.rows.filter((x) => Number.isFinite(x.price));
      if (rows.length) {
        const hi = rows.reduce((a, b) => (b.price > a.price ? b : a));
        const lo = rows.reduce((a, b) => (b.price < a.price ? b : a));
        parts.push(`Dyreste time det seneste døgn var kl. ${pad2(new Date(hi.b.start).getHours())} (${fmt(hi.price, 2)} kr), billigste kl. ${pad2(new Date(lo.b.start).getHours())} (${fmt(lo.price, 2)} kr).`);
      }
    }
    r.pdTip.hidden = !parts.length;
    r.pdTipT.innerHTML = parts.join(" ");
  }

  /** Udstyr i "shiftable", der ikke er i nogen gruppe, hentes ikke; så er der intet tip for det. */
  _extra() {
    return null;
  }

  _view24() {
    if (this.range === "24h") return this.v;
    const keep = this.range;
    this.range = "24h";
    const v = this._view();
    this.range = keep;
    return v;
  }

  _renderCards(mobile) {
    const d = this.data;
    const r = this.refs;
    const v = this._view24();
    const ch = mobile ? 170 : 200;
    // Pris pr. time (seneste 24 t)
    const show = (ref, on) => (r[ref].hidden = !on);
    show("pdCostCard", d.hasMoney);
    const todayKr = this.card.today("grid_cost", "monetary");
    r.pdCostSub.textContent = `Forbrug × timepris · seneste 24 timer${Number.isFinite(todayKr) ? ` · i dag ${KR(todayKr)}` : ""}`;
    if (d.hasMoney && v) {
      const w = r.pdCost.clientWidth;
      const kr = v.rows.map((x) => x.kr);
      const { max, step } = scale(Math.max(0.1, ...kr.filter(Number.isFinite)) * 1.12, 4);
      const X = this._x(w, kr.length);
      const Y = (x) => ch - PAD.b - ((ch - PAD.t - PAD.b) * x) / max;
      let s = `<svg width="${w}" height="${ch}" role="img" aria-label="Pris pr. time">${this._axis(w, ch, max, step, (x) => `${fmt(x, x % 1 ? 1 : 0)} kr`)}`;
      let mi = 0;
      kr.forEach((x, i) => {
        if (!Number.isFinite(x)) return;
        if (x > kr[mi] || !Number.isFinite(kr[mi])) mi = i;
        s += `<rect x="${X.x0(i) + X.bw * 0.14}" y="${Y(x)}" width="${X.bw * 0.72}" height="${Math.max(0, Y(0) - Y(x))}" rx="2" fill="${v.rows[i].dear ? WARN : this.col[this.series[0]?.name] || "#338ced"}"/>`;
      });
      if (Number.isFinite(kr[mi])) s += `<text x="${Math.min(Math.max(X.cx(mi), PAD.l + 24), w - PAD.r - 24)}" y="${Y(kr[mi]) - 6}" text-anchor="middle" class="pd-lab">${KR(kr[mi])}</text>`;
      r.pdCost.innerHTML = `${s}${this._xlabels(w, ch, { ...v, every: 6 })}</svg><div class="pd-legend sm"><span><i style="background:${this.col[this.series[0]?.name] || "#338ced"}"></i>Almindelig time</span><span><i style="background:${WARN}"></i>Dyr time</span></div>`;
      this.hov.cost = { n: kr.length, w, render: (i) => (Number.isFinite(kr[i]) ? `<h6>${escapeHtml(v.tip(v.rows[i].b.start, v.rows[i].b))}</h6><div class="r"><span>Kostede</span><b>${KR(kr[i])}</b></div><div class="r"><span>Forbrug</span><span>${fmt(v.rows[i].kwh, 2)} kWh</span></div>${Number.isFinite(v.rows[i].price) ? `<div class="r"><span>Pris</span><span>${fmt(v.rows[i].price, 2)} kr/kWh</span></div>` : ""}` : ""), y: (i) => (Number.isFinite(kr[i]) ? Y(kr[i]) / ch : null) };
    }
    // Grundlast (30 nætter)
    const base = d.base;
    const bv = base.map((b) => b.w);
    const lastB = [...base].reverse().find((b) => Number.isFinite(b.w));
    const bAvg = avg(bv);
    if (lastB) {
      const yearKwh = lastB.w * 8.76;
      r.pdBaseSub.textContent = `${fmt(lastB.w, 0)} W i nat ≈ ${fmt(Math.round(yearKwh / 100) * 100, 0)} kWh${Number.isFinite(d.avgPrice) ? ` og ${fmt(Math.round((yearKwh * d.avgPrice) / 100) * 100, 0)} kr` : ""} om året`;
    } else r.pdBaseSub.textContent = "Ingen nattedata endnu";
    {
      const w = r.pdBase.clientWidth;
      const n = base.length;
      const { max, step } = scale(Math.max(1, ...bv.filter(Number.isFinite)) * 1.12, 3);
      const X = this._x(w, n);
      const Y = (x) => ch - PAD.b - ((ch - PAD.t - PAD.b) * x) / max;
      let s = `<svg width="${w}" height="${ch}" role="img" aria-label="Grundlast">${this._axis(w, ch, max, step, W_FMT)}`;
      const bc = this.col[this.series[0]?.name] || "#338ced";
      base.forEach((b, i) => {
        if (!Number.isFinite(b.w)) return;
        const last = b === lastB;
        s += `<rect x="${X.x0(i) + X.bw * 0.18}" y="${Y(b.w)}" width="${X.bw * 0.64}" height="${Math.max(0, Y(0) - Y(b.w))}" rx="2" fill="${bc}" opacity="${last ? 1 : 0.5}"/>`;
        if (i % 7 === (n - 1) % 7 || last) s += `<text x="${X.cx(i)}" y="${ch - 5}" text-anchor="middle" class="pd-ax">${last ? "i nat" : `${new Date(b.day).getDate()}/${new Date(b.day).getMonth() + 1}`}</text>`;
      });
      if (Number.isFinite(bAvg)) s += `<line x1="${PAD.l}" x2="${w - PAD.r}" y1="${Y(bAvg)}" y2="${Y(bAvg)}" class="pd-avg"/><text x="${PAD.l + 4}" y="${Y(bAvg) - 6}" class="pd-lab dim">snit ${fmt(bAvg, 0)} W</text>`;
      r.pdBase.innerHTML = `${s}</svg>`;
      this.hov.base = { n, w, render: (i) => (Number.isFinite(bv[i]) ? `<h6>Natten til ${new Date(base[i].day).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" })}</h6><div class="r"><span>Laveste time</span><b>${fmt(bv[i], 0)} W</b></div><div class="r"><span>Svarer til</span><span>${fmt(Math.round(bv[i] * 8.76), 0)} kWh/år</span></div>` : ""), y: (i) => (Number.isFinite(bv[i]) ? Y(bv[i]) / ch : null) };
    }
    // Umålt (seneste 24 t)
    if (v) {
      const w = r.pdUnm.clientWidth;
      const um = v.rows.map((x) => (Number.isFinite(x.grid) ? x.g[UNM] : NaN));
      const n = um.length;
      const uAvg = avg(um);
      r.pdUnmSub.textContent = `Hovedmåler minus alle målere${Number.isFinite(uAvg) ? ` · snit ${fmt(uAvg, 0)} W` : ""}`;
      const { max, step } = scale(Math.max(1, ...um.filter(Number.isFinite)) * 1.2, 3);
      const X = this._x(w, n);
      const Y = (x) => ch - PAD.b - ((ch - PAD.t - PAD.b) * x) / max;
      const pts = [];
      um.forEach((x, i) => Number.isFinite(x) && pts.push([i === 0 ? PAD.l : i === n - 1 ? w - PAD.r : X.cx(i), Y(x)]));
      let s = `<svg width="${w}" height="${ch}" role="img" aria-label="Umålt forbrug"><defs><linearGradient id="pdug" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#aab4c2" stop-opacity=".35"/><stop offset="1" stop-color="#aab4c2" stop-opacity="0"/></linearGradient></defs>${this._axis(w, ch, max, step, W_FMT)}`;
      if (pts.length > 1) {
        const line = pts.map((p) => p.join(",")).join("L");
        s += `<path d="M${line}L${pts[pts.length - 1][0]},${Y(0)}L${pts[0][0]},${Y(0)}Z" fill="url(#pdug)"/><path d="M${line}" class="pd-line"/>`;
        const mi = um.reduce((a, x, i) => (Number.isFinite(x) && (a < 0 || x > um[a]) ? i : a), -1);
        if (Number.isFinite(uAvg)) s += `<line x1="${PAD.l}" x2="${w - PAD.r}" y1="${Y(uAvg)}" y2="${Y(uAvg)}" class="pd-avg"/>`;
        if (mi >= 0) s += `<circle cx="${X.cx(mi)}" cy="${Y(um[mi])}" r="4" class="pd-dot"/><text x="${Math.min(Math.max(X.cx(mi), PAD.l + 40), w - PAD.r - 40)}" y="${Y(um[mi]) - 8}" text-anchor="middle" class="pd-lab">${W_FMT(um[mi])} kl. ${pad2(new Date(v.rows[mi].b.start).getHours())}</text>`;
      }
      r.pdUnm.innerHTML = `${s}${this._xlabels(w, ch, { ...v, every: 6 })}</svg>`;
      this.hov.unm = { n, w, render: (i) => (Number.isFinite(um[i]) ? `<h6>${escapeHtml(v.tip(v.rows[i].b.start, v.rows[i].b))}</h6><div class="r"><span>Umålt</span><b>${W_FMT(um[i])}</b></div><div class="r"><span>Hovedmåler</span><span>${W_FMT(v.rows[i].grid)}</span></div>` : ""), y: (i) => (Number.isFinite(um[i]) ? Y(um[i]) / ch : null) };
    }
    this._renderTop();
  }

  _renderTop() {
    const d = this.data;
    const c = this.card;
    const sod = startOfDay();
    const i0 = Math.max(0, Math.round((sod - d.t0) / HOUR_MS));
    const end = d.lastIdx + 1;
    const names = new Map();
    const col = new Map();
    c.config.groups.forEach((g) => g.entities.forEach((m) => names.set(m.entity, m.name)));
    this.series.forEach((s) => s.entities.forEach((e) => col.set(e, this.col[s.name])));
    this.evIds.forEach((e) => col.set(e, this.col[EV]));
    const items = [];
    for (const [id, a] of d.ent) {
      if (id === c.id("grid_power")) continue;
      const hours = a.slice(i0, end).map((x) => (Number.isFinite(x) ? Math.max(x, 0) : 0));
      const kwh = sum(hours) / 1000;
      if (!(kwh > 0.005)) continue;
      const kr = hours.reduce((s, x, k) => s + (x / 1000) * (Number.isFinite(d.price[i0 + k]) ? d.price[i0 + k] : 0), 0);
      items.push({ id, name: names.get(id) || c._hass?.states?.[id]?.attributes?.friendly_name || id, kwh, kr, hours, color: col.get(id) || UNM_COL });
    }
    items.sort((a, b) => b.kwh - a.kwh);
    this.todayMap = new Map(items.map((t) => [t.id, { kwh: t.kwh, kr: d.hasMoney ? t.kr : NaN }]));
    const top = items.slice(0, 10);
    const r = this.refs;
    r.pdTopSub.textContent = end - i0 > 0 ? `kWh og kr siden midnat (hele timer), med forløbet time for time` : "Ingen hele timer i dag endnu";
    r.pdTop.innerHTML = top
      .map((t, i) => `<button type="button" class="pd-row clickable" data-entity="${escapeHtml(t.id)}"><span class="rk">${i + 1}</span><span class="nm"><i style="background:${t.color}"></i>${escapeHtml(t.name)}</span><span class="sp">${this._spark(t.hours, t.color, 120, 24)}</span><span class="v num">${fmt(t.kwh, 2)} kWh</span><span class="k num">${d.hasMoney || Number.isFinite(d.price[i0]) ? KR(t.kr) : ""}</span></button>`)
      .join("");
    r.pdTop.style.setProperty("--rows", String(Math.ceil(top.length / 2)));
  }

  _spark(a, c, w, h) {
    if (a.length < 2) return "";
    const mx = Math.max(...a);
    const mn = Math.min(...a);
    const rg = Math.max(mx - mn, mx * 0.15, 1);
    const pts = a.map((v, i) => `${((i / (a.length - 1)) * w).toFixed(1)},${(h - 3 - ((h - 6) * (v - mn)) / rg).toFixed(1)}`);
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="M0,${h - 1}L${pts.join("L")}L${w},${h - 1}Z" fill="${c}" opacity=".13"/><path d="M${pts.join("L")}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }

  _renderKpiSparks() {
    const d = this.data;
    const r = this.refs;
    if (!d) return;
    const end = d.lastIdx + 1;
    const g24 = d.grid.slice(Math.max(0, end - 24), end).filter(Number.isFinite);
    const sod = startOfDay();
    const i0 = Math.max(0, Math.round((sod - d.t0) / HOUR_MS));
    let cum = 0;
    const cumKr = d.cost.slice(i0, end).map((x) => (cum += Number.isFinite(x) ? x : 0));
    const list = this._priceList().filter(([t]) => t >= sod && t < addDays(sod, 1)).map(([, p]) => p);
    const prices = list.length >= 6 ? list : d.price.slice(Math.max(0, end - 24), end).filter(Number.isFinite);
    const base = d.base.map((b) => b.w).filter(Number.isFinite);
    const set = (k, a, c, note) => {
      r[`pdK${k}S`].innerHTML = this._spark(a, c, 104, 28);
      if (note !== undefined) r[`pdK${k}N`].textContent = note;
    };
    set("Now", g24, "#5fb4ff");
    set("Today", cumKr, WARN);
    set("Price", prices, "#5fb4ff", list.length >= 6 ? "døgnets priser" : "seneste 24 t");
    set("Base", base, GOOD);
    const lastB = [...d.base].reverse().find((b) => Number.isFinite(b.w));
    this.baseNow = lastB?.w;
    this.updateKpis();
  }

  /** Live-tal i nøgletallene (kaldes ved hver statusændring). */
  updateKpis() {
    const c = this.card;
    const r = this.refs;
    if (!r?.pdKNowV) return;
    const w = c.watts("grid_power");
    const set = (ref, html) => {
      if (r[ref].__v !== html) {
        r[ref].__v = html;
        r[ref].innerHTML = html;
      }
    };
    set("pdKNowV", Number.isFinite(w) ? (w >= 10000 ? `${fmt(w / 1000, 1)}<u>kW</u>` : `${fmt(w, 0)}<u>W</u>`) : "—");
    const kr = c.today("grid_cost", "monetary");
    const kwh = c.today("grid_energy", "energy");
    set("pdKTodayV", Number.isFinite(kr) ? `${fmt(kr, 2)}<u>kr</u>` : Number.isFinite(kwh) ? `${fmt(kwh, 1)}<u>kWh</u>` : "—");
    r.pdKTodayN.textContent = Number.isFinite(kr) && Number.isFinite(kwh) ? `${fmt(kwh, 1)} kWh` : "";
    const p = c.num("grid_price");
    set("pdKPriceV", Number.isFinite(p) ? `${fmt(p, 2)}<u>kr/kWh</u>` : "—");
    set("pdKBaseV", Number.isFinite(this.baseNow) ? `${fmt(this.baseNow, 0)}<u>W</u>` : "—");
    r.pdKPrice.hidden = !c.has("grid_price");
    r.pdKToday.hidden = !c.has("grid_cost") && !c.has("grid_energy");
  }

  /* ---------- hover / tryk ---------- */

  _bindHover(host) {
    const tip = document.createElement("div");
    tip.className = "pd-hover";
    tip.hidden = true;
    const line = document.createElement("i");
    line.className = "pd-cross";
    line.hidden = true;
    let hideT;
    const hide = () => {
      tip.hidden = true;
      line.hidden = true;
    };
    const move = (ev) => {
      const box = ev.target.closest?.("[data-hov]");
      const h = box && this.hov[box.dataset.hov];
      if (!h) return hide();
      const rect = box.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const plotW = h.w - PAD.l - PAD.r;
      const i = Math.floor(((x - PAD.l) / plotW) * h.n);
      if (i < 0 || i >= h.n) return hide();
      const html = h.render(i);
      if (!html) return hide();
      if (tip.parentElement !== box) box.append(tip, line);
      tip.innerHTML = html;
      tip.hidden = false;
      line.hidden = false;
      const cx = PAD.l + ((i + 0.5) * plotW) / h.n;
      line.style.left = `${cx}px`;
      const tw = tip.offsetWidth;
      const left = cx + 14 + tw > rect.width ? cx - 14 - tw : cx + 14;
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = "6px";
      if (ev.pointerType === "touch") {
        clearTimeout(hideT);
        hideT = setTimeout(hide, 3500);
      }
    };
    host.addEventListener("pointermove", (ev) => ev.pointerType !== "touch" && move(ev));
    host.addEventListener("pointerdown", (ev) => ev.pointerType === "touch" && move(ev));
    host.addEventListener("pointerleave", hide);
  }
}

export const POWER_DETAIL_STYLE = `
.pd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--gap)}
.pd-kpi{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px;border-radius:15px;background:var(--ect-surface);box-shadow:var(--ect-shadow);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid color-mix(in srgb,var(--c-el) 78%,transparent);min-width:0}
.pd-kpi[hidden]{display:none}
.pd-bdg{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;color:var(--ec-accent);background:color-mix(in srgb,var(--ec-accent) 12%,transparent);border:1px solid color-mix(in srgb,var(--ec-accent) 26%,transparent)}
.pd-kv{min-width:0}.pd-kv small{display:block;font-size:12px;color:var(--ec-muted);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pd-kv b{display:block;font-size:23px;font-weight:700;line-height:1.15;color:var(--ec-text);white-space:nowrap}.pd-kv b u{text-decoration:none;font-size:13px;color:var(--ec-muted);font-weight:600;margin-left:3px}
.pd-ksp{display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0}.pd-ksp small{font-size:10.5px;color:var(--ec-muted);white-space:nowrap}
.pd-panel{padding:16px;border-radius:15px;background:var(--ect-surface);box-shadow:var(--ect-shadow)}
.pd-panel[hidden]{display:none}
.pd-panel .sect-head{margin-bottom:8px}
.pd-panel .card-head .ic{color:var(--ec-accent)}
.pd-ctr{display:flex;gap:8px;flex-wrap:wrap}.pd-ctr .seg{--tone:var(--ec-accent)}
.pd-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--ec-text);opacity:.9;margin:0 0 6px}
.pd-legend span{display:inline-flex;align-items:center;gap:6px}.pd-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
.pd-legend .pd-dear i{width:14px;background:color-mix(in srgb,${WARN} 22%,transparent);border:1px solid color-mix(in srgb,${WARN} 50%,transparent)}
.pd-legend.sm{margin:6px 0 0;font-size:11.5px}
.pd-box{position:relative;min-height:40px;touch-action:pan-y}
.pd-box svg{display:block;overflow:visible}
.pd-sub{display:flex;gap:8px;align-items:baseline;margin:10px 0 2px;font-size:13.5px}.pd-sub small{color:var(--ec-muted);font-size:12px}
.pd-ax{font-size:11px;fill:var(--ec-muted)}
.pd-grid{stroke:color-mix(in srgb,var(--ec-text) 7%,transparent)}.pd-base{stroke:color-mix(in srgb,var(--ec-text) 18%,transparent)}
.pd-band{fill:color-mix(in srgb,${WARN} 8%,transparent)}
.pd-lab{font-size:11px;font-weight:700;fill:var(--ec-text)}.pd-lab.dim{font-weight:500;opacity:.85}
.pd-ring{stroke:var(--ec-popup);stroke-width:2}
.pd-dot{fill:var(--ec-text);stroke:var(--ec-popup);stroke-width:2}
.pd-avg{stroke:var(--ec-text);stroke-dasharray:4 4;opacity:.45}
.pd-line{fill:none;stroke:#c3ccd8;stroke-width:2;stroke-linejoin:round}
.pd-tip{display:flex;gap:10px;align-items:center;margin-top:10px;padding:9px 12px;border-radius:12px;font-size:12.5px;color:var(--ec-text);background:color-mix(in srgb,var(--ec-accent) 7%,transparent);border:1px solid color-mix(in srgb,var(--ec-accent) 22%,transparent)}
.pd-tip[hidden]{display:none}.pd-tip .ic{color:var(--ec-accent);flex:none}
.pd-empty,.pd-none{font-size:12.5px;color:var(--ec-muted);padding:10px 0}
.pd-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--gap)}
.pd-g3 .card-head{margin-bottom:8px}
.pd-top{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(var(--rows,5),auto);grid-auto-flow:column;column-gap:34px;margin-top:6px}
.pd-row{display:grid;grid-template-columns:20px minmax(0,1fr) 120px 74px 62px;gap:10px;align-items:center;padding:6px 2px;font-size:13px;border-bottom:1px solid color-mix(in srgb,var(--ec-text) 6%,transparent);border-radius:0;text-align:left}
.pd-row:hover{background:var(--ec-surface-2)}
.pd-row .rk{color:var(--ec-muted);font-size:12px;text-align:right}.pd-row .nm{display:flex;gap:8px;align-items:center;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pd-row .nm i{width:8px;height:8px;border-radius:50%;flex:none}.pd-row .v{text-align:right;font-weight:650}.pd-row .k{text-align:right;color:var(--ec-muted)}
.pd-row .sp svg{display:block;width:120px}
.pd-hover{position:absolute;z-index:6;pointer-events:none;min-width:180px;padding:9px 11px;border-radius:12px;font-size:12px;background:color-mix(in srgb,var(--ec-popup) 96%,transparent);border:1px solid var(--ec-border-strong);box-shadow:0 12px 30px rgba(0,0,0,.45);color:var(--ec-text)}
.pd-hover[hidden],.pd-cross[hidden]{display:none}
.pd-hover h6{margin:0 0 5px;font-size:12.5px;font-weight:700}
.pd-hover .r{display:flex;justify-content:space-between;gap:14px;line-height:1.6;font-variant-numeric:tabular-nums}
.pd-hover .r span{display:flex;gap:6px;align-items:center;color:var(--ec-muted)}.pd-hover .r i{width:8px;height:8px;border-radius:2px;display:inline-block}
.pd-hover .tot{border-top:1px solid var(--ec-border);margin-top:4px;padding-top:4px;font-weight:650}.pd-hover .tot span{color:var(--ec-text)}
.pd-cross{position:absolute;top:${PAD.t}px;bottom:${PAD.b}px;width:1px;margin-left:-.5px;background:color-mix(in srgb,var(--ec-text) 50%,transparent);pointer-events:none;z-index:5}
@container (max-width:1100px){
  .pd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pd-g3{grid-template-columns:1fr 1fr}.pd-g3 > :last-child{grid-column:1/-1}
}
@container (max-width:860px){
  .pd-top{grid-template-columns:1fr;grid-auto-flow:row;grid-template-rows:none}
}
@container (max-width:600px){
  .pd-g3{grid-template-columns:1fr}
  .pd-kpi{grid-template-columns:34px minmax(0,1fr);padding:10px}.pd-ksp{display:none}.pd-bdg{width:34px;height:34px;border-radius:10px}
  .pd-kv b{font-size:19px}
  .pd-panel{padding:12px}
  .pd-row{grid-template-columns:16px minmax(0,1fr) 48px 62px 50px;gap:6px;font-size:12px}.pd-row .sp svg{width:48px}
}
`;
