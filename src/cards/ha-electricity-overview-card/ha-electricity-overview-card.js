// HA Electricity Overview Card (Claude AI, 2026-11-23; user: "lav el-siden, så den minder lidt mere om [fjernvarme-siden]
// … det der lækre design, hvor man nemt har overblik over det hele og flotte animerede billeder").
// Same look as the gas savings card: a hero with a ring (how cheap the power is right now compared with the rest of
// the day), three key figures, the price today and tomorrow, month by month (house and car in kr), and on a wide screen
// the use and price hour by hour, what one kWh costs right now, the split house/car and day by day.
// Money and kWh come from Home Assistant's long-term statistics: the grid meter (kWh) and its energy cost (kr, the
// energy dashboard's cost sensor), and the charger's meter for the car (its share of the kr at the month's average price).
import { keepScroll } from "../shared/keep-scroll.js";
import { countUp } from "../shared/count-up.js";

const VERSION = "1.2.0";
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const ymd = (d) => `${ym(d)}-${String(d.getDate()).padStart(2, "0")}`;
const hh = (d) => String(d.getHours()).padStart(2, "0");

/** Price points ({price, start}) → one average per hour, in time order. */
export function hourly(prices) {
  const by = new Map();
  for (const p of prices || []) {
    const t = new Date(p.start); const v = Number(p.price); if (!Number.isFinite(v) || Number.isNaN(t.getTime())) continue;
    const k = new Date(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours()).getTime();
    const o = by.get(k) || { t: new Date(k), sum: 0, n: 0 }; o.sum += v; o.n += 1; by.set(k, o);
  }
  return [...by.values()].sort((a, b) => a.t - b.t).map((o) => ({ t: o.t, p: o.sum / o.n }));
}
/** The cheapest run of `hours` whole hours that starts at or after `from` (null when there is none). */
export function cheapestWindow(hours, len = 3, from = new Date(0)) {
  let best = null;
  for (let i = 0; i + len <= hours.length; i += 1) {
    if (hours[i].t < new Date(from.getFullYear(), from.getMonth(), from.getDate(), from.getHours())) continue;
    let ok = true; for (let j = 1; j < len; j += 1) if (hours[i + j].t - hours[i + j - 1].t !== 3600000) ok = false; if (!ok) continue;
    const avg = hours.slice(i, i + len).reduce((s, x) => s + x.p, 0) / len;
    if (!best || avg < best.avg) best = { start: hours[i].t, end: new Date(hours[i].t.getTime() + len * 3600000), avg, i };
  }
  return best;
}
/** Average price of `len` whole hours starting with the hour that holds `from` (NaN when the prices run out). */
export function startNowAvg(hours, len, from = new Date()) {
  const h0 = new Date(from.getFullYear(), from.getMonth(), from.getDate(), from.getHours()).getTime();
  const i = hours.findIndex((x) => x.t.getTime() === h0); if (i < 0 || i + len > hours.length) return NaN;
  return hours.slice(i, i + len).reduce((s, x) => s + x.p, 0) / len;
}
/** cheap / normal / dear against the day's average. */
export const level = (p, avg) => (p <= avg * 0.92 ? "cheap" : p >= avg * 1.12 ? "dear" : "normal");
/** Daily rows ({kwh, kr, car}) → months with the car's share of the kr at the month's own average price. */
export function monthRows(days) {
  const by = {};
  for (const [d, v] of Object.entries(days)) { const k = d.slice(0, 7); const o = by[k] || (by[k] = { month: k, kwh: 0, kr: 0, car: 0, days: 0 }); o.kwh += v.kwh || 0; o.kr += v.kr || 0; o.car += v.car || 0; o.days += 1; }
  return Object.values(by).filter((m) => m.kwh > 0).sort((a, b) => a.month.localeCompare(b.month)).map((m) => {
    const avg = m.kr / m.kwh; const car = Math.min(m.car, m.kwh); const carKr = car * avg;
    return { ...m, car, avg, carKr, house: m.kwh - car, houseKr: m.kr - carKr };
  });
}

class HAElectricityOverviewCard extends HTMLElement {
  static getStubConfig() { return { price: "sensor.electricity_price", grid_energy: "sensor.grid_energy", grid_cost: "sensor.grid_energy_cost" }; }
  setConfig(c) {
    if (!c?.price) throw new Error("Kortet kræver price (strømprisen med prices-attribut)");
    this._config = { title: "Strøm lige nu", max_kwh_day: 250, window_hours: 3, car_capacity: 75, charger_kw: 11, appliances: [{ name: "Vaskemaskine", icon: "mdi:washing-machine", kwh: 1, hours: 2 }, { name: "Opvasker", icon: "mdi:dishwasher", kwh: 1.2, hours: 3 }, { name: "Tørretumbler", icon: "mdi:tumble-dryer", kwh: 2.5, hours: 2 }], ...c };
    this._uid = this._uid || Math.random().toString(36).slice(2, 8);
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._days = null; this._hours = null; this._at = 0; this._render();
  }
  set hass(h) {
    if (!h) return; // local-conditional-card clears hass when it hides the card
    const first = !this._hass; this._hass = h; const c = this._config;
    const sig = [c.price, c.tomorrow].map((id) => (id ? `${h.states[id]?.state}|${h.states[id]?.last_updated}` : "")).join("|");
    if (!this._at || Date.now() - this._at > 600000) this._load();
    else if (sig !== this._sig || first) { this._sig = sig; this._render(); }
    else this._live();
  }
  connectedCallback() {
    if (!this._ro && window.ResizeObserver) { this._ro = new ResizeObserver(() => { const w = this._wide(); if (w !== this._wasWide) { this._wasWide = w; this._render(); } }); this._ro.observe(this); }
  }
  disconnectedCallback() { this._ro?.disconnect(); this._ro = null; }
  _wide() { const l = this._config?.layout; return l === "wide" || (l !== "compact" && (this.clientWidth || 0) >= 1000); }
  getCardSize() { return 9; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }
  _num(id) { const s = this._hass?.states?.[id]; const n = parseFloat(String(s?.state ?? "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; }
  _kw(id) { const s = this._hass?.states?.[id]; const n = this._num(id); if (!Number.isFinite(n)) return NaN; return /^w$/i.test(s?.attributes?.unit_of_measurement || "") ? n / 1000 : n; }

  async _load() {
    this._at = Date.now(); const c = this._config; const now = new Date();
    const ids = [c.grid_energy, c.grid_cost, c.car_energy].filter(Boolean);
    if (!ids.length) { this._days = {}; this._hours = []; this._render(); return; }
    try {
      const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const [d, hr] = await Promise.all([
        this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), statistic_ids: ids, period: "day", types: ["change"] }),
        this._hass.callWS({ type: "recorder/statistics_during_period", start_time: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), statistic_ids: ids, period: "hour", types: ["change"] }),
      ]);
      const max = c.max_kwh_day; const days = {};
      const put = (rows, field, cap) => { for (const r of rows || []) { const k = ymd(new Date(r.start)); const v = Number(r.change) || 0; if (v < 0 || v > cap) continue; (days[k] = days[k] || { kwh: 0, kr: 0, car: 0 })[field] += v; } };
      put(d[c.grid_energy], "kwh", max); put(d[c.grid_cost], "kr", max * 12); put(d[c.car_energy], "car", max);
      const hours = Array.from({ length: 24 }, (_, i) => ({ h: i, kwh: 0, kr: 0, car: 0 }));
      const putH = (rows, field) => { for (const r of rows || []) { const t = new Date(r.start); const v = Number(r.change) || 0; if (v < 0 || v > max / 4) continue; hours[t.getHours()][field] += v; } };
      putH(hr[c.grid_energy], "kwh"); putH(hr[c.grid_cost], "kr"); putH(hr[c.car_energy], "car");
      this._days = days; this._hours = hours; this._err = "";
    } catch (e) { this._err = String(e?.message || e); this._days = this._days || {}; this._hours = this._hours || []; }
    this._render();
  }

  _render() { if (this.shadowRoot && this._config) keepScroll(this, () => { this.shadowRoot.innerHTML = `<style>${STYLE}</style>${this._html()}`; this._liveAt = 0; this._live(); countUp(this.shadowRoot); }); }
  // Live power without drawing the card again (the animations would start over every few seconds).
  _live() {
    if (Date.now() - (this._liveAt || 0) < 4000) return; this._liveAt = Date.now();
    const c = this._config; const r = this.shadowRoot; if (!r) return;
    const house = this._kw(c.house_power), car = this._kw(c.car_power);
    const set = (k, v) => { const el = r.querySelector(`[data-live="${k}"]`); if (el && el.textContent !== v) el.textContent = v; };
    set("house", Number.isFinite(house) ? `${fmt(house, 1)} kW` : "—"); set("car", Number.isFinite(car) ? `${fmt(car, 1)} kW` : "—");
    const flow = r.querySelector(".flow"); if (flow) flow.style.setProperty("--spd", `${Math.max(0.6, 3.2 - Math.min(3, (house || 0) + (car || 0)) * 0.7)}s`);
    r.querySelector(".car-flow")?.classList.toggle("on", car > 0.05);
    // Strømmen lige nu: ledningernes fart følger effekten, huset pulserer, bilens ring viser batteriet.
    const grid = Number.isFinite(this._kw(c.grid_power)) ? this._kw(c.grid_power) : (house || 0) + (car || 0);
    const spd = (kw) => `${Math.max(0.45, 3.4 - Math.min(11, kw) * 0.55).toFixed(2)}s`;
    const fp = r.querySelector(".fl"); if (!fp) return;
    fp.style.setProperty("--s1", spd(grid)); fp.style.setProperty("--s2", spd(car || 0)); fp.style.setProperty("--ps", `${Math.max(0.8, 3 - Math.min(4, house || 0) * 0.5).toFixed(2)}s`);
    const pN = this._num(c.price);
    set("grid", Number.isFinite(grid) ? `${fmt(grid, 1)} kW · ${fmt(grid * pN, 2)} kr/t` : "—"); set("house2", Number.isFinite(house) ? `${fmt(house, 1)} kW` : "—");
    set("krt", Number.isFinite(house) && Number.isFinite(pN) ? `${fmt(house * pN, 2)} kr i timen` : "");
    const charging = car > 0.05 || ["charging", "on"].includes(String(this._hass.states[c.car_status]?.state || "").toLowerCase());
    const plugged = charging || this._hass.states[c.car_plugged]?.state === "on" || /connected|plugged|tilsluttet|ready|waiting/i.test(String(this._hass.states[c.charger_mode]?.state || "").replace(/disconnected/i, ""));
    fp.classList.toggle("charging", charging); fp.classList.toggle("plugged", plugged); fp.classList.toggle("gridon", grid > 0.05);
    set("car2", charging ? `${fmt(car, 1)} kW` : plugged ? "tilsluttet" : "");
    const soc = this._num(c.car_battery); const range = this._num(c.car_range);
    set("soc", Number.isFinite(soc) ? `${fmt(soc)} %${Number.isFinite(range) ? ` · ${fmt(range)} km` : ""}` : "—");
    const sess = this._num(c.charger_session);
    set("carstate", charging ? `Lader${Number.isFinite(sess) && sess > 0 ? ` · ${fmt(sess, 1)} kWh` : ""}` : plugged ? "Tilsluttet" : "Ikke tilsluttet");
    const arc = r.querySelector("[data-live-arc]"); if (arc && Number.isFinite(soc)) { const C = 2 * Math.PI * 44; arc.setAttribute("stroke-dasharray", `${(C * Math.max(0, Math.min(100, soc)) / 100).toFixed(1)} ${C.toFixed(1)}`); }
  }

  _html() {
    const c = this._config; const h = this._hass;
    if (!h || !this._days) return `<div class="eo"><section class="panel"><p class="muted">${this._err ? `Kunne ikke hente statistikken: ${esc(this._err)}` : "Indlæser…"}</p></section></div>`;
    const now = new Date(); const todayK = ymd(now); const monthK = ym(now);
    const today = hourly(h.states[c.price]?.attributes?.prices);
    const tomorrow = c.tomorrow && h.states[c.tomorrow]?.state === "on" ? hourly(h.states[c.tomorrow]?.attributes?.prices) : [];
    const quarters = (h.states[c.price]?.attributes?.prices || []).map((p) => Number(p.price)).filter(Number.isFinite);
    const pNow = this._num(c.price);
    const tMin = Math.min(...quarters), tMax = Math.max(...quarters), tAvg = quarters.length ? quarters.reduce((a, b) => a + b, 0) / quarters.length : pNow;
    const lv = level(pNow, tAvg); const diff = tAvg > 0 ? ((pNow - tAvg) / tAvg) * 100 : 0;
    const cheaperThan = quarters.length ? (quarters.filter((q) => q > pNow).length / quarters.length) * 100 : 0;
    const all = [...today, ...tomorrow]; const win = cheapestWindow(all, c.window_hours, now);
    const tomMin = tomorrow.length ? Math.min(...tomorrow.map((x) => x.p)) : NaN, tomMax = tomorrow.length ? Math.max(...tomorrow.map((x) => x.p)) : NaN;
    const spot = this._num(c.spot_price); const co2 = this._num(c.co2); const fossil = this._num(c.fossil_share);
    // Money.
    const months = monthRows(this._days); const mNow = months.find((m) => m.month === monthK);
    const dNow = this._days[todayK] || { kwh: 0, kr: 0, car: 0 };
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); const elapsed = now.getDate() - 1 + now.getHours() / 24;
    const proj = mNow && elapsed > 0.5 ? (mNow.kr / elapsed) * dim : NaN;
    const prev = months.find((m) => m.month === ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
    const R = 62, C = 2 * Math.PI * R; const ringPct = Math.max(2, Math.min(100, cheaperThan));
    const lvText = { cheap: "Billig strøm lige nu", normal: "Normal strømpris", dear: "Dyr strøm lige nu" }[lv];
    const winTxt = win ? `kl. ${hh(win.start)}–${hh(win.end)}${win.start.getDate() !== now.getDate() ? " i morgen" : ""}` : "";
    return `<div class="eo lv-${lv}">
  <section class="hero">
    <div class="aurora"></div>
    <div class="ring"><svg viewBox="0 0 150 150"><circle class="bg" cx="75" cy="75" r="${R}"/><circle class="arc" cx="75" cy="75" r="${R}" style="--len:${(C * ringPct / 100).toFixed(1)}" stroke-dasharray="${(C * ringPct / 100).toFixed(1)} ${C.toFixed(1)}"/></svg>
      <div class="ring-in"><b data-count="${pNow.toFixed(2)}" data-dec="2">${fmt(pNow, 2)}</b><span>kr/kWh nu</span><small>billigere end ${fmt(cheaperThan)} % af døgnet</small></div></div>
    <div class="id">
      <div class="eyebrow">${esc(c.title)}</div>
      <h2>${lvText}</h2>
      <div class="mood"><i></i>${fmt(Math.abs(diff))} % ${diff <= 0 ? "under" : "over"} dagens gennemsnit på ${fmt(tAvg, 2)} kr${win ? ` · billigste ${c.window_hours} timer: ${winTxt} (${fmt(win.avg, 2)} kr)` : ""}</div>
      <div class="chips">
        <span class="chip live"><span class="flow"><i></i><i></i><i></i></span><ha-icon icon="mdi:home-lightning-bolt"></ha-icon>Hus <b data-live="house">—</b></span>
        ${c.car_power ? `<span class="chip live car-flow"><ha-icon icon="mdi:car-electric"></ha-icon>Bil <b data-live="car">—</b></span>` : ""}
        ${Number.isFinite(spot) ? `<span class="chip"><ha-icon icon="mdi:transmission-tower"></ha-icon>Spot ${fmt(spot, 2)} + afgifter ${fmt(pNow - spot, 2)} kr</span>` : ""}
        ${Number.isFinite(co2) ? `<span class="chip"><ha-icon icon="mdi:molecule-co2"></ha-icon>${fmt(co2)} g/kWh${Number.isFinite(fossil) ? ` · ${fmt(fossil)} % fossil` : ""}</span>` : ""}
        <span class="chip"><ha-icon icon="mdi:arrow-collapse-vertical"></ha-icon>I dag ${fmt(tMin, 2)}–${fmt(tMax, 2)} kr</span>
        ${tomorrow.length ? `<span class="chip good"><ha-icon icon="mdi:calendar-arrow-right"></ha-icon>I morgen ${fmt(tomMin, 2)}–${fmt(tomMax, 2)} kr</span>` : ""}
      </div>
    </div>
  </section>
  ${this._flowHtml(pNow)}
  <div class="grid">
    <section class="panel stat"><span>I dag</span><b class="e" data-count="${Math.round(dNow.kr)}" data-suf=" kr">${fmt(dNow.kr)} kr</b><small>${fmt(dNow.kwh, 1)} kWh${dNow.kwh > 0 ? ` · ${fmt(dNow.kr / dNow.kwh, 2)} kr/kWh i snit` : ""}${dNow.car > 0.1 ? ` · bil ${fmt(dNow.car, 1)} kWh` : ""}</small></section>
    <section class="panel stat"><span>Denne måned</span><b class="h" data-count="${Math.round(mNow?.kr || 0)}" data-suf=" kr">${fmt(mNow?.kr)} kr</b><small>${fmt(mNow?.kwh)} kWh${Number.isFinite(proj) ? ` · ≈ ${fmt(proj)} kr for hele ${MONTHS[now.getMonth()]}` : ""}${prev ? ` · ${MONTHS[now.getMonth() - 1 < 0 ? 11 : now.getMonth() - 1]}: ${fmt(prev.kr)} kr` : ""}</small></section>
    <section class="panel stat"><span>Betalt pr. kWh</span><b class="${mNow && mNow.avg <= tAvg ? "s" : "r"}" data-count="${(mNow?.avg || 0).toFixed(2)}" data-dec="2" data-suf=" kr">${fmt(mNow?.avg, 2)} kr</b><small>snit i ${MONTHS[now.getMonth()]}${mNow?.car > 0 ? ` · bilen ${fmt((mNow.car / mNow.kwh) * 100)} % af forbruget` : ""}</small></section>
  </div>
  <section class="panel">
    <div class="head"><span class="hicon amber"><ha-icon icon="mdi:chart-bar"></ha-icon></span><div><h3>Prisen ${tomorrow.length ? "i dag og i morgen" : "i dag"}</h3><p>Kurvens farve er prisen: grøn = billig, gul = normal, rød = dyr · billigste og dyreste ${c.window_hours} timer markeret</p></div>${win ? `<span class="fsum pos">${winTxt}</span>` : ""}</div>
    ${this._priceCurve(today, tomorrow, win, now, tAvg)}
  </section>
  ${this._smartHtml(all, pNow, now)}
  <section class="panel">
    <div class="head"><span class="hicon"><ha-icon icon="mdi:calendar-month"></ha-icon></span><div><h3>Måned for måned</h3><p>Hele husets el i kr · bilens del til månedens snitpris</p></div></div>
    ${this._monthsHtml(months, monthK)}
  </section>
${this._wide() ? this._wideHtml({ today, now, months, mNow, pNow, spot }) : ""}
</div>`;
  }

  // Strømmen lige nu (Claude AI, 2026-11-24; bruger: "noget animation med billaderen"): elnettet → huset → bilen, med
  // strøm der løber i ledningerne, et hus der pulserer efter forbruget og bilens batteri som en ring, der lyser, når den lader.
  _flowHtml(pNow) {
    const c = this._config; if (!c.house_power && !c.car_power && !c.grid_power) return "";
    return `<section class="panel flowp"><div class="fl">
      <div class="node gridn"><div class="orb"><ha-icon icon="mdi:transmission-tower"></ha-icon></div><b>${fmt(pNow, 2)} kr/kWh</b><span>Elnettet</span></div>
      <div class="wire w1"><i></i><em data-live="grid">—</em></div>
      <div class="node house"><div class="orb"><span class="ping"></span><span class="ping p2"></span><ha-icon icon="mdi:home-lightning-bolt"></ha-icon></div><b data-live="house2">—</b><span>Huset</span><em class="krt" data-live="krt">—</em></div>
      ${c.car_power || c.car_battery ? `<div class="wire w2"><i></i><em data-live="car2"></em></div>
      <div class="node car"><div class="orb batt"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="arc" data-live-arc cx="50" cy="50" r="44" stroke-dasharray="0 999"/><circle class="sweep" cx="50" cy="50" r="44"/></svg><ha-icon icon="mdi:car-electric"></ha-icon><span class="bolt"><ha-icon icon="mdi:lightning-bolt"></ha-icon></span></div><b data-live="soc">—</b><span data-live="carstate">${esc(c.car_name || "Bilen")}</span></div>` : ""}
    </div></section>`;
  }

  // Priskurven (Claude AI, 2026-11-24; bruger: "det er jo strøm, og det er jo priser … flot og sjovt og eksklusivt"):
  // en blød kurve over de kommende timer, hvis farve ER prisen (grøn nede, rød oppe), en lyspuls der løber langs den,
  // "nu" som en pulserende kugle, de billigste timer som et åndende grønt bånd og de dyreste som et rødt.
  _priceCurve(today, tomorrow, win, now, tAvg) {
    const all = [...today, ...tomorrow]; if (all.length < 3) return `<p class="muted">Ingen priser endnu.</p>`;
    const W = 1200, H = 240, PT = 38, PB = 30; const n = all.length; const step = W / n;
    const ps = all.map((x) => x.p); const lo = Math.min(...ps), hi = Math.max(...ps); const min = lo - (hi - lo) * 0.18, max = hi + (hi - lo) * 0.12 || hi + 1;
    const X = (i) => step / 2 + i * step; const Y = (v) => PT + (1 - (v - min) / (max - min)) * (H - PT - PB);
    const pts = all.map((x, i) => [X(i), Y(x.p)]);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i += 1) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2; const t = 0.18;
      d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`; }
    const area = `${d} L${pts[n - 1][0].toFixed(1)},${H - PB} L${pts[0][0].toFixed(1)},${H - PB} Z`;
    const off = (v) => Math.max(0, Math.min(1, (Y(v) - Y(max)) / (Y(min) - Y(max))));
    const g = `eoc${this._uid}`; const stops = `<stop offset="0" stop-color="var(--bad)"/><stop offset="${off(tAvg * 1.12).toFixed(3)}" stop-color="var(--bad)"/><stop offset="${off(tAvg).toFixed(3)}" stop-color="var(--e)"/><stop offset="${off(tAvg * 0.92).toFixed(3)}" stop-color="var(--ok)"/><stop offset="1" stop-color="var(--ok)"/>`;
    const h0 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime(); const ni = all.findIndex((x) => x.t.getTime() === h0);
    const fi = ni + now.getMinutes() / 60; const nx = ni >= 0 ? step / 2 + fi * step : -1;
    const pv = ni >= 0 ? all[ni].p + ((all[Math.min(n - 1, ni + 1)].p - all[ni].p) * now.getMinutes()) / 60 : NaN; const ny = Number.isFinite(pv) ? Y(pv) : 0;
    const dear = (() => { const neg = all.map((x) => ({ t: x.t, p: -x.p })); const w = cheapestWindow(neg, this._config.window_hours, now); return w ? { ...w, avg: -w.avg } : null; })();
    const band = (w, cls) => { if (!w) return ""; const x0 = w.i * step, x1 = (w.i + this._config.window_hours) * step; return `<rect class="band ${cls}" x="${x0.toFixed(1)}" y="${PT - 14}" width="${(x1 - x0).toFixed(1)}" height="${H - PT - PB + 14}" rx="10"/>`; };
    const pc = (x) => `${((x / W) * 100).toFixed(2)}%`; const tc = (y) => `${((y / H) * 100).toFixed(2)}%`;
    const tomI = today.length && tomorrow.length ? today.length : -1;
    const lbl = (w, cls, txt) => (w ? `<div class="clab ${cls}" style="left:${pc(((w.i + this._config.window_hours / 2) * step))};top:${tc(PT - 30)}">${txt}</div>` : "");
    return `<div class="curve">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="${Y(max).toFixed(1)}" x2="0" y2="${Y(min).toFixed(1)}">${stops}</linearGradient>
          <linearGradient id="${g}a" gradientUnits="userSpaceOnUse" x1="0" y1="${PT}" x2="0" y2="${H - PB}"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
          <mask id="${g}m"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#${g}a)"/></mask></defs>
        ${band(win, "cheap")}${band(dear, "dear")}
        ${[0.25, 0.5, 0.75].map((f) => `<line class="gridl" x1="0" x2="${W}" y1="${(PT + f * (H - PT - PB)).toFixed(1)}" y2="${(PT + f * (H - PT - PB)).toFixed(1)}"/>`).join("")}
        <path class="area" d="${area}" fill="url(#${g})" mask="url(#${g}m)"/>
        <path class="cl" d="${d}" stroke="url(#${g})" pathLength="1000"/>
        <path class="shine" d="${d}" pathLength="1000"/>
        ${nx > 0 ? `<rect class="past" x="0" y="${PT - 14}" width="${nx.toFixed(1)}" height="${H - PT - PB + 14}"/><line class="beam" x1="${nx.toFixed(1)}" x2="${nx.toFixed(1)}" y1="${(ny + 10).toFixed(1)}" y2="${H - PB}"/>` : ""}
        ${tomI > 0 ? `<line class="tom" x1="${(tomI * step).toFixed(1)}" x2="${(tomI * step).toFixed(1)}" y1="${PT - 18}" y2="${H - PB}"/>` : ""}
      </svg>
      ${lbl(win, "cheap", `<ha-icon icon="mdi:leaf"></ha-icon>Billigst ${hh(win?.start || now)}–${hh(win?.end || now)} · ${fmt(win?.avg, 2)} kr`)}
      ${dear && (!win || Math.abs(dear.i - win.i) >= this._config.window_hours) ? lbl(dear, "dear", `<ha-icon icon="mdi:fire"></ha-icon>Undgå ${hh(dear.start)}–${hh(dear.end)} · ${fmt(dear.avg, 2)} kr`) : ""}
      ${nx > 0 ? `<div class="norb ${level(pv, tAvg)}" style="left:${pc(nx)};top:${tc(ny)}"><i></i><i></i><b>${fmt(pv, 2)}</b></div>` : ""}
      ${tomI > 0 ? `<div class="tomlab" style="left:${pc(tomI * step)}">i morgen</div>` : ""}
      <div class="hax">${all.map((x, i) => (x.t.getHours() % 3 === 0 ? `<span style="left:${pc(X(i))}">${hh(x.t)}</span>` : "")).join("")}</div>
    </div>`;
  }

  // Lad bilen smart og hvad apparaterne koster (Claude AI, 2026-11-24): start nu mod start i de billigste timer, i kr,
  // med mønter der falder ned og et "spar"-mærke der tæller op.
  _smartHtml(all, pNow, now) {
    const c = this._config; if (all.length < 2) return "";
    const soc = this._num(c.car_battery); const lim = Number.isFinite(this._num(c.car_limit)) ? this._num(c.car_limit) : 80;
    let need = Number.isFinite(soc) ? Math.max(0, ((lim - soc) / 100) * c.car_capacity) : 0; let typical = false;
    if (need < 3) { need = 30; typical = true; }
    const hrs = Math.max(1, Math.ceil(need / c.charger_kw));
    const nowAvg = startNowAvg(all, hrs, now); const best = cheapestWindow(all, hrs, now);
    const carNow = need * nowAvg, carBest = best ? need * best.avg : NaN; const save = carNow - carBest;
    const coins = (kr, maxKr) => { const k = Math.max(1, Math.round((kr / maxKr) * 12)); return Array.from({ length: k }, (_, i) => `<i style="--i:${i}"></i>`).join(""); };
    const mk = Math.max(carNow || 0, carBest || 0, 1);
    const apps = (c.appliances || []).map((a) => { const n0 = startNowAvg(all, a.hours || 1, now), b = cheapestWindow(all, a.hours || 1, now); return { ...a, now: a.kwh * n0, best: b ? a.kwh * b.avg : NaN, at: b?.start }; }).filter((a) => Number.isFinite(a.now));
    const amax = Math.max(...apps.map((a) => a.now), 0.01);
    return `<section class="panel smart">
    <div class="head"><span class="hicon purple"><ha-icon icon="mdi:car-electric"></ha-icon></span><div><h3>Lad ${esc(c.car_name || "bilen")} smart</h3><p>${typical ? `En typisk opladning på ${fmt(need)} kWh` : `Fra ${fmt(soc)} % til ${fmt(lim)} % · ${fmt(need, 1)} kWh`} · ca. ${hrs} t med ${fmt(c.charger_kw)} kW</p></div>
      ${Number.isFinite(save) && save > 0.5 ? `<span class="save"><ha-icon icon="mdi:piggy-bank"></ha-icon>Spar <b data-count="${Math.round(save)}" data-suf=" kr">${fmt(save)} kr</b></span>` : `<span class="save ok"><ha-icon icon="mdi:check-decagram"></ha-icon>Nu er et godt tidspunkt</span>`}</div>
    <div class="duel">
      <div class="side now"><div class="stack2">${Number.isFinite(carNow) ? coins(carNow, mk) : ""}</div><div class="dt"><span>Starter nu</span><b data-count="${Math.round(carNow || 0)}" data-suf=" kr">${fmt(carNow)} kr</b><small>kl. ${hh(now)}–${hh(new Date(now.getTime() + hrs * 3600000))} · ${fmt(nowAvg, 2)} kr/kWh</small></div></div>
      <div class="vs"><span>vs</span></div>
      <div class="side best"><div class="stack2">${Number.isFinite(carBest) ? coins(carBest, mk) : ""}</div><div class="dt"><span>Starter kl. ${hh(best?.start || now)}${best && best.start.getDate() !== now.getDate() ? " i morgen" : ""}</span><b data-count="${Math.round(carBest || 0)}" data-suf=" kr">${fmt(carBest)} kr</b><small>${best ? `kl. ${hh(best.start)}–${hh(best.end)} · ${fmt(best.avg, 2)} kr/kWh` : "Ingen priser endnu"}</small></div></div>
    </div>
    ${apps.length ? `<div class="apps">${apps.map((a, i) => `<div class="app" style="--i:${i}"><ha-icon icon="${esc(a.icon || "mdi:power-plug")}"></ha-icon><span>${esc(a.name)}<small>${fmt(a.kwh, 1)} kWh</small></span>
      <div class="ab"><i class="n" style="width:${((a.now / amax) * 100).toFixed(1)}%"></i><i class="b" style="width:${((a.best / amax) * 100).toFixed(1)}%"></i></div>
      <b>${fmt(a.now, 2)} kr nu</b><em>${Number.isFinite(a.best) ? `${fmt(a.best, 2)} kr kl. ${hh(a.at)}` : ""}</em></div>`).join("")}</div>` : ""}
  </section>`;
  }

  _priceBars(today, tomorrow, win, now, tAvg) {
    const all = [...today, ...tomorrow]; if (!all.length) return `<p class="muted">Ingen priser endnu.</p>`;
    const max = Math.max(...all.map((x) => x.p)) * 1.05;
    const avgOf = (arr) => arr.reduce((s, x) => s + x.p, 0) / (arr.length || 1);
    const tomAvg = tomorrow.length ? avgOf(tomorrow) : tAvg;
    const nowH = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime();
    const inWin = (t) => win && t >= win.start && t < win.end;
    const col = (x, i, avg) => `<div class="pc ${level(x.p, avg)}${x.t.getTime() === nowH ? " now" : ""}${inWin(x.t) ? " win" : ""}${x.t.getTime() < nowH ? " past" : ""}" style="--i:${i}" title="kl. ${hh(x.t)}: ${fmt(x.p, 2)} kr/kWh"><i style="height:${((x.p / max) * 100).toFixed(1)}%"></i>${x.t.getHours() % 3 === 0 ? `<span>${hh(x.t)}</span>` : "<span></span>"}</div>`;
    return `<div class="pbars">${today.map((x, i) => col(x, i, tAvg)).join("")}${tomorrow.length ? `<div class="pdiv"><span>i morgen</span></div>${tomorrow.map((x, i) => col(x, i + today.length, tomAvg)).join("")}` : ""}</div>`;
  }

  _monthsHtml(months, monthK) {
    if (!months.length) return `<p class="muted">Ingen statistik endnu.</p>`;
    const max = Math.max(...months.map((m) => Math.max(m.houseKr, m.carKr)), 1);
    return `<div class="months">${months.slice(-12).reverse().map((m) => `<div class="mrow">
      <span class="m">${MONTHS[+m.month.slice(5) - 1]} ${m.month.slice(2, 4)}${m.month === monthK ? "<em>nu</em>" : ""}</span>
      <div class="bars"><div class="bar h"><i style="width:${((m.houseKr / max) * 100).toFixed(1)}%"></i><b>${fmt(m.houseKr)} kr</b><small>hus ${fmt(m.house)} kWh</small></div>
      ${m.car > 0.5 ? `<div class="bar c"><i style="width:${((m.carKr / max) * 100).toFixed(1)}%"></i><b>${fmt(m.carKr)} kr</b><small>bil ${fmt(m.car)} kWh</small></div>` : ""}</div>
      <span class="s"><b>${fmt(m.kr)} kr</b><small>${fmt(m.avg, 2)} kr/kWh</small></span></div>`).join("")}</div>
    <div class="legend"><span><i class="h"></i>Huset</span><span><i class="c"></i>Bilen (opladning hjemme)</span></div>`;
  }

  _wideHtml({ today, now, months, mNow, pNow, spot }) {
    const c = this._config; const H = 180, WW = 1200, P = 34;
    // 1) Forbrug og pris time for time i dag.
    const hrs = this._hours || []; const kMax = Math.max(...hrs.map((x) => x.kwh), 0.5) * 1.1; const pMax = Math.max(...today.map((x) => x.p), 1) * 1.1;
    const bw = (WW - P * 2) / 24; const X = (i) => P + i * bw; const Yk = (v) => H - 22 - (v / kMax) * (H - 44); const Yp = (v) => H - 22 - (v / pMax) * (H - 44);
    const line = today.map((x) => `${(X(x.t.getHours()) + bw / 2).toFixed(1)},${Yp(x.p).toFixed(1)}`).join(" ");
    const nh = now.getHours() + now.getMinutes() / 60;
    // 2) Hvad koster 1 kWh nu.
    // Danske navne ud fra sensorens id (Strømligning kalder dem på engelsk); `price_labels` kan give andre.
    const NAMES = [[/distribution|transport/i, "Netselskabets tarif"], [/nettar/i, "Energinets nettarif"], [/systemtar/i, "Energinets systemtarif"], [/electricity_tax|elafgift/i, "Elafgift"], [/surcharge|tillaeg|tillæg/i, "Leverandørens tillæg"]];
    const nameOf = (id) => c.price_labels?.[id] || NAMES.find(([re]) => re.test(id))?.[1] || String(this._hass.states[id]?.attributes?.friendly_name || id).replace(/\s*(incl\.?|inkl\.?)\s*(vat|moms)$/i, "");
    const comps = (c.price_components || []).map((id) => ({ n: nameOf(id), v: this._num(id) })).filter((x) => Number.isFinite(x.v) && x.v > 0);
    const parts = [...(Number.isFinite(spot) ? [{ n: "Spotpris", v: spot }] : []), ...comps];
    const pSum = parts.reduce((s, x) => s + x.v, 0) || 1; const PAL = ["#ffc53d", "#4cc9ff", "#b388ff", "#4fe0a6", "#ff8a3d", "#ff667a", "#7dd3fc"];
    // 3) Fordeling denne måned.
    const hk = mNow ? mNow.houseKr : 0, ck = mNow ? mNow.carKr : 0, tot = hk + ck || 1; const RR = 54, CC = 2 * Math.PI * RR;
    // 4) Dag for dag (30 dage).
    const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29 + i); const v = this._days[ymd(d)] || { kwh: 0, kr: 0, car: 0 }; return { d, ...v }; });
    const dMax = Math.max(...days.map((x) => x.kr), 1);
    return `<div class="wide">
  <section class="panel w2"><div class="head"><span class="hicon blue"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon></span><div><h3>Forbrug og pris i dag</h3><p>kWh pr. time (huset blå, bilen lilla) og strømprisen (gul linje)</p></div><span class="fsum">${fmt((this._days[ymd(now)] || {}).kwh, 1)} kWh</span></div>
    <svg class="chart" viewBox="0 0 ${WW} ${H}" preserveAspectRatio="none">
      ${hrs.map((x, i) => { const car = Math.min(x.car, x.kwh); const yH = Yk(x.kwh), yC = Yk(car); return `<rect class="kh" style="--i:${i}" x="${(X(i) + 3).toFixed(1)}" y="${yH.toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${(H - 22 - yH).toFixed(1)}" rx="4"/>${car > 0.05 ? `<rect class="kc" style="--i:${i}" x="${(X(i) + 3).toFixed(1)}" y="${yC.toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${(H - 22 - yC).toFixed(1)}" rx="4"/>` : ""}`; }).join("")}
      <polyline class="pl" points="${line}"/>
      <line class="nowl" x1="${(X(0) + nh * bw).toFixed(1)}" x2="${(X(0) + nh * bw).toFixed(1)}" y1="8" y2="${H - 22}"/>
      ${[0, 3, 6, 9, 12, 15, 18, 21].map((i) => `<text class="lbl" x="${(X(i) + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${String(i).padStart(2, "0")}</text>`).join("")}
    </svg></section>
  <section class="panel"><div class="head"><span class="hicon amber"><ha-icon icon="mdi:cash-multiple"></ha-icon></span><div><h3>Hvad koster 1 kWh nu?</h3><p>${fmt(pNow, 2)} kr/kWh inkl. moms, delt op</p></div></div>
    <div class="stack">${parts.map((x, i) => `<i style="width:${((x.v / pSum) * 100).toFixed(1)}%;background:${PAL[i % PAL.length]};--i:${i}"></i>`).join("")}</div>
    <div class="plist">${parts.map((x, i) => `<div><i style="background:${PAL[i % PAL.length]}"></i><span>${esc(x.n)}</span><b>${fmt(x.v, 2)} kr</b><em>${fmt((x.v / pSum) * 100)} %</em></div>`).join("")}</div>
  </section>
  <section class="panel"><div class="head"><span class="hicon purple"><ha-icon icon="mdi:chart-donut"></ha-icon></span><div><h3>Fordeling i ${MONTHS[now.getMonth()]}</h3><p>Huset og bilen i kr</p></div></div>
    <div class="donut"><svg viewBox="0 0 140 140"><circle class="bg" cx="70" cy="70" r="${RR}"/><circle class="dh" cx="70" cy="70" r="${RR}" stroke-dasharray="${((hk / tot) * CC).toFixed(1)} ${CC.toFixed(1)}"/><circle class="dc" cx="70" cy="70" r="${RR}" stroke-dasharray="${((ck / tot) * CC).toFixed(1)} ${CC.toFixed(1)}" stroke-dashoffset="${(-(hk / tot) * CC).toFixed(1)}"/></svg>
      <div class="dl"><div><i class="h"></i><span>Huset</span><b>${fmt(hk)} kr</b><em>${fmt(mNow?.house)} kWh</em></div><div><i class="c"></i><span>Bilen</span><b>${fmt(ck)} kr</b><em>${fmt(mNow?.car)} kWh</em></div><div class="t"><span>I alt</span><b>${fmt(mNow?.kr)} kr</b></div></div></div>
  </section>
  <section class="panel w2"><div class="head"><span class="hicon"><ha-icon icon="mdi:calendar-range"></ha-icon></span><div><h3>Dag for dag</h3><p>De sidste 30 dage i kr · bilens del lilla</p></div></div>
    <div class="dbars">${days.map((x, i) => { const carKr = x.kwh > 0 ? (Math.min(x.car, x.kwh) / x.kwh) * x.kr : 0; return `<div class="dc2" style="--i:${i}" title="${x.d.getDate()}/${x.d.getMonth() + 1}: ${fmt(x.kr)} kr · ${fmt(x.kwh, 1)} kWh"><div class="dp"><i class="h" style="height:${(((x.kr - carKr) / dMax) * 100).toFixed(1)}%"></i><i class="c" style="height:${((carKr / dMax) * 100).toFixed(1)}%"></i></div><span>${x.d.getDate() % 5 === 0 || i === 29 ? x.d.getDate() : ""}</span></div>`; }).join("")}</div>
  </section>
</div>`;
  }
}

const STYLE = `
:host{display:block}
.eo{--g:#ff8a3d;--h:#4cc9ff;--ok:var(--dashboard-success,#4fe0a6);--bad:var(--dashboard-danger,#ff667a);--s:var(--surface,var(--ha-card-background,var(--card-background-color,#141c27)));--l:color-mix(in srgb,var(--primary-text-color) 9%,transparent);display:grid;gap:14px;color:var(--primary-text-color)}
.hero,.panel{position:relative;border-radius:24px;background:var(--s);border:1px solid var(--l);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--ok);box-shadow:var(--dashboard-shadow-strong,0 12px 32px rgba(0,0,0,.22));animation:rise .6s cubic-bezier(.2,.8,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(8px)}}
.hero{isolation:isolate;overflow:hidden;display:grid;grid-template-columns:auto minmax(0,1fr);gap:22px;align-items:center;padding:22px 24px;background:linear-gradient(135deg,color-mix(in srgb,var(--s) 90%,#000),var(--s))}
.aurora{position:absolute;inset:-40%;z-index:-1;background:radial-gradient(38% 34% at 18% 35%,color-mix(in srgb,var(--ok) 22%,transparent),transparent 70%),radial-gradient(34% 30% at 78% 28%,color-mix(in srgb,var(--g) 20%,transparent),transparent 70%),radial-gradient(36% 36% at 60% 90%,color-mix(in srgb,var(--h) 16%,transparent),transparent 70%);filter:blur(10px);animation:au 24s ease-in-out infinite alternate}
@keyframes au{50%{transform:translate(4%,-3%) rotate(8deg)}100%{transform:translate(-3%,4%) rotate(-6deg)}}
.ring{position:relative;width:150px;height:150px}.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring .bg{fill:none;stroke:color-mix(in srgb,var(--primary-text-color) 8%,transparent);stroke-width:11}
.ring .arc{fill:none;stroke:var(--ok);stroke-width:11;stroke-linecap:round;filter:drop-shadow(0 0 8px color-mix(in srgb,var(--ok) 70%,transparent))}
.ring-in{position:absolute;inset:0;display:grid;place-content:center;text-align:center;line-height:1.05}.ring-in b{font-size:32px;font-weight:850}.ring-in span{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--secondary-text-color)}.ring-in small{margin-top:5px;font-size:12px;font-weight:800;color:var(--ok)}
.eyebrow{font-size:10.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--g)}
.id h2{margin:2px 0 4px;padding-bottom:.08em;font-size:36px;line-height:1.15;font-weight:850;letter-spacing:-.02em;background:linear-gradient(100deg,var(--primary-text-color) 30%,var(--ok));-webkit-background-clip:text;background-clip:text;color:transparent}
.mood{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:14px;font-weight:750;color:color-mix(in srgb,var(--ok) 70%,var(--primary-text-color))}.mood i{width:9px;height:9px;border-radius:50%;background:var(--ok)}.mood.bad{color:var(--bad)}.mood.bad i{background:var(--bad)}
.chips{display:flex;flex-wrap:wrap;gap:7px}.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;font-size:12.5px;font-weight:700;background:color-mix(in srgb,var(--primary-text-color) 6%,transparent);border:1px solid var(--l)}.chip ha-icon{--mdc-icon-size:16px;color:var(--secondary-text-color)}.chip.gas ha-icon{color:var(--g)}.chip.heat ha-icon{color:var(--h)}.chip.good ha-icon{color:var(--ok)}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.panel{padding:18px}.stat{display:flex;flex-direction:column;gap:4px;border-left-color:var(--l)}.stat span{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--secondary-text-color)}.stat b{font-size:28px;font-weight:850;letter-spacing:-.02em}.stat b.g{color:var(--g)}.stat b.h{color:var(--h)}.stat b.s{color:var(--ok)}.stat b.r{color:var(--bad)}.stat small{font-size:12px;color:var(--secondary-text-color)}
.head{display:flex;align-items:center;gap:12px;margin-bottom:12px}.head h3{margin:0;font-size:16px;font-weight:800}.head p{margin:2px 0 0;font-size:12.5px;color:var(--secondary-text-color)}
.hicon.blue{background:color-mix(in srgb,var(--h) 15%,transparent);color:var(--h)}.head>div{flex:1;min-width:0}.fsum{font-size:22px;font-weight:850}.fsum.pos{color:var(--ok)}.fsum.neg{color:var(--bad)}
.fbars{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;align-items:end}.fcol{display:flex;flex-direction:column;align-items:center;gap:4px}.fpair{display:flex;gap:2px;align-items:flex-end;height:110px;width:100%;justify-content:center}.fpair i{display:block;width:42%;border-radius:5px 5px 2px 2px;animation:up .9s cubic-bezier(.2,.8,.2,1) both}@keyframes up{from{height:0}}.fpair i.g{background:linear-gradient(180deg,var(--g),color-mix(in srgb,var(--g) 40%,transparent))}.fpair i.h{background:linear-gradient(180deg,var(--h),color-mix(in srgb,var(--h) 40%,transparent))}.fcol em{font-style:normal;font-size:10.5px;font-weight:850}.fcol em.pos{color:var(--ok)}.fcol em.neg{color:var(--bad)}.fcol span{font-size:10.5px;color:var(--secondary-text-color);font-weight:700}
.hicon{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--ok) 15%,transparent);color:var(--ok)}
.months{display:grid;gap:10px}
.mrow{display:grid;grid-template-columns:70px minmax(0,1fr) 80px;gap:12px;align-items:center;padding-bottom:10px;border-bottom:1px solid var(--l)}.mrow:last-child{border-bottom:0}
.mrow .m{font-weight:850;font-size:14px;display:flex;flex-direction:column}.mrow .m em{font-style:normal;font-size:9.5px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:var(--h)}
.bars{display:grid;gap:4px}.bar{position:relative;height:24px;border-radius:8px;background:color-mix(in srgb,var(--primary-text-color) 4%,transparent);overflow:hidden;display:flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums}
.bar i{position:absolute;inset:0 auto 0 0;border-radius:8px;animation:grow .9s cubic-bezier(.2,.8,.2,1) both}@keyframes grow{from{width:0}}
.bar.g i{background:linear-gradient(90deg,color-mix(in srgb,var(--g) 30%,transparent),color-mix(in srgb,var(--g) 75%,transparent))}.bar.h i{background:linear-gradient(90deg,color-mix(in srgb,var(--h) 30%,transparent),color-mix(in srgb,var(--h) 75%,transparent))}
.bar b,.bar small{position:relative}.bar b{padding-left:9px;font-size:12.5px;font-weight:850}.bar small{font-size:11px;font-weight:700;color:var(--secondary-text-color)}
.mrow .s{text-align:right;font-weight:850;font-size:15px}.mrow .s.pos{color:var(--ok)}.mrow .s.neg{color:var(--bad)}
.legend{display:flex;gap:16px;margin-top:12px;font-size:12px;color:var(--secondary-text-color)}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}.legend .g{background:var(--g)}.legend .h{background:var(--h)}
.foot{margin:10px 2px 0;font-size:11.5px;line-height:1.5;color:var(--secondary-text-color)}.muted{margin:0;color:var(--secondary-text-color)}
.wide{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.wide .w2{grid-column:1/-1}
.chart{width:100%;height:190px;display:block}.chart .acc{fill:none;stroke:var(--ok);stroke-width:3;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--ok) 60%,transparent))}.chart .fut{fill:none;stroke:var(--ok);stroke-width:2;stroke-dasharray:6 6;opacity:.55;vector-effect:non-scaling-stroke}.chart circle{fill:var(--ok)}.chart .goal{stroke:var(--g);stroke-width:1.5;stroke-dasharray:4 6;vector-effect:non-scaling-stroke;opacity:.7}.chart .gl{fill:none;stroke:var(--g);stroke-width:3;vector-effect:non-scaling-stroke}.chart .hl{fill:none;stroke:var(--h);stroke-width:3;vector-effect:non-scaling-stroke}.chart .lbl{font-size:11px;fill:var(--secondary-text-color);font-weight:700}.chart .lbl.ok{fill:var(--ok)}
.kw{display:grid;grid-template-columns:90px minmax(0,1fr) 70px;gap:10px;align-items:center;margin-top:10px}.kw span{font-weight:800}.kw b{text-align:right;font-size:16px}.kbar{display:flex;height:22px;border-radius:7px;overflow:hidden;background:color-mix(in srgb,var(--primary-text-color) 5%,transparent)}.kbar i{height:100%}.kbar i.g{background:var(--g)}.kbar i.h{background:var(--h)}.kbar i.fx{opacity:.45}.ksub{display:block;margin:3px 0 0 100px;font-size:11px;color:var(--secondary-text-color)}
.sv{display:grid;grid-template-columns:80px minmax(0,1fr) 90px 54px;gap:10px;align-items:center;padding:6px 8px;border-radius:10px}.sv.cur{background:color-mix(in srgb,var(--g) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--g) 40%,transparent)}.sv span{font-weight:800}.sbar{height:18px;border-radius:6px;background:color-mix(in srgb,var(--primary-text-color) 5%,transparent);overflow:hidden}.sbar i{display:block;height:100%}.sbar i.pos{background:color-mix(in srgb,var(--ok) 70%,transparent)}.sbar i.neg{background:color-mix(in srgb,var(--bad) 70%,transparent)}.sv b{text-align:right}.sv b.pos{color:var(--ok)}.sv b.neg{color:var(--bad)}.sv em{font-style:normal;text-align:right;color:var(--secondary-text-color);font-size:12px}
.kwh{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px;align-items:end}.kc{display:flex;flex-direction:column;align-items:center;gap:4px}.kp{position:relative;height:120px;width:70%}.kp i{position:absolute;left:0;right:0;bottom:0;border-radius:6px 6px 2px 2px}.kp i.n{background:color-mix(in srgb,var(--h) 30%,transparent)}.kp i.m{left:22%;right:22%;background:var(--h)}.kc span{font-size:11px;color:var(--secondary-text-color);font-weight:700}
.hicon.green{background:color-mix(in srgb,var(--ok) 15%,transparent);color:var(--ok)}
@media(max-width:720px){.hero{grid-template-columns:1fr;justify-items:center;text-align:center;padding:20px 16px}.id{min-width:0;max-width:100%}.id h2{font-size:30px}.mood,.chips{justify-content:center}.grid{grid-template-columns:1fr}.mrow{grid-template-columns:56px minmax(0,1fr) 62px}}

.flowp{padding:22px 24px 18px;overflow:hidden}
.fl{display:flex;align-items:flex-start;gap:0;--s1:3s;--s2:3s;--ps:2.4s}
.node{flex:0 0 auto;width:130px;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}
.node b{font-size:15px;font-weight:850;font-variant-numeric:tabular-nums;margin-top:6px}.node span{font-size:11.5px;font-weight:700;color:var(--secondary-text-color)}
.orb{position:relative;width:86px;height:86px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--oc) 28%,transparent),color-mix(in srgb,var(--oc) 6%,transparent) 70%);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--oc) 45%,transparent),0 0 26px color-mix(in srgb,var(--oc) 25%,transparent)}
.orb ha-icon{--mdc-icon-size:38px;color:var(--oc);position:relative;z-index:1}
.gridn{--oc:var(--lv)}.house{--oc:var(--h)}.car{--oc:var(--c)}
.ping{position:absolute;inset:0;border-radius:50%;border:2px solid var(--h);animation:ping var(--ps) cubic-bezier(.2,.6,.3,1) infinite}.ping.p2{animation-delay:calc(var(--ps) / 2)}@keyframes ping{from{transform:scale(.9);opacity:.9}to{transform:scale(1.45);opacity:0}}
.wire{flex:1 1 auto;position:relative;height:8px;margin-top:39px;border-radius:4px;background:color-mix(in srgb,var(--primary-text-color) 7%,transparent);min-width:30px}
.wire i{position:absolute;inset:0;border-radius:4px;background:radial-gradient(circle,var(--wc) 0 3px,transparent 3.6px) 0 50%/24px 8px repeat-x;opacity:.18}
.wire.w1{--wc:var(--lv)}.wire.w2{--wc:var(--c)}
.gridon .w1 i{opacity:1;filter:drop-shadow(0 0 5px var(--wc));animation:run var(--s1) linear infinite}
.charging .w2 i{opacity:1;filter:drop-shadow(0 0 5px var(--wc));animation:run var(--s2) linear infinite}
@keyframes run{to{background-position:24px 50%}}
.wire em{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);font-style:normal;font-size:12.5px;font-weight:850;white-space:nowrap;color:color-mix(in srgb,var(--wc) 75%,var(--primary-text-color));font-variant-numeric:tabular-nums}
.batt svg{position:absolute;inset:-7px;width:calc(100% + 14px);height:calc(100% + 14px);transform:rotate(-90deg)}
.batt circle{fill:none;stroke-width:6}.batt .bg{stroke:color-mix(in srgb,var(--c) 14%,transparent)}.batt .arc{stroke:var(--c);stroke-linecap:round;transition:stroke-dasharray 1.2s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 0 5px color-mix(in srgb,var(--c) 70%,transparent))}
.batt .sweep{stroke:#fff;stroke-width:6;stroke-linecap:round;stroke-dasharray:18 260;opacity:0;transform-origin:50px 50px}
.charging .batt .sweep{opacity:.85;animation:spin 1.8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.bolt{position:absolute;right:-2px;top:-2px;z-index:2;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--c);opacity:0;transform:scale(.6);transition:.4s}.bolt ha-icon{--mdc-icon-size:17px;color:#111}
.charging .bolt{opacity:1;transform:scale(1);animation:blink 1.4s ease-in-out infinite}@keyframes blink{50%{box-shadow:0 0 0 7px color-mix(in srgb,var(--c) 0%,transparent),0 0 18px var(--c)}}
.plugged:not(.charging) .w2{background:color-mix(in srgb,var(--c) 22%,transparent)}
@media(max-width:720px){.flowp{padding:18px 10px 14px}.node{width:92px}.orb{width:64px;height:64px}.orb ha-icon{--mdc-icon-size:28px}.wire{margin-top:28px;min-width:18px}.node b{font-size:13px}.wire em{font-size:11px}.bolt{width:22px;height:22px}.bolt ha-icon{--mdc-icon-size:13px}}

.curve{position:relative;height:250px;margin-top:6px}.curve svg{position:absolute;inset:0 0 20px 0;width:100%;height:calc(100% - 20px);overflow:visible}
.curve .gridl{stroke:color-mix(in srgb,var(--primary-text-color) 7%,transparent);stroke-dasharray:2 8;vector-effect:non-scaling-stroke}
.curve .area{opacity:.32;animation:fadein 1.4s .5s both}@keyframes fadein{from{opacity:0}}
.curve .cl{fill:none;stroke-width:4;stroke-linecap:round;stroke-dasharray:1000;animation:cdraw 1.8s cubic-bezier(.4,.1,.2,1) both;filter:drop-shadow(0 0 7px color-mix(in srgb,var(--e) 45%,transparent))}@keyframes cdraw{from{stroke-dashoffset:1000}}
.curve .shine{fill:none;stroke:#fff;stroke-width:4;stroke-linecap:round;stroke-dasharray:22 978;opacity:.9;filter:drop-shadow(0 0 8px #fff);animation:shine 5.5s linear 1.8s infinite;stroke-dashoffset:1000}@keyframes shine{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
.curve .past{fill:var(--s);opacity:.55}
.curve .beam{stroke:var(--lv);stroke-width:2;vector-effect:non-scaling-stroke;stroke-dasharray:3 5;opacity:.75}
.curve .tom{stroke:color-mix(in srgb,var(--primary-text-color) 30%,transparent);stroke-width:1.5;stroke-dasharray:4 6;vector-effect:non-scaling-stroke}
.curve .band{animation:breathe 3.2s ease-in-out infinite}.curve .band.cheap{fill:color-mix(in srgb,var(--ok) 14%,transparent);stroke:color-mix(in srgb,var(--ok) 45%,transparent);stroke-dasharray:4 6;vector-effect:non-scaling-stroke}.curve .band.dear{fill:color-mix(in srgb,var(--bad) 11%,transparent);stroke:color-mix(in srgb,var(--bad) 40%,transparent);stroke-dasharray:4 6;vector-effect:non-scaling-stroke;animation-delay:1.6s}@keyframes breathe{50%{opacity:.45}}
.clab{position:absolute;transform:translate(-50%,0);display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:850;white-space:nowrap;backdrop-filter:blur(6px);animation:rise .6s 1.2s both}.clab ha-icon{--mdc-icon-size:14px}
.clab.cheap{background:color-mix(in srgb,var(--ok) 20%,transparent);color:var(--ok);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ok) 45%,transparent)}.clab.dear{background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bad) 40%,transparent)}
.norb{position:absolute;width:0;height:0;z-index:2;--oc:var(--e)}.norb.cheap{--oc:var(--ok)}.norb.dear{--oc:var(--bad)}
.norb::after{content:"";position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;background:var(--oc);box-shadow:0 0 0 3px color-mix(in srgb,var(--oc) 35%,transparent),0 0 22px var(--oc)}
.norb i{position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;border:2px solid var(--oc);animation:ring2 2.2s ease-out infinite}.norb i+i{animation-delay:1.1s}@keyframes ring2{to{transform:scale(3.2);opacity:0}}
.norb b{position:absolute;left:12px;top:-30px;padding:3px 8px;border-radius:8px;font-size:12px;font-weight:900;background:color-mix(in srgb,var(--oc) 25%,var(--s));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--oc) 55%,transparent);white-space:nowrap}
.tomlab{position:absolute;top:2px;transform:translateX(6px);font-size:10px;font-weight:850;letter-spacing:.1em;text-transform:uppercase;color:var(--secondary-text-color)}
.hax{position:absolute;left:0;right:0;bottom:0;height:16px}.hax span{position:absolute;transform:translateX(-50%);font-size:10.5px;font-weight:700;color:var(--secondary-text-color)}
.smart .head{flex-wrap:wrap}.save{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:999px;font-weight:850;font-size:14px;color:#0b1a12;background:linear-gradient(120deg,var(--ok),color-mix(in srgb,var(--ok) 60%,#fff));box-shadow:0 0 0 0 color-mix(in srgb,var(--ok) 60%,transparent),0 8px 24px color-mix(in srgb,var(--ok) 30%,transparent);position:relative;overflow:hidden;animation:pulse 2.4s infinite}
.save::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.55) 50%,transparent 70%);transform:translateX(-100%);animation:gloss 3.2s ease-in-out 1s infinite}@keyframes gloss{60%,100%{transform:translateX(100%)}}
.save.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ok) 40%,transparent);animation:none}.save.ok::after{display:none}.save ha-icon{--mdc-icon-size:18px}
.duel{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:14px;align-items:end;margin:6px 0 4px}
.side{display:flex;align-items:flex-end;gap:16px;padding:14px 16px;border-radius:18px;background:color-mix(in srgb,var(--primary-text-color) 4%,transparent)}.side.now{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--e) 30%,transparent)}.side.best{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ok) 40%,transparent);background:color-mix(in srgb,var(--ok) 7%,transparent)}
.stack2{display:flex;flex-direction:column-reverse;gap:2px;min-height:110px;justify-content:flex-start;width:46px}
.stack2 i{display:block;height:7px;border-radius:50%/60%;background:linear-gradient(180deg,#ffe58a,#e0a92a 60%,#b07a12);box-shadow:0 1px 0 #8a5d0b,inset 0 1px 0 rgba(255,255,255,.6);animation:drop .55s cubic-bezier(.3,1.4,.5,1) both;animation-delay:calc(.4s + var(--i) * 70ms)}
.best .stack2 i{background:linear-gradient(180deg,#b8ffd9,#4fe0a6 60%,#1f9b68);box-shadow:0 1px 0 #157a50,inset 0 1px 0 rgba(255,255,255,.6)}
@keyframes drop{from{transform:translateY(-60px);opacity:0}}
.dt{display:flex;flex-direction:column;gap:2px;min-width:0}.dt span{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--secondary-text-color)}.dt b{font-size:30px;font-weight:850;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.now .dt b{color:var(--e)}.best .dt b{color:var(--ok)}.dt small{font-size:12px;color:var(--secondary-text-color)}
.vs{align-self:center;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:color-mix(in srgb,var(--primary-text-color) 6%,transparent);font-size:12px;font-weight:900;color:var(--secondary-text-color)}
.apps{display:grid;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--l)}
.app{display:grid;grid-template-columns:26px minmax(90px,140px) minmax(0,1fr) 84px 118px;gap:10px;align-items:center;animation:rise .5s both;animation-delay:calc(.3s + var(--i) * 90ms)}.app ha-icon{--mdc-icon-size:22px;color:var(--h)}.app span{font-weight:750;font-size:13px;display:flex;flex-direction:column}.app span small{font-size:11px;font-weight:600;color:var(--secondary-text-color)}
.ab{position:relative;height:12px;border-radius:6px;background:color-mix(in srgb,var(--primary-text-color) 5%,transparent);overflow:hidden}.ab i{position:absolute;left:0;top:0;bottom:0;border-radius:6px;animation:grow 1s cubic-bezier(.2,.8,.2,1) both}.ab i.n{background:color-mix(in srgb,var(--e) 55%,transparent)}.ab i.b{background:var(--ok);height:5px;top:auto;animation-delay:.25s}
.app b{text-align:right;font-size:13px;font-variant-numeric:tabular-nums;color:var(--e)}.app em{font-style:normal;font-size:12px;font-weight:750;color:var(--ok);white-space:nowrap}
.krt{font-style:normal;font-size:11.5px;font-weight:800;color:var(--e)}
@media(max-width:720px){.curve{height:210px}.clab{font-size:10px;padding:3px 7px}.duel{grid-template-columns:1fr;gap:8px}.vs{display:none}.dt b{font-size:26px}.stack2{min-height:80px;width:38px}.app{grid-template-columns:22px minmax(0,1fr) 70px;row-gap:4px}.app .ab{grid-column:1/-1;order:5}.app em{grid-column:2/-1;text-align:right;margin-top:-4px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}

.eo{--e:#ffc53d;--c:#b388ff;--lv:#ffc53d}.eo.lv-cheap{--lv:var(--ok)}.eo.lv-dear{--lv:var(--bad)}
.eo .hero{border-left-color:var(--lv)}.eo .panel{border-left-color:var(--e)}.eo .stat{border-left-color:var(--l)}
.eo .aurora{background:radial-gradient(38% 34% at 18% 35%,color-mix(in srgb,var(--lv) 24%,transparent),transparent 70%),radial-gradient(34% 30% at 78% 28%,color-mix(in srgb,var(--e) 18%,transparent),transparent 70%),radial-gradient(30% 30% at 60% 90%,color-mix(in srgb,var(--h) 16%,transparent),transparent 70%)}
.eo .ring .arc{stroke:var(--lv);filter:drop-shadow(0 0 8px color-mix(in srgb,var(--lv) 70%,transparent));animation:arc 1.4s cubic-bezier(.2,.8,.2,1) both}@keyframes arc{from{stroke-dasharray:0 999}}
.eo .ring-in b{font-size:30px}.eo .ring-in small{display:block;max-width:104px;margin:4px auto 0;font-size:10px;line-height:1.25;color:var(--secondary-text-color)}
.eo .eyebrow{color:var(--e)}.eo .id h2{background:linear-gradient(100deg,var(--primary-text-color) 30%,var(--lv));-webkit-background-clip:text;background-clip:text;color:transparent}
.eo .mood{color:color-mix(in srgb,var(--lv) 70%,var(--primary-text-color))}.eo .mood i{background:var(--lv);box-shadow:0 0 0 0 var(--lv);animation:pulse 2.2s infinite}@keyframes pulse{70%{box-shadow:0 0 0 9px transparent}100%{box-shadow:0 0 0 0 transparent}}
.chip b{font-weight:850;font-variant-numeric:tabular-nums}.chip.live{border-color:color-mix(in srgb,var(--h) 35%,transparent)}.car-flow{opacity:.65}.car-flow.on{opacity:1;border-color:color-mix(in srgb,var(--c) 45%,transparent)}
.flow{display:inline-flex;gap:2px;margin-right:2px}.flow i{width:4px;height:4px;border-radius:50%;background:var(--h);animation:fl var(--spd,2s) ease-in-out infinite}.flow i:nth-child(2){animation-delay:calc(var(--spd,2s) / 3)}.flow i:nth-child(3){animation-delay:calc(var(--spd,2s) / 1.5)}@keyframes fl{0%,100%{opacity:.15;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
.stat b.e{color:var(--e)}.hicon.amber{background:color-mix(in srgb,var(--e) 15%,transparent);color:var(--e)}.hicon.purple{background:color-mix(in srgb,var(--c) 15%,transparent);color:var(--c)}
.head .fsum{font-size:18px;color:var(--ok)}
.pbars{display:flex;align-items:stretch;gap:3px;height:170px}
.pc{flex:1;min-width:0;display:grid;grid-template-rows:minmax(0,1fr) 16px;position:relative}
.pc i{align-self:end;display:block;border-radius:5px 5px 2px 2px;animation:up .8s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 14ms)}
.pc.cheap i{background:linear-gradient(180deg,var(--ok),color-mix(in srgb,var(--ok) 35%,transparent))}.pc.normal i{background:linear-gradient(180deg,var(--e),color-mix(in srgb,var(--e) 35%,transparent))}.pc.dear i{background:linear-gradient(180deg,var(--bad),color-mix(in srgb,var(--bad) 35%,transparent))}
.pc.past i{opacity:.3}.pc.win i{box-shadow:0 0 0 2px color-mix(in srgb,var(--ok) 85%,transparent),0 0 14px color-mix(in srgb,var(--ok) 45%,transparent)}
.pc.now i{box-shadow:0 0 0 2px var(--primary-text-color),0 0 18px var(--lv)}.pc.now::before{content:"nu";position:absolute;top:-2px;left:50%;transform:translateX(-50%);font-size:9.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--primary-text-color);padding:1px 5px;border-radius:6px;background:color-mix(in srgb,var(--lv) 45%,transparent);animation:pulse 2.2s infinite}
.pc span{font-size:10px;font-weight:700;text-align:center;color:var(--secondary-text-color);padding-top:3px}
.pdiv{flex:0 0 2px;background:var(--l);position:relative;margin:0 5px}.pdiv span{position:absolute;top:-3px;left:6px;font-size:9.5px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:var(--secondary-text-color);white-space:nowrap}
.bar.h i{background:linear-gradient(90deg,color-mix(in srgb,var(--h) 30%,transparent),color-mix(in srgb,var(--h) 75%,transparent))}.bar.c i{background:linear-gradient(90deg,color-mix(in srgb,var(--c) 30%,transparent),color-mix(in srgb,var(--c) 75%,transparent))}
.mrow .s{display:flex;flex-direction:column;align-items:flex-end;gap:1px}.mrow .s b{font-size:15px}.mrow .s small{font-size:11px;font-weight:700;color:var(--secondary-text-color)}.mrow .m em{color:var(--e)}
.legend .c{background:var(--c)}
.chart .kh{fill:color-mix(in srgb,var(--h) 60%,transparent);transform-box:fill-box;transform-origin:bottom;animation:sy .8s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 25ms)}.chart .kc{fill:var(--c);transform-box:fill-box;transform-origin:bottom;animation:sy .8s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 25ms + .2s)}@keyframes sy{from{transform:scaleY(0)}}
.chart .pl{fill:none;stroke:var(--e);stroke-width:3;stroke-linejoin:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--e) 60%,transparent));stroke-dasharray:3000;animation:draw 1.8s ease both}@keyframes draw{from{stroke-dashoffset:3000}}
.chart .nowl{stroke:var(--primary-text-color);stroke-width:1.5;stroke-dasharray:3 5;opacity:.55;vector-effect:non-scaling-stroke}
.stack{display:flex;gap:2px;height:28px;border-radius:9px;overflow:hidden}.stack i{display:block;height:100%;animation:grow .9s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 90ms)}
.plist{display:grid;gap:7px;margin-top:14px}.plist div{display:grid;grid-template-columns:12px minmax(0,1fr) 76px 44px;gap:10px;align-items:center;font-size:13px}.plist i{width:10px;height:10px;border-radius:3px}.plist span{font-weight:700}.plist b{text-align:right;font-variant-numeric:tabular-nums}.plist em{font-style:normal;text-align:right;color:var(--secondary-text-color);font-size:12px}
.donut{display:grid;grid-template-columns:150px minmax(0,1fr);gap:20px;align-items:center}.donut svg{width:150px;height:150px;transform:rotate(-90deg)}.donut circle{fill:none;stroke-width:16}.donut .bg{stroke:color-mix(in srgb,var(--primary-text-color) 8%,transparent)}.donut .dh{stroke:var(--h);animation:arc 1.2s cubic-bezier(.2,.8,.2,1) both}.donut .dc{stroke:var(--c);animation:arc 1.2s .25s cubic-bezier(.2,.8,.2,1) both}
.dl{display:grid;gap:12px}.dl>div{display:grid;grid-template-columns:12px minmax(0,1fr) auto;column-gap:8px;align-items:center}.dl i{width:10px;height:10px;border-radius:3px}.dl i.h{background:var(--h)}.dl i.c{background:var(--c)}.dl span{font-weight:750}.dl b{font-size:16px;font-variant-numeric:tabular-nums}.dl em{grid-column:2/-1;font-style:normal;font-size:11.5px;color:var(--secondary-text-color)}.dl .t{grid-template-columns:minmax(0,1fr) auto;border-top:1px solid var(--l);padding-top:10px}
.dbars{display:grid;grid-template-columns:repeat(30,minmax(0,1fr));gap:4px;align-items:end}.dc2{display:flex;flex-direction:column;align-items:center;gap:4px}.dp{height:120px;width:100%;display:flex;flex-direction:column-reverse}.dp i{display:block;width:100%;animation:up .8s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 18ms)}.dp i.h{background:color-mix(in srgb,var(--h) 70%,transparent);border-radius:0 0 3px 3px}.dp i.c{background:var(--c);border-radius:4px 4px 0 0}.dp i.h:last-child{border-radius:4px 4px 3px 3px}.dc2 span{font-size:10px;font-weight:700;color:var(--secondary-text-color);height:12px}
.mrow .s small{white-space:nowrap}
@media(max-width:720px){.eo .mrow{grid-template-columns:52px minmax(0,1fr) 76px}.pbars{height:140px;gap:2px}.pc span{font-size:8.5px}.pc.now::before{font-size:8px}.donut{grid-template-columns:1fr;justify-items:center}}
`;

if (!customElements.get("ha-electricity-overview-card")) customElements.define("ha-electricity-overview-card", HAElectricityOverviewCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-electricity-overview-card", name: "HA Electricity Overview Card", description: "Strømprisen, forbruget og hvad strømmen koster – i samme stil som gas/fjernvarme-kortet", preview: false });
console.info(`%c HA-ELECTRICITY-OVERVIEW-CARD %c ${VERSION} `, "color:#111;background:#ffc53d;font-weight:700", "color:#ffc53d;background:#111");
