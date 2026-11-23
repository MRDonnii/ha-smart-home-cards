import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./helpers/fake-dom.mjs";
installFakeDom();
const { hourly, cheapestWindow, level, monthRows, startNowAvg } = await import("../src/cards/ha-electricity-overview-card/ha-electricity-overview-card.js");

test("hourly averages quarter prices per hour", () => {
  const q = (h, m, p) => ({ price: p, start: new Date(2026, 10, 23, h, m).toISOString() });
  const r = hourly([q(0, 0, 1), q(0, 15, 2), q(0, 30, 3), q(0, 45, 4), q(1, 0, 5)]);
  assert.equal(r.length, 2); assert.equal(r[0].p, 2.5); assert.equal(r[1].p, 5);
});

test("cheapestWindow finds the cheapest run of whole hours from now", () => {
  const hrs = [3, 2, 1, 1, 1, 4, 0.5, 0.5].map((p, i) => ({ t: new Date(2026, 10, 23, i), p }));
  const w = cheapestWindow(hrs, 3, new Date(2026, 10, 23, 0, 30));
  assert.equal(w.start.getHours(), 2); assert.equal(Math.round(w.avg * 100), 100);
  const late = cheapestWindow(hrs, 2, new Date(2026, 10, 23, 5, 10));
  assert.equal(late.start.getHours(), 6);
});

test("level compares with the day's average", () => {
  assert.equal(level(0.8, 1), "cheap"); assert.equal(level(1, 1), "normal"); assert.equal(level(1.2, 1), "dear");
});

test("monthRows splits the kr between house and car at the month's average price", () => {
  const m = monthRows({ "2026-10-01": { kwh: 30, kr: 75, car: 10 }, "2026-10-02": { kwh: 10, kr: 25, car: 0 }, "2026-11-01": { kwh: 0, kr: 0, car: 0 } });
  assert.equal(m.length, 1); assert.equal(m[0].avg, 2.5); assert.equal(m[0].carKr, 25); assert.equal(m[0].houseKr, 75); assert.equal(m[0].house, 30);
});

test("startNowAvg averages the hours from the current one", () => {
  const hrs = [3, 2, 1, 4].map((p, i) => ({ t: new Date(2026, 10, 23, i), p }));
  assert.equal(startNowAvg(hrs, 2, new Date(2026, 10, 23, 1, 40)), 1.5);
  assert.ok(Number.isNaN(startNowAvg(hrs, 3, new Date(2026, 10, 23, 2, 0))));
});
