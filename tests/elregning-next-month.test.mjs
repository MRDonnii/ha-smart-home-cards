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
