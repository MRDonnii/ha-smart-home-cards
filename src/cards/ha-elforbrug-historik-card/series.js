// Pure logic of ha-elforbrug-historik-card (no DOM), so it can be tested in Node.
export const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
export const MONTHS_LONG = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

const nf = (d = 0) => new Intl.NumberFormat("da-DK", { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmt = (n, d = 0) => (n == null || !Number.isFinite(n) ? "–" : nf(d).format(n));
export const pct = (a, b) => (b > 0 && a != null ? ((a - b) / b) * 100 : null);
export const fmtPct = (p) => (p == null ? "–" : `${p > 0 ? "+" : p < 0 ? "−" : ""}${nf(0).format(Math.abs(p))} %`);
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);


/** rows: [{start: ms|ISO, change}] -> {years:{2021:[12 x number|null]}, latest:{y,m}} */
export function buildSeries(rows) {
  const years = {};
  let latest = null;
  for (const r of rows || []) {
    const d = new Date(r.start);
    const y = d.getFullYear();
    const m = d.getMonth();
    const v = Number(r.change);
    if (!Number.isFinite(v)) continue;
    (years[y] ||= Array(12).fill(null))[m] = v;
    if (!latest || y * 12 + m > latest.y * 12 + latest.m) latest = { y, m };
  }
  return { years, latest };
}

/** Key figures. now = Date. The current month is preliminary and does not count in comparisons. */
export function computeModel(series, now = new Date(), forecastMonth = null) {
  const { years } = series;
  const cy = now.getFullYear();
  const cm = now.getMonth();
  const val = (y, m) => years[y]?.[m] ?? null;
  const complete = [];
  for (const y of Object.keys(years).map(Number).sort((a, b) => a - b)) {
    for (let m = 0; m < 12; m++) {
      if (val(y, m) == null) continue;
      if (y === cy && m === cm) continue;
      if (y * 12 + m > cy * 12 + cm) continue;
      complete.push({ y, m, v: val(y, m) });
    }
  }
  const sum = (arr) => arr.reduce((s, x) => s + x.v, 0);
  const last12 = complete.slice(-12);
  const prev12 = complete.slice(-24, -12);
  const ytdNow = complete.filter((x) => x.y === cy);
  const ytdPrev = ytdNow.map((x) => val(cy - 1, x.m)).filter((v) => v != null);
  const ytdFull = ytdNow.length > 0 && ytdPrev.length === ytdNow.length;
  const model = {
    last12: last12.length === 12 ? sum(last12) : null,
    prev12: prev12.length === 12 ? sum(prev12) : null,
    avg12: last12.length === 12 ? sum(last12) / 12 : null,
    ytd: ytdNow.length ? sum(ytdNow) : null,
    ytdPrev: ytdFull ? ytdPrev.reduce((s, v) => s + v, 0) : null,
    ytdMonths: ytdNow.length,
    peak: last12.length ? last12.reduce((a, b) => (b.v > a.v ? b : a)) : null,
  };
  model.last12Delta = pct(model.last12, model.prev12);
  model.ytdDelta = pct(model.ytd, model.ytdPrev);
  // Expected value for a month = the same month last year x the trend of the last 6 complete months
  const fm = forecastMonth ?? (cm + 1) % 12;
  const fy = forecastMonth == null && cm === 11 ? cy + 1 : cy;
  const base = val(fy - 1, fm);
  const six = complete.slice(-6);
  const sixPrev = six.map((x) => val(x.y - 1, x.m));
  let ratio = null;
  if (six.length === 6 && sixPrev.every((v) => v != null)) ratio = sum(six) / sixPrev.reduce((s, v) => s + v, 0);
  model.forecast = base != null && ratio != null ? { m: fm, y: fy, base, ratio, value: base * ratio } : null;
  return model;
}

export function niceMax(v) {
  if (!(v > 0)) return 100;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= s * e) return s * e;
  return 10 * e;
}
