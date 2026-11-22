// ha-elforbrug-historik-card: the pure statistics logic and a render smoke test against a mock hass (example data only).
import assert from "node:assert/strict";
import { installFakeDom, mockHass, renderCard, disconnect } from "./helpers/fake-dom.mjs";

installFakeDom({ now: "2026-11-15T12:00:00Z" }); // the card compares against the current month
const series = await import("../src/cards/ha-elforbrug-historik-card/series.js");
await import("../src/cards/ha-elforbrug-historik-card/ha-elforbrug-historik-card.js");

// Example statistics: 2024 and 2025 complete, 2026 up to and including November (the current month in the test).
const rows = [];
for (const [year, base] of [[2024, 400], [2025, 380], [2026, 360]]) {
  for (let m = 0; m < 12; m += 1) {
    if (year === 2026 && m > 10) break;
    rows.push({ start: Date.UTC(year, m, 1, 12), change: base + m * 10 });
  }
}
const built = series.buildSeries(rows);
assert.deepEqual(Object.keys(built.years).map(Number), [2024, 2025, 2026]);
assert.equal(built.years[2026][11], null);
assert.deepEqual(built.latest, { y: 2026, m: 10 });

const now = new Date(2026, 10, 15);
const model = series.computeModel(built, now);
// The current month (November 2026) is preliminary: the last 12 complete months are Nov 2025 – Oct 2026.
const last12 = [480, 490].reduce((s, v) => s + v, 0) + [...Array(10).keys()].reduce((s, m) => s + 360 + m * 10, 0);
assert.equal(model.last12, last12);
assert.equal(model.ytdMonths, 10);
assert.equal(model.ytd, [...Array(10).keys()].reduce((s, m) => s + 360 + m * 10, 0));
assert.ok(model.ytdDelta < 0, "this year uses less than the same months last year");
assert.equal(model.forecast.m, 11);
assert.equal(model.forecast.base, 490);
assert.ok(Math.abs(model.forecast.ratio - (360 * 6 + 10 * (4 + 5 + 6 + 7 + 8 + 9)) / (380 * 6 + 10 * (4 + 5 + 6 + 7 + 8 + 9))) < 1e-9);
assert.equal(series.fmtPct(12.4), "+12 %");
assert.equal(series.fmtPct(-3), "−3 %");
assert.equal(series.fmt(null), "–");
assert.equal(series.niceMax(730), 800);
assert.equal(series.esc('<b a="1">'), "&lt;b a=&quot;1&quot;&gt;");

// Registration and stub config.
const Card = customElements.get("ha-elforbrug-historik-card");
assert.ok(Card, "registered");
assert.ok(window.customCards.some((c) => c.type === "ha-elforbrug-historik-card"));
assert.equal(Card.getStubConfig().entity, "sensor.example_energy_total");

// Render with statistics from the mock recorder.
const entity = "sensor.example_energy_total";
const hass = mockHass({ ws: { "recorder/statistics_during_period": (msg) => ({ [msg.statistic_ids[0]]: rows }) } });
const card = await renderCard("ha-elforbrug-historik-card", { type: "custom:ha-elforbrug-historik-card", entity, source: "Example meter." }, hass);
const ws = hass.calls.find((c) => c.ws === "recorder/statistics_during_period");
assert.ok(ws, "statistics requested");
assert.deepEqual(ws.msg.statistic_ids, [entity]);
assert.equal(ws.msg.period, "month");
const ref = (n) => card.shadowRoot.queried(`[data-ref="${n}"]`);
assert.equal(ref("title").textContent, "Elforbrug");
assert.match(ref("kpis").innerHTML, /Seneste 12 mdr/);
assert.match(ref("kpis").innerHTML, /Forventet december/);
assert.match(ref("note").textContent, /^Kilde: Example meter\. Den igangværende måned/);
disconnect(card);

// Without an entity the card asks for one and does not call the recorder.
const bare = mockHass();
const empty = await renderCard("ha-elforbrug-historik-card", { type: "custom:ha-elforbrug-historik-card" }, bare);
assert.equal(bare.calls.length, 0);
assert.match(empty.shadowRoot.queried('[data-ref="chart"]').innerHTML, /Vælg en energisensor/);
disconnect(empty);

console.log("ha-elforbrug-historik-card tests passed");
process.exit(0);
