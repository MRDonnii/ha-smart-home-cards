/*
 * Søjlegraf uden afhængigheder.
 *
 *  - Søjler er <i>-elementer i et flex-layout; højden sættes med transform: scaleY (compositor).
 *  - Akser og hjælpelinjer placeres i procent → ingen pixelmåling, ingen ResizeObserver.
 *  - Valgfri sekundær linje (fx timepris) tegnes som én SVG-path med non-scaling-stroke.
 *  - Tooltip måler kun ved brugerens pointer-bevægelse.
 *  - `setData` gentegner kun hvis data reelt er ændret; `setBar` opdaterer én søjle (live-hale).
 */

import { escapeHtml, fmt } from "../utils/format.js";

const TARGET_TICKS = 4;

export function niceMax(max) {
  if (!(max > 0)) return { hi: 1, step: 0.25 };
  const raw = (max * 1.08) / TARGET_TICKS;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  return { hi: Math.ceil((max * 1.08) / step) * step, step };
}

const decimalsFor = (step) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

export class BarChart {
  /**
   * @param {HTMLElement} host
   * @param {{ describe:(i:number)=>string, lineColor?:string }} opts
   */
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.values = [];
    this.hi = 1;
    this._sig = "";
    host.classList.add("chart");
    host.innerHTML = `
      <div class="y-axis" data-y></div>
      <div class="plot" data-plot>
        <div class="grid" data-grid></div>
        <div class="bars" data-bars></div>
        <svg class="line" data-line viewBox="0 0 100 100" preserveAspectRatio="none" hidden><path/></svg>
        <div class="hover-line" hidden></div>
        <div class="tip" hidden></div>
      </div>
      <div class="y-axis right" data-y2 hidden></div>
      <div class="x-axis" data-x></div>
      <div class="chart-msg" data-msg hidden></div>`;
    this.$ = (s) => host.querySelector(`[data-${s}]`);
    this.plot = this.$("plot");
    this.barsEl = this.$("bars");
    this.tipEl = host.querySelector(".tip");
    this.hoverEl = host.querySelector(".hover-line");
    this._bindTooltip();
  }

  /** Viser en besked i stedet for data ("Henter…", "Ingen data"). */
  message(text) {
    const msg = this.$("msg");
    msg.textContent = text || "";
    msg.hidden = !text;
    this.host.classList.toggle("is-empty", Boolean(text));
  }

  /**
   * @param {{ values:(number|undefined)[], labels:string[], partial?:number, line?:{ values:(number|undefined)[], format:(v:number)=>string } }} data
   */
  setData(data) {
    const sig = JSON.stringify([data.values, data.labels, data.partial, data.line?.values]);
    if (sig === this._sig) return; // intet ændret → ingen redraw
    this._sig = sig;
    this.values = data.values.slice();
    this.labels = data.labels;
    this.partial = data.partial;
    this.line = data.line;
    const finite = this.values.filter(Number.isFinite);
    if (!finite.length) {
      this.barsEl.textContent = "";
      this.$("y").textContent = "";
      this.$("x").textContent = "";
      this.$("grid").textContent = "";
      this.$("line").setAttribute("hidden", "");
      this.$("y2").hidden = true;
      this.message("Ingen data for perioden");
      return;
    }
    this.message("");
    const { hi, step } = niceMax(Math.max(...finite, 0));
    this.hi = hi;
    this._renderAxis(hi, step);
    this._renderBars();
    this._renderLine();
  }

  /** Opdaterer én søjle (live-halen for igangværende time/dag) uden at gentegne resten. */
  setBar(i, value) {
    if (!this.barsEl.children[i] || this.values[i] === value) return;
    this.values[i] = value;
    this._sig = ""; // næste setData må gerne gentegne
    if (Number.isFinite(value) && value > this.hi) {
      const { hi, step } = niceMax(value);
      this.hi = hi;
      this._renderAxis(hi, step);
      this._renderBars();
      return;
    }
    this._styleBar(this.barsEl.children[i], value);
  }

  _renderAxis(hi, step) {
    const d = decimalsFor(step);
    let y = "";
    let grid = "";
    for (let v = 0; v <= hi + step / 2; v += step) {
      const pct = 100 - (v / hi) * 100;
      y += `<span style="top:${pct}%">${fmt(v, d)}</span>`;
      grid += `<i style="top:${pct}%"></i>`;
    }
    this.$("y").innerHTML = y;
    this.$("grid").innerHTML = grid;
    const n = this.labels.length;
    const every = n > 24 ? 5 : n > 12 ? 3 : n > 8 ? 2 : 1;
    let x = "";
    this.labels.forEach((label, i) => {
      if (i % every !== 0) return;
      x += `<span class="${i % (every * 2) ? "minor" : ""}" style="left:${((i + 0.5) / n) * 100}%">${escapeHtml(label)}</span>`;
    });
    this.$("x").innerHTML = x;
  }

  _renderBars() {
    const n = this.values.length;
    if (this.barsEl.children.length !== n) {
      this.barsEl.innerHTML = "<i></i>".repeat(n);
    }
    [...this.barsEl.children].forEach((el, i) => {
      el.classList.toggle("partial", i === this.partial);
      this._styleBar(el, this.values[i]);
    });
  }

  _styleBar(el, v) {
    const s = Number.isFinite(v) && v > 0 ? Math.max(v / this.hi, 0.012) : 0;
    el.style.transform = `scaleY(${s.toFixed(4)})`;
  }

  _renderLine() {
    const svg = this.$("line");
    const y2 = this.$("y2");
    const vals = this.line?.values || [];
    const finite = vals.filter(Number.isFinite);
    if (finite.length < 2) {
      svg.setAttribute("hidden", ""); // SVGElement har ingen .hidden-property
      y2.hidden = true;
      this.host.classList.remove("has-line");
      return;
    }
    const lo = Math.min(0, ...finite);
    const { hi, step } = niceMax(Math.max(...finite));
    const n = vals.length;
    const pt = (v, i) => `${(((i + 0.5) / n) * 100).toFixed(2)},${(100 - ((v - lo) / (hi - lo)) * 100).toFixed(2)}`;
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${pt(v, i)}`;
      pen = true;
    });
    svg.firstElementChild.setAttribute("d", d);
    svg.removeAttribute("hidden");
    const dec = decimalsFor(step);
    let labels = "";
    for (let v = lo; v <= hi + step / 2; v += step) labels += `<span style="top:${100 - ((v - lo) / (hi - lo)) * 100}%">${fmt(v, dec)}</span>`;
    y2.innerHTML = labels;
    y2.hidden = false;
    this.host.classList.add("has-line");
  }

  _bindTooltip() {
    const show = (ev) => {
      const n = this.values.length;
      if (!n || this.host.classList.contains("is-empty")) return;
      const rect = this.plot.getBoundingClientRect();
      const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width - 1);
      const i = Math.floor((x / rect.width) * n);
      const html = this.opts.describe?.(i);
      if (!html) return hide();
      const cx = ((i + 0.5) / n) * 100;
      this.tipEl.innerHTML = html;
      this.tipEl.style.left = `${Math.min(Math.max(cx, 14), 86)}%`;
      this.hoverEl.style.left = `${cx}%`;
      this.tipEl.hidden = false;
      this.hoverEl.hidden = false;
      [...this.barsEl.children].forEach((el, j) => el.classList.toggle("hover", j === i));
    };
    const hide = () => {
      this.tipEl.hidden = true;
      this.hoverEl.hidden = true;
      this.barsEl.querySelector(".hover")?.classList.remove("hover");
    };
    this.plot.addEventListener("pointermove", show);
    this.plot.addEventListener("pointerdown", show);
    this.plot.addEventListener("pointerleave", hide);
  }
}
