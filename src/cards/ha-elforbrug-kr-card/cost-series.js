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

