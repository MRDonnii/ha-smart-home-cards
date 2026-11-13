import assert from "node:assert/strict";
import { nextMonthEstimate } from "../src/cards/ha-electricity-bill-card/next-month.js";

const base = { maaned: "2026-11", dagligt_gennemsnit: 78.69, dagligt_gennemsnit_kwh: 38.81,
  gennemsnit_dage: 14, forhold_regning_maaling: 1.0283 };
const estimate = nextMonthEstimate(base);
assert.equal(estimate.month, "december 2026");
assert.equal(estimate.days, 31);
assert.equal(estimate.cost, 2510);
assert.equal(estimate.kwh, 1203);

assert.equal(nextMonthEstimate({ ...base, maaned: "2024-01" }).days, 29);
assert.equal(nextMonthEstimate({ ...base, maaned: "2026-12" }).month, "januar 2027");
assert.equal(nextMonthEstimate({ ...base, gennemsnit_dage: 2 }), null);
assert.equal(nextMonthEstimate({ ...base, dagligt_gennemsnit: "unavailable" }), null);

console.log("elregning next-month tests passed");

// Claude AI, 2026-11-13: "Overblik pr. år" – regninger over et årsskifte fordeles efter dage, gas for sig
const { yearlyTotals } = await import("../src/cards/ha-electricity-bill-card/year-totals.js");
const years = yearlyTotals([
  { start: "2024-12-01", end: "2025-01-31", amount: 620, kwh: 62 },
  { start: "2025-02-01", end: "2025-02-28", amount: 280, kwh: 28 },
  { start: "2025-01-01", end: "2025-03-31", amount: 900, m3: 90, utility: "gas" },
]);
const y = Object.fromEntries(years.map(r => [`${r.year}|${r.utility}`, r]));
assert.equal(Math.round(y["2024|el"].amount), 310);
assert.equal(Math.round(y["2025|el"].kwh), 59);
assert.equal(y["2025|gas"].price_m3, 10);
assert.equal(years[0].year, 2025);
console.log("year totals ok");
