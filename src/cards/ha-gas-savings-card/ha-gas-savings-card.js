// HA Gas Savings Card (Claude AI, 2026-11-23; user: "gas delen ind med lækkert design og godt overblik så vi kan se hvad vi
// faktisk sparer fremfor hvis vi var blevet på gas med samme forbrug som nu").
// For each month since the switch: the heat actually used on district heating (kWh, from the heat meter's long-term
// statistics) → what the same heat would have cost on gas that month (m³ = kWh ÷ (kWh per m³ × boiler efficiency) ×
// that month's all-in gas price + the gas side's fixed amounts) → minus what district heating cost (kWh × price + fixed).
import { keepScroll } from "../shared/keep-scroll.js";
import { countUp } from "../shared/count-up.js";

const VERSION = "1.4.0";
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString("da-DK", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const daysIn = (k) => new Date(+k.slice(0, 4), +k.slice(5), 0).getDate();

/** One month: what gas would have cost for the same heat, and what district heating cost. */
export function monthCompare({ kwh, month, gasPrice, cfg, days, heatPrice, now = new Date() }) {
  const share = days / daysIn(month); // part month (switch month / current month) gets a part of the fixed amounts
  const m3 = kwh / (cfg.kwh_per_m3 * cfg.efficiency);
  const gasFixed = ((cfg.gas_fixed_year + cfg.service_year) / 12) * share;
  const gas = m3 * gasPrice + gasFixed;
  const heat = kwh * heatPrice + cfg.heat_fixed_month * share;
  return { month, kwh, m3, gasPrice, gas, heat, saved: gas - heat, partial: month === ym(now) };
}
/** Et gasår fra regningerne (gas-kWh og samlet pris pr. m³ pr. måned) mod fjernvarme til dagens pris for samme varme. */
export function yearCompare(year, h, cfg, heatPrice) {
  const kwh = (h.kwh || []).map(Number), price = (h.price || []).map(Number);
  const m3 = kwh.reduce((s, v) => s + v / cfg.kwh_per_m3, 0);
  const gas = kwh.reduce((s, v, i) => s + (v / cfg.kwh_per_m3) * (price[i] || 0), 0) + (cfg.history_fixed_year || 0) + (cfg.service_year || 0);
  const heatKwh = kwh.reduce((s, v) => s + v, 0) * cfg.efficiency;
  const heat = heatKwh * heatPrice + cfg.heat_fixed_month * 12;
  return { year, m3, gas, heatKwh, heat, saved: gas - heat, avgM3: m3 > 0 ? (gas - (cfg.service_year || 0)) / m3 : NaN };
}
/** Gasprisens sæsonmønster (bruger, 2026-11-24: "prediktion for gas og hvis den falder eller stiger"). Grundformen er
 *  gasmarkedets typiske år (dyrest jan, billigst jun–jul); hvor stort udsvinget er, tilpasses de månedspriser, HA selv har
 *  registreret (Gasprisguiden), med en lineær tilpasning pris = L·(1 + a·form). Regningernes pris pr. m³ bruges ikke: de
 *  faste afgifter fordelt på få m³ gør sommeren kunstigt dyr. Giver 12 faktorer (snit 1). */
export const GAS_SHAPE = [0.10, 0.08, 0.03, -0.03, -0.06, -0.08, -0.08, -0.06, -0.03, 0.01, 0.05, 0.08];
export function seasonIndex(months, now = new Date()) {
  const lim = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const pts = Object.entries(months || {}).map(([k, v]) => ({ d: new Date(+k.slice(0, 4), +k.slice(5) - 1, 1), v: Number(v) })).filter((p) => p.v > 0 && p.d >= lim);
  let a = 1;
  const xs = pts.map((p) => GAS_SHAPE[p.d.getMonth()]);
  if (pts.length >= 4 && Math.max(...xs) - Math.min(...xs) > 0.05) {
    const n = pts.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = pts.reduce((s, p) => s + p.v, 0) / n;
    const b1 = pts.reduce((s, p, i) => s + (xs[i] - mx) * (p.v - my), 0) / (xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1); const b0 = my - b1 * mx;
    if (b0 > 0) a = Math.max(0.3, Math.min(2.5, b1 / b0));
  }
  return GAS_SHAPE.map((g) => 1 + a * g);
}
/** Forventet pris for en kalendermåned: dagens pris uden sæson (niveau) gange månedens sæsonfaktor. */
export const predictPrice = (idx, now, monthNow, m) => (idx ? (now / idx[monthNow]) * idx[m] : now);
export function priceFor(month, months, fallback) {
  const v = Number(months?.[month]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

class HAGasSavingsCard extends HTMLElement {
  static getStubConfig() { return { heat_energy: "sensor.heat_meter_energy_total", heat_price: 0.6, gas_price: "sensor.gas_price_total" }; }
  setConfig(c) {
    if (!c?.heat_energy) throw new Error("Kortet kræver heat_energy (varmemålerens kWh med langtidsstatistik)");
    this._config = { title: "Gas eller fjernvarme", kwh_per_m3: 11, efficiency: 0.9, gas_fixed_year: 0, service_year: 0, heat_fixed_month: 0, investment: 0, ...c };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._rows = null; this._at = 0; this._render();
  }
  set hass(h) {
    if (!h) return; // local-conditional-card clears hass when it hides the card
    const first = !this._hass; this._hass = h;
    const c = this._config, sig = [c.gas_price, c.gas_price_months, c.heat_price].map((id) => (typeof id === "string" ? h.states[id]?.state : id)).join("|");
    if (!this._at || Date.now() - this._at > 900000) this._load();
    else if (sig !== this._sig || first) { this._sig = sig; this._render(); }
  }
  connectedCallback() {
    if (!this._ro && window.ResizeObserver) {
      this._ro = new ResizeObserver(() => { const w = this._wide(); if (w !== this._wasWide) { this._wasWide = w; this._render(); } });
      this._ro.observe(this);
    }
  }
  disconnectedCallback() { this._ro?.disconnect(); this._ro = null; }
  // Computerudgaven: flere grafer og udregninger, når kortet er bredt (eller layout: wide).
  _wide() { const l = this._config?.layout; return l === "wide" || (l !== "compact" && (this.clientWidth || 0) >= 1000); }

  _wideHtml({ rows, forecast, c, gasNow, heatPrice, saved, yearKwh, months }) {
    const W = 600, H = 170, P = 30, WW = 1200;
    // 1) Akkumuleret besparelse (målt) + prognose frem til tilbagebetaling (max 10 år)
    let acc = Number(c.credit) || 0; const past = rows.map((r) => ({ k: r.month, v: (acc += r.saved) }));
    let fut = []; if (forecast.length) { let a = acc; const yr = forecast.reduce((s, r) => s + r.saved, 0) || 0;
      for (let i = 0; i < 120 && (c.investment ? a < c.investment : i < 24); i++) { a += forecast[i % 12].saved; fut.push({ i, v: a }); if (yr <= 0) break; } }
    const n = past.length + fut.length, maxV = Math.max(c.investment || 0, ...past.map((p) => p.v), ...fut.map((p) => p.v), 1);
    const X = (i) => P + (i / Math.max(1, n - 1)) * (WW - P * 2), Y = (v) => H - 22 - (Math.max(0, v) / maxV) * (H - 40);
    const lineP = past.map((p, i) => `${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
    const lineF = [past.length ? `${X(past.length - 1).toFixed(1)},${Y(acc).toFixed(1)}` : ""].concat(fut.map((p, i) => `${X(past.length + i).toFixed(1)},${Y(p.v).toFixed(1)}`)).filter(Boolean).join(" ");
    const payIdx = c.investment ? fut.findIndex((p) => p.v >= c.investment) : -1;
    const payDate = payIdx >= 0 ? new Date(new Date().getFullYear(), new Date().getMonth() + 1 + payIdx, 1) : null;
    // 2) Gaspris pr. måned (kr/kWh varme) mod fjernvarmens kr/kWh inkl. faste
    const ks = Object.keys(months).sort(); const gk = ks.map((k) => Number(months[k]) / (c.kwh_per_m3 * c.efficiency));
    const fvK = rows.filter((r) => r.kwh > 300).map((r) => ({ k: r.month, v: r.heat / r.kwh }));
    const pmax = Math.max(...gk, ...fvK.map((x) => x.v), 0.5) * 1.1;
    const pX = (i, len) => P + (i / Math.max(1, len - 1)) * (W - P * 2), pY = (v) => H - 22 - (v / pmax) * (H - 40);
    // 3) kr pr. kWh varme opdelt
    const gVar = gasNow / (c.kwh_per_m3 * c.efficiency), gFix = yearKwh > 0 ? (c.gas_fixed_year + c.service_year) / yearKwh : 0;
    const hVar = heatPrice, hFix = yearKwh > 0 ? (c.heat_fixed_month * 12) / yearKwh : 0;
    const kmax = Math.max(gVar + gFix, hVar + hFix);
    // 4) Følsomhed: årlig besparelse ved forskellige gaspriser
    const kwhMax = Math.max(...rows.map((r) => r.kwh), ...(forecast.map((r) => r.kwh)), 1);
    const MN = (k) => MONTHS[+k.slice(5) - 1];
    return `<div class="wide">
  <section class="panel w2"><div class="head"><span class="hicon"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon></span><div><h3>Sparet i alt</h3><p>Det I har sparet siden skiftet${fut.length ? " – og det I forventer at spare" : ""}${payDate ? ` · anlægget er betalt ca. ${MONTHS[payDate.getMonth()]} ${payDate.getFullYear()}` : ""}</p></div></div>
    <svg class="chart" viewBox="0 0 ${WW} ${H}" preserveAspectRatio="none">
      ${c.investment ? `<line class="goal" x1="${P}" x2="${WW - P}" y1="${Y(c.investment)}" y2="${Y(c.investment)}"/><text class="lbl" x="${WW - P}" y="${Y(c.investment) - 5}" text-anchor="end">${fmt(c.investment)} kr</text>` : ""}
      ${lineF ? `<polyline class="fut" points="${lineF}"/>` : ""}
      <polyline class="acc" points="${lineP}"/>
      ${past.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="3.5"/>`).join("")}
      ${past.length ? `<text class="lbl" x="${X(0).toFixed(1)}" y="${H - 6}" text-anchor="start">${MN(past[0].k)} ${past[0].k.slice(0, 4)}</text><text class="lbl" x="${X(past.length - 1).toFixed(1)}" y="${H - 6}" text-anchor="middle">nu · ${fmt(acc)} kr</text>` : ""}
      ${payDate ? `<text class="lbl ok" x="${X(past.length + payIdx).toFixed(1)}" y="${H - 6}" text-anchor="end">betalt hjem ${MONTHS[payDate.getMonth()]} ${payDate.getFullYear()}</text>` : ""}
    </svg></section>
  <section class="panel"><div class="head"><span class="hicon"><ha-icon icon="mdi:fire"></ha-icon></span><div><h3>Hvad en kWh varme koster</h3><p>Gas og fjernvarme måned for måned – alt med</p></div></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <polyline class="gl" points="${gk.map((v, i) => `${pX(i, gk.length).toFixed(1)},${pY(v).toFixed(1)}`).join(" ")}"/>
      <polyline class="hl" points="${fvK.map((x, i) => `${pX(i, fvK.length).toFixed(1)},${pY(x.v).toFixed(1)}`).join(" ")}"/>
      ${gk.map((v, i) => `<text class="lbl" x="${pX(i, gk.length).toFixed(1)}" y="${pY(v) - 7}" text-anchor="middle">${fmt(v, 2)}</text>`).join("")}
      ${ks.map((k, i) => `<text class="lbl" x="${pX(i, ks.length).toFixed(1)}" y="${H - 6}" text-anchor="middle">${MN(k)}</text>`).join("")}
    </svg><div class="legend"><span><i class="g"></i>Gas kr/kWh varme</span><span><i class="h"></i>Fjernvarme kr/kWh (inkl. faste)</span></div></section>
  <section class="panel"><div class="head"><span class="hicon blue"><ha-icon icon="mdi:scale-balance"></ha-icon></span><div><h3>Hvad betaler I for 1 kWh varme?</h3><p>Med dagens priser og et normalt års forbrug (${fmt(yearKwh)} kWh)</p></div></div>
    ${[["Gas", gVar, gFix, "g"], ["Fjernvarme", hVar, hFix, "h"]].map(([n, v, f, cl]) => `<div class="kw"><span>${n}</span><div class="kbar"><i class="${cl}" style="width:${(v / kmax * 100).toFixed(1)}%"></i><i class="${cl} fx" style="width:${(f / kmax * 100).toFixed(1)}%"></i></div><b>${fmt(v + f, 2)} kr</b></div><small class="ksub">${fmt(v, 2)} variabel + ${fmt(f, 2)} faste beløb pr. kWh</small>`).join("")}
  </section>
  <section class="panel w2"><div class="head"><span class="hicon blue"><ha-icon icon="mdi:radiator"></ha-icon></span><div><h3>Varmeforbrug pr. måned</h3><p>Mørk søjle: det I har brugt. Lys søjle: et normalt år</p></div></div>
    <div class="kwh">${(forecast.length ? forecast : rows).map((r) => { const m = r.month.slice(5); const meas = rows.find((x) => x.month.slice(5) === m && !x.partial);
      return `<div class="kc"><div class="kp"><i class="n" style="height:${(r.kwh / kwhMax * 100).toFixed(1)}%"></i>${meas ? `<i class="m" style="height:${(meas.kwh / kwhMax * 100).toFixed(1)}%"></i>` : ""}</div><span>${MONTHS[+m - 1]}</span></div>`; }).join("")}</div>
  </section>
</div>`;
  }

  // År for år (Claude AI, 2026-11-24; bruger: "sammenligning med andre år også på den side"): hvert gasår fra regningerne
  // mod hvad den samme varme koster med fjernvarme til dagens pris, plus fjernvarmen i dag (målt + prognose for et år).
  _yearsHtml(c, heatPrice, rows, forecast) {
    const H = c.history_years; if (!H || typeof H !== "object") return "";
    const yrs = Object.keys(H).sort().map((y) => yearCompare(y, H[y], c, heatPrice));
    if (!yrs.length) return "";
    const fYear = forecast.length ? { year: "Næste år", gas: forecast.reduce((s, r) => s + r.gas, 0), heat: forecast.reduce((s, r) => s + r.heat, 0), m3: forecast.reduce((s, r) => s + r.m3, 0), heatKwh: forecast.reduce((s, r) => s + r.kwh, 0), fc: true } : null;
    if (fYear) fYear.saved = fYear.gas - fYear.heat;
    const all = fYear ? [...yrs, fYear] : yrs; const max = Math.max(1, ...all.map((y) => Math.max(y.gas, y.heat)));
    const avgSaved = yrs.reduce((s, y) => s + y.saved, 0) / yrs.length;
    return `<section class="panel yrs">
    <div class="head"><span class="hicon"><ha-icon icon="mdi:calendar-multiple"></ha-icon></span><div><h3>År for år</h3><p>Hvad gassen kostede de år – og hvad fjernvarme ville have kostet</p></div><span class="fsum pos">ca. ${fmt(avgSaved)} kr om året</span></div>
    <div class="months">${all.map((y, i) => `<div class="mrow${y.fc ? " fcrow" : ""}" style="--i:${i}">
      <span class="m">${esc(y.year)}${y.fc ? "<em>prognose</em>" : ""}</span>
      <div class="bars"><div class="bar g"><i style="width:${((y.gas / max) * 100).toFixed(1)}%"></i><b>${fmt(y.gas)} kr</b><small>${fmt(y.m3)} m³${Number.isFinite(y.avgM3) ? ` · ${fmt(y.avgM3, 2)} kr/m³` : ""}</small></div>
      <div class="bar h"><i style="width:${((y.heat / max) * 100).toFixed(1)}%"></i><b>${fmt(y.heat)} kr</b><small>${fmt(y.heatKwh)} kWh varme</small></div></div>
      <span class="s ${y.saved >= 0 ? "pos" : "neg"}">${y.saved >= 0 ? "+" : ""}${fmt(y.saved)}</span></div>`).join("")}</div>
    <div class="legend"><span><i class="g"></i>Gas (regningerne)</span><span><i class="h"></i>Fjernvarme til samme varme</span></div>
    <p class="foot">Fjernvarmen er regnet med dagens pris og samme varmeforbrug som det år. "Næste år" er et bud ud fra normalt forbrug.</p>
  </section>`;
  }

  // Gasprisen før og fremover (Claude AI, 2026-11-24): de sidste 12 måneders pris (registreret eller fra regningerne) og
  // de næste 12 som prognose; grøn under dagens pris, rød over. Og hvad besparelsen bliver, hvis gassen falder eller stiger.
  _predHtml(c, idx, gNow, now, forecast, heatPrice) {
    if (!idx || !Number.isFinite(gNow)) return "";
    let months = {}; try { months = c.gas_price_months ? JSON.parse(this._hass.states[c.gas_price_months]?.state || "{}") : {}; } catch { months = {}; }
        const past = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1), k = ym(d); const rec = Number(months[k]);
      return { k, m: d.getMonth(), v: rec > 0 ? rec : NaN, rec: rec > 0 }; });
    const fut = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1); return { k: ym(d), m: d.getMonth(), v: predictPrice(idx, gNow, now.getMonth(), d.getMonth()) }; });
    const all = [...past, ...fut].filter((x) => Number.isFinite(x.v)); const max = Math.max(...all.map((x) => x.v)) * 1.05, min = Math.min(...all.map((x) => x.v)) * 0.9;
    const hgt = (v) => Math.max(8, ((v - min) / (max - min || 1)) * 100);
    const next = fut[0], hi = fut.reduce((a, b) => (b.v > a.v ? b : a)), lo = fut.reduce((a, b) => (b.v < a.v ? b : a));
    const pct = (v) => ((v - gNow) / gNow) * 100; const arrow = (v) => (v >= gNow ? "▲" : "▼");
    // Hvis gassen falder/stiger 20 % i forhold til prognosen: årets besparelse.
    const yr = (f) => forecast.reduce((s, r) => s + r.m3 * r.gasPrice * f - r.m3 * r.gasPrice, 0) + forecast.reduce((s, r) => s + r.saved, 0);
    const base = forecast.reduce((s, r) => s + r.saved, 0);
    const col = (x, fut2) => `<div class="pp${fut2 ? " fut" : ""} ${x.v > gNow * 1.02 ? "up" : x.v < gNow * 0.98 ? "down" : "eq"}" title="${MONTHS[x.m]} ${x.k.slice(0, 4)}: ${Number.isFinite(x.v) ? `${fmt(x.v, 2)} kr/m³` : "ikke registreret"}${fut2 ? " (prognose)" : ""}"><i style="height:${Number.isFinite(x.v) ? hgt(x.v).toFixed(1) : 0}%"></i><span>${x.m % 3 === 0 ? MONTHS[x.m] : ""}</span></div>`;
    return `<section class="panel pred">
    <div class="head"><span class="hicon"><ha-icon icon="mdi:chart-bell-curve-cumulative"></ha-icon></span><div><h3>Gasprisen – før og fremover</h3><p>Prisen de sidste 12 måneder og vores bud på de næste 12 · i dag ${fmt(gNow, 2)} kr/m³</p></div></div>
    <div class="pbars2">${past.map((x) => col(x, false)).join("")}<div class="pnow"><span>nu</span></div>${fut.map((x) => col(x, true)).join("")}</div>
    <div class="chips pchips">
      <span class="chip ${next.v >= gNow ? "bad" : "good"}"><ha-icon icon="mdi:calendar-arrow-right"></ha-icon>${MONTHS[next.m]}: ≈ ${fmt(next.v, 2)} kr/m³ ${arrow(next.v)} ${fmt(Math.abs(pct(next.v)), 0)} %</span>
      <span class="chip bad"><ha-icon icon="mdi:arrow-up-bold"></ha-icon>Højest ${MONTHS[hi.m]} ≈ ${fmt(hi.v, 2)} kr/m³</span>
      <span class="chip good"><ha-icon icon="mdi:arrow-down-bold"></ha-icon>Lavest ${MONTHS[lo.m]} ≈ ${fmt(lo.v, 2)} kr/m³</span>
    </div>
    ${forecast.length ? `<div class="scen">${[[0.8, "Hvis gassen bliver 20 % billigere", "mdi:trending-down"], [1, "Som vi forventer", "mdi:trending-neutral"], [1.2, "Hvis gassen bliver 20 % dyrere", "mdi:trending-up"]].map(([f, l, ic]) => { const v = f === 1 ? base : yr(f); return `<div class="sc2 ${f < 1 ? "dn" : f > 1 ? "upx" : "mid"}"><ha-icon icon="${ic}"></ha-icon><span>${l}</span><b>${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))} kr</b><small>sparet det næste år</small></div>`; }).join("")}</div>` : ""}
  </section>`;
  }

  // Hvis gassen kostede … (Claude AI, 2026-11-24; bruger: "hvis gassen koster 15-16-17-18 eller mindre end nu, hvad det så
  // gør"): hele kroner fra 3 kr under dagens pris op til mindst 18 kr; for hver: hvad I sparer om året og hvornår anlægget
  // er betalt. Året er et normalt års varmeforbrug; dagens pris er markeret.
  _sensHtml(c, gNow, forecast, yearKwh, heatPrice, paid) {
    if (!Number.isFinite(gNow)) return "";
    const m3 = forecast.length ? forecast.reduce((s, r) => s + r.m3, 0) : yearKwh > 0 ? yearKwh / (c.kwh_per_m3 * c.efficiency) : NaN;
    const heat = forecast.length ? forecast.reduce((s, r) => s + r.heat, 0) : yearKwh * heatPrice + c.heat_fixed_month * 12;
    if (!Number.isFinite(m3)) return "";
    const fixed = c.gas_fixed_year + c.service_year;
    const lo = Math.max(1, Math.floor(gNow) - 3), hi = Math.max(18, Math.ceil(gNow) + 2);
    const prices = []; for (let p = lo; p <= hi; p += 1) prices.push(p);
    const near = Math.round(gNow);
    const rows = prices.map((p) => { const y = m3 * p + fixed - heat; const left = Math.max(0, (c.investment || 0) - paid); return { p, y, yrs: c.investment && y > 0 ? left / y : NaN, now: p === near }; });
    const max = Math.max(...rows.map((r) => Math.abs(r.y)), 1);
    return `<section class="panel sens">
    <div class="head"><span class="hicon green"><ha-icon icon="mdi:tune-variant"></ha-icon></span><div><h3>Hvis gassen kostede …</h3><p>Hvad I sparer om året ved forskellige gaspriser – og hvornår anlægget så er betalt</p></div></div>
    <div class="svh"><span>Gaspris</span><span></span><span>Sparer om året</span><span>Betalt om</span></div>
    ${rows.map((r, i) => `<div class="sv ${r.now ? "cur" : ""} " style="--i:${i}"><span>${fmt(r.p)} kr/m³${r.now ? "<small>ca. i dag</small>" : ""}</span><div class="sbar"><i class="${r.y >= 0 ? "pos" : "neg"}" style="width:${((Math.abs(r.y) / max) * 100).toFixed(1)}%"></i></div><b class="${r.y >= 0 ? "pos" : "neg"}">${r.y >= 0 ? "" : "−"}${fmt(Math.abs(r.y))} kr</b><em>${Number.isFinite(r.yrs) ? (r.yrs <= 0 ? "betalt" : `${fmt(r.yrs, 1)} år`) : "–"}</em></div>`).join("")}
    <p class="foot">Hver linje regner med, at gassen koster det samme hele året, og med et normalt års varmeforbrug. I dag koster gassen ${fmt(gNow, 2)} kr/m³. Jo dyrere gassen er, jo mere sparer I på fjernvarmen.</p>
  </section>`;
  }

  getCardSize() { return 9; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }

  _num(v) { if (typeof v === "number") return v; const s = this._hass?.states?.[v]; const n = parseFloat(String(s?.state ?? v).replace(",", ".")); return Number.isFinite(n) ? n : NaN; }

  async _load() {
    this._at = Date.now();
    const c = this._config;
    const start = c.switch_date ? new Date(`${c.switch_date}T00:00:00`) : new Date(Date.now() - 365 * 86400000);
    try {
      const res = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: new Date(start.getFullYear(), start.getMonth(), 1).toISOString(), statistic_ids: [c.heat_energy], period: "day", types: ["change"] });
      const byMonth = {};
      for (const r of res[c.heat_energy] || []) {
        const d = new Date(r.start); if (d < start) continue;
        const k = ym(d); const o = byMonth[k] || (byMonth[k] = { kwh: 0, days: 0 });
        const v = r.change || 0; if (v > 0 && v < (c.max_kwh_day || 400)) o.kwh += v; o.days += 1; // max_kwh_day skips meter glitches
      }
      this._rows = byMonth; this._err = "";
    } catch (e) { this._err = String(e?.message || e); }
    this._render();
  }

  _render() { if (this.shadowRoot && this._config) keepScroll(this, () => { this.shadowRoot.innerHTML = `<style>${STYLE}</style>${this._html()}`; countUp(this.shadowRoot); }); }

  _html() {
    const c = this._config;
    if (!this._rows) return `<div class="gs"><section class="panel"><p class="muted">${this._err ? `Kunne ikke hente varmemålerens statistik: ${esc(this._err)}` : "Indlæser…"}</p></section></div>`;
    let months = {};
    try { months = c.gas_price_months ? JSON.parse(this._hass.states[c.gas_price_months]?.state || "{}") : {}; } catch { months = {}; }
    const gasNow = this._num(c.gas_price);
    const known = Object.values(months).map(Number).filter((v) => v > 0);
    const gasAvg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : gasNow;
    const heatPrice = this._num(c.heat_price);
    const rows = Object.keys(this._rows).sort().filter((k) => this._rows[k].kwh > 0)
      .map((k) => monthCompare({ kwh: this._rows[k].kwh, month: k, days: this._rows[k].days, gasPrice: priceFor(k, months, gasNow || gasAvg), heatPrice, cfg: c }));
    const sum = (f) => rows.reduce((s, r) => s + r[f], 0);
    const saved = sum("saved"), gasTot = sum("gas"), heatTot = sum("heat");
    const cur = rows.find((r) => r.partial);
    const full = rows.filter((r) => !r.partial);
    // Year estimate: the months we have, scaled to a whole year by heat use (winter weighs more than summer).
    // heat_profile: varme (kWh) pr. kalendermåned fra et normalt år (fx sidste gasår), bruges til prognosen.
    const prof = Array.isArray(c.heat_profile) && c.heat_profile.length === 12 ? c.heat_profile.map(Number) : null;
    const yearKwh = c.year_kwh || (prof ? prof.reduce((a, b) => a + b, 0) : (full.length >= 12 ? full.slice(-12).reduce((s, r) => s + r.kwh, 0) : NaN));
    const now = new Date();
    let pmonths = {}; try { pmonths = c.gas_price_months ? JSON.parse(this._hass.states[c.gas_price_months]?.state || "{}") : {}; } catch { pmonths = {}; }
    const sIdx = seasonIndex(pmonths, now); const gNow = gasNow || gasAvg; const pred = (m) => predictPrice(sIdx, gNow, now.getMonth(), m);
    const forecast = prof ? Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1), k = ym(d);
      return monthCompare({ kwh: prof[d.getMonth()], month: k, days: daysIn(k), gasPrice: pred(d.getMonth()), heatPrice, cfg: c, now: new Date(0) });
    }) : [];
    const fSaved = forecast.reduce((s, r) => s + r.saved, 0);
    const fMax = Math.max(1, ...forecast.map((r) => Math.max(r.gas, r.heat)));
    const trend = (() => { const ks = Object.keys(months).sort(); if (ks.length < 2) return NaN; const a = Number(months[ks[ks.length - 2]]), b = Number(months[ks[ks.length - 1]]); return a > 0 ? (b - a) / a * 100 : NaN; })();
    const yearSaved = forecast.length ? forecast.reduce((a, r) => a + r.saved, 0) : Number.isFinite(yearKwh)
      ? (yearKwh / (c.kwh_per_m3 * c.efficiency)) * (gasNow || gasAvg) + c.gas_fixed_year + c.service_year - (yearKwh * heatPrice + c.heat_fixed_month * 12)
      : NaN;
    // Salget af det gamle gasfyr tæller med i afbetalingen (bruger, 2026-11-24: "vi solgte vores gamle fyr for 2000kr").
    const credit = Number(c.credit) || 0; const paid = saved + credit;
    const pct = c.investment > 0 ? Math.max(0, Math.min(100, (paid / c.investment) * 100)) : 0;
    const yearsLeft = c.investment > 0 && yearSaved > 0 ? Math.max(0, c.investment - paid) / yearSaved : NaN;
    const gasKwhHeat = (gasNow || gasAvg) / (c.kwh_per_m3 * c.efficiency);
    const max = Math.max(1, ...rows.map((r) => Math.max(r.gas, r.heat)));
    const R = 62, C = 2 * Math.PI * R;
    return `<div class="gs">
  <section class="hero">
    <div class="aurora"></div>
    <div class="ring"><svg viewBox="0 0 150 150"><circle class="bg" cx="75" cy="75" r="${R}"/><circle class="arc" cx="75" cy="75" r="${R}" stroke-dasharray="${(C * pct / 100).toFixed(1)} ${C.toFixed(1)}"/></svg>
      <div class="ring-in"><b data-count="${Math.round(pct)}" data-suf="%">${fmt(pct)}%</b><span>betalt hjem</span>${c.investment ? `<small>af ${fmt(c.investment)} kr</small>` : ""}</div></div>
    <div class="id">
      <div class="eyebrow">${esc(c.title)}</div>
      <h2><span data-count="${Math.round(saved)}">${fmt(saved)}</span> kr sparet</h2>
      <div class="mood ${saved >= 0 ? "" : "bad"}"><i></i>${saved >= 0 ? "billigere end gas" : "dyrere end gas"}${c.switch_date ? ` siden ${new Date(`${c.switch_date}T12:00:00`).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}` : ""}</div>
      <div class="chips">
        <span class="chip gas"><ha-icon icon="mdi:fire"></ha-icon>Gas i dag ${fmt(gasNow || gasAvg, 2)} kr/m³${Number.isFinite(trend) ? ` · ${trend >= 0 ? "▲" : "▼"} ${fmt(Math.abs(trend), 1)} % siden sidste måned` : ""}</span>
        <span class="chip heat"><ha-icon icon="mdi:radiator"></ha-icon>Fjernvarme ${fmt(heatPrice, 2)} kr/kWh + ${fmt(c.heat_fixed_month)} kr om måneden</span>
        ${cur ? `<span class="chip"><ha-icon icon="mdi:calendar-today"></ha-icon>${cur.saved >= 0 ? "Sparet" : "Tabt"} i ${MONTHS[+cur.month.slice(5) - 1]}.: ${fmt(Math.abs(cur.saved))} kr</span>` : ""}
        ${Number.isFinite(yearSaved) ? `<span class="chip good"><ha-icon icon="mdi:calendar-check"></ha-icon>Sparer ca. ${fmt(yearSaved)} kr om året</span>` : ""}
        ${credit ? `<span class="chip good"><ha-icon icon="mdi:cash-plus"></ha-icon>${esc(c.credit_label || "Solgt gasfyr")} +${fmt(credit)} kr</span>` : ""}
        ${Number.isFinite(yearsLeft) ? `<span class="chip"><ha-icon icon="mdi:timer-sand"></ha-icon>${yearsLeft <= 0 ? "Betalt hjem" : `Betalt om ca. ${fmt(yearsLeft, 1)} år`}</span>` : ""}
      </div>
    </div>
  </section>
  <div class="grid">
    <section class="panel stat"><span>Gas ville have kostet</span><b class="g" data-count="${Math.round(gasTot)}" data-suf=" kr">${fmt(gasTot)} kr</b><small>${fmt(sum("m3"))} m³ gas · alt med: afgifter, abonnement${c.service_year ? " og service" : ""}</small></section>
    <section class="panel stat"><span>Fjernvarme har kostet</span><b class="h" data-count="${Math.round(heatTot)}" data-suf=" kr">${fmt(heatTot)} kr</b><small>${fmt(sum("kwh"))} kWh · alt med, også de faste udgifter</small></section>
    <section class="panel stat"><span>Forskel</span><b class="${saved >= 0 ? "s" : "r"}">${saved >= 0 ? "+" : "−"}${fmt(Math.abs(saved))} kr</b><small>${gasTot > 0 ? `${fmt((saved / gasTot) * 100)} % ${saved >= 0 ? "billigere" : "dyrere"}` : ""}</small></section>
  </div>
  ${forecast.length ? `<section class="panel fc">
    <div class="head"><span class="hicon blue"><ha-icon icon="mdi:crystal-ball"></ha-icon></span><div><h3>De næste 12 måneder</h3><p>Hvad gas og fjernvarme forventes at koste hver måned, når I bruger lige så meget varme som normalt</p></div><b class="fsum ${fSaved >= 0 ? "pos" : "neg"}">${fSaved >= 0 ? "+" : ""}${fmt(fSaved)} kr</b></div>
    <div class="fbars">${forecast.map((r) => `<div class="fcol" title="${MONTHS[+r.month.slice(5) - 1]}: gas ${fmt(r.gas)} kr · fjernvarme ${fmt(r.heat)} kr"><div class="fpair"><i class="g" style="height:${((r.gas / fMax) * 100).toFixed(1)}%"></i><i class="h" style="height:${((r.heat / fMax) * 100).toFixed(1)}%"></i></div><em class="${r.saved >= 0 ? "pos" : "neg"}">${r.saved >= 0 ? "+" : ""}${fmt(r.saved / 1000, 1)}k</em><span>${MONTHS[+r.month.slice(5) - 1]}</span></div>`).join("")}</div>
    <p class="foot">Gasprisen fremover er et bud: gas plejer at være dyrest i januar og billigst om sommeren. Bliver gassen dyrere end ventet, sparer I mere – bliver den billigere, sparer I mindre. ${Number.isFinite(yearsLeft) && c.investment ? `Så er anlægget betalt om ca. ${fmt(yearsLeft, 1)} år.` : ""}</p>
  </section>` : ""}
  ${this._predHtml(c, sIdx, gNow, now, forecast, heatPrice)}
  ${this._sensHtml(c, gNow, forecast, yearKwh, heatPrice, paid)}
  <section class="panel">
    <div class="head"><span class="hicon"><ha-icon icon="mdi:chart-bar"></ha-icon></span><div><h3>Måned for måned</h3><p>Hvad gas ville have kostet hver måned – mod det, fjernvarmen faktisk kostede</p></div></div>
    <div class="months">${rows.slice().reverse().map((r) => `<div class="mrow">
      <span class="m">${MONTHS[+r.month.slice(5) - 1]} ${r.month.slice(2, 4)}${r.partial ? "<em>nu</em>" : ""}</span>
      <div class="bars"><div class="bar g"><i style="width:${((r.gas / max) * 100).toFixed(1)}%"></i><b>${fmt(r.gas)} kr</b><small>${fmt(r.gasPrice, 2)} kr/m³</small></div>
      <div class="bar h"><i style="width:${((r.heat / max) * 100).toFixed(1)}%"></i><b>${fmt(r.heat)} kr</b><small>${fmt(r.kwh)} kWh</small></div></div>
      <span class="s ${r.saved >= 0 ? "pos" : "neg"}">${r.saved >= 0 ? "+" : ""}${fmt(r.saved)}</span></div>`).join("")}</div>
    <div class="legend"><span><i class="g"></i>Hvis vi stadig havde gas</span><span><i class="h"></i>Fjernvarme</span></div>
    <p class="foot">Gassen er regnet ud fra den varme, I faktisk har brugt, og den måneds gaspris – med alle faste udgifter.</p>
  </section>
${this._yearsHtml(c, heatPrice, rows, forecast)}
${this._wide() ? this._wideHtml({ rows, forecast, c, gasNow: gasNow || gasAvg, heatPrice, saved, yearKwh, months }) : ""}
</div>`;
  }
}

const STYLE = `
:host{display:block}
.gs{--g:#ff8a3d;--h:#4cc9ff;--ok:var(--dashboard-success,#4fe0a6);--bad:var(--dashboard-danger,#ff667a);--s:var(--surface,var(--ha-card-background,var(--card-background-color,#141c27)));--l:color-mix(in srgb,var(--primary-text-color) 9%,transparent);display:grid;gap:14px;color:var(--primary-text-color)}
.hero,.panel{position:relative;border-radius:24px;background:var(--s);border:1px solid var(--l);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--ok);box-shadow:var(--dashboard-shadow-strong,0 12px 32px rgba(0,0,0,.22));animation:rise .6s cubic-bezier(.2,.8,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(8px)}}
.ring .arc{animation:arc0 1.4s cubic-bezier(.2,.8,.2,1) both}@keyframes arc0{from{stroke-dasharray:0 999}}
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
.mrow .s{text-align:right;font-weight:850;font-size:15px}.yrs .fcrow{opacity:.85}.yrs .fcrow .m em{color:var(--ok)}.mrow .s.pos{color:var(--ok)}.mrow .s.neg{color:var(--bad)}
.legend{display:flex;gap:16px;margin-top:12px;font-size:12px;color:var(--secondary-text-color)}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}.legend .g{background:var(--g)}.legend .h{background:var(--h)}
.foot{margin:10px 2px 0;font-size:11.5px;line-height:1.5;color:var(--secondary-text-color)}.muted{margin:0;color:var(--secondary-text-color)}
.wide{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.wide .w2{grid-column:1/-1}
.chart{width:100%;height:190px;display:block}.chart .acc{fill:none;stroke:var(--ok);stroke-width:3;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--ok) 60%,transparent))}.chart .fut{fill:none;stroke:var(--ok);stroke-width:2;stroke-dasharray:6 6;opacity:.55;vector-effect:non-scaling-stroke}.chart circle{fill:var(--ok)}.chart .goal{stroke:var(--g);stroke-width:1.5;stroke-dasharray:4 6;vector-effect:non-scaling-stroke;opacity:.7}.chart .gl{fill:none;stroke:var(--g);stroke-width:3;vector-effect:non-scaling-stroke}.chart .hl{fill:none;stroke:var(--h);stroke-width:3;vector-effect:non-scaling-stroke}.chart .lbl{font-size:11px;fill:var(--secondary-text-color);font-weight:700}.chart .lbl.ok{fill:var(--ok)}
.kw{display:grid;grid-template-columns:90px minmax(0,1fr) 70px;gap:10px;align-items:center;margin-top:10px}.kw span{font-weight:800}.kw b{text-align:right;font-size:16px}.kbar{display:flex;height:22px;border-radius:7px;overflow:hidden;background:color-mix(in srgb,var(--primary-text-color) 5%,transparent)}.kbar i{height:100%}.kbar i.g{background:var(--g)}.kbar i.h{background:var(--h)}.kbar i.fx{opacity:.45}.ksub{display:block;margin:3px 0 0 100px;font-size:11px;color:var(--secondary-text-color)}
.sv{display:grid;grid-template-columns:96px minmax(0,1fr) 96px 64px;gap:10px;align-items:center;padding:7px 10px;border-radius:12px;animation:rise .45s both;animation-delay:calc(var(--i) * 40ms)}.sv span small{display:block;font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:var(--g)}.svh{display:grid;grid-template-columns:96px minmax(0,1fr) 96px 64px;gap:10px;padding:0 10px 4px;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--secondary-text-color)}.svh span:nth-child(3),.svh span:nth-child(4){text-align:right}.sv.cur{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--g) 55%,transparent)}.sv.cur{background:color-mix(in srgb,var(--g) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--g) 40%,transparent)}.sv span{font-weight:800}.sbar{height:18px;border-radius:6px;background:color-mix(in srgb,var(--primary-text-color) 5%,transparent);overflow:hidden}.sbar i{display:block;height:100%}.sbar i.pos{background:color-mix(in srgb,var(--ok) 70%,transparent)}.sbar i.neg{background:color-mix(in srgb,var(--bad) 70%,transparent)}.sv b{text-align:right}.sv b.pos{color:var(--ok)}.sv b.neg{color:var(--bad)}.sv em{font-style:normal;text-align:right;color:var(--secondary-text-color);font-size:12px}
.kwh{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px;align-items:end}.kc{display:flex;flex-direction:column;align-items:center;gap:4px}.kp{position:relative;height:120px;width:70%}.kp i{position:absolute;left:0;right:0;bottom:0;border-radius:6px 6px 2px 2px}.kp i.n{background:color-mix(in srgb,var(--h) 30%,transparent)}.kp i.m{left:22%;right:22%;background:var(--h)}.kc span{font-size:11px;color:var(--secondary-text-color);font-weight:700}
.hicon.green{background:color-mix(in srgb,var(--ok) 15%,transparent);color:var(--ok)}
@media(max-width:720px){.hero{grid-template-columns:1fr;justify-items:center;text-align:center;padding:20px 16px}.id{min-width:0;max-width:100%}.id h2{font-size:30px}.mood,.chips{justify-content:center}.grid{grid-template-columns:1fr}.mrow{grid-template-columns:56px minmax(0,1fr) 62px}}
.pbars2{display:flex;align-items:stretch;gap:3px;height:130px}.pp{flex:1;min-width:0;display:grid;grid-template-rows:minmax(0,1fr) 16px}.pp i{align-self:end;display:block;border-radius:4px 4px 2px 2px;background:color-mix(in srgb,var(--g) 45%,transparent);animation:up .8s cubic-bezier(.2,.8,.2,1) both}.pp.fut i{background:repeating-linear-gradient(180deg,color-mix(in srgb,var(--g) 85%,transparent) 0 6px,color-mix(in srgb,var(--g) 55%,transparent) 6px 9px)}.pp.fut.up i{background:repeating-linear-gradient(180deg,var(--bad) 0 6px,color-mix(in srgb,var(--bad) 60%,transparent) 6px 9px)}.pp.fut.down i{background:repeating-linear-gradient(180deg,var(--ok) 0 6px,color-mix(in srgb,var(--ok) 60%,transparent) 6px 9px)}.pp span{font-size:10px;font-weight:700;text-align:center;color:var(--secondary-text-color);padding-top:3px}
.pnow{flex:0 0 2px;background:color-mix(in srgb,var(--primary-text-color) 35%,transparent);position:relative;margin:0 4px}.pnow span{position:absolute;top:-2px;left:5px;font-size:9.5px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:var(--secondary-text-color)}
.pchips{margin-top:12px}.chip.bad{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 40%,transparent);background:color-mix(in srgb,var(--bad) 10%,transparent)}
.scen{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}.sc2{display:flex;flex-direction:column;gap:2px;padding:12px;border-radius:16px;background:color-mix(in srgb,var(--primary-text-color) 4%,transparent);box-shadow:inset 0 0 0 1px var(--l)}.sc2 ha-icon{--mdc-icon-size:22px}.sc2 span{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--secondary-text-color)}.sc2 b{font-size:22px;font-weight:850}.sc2 small{font-size:11px;color:var(--secondary-text-color)}.sc2.dn ha-icon{color:var(--ok)}.sc2.upx ha-icon{color:var(--bad)}.sc2.mid{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--g) 45%,transparent);background:color-mix(in srgb,var(--g) 8%,transparent)}.sc2.mid ha-icon{color:var(--g)}
@media(max-width:720px){.sv,.svh{grid-template-columns:78px minmax(0,1fr) 84px 54px;gap:7px;padding-left:6px;padding-right:6px}.scen{grid-template-columns:1fr}.pbars2{height:110px;gap:2px}.pp span{font-size:8.5px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
`;

if (!customElements.get("ha-gas-savings-card")) customElements.define("ha-gas-savings-card", HAGasSavingsCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-gas-savings-card", name: "HA Gas Savings Card", description: "Hvad fjernvarmen sparer i forhold til gas med samme varmeforbrug", preview: false });
console.info(`%c HA-GAS-SAVINGS-CARD %c ${VERSION} `, "color:#111;background:#4fe0a6;font-weight:700", "color:#4fe0a6;background:#111");
