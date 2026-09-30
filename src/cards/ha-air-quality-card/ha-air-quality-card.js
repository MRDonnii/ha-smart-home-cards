import "../ha-ai-usage-card/ha-card-list-editor.js";
import { AIR_COLORS, AIR_LABELS, AIR_TONES, AIR_DEFAULTS, airQuality, co2Rank, pm25Rank, qualityRank } from "../shared/air-quality.js";

const VERSION = "1.0.0";
const TAG = "ha-air-quality-card";
const DASH = "—";
const W = 400;
const H = 132;
const PAD = { l: 6, r: 6, t: 10, b: 20 };
const MAX_POINTS = 240;
const isId = (id) => typeof id === "string" && id.includes(".");
const toMs = (value) => (typeof value === "number" ? (value < 1e12 ? value * 1000 : value) : Date.parse(value));

const ADVICE = [
  "Frisk luft – der er intet at gøre.",
  "Fin luft i rummet.",
  "Luften bliver tung – overvej at lufte ud.",
  "Luft ud nu.",
  "Luft ud med det samme.",
  "Luft ud med det samme.",
];

const STYLE = `
:host{display:block;--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.11)));--muted:var(--secondary-text-color,#8898ad);--surface:var(--dashboard-card-bg,var(--surface,var(--ha-card-background,var(--card-background-color,#111820))));--good:${AIR_COLORS.good};--fair:${AIR_COLORS.fair};--moderate:${AIR_COLORS.moderate};--poor:${AIR_COLORS.poor};--bad:${AIR_COLORS.bad};--offline:#7d8796}
*{box-sizing:border-box}
ha-card{overflow:hidden;border-radius:24px;background:var(--surface);color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
.shell{--tone:var(--good);position:relative;padding:20px;isolation:isolate}
.shell.fair{--tone:var(--fair)}.shell.moderate{--tone:var(--moderate)}.shell.poor{--tone:var(--poor)}.shell.bad{--tone:var(--bad)}.shell.offline{--tone:var(--offline)}
.backdrop{position:absolute;inset:-20%;z-index:-1;background:radial-gradient(circle at 92% 0,color-mix(in srgb,var(--tone) 16%,transparent),transparent 30%),radial-gradient(circle at 0 100%,color-mix(in srgb,var(--tone) 6%,transparent),transparent 35%)}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}
.eyebrow{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--tone);box-shadow:0 0 12px var(--tone)}
.animate .eyebrow i{animation:pulse 2.2s ease-in-out infinite}
h2{margin:5px 0 0;font-size:23px;line-height:1.08;letter-spacing:-.03em}
.pill{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex:none;padding:9px 13px;border:1px solid color-mix(in srgb,var(--tone) 38%,var(--edge));border-radius:15px;background:color-mix(in srgb,var(--tone) 12%,transparent)}
.pill strong{color:var(--tone);font-size:16px;line-height:1}.pill span{color:var(--muted);font-size:10px;font-weight:700}
.advice{margin:-4px 0 14px;color:color-mix(in srgb,var(--tone) 70%,var(--primary-text-color));font-size:12px;font-weight:650}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-bottom:14px}
.tile{--t:var(--offline);min-width:0;padding:11px 12px;border:1px solid color-mix(in srgb,var(--t) 30%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--t);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--t) 8%,transparent),rgba(0,0,0,.06));color:inherit;font:inherit;text-align:left;cursor:pointer}
.tile:disabled{cursor:default;opacity:.55}
.tile.good{--t:var(--good)}.tile.fair{--t:var(--fair)}.tile.moderate{--t:var(--moderate)}.tile.poor{--t:var(--poor)}.tile.bad{--t:var(--bad)}
.tile span{display:block;overflow:hidden;color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;text-overflow:ellipsis}
.tile strong{display:block;margin-top:5px;overflow:hidden;font-size:22px;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;text-overflow:ellipsis}
.tile strong small{margin-left:3px;color:var(--muted);font-size:10px;font-weight:700}
.tile em{display:block;margin-top:5px;color:var(--t);font-size:10px;font-style:normal;font-weight:800}
.chart{position:relative;margin-top:10px;padding:12px 12px 8px;border:1px solid var(--edge);border-radius:16px;background:rgba(0,0,0,.07)}
.chart-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:4px}
.chart-head strong{font-size:12px}.chart-head span{overflow:hidden;color:var(--muted);font-size:10px;font-weight:700;text-align:right;white-space:nowrap;text-overflow:ellipsis}
.plot{position:relative;height:${H}px}
.plot svg{display:block;width:100%;height:100%;overflow:visible}
.plot.small{height:${Math.round(H * 0.72)}px}
.axis{stroke:rgba(255,255,255,.1);stroke-width:1;vector-effect:non-scaling-stroke}
.limit{stroke-width:1;stroke-dasharray:5 4;vector-effect:non-scaling-stroke;opacity:.8}
.tick,.lim{position:absolute;color:var(--muted);font-size:9px;font-weight:700;line-height:1;white-space:nowrap;pointer-events:none}.tick{bottom:4px;transform:translateX(-50%)}.tick.first{transform:none}.tick.last{transform:translateX(-100%)}.lim{transform:translate(-100%,-120%)}
.line{fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.cross{position:absolute;top:0;bottom:${PAD.b}px;width:1px;background:color-mix(in srgb,var(--primary-text-color) 45%,transparent);pointer-events:none;opacity:0}
.dot{position:absolute;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border:2px solid var(--surface);border-radius:50%;background:var(--primary-text-color);pointer-events:none;opacity:0}
.tip{position:absolute;top:-4px;padding:4px 8px;border:1px solid var(--edge);border-radius:9px;background:var(--surface);color:var(--primary-text-color);font-size:10px;font-weight:700;white-space:nowrap;pointer-events:none;opacity:0;transform:translateX(-50%);box-shadow:0 6px 16px rgba(0,0,0,.25)}
.plot.hover .cross,.plot.hover .dot,.plot.hover .tip{opacity:1}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:100%;color:var(--muted);font-size:10px}
.timeline{position:relative;height:12px;overflow:hidden;margin-top:6px;border-radius:6px;background:rgba(255,255,255,.05)}
.timeline i{position:absolute;top:0;bottom:0}
.legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:7px;color:var(--muted);font-size:10px;font-weight:700}
.legend span{display:flex;align-items:center;gap:5px}.legend b{width:8px;height:8px;border-radius:50%}
.tile:focus-visible{outline:2px solid var(--tone);outline-offset:2px}
@keyframes pulse{50%{opacity:.4;transform:scale(1.45)}}
@media(max-width:520px){.shell{padding:15px}.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.tiles .tile:last-child{grid-column:1/-1}h2{font-size:20px}.tile strong{font-size:19px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
`;

class HAAirQualityCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._raw = {};
    this._signature = "";
    this._loading = false;
    this._fetchedAt = 0;
    this._series = {};
  }

  static getStubConfig(hass) {
    const states = Object.values(hass?.states || {});
    const find = (deviceClass) => states.find((state) => state.attributes?.device_class === deviceClass)?.entity_id;
    return { name: "Rum", co2: find("carbon_dioxide") || "sensor.co2", pm25: find("pm25") };
  }

  static getConfigElement() {
    const editor = document.createElement("ha-card-list-editor");
    editor.definition = {
      roots: [
        { key: "name", label: "Rum" }, { key: "title", label: "Titel (valgfri)" },
        { key: "co2", label: "CO₂", type: "entity" }, { key: "pm25", label: "PM2,5", type: "entity" },
        { key: "air_quality", label: "Luftkvalitet (samlet)", type: "entity" },
        { key: "hours", label: "Historik i timer", type: "number", min: 1, max: 168 },
        { key: "animation", label: "Animation", type: "boolean" },
      ],
      collections: [],
    };
    return editor;
  }

  setConfig(config) {
    if (!config || ![config.co2, config.pm25, config.air_quality].some(isId)) throw new Error("Luftkvalitetskortet kræver mindst én af co2, pm25 eller air_quality");
    this._config = { hours: 24, animation: true, ...config };
    this._raw = {};
    this._fetchedAt = 0;
    this._signature = "";
    this._render();
    this._ensureHistory();
  }

  set hass(hass) {
    this._hass = hass;
    const signature = [this._config.co2, this._config.pm25, this._config.air_quality].map((id) => hass?.states?.[id]?.state).join("|");
    if (signature !== this._signature) {
      this._signature = signature;
      this._render();
    }
    this._ensureHistory();
  }

  connectedCallback() {
    this._ensureHistory();
    if (!this._timer) this._timer = setInterval(() => this._ensureHistory(), 60000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = undefined;
  }

  getCardSize() { return 9; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }

  // ---------- Data ----------

  _ids() {
    return [this._config.co2, this._config.pm25, this._config.air_quality].filter(isId);
  }

  _hours() {
    const hours = Number(this._config.hours);
    return Number.isFinite(hours) && hours > 0 ? Math.min(hours, 168) : 24;
  }

  _ensureHistory() {
    if (!this._hass || this._loading || !this.isConnected) return;
    if (this._fetchedAt && Date.now() - this._fetchedAt < 5 * 60000) return;
    this._fetchHistory();
  }

  async _fetchHistory() {
    const ids = this._ids();
    if (!ids.length || (!this._hass?.callWS && !this._hass?.callApi)) return;
    this._loading = true;
    const end = Date.now();
    const start = end - this._hours() * 3600000;
    const rows = {};
    try {
      try {
        const result = await this._hass.callWS({ type: "history/history_during_period", start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false });
        for (const [id, list] of Object.entries(result || {})) rows[id] = (list || []).map((row) => ({ t: toMs(row.lu ?? row.lc), s: row.s }));
      } catch (_) {
        const path = `history/period/${encodeURIComponent(new Date(start).toISOString())}?end_time=${encodeURIComponent(new Date(end).toISOString())}&filter_entity_id=${encodeURIComponent(ids.join(","))}&minimal_response&no_attributes`;
        for (const list of (await this._hass.callApi("GET", path)) || []) {
          if (list?.length) rows[list[0].entity_id] = list.map((row) => ({ t: Date.parse(row.last_changed || row.last_updated), s: row.state }));
        }
      }
      this._raw = rows;
      this._start = start;
    } catch (error) {
      console.warn("HA Air Quality Card: history could not be loaded", error);
    } finally {
      this._loading = false;
      this._fetchedAt = Date.now();
      this._render();
    }
  }

  // Numeric series clipped to the window, with the live value appended.
  _numeric(id) {
    if (!isId(id)) return [];
    const now = Date.now();
    const start = now - this._hours() * 3600000;
    const points = (this._raw[id] || [])
      .map((row) => ({ t: Math.max(row.t, start), v: Number(row.s) }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
      .sort((a, b) => a.t - b.t);
    const live = Number(this._hass?.states?.[id]?.state);
    if (Number.isFinite(live)) points.push({ t: now, v: live });
    return points;
  }

  // Time-weighted average, maximum and time at or above a limit.
  _stats(points, limit) {
    if (!points.length) return undefined;
    let weighted = 0, total = 0, above = 0, max = points[0];
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (point.v > max.v) max = point;
      const next = points[i + 1];
      if (!next) continue;
      const duration = Math.max(0, next.t - point.t);
      weighted += point.v * duration;
      total += duration;
      if (limit !== undefined && point.v >= limit) above += duration;
    }
    return { avg: total ? weighted / total : points[points.length - 1].v, max, above };
  }

  _downsample(points) {
    if (points.length <= MAX_POINTS) return points;
    const first = points[0].t, last = points[points.length - 1].t;
    const size = (last - first) / MAX_POINTS || 1;
    const buckets = new Map();
    for (const point of points) {
      const key = Math.min(MAX_POINTS - 1, Math.floor((point.t - first) / size));
      const bucket = buckets.get(key) || { t: 0, v: 0, n: 0 };
      bucket.t += point.t; bucket.v += point.v; bucket.n += 1;
      buckets.set(key, bucket);
    }
    const result = [...buckets.values()].map((bucket) => ({ t: bucket.t / bucket.n, v: bucket.v / bucket.n }));
    result[result.length - 1] = points[points.length - 1];
    return result;
  }

  _segments(id) {
    if (!isId(id)) return [];
    const now = Date.now();
    const start = now - this._hours() * 3600000;
    const rows = (this._raw[id] || []).map((row) => ({ t: Math.max(row.t, start), s: String(row.s) })).filter((row) => Number.isFinite(row.t)).sort((a, b) => a.t - b.t);
    const current = this._hass?.states?.[id]?.state;
    if (current !== undefined && (!rows.length || rows[rows.length - 1].s !== String(current))) rows.push({ t: now, s: String(current) });
    const segments = [];
    rows.forEach((row, index) => {
      const end = rows[index + 1]?.t ?? now;
      if (end <= row.t) return;
      const previous = segments[segments.length - 1];
      if (previous && previous.s === row.s) previous.end = end;
      else segments.push({ s: row.s, start: row.t, end });
    });
    return segments;
  }

  // ---------- Formatting ----------

  _format(value, digits = 0) {
    if (value === undefined || !Number.isFinite(value)) return DASH;
    const language = this._hass?.locale?.language || this._hass?.language || "da";
    return value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  _clock(time) {
    const language = this._hass?.locale?.language || this._hass?.language || "da";
    return new Date(time).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" });
  }

  _duration(ms) {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60), rest = minutes % 60;
    return rest ? `${hours} t ${rest} min` : `${hours} t`;
  }

  _escape(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ---------- Charts ----------

  _plot(kind, points, limits, yMin, yMax, small) {
    const height = small ? Math.round(H * 0.72) : H;
    this._series[kind] = { points, yMin, yMax, height };
    if (points.length < 2) return `<div class="plot${small ? " small" : ""}"><div class="empty"><ha-icon icon="mdi:chart-line"></ha-icon><span>${this._loading || !this._fetchedAt ? "Historik indlæses" : "Ingen historik endnu"}</span></div></div>`;
    const now = Date.now(), start = now - this._hours() * 3600000;
    const x = (time) => PAD.l + Math.max(0, Math.min(1, (time - start) / (now - start))) * (W - PAD.l - PAD.r);
    const y = (value) => PAD.t + (yMax - value) / (yMax - yMin) * (height - PAD.t - PAD.b);
    const line = points.map((point) => `${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`).join(" ");
    const bottom = height - PAD.b;
    const area = `${x(points[0].t).toFixed(1)},${bottom} ${line} ${x(points[points.length - 1].t).toFixed(1)},${bottom}`;
    // The line colour follows the level bands, from the worst at the top to good at the bottom.
    const stops = limits.slice().sort((a, b) => b.value - a.value).flatMap((limit) => {
      const offset = Math.max(0, Math.min(1, (y(limit.value) - PAD.t) / (bottom - PAD.t)));
      return [`<stop offset="${offset.toFixed(4)}" style="stop-color:var(--${limit.above})"/>`, `<stop offset="${offset.toFixed(4)}" style="stop-color:var(--${limit.below})"/>`];
    }).join("");
    const top = limits.length ? `var(--${limits.slice().sort((a, b) => b.value - a.value)[0].above})` : "var(--good)";
    const gradient = `<linearGradient id="${kind}-line" gradientUnits="userSpaceOnUse" x1="0" y1="${PAD.t}" x2="0" y2="${bottom}"><stop offset="0" style="stop-color:${top}"/>${stops}<stop offset="1" style="stop-color:var(--good)"/></linearGradient><linearGradient id="${kind}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--tone);stop-opacity:.22"/><stop offset="1" style="stop-color:var(--tone);stop-opacity:0"/></linearGradient>`;
    // Labels are HTML on top of the SVG so they are not stretched with the curve.
    const shown = limits.filter((limit) => limit.label && limit.value > yMin && limit.value < yMax);
    const lines = shown.map((limit) => {
      const ly = y(limit.value).toFixed(1);
      return `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${ly}" y2="${ly}" class="limit" style="stroke:var(--${limit.above})"/>`;
    }).join("");
    const pct = (value) => `${(value / W * 100).toFixed(2)}%`;
    const labels = shown.map((limit) => `<span class="lim" style="left:${pct(W - PAD.r)};top:${y(limit.value).toFixed(1)}px;color:var(--${limit.above})">${this._escape(limit.label)}</span>`).join("");
    const hours = this._hours();
    const ticks = [0, 0.25, 0.5, 0.75].map((f) => `<span class="tick${f === 0 ? " first" : ""}" style="left:${pct(PAD.l + f * (W - PAD.l - PAD.r))}">-${Math.round(hours * (1 - f))} t</span>`).join("") + `<span class="tick last" style="left:${pct(W - PAD.r)}">Nu</span>`;
    return `<div class="plot${small ? " small" : ""}" data-plot="${kind}"><svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" role="img" aria-label="${kind === "co2" ? "CO₂" : "PM2,5"} de seneste ${hours} timer"><defs>${gradient}</defs>${lines}<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${bottom}" y2="${bottom}" class="axis"/><polygon points="${area}" fill="url(#${kind}-fill)"/><polyline points="${line}" class="line" stroke="url(#${kind}-line)"/></svg>${labels}${ticks}<i class="cross"></i><i class="dot"></i><span class="tip"></span></div>`;
  }

  _co2Chart(points) {
    const cfg = this._config;
    const good = cfg.co2_good ?? AIR_DEFAULTS.co2_good;
    const warning = cfg.co2_warning ?? AIR_DEFAULTS.co2_warning;
    const critical = cfg.co2_critical ?? AIR_DEFAULTS.co2_critical;
    const values = points.map((point) => point.v);
    const max = values.length ? Math.max(...values) : warning;
    const min = values.length ? Math.min(...values) : 400;
    const yMax = Math.max(max * 1.08, warning + 150);
    const yMin = Math.max(0, Math.min(min - 60, 380));
    const limits = [
      { value: good, above: "fair", below: "good" },
      { value: warning, above: "poor", below: "fair", label: `${warning} ppm · luft ud` },
      { value: critical, above: "bad", below: "poor", label: `${critical} ppm` },
    ];
    const stats = this._stats(points, warning);
    const summary = stats ? `Gns. ${this._format(stats.avg)} · maks. ${this._format(stats.max.v)} kl. ${this._clock(stats.max.t)} · over ${warning}: ${this._duration(stats.above)}` : "";
    return `<section class="chart"><div class="chart-head"><strong>CO₂ · ${this._hours()} timer</strong><span>${summary}</span></div>${this._plot("co2", this._downsample(points), limits, yMin, yMax, false)}</section>`;
  }

  _pmChart(points) {
    const values = points.map((point) => point.v);
    const max = values.length ? Math.max(...values) : 0;
    const yMax = Math.max(max * 1.15, AIR_DEFAULTS.pm25_good + 7);
    const limits = [
      { value: AIR_DEFAULTS.pm25_good, above: "fair", below: "good", label: `WHO ${AIR_DEFAULTS.pm25_good} µg/m³` },
      { value: AIR_DEFAULTS.pm25_moderate, above: "moderate", below: "fair" },
      { value: AIR_DEFAULTS.pm25_poor, above: "poor", below: "moderate", label: `${AIR_DEFAULTS.pm25_poor} µg/m³` },
      { value: AIR_DEFAULTS.pm25_bad, above: "bad", below: "poor" },
    ];
    const stats = this._stats(points, AIR_DEFAULTS.pm25_good);
    const summary = stats ? `Gns. ${this._format(stats.avg, 1)} · maks. ${this._format(stats.max.v, 1)} kl. ${this._clock(stats.max.t)}` : "";
    return `<section class="chart"><div class="chart-head"><strong>PM2,5 · ${this._hours()} timer</strong><span>${summary}</span></div>${this._plot("pm25", this._downsample(points), limits, 0, yMax, true)}</section>`;
  }

  _timeline(segments) {
    if (!segments.length) return "";
    const now = Date.now(), start = now - this._hours() * 3600000, span = now - start;
    const seen = new Map();
    const bars = segments.map((segment) => {
      const rank = qualityRank(segment.s);
      const tone = rank === undefined ? "offline" : AIR_TONES[rank];
      const label = rank === undefined ? "Ingen data" : AIR_LABELS[rank];
      seen.set(label, tone);
      const left = Math.max(0, (Math.max(segment.start, start) - start) / span * 100);
      const width = Math.max(0, (Math.min(segment.end, now) - Math.max(segment.start, start)) / span * 100);
      return `<i style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%;background:var(--${tone})" title="${this._escape(`${label}: ${this._clock(segment.start)}–${this._clock(segment.end)}`)}"></i>`;
    }).join("");
    const legend = [...seen].map(([label, tone]) => `<span><b style="background:var(--${tone})"></b>${this._escape(label)}</span>`).join("");
    return `<section class="chart"><div class="chart-head"><strong>Målerens vurdering</strong><span>${this._hours()} timer</span></div><div class="timeline">${bars}</div><div class="legend">${legend}</div></section>`;
  }

  _bindHover() {
    this.shadowRoot.querySelectorAll("[data-plot]").forEach((plot) => {
      const series = this._series[plot.dataset.plot];
      if (!series || series.points.length < 2) return;
      const unit = plot.dataset.plot === "co2" ? "ppm" : "µg/m³";
      const digits = plot.dataset.plot === "co2" ? 0 : 1;
      const move = (event) => {
        const rect = plot.getBoundingClientRect();
        if (!rect.width) return;
        const now = Date.now(), start = now - this._hours() * 3600000;
        const scale = rect.width / W;
        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - PAD.l * scale) / ((W - PAD.l - PAD.r) * scale)));
        const time = start + fraction * (now - start);
        let nearest = series.points[0];
        for (const point of series.points) if (Math.abs(point.t - time) < Math.abs(nearest.t - time)) nearest = point;
        const px = (PAD.l + Math.max(0, Math.min(1, (nearest.t - start) / (now - start))) * (W - PAD.l - PAD.r)) * scale;
        const py = (PAD.t + (series.yMax - nearest.v) / (series.yMax - series.yMin) * (series.height - PAD.t - PAD.b)) * (rect.height / series.height);
        plot.querySelector(".cross").style.left = `${px}px`;
        const dot = plot.querySelector(".dot");
        dot.style.left = `${px}px`;
        dot.style.top = `${py}px`;
        const tip = plot.querySelector(".tip");
        tip.textContent = `${this._clock(nearest.t)} · ${this._format(nearest.v, digits)} ${unit}`;
        tip.style.left = `${Math.max(48, Math.min(rect.width - 48, px))}px`;
        plot.classList.add("hover");
      };
      plot.addEventListener("pointermove", move);
      plot.addEventListener("pointerdown", move);
      plot.addEventListener("pointerleave", () => plot.classList.remove("hover"));
    });
  }

  _open(id) {
    if (isId(id)) this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } }));
  }

  _tile(label, id, value, unit, rank, sub) {
    const tone = rank === undefined ? "" : AIR_TONES[rank];
    const disabled = !isId(id) ? " disabled" : "";
    const shown = value === undefined ? DASH : this._escape(value);
    return `<button class="tile ${tone}" type="button" data-open="${this._escape(id || "")}"${disabled} aria-label="${this._escape(`${label}: ${value ?? "ingen data"} ${unit}`)}"><span>${label}</span><strong>${shown}${value !== undefined && unit ? `<small>${unit}</small>` : ""}</strong><em>${this._escape(sub)}</em></button>`;
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const cfg = this._config;
    const air = airQuality(this._hass, cfg);
    const tone = !air.configured || air.offline ? "offline" : air.tone;
    const co2Points = this._numeric(cfg.co2);
    const pmPoints = this._numeric(cfg.pm25);
    const qualityState = this._hass?.states?.[cfg.air_quality]?.state;
    const deviceRank = qualityRank(qualityState);
    const co2 = co2Rank(air.co2, cfg);
    const pm = pm25Rank(air.pm25);
    const worstIsPm = pm !== undefined && pm === air.rank && (co2 === undefined || pm > co2);
    const advice = air.offline ? "Måleren svarer ikke lige nu – kurverne viser den seneste historik." : worstIsPm && air.rank >= 2 ? "Mange partikler i luften – fx fra madlavning, stearinlys eller støv." : ADVICE[air.rank ?? 0];
    const title = cfg.title || (cfg.name ? `Luftkvalitet · ${cfg.name}` : "Luftkvalitet");
    const tiles = [
      isId(cfg.co2) ? this._tile("CO₂", cfg.co2, air.co2 === undefined ? undefined : this._format(air.co2), "ppm", co2, co2 === undefined ? "Ingen data" : AIR_LABELS[co2]) : "",
      isId(cfg.pm25) ? this._tile("PM2,5", cfg.pm25, air.pm25 === undefined ? undefined : this._format(air.pm25, air.pm25 < 10 ? 1 : 0), "µg/m³", pm, pm === undefined ? "Ingen data" : AIR_LABELS[pm]) : "",
      this._tile("Samlet", cfg.air_quality, air.offline ? undefined : air.label, "", air.offline ? undefined : air.rank, air.offline ? "Måleren er offline" : deviceRank !== undefined ? "Målerens vurdering" : "Beregnet af CO₂/PM2,5"),
    ].join("");
    this._series = {};
    const charts = [isId(cfg.co2) ? this._co2Chart(co2Points) : "", isId(cfg.pm25) ? this._pmChart(pmPoints) : "", isId(cfg.air_quality) ? this._timeline(this._segments(cfg.air_quality)) : ""].join("");
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="shell ${tone}${cfg.animation === false ? "" : " animate"}"><div class="backdrop"></div>
      <header><div><div class="eyebrow"><i></i>Luftkvalitet · ${this._hours()} timer</div><h2>${this._escape(title)}</h2></div>
      <div class="pill"><strong>${this._escape(air.configured ? air.label : DASH)}</strong><span>${this._escape(air.co2 !== undefined ? `CO₂ ${this._format(air.co2)} ppm` : air.pm25 !== undefined ? `PM2,5 ${this._format(air.pm25, 1)}` : "")}</span></div></header>
      <div class="advice">${this._escape(advice)}</div>
      <div class="tiles">${tiles}</div>${charts}</div></ha-card>`;
    this.shadowRoot.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => this._open(button.dataset.open)));
    this._bindHover();
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, HAAirQualityCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === TAG)) {
  window.customCards.push({ type: TAG, name: "HA Air Quality Card", description: "Luftkvalitet i et rum: CO₂, PM2,5 og målerens vurdering med 24-timers kurver", preview: true });
}
console.info(`%c HA AIR QUALITY CARD %c v${VERSION} `, "color:white;background:#2f9e6e;font-weight:700", "color:#4fd08f;background:#161b22");
