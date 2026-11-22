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
