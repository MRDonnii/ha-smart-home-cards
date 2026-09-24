/*
 * Historikpanel: titel + periodevælger (Dag/Uge/Måned/År) + søjlegraf.
 *
 * Data hentes først når panelet er i viewport (IntersectionObserver via kortet) eller
 * når brugeren skifter periode. Hver hentning får et token, så et langsomt svar for en
 * tidligere valgt periode aldrig overskriver den aktuelle.
 */

import { BarChart } from "./chart.js";
import {
  HOUR_MS,
  addDays,
  addMonths,
  escapeHtml,
  fmt,
  fmtDay,
  fmtKr,
  fmtMonth,
  fmtMonthShort,
  icon,
  pad2,
  startOfDay,
  startOfMonth,
} from "../utils/format.js";
import { liveTail } from "../utils/stats.js";

export const PERIOD_LABELS = { day: "Dag", week: "Uge", month: "Måned", year: "År" };

/** Buckets og hentevindue for en periode. Dag-perioden deler cache med "i dag"-tallene. */
export function periodRange(key, now = Date.now()) {
  const sod = startOfDay(now);
  const buckets = [];
  if (key === "day") {
    const end = addDays(sod, 1);
    for (let t = sod; t < end; t += HOUR_MS) {
      const h = new Date(t).getHours();
      buckets.push({ start: t, end: t + HOUR_MS, label: pad2(h), tip: `I dag kl. ${pad2(h)}–${pad2((h + 1) % 24)}` });
    }
    return { stat: "hour", fetchStart: sod - HOUR_MS, end, buckets, caption: "I dag, pr. time" };
  }
  if (key === "week" || key === "month") {
    const days = key === "week" ? 7 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const t = addDays(sod, -i);
      const label = key === "week" ? fmtDay(t).split(" ")[0].replace(".", "") : String(new Date(t).getDate());
      buckets.push({ start: t, end: addDays(t, 1), label, tip: i === 0 ? "I dag" : fmtDay(t) });
    }
    return { stat: "day", fetchStart: buckets[0].start, end: addDays(sod, 1), buckets, caption: `Seneste ${days} dage` };
  }
  const som = startOfMonth(now);
  for (let i = 11; i >= 0; i--) {
    const t = addMonths(som, -i);
    buckets.push({ start: t, end: addMonths(t, 1), label: fmtMonthShort(t), tip: fmtMonth(t) });
  }
  return { stat: "month", fetchStart: buckets[0].start, end: addMonths(som, 1), buckets, caption: "Seneste 12 måneder" };
}

/**
 * Fordeler statistikrækker i buckets.
 *  - standard: summen af `change` (tællere der vokser løbende).
 *  - `reset`:  rækkens slut-`state` (sensorer der nulstilles hver periode, fx "energi i dag" /
 *              "energi denne måned" — deres værdi ved periodens slut ER periodens forbrug).
 */
export function bucketValues(rows, buckets, reset = false) {
  const values = new Array(buckets.length).fill(undefined);
  let j = 0;
  for (const r of rows || []) {
    const v = reset ? r.state : r.change;
    if (!Number.isFinite(v)) continue;
    while (j < buckets.length && r.start >= buckets[j].end) j++;
    if (j >= buckets.length) break;
    if (r.start < buckets[j].start) continue;
    values[j] = reset ? Math.max(values[j] || 0, v) : (values[j] || 0) + v;
  }
  return values;
}

export class HistoryPanel {
  /**
   * @param card  kortet (stats, ids, live-værdier, lazy-observer)
   * @param o     { key, title, icon, tone, stat, cost?, kind: "energy"|"volume", periods, period, delta?: "reset",
   *                captions?, line?: { key, values(range) → number[], format(v) → string, label } }
   */
  constructor(card, o) {
    this.card = card;
    this.o = o;
    this.period = o.period || o.periods[0];
    this.token = 0;
    this.loaded = false;
    this.data = undefined;
  }

  html(extraClass = "") {
    const o = this.o;
    const seg =
      o.periods.length > 1
        ? `<div class="seg" role="tablist">${o.periods
          .map((p) => `<button type="button" data-period="${p}" class="${p === this.period ? "on" : ""}">${PERIOD_LABELS[p]}</button>`)
          .join("")}</div>`
        : "";
    return `
<div class="card chart-card tone-${o.tone} ${extraClass}" data-panel="${o.key}">
  <div class="chart-head">
    <div class="card-head">${icon(o.icon)}<div><h3>${escapeHtml(o.title)}</h3><small data-cap>—</small></div></div>
    ${seg}
  </div>
  <div class="chart-sum"><span class="num" data-total>—</span><span class="sum-cost" data-cost></span>${o.line ? `<span class="legend-line">${escapeHtml(o.line.label)}</span>` : ""}</div>
  <div data-chart></div>
</div>`;
  }

  mount(root) {
    this.el = root.querySelector(`[data-panel="${this.o.key}"]`);
    if (!this.el) return;
    this.capEl = this.el.querySelector("[data-cap]");
    this.totalEl = this.el.querySelector("[data-total]");
    this.costEl = this.el.querySelector("[data-cost]");
    this.chart = new BarChart(this.el.querySelector("[data-chart]"), { describe: (i) => this._describe(i) });
    this.chart.message("Henter historik…");
    this.el.querySelector(".seg")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-period]");
      if (!btn || btn.dataset.period === this.period) return;
      this.period = btn.dataset.period;
      this.el.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b === btn));
      this.load();
    });
  }

  observe() {
    if (this.el && !this.loaded) this.card.observeLazy(this.el, () => this.load());
  }

  refresh() {
    if (this.loaded) this.load();
  }

  _ids() {
    return { stat: this.card.id(this.o.stat), cost: this.o.cost ? this.card.id(this.o.cost) : undefined };
  }

  async load() {
    const token = ++this.token;
    this.loaded = true;
    const range = periodRange(this.period);
    const caption = this.o.captions?.[this.period] || range.caption;
    this.capEl.textContent = caption;
    const { stat, cost } = this._ids();
    if (!stat) {
      this.chart.message("Ingen sensor konfigureret");
      return;
    }
    if (!this.data) this.chart.message("Henter historik…");
    const rows = await this.card.stats.get([stat, cost], range.stat, range.fetchStart, range.end);
    if (token !== this.token || !this.el.isConnected) return; // forældet svar
    this.data = { range, rows: rows.get(stat) || [], costRows: cost ? rows.get(cost) || [] : undefined };
    this.data.base = bucketValues(this.data.rows, range.buckets, this.o.delta === "reset");
    this.data.costBase = this.data.costRows ? bucketValues(this.data.costRows, range.buckets) : undefined;
    this._render();
  }

  /** Indeks for den bucket "nu" ligger i (eller -1). */
  _nowIndex() {
    const now = Date.now();
    return this.data.range.buckets.findIndex((b) => now >= b.start && now < b.end);
  }

  _scale() {
    return this.o.kind === "volume" && (this.period === "day" || this.period === "week") ? 1000 : 1;
  }

  _unit() {
    if (this.o.kind === "volume") return this._scale() === 1000 ? "L" : "m³";
    return "kWh";
  }

  _withTail() {
    const d = this.data;
    const values = d.base.slice();
    const cost = d.costBase?.slice();
    const i = this._nowIndex();
    if (i >= 0) {
      const live = this.card.statLive(this.o.stat, this.o.kind);
      if (this.o.delta === "reset") {
        if (Number.isFinite(live)) values[i] = live; // periodens løbende værdi
      } else if (d.rows.length) values[i] = (values[i] || 0) + liveTail(d.rows, live);
      if (cost && d.costRows.length) cost[i] = (cost[i] || 0) + liveTail(d.costRows, this.card.statLive(this.o.cost, "monetary"));
    }
    const scale = this._scale();
    return { values: values.map((v) => (Number.isFinite(v) ? Math.max(v, 0) * scale : v)), cost, now: i };
  }

  _render() {
    const { values, cost, now } = this._withTail();
    this.current = { values, cost };
    const line = this.o.line ? { values: this.o.line.values(this.data.range), format: this.o.line.format } : undefined;
    this.current.line = line;
    this.chart.setData({ values, labels: this.data.range.buckets.map((b) => b.label), partial: now, line });
    this._renderTotals();
  }

  _renderTotals() {
    const { values, cost } = this.current;
    const has = values.some(Number.isFinite);
    const total = values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    const unit = this._unit();
    this.totalEl.textContent = has ? `${fmt(total, total >= 100 || unit === "L" ? 0 : 1)} ${unit}` : "—";
    const costTotal = cost?.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    this.costEl.textContent = cost && cost.some(Number.isFinite) ? fmtKr(costTotal) : "";
  }

  /** Live-state ændret: opdater kun den igangværende søjle + totaler. */
  onLive(changed) {
    if (!this.data) return;
    const { stat, cost } = this._ids();
    const lineId = this.o.line ? this.card.id(this.o.line.key) : undefined;
    if (lineId && changed.has(lineId)) return this._render();
    if (!changed.has(stat) && !(cost && changed.has(cost))) return;
    const { values, cost: c, now } = this._withTail();
    if (now < 0) return;
    this.current.values = values;
    this.current.cost = c;
    this.chart.setBar(now, values[now]);
    this._renderTotals();
  }

  _describe(i) {
    const b = this.data?.range.buckets[i];
    if (!b) return "";
    const v = this.current.values[i];
    const c = this.current.cost?.[i];
    const unit = this._unit();
    const digits = unit === "L" ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
    let html = `<b>${escapeHtml(b.tip)}</b><span><em>${Number.isFinite(v) ? fmt(v, digits) : "—"}</em> ${unit}</span>`;
    if (Number.isFinite(c)) html += `<span>${fmtKr(c)}</span>`;
    const lv = this.current.line?.values[i];
    if (Number.isFinite(lv)) html += `<span class="tip-line">${escapeHtml(this.o.line.format(lv))}</span>`;
    if (i === this.chart.partial) html += `<small>Igangværende</small>`;
    return html;
  }
}

