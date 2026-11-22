// Seasonal header decoration: date windows, forced preview date and markup. Change by Claude AI.
import assert from "node:assert/strict";
import { seasonOf, seasonalDate, seasonHtml } from "../src/cards/ha-home-header-card/seasonal-decor.js";

const on = (y, m, d) => seasonOf(new Date(y, m - 1, d, 12));
assert.equal(on(2026, 11, 30), "", "30 November has no decoration");
assert.equal(on(2026, 12, 1), "xmas");
assert.equal(on(2026, 12, 24), "xmas");
assert.equal(on(2026, 12, 30), "xmas");
assert.equal(on(2026, 12, 31), "nye");
assert.equal(on(2027, 1, 1), "newyear");
assert.equal(on(2027, 1, 2), "", "2 January has no decoration");
assert.equal(on(2026, 7, 15), "");
assert.equal(seasonOf(new Date(2026, 11, 31, 0, 0, 0)), "nye", "switches at local midnight");
assert.equal(seasonOf(new Date(2026, 11, 30, 23, 59, 59)), "xmas");

const now = new Date(2026, 5, 3);
assert.equal(seasonalDate(undefined, now), now);
assert.equal(seasonalDate("not a date", now), now);
assert.equal(seasonOf(seasonalDate("2026-12-31", now)), "nye");
assert.equal(seasonOf(seasonalDate(" 2027-01-01 ", now)), "newyear");

assert.equal(seasonHtml(""), "");
const xmas = seasonHtml("xmas", { snow: true });
assert.match(xmas, /class="bulb"/); assert.match(xmas, /class="flake"/); assert.doesNotMatch(xmas, /Godt nytår/);
assert.doesNotMatch(seasonHtml("xmas"), /class="flake"/, "no snow while the weather shows precipitation");
assert.match(seasonHtml("nye"), /class="burst/); assert.doesNotMatch(seasonHtml("nye"), /Godt nytår/);
assert.match(seasonHtml("newyear"), /Godt nytår/);
for (const s of ["xmas", "nye", "newyear"]) {
  const html = seasonHtml(s, { snow: true });
  assert.match(html, /pointer-events:none/); assert.match(html, /prefers-reduced-motion/); assert.match(html, /\.paused/);
  assert.doesNotMatch(html, /https?:|url\(/, "no external assets");
}
console.log("seasonal-decor tests passed");

// URL preview (?jul=…) – only while in the address; date range from helpers
{
  const { urlSeasonPreview } = await import("../src/cards/ha-home-header-card/seasonal-decor.js");
  assert.equal(urlSeasonPreview(""), undefined);
  assert.equal(seasonOf(seasonalDate(urlSeasonPreview("?jul=1"))), "xmas");
  assert.equal(seasonOf(seasonalDate(urlSeasonPreview("?jul=nytaar"))), "nye");
  assert.equal(urlSeasonPreview("?jul=2027-01-01"), "2027-01-01");
  assert.equal(urlSeasonPreview("?jul=nonsense"), undefined);
  const d = (s) => seasonalDate(s);
  assert.equal(seasonOf(d("2026-11-23")), "");
  assert.equal(seasonOf(d("2026-11-23"), { start: "2026-11-20", end: "2026-12-30" }), "xmas");
  assert.equal(seasonOf(d("2026-11-19"), { start: "2026-11-20", end: "2026-12-30" }), "");
  assert.equal(seasonOf(d("2027-01-05"), { start: "11-28", end: "01-06" }), "xmas");   // across New Year
  assert.equal(seasonOf(d("2027-01-07"), { start: "11-28", end: "01-06" }), "");
  assert.equal(seasonOf(d("2026-12-31"), { start: "12-10", end: "12-20" }), "nye");
  assert.equal(seasonOf(d("2026-12-05"), { start: "unknown", end: "unknown" }), "xmas"); // bad helper → default
  console.log("seasonal URL preview and range tests passed");
}
