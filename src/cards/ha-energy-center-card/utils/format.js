/* Rene hjælpefunktioner: tal, enheder, formattering og markup. Ingen DOM-tilstand. */

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const INVALID_STATES = new Set(["unknown", "unavailable", "none", "null", "undefined", ""]);

export const isValidState = (state) => state != null && !INVALID_STATES.has(String(state).trim().toLowerCase());

export function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (!isValidState(value)) return undefined;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- enheder ---------- */

const UNIT_TABLES = {
  power: { w: 1, kw: 1000, mw: 1e6 }, // → W
  energy: { wh: 0.001, kwh: 1, mwh: 1000 }, // → kWh
  volume: { "m³": 1, m3: 1, l: 0.001, liter: 0.001 }, // → m³
  flow: { "l/min": 1, "l/h": 1 / 60, "m³/h": 1000 / 60, "m3/h": 1000 / 60 }, // → L/min
};

/**
 * Normaliserer en state til en fast basisenhed ud fra dens egen unit_of_measurement.
 * Returnerer { value, known } — known=false betyder ukendt enhed (værdien bruges så ikke).
 */
export function normalize(stateObj, kind) {
  if (!stateObj) return { value: undefined, known: true };
  const n = toNumber(stateObj.state);
  const unit = String(stateObj.attributes?.unit_of_measurement ?? "").trim().toLowerCase();
  const table = UNIT_TABLES[kind];
  if (!table) return { value: n, known: true };
  // Mangler enheden helt, antages basisenheden (mange template-sensorer har ingen enhed).
  const factor = unit ? table[unit] : 1;
  if (factor === undefined) return { value: undefined, known: false, unit };
  return { value: n === undefined ? undefined : n * factor, known: true };
}

/* ---------- formattering (dansk) ---------- */

const numberFormats = new Map();
export function fmt(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  let f = numberFormats.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(digits, f);
  }
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return f.format(rounded === 0 ? 0 : rounded); // undgå "-0,0"
}

/** Effekt i W → { v, u } med automatisk W/kW. */
export function fmtPower(watts) {
  if (!Number.isFinite(watts)) return { v: "—", u: "W" };
  const abs = Math.abs(watts);
  if (abs >= 1000) return { v: fmt(watts / 1000, abs >= 10000 ? 1 : 2), u: "kW" };
  return { v: fmt(watts, abs < 10 ? 1 : 0), u: "W" };
}

/** Energi i kWh → { v, u } med automatisk Wh/kWh/MWh. */
export function fmtEnergy(kwh) {
  if (!Number.isFinite(kwh)) return { v: "—", u: "kWh" };
  const abs = Math.abs(kwh);
  if (abs >= 10000) return { v: fmt(kwh / 1000, 1), u: "MWh" };
  if (abs < 1 && abs > 0) return { v: fmt(kwh * 1000, 0), u: "Wh" };
  return { v: fmt(kwh, abs >= 100 ? 0 : 1), u: "kWh" };
}

/** Volumen i m³ → liter under 10 m³, ellers m³. */
export function fmtVolume(m3) {
  if (!Number.isFinite(m3)) return { v: "—", u: "L" };
  if (Math.abs(m3) < 10) return { v: fmt(m3 * 1000, 0), u: "L" };
  return { v: fmt(m3, 1), u: "m³" };
}

export const fmtKr = (v) => (Number.isFinite(v) ? `${fmt(v, 2)} kr` : "—");
export const fmtPct = (v) => (Number.isFinite(v) ? `${fmt(v, 0)} %` : "—");

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const icon = (name, cls = "") => `<ha-icon class="ic ${cls}" icon="${escapeHtml(name)}"></ha-icon>`;

/* ---------- tid (browserens lokale tid = HA's tidszone på kiosk/tablets) ---------- */

export const pad2 = (n) => String(n).padStart(2, "0");

export function startOfDay(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ms, days) {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function startOfMonth(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

export function addMonths(ms, months) {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/** Nøgle der skifter hver time — bruges til cache-udløb og time-tick. */
export const hourKey = (ms = Date.now()) => Math.floor(ms / HOUR_MS);

const timeFmt = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFmt = new Intl.DateTimeFormat("da-DK", { weekday: "short", day: "numeric", month: "short" });
const dateFmt = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short" });
const monthFmt = new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric" });
const monthShortFmt = new Intl.DateTimeFormat("da-DK", { month: "short" });

export const fmtTime = (ms) => timeFmt.format(ms).replace(".", ":");
export const fmtDay = (ms) => dayFmt.format(ms);
export const fmtDate = (ms) => dateFmt.format(ms);
export const fmtMonth = (ms) => {
  const s = monthFmt.format(ms);
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const fmtMonthShort = (ms) => monthShortFmt.format(ms).replace(".", "");

export const statTime = (value) => (typeof value === "number" ? value : Date.parse(value));
