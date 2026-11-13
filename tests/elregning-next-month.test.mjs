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

// Claude AI, 2026-11-13: ha-elforbrug-kr-card – faktureret før målt før anslået
const { buildCostSeries, sumYear } = await import("../src/cards/ha-elforbrug-kr-card/cost-series.js");
const cs = buildCostSeries({
  bills: [{ start: "2025-01-01", end: "2025-01-31", amount: 2000, kwh: 800 }, { start: "2025-02-01", end: "2025-02-14", amount: 500, kwh: 200 }],
  cost: { "2024-11": 5, "2025-03": 1000, "2025-01": 999 }, kwh: { "2025-02": 400, "2025-04": 100, "2024-12": 50 }, ratio: 1.1, now: new Date(2025, 4, 10),
});
assert.equal(cs.years[2025][0].bill, 2000);          // faktureret vinder over målt
assert.equal(cs.years[2025][0].measured, 0);
assert.equal(Math.round(cs.years[2025][2].measured), 1100); // målt × forhold
assert.equal(Math.round(cs.years[2025][3].estimate), 250);  // 100 kWh × 2,5 kr/kWh (seneste regnede måned)
assert.equal(Math.round(cs.years[2025][1].estimate), 1000); // halv måned faktureret -> anslået
assert.equal(cs.years[2024], undefined);               // ikke før første regning
assert.equal(Math.round(sumYear(cs.years[2025]).v), 4350);
console.log("cost series ok");

// Claude AI, 2026-11-13: Opvarmning – fjernvarme efter Verdos takst, gas med Evida-skøn, sammenligning
const hs = await import("../src/cards/ha-elforbrug-kr-card/cost-series.js");
const t26 = hs.tariffAt(hs.DEFAULT_HEAT_TARIFFS, "2026-05-01");
// Maj 2026 a conto på regningen: 1.477 kWh + faste dele i 31 dage = 1.160,09 kr
assert.ok(Math.abs(hs.heatCost(1477, 31, t26, 179) - 1160.09) < 0.2);
assert.equal(hs.tariffAt(hs.DEFAULT_HEAT_TARIFFS, "2027-02-01").variable, 0.6875);
const hm = hs.heatMonths({ change: { "2026-05": 41, "2026-06": 851 }, pre: 1614, start: "2026-04-27", statsStart: "2026-05-31T00:00:00", m2: 179, now: new Date(2026, 6, 10) });
assert.equal(Math.round(hm["2026-04"].kwh + hm["2026-05"].kwh), 1655);
assert.ok(hm["2026-05"].estimate > 0 && hm["2026-06"].estimate === 0);
const gm = hs.gasMonths([
  { start: "2025-06-01", end: "2025-06-30", amount: 300, m3: 30, note: "kun Norlys-delen" },
  { start: "2023-01-01", end: "2023-01-31", amount: 900, m3: 100, note: "heraf Evida (distribution+afgifter) 500 kr" },
]);
assert.ok(gm["2025-06"].evida > 30 * 4.7 && gm["2023-01"].evida === 0);
assert.equal(Math.round(gm["2025-06"].kwh), 297);
const series = hs.heatingSeries({ gasBills: [{ start: "2025-06-01", end: "2025-06-30", amount: 300, m3: 30, note: "" }], heatBills: [{ start: "2026-06-01", end: "2026-06-30", amount: 1151.08, kwh: 1477 }], heat: hm, now: new Date(2026, 6, 10) });
const cmpH = hs.heatingCompare(series, { m2: 179 });
assert.ok(!series["2026-04"].heatFull && series["2026-06"].heatFull); // opstartsmåneden er ikke hel
assert.deepEqual(cmpH.same.months, ["2026-06"]);
assert.equal(cmpH.acontoMonths[0], "2026-06");
console.log("heating ok");
