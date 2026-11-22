// HA Weather Charts Card – `custom:ha-weather-charts-card`: the weather page's charts, drawn from scratch in SVG for DMI
// Vejr (Claude AI, 2026-10-14; user: "bygger nogle custom grafer helt fra bunden specifikt til vejr siden").
// Measured history (recorder) and DMI forecasts (the sensors' hourly `timer` attributes; when those are missing the
// weather entity's hourly forecast) on one time axis with a "now" line, day marks, a crosshair with every value, legend
// chips that hide a series, and the theme's colours. Charts whose sensors are missing are left out.
//
//   type: custom:ha-weather-charts-card
//   prefix: sensor.dmi_vejr_          # the sensors' names: prefix + the Danish key below (DMI Vejr's defaults)
//   weather: weather.dmi_vejr
//   entities: { temperatur: sensor.x } # other names for single sensors (e.g. older installs)
//   charts: [temperature, precipitation, wind, clouds, atmosphere, water, pressure, month]  # which, in that order

import { LUX_ACCENT } from "../../shared/lux.js";

const VERSION = "1.0.1";
const H = 3600e3;
const DAY = 24 * H;
const DAYS = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];

const C = {
  warm: "var(--warning-color,#f59e0b)",
  cold: "var(--info-color,#38bdf8)",
  green: "var(--success-color,#20e3a2)",
  red: "var(--error-color,#ef4444)",
  purple: "var(--wc-purple,#a855f7)",
  grey: "var(--secondary-text-color,#94a3b8)",
};

// The sensors each chart reads, by DMI Vejr's entity name (after the prefix).
const KEY = {
  temp: "temperatur", ensTemp: "laveste_temperatur_naeste_dogn_ensemble_10",
  rainHour: "nedbor_malt_sidste_time", ensRain: "nedbor_naeste_dogn_ensemble_median",
  gust: "vindstod", wind: "vindhastighed", windDir: "vindretning",
  ensGust: "kraftigste_vindstod_naeste_dogn_ensemble_90", ensWind: "hojeste_middelvind_naeste_dogn_ensemble_median",
  cloudLow: "lave_skyer_prognose", cloudMid: "mellemhoje_skyer_prognose", cloudHigh: "hoje_skyer_prognose",
  sunFc: "solindstraling_prognose", sun: "solindstraling",
  cloudBase: "skybase_prognose", freezing: "nulgradsgraense_hojde", cape: "tordenenergi_cape",
  water: "vandstand_havn", waterFc: "vandstand_prognose",
  pressure: "lufttryk", humidity: "luftfugtighed",
};
const CHARTS = ["temperature", "precipitation", "wind", "clouds", "atmosphere", "water", "pressure", "month"];

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => { const n = typeof v === "number" ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };
const fmt = (v, d = 1) => (v == null ? "–" : Number(v).toLocaleString("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d }));
const hh = (t) => String(new Date(t).getHours()).padStart(2, "0");

/** Monotone cubic path through the points (no overshoot), broken at nulls. */
function smoothPath(pts) {
  let d = ""; let run = [];
  const flush = () => {
    if (run.length === 1) d += `M${run[0][0]},${run[0][1]}h0.01`;
    else if (run.length > 1) {
      const n = run.length; const m = new Array(n).fill(0); const dx = []; const dy = []; const s = [];
      for (let i = 0; i < n - 1; i++) { dx[i] = run[i + 1][0] - run[i][0]; dy[i] = run[i + 1][1] - run[i][1]; s[i] = dx[i] ? dy[i] / dx[i] : 0; }
      m[0] = s[0]; m[n - 1] = s[n - 2];
      for (let i = 1; i < n - 1; i++) m[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2;
      for (let i = 0; i < n - 1; i++) {
        if (s[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
        const a = m[i] / s[i]; const b = m[i + 1] / s[i]; const h = a * a + b * b;
        if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * s[i]; m[i + 1] = t * b * s[i]; }
      }
      d += `M${run[0][0].toFixed(1)},${run[0][1].toFixed(1)}`;
      for (let i = 0; i < n - 1; i++) {
        const c1x = run[i][0] + dx[i] / 3; const c1y = run[i][1] + m[i] * dx[i] / 3;
        const c2x = run[i + 1][0] - dx[i] / 3; const c2y = run[i + 1][1] - m[i + 1] * dx[i] / 3;
        d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${run[i + 1][0].toFixed(1)},${run[i + 1][1].toFixed(1)}`;
      }
    }
    run = [];
  };
  for (const p of pts) { if (p[1] == null || !Number.isFinite(p[1])) flush(); else run.push(p); }
  flush();
  return d;
}

/** About 4 round ticks between lo and hi. */
function ticks(lo, hi, count = 4) {
  if (!(hi > lo)) { hi = lo + 1; }
  const raw = (hi - lo) / count; const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) || raw;
  const start = Math.floor(lo / step) * step; const end = Math.ceil(hi / step) * step;
  const out = []; for (let v = start; v <= end + step / 2; v += step) out.push(+v.toFixed(6));
  return out;
}

/** Bucket timed values: avg or max per `size` ms. */
function bucket(points, size, how = "avg") {
  const map = new Map();
  for (const [t, v] of points) { if (v == null) continue; const k = Math.floor(t / size) * size; const b = map.get(k) || []; b.push(v); map.set(k, b); }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([k, vs]) => [k + size / 2, how === "max" ? Math.max(...vs) : how === "min" ? Math.min(...vs) : vs.reduce((a, b) => a + b, 0) / vs.length]);
}

class HAWeatherChartsCard extends HTMLElement {
  static getStubConfig() { return { prefix: "sensor.dmi_vejr_", weather: "weather.dmi_vejr" }; }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "prefix", selector: { text: {} } },
        { name: "weather", selector: { entity: { domain: "weather" } } },
        { name: "charts", selector: { select: { multiple: true, mode: "list", options: CHARTS.map((c) => ({ value: c, label: c })) } } },
      ],
      computeLabel: (s) => ({ title: "Titel", prefix: "Sensor-prefix (DMI Vejr)", weather: "Vejr-entitet (prognose når ensemble mangler)", charts: "Grafer" })[s.name] || s.name,
    };
  }

  setConfig(config) {
    this._config = { prefix: "sensor.dmi_vejr_", weather: "weather.dmi_vejr", charts: CHARTS, ...config };
    this._hidden = this._hidden || {};
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._built = false;
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first || !this._histAt || Date.now() - this._histAt > 10 * 60e3) this._loadHistory();
    if (!this._fcSub && hass?.connection && hass.states[this._config.weather]) this._subscribeForecast();
    const sig = Object.values(KEY).map((k) => this._st(k)?.last_updated).join("|");
    if (sig !== this._sig) { this._sig = sig; this._scheduleRender(); }
  }

  connectedCallback() {
    if (!this._ro) {
      this._ro = new ResizeObserver(() => { const w = Math.round(this.getBoundingClientRect().width); if (w && w !== this._w) { this._w = w; this._scheduleRender(); } });
    }
    this._ro.observe(this);
    if (this._hass && !this._fcSub && this._hass.states[this._config?.weather]) this._subscribeForecast();
  }

  disconnectedCallback() {
    this._ro?.disconnect();
    this._fcSub?.then((unsub) => unsub?.()).catch(() => {}); this._fcSub = null;
  }

  getCardSize() { return 12; }
  getGridOptions() { return { columns: "full", rows: "auto" }; }

  // ------------------------------------------------------------------ data

  _id(key) { return this._config.entities?.[key] || this._config.entities?.[KEY[key]] || `${this._config.prefix}${KEY[key]}`; }
  _st(key) { return this._hass?.states?.[this._id(key)]; }
  _has(key) { const s = this._st(key); return !!s; }
  _live(key) { const s = this._st(key); return s && !["unavailable", "unknown"].includes(s.state) ? s : null; }

  /** The hourly `timer` attribute of a forecast sensor as [t, value] for one field. */
  _timer(key, field = "v") {
    const rows = this._live(key)?.attributes?.timer;
    return Array.isArray(rows) ? rows.map((r) => [Date.parse(r.t), num(r[field])]).filter(([t]) => Number.isFinite(t)) : [];
  }

  _fc(field, scale = 1) { return (this._forecast || []).map((f) => [Date.parse(f.datetime), num(f[field]) == null ? null : num(f[field]) * scale]); }

  _subscribeForecast() {
    try {
      this._fcSub = this._hass.connection.subscribeMessage((msg) => { this._forecast = msg?.forecast || []; this._scheduleRender(); },
        { type: "weather/subscribe_forecast", entity_id: this._config.weather, forecast_type: "hourly" });
      this._fcSub.catch(() => { this._fcSub = null; });
    } catch { this._fcSub = null; }
  }

  async _loadHistory() {
    if (!this._hass?.callWS || this._loading) return;
    this._loading = true; this._histAt = Date.now();
    const now = Date.now();
    const ids = (keys) => keys.filter((k) => this._has(k)).map((k) => this._id(k));
    const hist = async (keys, hours) => {
      const list = ids(keys); if (!list.length) return {};
      try {
        const res = await this._hass.callWS({ type: "history/history_during_period", start_time: new Date(now - hours * H).toISOString(),
          end_time: new Date(now).toISOString(), entity_ids: list, minimal_response: true, no_attributes: true, significant_changes_only: false });
        const out = {};
        for (const [id, rows] of Object.entries(res || {})) out[id] = rows.map((r) => [((r.lu ?? r.lc) || 0) * 1000, num(r.s)]).filter(([t, v]) => t && v != null);
        return out;
      } catch (e) { console.warn("HA Weather Charts: history", e); return {}; }
    };
    const [day, week] = await Promise.all([
      hist(["temp", "rainHour", "gust", "wind", "windDir", "sun", "water"], 24),
      hist(["pressure", "humidity"], 7 * 24),
    ]);
    let month = null;
    if (this._has("temp")) {
      try {
        const st = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: new Date(now - 31 * DAY).toISOString(),
          period: "day", statistic_ids: [this._id("temp")], types: ["min", "max", "mean"], units: {} });
        month = (st?.[this._id("temp")] || []).map((r) => ({ t: typeof r.start === "number" ? r.start : Date.parse(r.start), min: num(r.min), max: num(r.max), mean: num(r.mean) }));
      } catch { month = null; }
      if (!month?.length) {
        const raw = (await hist(["temp"], 31 * 24))[this._id("temp")] || [];
        const days = new Map();
        for (const [t, v] of raw) { const d = new Date(t); d.setHours(0, 0, 0, 0); const k = d.getTime(); const b = days.get(k) || []; b.push(v); days.set(k, b); }
        month = [...days.entries()].sort((a, b) => a[0] - b[0]).map(([t, vs]) => ({ t, min: Math.min(...vs), max: Math.max(...vs), mean: vs.reduce((a, b) => a + b, 0) / vs.length }));
      }
    }
    this._hist = { ...day, ...week }; this._month = month;
    this._loading = false;
    this._scheduleRender();
  }

  _h(key) { return this._hist?.[this._id(key)] || []; }

  // ---------------------------------------------------------------- charts

  _charts() {
    const now = Date.now();
    const span = { from: now - 24 * H, to: now + 48 * H };
    const out = {};
    const ensOr = (key, field, fallback) => { const t = this._timer(key, field); return t.some(([, v]) => v != null) ? t : fallback; };
    const windUnit = this._hass?.states?.[this._config.weather]?.attributes?.wind_speed_unit;
    const windScale = windUnit === "km/h" ? 1 / 3.6 : 1;

    if (this._has("temp")) {
      const band = this._timer("ensTemp", "p10").map(([t, lo], i) => [t, lo, this._timer("ensTemp", "p90")[i]?.[1] ?? null]).filter(([, lo, hi]) => lo != null && hi != null);
      const median = ensOr("ensTemp", "p50", this._fc("temperature"));
      out.temperature = {
        title: "Temperatur", sub: band.length ? "Målt og DMI-prognose · 10–90 % usikkerhed" : "Målt og DMI-prognose", span, unit: "°C", d: 1,
        series: [
          ...(band.length ? [{ name: "Usikkerhed 10–90 %", color: C.cold, type: "band", band }] : []),
          { name: "Prognose", color: C.cold, type: "line", dash: true, points: median.filter(([t]) => t >= now - H) },
          { name: "Målt", color: C.warm, type: "line", width: 2.6, points: bucket(this._h("temp"), 30 * 60e3), glow: true },
        ],
      };
    }
    if (this._has("rainHour") || this._forecast?.length) {
      const fc = ensOr("ensRain", "p50", this._fc("precipitation"));
      const p90 = this._timer("ensRain", "p90");
      out.precipitation = {
        title: "Nedbør", sub: p90.length ? "Målt pr. time og DMI-prognose · stiplet: kan blive op til (90 %)" : "Målt pr. time og DMI-prognose", span, unit: "mm", d: 1, zero: true,
        series: [
          { name: "Målt", color: C.warm, type: "bar", points: bucket(this._h("rainHour"), H, "max") },
          { name: "Prognose", color: C.cold, type: "bar", points: fc.filter(([t]) => t >= now) },
          ...(p90.length ? [{ name: "Op til (90 %)", color: C.purple, type: "ghost", points: p90.filter(([t]) => t >= now) }] : []),
        ],
      };
    }
    if (this._has("gust") || this._has("wind")) {
      const gust50 = ensOr("ensGust", "p50", this._fc("wind_gust_speed", windScale));
      const gust90 = this._timer("ensGust", "p90");
      const band = gust90.length ? gust50.map(([t, lo], i) => [t, lo, gust90[i]?.[1] ?? null]).filter(([, lo, hi]) => lo != null && hi != null) : [];
      const dirs = bucket(this._h("windDir"), 3 * H, "avg");
      const fcDirs = (this._forecast || []).filter((f, i) => i % 3 === 0).map((f) => [Date.parse(f.datetime), num(f.wind_bearing)]).filter(([t, v]) => t > now && v != null);
      out.wind = {
        title: "Vind", sub: "Målt og DMI-prognose · pile viser hvorfra det blæser", span, unit: "m/s", d: 1, zero: true, arrows: [...dirs, ...fcDirs],
        series: [
          ...(band.length ? [{ name: "Vindstød op til (90 %)", color: C.purple, type: "band", band }] : []),
          { name: "Vindstød prognose", color: C.purple, type: "line", dash: true, points: gust50.filter(([t]) => t >= now - H) },
          { name: "Middelvind prognose", color: C.cold, type: "line", dash: true, points: ensOr("ensWind", "p50", this._fc("wind_speed", windScale)).filter(([t]) => t >= now - H) },
          { name: "Målt vindstød", color: C.warm, type: "line", width: 2.2, points: bucket(this._h("gust"), 30 * 60e3, "max") },
          { name: "Målt middelvind", color: C.green, type: "line", width: 2.2, points: bucket(this._h("wind"), 30 * 60e3) },
        ],
      };
    }
    if (this._has("cloudLow") || this._has("sunFc")) {
      out.clouds = {
        title: "Skyer og sol", sub: "DMI HARMONIE · solindstråling og skydække i tre lag (jo stærkere, jo mere skyet)", span, unit: "W/m²", d: 0, min: 0,
        heat: [["Høje", C.purple, this._timer("cloudHigh")], ["Mellem", C.cold, this._timer("cloudMid")], ["Lave", C.grey, this._timer("cloudLow")]]
          .filter(([, , pts]) => pts.length),
        series: [
          { name: "Sol prognose", color: C.warm, type: "area", points: this._timer("sunFc") },
          { name: "Sol målt", color: C.green, type: "line", width: 2.2, glow: true, points: bucket(this._h("sun"), 30 * 60e3) },
        ],
      };
    }
    if (this._has("cloudBase") || this._has("freezing") || this._has("cape")) {
      out.atmosphere = {
        title: "Skybase, nulgradsgrænse og tordenenergi", sub: "DMI HARMONIE · højder i meter, CAPE som søjler", span, unit: "m", d: 0, min: 0,
        right: { unit: "J/kg", d: 0, min: 0 },
        series: [
          { name: "Tordenenergi (CAPE)", color: C.red, type: "bar", axis: "right", points: this._timer("cape") },
          { name: "Skybase", color: C.cold, type: "line", width: 2.2, points: this._timer("cloudBase") },
          { name: "Nulgradsgrænse", color: C.green, type: "line", width: 2.2, points: this._timer("freezing") },
        ],
      };
    }
    if (this._has("water") || this._has("waterFc")) {
      const station = this._st("waterFc")?.attributes?.station || this._st("water")?.attributes?.station;
      out.water = {
        title: `Vandstand${station ? ` · ${station}` : ""}`, sub: "Målt, stormflodsprognose (DKSS) og tidevand alene", span, unit: "cm", d: 0,
        series: [
          { name: "Tidevand alene", color: C.grey, type: "line", dash: true, points: this._timer("waterFc", "tidevand") },
          { name: "Prognose", color: C.cold, type: "line", width: 2.2, points: this._timer("waterFc", "cm").filter(([t]) => t >= now - H) },
          { name: "Målt", color: C.warm, type: "line", width: 2.6, glow: true, points: bucket(this._h("water"), 10 * 60e3) },
        ],
      };
    }
    if (this._has("pressure") || this._has("humidity")) {
      out.pressure = {
        title: "Lufttryk og luftfugtighed", sub: "Sidste 7 dage", span: { from: now - 7 * DAY, to: now }, days: true, unit: "hPa", d: 0,
        right: { unit: "%", d: 0, min: 0, max: 100 },
        series: [
          { name: "Luftfugtighed", color: C.green, type: "line", axis: "right", points: bucket(this._h("humidity"), H) },
          { name: "Lufttryk", color: C.cold, type: "line", width: 2.4, points: bucket(this._h("pressure"), H) },
        ],
      };
    }
    if (this._month?.length) {
      const m = this._month;
      out.month = {
        title: "Temperatur · 30 dage", sub: "Døgnets laveste til højeste og middel", span: { from: m[0].t, to: m[m.length - 1].t + DAY }, days: true, unit: "°C", d: 1,
        series: [
          { name: "Laveste–højeste", color: C.warm, type: "range", range: m.map((r) => [r.t + DAY / 2, r.min, r.max]) },
          { name: "Middel", color: C.green, type: "line", width: 2.2, points: m.map((r) => [r.t + DAY / 2, r.mean]) },
        ],
      };
    }
    return out;
  }

  // ---------------------------------------------------------------- render

  _scheduleRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this._render(); });
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    if (!this._built) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="wrap">${this._config.title ? `<h2 class="t">${esc(this._config.title)}</h2>` : ""}<div class="grid"></div></div></ha-card>`;
      this.shadowRoot.querySelector(".grid").addEventListener("click", (e) => {
        const chip = e.target.closest("[data-chip]"); if (!chip) return;
        const [chart, name] = chip.dataset.chip.split("|"); const set = (this._hidden[chart] ||= {});
        set[name] = !set[name]; this._render();
      });
      this._built = true;
    }
    if (!this._hass) return;
    const grid = this.shadowRoot.querySelector(".grid");
    const charts = this._charts();
    const order = (this._config.charts || CHARTS).filter((k) => charts[k]);
    const width = Math.max(260, (grid.getBoundingClientRect().width || 600));
    const cols = width >= 900 ? 2 : 1;
    const panelW = Math.floor((width - (cols - 1) * 14) / cols) - 2;
    // Keep panels; only their insides change.
    for (const key of order) {
      let panel = grid.querySelector(`[data-chart="${key}"]`);
      if (!panel) { panel = document.createElement("section"); panel.className = "p"; panel.dataset.chart = key; grid.appendChild(panel); this._wireHover(panel); }
      panel.innerHTML = this._panel(key, charts[key], panelW);
      panel._chart = charts[key];
      // Draw-in animations only the first time; later updates (new readings) change in place.
      if (panel._drawn) panel.setAttribute("still", ""); else setTimeout(() => { panel._drawn = true; }, 1200);
    }
    grid.querySelectorAll("[data-chart]").forEach((p) => { if (!order.includes(p.dataset.chart)) p.remove(); });
    order.forEach((k) => grid.appendChild(grid.querySelector(`[data-chart="${k}"]`)));
    grid.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
  }

  _panel(key, ch, W) {
    const hidden = this._hidden[key] || {};
    const heatH = ch.heat?.length ? ch.heat.length * 13 + 6 : 0; const Hh = 210 + heatH; const padL = 40; const padR = ch.right ? 44 : 12; const padT = 10; const padB = (ch.arrows ? 44 : 26) + heatH;
    const x0 = padL; const x1 = W - padR; const y0 = padT; const y1 = Hh - padB;
    const { from, to } = ch.span;
    const X = (t) => x0 + ((t - from) / (to - from)) * (x1 - x0);
    const inSpan = (p) => p[0] >= from && p[0] <= to;
    const shown = ch.series.filter((s) => !hidden[s.name]);
    const vals = (axis) => shown.filter((s) => (s.axis || "left") === axis).flatMap((s) =>
      s.type === "band" ? s.band.filter(inSpan).flatMap(([, a, b]) => [a, b]) : s.type === "range" ? s.range.filter(inSpan).flatMap(([, a, b]) => [a, b])
        : (s.points || []).filter(inSpan).map(([, v]) => v)).filter((v) => v != null && Number.isFinite(v));
    const scale = (axis, opt) => {
      const v = vals(axis); if (!v.length && opt.min == null) return null;
      let lo = opt.min ?? Math.min(...v); let hi = opt.max ?? Math.max(...v);
      if (opt.zero || ch.zero) lo = Math.min(0, lo);
      if (hi - lo < 1e-9) { hi += 1; lo -= opt.min != null ? 0 : 1; }
      const pad = (hi - lo) * 0.08; if (opt.max == null) hi += pad; if (opt.min == null && !(opt.zero || ch.zero)) lo -= pad;
      const tk = ticks(lo, hi); lo = opt.min ?? tk[0]; hi = opt.max ?? tk[tk.length - 1];
      return { lo, hi, tk: tk.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9), Y: (v) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0) };
    };
    const L = scale("left", { min: ch.min, max: ch.max });
    const R = ch.right ? scale("right", ch.right) : null;
    const now = Date.now();
    let svg = "";
    // grid + y labels
    if (L) for (const t of L.tk) { const y = L.Y(t).toFixed(1); svg += `<line class="gl" x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/><text class="yl" x="${x0 - 6}" y="${y}" dy="3.5" text-anchor="end">${fmt(t, Math.abs(t) < 10 && t % 1 ? 1 : 0)}</text>`; }
    if (R) for (const t of R.tk) { const y = R.Y(t).toFixed(1); svg += `<text class="yl" x="${x1 + 6}" y="${y}" dy="3.5">${fmt(t, 0)}</text>`; }
    // day marks and hour labels
    const dayStart = new Date(from); dayStart.setHours(0, 0, 0, 0);
    const dayXs = [];
    for (let t = dayStart.getTime(); t <= to; t += DAY) {
      if (t > from) svg += `<line class="dl" x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${y0}" y2="${y1}"/>`;
      const label = ch.days ? `${new Date(t).getDate()}.` : `${DAYS[new Date(t).getDay()]} ${new Date(t).getDate()}.`;
      const lx = ch.days ? X(t + DAY / 2) : X(Math.max(t, from)) + 4;
      if (!ch.days && t < from && from - t > 18 * H) continue;
      if (!ch.days) dayXs.push(lx);
      if (ch.days ? (new Date(t).getDate() % (W < 520 ? 4 : 2) === 0 || (to - from) < 10 * DAY) : true) svg += `<text class="xl${ch.days ? "" : " day"}" x="${lx.toFixed(1)}" y="${y1 + 15}"${ch.days ? ' text-anchor="middle"' : ""}>${label}</text>`;
    }
    if (!ch.days) {
      // Hour labels at 06, 12 and 18 local time (midnight carries the day's name).
      const step = W < 520 ? 12 : 6;
      for (let t = dayStart.getTime(); t <= to; t += step * H) { const hr = new Date(t).getHours(); if (hr === 0 || t < from + 2 * H || dayXs.some((dx) => Math.abs(X(t) - dx - 14) < 30)) continue; svg += `<text class="xl" x="${X(t).toFixed(1)}" y="${y1 + 15}" text-anchor="middle">${hh(t)}</text>`; }
    }
    // series
    const barW = (s) => { const pts = (s.points || []).filter(inSpan); if (pts.length < 2) return 6; const gap = Math.min(...pts.slice(1).map((p, i) => p[0] - pts[i][0]).filter((g) => g > 0)); return Math.max(2, (gap / (to - from)) * (x1 - x0) * 0.72); };
    const ax = (s) => ((s.axis || "left") === "right" ? R : L);
    const defs = [];
    shown.forEach((s, i) => {
      const A = ax(s); if (!A) return;
      const id = `g${key}${i}`;
      if (s.type === "band") {
        const b = s.band.filter(inSpan); if (b.length < 2) return;
        const top = b.map(([t, , hi]) => [X(t), A.Y(hi)]); const bot = b.map(([t, lo]) => [X(t), A.Y(lo)]).reverse();
        svg += `<path class="band" d="M${top.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L")}L${bot.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L")}Z" style="--c:${s.color}"/>`;
      } else if (s.type === "area") {
        const p = s.points.filter(inSpan).map(([t, v]) => [X(t), v == null ? null : A.Y(v)]); if (p.length < 2) return;
        defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".42"/><stop offset="1" stop-color="${s.color}" stop-opacity=".04"/></linearGradient>`);
        const line = smoothPath(p); const valid = p.filter(([, y]) => y != null);
        svg += `<path d="${line}L${valid[valid.length - 1][0].toFixed(1)},${y1}L${valid[0][0].toFixed(1)},${y1}Z" fill="url(#${id})"/><path class="ln" d="${line}" style="--c:${s.color};--w:1.4"/>`;
      } else if (s.type === "bar" || s.type === "ghost") {
        const w = barW(s); const base = A.Y(Math.max(A.lo, 0));
        for (const [t, v] of s.points.filter(inSpan)) { if (v == null || v <= 0) continue; const y = A.Y(v); svg += `<rect class="${s.type}" x="${(X(t) - w / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0.8, base - y).toFixed(1)}" rx="${Math.min(3, w / 3).toFixed(1)}" style="--c:${s.color}"/>`; }
      } else if (s.type === "range") {
        defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.warm}"/><stop offset="1" stop-color="${C.cold}"/></linearGradient>`);
        const w = Math.max(3, (DAY / (to - from)) * (x1 - x0) * 0.56);
        for (const [t, lo, hi] of s.range.filter(inSpan)) { if (lo == null || hi == null) continue; const yh = A.Y(hi), yl = A.Y(lo);
          svg += `<rect class="range" x="${(X(t) - w / 2).toFixed(1)}" y="${yh.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, yl - yh).toFixed(1)}" rx="${Math.min(4, w / 2).toFixed(1)}" fill="url(#${id})"/>`; }
      } else {
        const p = (s.points || []).filter(inSpan).map(([t, v]) => [X(t), v == null ? null : A.Y(v)]); if (!p.some(([, y]) => y != null)) return;
        svg += `<path class="ln${s.dash ? " dash" : ""}${s.glow ? " glow" : ""}" d="${smoothPath(p)}" style="--c:${s.color};--w:${s.width || 1.8}"/>`;
      }
    });
    // cloud rows under the time labels: one cell per hour, opacity = cover
    if (heatH) ch.heat.forEach(([name, color, pts], r) => {
      const y = y1 + 24 + r * 13; svg += `<text class="hl" x="${x0 - 6}" y="${y + 8.5}" text-anchor="end">${esc(name)}</text>`;
      const inPts = pts.filter((p) => p[0] >= from && p[0] <= to); const w = inPts.length > 1 ? Math.max(1, X(inPts[1][0]) - X(inPts[0][0])) : 6;
      for (const [t, v] of inPts) { if (v == null) continue; svg += `<rect x="${(X(t) - w / 2).toFixed(1)}" y="${y}" width="${(w + 0.4).toFixed(1)}" height="11" style="fill:${color};opacity:${(0.06 + 0.9 * Math.min(1, v / 100)).toFixed(2)}"/>`; }
      svg += `<rect class="hb" x="${x0}" y="${y}" width="${x1 - x0}" height="11" rx="3"/>`;
    });
    // wind arrows
    if (ch.arrows?.length) for (const [t, deg] of ch.arrows.filter(([t]) => t >= from && t <= to).filter((_, i) => W >= 520 || i % 2 === 0)) svg += `<g transform="translate(${X(t).toFixed(1)},${y1 + 31}) rotate(${(deg + 180) % 360})"><path class="arr" d="M0,-6 L4,4 L0,2 L-4,4Z"/></g>`;
    // now
    if (now > from && now < to) { const x = X(now).toFixed(1); svg += `<line class="now" x1="${x}" x2="${x}" y1="${y0 - 2}" y2="${y1}"/><text class="nowl" x="${x}" y="${y0 + 8}" text-anchor="middle">nu</text>`; }
    svg += `<line class="cross" x1="0" x2="0" y1="${y0}" y2="${y1}" style="display:none"/>`;
    const legend = ch.series.map((s) => `<button type="button" class="chip${hidden[s.name] ? " off" : ""}" data-chip="${esc(key)}|${esc(s.name)}" style="--c:${s.color}"><i class="${s.type}${s.dash ? " dash" : ""}"></i>${esc(s.name)}</button>`).join("");
    const empty = !L && !R;
    return `<header><div><h3>${esc(ch.title)}</h3><p>${esc(ch.sub || "")}</p></div><span class="unit">${esc(ch.unit)}${ch.right ? ` · ${esc(ch.right.unit)}` : ""}</span></header>
      ${empty ? `<div class="empty">Ingen data endnu</div>` : `<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" data-x0="${x0}" data-x1="${x1}" data-from="${from}" data-to="${to}"><defs>${defs.join("")}</defs>${svg}</svg>`}
      <div class="tip" hidden></div><div class="legend">${legend}</div>`;
  }

  _wireHover(panel) {
    const move = (e) => {
      const svg = panel.querySelector("svg"); const ch = panel._chart; if (!svg || !ch) return;
      const r = svg.getBoundingClientRect(); const sx = svg.viewBox.baseVal.width / r.width;
      const x = (e.clientX - r.left) * sx; const x0 = +svg.dataset.x0, x1 = +svg.dataset.x1, from = +svg.dataset.from, to = +svg.dataset.to;
      if (x < x0 || x > x1) return leave();
      const t = from + ((x - x0) / (x1 - x0)) * (to - from);
      const hidden = this._hidden[panel.dataset.chart] || {};
      const near = (pts) => { let best = null; for (const p of pts || []) { if (p[1] == null) continue; if (!best || Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p; } return best && Math.abs(best[0] - t) <= Math.max(2 * H, (to - from) / 40) ? best : null; };
      const rows = ch.series.filter((s) => !hidden[s.name]).map((s) => {
        const unit = (s.axis || "left") === "right" ? ch.right.unit : ch.unit; const d = (s.axis || "left") === "right" ? ch.right.d : ch.d;
        if (s.type === "band" || s.type === "range") { const p = near((s.band || s.range).map(([tt, a, b]) => [tt, a, b])); return p ? `<span style="--c:${s.color}"><i></i>${esc(s.name)}<b>${fmt(p[1], d)}–${fmt(p[2], d)} ${esc(unit)}</b></span>` : ""; }
        const p = near(s.points); return p ? `<span style="--c:${s.color}"><i></i>${esc(s.name)}<b>${fmt(p[1], d)} ${esc(unit)}</b></span>` : "";
      }).filter(Boolean);
      for (const [name, color, pts] of ch.heat || []) { const p = near(pts); if (p) rows.push(`<span style="--c:${color}"><i></i>${esc(name)} skyer<b>${fmt(p[1], 0)} %</b></span>`); }
      const when = new Date(t); const head = ch.days ? `${DAYS[when.getDay()]} ${when.getDate()}.${when.getMonth() + 1}.` : `${DAYS[when.getDay()]} ${when.getDate()}. kl. ${hh(t)}.${String(Math.round(when.getMinutes() / 10) * 10 % 60).padStart(2, "0")}`;
      const tip = panel.querySelector(".tip"); tip.innerHTML = `<em>${head}</em>${rows.join("") || "<span>Ingen værdier</span>"}`; tip.hidden = false;
      const left = (e.clientX - panel.getBoundingClientRect().left); tip.style.left = `${Math.min(Math.max(8, left + 14), panel.clientWidth - tip.offsetWidth - 8)}px`;
      const cross = svg.querySelector(".cross"); cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.style.display = "";
    };
    const leave = () => { const tip = panel.querySelector(".tip"); if (tip) tip.hidden = true; const c = panel.querySelector(".cross"); if (c) c.style.display = "none"; };
    panel.addEventListener("pointermove", move); panel.addEventListener("pointerdown", move); panel.addEventListener("pointerleave", leave);
  }
}

const STYLE = `
:host{display:block;--wc-ink:var(--primary-text-color,#eef2f7);--wc-mut:var(--secondary-text-color,#94a3b8);--wc-line:color-mix(in srgb,var(--wc-ink) 9%,transparent)}
*{box-sizing:border-box}
ha-card{background:none;border:0;box-shadow:none}
.wrap{display:grid;gap:12px}
.t{margin:0;font-size:18px;font-weight:750;color:var(--wc-ink)}
.grid{display:grid;gap:14px}
.p{position:relative;min-width:0;padding:14px 14px 10px;border-radius:var(--ha-card-border-radius,16px);background:var(--ha-card-background,var(--card-background-color,#151a22));
  border:1px solid var(--wc-line);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid ${LUX_ACCENT};box-shadow:var(--ha-card-box-shadow,none);color:var(--wc-ink);overflow:hidden}
.p header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px}
.p h3{margin:0;font-size:15px;font-weight:750;letter-spacing:-.005em}
.p header p{margin:2px 0 0;font-size:12px;color:var(--wc-mut)}
.unit{flex:none;font-size:11px;font-weight:700;color:var(--wc-mut);padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--wc-ink) 6%,transparent)}
svg{display:block;width:100%;height:auto;overflow:visible;touch-action:pan-y}
.gl{stroke:var(--wc-line);stroke-width:1}
.dl{stroke:color-mix(in srgb,var(--wc-ink) 16%,transparent);stroke-width:1;stroke-dasharray:3 4}
.yl,.xl{fill:var(--wc-mut);font-size:10.5px;font-variant-numeric:tabular-nums}
.xl.day{font-weight:700;fill:color-mix(in srgb,var(--wc-ink) 70%,transparent)}
.ln{fill:none;stroke:var(--c);stroke-width:var(--w);stroke-linecap:round;stroke-linejoin:round;animation:draw 1.1s ease-out both;stroke-dasharray:2400;stroke-dashoffset:0}
.ln.dash{stroke-dasharray:5 4;animation:fadein .8s ease-out both}
.ln.glow{filter:drop-shadow(0 0 5px color-mix(in srgb,var(--c) 55%,transparent))}
@keyframes draw{from{stroke-dashoffset:2400}}
@keyframes fadein{from{opacity:0}}
.band{fill:color-mix(in srgb,var(--c) 20%,transparent);stroke:none;animation:fadein .8s ease-out both}
.bar{fill:color-mix(in srgb,var(--c) 85%,transparent);animation:fadein .6s ease-out both}
.ghost{fill:none;stroke:var(--c);stroke-width:1.2;stroke-dasharray:3 2;opacity:.85}
.range{opacity:.9;animation:fadein .6s ease-out both}
.hl{fill:var(--wc-mut);font-size:9.5px}.hb{fill:none;stroke:var(--wc-line)}
.arr{fill:color-mix(in srgb,var(--wc-ink) 62%,transparent)}
.now{stroke:${LUX_ACCENT};stroke-width:1.4;stroke-dasharray:2 3}
.nowl{fill:${LUX_ACCENT};font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.cross{stroke:color-mix(in srgb,var(--wc-ink) 45%,transparent);stroke-width:1}
.tip{position:absolute;top:56px;z-index:3;display:grid;gap:3px;min-width:150px;padding:8px 10px;border-radius:12px;pointer-events:none;
  background:color-mix(in srgb,var(--ha-card-background,var(--card-background-color,#151a22)) 92%,transparent);border:1px solid var(--wc-line);box-shadow:0 10px 26px -10px rgba(0,0,0,.5);backdrop-filter:blur(8px);font-size:12px}
.tip[hidden]{display:none}
.tip em{font-style:normal;font-weight:750;color:var(--wc-mut);font-size:11px;text-transform:capitalize}
.tip span{display:flex;align-items:center;gap:6px;white-space:nowrap}.tip span b{margin-left:auto;padding-left:10px;font-variant-numeric:tabular-nums}
.tip i{width:8px;height:8px;border-radius:2px;background:var(--c)}
.legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--wc-line);background:color-mix(in srgb,var(--wc-ink) 4%,transparent);
  color:var(--wc-ink);font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .15s}
.chip:active{transform:scale(.95)}.chip.off{opacity:.42}
.chip i{width:14px;height:3px;border-radius:2px;background:var(--c)}
.chip i.dash{background:repeating-linear-gradient(90deg,var(--c) 0 4px,transparent 4px 7px)}
.chip i.bar,.chip i.range{width:9px;height:9px;border-radius:2px}.chip i.ghost{width:9px;height:9px;border:1.5px dashed var(--c);background:none}
.chip i.band,.chip i.area{width:12px;height:9px;border-radius:2px;background:color-mix(in srgb,var(--c) 35%,transparent)}
.empty{display:grid;place-items:center;height:180px;color:var(--wc-mut);font-size:13px}
@media (prefers-reduced-motion:reduce){.ln,.band,.bar,.range{animation:none}}
.p[still] .ln,.p[still] .band,.p[still] .bar,.p[still] .range{animation:none}
`;

if (!customElements.get("ha-weather-charts-card")) customElements.define("ha-weather-charts-card", HAWeatherChartsCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "ha-weather-charts-card")) {
  window.customCards.push({ type: "ha-weather-charts-card", name: "HA Weather Charts Card", description: "Vejrsidens grafer (DMI Vejr): målt og prognose, usikkerhed, vind, skyer, vandstand, tryk og 30 dage." });
}
console.info(`%c HA-WEATHER-CHARTS-CARD %c ${VERSION} `, "background:#38bdf8;color:#06121f;font-weight:700", "background:#1f2937;color:#fff");
