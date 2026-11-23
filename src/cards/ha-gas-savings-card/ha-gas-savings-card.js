// HA Gas Savings Card (Claude AI, 2026-11-23; user: "gas delen ind med lækkert design og godt overblik så vi kan se hvad vi
// faktisk sparer fremfor hvis vi var blevet på gas med samme forbrug som nu").
// For each month since the switch: the heat actually used on district heating (kWh, from the heat meter's long-term
// statistics) → what the same heat would have cost on gas that month (m³ = kWh ÷ (kWh per m³ × boiler efficiency) ×
// that month's all-in gas price + the gas side's fixed amounts) → minus what district heating cost (kWh × price + fixed).
import { keepScroll } from "../shared/keep-scroll.js";

const VERSION = "1.0.0";
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
    let acc = 0; const past = rows.map((r) => ({ k: r.month, v: (acc += r.saved) }));
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
    const sens = [10, 12, 14, 16, 18].map((p) => { const y = yearKwh > 0 ? (yearKwh / (c.kwh_per_m3 * c.efficiency)) * p + c.gas_fixed_year + c.service_year - (yearKwh * heatPrice + c.heat_fixed_month * 12) : NaN;
      return { p, y, yrs: y > 0 && c.investment ? Math.max(0, c.investment - saved) / y : NaN }; });
    const smax = Math.max(...sens.map((x) => Math.abs(x.y) || 0), 1);
    const kwhMax = Math.max(...rows.map((r) => r.kwh), ...(forecast.map((r) => r.kwh)), 1);
    const MN = (k) => MONTHS[+k.slice(5) - 1];
    return `<div class="wide">
  <section class="panel w2"><div class="head"><span class="hicon"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon></span><div><h3>Akkumuleret besparelse</h3><p>Målt siden skiftet${fut.length ? " og prognose med dagens priser" : ""}${payDate ? ` · betalt hjem ca. ${MONTHS[payDate.getMonth()]} ${payDate.getFullYear()}` : ""}</p></div></div>
    <svg class="chart" viewBox="0 0 ${WW} ${H}" preserveAspectRatio="none">
      ${c.investment ? `<line class="goal" x1="${P}" x2="${WW - P}" y1="${Y(c.investment)}" y2="${Y(c.investment)}"/><text class="lbl" x="${WW - P}" y="${Y(c.investment) - 5}" text-anchor="end">${fmt(c.investment)} kr</text>` : ""}
      ${lineF ? `<polyline class="fut" points="${lineF}"/>` : ""}
      <polyline class="acc" points="${lineP}"/>
      ${past.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="3.5"/>`).join("")}
      ${past.length ? `<text class="lbl" x="${X(0).toFixed(1)}" y="${H - 6}" text-anchor="start">${MN(past[0].k)} ${past[0].k.slice(0, 4)}</text><text class="lbl" x="${X(past.length - 1).toFixed(1)}" y="${H - 6}" text-anchor="middle">nu · ${fmt(acc)} kr</text>` : ""}
      ${payDate ? `<text class="lbl ok" x="${X(past.length + payIdx).toFixed(1)}" y="${H - 6}" text-anchor="end">betalt hjem ${MONTHS[payDate.getMonth()]} ${payDate.getFullYear()}</text>` : ""}
    </svg></section>
  <section class="panel"><div class="head"><span class="hicon"><ha-icon icon="mdi:fire"></ha-icon></span><div><h3>Pris pr. kWh varme</h3><p>Gas (måned for måned) mod fjernvarme inkl. faste afgifter</p></div></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <polyline class="gl" points="${gk.map((v, i) => `${pX(i, gk.length).toFixed(1)},${pY(v).toFixed(1)}`).join(" ")}"/>
      <polyline class="hl" points="${fvK.map((x, i) => `${pX(i, fvK.length).toFixed(1)},${pY(x.v).toFixed(1)}`).join(" ")}"/>
      ${gk.map((v, i) => `<text class="lbl" x="${pX(i, gk.length).toFixed(1)}" y="${pY(v) - 7}" text-anchor="middle">${fmt(v, 2)}</text>`).join("")}
      ${ks.map((k, i) => `<text class="lbl" x="${pX(i, ks.length).toFixed(1)}" y="${H - 6}" text-anchor="middle">${MN(k)}</text>`).join("")}
    </svg><div class="legend"><span><i class="g"></i>Gas kr/kWh varme</span><span><i class="h"></i>Fjernvarme kr/kWh (inkl. faste)</span></div></section>
  <section class="panel"><div class="head"><span class="hicon blue"><ha-icon icon="mdi:scale-balance"></ha-icon></span><div><h3>Hvad koster 1 kWh varme?</h3><p>Over et normalt år (${fmt(yearKwh)} kWh) · dagens priser</p></div></div>
    ${[["Gas", gVar, gFix, "g"], ["Fjernvarme", hVar, hFix, "h"]].map(([n, v, f, cl]) => `<div class="kw"><span>${n}</span><div class="kbar"><i class="${cl}" style="width:${(v / kmax * 100).toFixed(1)}%"></i><i class="${cl} fx" style="width:${(f / kmax * 100).toFixed(1)}%"></i></div><b>${fmt(v + f, 2)} kr</b></div><small class="ksub">${fmt(v, 2)} variabel + ${fmt(f, 2)} faste beløb pr. kWh</small>`).join("")}
  </section>
  <section class="panel"><div class="head"><span class="hicon green"><ha-icon icon="mdi:tune-variant"></ha-icon></span><div><h3>Hvis gasprisen var …</h3><p>Besparelse pr. år og tid til anlægget er betalt hjem</p></div></div>
    ${sens.map((x) => `<div class="sv ${Math.abs(x.p - gasNow) < 1 ? "cur" : ""}"><span>${x.p} kr/m³</span><div class="sbar"><i class="${x.y >= 0 ? "pos" : "neg"}" style="width:${(Math.abs(x.y) / smax * 100).toFixed(1)}%"></i></div><b class="${x.y >= 0 ? "pos" : "neg"}">${x.y >= 0 ? "+" : ""}${fmt(x.y)} kr</b><em>${Number.isFinite(x.yrs) ? `${fmt(x.yrs, 1)} år` : "–"}</em></div>`).join("")}
  </section>
  <section class="panel w2"><div class="head"><span class="hicon blue"><ha-icon icon="mdi:radiator"></ha-icon></span><div><h3>Varmeforbrug pr. måned</h3><p>Målt på fjernvarmen (fuld) og normalår brugt i prognosen (lys)</p></div></div>
    <div class="kwh">${(forecast.length ? forecast : rows).map((r) => { const m = r.month.slice(5); const meas = rows.find((x) => x.month.slice(5) === m && !x.partial);
      return `<div class="kc"><div class="kp"><i class="n" style="height:${(r.kwh / kwhMax * 100).toFixed(1)}%"></i>${meas ? `<i class="m" style="height:${(meas.kwh / kwhMax * 100).toFixed(1)}%"></i>` : ""}</div><span>${MONTHS[+m - 1]}</span></div>`; }).join("")}</div>
  </section>
</div>`;
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

  _render() { if (this.shadowRoot && this._config) keepScroll(this, () => { this.shadowRoot.innerHTML = `<style>${STYLE}</style>${this._html()}`; }); }

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
    const forecast = prof ? Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1), k = ym(d);
      return monthCompare({ kwh: prof[d.getMonth()], month: k, days: daysIn(k), gasPrice: gasNow || gasAvg, heatPrice, cfg: c, now: new Date(0) });
    }) : [];
    const fSaved = forecast.reduce((s, r) => s + r.saved, 0);
    const fMax = Math.max(1, ...forecast.map((r) => Math.max(r.gas, r.heat)));
    const trend = (() => { const ks = Object.keys(months).sort(); if (ks.length < 2) return NaN; const a = Number(months[ks[ks.length - 2]]), b = Number(months[ks[ks.length - 1]]); return a > 0 ? (b - a) / a * 100 : NaN; })();
    const yearSaved = Number.isFinite(yearKwh)
      ? (yearKwh / (c.kwh_per_m3 * c.efficiency)) * (gasNow || gasAvg) + c.gas_fixed_year + c.service_year - (yearKwh * heatPrice + c.heat_fixed_month * 12)
      : NaN;
    const pct = c.investment > 0 ? Math.max(0, Math.min(100, (saved / c.investment) * 100)) : 0;
    const yearsLeft = c.investment > 0 && yearSaved > 0 ? Math.max(0, c.investment - saved) / yearSaved : NaN;
    const gasKwhHeat = (gasNow || gasAvg) / (c.kwh_per_m3 * c.efficiency);
    const max = Math.max(1, ...rows.map((r) => Math.max(r.gas, r.heat)));
    const R = 62, C = 2 * Math.PI * R;
    return `<div class="gs">
  <section class="hero">
    <div class="aurora"></div>
    <div class="ring"><svg viewBox="0 0 150 150"><circle class="bg" cx="75" cy="75" r="${R}"/><circle class="arc" cx="75" cy="75" r="${R}" stroke-dasharray="${(C * pct / 100).toFixed(1)} ${C.toFixed(1)}"/></svg>
      <div class="ring-in"><b>${fmt(pct)}%</b><span>betalt hjem</span>${c.investment ? `<small>af ${fmt(c.investment)} kr</small>` : ""}</div></div>
    <div class="id">
      <div class="eyebrow">${esc(c.title)}</div>
      <h2>${fmt(saved)} kr sparet</h2>
      <div class="mood ${saved >= 0 ? "" : "bad"}"><i></i>${saved >= 0 ? "billigere end gas med samme varmeforbrug" : "dyrere end gas med samme varmeforbrug"} siden ${esc(c.switch_date || "")}</div>
      <div class="chips">
        <span class="chip gas"><ha-icon icon="mdi:fire"></ha-icon>Gas nu ${fmt(gasNow || gasAvg, 2)} kr/m³ · ${fmt(gasKwhHeat, 2)} kr/kWh varme${Number.isFinite(trend) ? ` · ${trend >= 0 ? "▲" : "▼"} ${fmt(Math.abs(trend), 1)} % på en måned` : ""}</span>
        <span class="chip heat"><ha-icon icon="mdi:radiator"></ha-icon>Fjernvarme ${fmt(heatPrice, 2)} kr/kWh + ${fmt(c.heat_fixed_month)} kr/md</span>
        ${cur ? `<span class="chip"><ha-icon icon="mdi:calendar-today"></ha-icon>${MONTHS[+cur.month.slice(5) - 1]}: ${cur.saved >= 0 ? "+" : ""}${fmt(cur.saved)} kr indtil nu</span>` : ""}
        ${Number.isFinite(yearSaved) ? `<span class="chip good"><ha-icon icon="mdi:calendar-check"></ha-icon>≈ ${fmt(yearSaved)} kr/år</span>` : ""}
        ${Number.isFinite(yearsLeft) ? `<span class="chip"><ha-icon icon="mdi:timer-sand"></ha-icon>${yearsLeft <= 0 ? "Betalt hjem" : `≈ ${fmt(yearsLeft, 1)} år tilbage`}</span>` : ""}
      </div>
    </div>
  </section>
  <div class="grid">
    <section class="panel stat"><span>Gas ville have kostet</span><b class="g">${fmt(gasTot)} kr</b><small>${fmt(sum("m3"))} m³ gas · inkl. net, afgifter, abonnement${c.service_year ? " og service" : ""}</small></section>
    <section class="panel stat"><span>Fjernvarme har kostet</span><b class="h">${fmt(heatTot)} kr</b><small>${fmt(sum("kwh"))} kWh · inkl. faste afgifter</small></section>
    <section class="panel stat"><span>Forskel</span><b class="${saved >= 0 ? "s" : "r"}">${saved >= 0 ? "+" : "−"}${fmt(Math.abs(saved))} kr</b><small>${gasTot > 0 ? `${fmt((saved / gasTot) * 100)} % ${saved >= 0 ? "billigere" : "dyrere"}` : ""}</small></section>
  </div>
  ${forecast.length ? `<section class="panel fc">
    <div class="head"><span class="hicon blue"><ha-icon icon="mdi:crystal-ball"></ha-icon></span><div><h3>Prognose de næste 12 måneder</h3><p>Normalt varmeforbrug pr. måned · gas til dagens pris ${fmt(gasNow || gasAvg, 2)} kr/m³ · fjernvarme til nuværende takst</p></div><b class="fsum ${fSaved >= 0 ? "pos" : "neg"}">${fSaved >= 0 ? "+" : ""}${fmt(fSaved)} kr</b></div>
    <div class="fbars">${forecast.map((r) => `<div class="fcol" title="${MONTHS[+r.month.slice(5) - 1]}: gas ${fmt(r.gas)} kr · fjernvarme ${fmt(r.heat)} kr"><div class="fpair"><i class="g" style="height:${((r.gas / fMax) * 100).toFixed(1)}%"></i><i class="h" style="height:${((r.heat / fMax) * 100).toFixed(1)}%"></i></div><em class="${r.saved >= 0 ? "pos" : "neg"}">${r.saved >= 0 ? "+" : ""}${fmt(r.saved / 1000, 1)}k</em><span>${MONTHS[+r.month.slice(5) - 1]}</span></div>`).join("")}</div>
    <p class="foot">Gasprisen er ukendt fremover, så prognosen bruger dagens pris. Stiger gassen videre hen over vinteren, bliver besparelsen større – falder den, mindre. ${Number.isFinite(yearsLeft) && c.investment ? `Med dette niveau er anlægget betalt hjem om ca. ${fmt(yearsLeft, 1)} år.` : ""}</p>
  </section>` : ""}
  <section class="panel">
    <div class="head"><span class="hicon"><ha-icon icon="mdi:chart-bar"></ha-icon></span><div><h3>Måned for måned</h3><p>Samme varme: gas til den måneds pris mod det, fjernvarmen kostede</p></div></div>
    <div class="months">${rows.slice().reverse().map((r) => `<div class="mrow">
      <span class="m">${MONTHS[+r.month.slice(5) - 1]} ${r.month.slice(2, 4)}${r.partial ? "<em>nu</em>" : ""}</span>
      <div class="bars"><div class="bar g"><i style="width:${((r.gas / max) * 100).toFixed(1)}%"></i><b>${fmt(r.gas)} kr</b><small>${fmt(r.gasPrice, 2)} kr/m³</small></div>
      <div class="bar h"><i style="width:${((r.heat / max) * 100).toFixed(1)}%"></i><b>${fmt(r.heat)} kr</b><small>${fmt(r.kwh)} kWh</small></div></div>
      <span class="s ${r.saved >= 0 ? "pos" : "neg"}">${r.saved >= 0 ? "+" : ""}${fmt(r.saved)}</span></div>`).join("")}</div>
    <div class="legend"><span><i class="g"></i>Hvis vi var på gas</span><span><i class="h"></i>Fjernvarme</span></div>
    <p class="foot">Gas: kWh ÷ (${fmt(c.kwh_per_m3)} kWh/m³ × ${fmt(c.efficiency * 100)} % kedel) × månedens samlede gaspris${known.length ? "" : " (dagens pris)"} + ${fmt((c.gas_fixed_year + c.service_year) / 12)} kr/md faste beløb. Måneder uden gemt gaspris bruger ${known.length ? "gennemsnittet" : "dagens pris"}.</p>
  </section>
${this._wide() ? this._wideHtml({ rows, forecast, c, gasNow: gasNow || gasAvg, heatPrice, saved, yearKwh, months }) : ""}
</div>`;
  }
}

const STYLE = `
:host{display:block}
.gs{--g:#ff8a3d;--h:#4cc9ff;--ok:var(--dashboard-success,#4fe0a6);--bad:var(--dashboard-danger,#ff667a);--s:var(--surface,var(--ha-card-background,var(--card-background-color,#141c27)));--l:color-mix(in srgb,var(--primary-text-color) 9%,transparent);display:grid;gap:14px;color:var(--primary-text-color)}
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
.id h2{margin:2px 0 6px;font-size:36px;line-height:1.05;font-weight:850;letter-spacing:-.02em;background:linear-gradient(100deg,var(--primary-text-color) 30%,var(--ok));-webkit-background-clip:text;background-clip:text;color:transparent}
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
@media(max-width:720px){.hero{grid-template-columns:1fr;justify-items:center;text-align:center}.mood,.chips{justify-content:center}.grid{grid-template-columns:1fr}.mrow{grid-template-columns:56px minmax(0,1fr) 62px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
`;

if (!customElements.get("ha-gas-savings-card")) customElements.define("ha-gas-savings-card", HAGasSavingsCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-gas-savings-card", name: "HA Gas Savings Card", description: "Hvad fjernvarmen sparer i forhold til gas med samme varmeforbrug", preview: false });
console.info(`%c HA-GAS-SAVINGS-CARD %c ${VERSION} `, "color:#111;background:#4fe0a6;font-weight:700", "color:#4fe0a6;background:#111");
