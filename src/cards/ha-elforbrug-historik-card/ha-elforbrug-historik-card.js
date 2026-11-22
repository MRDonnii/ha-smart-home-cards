/*
 * ha-elforbrug-historik-card – electricity use month by month and year by year.
 * Same design language as ha-energy-center-card (--ec-* tokens, .shell/.seg/.tab/.hero-item), so the two match.
 * Reads long-term statistics for one sensor (`entity`, no default) via recorder/statistics_during_period.
 * No external libraries: the charts are plain SVG.
 */
import { MONTHS, MONTHS_LONG, fmt, fmtPct, esc, buildSeries, computeModel, niceMax } from "./series.js";

const CARD_TAG = "ha-elforbrug-historik-card";
const VERSION = "1.0.0";
const PALETTE = ["var(--ec-accent)", "var(--c-heat)", "var(--c-ev)", "var(--c-water)", "var(--c-price)", "var(--ec-muted)"];

/* ---------- style (the same tokens as the energy card) ---------- */
const STYLE = `
:host{
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
      <span class="brand-mark"><ha-icon class="ic" icon="mdi:chart-timeline-variant"></ha-icon></span>
      <div><h2 data-ref="title"></h2><p data-ref="subtitle"></p></div>
    </div>
  </div>
  <div class="hero-grid" data-ref="kpis"></div>
  <div class="ctrl">
    <div class="seg" role="tablist" aria-label="Visning"><button type="button" data-view="month" class="on">Måned for måned</button><button type="button" data-view="year">År for år</button></div>
    <div class="years swiper" data-ref="years" role="group" aria-label="Vælg år"></div>
  </div>
  <div class="chart" data-ref="chart"><div class="state">Henter historik …</div></div>
  <p class="note" data-ref="note"></p>
</section>`;

class HaElforbrugHistorikCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = TEMPLATE;
    this._ref = (n) => this.shadowRoot.querySelector(`[data-ref="${n}"]`);
    this._view = "month";
    this._sel = null;
    this._series = null;
    this._loading = false;
    this._pinned = null;
    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this._ro = new ResizeObserver(() => this._drawChart());
  }

  static getStubConfig() {
    return { type: `custom:${CARD_TAG}`, entity: "sensor.example_energy_total" };
  }

  setConfig(config) {
    // `entity` has no default: a statistic id (a total_increasing kWh sensor) must be chosen. `source` is an optional
    // sentence about where the numbers come from, shown before the note about the current month.
    this.config = { title: "Elforbrug", subtitle: "Måned for måned og år for år", ...config };
    this._ref("title").textContent = this.config.title;
    this._ref("subtitle").textContent = this.config.subtitle;
    this._series = null;
    if (this._hass) this._load();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first && this.config) this._load();
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  connectedCallback() {
    this._ro.observe(this._ref("chart"));
    this._timer = setInterval(() => { if (!document.hidden) this._load(); }, 30 * 60 * 1000);
    this._vis = () => { if (!document.hidden && this._stale()) this._load(); };
    document.addEventListener("visibilitychange", this._vis);
    if (this._hass && this.config && !this._series) this._load();
  }

  disconnectedCallback() {
    this._ro.disconnect();
    clearInterval(this._timer);
    document.removeEventListener("visibilitychange", this._vis);
  }

  _stale() { return !this._loadedAt || Date.now() - this._loadedAt > 10 * 60 * 1000; }

  async _load() {
    if (this._loading || !this._hass || !this.config) return;
    if (!this.config.entity) { this._render(); return; }
    this._loading = true;
    try {
      const res = await this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: "2015-01-01T00:00:00Z",
        end_time: new Date(Date.now() + 36e5).toISOString(),
        statistic_ids: [this.config.entity],
        period: "month",
        types: ["change"],
      });
      this._series = buildSeries(res?.[this.config.entity]);
      this._loadedAt = Date.now();
      this._error = null;
    } catch (err) {
      this._error = err?.message || String(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _yearsAvailable() {
    return Object.keys(this._series?.years || {}).map(Number).sort((a, b) => a - b);
  }

  _render() {
    const chart = this._ref("chart");
    const years = this._yearsAvailable();
    if (this._error || !years.length) {
      this._ref("kpis").innerHTML = "";
      this._ref("years").innerHTML = "";
      this._ref("note").textContent = "";
      chart.innerHTML = !this.config.entity ? `<div class="state">Vælg en energisensor (<b>entity</b>) i kortets opsætning.</div>` : `<div class="state">${this._error ? `Kunne ikke hente historikken (${esc(this._error)}).` : `Ingen statistik endnu for <b>${esc(this.config.entity)}</b>.`}</div>`;
      return;
    }
    if (!this._sel) this._sel = new Set(years.slice(-3));
    this._renderKpis();
    this._renderYears(years);
    this._drawChart();
    const latest = this._series.latest;
    const source = this.config.source ? `Kilde: ${String(this.config.source).trim().replace(/\.$/, "")}. ` : "";
    this._ref("note").textContent = `${source}Den igangværende måned (${MONTHS_LONG[new Date().getMonth()]}) er foreløbig og tæller ikke med i sammenligningerne.` + (latest ? ` Seneste data: ${MONTHS_LONG[latest.m]} ${latest.y}.` : "");
  }

  _renderKpis() {
    const now = new Date();
    const m = computeModel(this._series, now);
    const tone = (d) => (d == null ? "tone-muted" : d > 3 ? "tone-bad" : d < -3 ? "tone-ok" : "tone-muted");
    const items = [];
    items.push(`<div class="hero-item tone-el"><span class="hi-label">Seneste 12 mdr</span><span class="hi-val num"><b>${fmt(m.last12)}</b><small>kWh</small></span><span class="hi-sub ${tone(m.last12Delta)}"><span class="d">${fmtPct(m.last12Delta)}</span> mod 12 mdr før</span></div>`);
    items.push(`<div class="hero-item tone-heat"><span class="hi-label">I år hidtil</span><span class="hi-val num"><b>${fmt(m.ytd)}</b><small>kWh</small></span><span class="hi-sub ${tone(m.ytdDelta)}">${m.ytdMonths ? `<span class="d">${fmtPct(m.ytdDelta)}</span> mod samme ${m.ytdMonths} mdr sidste år` : "Ingen hele måneder endnu"}</span></div>`);
    items.push(`<div class="hero-item tone-ev"><span class="hi-label">Gennemsnit pr. måned</span><span class="hi-val num"><b>${fmt(m.avg12)}</b><small>kWh</small></span><span class="hi-sub">${m.peak ? `Højest: ${MONTHS_LONG[m.peak.m]} ${m.peak.y} (${fmt(m.peak.v)} kWh)` : ""}</span></div>`);
    const f = m.forecast;
    items.push(`<div class="hero-item tone-warn"><span class="hi-label">Forventet ${f ? MONTHS_LONG[f.m] : "næste måned"}</span><span class="hi-val num"><b>${f ? "ca. " + fmt(Math.round(f.value / 10) * 10) : "–"}</b><small>kWh</small></span><span class="hi-sub">${f ? `${MONTHS[f.m]} ${f.y - 1}: ${fmt(f.base)} kWh · tendens ${fmtPct((f.ratio - 1) * 100)}` : "For lidt data"}</span></div>`);
    this._ref("kpis").innerHTML = items.join("");
  }

  _color(year) {
    const maxY = Math.max(...this._yearsAvailable());
    return PALETTE[Math.min(maxY - year, PALETTE.length - 1)];
  }

  _renderYears(years) {
    const box = this._ref("years");
    box.hidden = this._view !== "month";
    box.innerHTML = [...years].reverse().map((y) => `<button type="button" class="yr ${this._sel.has(y) ? "on" : ""}" data-year="${y}" style="--yc:${this._color(y)}" aria-pressed="${this._sel.has(y)}"><i></i>${y}</button>`).join("");
  }

  _onClick(e) {
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
    if (!this._series || !host.isConnected) return;
    const years = this._yearsAvailable();
    if (!years.length) return;
    const w = Math.max(280, Math.round(host.clientWidth || 600));
    const h = w < 520 ? 240 : 290;
    const pad = { l: 46, r: 6, t: 20, b: 26 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth();
    const month = this._view === "month";
    const sel = month ? [...this._sel].sort((a, b) => a - b) : years;
    const groups = month ? 12 : years.length;
    const values = month
      ? Array.from({ length: 12 }, (_, m) => sel.map((y) => ({ y, v: this._series.years[y]?.[m] ?? null, partial: y === cy && m === cm })))
      : years.map((y) => {
          const arr = this._series.years[y] || [];
          const upto = y === cy ? cm : 12;
          return [{ y, v: arr.slice(0, upto).reduce((s, x) => s + (x ?? 0), 0) || null, partial: y === cy, n: arr.slice(0, upto).filter((x) => x != null).length }];
        });
    const max = niceMax(Math.max(1, ...values.flat().map((x) => x.v || 0)) * 1.08);
    const gw = pw / groups;
    const per = values[0].length;
    const bw = Math.max(3, Math.min(34, (gw * 0.78) / per));
    const y = (v) => pad.t + ph - (v / max) * ph;
    let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${month ? "Elforbrug pr. måned" : "Elforbrug pr. år"}">`;
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
        const bh = Math.max(1, (d.v / max) * ph);
        const col = this._color(d.y);
        const x = x0 + i * bw;
        s += `<rect class="bar" x="${x.toFixed(1)}" y="${(y(d.v)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" style="fill:${col};color:${col};opacity:${d.partial ? 0.55 : 1}"/>`;
        if (d.partial) s += `<rect x="${x.toFixed(1)}" y="${(y(d.v)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="url(#hatch)" style="color:var(--ec-text)" opacity=".35"/>`;
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

  _tip(host, g, values, month, gw, pad) {
    const tip = host.querySelector(".tip");
    const rows = values[g].filter((d) => d.v != null);
    if (!rows.length) { tip.hidden = true; return; }
    const title = month ? MONTHS_LONG[g] : `${rows[0].y}${rows[0].partial ? ` (til og med ${MONTHS_LONG[new Date().getMonth() - 1] || "—"})` : ""}`;
    const prevOf = (d) => (month ? this._series.years[d.y - 1]?.[g] : this._series.years[d.y - 1] ? this._series.years[d.y - 1].reduce((s, x) => s + (x ?? 0), 0) : null);
    tip.innerHTML = `<h4>${esc(title)}</h4>` + [...rows].reverse().map((d) => {
      const dd = !d.partial && month ? pct(d.v, prevOf(d)) : null;
      return `<div class="row" style="--yc:${this._color(d.y)}"><i></i><span class="nm">${d.y}${d.partial ? "*" : ""}</span><span class="v num">${fmt(d.v)} kWh</span><span class="dd num">${dd == null ? "" : fmtPct(dd)}</span></div>`;
    }).join("") + (rows.some((d) => d.partial) ? `<div class="note" style="margin-top:4px">* foreløbig</div>` : "");
    tip.hidden = false;
    const cx = pad.l + gw * g + gw / 2;
    const tw = tip.offsetWidth || 180;
    tip.style.left = `${Math.max(0, Math.min(host.clientWidth - tw, cx - tw / 2))}px`;
    tip.style.top = "0px";
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, HaElforbrugHistorikCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({ type: CARD_TAG, name: "Elforbrug historik", description: `Elforbrug måned for måned og år for år (v${VERSION}).`, preview: false });
}
