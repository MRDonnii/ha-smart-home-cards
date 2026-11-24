import assert from "node:assert/strict";
import { installFakeDom } from "./helpers/fake-dom.mjs";
installFakeDom();
const { monthCompare, priceFor, yearCompare, seasonIndex, predictPrice } = await import("../src/cards/ha-gas-savings-card/ha-gas-savings-card.js");
const cfg = { kwh_per_m3: 11, efficiency: 0.9, gas_fixed_year: 2400, service_year: 1200, heat_fixed_month: 300 };
const r = monthCompare({ kwh: 1980, month: "2026-10", days: 31, gasPrice: 14, heatPrice: 0.6, cfg, now: new Date(2026, 11, 1) });
assert.equal(Math.round(r.m3), 200);
assert.equal(Math.round(r.gas), 200 * 14 + 300);        // 2.800 + (2.400 + 1.200) / 12
assert.equal(Math.round(r.heat), Math.round(1980 * 0.6 + 300));
assert.equal(Math.round(r.saved), Math.round(r.gas - r.heat));
const half = monthCompare({ kwh: 0, month: "2026-04", days: 15, gasPrice: 14, heatPrice: 0.6, cfg });
assert.equal(Math.round(half.heat), 150);                // fixed amounts follow the days in the month
assert.equal(priceFor("2026-05", { "2026-05": 11.9 }, 14), 11.9);
assert.equal(priceFor("2026-04", { "2026-05": 11.9 }, 14), 14);
console.log("gas savings card tests passed");

const yc = yearCompare("2025", { kwh: Array(12).fill(1100), price: Array(12).fill(10) }, { kwh_per_m3: 11, efficiency: 0.9, service_year: 1100, heat_fixed_month: 300 }, 0.6);
assert.equal(Math.round(yc.m3), 1200);
assert.equal(Math.round(yc.gas), 12000 + 1100);
assert.equal(Math.round(yc.heat), Math.round(13200 * 0.9 * 0.6 + 3600));
console.log("gas year compare tests passed");

const si = seasonIndex({ "2026-05": 11.9, "2026-06": 11.9, "2026-07": 11.9, "2026-08": 11.9, "2026-09": 12.9, "2026-10": 13.9, "2026-11": 14.94 }, new Date(2026, 10, 24));
assert.equal(si.length, 12); assert.ok(si[0] > si[10] && si[10] > si[6]);
const pJul = predictPrice(si, 14.94, 10, 6), pJan = predictPrice(si, 14.94, 10, 0);
assert.ok(pJul > 11 && pJul < 13, "juli ≈ 12 kr"); assert.ok(pJan > 15, "januar dyrere end nu");
const flat = seasonIndex({}, new Date(2026, 10, 24)); assert.equal(Math.round(flat[0] * 100), 110);
assert.equal(predictPrice(null, 15, 10, 0), 15);
console.log("gas price prediction tests passed");
