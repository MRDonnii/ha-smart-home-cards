// Claude AI, 2026-11-13: data til ha-elforbrug-kr-card (testes uden browser).
import { monthlyFromBills } from "../ha-electricity-bill-card/year-totals.js";

export const key = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;

/**
 * Én værdi pr. måned: {v, bill, measured, estimate}. bills = elregninger, cost/kwh = {"YYYY-MM": værdi} fra statistikken,
 * ratio = regning ÷ HA's beregning. En måned, regningerne dækker mindst 90 % af, regnes som faktureret.
 */
export function buildCostSeries({ bills = [], cost = {}, kwh = {}, ratio = null, now = new Date(), utility = "el" }) {
  const billed = monthlyFromBills(bills);
  const years = {};
  const first = Object.keys(billed).sort()[0];
  const priced = bills.filter((b) => b.kwh);
  const avgPrice = priced.length ? priced.reduce((s, b) => s + Number(b.amount), 0) / priced.reduce((s, b) => s + Number(b.kwh), 0) : null;
  const keys = new Set([...Object.keys(billed), ...(utility === "el" ? Object.keys(cost) : [])]);
  if (utility === "el" && first && avgPrice) for (const k of Object.keys(kwh)) if (k >= first) keys.add(k);
  const nowKey = key(now.getFullYear(), now.getMonth());
  // Pris for en måned uden regning: lagt lineært mellem prisen på nærmeste regnede måned før og efter
  const idx = (k) => { const [y, m] = k.split("-").map(Number); return y * 12 + m; };
  const prices = Object.entries(billed).filter(([, b]) => b.kwh && b.days >= b.monthDays * 0.9).map(([k, b]) => [idx(k), b.amount / b.kwh]).sort((a, b) => a[0] - b[0]);
  const priceAt = (k) => {
    const i = idx(k);
    const before = [...prices].reverse().find((p) => p[0] <= i);
    const after = prices.find((p) => p[0] >= i);
    if (before && after && after[0] !== before[0]) return before[1] + ((after[1] - before[1]) * (i - before[0])) / (after[0] - before[0]);
    return (before || after)?.[1] ?? avgPrice;
  };
  // Den første måned i omkostningsstatistikken er sjældent hel (målingen startede midt i den)
  const costFirst = Object.keys(cost).sort()[0];
  for (const k of [...keys].sort()) {
    if (k > nowKey) continue;
    const [y, m1] = k.split("-").map(Number);
    const m = m1 - 1;
    const b = billed[k];
    const cell = { bill: 0, measured: 0, estimate: 0, partial: k === nowKey };
    if (b && b.days >= b.monthDays * 0.9) cell.bill = b.amount;
    else if (utility === "el" && cost[k] != null && k !== costFirst) cell.measured = cost[k] * (ratio || 1);
    else if (utility === "el" && kwh[k] != null && avgPrice) cell.estimate = kwh[k] * priceAt(k);
    else if (b) cell.bill = b.amount;
    cell.v = cell.bill + cell.measured + cell.estimate;
    if (!(cell.v > 0)) continue;
    (years[y] ||= Array(12).fill(null))[m] = cell;
  }
  return { years, avgPrice };
}

export const sumYear = (arr, upto = 12) => {
  const out = { v: 0, bill: 0, measured: 0, estimate: 0, n: 0 };
  (arr || []).slice(0, upto).forEach((c) => { if (!c) return; out.n++; for (const k of ["v", "bill", "measured", "estimate"]) out[k] += c[k]; });
  return out.n ? out : null;
};


/* ---------- Opvarmning: naturgas og fjernvarme på samme skala (Claude AI, 2026-11-13) ----------
 * Brugeren: "Det skal holdes op imod gas og ikke være for sig selv, da det er sammenligning jeg ønsker."
 */

// Verdo Varme Randers inkl. moms (fra regningerne). Faste dele er kr pr. år og regnes pr. dag.
export const DEFAULT_HEAT_TARIFFS = [
  { from: "2026-04-01", variable: 0.5963, abonnement: 500, m2_rate: 10, konvertering: 1000 },
  { from: "2027-02-01", variable: 0.6875, abonnement: 600, m2_rate: 11, konvertering: 1000 },
];
// Det, Norlys' gasregninger fra maj 2023 ikke indeholder: Evida fakturerer selv distribution, nødforsyningstarif (for
// Energinet) og statens afgifter (energi-, CO2- og NOx-afgift) + moms. Satser ekskl. moms pr. m³ og fast kr/år, gældende
// fra datoen (Evida Nord, privat G4-måler). Kilder: Skattestyrelsen, Juridisk vejledning E.A.4.4.7.1 (energiafgift),
// E.A.4.5.6 (CO2), E.A.7.20.6 (NOx); Evida "Historiske tariffer" for Evida Nord, tarifblad 01.01.2025 og Evidas
// regneark for 2026; nødforsyning fra evida.dk/kundeservice/priser-og-betingelser. Administrationsbidrag 2023–24 (300 kr/år)
// er regnet ud fra husets egen Evida-regning jan–apr 2023 (ikke offentliggjort); NOx 2024–25 er ikke bekræftet officielt.
export const EVIDA_RATES = [
  { from: "2023-01-01", dist: 0.532, nod: 0.2441, energi: 2.531, co2: 0.41, nox: 0.009, fixed: 300 },
  { from: "2023-04-01", dist: 0.852, nod: 0.2441, energi: 2.531, co2: 0.41, nox: 0.009, fixed: 300 },
  { from: "2023-10-01", dist: 0.852, nod: 0.03586, energi: 2.531, co2: 0.41, nox: 0.009, fixed: 300 },
  { from: "2024-01-01", dist: 1.171, nod: 0.03586, energi: 2.726, co2: 0.442, nox: 0.009, fixed: 300 },
  { from: "2024-07-01", dist: 1.054, nod: 0.03586, energi: 2.726, co2: 0.442, nox: 0.009, fixed: 300 },
  { from: "2024-10-01", dist: 0.843, nod: 0.05957, energi: 2.726, co2: 0.442, nox: 0.009, fixed: 300 },
  { from: "2025-01-01", dist: 0.134, nod: 0.05957, energi: 1.369, co2: 1.922, nox: 0.01, fixed: 1641.15 },
  { from: "2025-10-01", dist: 0.134, nod: 0.06589, energi: 1.369, co2: 1.922, nox: 0.01, fixed: 1641.15 },
  { from: "2026-01-01", dist: 0.134, nod: 0.06589, energi: 1.383, co2: 1.942, nox: 0.01, fixed: 1641.15 },
];
export const VAT = 1.25;
export const evidaAt = (iso, rates = EVIDA_RATES) => [...rates].sort((a, b) => a.from.localeCompare(b.from)).reverse().find((r) => r.from <= iso) || rates[0];
/** Evida-delen inkl. moms for m³ og dage i en måned: [variabel, fast]. */
export function evidaCost(m3, days, rate) {
  const variable = m3 * (rate.dist + rate.nod + rate.energi + rate.co2 + rate.nox) * VAT;
  const fixed = (rate.fixed / 365) * days * VAT;
  return [variable, fixed];
}

const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const isoKey = (d) => key(d.getFullYear(), d.getMonth());

export function tariffAt(tariffs, iso) {
  const list = [...(tariffs || DEFAULT_HEAT_TARIFFS)].sort((a, b) => a.from.localeCompare(b.from));
  return [...list].reverse().find((t) => t.from <= iso) || list[0];
}

/** Fjernvarmens pris for kWh varme i en periode (variabel + faste dele pr. dag), inkl. moms. */
export function heatCost(kwh, days, tariff, m2) {
  const fixed = ((tariff.abonnement || 0) + (tariff.m2_rate || 0) * (m2 || 0) + (tariff.konvertering || 0)) / 365;
  return kwh * tariff.variable + fixed * days;
}

/**
 * Målt fjernvarme pr. måned. change = {"YYYY-MM": kWh} fra varmemålerens statistik; pre = kWh før statistikken
 * (målerstand ved første statistik − målerstand ved start) fordelt efter dage fra start til statistikkens start.
 */
export function heatMonths({ change = {}, pre = 0, start, statsStart, tariffs, m2 = 0, now = new Date() }) {
  const kwh = { ...change };
  const est = {};
  if (pre > 0 && start && statsStart && statsStart > start) {
    const s = new Date(`${start}T00:00:00`), e = new Date(statsStart);
    const days = [];
    for (let d = new Date(s); d < e; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(isoKey(d));
    for (const k of days) est[k] = (est[k] || 0) + pre / days.length;
  }
  const out = {};
  const startKey = start ? isoKey(new Date(start)) : null;
  for (const k of new Set([...Object.keys(kwh), ...Object.keys(est)])) {
    if (startKey && k < startKey) continue;
    const [y, m1] = k.split("-").map(Number);
    const m = m1 - 1;
    const first = new Date(y, m, 1);
    const s = start && new Date(start) > first ? new Date(start) : first;
    const lastDay = y === now.getFullYear() && m === now.getMonth() ? now.getDate() : daysIn(y, m);
    const days = Math.max(0, lastDay - s.getDate() + 1);
    const t = tariffAt(tariffs, `${k}-01`);
    const mk = kwh[k] || 0, ek = est[k] || 0;
    const total = heatCost(mk + ek, days, t, m2);
    // Kronerne fordeles på målt og skønnet efter kWh
    const share = mk + ek > 0 ? mk / (mk + ek) : 1;
    out[k] = { kwh: mk + ek, kwhMeasured: mk, kwhEstimated: ek, cost: total, measured: total * share, estimate: total * (1 - share), days };
  }
  return out;
}

/** Gas pr. måned fra regningerne (fordelt efter dage) + Evida-delen beregnet ud fra officielle satser, hvor regningen ikke har den. */
export function gasMonths(gasBills, { kwhPerM3 = 11, efficiency = 0.9, rates = EVIDA_RATES } = {}) {
  const out = {};
  for (const b of gasBills || []) {
    const hasEvida = /heraf Evida/.test(b.note || "");
    const part = monthlyFromBills([b]);
    for (const [k, r] of Object.entries(part)) {
      const o = out[k] || (out[k] = { bill: 0, evida: 0, m3: 0, kwh: 0 });
      o.bill += r.amount;
      if (r.m3 != null) { o.m3 += r.m3; o.kwh += r.m3 * kwhPerM3 * efficiency; }
      if (!hasEvida && r.m3 != null) { const [v, f] = evidaCost(r.m3, r.days, evidaAt(`${k}-01`, rates)); o.evida += v + f; }
    }
  }
  return out;
}

/** Én tidslinje: hver måned har gas (faktureret + skønnet Evida) og/eller fjernvarme (målt/skønnet), + a conto. */
export function heatingSeries({ gasBills = [], heatBills = [], heat = {}, now = new Date(), opts = {} }) {
  const gas = gasMonths(gasBills, opts);
  const aconto = monthlyFromBills(heatBills);
  const nowKey = key(now.getFullYear(), now.getMonth());
  const months = {};
  for (const k of new Set([...Object.keys(gas), ...Object.keys(heat), ...Object.keys(aconto)])) {
    if (k > nowKey) continue;
    const g = gas[k], h = heat[k], a = aconto[k];
    months[k] = {
      gasBill: g?.bill || 0, gasEvida: g?.evida || 0, gasKwh: g?.kwh || 0, gasM3: g?.m3 || 0,
      heatMeasured: h?.measured || 0, heatEstimate: h?.estimate || 0, heatKwh: h?.kwh || 0,
      aconto: a?.amount || 0, partial: k === nowKey,
      // Kun hele måneder med fjernvarme sammenlignes (ikke opstartsmåneden)
      heatFull: !!h && h.days >= new Date(Number(k.slice(0, 4)), Number(k.slice(5)), 0).getDate(),
    };
    const c = months[k];
    c.v = c.gasBill + c.gasEvida + c.heatMeasured + c.heatEstimate;
  }
  return months;
}

/** Sammenligning: kr pr. kWh varme, samme måneder år mod år, og et helt år "fjernvarme vs. hvis vi havde beholdt gassen". */
export function heatingCompare(months, { tariffs, m2 = 0, now = new Date() } = {}) {
  const ks = Object.keys(months).sort();
  const sum = (list, f) => list.reduce((s, k) => s + f(months[k]), 0);
  const heatKs = ks.filter((k) => months[k].heatKwh > 0 && months[k].heatFull && !months[k].partial);
  const gasKs = ks.filter((k) => months[k].gasKwh > 0);
  const perKwh = (list, f) => { const kwh = sum(list, (c) => (c.heatKwh || c.gasKwh)); return kwh > 0 ? sum(list, f) / kwh : null; };
  // Samme kalendermåneder: fjernvarmens hele måneder mod de samme måneder et år før (gas)
  const pairs = heatKs.map((k) => { const [y, m] = k.split("-").map(Number); return [k, `${y - 1}-${String(m).padStart(2, "0")}`]; }).filter(([, g]) => months[g]?.gasKwh > 0);
  const same = pairs.length ? {
    months: pairs.map(([k]) => k),
    heat: pairs.reduce((s, [k]) => s + months[k].heatMeasured + months[k].heatEstimate, 0),
    heatKwh: pairs.reduce((s, [k]) => s + months[k].heatKwh, 0),
    gas: pairs.reduce((s, [, g]) => s + months[g].gasBill, 0),
    gasEvida: pairs.reduce((s, [, g]) => s + months[g].gasEvida, 0),
    gasKwh: pairs.reduce((s, [, g]) => s + months[g].gasKwh, 0),
  } : null;
  // Seneste hele gasår som varmebehov
  const years = [...new Set(gasKs.map((k) => Number(k.slice(0, 4))))].filter((y) => gasKs.filter((k) => k.startsWith(`${y}-`)).length === 12);
  const gy = years.length ? Math.max(...years) : null;
  let year = null;
  if (gy) {
    const yk = gasKs.filter((k) => k.startsWith(`${gy}-`));
    const demand = sum(yk, (c) => c.gasKwh);
    const gasBill = sum(yk, (c) => c.gasBill);
    const gasEvida = sum(yk, (c) => c.gasEvida);
    const t = (iso) => tariffAt(tariffs, iso);
    const nowIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    year = {
      gasYear: gy, demand, gasBill, gasEvida,
      heatNow: heatCost(demand, 365, t(nowIso), m2),
      heat2027: heatCost(demand, 365, t("2027-02-01"), m2),
    };
  }
  return {
    heatPerKwh: perKwh(heatKs, (c) => c.heatMeasured + c.heatEstimate),
    gasPerKwh: perKwh(gasKs, (c) => c.gasBill),
    gasPerKwhEvida: perKwh(gasKs, (c) => c.gasBill + c.gasEvida),
    acontoMonths: ks.filter((k) => months[k].aconto > 0 && (months[k].heatKwh > 0)),
    same, year,
  };
}
