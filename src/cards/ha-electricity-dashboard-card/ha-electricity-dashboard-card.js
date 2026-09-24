/**
 * HA Electricity Dashboard Card
 *
 * Et samlet el-dashboard i ét kort: strømpris nu, dagens og morgendagens priser,
 * prisbaseret ladeanbefaling, live-fordeling mellem hus og billader, dagens energi
 * og opladningsstatus. Ingen eksterne afhængigheder.
 *
 * Arkitektur
 *  - Data:       normalisering af states/enheder → prisanalyse (caches pr. rå prisliste)
 *  - Rendering:  skelettet bygges én gang; hass-opdateringer skriver kun til cachede noder
 *  - Grafer:     SVG for linje/areal (skalerer frit) + HTML-overlay for markører og labels
 *  - Animation:  CSS (opacity/transform/stroke-dashoffset). Pauses når kortet ikke er synligt,
 *                og slås fra ved prefers-reduced-motion.
 *
 * Alle entity-id'er kommer fra kortets konfiguration – kortet opfinder ingen værdier.
 */

const VERSION = "1.1.0";
const CARD_TAG = "ha-electricity-dashboard-card";

/* ------------------------------------------------------------------------------------------
 * Konstanter
 * ---------------------------------------------------------------------------------------- */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Effekt under denne værdi regnes som støj (lader står stille). */
const CHARGING_THRESHOLD_KW = 0.05;
/** Nominel fasespænding i det danske net – bruges kun til at udlede laderens maks. effekt. */
const NOMINAL_PHASE_VOLTAGE = 230;
/** Prisafvigelse (i %) over gennemsnittet, hvor farven går fra orange til rød. */
const STRONG_DEVIATION_PCT = 20;
/** Afvigelser under denne værdi (i %) omtales som "på niveau med" gennemsnittet. */
const NEUTRAL_DEVIATION_PCT = 1;
/** Gennemsnit tættere på 0 end dette giver ingen meningsfuld procentafvigelse. */
const MIN_AVERAGE_FOR_PCT = 0.01;

/** Statistik (sparklines) hentes højst så ofte og kun mens kortet er synligt. */
const STATS_REFRESH_MS = 5 * MINUTE_MS;
const SPARK_WINDOW_MS = 6 * HOUR_MS;
const SPARK_BUCKET_MS = 15 * MINUTE_MS;
const STATS_HISTORY_MS = 2 * DAY_MS;

/** Tal-interpolation ved værdiændringer. */
const NUMBER_TWEEN_MS = 650;

/** Prisgrafens y-akse får lidt luft over maks., så labels ikke rammer toppen. */
const CHART_HEADROOM = 0.22;
const CHART_TARGET_TICKS = 4;
/** Omtrentlige callout-mål (px) brugt til at undgå overlap mellem labels i prisgrafen. */
const CALLOUT_WIDTH_PX = 124;
const CALLOUT_HEIGHT_PX = 56;
const CALLOUT_GAP_PX = 14;
const CALLOUT_NUDGE_PX = 14;
const AVG_LABEL_WIDTH_PX = 104;
const AVG_LABEL_HEIGHT_PX = 40;
const DEFAULT_PLOT_HEIGHT_PX = 240;
/** Breddeændringer under denne værdi udløser ikke en ny tegning af prisgrafen. */
const CHART_RESIZE_TOLERANCE_PX = 24;

/**
 * Prisniveauer bestemt ud fra percentil blandt dagens egne priser – ikke faste kr-grænser –
 * så farver og anbefaling virker både på billige og dyre dage (også med negative priser).
 */
const PRICE_BANDS = [
  { key: "very-cheap", maxPct: 10, tone: "green", level: "Meget billigt", advice: "Meget god tid at lade" },
  { key: "cheap", maxPct: 25, tone: "green", level: "Billigt", advice: "God tid at lade" },
  { key: "normal", maxPct: 60, tone: "blue", level: "Normalt", advice: "Normal strømpris" },
  { key: "expensive", maxPct: 80, tone: "orange", level: "Dyrt", advice: "Vent hvis du kan" },
  { key: "very-expensive", maxPct: 100, tone: "red", level: "Meget dyrt", advice: "Dyrt tidspunkt at lade" },
];

/** Zaptec charger_mode → dansk tekst. Ukendte værdier vises "pænt" som de er. */
const CHARGER_MODE_LABELS = {
  disconnected: "Ikke tilsluttet",
  connected_requesting: "Tilsluttet · venter",
  connected_charging: "Lader",
  connected_finished: "Færdig",
  unknown: "Ukendt",
};

const INVALID_STATES = new Set(["unknown", "unavailable", "none", "null", "undefined", ""]);
const POWER_TO_KW = { w: 0.001, kw: 1, mw: 1000 };
const ENERGY_TO_KWH = { wh: 0.001, kwh: 1, mwh: 1000 };

const DEFAULT_CONFIG = {
  title: "Pris Eksempler",
  subtitle: "Samlet overblik over strømpriser, forbrug og opladning",
  log_prefix: "electricity-dashboard",
  entities: {},
};

/* ------------------------------------------------------------------------------------------
 * Rene hjælpefunktioner (ingen DOM, ingen tilstand)
 * ---------------------------------------------------------------------------------------- */

const isValidState = (state) => state != null && !INVALID_STATES.has(String(state).trim().toLowerCase());

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (!isValidState(value)) return undefined;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pad2 = (n) => String(n).padStart(2, "0");

const numberFormats = new Map();
/** Dansk talformat. Returnerer "—" for alt der ikke er et endeligt tal. */
function fmtNumber(value, digits) {
  if (!Number.isFinite(value)) return "—";
  let fmt = numberFormats.get(digits);
  if (!fmt) {
    fmt = new Intl.NumberFormat("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(digits, fmt);
  }
  // Undgå "-0,00" når en lille negativ værdi afrundes til nul.
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return fmt.format(rounded === 0 ? 0 : rounded);
}

const fmtPrice = (v) => fmtNumber(v, 2);
const fmtPower = (v) => fmtNumber(v, 1);
const fmtEnergy = (v) => fmtNumber(v, 1);
const fmtPct = (v) => fmtNumber(v, 0);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Konverterer en sensor til kW/kWh ud fra dens egen unit_of_measurement. */
function convertByUnit(stateObj, table) {
  if (!stateObj) return { value: undefined, unit: undefined, known: true };
  const n = toNumber(stateObj.state);
  const unit = String(stateObj.attributes?.unit_of_measurement ?? "").trim();
  const factor = table[unit.toLowerCase()];
  if (factor === undefined) return { value: undefined, unit, known: false };
  return { value: n === undefined ? undefined : n * factor, unit, known: true };
}

/** Tidszone-bevidste formatteringer. HA's egen tidszone bruges, så tider matcher serveren. */
class Clock {
  constructor(timeZone) {
    const tz = timeZone || undefined;
    this.dateKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    this.timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    this.longDateFmt = new Intl.DateTimeFormat("da-DK", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  /** "2026-09-24" i HA's tidszone. */
  dateKey(ms) {
    return this.dateKeyFmt.format(ms);
  }
  /** "14:23" – altid 24-timers ur med kolon. */
  time(ms) {
    return this.timeFmt.format(ms).replace(".", ":");
  }
  /** "Torsdag d. 24. september 2026". */
  longDate(ms) {
    const parts = Object.fromEntries(this.longDateFmt.formatToParts(ms).map((p) => [p.type, p.value]));
    const weekday = parts.weekday ? parts.weekday[0].toUpperCase() + parts.weekday.slice(1) : "";
    return `${weekday} d. ${parts.day}. ${parts.month} ${parts.year}`;
  }
}

function shiftDateKey(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/**
 * Normaliserer Strømlignings prisliste. Verificeret struktur (attribute `prices`):
 *   [{ price: 1.325313, start: "2026-09-24T00:00:00+02:00", end: "2026-09-24T01:00:00+02:00" }, …]
 * Ugyldige elementer springes over, så enkelte manglende timer ikke vælter grafen.
 */
function parsePriceList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const price = toNumber(item.price);
    const iso = typeof item.start === "string" ? item.start : "";
    const start = Date.parse(iso);
    if (price === undefined || !Number.isFinite(start)) continue;
    const end = Date.parse(typeof item.end === "string" ? item.end : "");
    out.push({ iso, start, end, price, dateKey: iso.slice(0, 10), label: iso.slice(11, 16) });
  }
  out.sort((a, b) => a.start - b.start);
  out.forEach((e, i) => {
    if (!Number.isFinite(e.end) || e.end <= e.start) e.end = out[i + 1]?.start ?? e.start + HOUR_MS;
  });
  return out;
}

/** Midnat → midnat for en prisliste, udledt af listens egne UTC-offsets (håndterer sommertid). */
function dayDomain(entries, dateKey) {
  const first = entries[0];
  const last = entries[entries.length - 1];
  const offsetOf = (iso) => (iso.match(/([+-]\d{2}:\d{2}|Z)$/) || [""])[0];
  const start = Date.parse(`${dateKey}T00:00:00${offsetOf(first.iso)}`);
  const end = Date.parse(`${shiftDateKey(dateKey, 1)}T00:00:00${offsetOf(last.iso)}`);
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start, end }
    : { start: first.start, end: last.end };
}

/** Andel af værdierne under v (ties tæller halvt) → 0–100. */
function percentileOf(sortedValues, v) {
  if (!sortedValues.length || !Number.isFinite(v)) return undefined;
  let below = 0;
  let equal = 0;
  for (const x of sortedValues) {
    if (x < v) below += 1;
    else if (x === v) equal += 1;
  }
  return ((below + equal / 2) / sortedValues.length) * 100;
}

const bandFor = (pct) => (Number.isFinite(pct) ? PRICE_BANDS.find((b) => pct <= b.maxPct) || PRICE_BANDS.at(-1) : undefined);

/** Min/max/tidsvægtet gennemsnit + sorterede værdier til percentiler. */
function analyzePrices(entries) {
  if (!entries.length) return undefined;
  let minEntry = entries[0];
  let maxEntry = entries[0];
  let weighted = 0;
  let duration = 0;
  for (const e of entries) {
    if (e.price < minEntry.price) minEntry = e;
    if (e.price > maxEntry.price) maxEntry = e;
    const d = e.end - e.start;
    weighted += e.price * d;
    duration += d;
  }
  return {
    entries,
    minEntry,
    maxEntry,
    min: minEntry.price,
    max: maxEntry.price,
    avg: duration > 0 ? weighted / duration : undefined,
    sorted: entries.map((e) => e.price).sort((a, b) => a - b),
  };
}

/** Relativ afvigelse i % – beskyttet mod gennemsnit omkring 0 (negative priser). */
function deviationPct(value, average) {
  if (!Number.isFinite(value) || !Number.isFinite(average) || Math.abs(average) < MIN_AVERAGE_FOR_PCT) return undefined;
  return ((value - average) / Math.abs(average)) * 100;
}

/** "Pæne" akse-trin (0,25 / 0,5 / 1 / 2 …) for et vilkårligt prisinterval inkl. negative. */
function niceScale(min, max) {
  const lo0 = Math.min(0, min);
  const hi0 = Math.max(max + (max - lo0) * CHART_HEADROOM, lo0 + 0.1);
  const raw = (hi0 - lo0) / CHART_TARGET_TICKS;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.ceil(hi0 / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, ticks, step };
}

/** 1 decimal for trin som 0,5 / 1 / 2,5 – 2 decimaler for trin som 0,25. */
const axisDecimals = (step) => (Math.abs(step * 10 - Math.round(step * 10)) > 1e-9 ? 2 : 1);

/** Monoton kubisk spline (Fritsch–Carlson): glat linje uden overshoot under min/over max. */
function monotonePath(points) {
  const n = points.length;
  if (!n) return "";
  if (n === 1) return `M${points[0][0]},${points[0][1]}`;
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0]);
    slope.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1));
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i++) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  const r = (v) => Math.round(v * 100) / 100;
  let d = `M${r(points[0][0])},${r(points[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const h = dx[i] / 3;
    d += `C${r(x0 + h)},${r(y0 + tangent[i] * h)} ${r(x1 - h)},${r(y1 - tangent[i + 1] * h)} ${r(x1)},${r(y1)}`;
  }
  return d;
}

/** Deler prislisten ved huller (manglende timer), så grafen ikke tegner hen over dem. */
function splitOnGaps(entries) {
  const segments = [];
  let current = [];
  for (const e of entries) {
    if (current.length && e.start - current[current.length - 1].end > MINUTE_MS) {
      segments.push(current);
      current = [];
    }
    current.push(e);
  }
  if (current.length) segments.push(current);
  return segments;
}

function statTime(value) {
  return typeof value === "number" ? value : Date.parse(value);
}

/* ------------------------------------------------------------------------------------------
 * Ikoner og statisk markup
 * ---------------------------------------------------------------------------------------- */

const icon = (name, cls = "") => `<ha-icon class="ic ${cls}" icon="${name}"></ha-icon>`;

const STYLE = `
:host{
  /* Alle tokens peger på det aktive temas variabler; hex-værdierne er kun fallback. */
  --energy-card:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)));
  --energy-surface:var(--card-background-color,var(--primary-background-color,#0d0f12));
  --energy-text:var(--primary-text-color,#eef5ff);
  --energy-muted:var(--secondary-text-color,#8fa4c4);
  --energy-faint:color-mix(in srgb,var(--energy-muted) 72%,transparent);
  --energy-border:var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.2)));
  --energy-cyan:var(--dashboard-accent,var(--accent-color,var(--primary-color,#22d3ff)));
  --energy-blue:var(--dashboard-graph-accent,var(--energy-cyan));
  --energy-green:var(--dashboard-success,var(--success-color,#3ee07a));
  --energy-orange:var(--dashboard-warning,var(--warning-color,#ff9f40));
  --energy-red:var(--dashboard-danger,var(--error-color,#ff5a6a));
  --energy-yellow:var(--dashboard-icon-warn,var(--energy-orange));
  --energy-purple:var(--energy-grid-return-color,var(--purple,#8b7bff));
  --energy-card-secondary:color-mix(in srgb,var(--energy-text) 4%,transparent);
  --energy-border-strong:color-mix(in srgb,var(--energy-cyan) 42%,var(--energy-border));
  --energy-grid:color-mix(in srgb,var(--energy-text) 9%,transparent);
  --energy-track:color-mix(in srgb,var(--energy-text) 11%,transparent);
  --energy-accent-bar:var(--dashboard-card-accent-color,var(--energy-cyan));
  --energy-radius:var(--ha-card-border-radius,20px);
  --energy-radius-inner:14px;
  --energy-gap:14px;
  --energy-shadow:var(--dashboard-card-shadow,var(--ha-card-box-shadow,none));
  display:block;
  container-type:inline-size;
  color:var(--energy-text);
  font-family:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,inherit));
}
*{box-sizing:border-box}
[hidden]{display:none!important}
.ic{--mdc-icon-size:20px;display:inline-flex;flex:none}
.num{font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.tone-green{--tone:var(--energy-green)}
.tone-blue{--tone:var(--energy-cyan)}
.tone-orange{--tone:var(--energy-orange)}
.tone-red{--tone:var(--energy-red)}
.tone-neutral{--tone:var(--energy-muted)}

.dash{
  position:relative;display:grid;gap:var(--energy-gap);
  grid-template-columns:repeat(48,minmax(0,1fr));
}
.card{
  position:relative;min-width:0;border-radius:var(--energy-radius);padding:18px;
  background:var(--energy-card);border:1px solid var(--energy-border);box-shadow:var(--energy-shadow);
  border-left:calc(var(--dashboard-left-accent-width,1) * 3px) solid var(--energy-accent-bar);
}
.card-head{display:flex;align-items:center;gap:10px;min-width:0}
.card-head h3{margin:0;font-size:15px;font-weight:600;line-height:1.25;letter-spacing:.005em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-head .ic{color:var(--head-ic,var(--energy-cyan));--mdc-icon-size:24px}
.sub{color:var(--energy-muted);font-size:12.5px}
.clickable{cursor:pointer}
.clickable:focus-visible{outline:2px solid var(--energy-cyan);outline-offset:2px}

/* ---------- header ---------- */
.header{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:2px 2px 4px}
.brand{display:flex;align-items:center;gap:14px;min-width:0}
.brand-mark{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:color-mix(in srgb,var(--energy-cyan) 14%,var(--energy-card-secondary));border:1px solid var(--energy-border-strong);color:var(--energy-cyan);box-shadow:0 0 24px color-mix(in srgb,var(--energy-cyan) 16%,transparent)}
.brand-mark .ic{--mdc-icon-size:30px}
.brand h1{margin:0;font-size:30px;line-height:1.1;font-weight:700;letter-spacing:-.01em}
.brand p{margin:3px 0 0;color:var(--energy-muted);font-size:14.5px}
.chips{display:flex;gap:10px;flex-wrap:wrap}
.chip{display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:14px;background:var(--dashboard-button-neutral-bg,var(--energy-card));box-shadow:var(--energy-shadow);border:1px solid var(--energy-border);min-width:0}
.chip .ic{color:var(--energy-cyan);--mdc-icon-size:22px}
.chip b{display:block;font-size:13.5px;font-weight:600;white-space:nowrap}
.chip small{display:block;color:var(--energy-muted);font-size:12px;white-space:nowrap}
.dot{width:12px;height:12px;border-radius:50%;background:var(--tone);box-shadow:0 0 10px var(--tone);flex:none}

/* ---------- KPI ---------- */
.kpi{display:flex;flex-direction:column;gap:12px;overflow:hidden}
.big{display:flex;align-items:baseline;gap:8px;white-space:nowrap}
.big .v{font-size:44px;font-weight:700;line-height:1}
.big .u{font-size:22px;font-weight:600;color:var(--energy-text)}
.kpi-price .big{position:relative}
.kpi-price .glow{position:absolute;left:-10px;top:-16px;width:170px;height:72px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--tone,var(--energy-cyan)) 34%,transparent),transparent);opacity:.45;pointer-events:none;animation:breathe 6s ease-in-out infinite}
.kpi-price .big > :not(.glow){position:relative}
.delta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pill{display:inline-flex;flex:none;white-space:nowrap;align-items:center;gap:6px;padding:5px 11px;border-radius:10px;font-weight:700;font-size:14px;color:var(--tone);background:color-mix(in srgb,var(--tone) 14%,transparent);border:1px solid color-mix(in srgb,var(--tone) 38%,transparent)}
.pill .ic{--mdc-icon-size:16px}

.range{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:2px}
.range > div{display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px;padding:0 6px;min-width:0}
.range > div + div{border-left:1px solid var(--energy-border)}
.range .rv{font-size:27px;font-weight:700;line-height:1.1;color:var(--tone)}
.range .ru{font-size:13px;color:var(--energy-text);opacity:.85}
.range .rl{font-size:13px;color:var(--energy-muted);margin-top:6px}
.range .rt{font-size:12.5px;color:var(--energy-muted)}

.advice-box{position:relative;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--energy-radius-inner);background:color-mix(in srgb,var(--tone) 16%,var(--energy-card-secondary));border:1px solid color-mix(in srgb,var(--tone) 55%,transparent);overflow:hidden}
.advice-box::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 26px color-mix(in srgb,var(--tone) 38%,transparent);opacity:0;pointer-events:none}
.advice-box.glow::after{animation:breathe 5s ease-in-out infinite}
.advice-box .ic{--mdc-icon-size:34px;color:var(--tone);filter:drop-shadow(0 0 8px color-mix(in srgb,var(--tone) 60%,transparent))}
.advice-box b{display:block;font-size:17px;font-weight:700;line-height:1.2}
.advice-box small{display:block;color:var(--energy-muted);font-size:12.5px;margin-top:2px}
.advice-note{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--energy-muted);line-height:1.35}
.advice-note .ic{--mdc-icon-size:17px;color:var(--tone,var(--energy-cyan))}
.info-btn{margin-left:auto;color:var(--energy-faint);--mdc-icon-size:18px}

.ring-wrap{position:relative;display:grid;place-items:center;align-self:center;width:136px;height:136px;margin:auto 0}
.ring-wrap svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.ring-track{fill:none;stroke:var(--energy-track);stroke-width:9}
.ring-val{fill:none;stroke:url(#ring-grad);stroke-width:9;stroke-linecap:round;transition:stroke-dasharray .9s ease,opacity .6s ease}
.ring-val.zero,.donut .seg.zero{opacity:0}
.ring-wrap.idle .ring-val{opacity:.35}
.ring-spin{position:absolute;inset:0;border-radius:50%;opacity:0;pointer-events:none}
.ring-wrap.active .ring-spin{opacity:1;animation:spin 7s linear infinite}
.ring-spin svg circle{fill:none;stroke:var(--energy-cyan);stroke-width:9;stroke-linecap:round;filter:drop-shadow(0 0 6px var(--energy-cyan))}
.ring-center{position:relative;text-align:center;line-height:1.1}
.ring-center .v{font-size:30px;font-weight:700}
.ring-center .u{font-size:17px;font-weight:600}
.ring-center small{display:block;color:var(--energy-muted);font-size:12px;margin-top:4px}
.ring-pulse{position:absolute;top:6px;left:50%;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;background:var(--energy-cyan);box-shadow:0 0 10px var(--energy-cyan);opacity:0}
.ring-wrap.active .ring-pulse{opacity:1;animation:pulse-dot 2.6s ease-in-out infinite}

.spark{display:flex;align-items:flex-end;gap:3px;height:38px;margin-top:auto}
.spark i{flex:1;min-width:2px;height:var(--h);border-radius:2px 2px 1px 1px;background:linear-gradient(180deg,var(--tone),color-mix(in srgb,var(--tone) 35%,transparent));opacity:.9;transform-origin:bottom;transition:height .8s ease}
.spark i.live{animation:live-bar 2.8s ease-in-out infinite}
.spark-caption{display:flex;justify-content:space-between;color:var(--energy-faint);font-size:11px;margin-top:4px}

/* ---------- hovedsektion ---------- */
.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
.panel-head h2{margin:0;font-size:22px;font-weight:700}
.panel-head .ic.lead{--mdc-icon-size:34px;color:var(--energy-yellow);filter:drop-shadow(0 0 8px color-mix(in srgb,var(--energy-yellow) 35%,transparent))}
.panel-title{display:flex;gap:12px;align-items:center}
.tag{display:flex;align-items:center;gap:8px;padding:8px 13px;border-radius:12px;border:1px solid var(--energy-border);background:var(--energy-card-secondary);font-size:13.5px;color:var(--energy-text);white-space:nowrap}
.tag .ic{--mdc-icon-size:18px;color:var(--energy-muted)}
.chart-box{border-radius:16px;padding:14px 14px 10px;background:var(--energy-card-secondary);border:1px solid var(--energy-border)}
.chart-box h4{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:14.5px;font-weight:600}
.chart-box h4 .ic{color:var(--energy-cyan);--mdc-icon-size:20px}
.chart{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto 1fr auto;column-gap:8px}
.y-unit{grid-column:1/-1;font-size:11.5px;color:var(--energy-muted);margin-bottom:6px}
.y-axis{position:relative;width:30px}
.y-axis span{position:absolute;right:0;transform:translateY(-50%);font-size:12px;color:var(--energy-muted);font-variant-numeric:tabular-nums}
.plot{position:relative;height:240px;touch-action:pan-y}
.plot svg.lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.plot.draw svg.lines,.plot.draw .markers{animation:draw-in 1.3s cubic-bezier(.4,0,.2,1) backwards}
.grid-line{stroke:var(--energy-grid);stroke-width:1;vector-effect:non-scaling-stroke}
.zero-line{stroke:color-mix(in srgb,var(--energy-text) 28%,transparent);stroke-width:1;vector-effect:non-scaling-stroke}
.price-line{fill:none;stroke:url(#line-grad);stroke-width:2.6;vector-effect:non-scaling-stroke;stroke-linejoin:round;filter:drop-shadow(0 0 5px color-mix(in srgb,var(--energy-cyan) 45%,transparent))}
.price-area{fill:url(#area-grad);stroke:none}
.avg-line{stroke:color-mix(in srgb,var(--energy-text) 55%,transparent);stroke-width:1.2;stroke-dasharray:5 5;vector-effect:non-scaling-stroke}
.v-line{stroke-width:1.2;stroke-dasharray:4 4;vector-effect:non-scaling-stroke}
.v-line.now{stroke:color-mix(in srgb,var(--energy-text) 60%,transparent)}
.v-line.max{stroke:color-mix(in srgb,var(--energy-red) 70%,transparent)}
.markers{position:absolute;inset:0;pointer-events:none}
.pt{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:color-mix(in srgb,var(--energy-cyan) 55%,var(--energy-text));opacity:.55}
.mk{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:var(--tone);border:2px solid var(--energy-surface);box-shadow:0 0 0 1px color-mix(in srgb,var(--energy-text) 60%,transparent),0 0 12px var(--tone)}
.mk.now::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid var(--tone);opacity:0;animation:pulse-ring 2.6s ease-out infinite}
.callout{position:absolute;padding:6px 10px;border-radius:10px;font-size:12.5px;line-height:1.3;white-space:nowrap;background:color-mix(in srgb,var(--energy-surface) 92%,transparent);border:1px solid color-mix(in srgb,var(--tone) 60%,transparent);box-shadow:0 6px 18px color-mix(in srgb,black 30%,transparent),0 0 14px color-mix(in srgb,var(--tone) 18%,transparent);transform:translate(var(--tx,-50%),var(--ty,calc(-100% - 14px)))}
.callout b{display:block;color:var(--tone);font-weight:700}
.callout.below{--ty:14px}
.callout.left{--tx:-14px}
.callout.right{--tx:calc(-100% + 14px)}
.callout.avg{--tx:-100%;--ty:calc(-50%);font-size:12px}
.callout.avg.at-left{--tx:0%}
.x-axis{grid-column:2;position:relative;height:22px;margin-top:6px}
.x-axis span{position:absolute;transform:translateX(-50%);font-size:12px;color:var(--energy-muted);font-variant-numeric:tabular-nums}
.hover-layer{position:absolute;inset:0;cursor:crosshair}
.hover-line{position:absolute;top:0;bottom:0;width:0;border-left:1px solid color-mix(in srgb,var(--energy-text) 35%,transparent);pointer-events:none}
.tip{position:absolute;z-index:3;min-width:150px;padding:9px 11px;border-radius:12px;font-size:12.5px;line-height:1.4;background:var(--energy-surface);border:1px solid var(--energy-border-strong);box-shadow:var(--energy-shadow);pointer-events:none;transform:translate(-50%,calc(-100% - 10px))}
.tip b{display:block;font-size:14px}
.tip em{font-style:normal;color:var(--tone)}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:160px;text-align:center;color:var(--energy-muted);font-size:14px}
.empty .ic{--mdc-icon-size:34px;color:var(--energy-faint)}
.empty b{color:var(--energy-text);font-size:15px;font-weight:600}

.composition{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:10px;padding-top:10px;border-top:1px solid var(--energy-border);font-size:12.5px;color:var(--energy-muted)}
.composition b{color:var(--energy-text);font-weight:600}

.mini-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}
.mini{display:flex;flex-direction:column;gap:8px;min-width:0;padding:13px 12px;border-radius:16px;background:var(--energy-card-secondary);border:1px solid var(--energy-border)}
.mini .card-head{gap:7px;align-items:flex-start}
.mini .card-head h3{font-size:12px;-webkit-line-clamp:3}
.mini .card-head .ic{--mdc-icon-size:18px}
.mini .big .v{font-size:28px}
.mini .big .u{font-size:17px}
.mini .spark{height:34px}
.mini-foot{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--energy-muted)}
.mini-foot .pill{font-size:12px;padding:3px 8px}
.mini svg.mini-line{width:100%;height:40px;margin-top:auto;overflow:visible}
.mini-line path{fill:none;stroke:var(--tone);stroke-width:2;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 4px color-mix(in srgb,var(--tone) 60%,transparent))}
.mini-line circle{fill:var(--energy-cyan)}

/* ---------- elforbrug lige nu ---------- */
.flow-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(128px,.9fr);gap:12px;align-items:center;margin-top:12px}
.donut{position:relative;display:grid;place-items:center;aspect-ratio:1;max-width:190px;width:100%;justify-self:center}
.donut svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.donut .track{fill:none;stroke:var(--energy-track);stroke-width:12}
.donut .seg{fill:none;stroke-width:12;stroke-linecap:round;transition:stroke-dasharray .9s ease,stroke-dashoffset .9s ease}
.donut .seg.car{stroke:var(--energy-cyan);filter:drop-shadow(0 0 6px color-mix(in srgb,var(--energy-cyan) 55%,transparent))}
.donut .seg.house{stroke:var(--energy-green);filter:drop-shadow(0 0 6px color-mix(in srgb,var(--energy-green) 45%,transparent))}
.donut-center{position:relative;text-align:center;line-height:1.05}
.donut-center .v{font-size:40px;font-weight:700}
.donut-center .u{display:block;font-size:18px;font-weight:600;margin-top:2px}
.legend{display:flex;flex-direction:column;gap:10px}
.leg{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 8px;align-items:center;padding:11px 12px;border-radius:14px;background:var(--energy-card-secondary);border:1px solid var(--energy-border)}
.leg .ic{color:var(--tone);--mdc-icon-size:22px}
.leg small{font-size:12px;line-height:1.2;color:var(--energy-muted)}
.leg b{grid-column:1/-1;font-size:20px;font-weight:700;white-space:nowrap}
.leg .pct{grid-column:1/-1}
.leg .pct{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--energy-muted)}
.leg .pct::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--tone);box-shadow:0 0 8px var(--tone)}

/* ---------- opladning ---------- */
.charge-body{display:grid;grid-template-columns:minmax(78px,.75fr) minmax(0,1fr);gap:12px;margin-top:12px;align-items:center;padding:12px 10px;border-radius:16px;background:var(--energy-card-secondary);border:1px solid var(--energy-border)}
.status-chip{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:10px;font-size:12.5px;font-weight:600;white-space:nowrap;color:var(--tone);background:color-mix(in srgb,var(--tone) 14%,transparent);border:1px solid color-mix(in srgb,var(--tone) 45%,transparent)}
.status-chip .ic{--mdc-icon-size:16px}
.a-charge .card-head{flex-wrap:wrap;row-gap:8px}
.a-charge .card-head h3{-webkit-line-clamp:1;flex:0 0 auto}
.charger-art{width:100%;max-width:150px;justify-self:center;overflow:visible}
.charger-art .body{fill:url(#charger-body);stroke:color-mix(in srgb,var(--energy-text) 22%,transparent);stroke-width:1.2}
.charger-art .face{fill:color-mix(in srgb,var(--energy-surface) 88%,black);stroke:color-mix(in srgb,var(--energy-text) 10%,transparent)}
.charger-art .detail{fill:none;stroke:color-mix(in srgb,var(--energy-text) 32%,transparent);stroke-width:1.4}
.charger-art .pin{fill:color-mix(in srgb,var(--energy-text) 45%,transparent)}
.charger-art .led{fill:var(--tone);opacity:.35;transition:opacity .6s ease}
.charger-art .cable{fill:none;stroke:color-mix(in srgb,var(--energy-text) 14%,var(--energy-surface));stroke-width:7;stroke-linecap:round}
.charger-art .cable-core{fill:none;stroke:color-mix(in srgb,var(--energy-text) 16%,transparent);stroke-width:2;stroke-linecap:round}
.charger-art .flow{fill:none;stroke:var(--tone);stroke-width:3;stroke-linecap:round;stroke-dasharray:3 13;opacity:0}
.charger-art .plug{fill:color-mix(in srgb,var(--energy-text) 8%,var(--energy-surface));stroke:color-mix(in srgb,var(--energy-text) 28%,transparent);stroke-width:1.2}
.charger-art .bolt{fill:var(--tone);opacity:.18;transition:opacity .6s ease}
.charger-art.active .led{opacity:1;filter:drop-shadow(0 0 6px var(--tone))}
.charger-art.active .bolt{opacity:.95;filter:drop-shadow(0 0 8px var(--tone))}
.charger-art.active .flow{opacity:.95;animation:cable-flow 1.6s linear infinite;filter:drop-shadow(0 0 4px var(--tone))}
.charger-art.connected .led{opacity:.8}
.facts{display:flex;flex-direction:column;gap:10px;min-width:0}
.fact small{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--energy-muted)}
.fact small::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--tone,var(--energy-cyan));box-shadow:0 0 8px var(--tone,var(--energy-cyan))}
.fact b{display:block;font-size:20px;font-weight:700;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fact b.txt{font-size:16px;color:var(--tone,var(--energy-text))}
.bar{position:relative;height:7px;border-radius:99px;background:var(--energy-track);overflow:hidden}
.bar i{position:absolute;inset:0;border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--tone) 70%,transparent),var(--tone));transform-origin:left;transform:scaleX(var(--p,0));transition:transform .9s ease;box-shadow:0 0 10px var(--tone)}
.bar-row{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--energy-muted)}
.bar-row .bar{flex:1}

/* ---------- dagens elforbrug ---------- */
.energy-rows{display:flex;flex-direction:column;gap:10px;margin-top:14px}
.erow{display:grid;grid-template-columns:34px minmax(90px,1.1fr) auto minmax(60px,1.6fr) minmax(76px,auto);gap:14px;align-items:center;padding:11px 14px;border-radius:14px;background:var(--energy-card-secondary);border:1px solid var(--energy-border)}
.erow .ic{color:var(--tone);--mdc-icon-size:26px}
.erow .name{font-size:14px;font-weight:600;line-height:1.2}
.erow .val{font-size:19px;font-weight:700;white-space:nowrap;text-align:right}
.erow .share{font-size:13px;color:var(--energy-text);line-height:1.2}
.erow .share small{display:block;color:var(--energy-muted);font-size:11.5px}
.tone-purple{--tone:var(--energy-purple)}

/* ---------- i morgen ---------- */
.tomorrow-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(430px,.45fr);gap:18px;align-items:stretch;margin-top:12px}
.bars{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto 1fr auto;column-gap:8px}
.bars .plot{height:120px}
.bar-col{position:absolute;bottom:0;top:0;display:flex;justify-content:center}
.bar-col i{position:absolute;left:14%;right:14%;border-radius:4px;background:linear-gradient(180deg,var(--tone),color-mix(in srgb,var(--tone) 55%,transparent));box-shadow:0 0 10px color-mix(in srgb,var(--tone) 35%,transparent)}
.bar-col i.neg{border-radius:0 0 4px 4px}
.extremes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-radius:16px;background:var(--energy-card-secondary);border:1px solid var(--energy-border)}
.ext{display:flex;gap:12px;align-items:flex-start;padding:16px 14px;min-width:0}
.ext + .ext{border-left:1px solid var(--energy-border)}
.ext .badge{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;flex:none;color:var(--tone);background:color-mix(in srgb,var(--tone) 16%,transparent);border:1px solid color-mix(in srgb,var(--tone) 45%,transparent);box-shadow:0 0 16px color-mix(in srgb,var(--tone) 25%,transparent)}
.ext small{display:block;font-size:12.5px;color:var(--energy-muted)}
.ext b{display:block;font-size:21px;font-weight:700;margin:3px 0 1px;white-space:nowrap}
.ext span{font-size:13px;color:var(--energy-muted)}

/* ---------- footer ---------- */
.footer{grid-column:1/-1;display:flex;align-items:center;gap:14px;justify-content:space-between;flex-wrap:wrap;padding:12px 16px;border-radius:16px;background:var(--energy-card-secondary);border:1px solid var(--energy-border);font-size:12.5px;color:var(--energy-muted)}
.footer .ic{color:var(--energy-cyan)}
.footer > span{display:flex;align-items:center;gap:10px}

/* ---------- grid-placering (desktop) ---------- */
.a-price{grid-column:1/11}
.a-range{grid-column:11/23}
.a-advice{grid-column:23/33}
.a-charger{grid-column:33/41}
.a-house{grid-column:41/49}
.a-main{grid-column:1/27;grid-row:span 2}
.a-flow{grid-column:27/38}
.a-charge{grid-column:38/49}
.a-energy{grid-column:27/49}
.a-tomorrow{grid-column:1/-1}

/* ---------- animationer ---------- */
@keyframes breathe{0%,100%{opacity:.35}50%{opacity:.8}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse-dot{0%,100%{transform:scale(.8);opacity:.55}50%{transform:scale(1.25);opacity:1}}
@keyframes pulse-ring{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.9);opacity:0}}
@keyframes live-bar{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes cable-flow{to{stroke-dashoffset:-32}}
@keyframes draw-in{from{clip-path:inset(-80px 100% -80px -80px)}to{clip-path:inset(-80px -80px -80px -80px)}}
:host([paused]) *,:host([paused]) *::before,:host([paused]) *::after{animation-play-state:paused!important}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
}

/* ---------- tablet ---------- */
@container (max-width:1180px){
  .dash{grid-template-columns:repeat(6,minmax(0,1fr))}
  .a-price,.a-range{grid-column:span 3}
  .a-advice,.a-charger,.a-house{grid-column:span 2}
  .a-main,.a-energy,.a-tomorrow{grid-column:1/-1;grid-row:auto}
  .a-flow,.a-charge{grid-column:span 3}
  .tomorrow-body{grid-template-columns:1fr}
  .big .v{font-size:38px}
}
@container (max-width:900px){
  .mini-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .a-advice{grid-column:1/-1}
  .a-charger,.a-house{grid-column:span 3}
  .a-flow,.a-charge{grid-column:1/-1}
  .flow-body{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
}

/* ---------- mobil: én kolonne i den ønskede rækkefølge ---------- */
@container (max-width:640px){
  .dash{grid-template-columns:minmax(0,1fr);gap:12px}
  .dash > *{grid-column:1/-1!important;grid-row:auto!important}
  .a-price{order:1}.a-advice{order:2}.a-flow{order:3}.a-range{order:4}.a-main{order:5}
  .a-charge{order:6}.a-energy{order:7}.a-tomorrow{order:8}.footer{order:9}
  .a-charger,.a-house{display:none}
  .header{order:0}
  .brand h1{font-size:24px}.brand p{font-size:13px}.brand-mark{width:44px;height:44px}
  .chips{width:100%}.chip{flex:1 1 0}.chip:first-child{flex-basis:100%}
  .card{padding:15px}
  .big .v{font-size:38px}
  .plot{height:200px}
  .x-axis span.minor{display:none}
  .panel-head h2{font-size:19px}
  .erow{grid-template-columns:30px minmax(0,1fr) auto;gap:10px}
  .erow .bar,.erow .share{grid-column:2/-1}
  .erow .share{display:flex;gap:6px;align-items:baseline}
  .extremes{grid-template-columns:1fr}
  .ext + .ext{border-left:0;border-top:1px solid var(--energy-border)}
  .charge-body{grid-template-columns:minmax(80px,.7fr) minmax(0,1fr)}
  .callout{font-size:11.5px;padding:5px 8px}
  .mini{padding:11px 10px}.mini .big .v{font-size:24px}.mini .big .u{font-size:14px}
}
@container (max-width:330px){
  .mini-grid{grid-template-columns:minmax(0,1fr)}
  .flow-body{grid-template-columns:1fr}
}
`;

/* ------------------------------------------------------------------------------------------
 * Kortet
 * ---------------------------------------------------------------------------------------- */

class HAElectricityDashboardCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._uid = `ed${Math.random().toString(36).slice(2, 8)}`;
    this._config = undefined;
    this._hass = undefined;
    this._seen = new Map(); // entity-id → sidst sete state-objekt (HA udskifter objektet ved ændring)
    this._refs = {};
    this._tweens = new Map();
    this._shown = new Map();
    this._warned = new Set();
    this._visible = true;
    this._connected = false;
    this._firstChart = true;
    this._stats = { power: {}, energyHourly: [], fetchedAt: 0, failed: false };
    this._priceCache = { todayRaw: undefined, tomorrowRaw: undefined, tomorrowOn: undefined, dateKey: "" };
    this._reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._onVisibility = () => this._updateActivity();
  }

  /* ---------- Lovelace API ---------- */

  static getStubConfig() {
    return {
      title: DEFAULT_CONFIG.title,
      entities: {
        price: "sensor.current_electricity_price",
        tomorrow: "binary_sensor.electricity_prices_tomorrow",
        house_power: "sensor.house_power_without_ev",
        charger_power: "sensor.ev_charger_power",
        house_energy_today: "sensor.house_energy_today",
      },
    };
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("Ugyldig konfiguration");
    const entities = { ...(config.entities || {}) };
    if (!entities.price) throw new Error("Kortet kræver entities.price (sensor med prisliste i attributten 'prices')");
    this._config = { ...DEFAULT_CONFIG, ...config, entities };
    this._seen.clear();
    this._priceCache = { todayRaw: undefined, tomorrowRaw: undefined, tomorrowOn: undefined, dateKey: "" };
    this._build();
    if (this._hass) this._update(true);
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._config) this._update(first);
  }

  /** Ur/formattering i HA's tidszone (genskabes kun hvis tidszonen ændrer sig). */
  get _clock() {
    const tz = this._hass?.config?.time_zone;
    if (!this._clockObj || this._clockTz !== tz) {
      this._clockTz = tz;
      this._clockObj = new Clock(tz);
    }
    return this._clockObj;
  }

  getCardSize() {
    return 24;
  }

  getGridOptions() {
    return { columns: "full" };
  }

  connectedCallback() {
    this._connected = true;
    document.addEventListener("visibilitychange", this._onVisibility);
    if (typeof IntersectionObserver === "function" && !this._io) {
      this._io = new IntersectionObserver((entries) => {
        this._visible = entries.some((e) => e.isIntersecting);
        this._updateActivity();
      });
      this._io.observe(this);
    }
    if (typeof ResizeObserver === "function" && !this._ro) {
      // Label-placeringen i prisgrafen afhænger af bredden: gentegn kun ved reel breddeændring.
      this._ro = new ResizeObserver((entries) => {
        const width = Math.round(entries[0]?.contentRect?.width || 0);
        if (!width || Math.abs(width - (this._chartWidth || 0)) < CHART_RESIZE_TOLERANCE_PX) return;
        this._chartWidth = width;
        if (this._hass && this._priceCache.today) this._safe("chart-resize", () => this._renderTodayChart(this._priceModel(), this._num("price") ?? this._priceModel().current?.price));
      });
      this._ro.observe(this._refs.todayChart || this);
    }
    this._updateActivity();
  }

  disconnectedCallback() {
    this._connected = false;
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._io?.disconnect();
    this._io = undefined;
    this._ro?.disconnect();
    this._ro = undefined;
    this._stopTimers();
    cancelAnimationFrame(this._tweenFrame);
    this._tweenFrame = undefined;
    this._flushTweens();
  }

  /* ---------- aktivitet: timers og animationer kun når kortet ses ---------- */

  get _active() {
    return this._connected && this._visible && document.visibilityState !== "hidden";
  }

  _updateActivity() {
    const active = this._active;
    this.toggleAttribute("paused", !active);
    if (!active) {
      this._stopTimers();
      return;
    }
    if (!this._clockTimer) this._scheduleClock();
    if (this._hass && this._config) {
      this._tick();
      this._maybeFetchStats();
    }
  }

  _stopTimers() {
    clearTimeout(this._clockTimer);
    this._clockTimer = undefined;
  }

  /** Ét minut-tick, justeret til hele minutter – bruges til ur, "Nu"-markør og statistik. */
  _scheduleClock() {
    const delay = MINUTE_MS - (Date.now() % MINUTE_MS) + 50;
    this._clockTimer = setTimeout(() => {
      this._clockTimer = undefined;
      if (!this._active) return;
      this._tick();
      this._maybeFetchStats();
      this._scheduleClock();
    }, delay);
  }

  _tick() {
    if (!this._hass || !this._refs.dash) return;
    this._safe("header", () => this._updateHeader());
    this._safe("prices", () => this._updatePrices(false));
    this._safe("footer", () => this._updateFooter());
  }

  /** Én sektion der fejler må ikke vælte resten af kortet. */
  _safe(name, fn) {
    try {
      fn();
    } catch (err) {
      this._warnOnce(`section-${name}`, `Fejl i sektionen "${name}" – øvrige sektioner opdateres fortsat`, err);
    }
  }

  /* ---------- logning uden spam ---------- */

  _warnOnce(key, ...args) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`[${this._config?.log_prefix || DEFAULT_CONFIG.log_prefix}]`, ...args);
  }

  /* ---------- dataadgang ---------- */

  _id(key) {
    return this._config?.entities?.[key];
  }

  _stateObj(key) {
    const id = this._id(key);
    return id ? this._hass?.states?.[id] : undefined;
  }

  _num(key) {
    return toNumber(this._stateObj(key)?.state);
  }

  _kw(key) {
    const res = convertByUnit(this._stateObj(key), POWER_TO_KW);
    if (!res.known) this._warnOnce(`unit-${key}`, `Ukendt effekt-enhed "${res.unit}" på ${this._id(key)} – forventede W/kW/MW`);
    return res.value;
  }

  _kwh(key) {
    const res = convertByUnit(this._stateObj(key), ENERGY_TO_KWH);
    if (!res.known) this._warnOnce(`unit-${key}`, `Ukendt energi-enhed "${res.unit}" på ${this._id(key)} – forventede Wh/kWh/MWh`);
    return res.value;
  }

  /** Hvilke entity-nøgler påvirker hvilken sektion. */
  static get GROUPS() {
    return {
      prices: ["price", "tomorrow", "spot_price", "co2", "fossil_share"],
      power: ["house_power", "charger_power", "charger_mode", "charger_online", "charger_max_current", "charger_phases", "charger_session_energy"],
      energy: ["house_energy_today", "charger_energy_today"],
    };
  }

  _allEntityIds() {
    const ids = new Set();
    for (const [key, value] of Object.entries(this._config.entities)) {
      if (key === "price_components" && Array.isArray(value)) value.forEach((v) => v && ids.add(v));
      else if (typeof value === "string" && value) ids.add(value);
    }
    return [...ids];
  }

  /* ---------- opdateringsløkke ---------- */

  _update(force) {
    if (!this._hass || !this._refs.dash) return;
    try {
      const changed = new Set();
      const groups = HAElectricityDashboardCard.GROUPS;
      for (const [group, keys] of Object.entries(groups)) {
        for (const key of keys) {
          const id = this._id(key);
          if (!id) continue;
          const obj = this._hass.states[id];
          if (force || this._seen.get(id) !== obj) {
            this._seen.set(id, obj);
            changed.add(group);
          }
        }
      }
      for (const id of this._config.entities.price_components || []) {
        const obj = this._hass.states[id];
        if (force || this._seen.get(id) !== obj) {
          this._seen.set(id, obj);
          changed.add("prices");
        }
      }
      const connected = this._hass.connected !== false;
      if (force || connected !== this._wasConnected) {
        this._wasConnected = connected;
        changed.add("header");
      }
      if (!changed.size) return;

      // Effekt opdateres ofte (sekunder); header/footer tælles derfor kun ved andre ændringer
      // og ellers af minut-tick'et.
      if (force || changed.has("header")) this._safe("header", () => this._updateHeader());
      if (changed.has("prices")) this._safe("prices", () => this._updatePrices(force));
      if (changed.has("power")) this._safe("power", () => this._updatePower());
      if (changed.has("energy")) this._safe("energy", () => this._updateEnergy());
      if (force || changed.has("prices") || changed.has("energy")) this._safe("footer", () => this._updateFooter());
      if (force) this._maybeFetchStats();
    } catch (err) {
      this._warnOnce("update", "Fejl under opdatering – viser seneste gyldige data", err);
    }
  }

  /* ---------- DOM: skelet (bygges én gang pr. konfiguration) ---------- */

  _build() {
    const c = this._config;
    const u = this._uid;
    const has = (k) => Boolean(this._id(k));
    this.shadowRoot.innerHTML = `
<style>${STYLE}</style>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--energy-blue)"/><stop offset="1" style="stop-color:var(--energy-cyan)"/></linearGradient>
    <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--energy-blue)"/><stop offset=".55" style="stop-color:var(--energy-cyan)"/><stop offset="1" style="stop-color:var(--energy-blue)"/></linearGradient>
    <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--energy-cyan);stop-opacity:.34"/><stop offset="1" style="stop-color:var(--energy-cyan);stop-opacity:0"/></linearGradient>
    <linearGradient id="charger-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb,var(--energy-text) 16%,var(--energy-surface))"/><stop offset="1" style="stop-color:var(--energy-surface)"/></linearGradient>
  </defs>
</svg>
<div class="dash" data-ref="dash">
  <header class="header">
    <div class="brand">
      <div class="brand-mark">${icon("mdi:chart-bar")}</div>
      <div><h1>${escapeHtml(c.title)}</h1><p>${escapeHtml(c.subtitle)}</p></div>
    </div>
    <div class="chips">
      <div class="chip">${icon("mdi:calendar-clock")}<div><b data-ref="hdrDate">—</b><small data-ref="hdrTime">—</small></div></div>
      <div class="chip" data-ref="hdrOnline"><span class="dot"></span><div><b data-ref="hdrOnlineText">Online</b><small>Home Assistant</small></div></div>
      <div class="chip" data-ref="hdrSystem"><span class="dot"></span><div><b>System</b><small data-ref="hdrSystemText">—</small></div></div>
    </div>
  </header>

  <section class="card kpi kpi-price a-price clickable" data-entity="${escapeHtml(this._id("price"))}" tabindex="0">
    <div class="card-head" style="--head-ic:var(--energy-yellow)">${icon("mdi:lightning-bolt")}<h3>Strømpris nu</h3></div>
    <div class="big" data-ref="priceBig"><span class="glow"></span><span class="v num" data-ref="priceNow" data-v>—</span><span class="u">kr/kWh</span></div>
    <div class="delta" data-ref="priceDelta"><span class="pill" data-ref="priceDeltaPill">—</span><span class="sub">i forhold til dagsgennemsnit</span></div>
  </section>

  <section class="card kpi a-range">
    <div class="card-head" style="--head-ic:var(--energy-blue)">${icon("mdi:chart-bar")}<h3>Dagens min / max / gennemsnit</h3></div>
    <div class="range">
      <div class="tone-green"><span class="rv num" data-ref="minVal" data-v>—</span><span class="ru">kr/kWh</span><span class="rl">Min</span><span class="rt" data-ref="minTime">—</span></div>
      <div class="tone-red"><span class="rv num" data-ref="maxVal" data-v>—</span><span class="ru">kr/kWh</span><span class="rl">Max</span><span class="rt" data-ref="maxTime">—</span></div>
      <div style="--tone:var(--energy-text)"><span class="rv num" data-ref="avgVal" data-v>—</span><span class="ru">kr/kWh</span><span class="rl">Gennemsnit</span><span class="rt">i dag</span></div>
    </div>
  </section>

  <section class="card kpi a-advice" data-ref="advice">
    <div class="card-head" style="--head-ic:var(--energy-green)">${icon("mdi:ev-plug-type2")}<h3>Ladeanbefaling</h3><span class="info-btn" title="Vejledende – baseret alene på den aktuelle pris' placering blandt dagens priser. Styrer ikke laderen.">${icon("mdi:information-outline")}</span></div>
    <div class="advice-box" data-ref="adviceBox">${icon("mdi:power-plug-outline")}<div><b data-ref="adviceTitle" data-v>—</b><small data-ref="adviceLevel">—</small></div></div>
    <div class="advice-note" data-ref="adviceNote1">${icon("mdi:check-circle")}<span data-ref="adviceText">—</span></div>
    <div class="advice-note" data-ref="adviceNote2" style="--tone:var(--energy-cyan)">${icon("mdi:clock-outline")}<span data-ref="adviceNext">—</span></div>
  </section>

  <section class="card kpi a-charger clickable" data-entity="${escapeHtml(this._id("charger_power"))}" tabindex="0" ${has("charger_power") ? "" : "hidden"}>
    <div class="card-head">${icon("mdi:car-electric")}<h3>Billader effekt</h3></div>
    <div class="ring-wrap idle" data-ref="ring">
      <svg viewBox="0 0 136 136"><circle class="ring-track" cx="68" cy="68" r="58"/><circle class="ring-val" data-ref="ringVal" cx="68" cy="68" r="58" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 68 68)"/></svg>
      <div class="ring-spin"><svg viewBox="0 0 136 136"><circle cx="68" cy="68" r="58" pathLength="100" stroke-dasharray="7 93" transform="rotate(-90 68 68)"/></svg></div>
      <span class="ring-pulse"></span>
      <div class="ring-center"><span class="v num" data-ref="chargerKpi" data-v>—</span> <span class="u">kW</span><small data-ref="chargerKpiSub">—</small></div>
    </div>
  </section>

  <section class="card kpi a-house clickable tone-green" data-entity="${escapeHtml(this._id("house_power"))}" tabindex="0" ${has("house_power") ? "" : "hidden"}>
    <div class="card-head" style="--head-ic:var(--energy-green)">${icon("mdi:home")}<h3>Husforbrug uden billader</h3></div>
    <div class="big"><span class="v num" data-ref="houseKpi" data-v>—</span><span class="u">kW</span></div>
    <div data-ref="houseSparkWrap" hidden><div class="spark" data-ref="houseSpark"></div><div class="spark-caption"><span>−6 t</span><span>nu</span></div></div>
  </section>

  <section class="card a-main">
    <div class="panel-head">
      <div class="panel-title">${icon("mdi:lightning-bolt", "lead")}<div><h2>Strøm &amp; forbrug</h2><div class="sub">Aktuel strømpris og forbrug i dag</div></div></div>
      <span class="tag">${icon("mdi:calendar-today")}I dag</span>
    </div>
    <div class="chart-box">
      <h4>${icon("mdi:chart-bell-curve-cumulative")}Strømkort – dagspris</h4>
      <div data-ref="todayChart"></div>
      <div class="composition" data-ref="composition" hidden></div>
    </div>
    <div class="mini-grid">
      <div class="mini tone-green clickable" data-entity="${escapeHtml(this._id("house_energy_today"))}" tabindex="0" ${has("house_energy_today") ? "" : "hidden"}>
        <div class="card-head" style="--head-ic:var(--energy-green)">${icon("mdi:home")}<h3>Dagens husforbrug uden bil</h3></div>
        <div class="big"><span class="v num" data-ref="houseDay" data-v>—</span><span class="u">kWh</span></div>
        <div class="spark" data-ref="houseDaySpark" hidden></div>
        <div class="mini-foot" data-ref="houseDayCompare" hidden><span class="pill" data-ref="houseDayComparePill"></span><span>ift. samme tid i går</span></div>
      </div>
      <div class="mini tone-blue clickable" data-entity="${escapeHtml(this._id("charger_power"))}" tabindex="0" ${has("charger_power") ? "" : "hidden"}>
        <div class="card-head">${icon("mdi:car-electric")}<h3>Billader effekt</h3></div>
        <div class="big"><span class="v num" data-ref="chargerMini" data-v>—</span><span class="u">kW</span></div>
        <div class="spark" data-ref="chargerSpark" hidden></div>
      </div>
      <div class="mini tone-green clickable" data-entity="${escapeHtml(this._id("house_power"))}" tabindex="0" ${has("house_power") ? "" : "hidden"}>
        <div class="card-head" style="--head-ic:var(--energy-green)">${icon("mdi:home-lightning-bolt")}<h3>Husforbrug uden billader</h3></div>
        <div class="big"><span class="v num" data-ref="houseMini" data-v>—</span><span class="u">kW</span></div>
        <div class="spark" data-ref="houseMiniSpark" hidden></div>
      </div>
      <div class="mini" data-ref="vsMini">
        <div class="card-head" style="--head-ic:var(--energy-yellow)">${icon("mdi:percent")}<h3>Pris lige nu vs. gennemsnit</h3></div>
        <div class="big"><span class="v num" data-ref="vsPrice" data-v>—</span><span class="u">kr/kWh</span></div>
        <div class="mini-foot"><span class="pill" data-ref="vsPill">—</span></div>
        <svg class="mini-line" data-ref="vsLine" viewBox="0 0 100 40" preserveAspectRatio="none"></svg>
      </div>
    </div>
  </section>

  <section class="card a-flow" ${has("house_power") || has("charger_power") ? "" : "hidden"}>
    <div class="panel-head" style="margin-bottom:0">
      <div class="panel-title">${icon("mdi:power-plug", "lead")}<div><h2>Elforbrug lige nu</h2><div class="sub">Fordeling af aktuelt elforbrug</div></div></div>
    </div>
    <div class="flow-body">
      <div class="donut">
        <svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="50"/>
          <circle class="seg car" data-ref="segCar" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="0 100"/>
          <circle class="seg house" data-ref="segHouse" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="0 100"/>
        </svg>
        <div class="donut-center"><span class="v num" data-ref="flowTotal" data-v>—</span><span class="u">kW</span></div>
      </div>
      <div class="legend">
        <div class="leg tone-blue clickable" data-entity="${escapeHtml(this._id("charger_power"))}" tabindex="0">${icon("mdi:car-electric")}<small>Billader</small><b class="num"><span data-ref="flowCar" data-v>—</span> kW</b><span class="pct" data-ref="flowCarPct">—</span></div>
        <div class="leg tone-green clickable" data-entity="${escapeHtml(this._id("house_power"))}" tabindex="0">${icon("mdi:home")}<small>Hus uden bil</small><b class="num"><span data-ref="flowHouse" data-v>—</span> kW</b><span class="pct" data-ref="flowHousePct">—</span></div>
      </div>
    </div>
  </section>

  <section class="card a-charge" ${has("charger_power") ? "" : "hidden"}>
    <div class="card-head">${icon("mdi:car-electric")}<h3 style="font-size:19px;font-weight:700">Opladning</h3><span class="status-chip tone-neutral" data-ref="chargeChip">${icon("mdi:power-plug-off-outline")}<span data-ref="chargeChipText">—</span></span></div>
    <div class="charge-body">
      <svg class="charger-art" data-ref="chargerArt" viewBox="0 0 140 196" aria-hidden="true">
        <path class="cable" d="M57 160 C57 188 96 192 108 170 L112 132"/>
        <path class="cable-core" d="M57 160 C57 188 96 192 108 170 L112 132"/>
        <path class="flow" d="M57 160 C57 188 96 192 108 170 L112 132"/>
        <rect class="body" x="16" y="6" width="82" height="156" rx="24"/>
        <rect class="face" x="25" y="16" width="64" height="136" rx="17"/>
        <circle class="detail" cx="57" cy="36" r="6"/>
        <rect class="led" x="53" y="118" width="8" height="22" rx="4"/>
        <path class="bolt" d="M62 58 L46 84 L56 84 L51 106 L69 76 L58 76 Z"/>
        <rect class="plug" x="102" y="100" width="20" height="34" rx="6"/>
        <rect class="pin" x="106" y="92" width="4" height="10" rx="1.5"/><rect class="pin" x="114" y="92" width="4" height="10" rx="1.5"/>
      </svg>
      <div class="facts">
        <div class="fact" style="--tone:var(--energy-blue)"><small>Aktuel effekt</small><b class="num"><span data-ref="chargePower" data-v>—</span> kW</b></div>
        <div class="fact" data-ref="chargeTodayRow" style="--tone:var(--energy-green)" ${has("charger_energy_today") ? "" : "hidden"}><small>Tilført i dag</small><b class="num"><span data-ref="chargeToday" data-v>—</span> kWh</b></div>
        <div class="fact" data-ref="chargeSessionRow" style="--tone:var(--energy-cyan)" ${has("charger_session_energy") ? "" : "hidden"}><small>Denne session</small><b class="num"><span data-ref="chargeSession" data-v>—</span> kWh</b></div>
        <div class="fact" data-ref="chargeModeRow" ${has("charger_mode") ? "" : "hidden"}><small>Opladningsstatus</small><b class="txt" data-ref="chargeMode" data-v>—</b></div>
        <div class="bar-row" data-ref="chargeUtilRow" hidden><div class="bar tone-green"><i data-ref="chargeUtil"></i></div><span data-ref="chargeUtilText">—</span></div>
      </div>
    </div>
  </section>

  <section class="card a-energy" ${has("house_energy_today") ? "" : "hidden"}>
    <div class="panel-head" style="margin-bottom:0">
      <div class="panel-title">${icon("mdi:chart-bar", "lead")}<div><h2>Dagens elforbrug</h2><div class="sub">Akkumuleret forbrug indtil nu i dag</div></div></div>
      <span class="tag">${icon("mdi:calendar-today")}I dag</span>
    </div>
    <div class="energy-rows">
      <div class="erow tone-green clickable" data-entity="${escapeHtml(this._id("house_energy_today"))}" tabindex="0">${icon("mdi:home")}<span class="name">Hus uden bil</span><span class="val num"><span data-ref="eHouse" data-v>—</span> kWh</span><div class="bar"><i data-ref="eHouseBar"></i></div><span class="share" data-ref="eHouseShare">—</span></div>
      <div class="erow tone-blue clickable" data-ref="eCarRow" data-entity="${escapeHtml(this._id("charger_energy_today"))}" tabindex="0" ${has("charger_energy_today") ? "" : "hidden"}>${icon("mdi:car-electric")}<span class="name">Bilopladning</span><span class="val num"><span data-ref="eCar" data-v>—</span> kWh</span><div class="bar"><i data-ref="eCarBar"></i></div><span class="share" data-ref="eCarShare">—</span></div>
      <div class="erow tone-purple" data-ref="eTotalRow" hidden>${icon("mdi:lightning-bolt")}<span class="name">Samlet elforbrug</span><span class="val num"><span data-ref="eTotal" data-v>—</span> kWh</span><div class="bar"><i data-ref="eTotalBar"></i></div><span class="share" data-ref="eTotalShare">100 %</span></div>
    </div>
  </section>

  <section class="card a-tomorrow">
    <div class="panel-head" style="margin-bottom:0">
      <div class="panel-title">${icon("mdi:calendar-arrow-right", "lead")}<div><h2>I morgen</h2><div class="sub">Forventede elpriser – brug dem til planlægning af opladning</div></div></div>
    </div>
    <div data-ref="tomorrowBody"></div>
  </section>

  <footer class="footer">
    <span>${icon("mdi:information-outline")}Denne visning bruger direkte el-entiteter fra Home Assistant. Elpriser, forbrug og opladningsdata beregnes ud fra dine målere og prisdata.</span>
    <span>${icon("mdi:database-outline")}<span data-ref="footerCounts">—</span></span>
  </footer>
</div>`;

    this._refs = {};
    this.shadowRoot.querySelectorAll("[data-ref]").forEach((el) => {
      this._refs[el.dataset.ref] = el;
    });
    // Ikonet i Ladeanbefaling-boksen skal kunne skifte.
    this._refs.adviceIcon = this._refs.adviceBox.querySelector("ha-icon");
    this._refs.adviceNoteIcon = this._refs.adviceNote1.querySelector("ha-icon");
    this._refs.chargeChipIcon = this._refs.chargeChip.querySelector("ha-icon");
    this._firstChart = true;
    this._shown.clear();
    this._bindInteractions();
    if (this._ro) {
      this._ro.disconnect();
      this._chartWidth = 0;
      this._ro.observe(this._refs.todayChart);
    }
  }

  _bindInteractions() {
    if (this._interactionsBound) return;
    this._interactionsBound = true;
    const root = this.shadowRoot;
    const openMoreInfo = (el) => {
      const entityId = el?.dataset?.entity;
      if (!entityId) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
    };
    root.addEventListener("click", (ev) => {
      if (ev.target.closest?.(".hover-layer")) return;
      openMoreInfo(ev.target.closest?.("[data-entity]"));
    });
    root.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const el = ev.target.closest?.("[data-entity]");
      if (el) {
        ev.preventDefault();
        openMoreInfo(el);
      }
    });
  }

  /* ---------- små DOM-hjælpere ---------- */

  _text(ref, value) {
    const el = this._refs[ref];
    if (el && this._shown.get(ref) !== value) {
      this._shown.set(ref, value);
      el.textContent = value;
    }
  }

  _toneClass(el, tone) {
    if (!el) return;
    for (const t of ["green", "blue", "orange", "red", "neutral", "purple"]) el.classList.toggle(`tone-${t}`, t === tone);
  }

  _show(ref, visible) {
    const el = this._refs[ref];
    if (el && el.hidden === Boolean(visible)) el.hidden = !visible;
  }

  _setIcon(el, name) {
    if (el && el.getAttribute("icon") !== name) el.setAttribute("icon", name);
  }

  /**
   * Interpolerer et tal fra forrige til ny værdi (kun tekst – ingen layout-arbejde).
   * Alle aktive interpolationer deler én requestAnimationFrame-løkke, som stopper af sig selv.
   */
  _tweenNumber(ref, to, format) {
    if (!this._refs[ref]) return;
    const key = `tw-${ref}`;
    const running = this._tweens.get(ref);
    const from = running ? running.current : this._shown.get(key);
    this._shown.set(key, to);
    const finalText = format(to);
    const canAnimate = !this._reducedMotion && this._active && Number.isFinite(from) && Number.isFinite(to) && format(from) !== finalText;
    if (!canAnimate) {
      this._tweens.delete(ref);
      this._text(ref, finalText);
      return;
    }
    this._tweens.set(ref, { from, to, current: from, t0: performance.now(), format });
    if (!this._tweenFrame) this._tweenFrame = requestAnimationFrame((t) => this._stepTweens(t));
  }

  _stepTweens(now) {
    this._tweenFrame = undefined;
    for (const [ref, tw] of this._tweens) {
      const k = clamp((now - tw.t0) / NUMBER_TWEEN_MS, 0, 1);
      tw.current = tw.from + (tw.to - tw.from) * (1 - (1 - k) ** 3);
      this._text(ref, tw.format(k >= 1 ? tw.to : tw.current));
      if (k >= 1) this._tweens.delete(ref);
    }
    if (this._tweens.size && this._active) this._tweenFrame = requestAnimationFrame((t) => this._stepTweens(t));
    else this._flushTweens();
  }

  /** Springer til slutværdierne (fx når kortet skjules midt i en interpolation). */
  _flushTweens() {
    for (const [ref, tw] of this._tweens) this._text(ref, tw.format(tw.to));
    this._tweens.clear();
  }

  /* ---------- header ---------- */

  _updateHeader() {
    const connected = this._hass.connected !== false;
    this._toneClass(this._refs.hdrOnline, connected ? "green" : "red");
    this._text("hdrOnlineText", connected ? "Online" : "Offline");

    const missing = this._allEntityIds().filter((id) => {
      const s = this._hass.states[id];
      return !s || s.state === "unavailable";
    });
    this._toneClass(this._refs.hdrSystem, missing.length ? "orange" : "green");
    this._text("hdrSystemText", missing.length ? `${missing.length} ${missing.length === 1 ? "sensor utilgængelig" : "sensorer utilgængelige"}` : "Alt er OK");
    this._refs.hdrSystem.title = missing.length ? `Utilgængelige: ${missing.join(", ")}` : "";
    this._updateHeaderClock();
  }

  _updateHeaderClock() {
    if (!this._clock) return;
    const now = Date.now();
    this._text("hdrDate", this._clock.longDate(now));
    this._text("hdrTime", `Kl. ${this._clock.time(now)}`);
  }

  /* ---------- priser ---------- */

  /** Genberegner kun prisanalysen når rå prislister, dato eller tilgængelighed ændrer sig. */
  _priceModel() {
    const now = Date.now();
    const todayKey = this._clock.dateKey(now);
    const priceObj = this._stateObj("price");
    const tomorrowObj = this._stateObj("tomorrow");
    const todayRaw = priceObj?.attributes?.prices;
    const tomorrowRaw = tomorrowObj?.attributes?.prices;
    const tomorrowOn = tomorrowObj?.state === "on";
    const cache = this._priceCache;
    if (cache.todayRaw !== todayRaw || cache.tomorrowRaw !== tomorrowRaw || cache.tomorrowOn !== tomorrowOn || cache.dateKey !== todayKey) {
      const tomorrowKey = shiftDateKey(todayKey, 1);
      const todayList = parsePriceList(todayRaw);
      // Nogle integrationer leverer i dag + i morgen i samme liste – filtrér på dato.
      const today = todayList.filter((e) => e.dateKey === todayKey);
      const tomorrowSource = parsePriceList(tomorrowRaw);
      const tomorrow = tomorrowOn ? tomorrowSource.filter((e) => e.dateKey === tomorrowKey) : [];
      if (todayRaw !== undefined && !Array.isArray(todayRaw)) this._warnOnce("prices-shape", `Attributten 'prices' på ${this._id("price")} er ikke en liste`);
      Object.assign(cache, {
        todayRaw,
        tomorrowRaw,
        tomorrowOn,
        dateKey: todayKey,
        today,
        tomorrow,
        todayAnalysis: analyzePrices(today),
        tomorrowAnalysis: analyzePrices(tomorrow),
        todayDomain: today.length ? dayDomain(today, todayKey) : undefined,
        tomorrowDomain: tomorrow.length ? dayDomain(tomorrow, tomorrowKey) : undefined,
        availableAt: typeof tomorrowObj?.attributes?.available_at === "string" ? tomorrowObj.attributes.available_at : undefined,
        version: (cache.version || 0) + 1,
      });
    }
    const current = cache.today.find((e) => e.start <= now && now < e.end);
    return { ...cache, now, current };
  }

  _updatePrices(force) {
    const m = this._priceModel();
    const a = m.todayAnalysis;
    // Sensorens state er den autoritative aktuelle pris; prislisten er fallback.
    const nowPrice = this._num("price") ?? m.current?.price;
    const pct = a ? percentileOf(a.sorted, nowPrice) : undefined;
    const band = bandFor(pct);
    const dev = deviationPct(nowPrice, a?.avg);

    // KPI: Strømpris nu
    this._tweenNumber("priceNow", nowPrice, fmtPrice);
    const devTone = !Number.isFinite(dev) ? "neutral" : dev <= 0 ? "green" : dev >= STRONG_DEVIATION_PCT ? "red" : "orange";
    this._toneClass(this._refs.priceBig, band?.tone || "blue");
    this._toneClass(this._refs.priceDeltaPill, devTone);
    this._setHtml("priceDeltaPill", Number.isFinite(dev)
      ? `${icon(dev <= 0 ? "mdi:arrow-down" : "mdi:arrow-up")}${fmtPct(Math.abs(dev))} %`
      : "—");

    // KPI: min / max / gennemsnit
    this._text("minVal", fmtPrice(a?.min));
    this._text("maxVal", fmtPrice(a?.max));
    this._text("avgVal", fmtPrice(a?.avg));
    this._text("minTime", a ? `kl. ${a.minEntry.label}` : "—");
    this._text("maxTime", a ? `kl. ${a.maxEntry.label}` : "—");

    this._updateAdvice(m, nowPrice, band, dev);
    this._updateVsMini(m, nowPrice, dev, devTone);
    this._updateComposition();

    // Grafer gentegnes kun ved nye data eller når "nu" flytter til et nyt tidsrum.
    const chartKey = `${m.version}|${m.current?.start}|${nowPrice}`;
    if (force || chartKey !== this._chartKey) {
      this._chartKey = chartKey;
      this._renderTodayChart(m, nowPrice);
      this._renderTomorrow(m);
    }
    this._updateNowLabel(m);
  }

  _updateAdvice(m, nowPrice, band, dev) {
    const box = this._refs.adviceBox;
    if (!band) {
      this._toneClass(box, "neutral");
      this._toneClass(this._refs.advice, "neutral");
      box.classList.remove("glow");
      this._text("adviceTitle", "Ingen prisdata");
      this._text("adviceLevel", "Anbefaling kræver dagens priser");
      this._show("adviceNote1", false);
      this._show("adviceNote2", false);
      return;
    }
    this._toneClass(box, band.tone);
    this._toneClass(this._refs.advice, band.tone);
    box.classList.toggle("glow", band.key === "cheap" || band.key === "very-cheap");
    this._setIcon(this._refs.adviceIcon, band.tone === "green" ? "mdi:power-plug" : band.tone === "blue" ? "mdi:power-plug-outline" : "mdi:power-plug-off-outline");
    this._text("adviceTitle", band.advice);
    this._text("adviceLevel", `${band.level} i forhold til dagens priser`);

    this._show("adviceNote1", Number.isFinite(dev));
    if (Number.isFinite(dev)) {
      const rounded = Math.round(Math.abs(dev));
      this._setIcon(this._refs.adviceNoteIcon, dev <= 0 ? "mdi:check-circle" : "mdi:alert-circle-outline");
      this._text("adviceText", rounded < NEUTRAL_DEVIATION_PCT
        ? "Strømprisen er på niveau med dagsgennemsnittet"
        : `Strømprisen er ${rounded} % ${dev < 0 ? "lavere" : "højere"} end dagsgennemsnittet`);
    }

    // Billigste kommende tidsrum (resten af i dag + i morgen, hvis offentliggjort).
    const upcoming = [...m.today, ...m.tomorrow].filter((e) => e.end > m.now);
    const cheapest = upcoming.reduce((best, e) => (!best || e.price < best.price ? e : best), undefined);
    this._show("adviceNote2", Boolean(cheapest));
    if (cheapest) {
      const isNow = cheapest.start <= m.now;
      const when = cheapest.dateKey !== m.dateKey ? `i morgen kl. ${cheapest.label}` : `kl. ${cheapest.label}`;
      this._text("adviceNext", isNow ? "Lige nu er det billigste kommende tidsrum" : `Billigst ${when} · ${fmtPrice(cheapest.price)} kr/kWh`);
    }
  }

  _updateVsMini(m, nowPrice, dev, devTone) {
    this._tweenNumber("vsPrice", nowPrice, fmtPrice);
    this._toneClass(this._refs.vsMini, devTone === "neutral" ? "blue" : devTone);
    this._toneClass(this._refs.vsPill, devTone);
    this._setHtml("vsPill", Number.isFinite(dev)
      ? `${icon(dev <= 0 ? "mdi:arrow-down" : "mdi:arrow-up")}${Math.round(Math.abs(dev)) < NEUTRAL_DEVIATION_PCT ? "På niveau" : `${fmtPct(Math.abs(dev))} % ${dev < 0 ? "lavere" : "højere"}`}`
      : "—");
    // Lille linje over dagens rigtige priser med "nu"-punkt.
    const a = m.todayAnalysis;
    const svg = this._refs.vsLine;
    if (!a || !m.todayDomain) {
      svg.innerHTML = "";
      return;
    }
    const span = a.max - a.min || 1;
    const { start, end } = m.todayDomain;
    const toX = (t) => ((t - start) / (end - start)) * 100;
    const toY = (v) => 36 - ((v - a.min) / span) * 32;
    const d = splitOnGaps(m.today)
      .map((seg) => monotonePath(seg.map((e) => [toX((e.start + e.end) / 2), toY(e.price)])))
      .join("");
    const dot = m.current ? `<circle cx="${toX((m.current.start + m.current.end) / 2).toFixed(2)}" cy="${toY(m.current.price).toFixed(2)}" r="2.2"/>` : "";
    const markup = `<path d="${d}"/>${dot}`;
    if (this._shown.get("vsLineSvg") !== markup) {
      this._shown.set("vsLineSvg", markup);
      svg.innerHTML = markup;
    }
  }

  _updateComposition() {
    const el = this._refs.composition;
    const spot = this._num("spot_price");
    const componentIds = Array.isArray(this._config.entities.price_components) ? this._config.entities.price_components : [];
    const parts = componentIds.map((id) => toNumber(this._hass.states[id]?.state));
    const extras = parts.length && parts.every(Number.isFinite) ? parts.reduce((s, v) => s + v, 0) : undefined;
    const co2 = this._num("co2");
    const fossil = this._num("fossil_share");
    const items = [];
    if (Number.isFinite(spot)) items.push(`Spotpris <b>${fmtPrice(spot)}</b> kr`);
    if (Number.isFinite(extras)) items.push(`Net, tariffer &amp; afgifter <b>${fmtPrice(extras)}</b> kr`);
    if (Number.isFinite(co2)) items.push(`CO₂ <b>${fmtNumber(co2, 0)}</b> g/kWh${Number.isFinite(fossil) ? ` · <b>${fmtPct(fossil)} %</b> fossil` : ""}`);
    const markup = items.map((i) => `<span>${i}</span>`).join("");
    if (this._shown.get("composition") !== markup) {
      this._shown.set("composition", markup);
      el.innerHTML = markup;
    }
    this._show("composition", items.length > 0);
  }

  /* ---------- prisgraf: i dag ---------- */

  _renderTodayChart(m, nowPrice) {
    const host = this._refs.todayChart;
    const a = m.todayAnalysis;
    if (!a || !m.todayDomain) {
      host.innerHTML = `<div class="empty">${icon("mdi:chart-line-variant")}<b>Dagens priser er ikke tilgængelige lige nu</b><span>Grafen vises igen, så snart prislisten er opdateret.</span></div>`;
      this._chartGeom = undefined;
      return;
    }
    const { start, end } = m.todayDomain;
    const scale = niceScale(a.min, a.max);
    const xPct = (t) => ((t - start) / (end - start)) * 100;
    const yPct = (v) => (1 - (v - scale.lo) / (scale.hi - scale.lo)) * 100;
    const W = 1000;
    const H = 300;
    const X = (t) => (xPct(t) / 100) * W;
    const Y = (v) => (yPct(v) / 100) * H;
    const zeroY = Y(0);
    const mid = (e) => (e.start + e.end) / 2;

    const segments = splitOnGaps(m.today);
    let line = "";
    let area = "";
    for (const seg of segments) {
      const pts = seg.map((e) => [X(mid(e)), Y(e.price)]);
      const d = monotonePath(pts);
      line += d;
      area += `${d}L${pts[pts.length - 1][0].toFixed(2)},${zeroY.toFixed(2)}L${pts[0][0].toFixed(2)},${zeroY.toFixed(2)}Z`;
    }
    const grid = scale.ticks.map((v) => `<line class="${v === 0 ? "zero-line" : "grid-line"}" x1="0" x2="${W}" y1="${Y(v).toFixed(2)}" y2="${Y(v).toFixed(2)}"/>`).join("");
    const avgY = Number.isFinite(a.avg) ? Y(a.avg).toFixed(2) : undefined;
    const cur = m.current;
    const curPrice = Number.isFinite(nowPrice) ? nowPrice : cur?.price;
    const nowX = cur ? X(mid(cur)).toFixed(2) : undefined;
    const vlines = [
      cur && Number.isFinite(curPrice) ? `<line class="v-line now" x1="${nowX}" x2="${nowX}" y1="${Y(curPrice).toFixed(2)}" y2="${H}"/>` : "",
      a.maxEntry !== cur ? `<line class="v-line max" x1="${X(mid(a.maxEntry)).toFixed(2)}" x2="${X(mid(a.maxEntry)).toFixed(2)}" y1="${Y(a.max).toFixed(2)}" y2="${H}"/>` : "",
    ].join("");

    // Markører og callouts (HTML, så cirkler/tekst ikke forvrænges af SVG-skaleringen).
    const oldPlot = host.querySelector(".plot");
    const plotWidth = oldPlot?.clientWidth || this._refs.todayChart.clientWidth || 700;
    const plotHeight = oldPlot?.clientHeight || DEFAULT_PLOT_HEIGHT_PX;
    const spanPct = (CALLOUT_WIDTH_PX / plotWidth) * 100;
    const pos = (e, v) => ({ x: xPct(mid(e)), y: yPct(v) });
    const cur_ = cur && Number.isFinite(curPrice) ? cur : undefined;
    const nowIsMin = cur_ && cur_ === a.minEntry;
    const nowIsMax = cur_ && cur_ === a.maxEntry;
    const items = [];
    if (!nowIsMin) items.push({ ...pos(a.minEntry, a.min), tone: "green", title: "Min", price: a.min, time: `kl. ${a.minEntry.label}` });
    if (!nowIsMax && a.maxEntry !== a.minEntry) items.push({ ...pos(a.maxEntry, a.max), tone: "red", title: "Max", price: a.max, time: `kl. ${a.maxEntry.label}` });
    if (cur_) {
      const extra = nowIsMin ? " · dagens laveste" : nowIsMax ? " · dagens højeste" : "";
      items.push({ ...pos(cur_, curPrice), tone: "blue", title: `Nu${extra}`, price: curPrice, now: true });
    }
    this._placeCallouts(items, spanPct);
    const nowP = items.find((i) => i.now);
    const points = m.today.map((e) => `<span class="pt" style="left:${xPct(mid(e)).toFixed(3)}%;top:${yPct(e.price).toFixed(3)}%"></span>`).join("");
    const markers = items.map((i) => `<span class="mk ${i.now ? "now" : ""} tone-${i.tone}" style="left:${i.x}%;top:${i.y}%"></span>`);
    const callouts = items.map((i) => `<div class="callout tone-${i.tone} ${i.anchor} ${i.below ? "below" : ""}" style="left:${i.x}%;top:${i.y}%"><b>${i.title}</b>${fmtPrice(i.price)} kr/kWh<br>${i.now ? "<span data-now-time>kl. —</span>" : i.time}</div>`);
    if (avgY !== undefined) {
      // Gns.-labelen sidder ved højre eller venstre kant af gennemsnitslinjen – på den side,
      // hvor den ikke rammer Min/Max/Nu. Er begge sider optaget, udelades labelen (linjen står).
      const y = yPct(a.avg);
      const side = this._avgLabelSide(items, y, spanPct, plotWidth, plotHeight);
      if (side) {
        callouts.push(`<div class="callout avg ${side === "left" ? "at-left" : ""}" style="--tone:var(--energy-text);left:${side === "left" ? 0 : 100}%;top:${y}%"><b style="color:var(--energy-muted)">Gns.</b>${fmtPrice(a.avg)} kr/kWh</div>`);
      }
    }

    const yLabels = scale.ticks.map((v) => `<span style="top:${yPct(v).toFixed(3)}%">${fmtNumber(v, axisDecimals(scale.step))}</span>`).join("");
    const xLabels = m.today
      .filter((e) => e.label.endsWith(":00") && Number(e.label.slice(0, 2)) % 2 === 0)
      .map((e) => {
        const h = Number(e.label.slice(0, 2));
        return `<span class="${h % 6 ? "minor" : ""}" style="left:${xPct(mid(e)).toFixed(3)}%">${e.label.slice(0, 2)}</span>`;
      })
      .join("");

    const draw = this._firstChart && !this._reducedMotion;
    this._firstChart = false;
    host.innerHTML = `
<div class="chart">
  <div class="y-unit">kr/kWh</div>
  <div class="y-axis">${yLabels}</div>
  <div class="plot ${draw ? "draw" : ""}">
    <svg class="lines" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      ${grid}
      <path class="price-area" d="${area}"/>
      ${avgY !== undefined ? `<line class="avg-line" x1="0" x2="${W}" y1="${avgY}" y2="${avgY}"/>` : ""}
      ${vlines}
      <path class="price-line" d="${line}"/>
    </svg>
    <div class="markers">${points}${markers.join("")}${callouts.join("")}</div>
    <div class="hover-layer" role="img" aria-label="Dagens strømpriser time for time"></div>
    <div class="hover-line" hidden></div>
    <div class="tip" hidden></div>
  </div>
  <div class="x-axis">${xLabels}</div>
</div>`;
    this._chartGeom = { entries: m.today, analysis: a, xPct, start, end };
    this._attachTooltip(host.querySelector(".plot"), () => this._chartGeom, (e, geom) => {
      const p = percentileOf(geom.analysis.sorted, e.price);
      const band = bandFor(p);
      return {
        tone: band?.tone || "blue",
        html: `<span>kl. ${e.label}–${this._clock.time(e.end)}</span><b>${fmtPrice(e.price)} kr/kWh</b><em>${band?.level || ""}</em> · billigere end ${fmtPct(100 - p)} % af dagens timer`,
        x: geom.xPct((e.start + e.end) / 2),
        y: (1 - (e.price - scale.lo) / (scale.hi - scale.lo)) * 100,
      };
    });
    this._shown.delete("nowLabel");
  }

  /**
   * Placerer Min/Max/Nu-labels uden overlap: labels der ligger tæt vandret skubbes væk fra
   * hinanden (den venstre vokser mod venstre, den højre mod højre). Ved kanten, hvor det ikke
   * kan lade sig gøre, flyttes den laveste label under sit punkt.
   */
  _placeCallouts(items, spanPct) {
    const edge = spanPct / 2 + 1;
    for (const i of items) i.anchor = i.x < edge ? "left" : i.x > 100 - edge ? "right" : "";
    const sorted = [...items].sort((p, q) => p.x - q.x);
    for (let k = 0; k < sorted.length - 1; k++) {
      const p = sorted[k];
      const q = sorted[k + 1];
      if (q.x - p.x >= spanPct) continue;
      const canLeft = p.x > spanPct * 0.9;
      const canRight = q.x < 100 - spanPct * 0.9;
      if (canLeft && p.anchor !== "left") p.anchor = "right";
      if (canRight && q.anchor !== "right") q.anchor = "left";
      if ((!canLeft || !canRight) && q.x - p.x < spanPct / 2) {
        const lower = p.y > q.y ? p : q;
        if (lower.y < 72) lower.below = true;
      }
    }
  }

  /** Vandret/lodret udstrækning (i %) af en placeret callout – bruges til kollisionstjek. */
  _calloutBox(i, spanPct, plotWidth, plotHeight) {
    const nudge = (CALLOUT_NUDGE_PX / plotWidth) * 100;
    const h = (CALLOUT_HEIGHT_PX / plotHeight) * 100;
    const gap = (CALLOUT_GAP_PX / plotHeight) * 100;
    const x0 = i.anchor === "left" ? i.x - nudge : i.anchor === "right" ? i.x + nudge - spanPct : i.x - spanPct / 2;
    const y0 = i.below ? i.y + gap : i.y - gap - h;
    return { x0, x1: x0 + spanPct, y0, y1: y0 + h };
  }

  _avgLabelSide(items, y, spanPct, plotWidth, plotHeight) {
    const w = (AVG_LABEL_WIDTH_PX / plotWidth) * 100;
    const h = (AVG_LABEL_HEIGHT_PX / plotHeight) * 100;
    const boxes = items.map((i) => this._calloutBox(i, spanPct, plotWidth, plotHeight));
    const free = (x0, x1) => !boxes.some((b) => b.x0 < x1 && b.x1 > x0 && b.y0 < y + h / 2 && b.y1 > y - h / 2);
    const nowItem = items.find((i) => i.now);
    const order = nowItem && nowItem.x > 60 ? ["left", "right"] : ["right", "left"];
    return order.find((side) => (side === "left" ? free(0, w) : free(100 - w, 100)));
  }

  _updateNowLabel(m) {
    const el = this._refs.todayChart.querySelector("[data-now-time]");
    if (!el) return;
    const text = `kl. ${this._clock.time(m.now)}`;
    if (el.textContent !== text) el.textContent = text;
  }

  /**
   * Fælles tooltip for pris-grafer. Virker med mus (hover) og touch (tryk).
   * Viser pris, tidsrum og placering i dagens prisniveau.
   */
  _attachTooltip(plot, getGeom, describe) {
    if (!plot) return;
    const layer = plot.querySelector(".hover-layer");
    const tip = plot.querySelector(".tip");
    const vline = plot.querySelector(".hover-line");
    const hide = () => {
      tip.hidden = true;
      vline.hidden = true;
    };
    const show = (ev) => {
      const geom = getGeom();
      if (!geom?.entries?.length) return;
      const rect = layer.getBoundingClientRect();
      if (!rect.width) return;
      const t = geom.start + ((ev.clientX - rect.left) / rect.width) * (geom.end - geom.start);
      const e = geom.entries.find((x) => x.start <= t && t < x.end)
        || geom.entries.reduce((best, x) => (Math.abs((x.start + x.end) / 2 - t) < Math.abs((best.start + best.end) / 2 - t) ? x : best));
      const d = describe(e, geom);
      this._toneClass(tip, d.tone);
      tip.innerHTML = d.html;
      tip.style.left = `${clamp(d.x, 12, 88)}%`;
      tip.style.top = `${clamp(d.y, 30, 100)}%`;
      vline.style.left = `${d.x}%`;
      tip.hidden = false;
      vline.hidden = false;
    };
    layer.addEventListener("pointermove", (ev) => {
      if (ev.pointerType === "mouse") show(ev);
    });
    layer.addEventListener("pointerdown", show);
    layer.addEventListener("pointerleave", (ev) => {
      if (ev.pointerType === "mouse") hide();
    });
    layer.addEventListener("click", (ev) => ev.stopPropagation());
    if (!this._tipOutsideBound) {
      this._tipOutsideBound = true;
      this.shadowRoot.addEventListener("pointerdown", (ev) => {
        if (ev.target.closest?.(".hover-layer")) return;
        this.shadowRoot.querySelectorAll(".tip, .hover-line").forEach((el) => {
          el.hidden = true;
        });
      });
    }
  }

  /* ---------- i morgen ---------- */

  _renderTomorrow(m) {
    const host = this._refs.tomorrowBody;
    const a = m.tomorrowAnalysis;
    if (!a || !m.tomorrowDomain) {
      const hint = /^\d{2}:\d{2}/.test(m.availableAt || "") ? `Forventes offentliggjort omkring kl. ${m.availableAt.slice(0, 5)}.` : "Vises automatisk, når priserne er offentliggjort.";
      host.innerHTML = `<div class="empty" style="min-height:130px">${icon("mdi:calendar-clock")}<b>Morgendagens priser er ikke tilgængelige endnu</b><span>${hint}</span></div>`;
      this._tomorrowGeom = undefined;
      return;
    }
    const { start, end } = m.tomorrowDomain;
    const scale = niceScale(a.min, a.max);
    const xPct = (t) => ((t - start) / (end - start)) * 100;
    const yPct = (v) => (1 - (v - scale.lo) / (scale.hi - scale.lo)) * 100;
    const zero = yPct(0);
    const bars = m.tomorrow.map((e) => {
      const band = bandFor(percentileOf(a.sorted, e.price));
      const y = yPct(e.price);
      const top = Math.min(y, zero);
      const height = Math.max(Math.abs(zero - y), 0.8);
      return `<div class="bar-col tone-${band.tone}" style="left:${xPct(e.start).toFixed(3)}%;width:${(xPct(e.end) - xPct(e.start)).toFixed(3)}%"><i class="${e.price < 0 ? "neg" : ""}" style="top:${top.toFixed(3)}%;height:${height.toFixed(3)}%"></i></div>`;
    }).join("");
    // Tre akse-labels: bund, nul (hvis negative priser) eller midte, og top.
    const yTicks = scale.lo < 0 ? [scale.lo, 0, scale.hi] : [scale.lo, (scale.lo + scale.hi) / 2, scale.hi];
    const yLabels = yTicks.map((v) => `<span style="top:${yPct(v).toFixed(3)}%">${fmtNumber(v, axisDecimals(scale.step / 2))}</span>`).join("");
    const xLabels = m.tomorrow
      .filter((e) => e.label.endsWith(":00") && Number(e.label.slice(0, 2)) % 2 === 0)
      .map((e) => {
        const h = Number(e.label.slice(0, 2));
        return `<span class="${h % 6 ? "minor" : ""}" style="left:${xPct((e.start + e.end) / 2).toFixed(3)}%">${e.label.slice(0, 2)}</span>`;
      })
      .join("");
    host.innerHTML = `
<div class="tomorrow-body">
  <div class="bars">
    <div class="y-unit">kr/kWh</div>
    <div class="y-axis">${yLabels}</div>
    <div class="plot">
      ${scale.lo < 0 ? `<svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none"><line class="zero-line" x1="0" x2="100" y1="${zero}" y2="${zero}"/></svg>` : ""}
      ${bars}
      <div class="hover-layer" role="img" aria-label="Morgendagens strømpriser time for time"></div>
      <div class="hover-line" hidden></div>
      <div class="tip" hidden></div>
    </div>
    <div class="x-axis">${xLabels}</div>
  </div>
  <div class="extremes">
    <div class="ext tone-green"><span class="badge">${icon("mdi:arrow-down")}</span><div><small>Laveste pris i morgen</small><b class="num" data-v>${fmtPrice(a.min)} kr/kWh</b><span>kl. ${a.minEntry.label}</span></div></div>
    <div class="ext tone-red"><span class="badge">${icon("mdi:arrow-up")}</span><div><small>Højeste pris i morgen</small><b class="num" data-v>${fmtPrice(a.max)} kr/kWh</b><span>kl. ${a.maxEntry.label}</span></div></div>
  </div>
</div>`;
    this._tomorrowGeom = { entries: m.tomorrow, analysis: a, xPct, start, end };
    this._attachTooltip(host.querySelector(".plot"), () => this._tomorrowGeom, (e, geom) => {
      const p = percentileOf(geom.analysis.sorted, e.price);
      const band = bandFor(p);
      return {
        tone: band?.tone || "blue",
        html: `<span>I morgen kl. ${e.label}–${this._clock.time(e.end)}</span><b>${fmtPrice(e.price)} kr/kWh</b><em>${band?.level || ""}</em> · billigere end ${fmtPct(100 - p)} % af morgendagens timer`,
        x: geom.xPct((e.start + e.end) / 2),
        y: yPct(e.price),
      };
    });
  }

  /* ---------- effekt: hus, billader, fordeling, opladning ---------- */

  /** Laderens maks. effekt: maks. strøm × faser × nominel spænding. Undlades hvis data mangler. */
  _chargerMaxKw() {
    const override = toNumber(this._config.charger_max_power_kw);
    if (override !== undefined && override > 0) return override;
    const amps = this._num("charger_max_current");
    const phaseState = this._stateObj("charger_phases")?.state;
    let phases = toNumber(phaseState);
    if (phases === undefined && typeof phaseState === "string") {
      const match = phaseState.toLowerCase().match(/(\d)[_\s-]*phase/);
      if (match) phases = Number(match[1]);
    }
    if (!(amps > 0) || !(phases > 0)) return undefined;
    return (amps * phases * NOMINAL_PHASE_VOLTAGE) / 1000;
  }

  _updatePower() {
    const houseKw = this._kw("house_power");
    const carKw = this._kw("charger_power");
    const onlineObj = this._stateObj("charger_online");
    const chargerOffline = onlineObj ? onlineObj.state !== "on" : false;
    const charging = Number.isFinite(carKw) && carKw > CHARGING_THRESHOLD_KW;
    const maxKw = this._chargerMaxKw();

    // KPI: Billader effekt med ring
    this._tweenNumber("chargerKpi", carKw, fmtPower);
    const ring = this._refs.ring;
    ring.classList.toggle("active", charging);
    ring.classList.toggle("idle", !charging);
    const util = Number.isFinite(carKw) && maxKw ? clamp((carKw / maxKw) * 100, 0, 100) : undefined;
    const ringPct = util !== undefined ? util : charging ? 100 : 0;
    this._refs.ringVal.style.strokeDasharray = `${ringPct.toFixed(1)} 100`;
    this._refs.ringVal.classList.toggle("zero", ringPct < 0.5);
    this._text("chargerKpiSub", chargerOffline ? "Lader offline" : maxKw ? `Ud af ${fmtPower(maxKw)} kW` : charging ? "Lader" : "Ikke aktiv");

    // KPI + mini: husforbrug
    this._tweenNumber("houseKpi", houseKw, fmtPower);
    this._tweenNumber("houseMini", houseKw, fmtPower);
    this._tweenNumber("chargerMini", carKw, fmtPower);

    // Fordeling (donut). Negative værdier (fx eksport) tælles ikke med i fordelingen.
    const h = Number.isFinite(houseKw) ? Math.max(0, houseKw) : undefined;
    const c = Number.isFinite(carKw) ? Math.max(0, carKw) : undefined;
    const total = (h ?? 0) + (c ?? 0);
    const haveAny = h !== undefined || c !== undefined;
    this._tweenNumber("flowTotal", haveAny ? total : undefined, fmtPower);
    this._text("flowCar", fmtPower(c));
    this._text("flowHouse", fmtPower(h));
    const carPct = total > 0 && c !== undefined ? (c / total) * 100 : undefined;
    const housePct = total > 0 && h !== undefined ? (h / total) * 100 : undefined;
    this._text("flowCarPct", carPct === undefined ? "—" : `${fmtPct(carPct)} %`);
    this._text("flowHousePct", housePct === undefined ? "—" : `${fmtPct(housePct)} %`);
    // Lille mellemrum mellem segmenterne, når begge er synlige.
    const both = (carPct ?? 0) > 0 && (housePct ?? 0) > 0;
    const gap = both ? 1.5 : 0;
    const carLen = Math.max(0, (carPct ?? 0) - gap);
    const houseLen = Math.max(0, (housePct ?? 0) - gap);
    this._refs.segCar.style.strokeDasharray = `${carLen.toFixed(2)} 100`;
    this._refs.segHouse.style.strokeDasharray = `${houseLen.toFixed(2)} 100`;
    this._refs.segCar.classList.toggle("zero", carLen < 0.5);
    this._refs.segHouse.classList.toggle("zero", houseLen < 0.5);
    this._refs.segHouse.style.strokeDashoffset = `${(-(carPct ?? 0)).toFixed(2)}`;

    // Opladningskort
    const modeRaw = this._stateObj("charger_mode")?.state;
    const modeKey = isValidState(modeRaw) ? String(modeRaw).toLowerCase() : undefined;
    const connected = modeKey ? modeKey.startsWith("connected") : false;
    let chip;
    if (chargerOffline) chip = { tone: "red", icon: "mdi:cloud-off-outline", text: "Offline" };
    else if (charging) chip = { tone: "green", icon: "mdi:check-circle", text: "Lader aktiv" };
    else if (modeKey === "connected_finished") chip = { tone: "blue", icon: "mdi:check-circle-outline", text: "Færdig" };
    else if (connected) chip = { tone: "blue", icon: "mdi:power-plug", text: "Tilsluttet" };
    else chip = { tone: "neutral", icon: "mdi:power-plug-off-outline", text: "Ikke aktiv" };
    this._toneClass(this._refs.chargeChip, chip.tone);
    this._setIcon(this._refs.chargeChipIcon, chip.icon);
    this._text("chargeChipText", chip.text);

    const art = this._refs.chargerArt;
    art.classList.toggle("active", charging);
    art.classList.toggle("connected", !charging && connected);
    this._toneClass(art, charging ? "green" : connected ? "blue" : "neutral");

    this._tweenNumber("chargePower", carKw, fmtPower);
    this._text("chargeSession", fmtEnergy(this._kwh("charger_session_energy")));
    const modeLabel = modeKey ? CHARGER_MODE_LABELS[modeKey] || modeKey.replace(/_/g, " ") : "—";
    this._text("chargeMode", chargerOffline ? "Offline" : modeLabel);
    this._toneClass(this._refs.chargeModeRow, charging ? "green" : connected ? "blue" : "neutral");

    this._show("chargeUtilRow", util !== undefined);
    if (util !== undefined) {
      this._refs.chargeUtil.style.setProperty("--p", (util / 100).toFixed(3));
      this._text("chargeUtilText", `${fmtPct(util)} % af ${fmtPower(maxKw)} kW`);
    }

  }

  /* ---------- energi i dag ---------- */

  _updateEnergy() {
    const house = this._kwh("house_energy_today");
    const carConfigured = Boolean(this._id("charger_energy_today")) && Boolean(this._stateObj("charger_energy_today"));
    const car = carConfigured ? this._kwh("charger_energy_today") : undefined;
    this._tweenNumber("houseDay", house, fmtEnergy);
    this._tweenNumber("eHouse", house, fmtEnergy);
    this._tweenNumber("chargeToday", car, fmtEnergy);
    this._show("eCarRow", carConfigured);
    this._tweenNumber("eCar", car, fmtEnergy);

    // Samlet vises kun, når både hus og bil er rigtige energimålinger (kWh) – aldrig gættet fra kW.
    const totalOk = Number.isFinite(house) && Number.isFinite(car);
    const total = totalOk ? Math.max(0, house) + Math.max(0, car) : undefined;
    this._show("eTotalRow", totalOk);
    this._tweenNumber("eTotal", total, fmtEnergy);
    const share = (v) => (totalOk && total > 0 && Number.isFinite(v) ? (Math.max(0, v) / total) * 100 : undefined);
    const setBar = (ref, pct) => this._refs[ref]?.style.setProperty("--p", Number.isFinite(pct) ? (pct / 100).toFixed(3) : "0");
    const houseShare = share(house);
    const carShare = share(car);
    setBar("eHouseBar", totalOk ? houseShare : Number.isFinite(house) ? 100 : 0);
    setBar("eCarBar", carShare);
    setBar("eTotalBar", totalOk && total > 0 ? 100 : 0);
    const shareHtml = (pct) => (Number.isFinite(pct) ? `${fmtPct(pct)} %<small>af samlet forbrug</small>` : "");
    this._setHtml("eHouseShare", shareHtml(houseShare));
    this._setHtml("eCarShare", shareHtml(carShare));
    this._updateDayCompare();
  }

  _setHtml(ref, html) {
    const el = this._refs[ref];
    if (el && this._shown.get(`html-${ref}`) !== html) {
      this._shown.set(`html-${ref}`, html);
      el.innerHTML = html;
    }
  }

  /* ---------- statistik (rigtig historik til sparklines) ---------- */

  _maybeFetchStats() {
    if (!this._active || !this._hass?.callWS || this._statsLoading) return;
    if (Date.now() - this._stats.fetchedAt < STATS_REFRESH_MS) return;
    this._fetchStats();
  }

  async _fetchStats() {
    const powerIds = ["house_power", "charger_power"].map((k) => this._id(k)).filter(Boolean);
    const energyId = this._id("house_energy_total");
    if (!powerIds.length && !energyId) return;
    this._statsLoading = true;
    const now = Date.now();
    try {
      const [power, energy] = await Promise.all([
        powerIds.length
          ? this._hass.callWS({
            type: "recorder/statistics_during_period",
            start_time: new Date(now - SPARK_WINDOW_MS).toISOString(),
            end_time: new Date(now).toISOString(),
            statistic_ids: powerIds,
            period: "5minute",
            types: ["mean"],
            units: { power: "kW" },
          })
          : undefined,
        energyId
          ? this._hass.callWS({
            type: "recorder/statistics_during_period",
            start_time: new Date(now - STATS_HISTORY_MS).toISOString(),
            end_time: new Date(now).toISOString(),
            statistic_ids: [energyId],
            period: "hour",
            types: ["change"],
            units: { energy: "kWh" },
          })
          : undefined,
      ]);
      const bucket = (rows) => {
        const buckets = new Map();
        for (const r of rows || []) {
          const t = statTime(r.start);
          if (!Number.isFinite(t) || !Number.isFinite(r.mean)) continue;
          const k = Math.floor(t / SPARK_BUCKET_MS);
          const b = buckets.get(k) || { sum: 0, n: 0 };
          b.sum += r.mean;
          b.n += 1;
          buckets.set(k, b);
        }
        const first = Math.floor((now - SPARK_WINDOW_MS) / SPARK_BUCKET_MS) + 1;
        const last = Math.floor(now / SPARK_BUCKET_MS);
        const out = [];
        for (let k = first; k <= last; k++) {
          const b = buckets.get(k);
          out.push(b ? b.sum / b.n : undefined);
        }
        return out;
      };
      this._stats.power = {};
      for (const id of powerIds) this._stats.power[id] = bucket(power?.[id]);
      this._stats.energyHourly = (energy?.[energyId] || [])
        .map((r) => ({ start: statTime(r.start), change: r.change }))
        .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.change));
      this._stats.failed = false;
    } catch (err) {
      this._stats.failed = true;
      this._warnOnce("stats", "Kunne ikke hente statistik til sparklines – de skjules", err?.message || err);
    } finally {
      this._stats.fetchedAt = now;
      this._statsLoading = false;
    }
    this._renderSparks();
    this._updateDayCompare();
  }

  _renderSparkInto(ref, values, liveLast) {
    const el = this._refs[ref];
    if (!el) return;
    const finite = (values || []).filter(Number.isFinite);
    if (finite.length < 2) {
      this._show(ref, false);
      return;
    }
    const max = Math.max(...finite, 0);
    const min = Math.min(...finite, 0);
    const span = max - min || 1;
    const markup = values
      .map((v, i) => {
        const h = Number.isFinite(v) ? 6 + ((v - min) / span) * 94 : 0;
        return `<i class="${liveLast && i === values.length - 1 ? "live" : ""}" style="--h:${h.toFixed(1)}%"></i>`;
      })
      .join("");
    if (this._shown.get(`spark-${ref}`) !== markup) {
      this._shown.set(`spark-${ref}`, markup);
      el.innerHTML = markup;
    }
    this._show(ref, true);
  }

  _renderSparks() {
    const houseId = this._id("house_power");
    const carId = this._id("charger_power");
    const house = houseId ? this._stats.power[houseId] : undefined;
    const car = carId ? this._stats.power[carId] : undefined;
    this._renderSparkInto("houseSpark", house, true);
    this._show("houseSparkWrap", !this._refs.houseSpark.hidden);
    this._renderSparkInto("houseMiniSpark", house, true);
    this._renderSparkInto("chargerSpark", car, true);
    // Dagens timeforbrug (afsluttede timer i dag).
    if (this._clock) {
      const todayKey = this._clock.dateKey(Date.now());
      const todayHours = this._stats.energyHourly.filter((r) => this._clock.dateKey(r.start) === todayKey).map((r) => Math.max(0, r.change));
      this._renderSparkInto("houseDaySpark", todayHours, false);
    }
  }

  /** Dagens forbrug sammenlignet med samme tidspunkt i går (fra timestatistik). */
  _updateDayCompare() {
    const today = this._kwh("house_energy_today");
    const rows = this._stats.energyHourly;
    if (!this._clock || !Number.isFinite(today) || !rows.length) {
      this._show("houseDayCompare", false);
      return;
    }
    const now = Date.now();
    const yesterdayKey = shiftDateKey(this._clock.dateKey(now), -1);
    const sameTimeYesterday = now - DAY_MS;
    let sum = 0;
    let hours = 0;
    for (const r of rows) {
      if (this._clock.dateKey(r.start) !== yesterdayKey) continue;
      hours += 1;
      if (r.start + HOUR_MS <= sameTimeYesterday) sum += r.change;
      else if (r.start < sameTimeYesterday) sum += r.change * ((sameTimeYesterday - r.start) / HOUR_MS);
    }
    const dev = hours ? deviationPct(today, sum) : undefined;
    this._show("houseDayCompare", Number.isFinite(dev));
    if (!Number.isFinite(dev)) return;
    const pill = this._refs.houseDayComparePill;
    this._toneClass(pill, dev <= 0 ? "green" : "orange");
    this._setHtml("houseDayComparePill", `${icon(dev <= 0 ? "mdi:arrow-down" : "mdi:arrow-up")}${fmtPct(Math.abs(dev))} %`);
  }

  /* ---------- footer ---------- */

  _updateFooter() {
    const shown = [...this.shadowRoot.querySelectorAll("[data-v]")].filter((el) => {
      if (el.closest("[hidden]")) return false;
      const t = el.textContent.trim();
      return t && !t.startsWith("—");
    }).length;
    const sources = this._allEntityIds().filter((id) => this._hass.states[id]).length;
    this._text("footerCounts", `${shown} viste værdier • ${sources} kildesensorer`);
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, HAElectricityDashboardCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "HA Electricity Dashboard Card",
    description: "Samlet el-dashboard: strømpris, dagens og morgendagens priser, ladeanbefaling, live hus/bil-fordeling og opladning",
    preview: false,
  });
}
console.info(`%c ELECTRICITY DASHBOARD %c v${VERSION} `, "color:#04121f;background:#22d3ff;font-weight:700", "color:#bfefff;background:#0b1a30");
