// Strøm-detaljer: grupper til grafen, timepriser, grundlast og flyt-tip (Claude AI, 2026-11-27).
import assert from "node:assert/strict";
import { buildSeries, hourArray, hourPrices, nightBase, shiftTip } from "../src/cards/ha-energy-center-card/components/power-detail.js";

const g = (name, ids, extra = {}) => ({ name, entities: ids.map((entity) => ({ entity })), ...extra });
// Billader-gruppen findes via ev_power, chart_group slår sammen, "Øvrigt" ligger sidst.
let r = buildSeries([g("A", ["s.a"]), g("Ude", ["s.u"], { chart_group: "Øvrigt" }), g("B", ["s.b"]), g("Lader", ["s.ev"])], "s.ev");
assert.deepEqual(r.series.map((s) => s.name), ["A", "B", "Øvrigt"]);
assert.deepEqual(r.ev, ["s.ev"]);
// For mange grupper samles i "Øvrigt", og rækkefølgen (= farven) bevares for resten.
r = buildSeries(["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => g(n, [`s.${n}`])), undefined, { maxSeries: 7 });
assert.deepEqual(r.series.map((s) => s.name), ["1", "2", "3", "4", "5", "6", "Øvrigt"]);
assert.deepEqual(r.series[6].entities, ["s.7", "s.8", "s.9"]);
assert.deepEqual(r.ev, []);

const H = 3600000;
const t0 = new Date(2026, 10, 20, 0).getTime();
assert.deepEqual(hourArray([{ start: t0 + H, mean: 5 }, { start: new Date(t0).toISOString(), mean: 2 }], t0, 3), [2, 5, NaN]);
assert.deepEqual(hourPrices([1, 0, 2], [3, 1, NaN]).map((x) => (Number.isNaN(x) ? "x" : x)), [3, "x", "x"]);

// Grundlast: laveste time 00–06, kræver mindst 2 nattetimer.
const grid = new Array(48).fill(900);
grid[3] = 400;
grid[24 + 2] = 500;
for (let h = 24; h < 30; h++) if (h !== 26 && h !== 27) grid[h] = NaN;
const nb = nightBase(grid, t0, 2);
assert.equal(nb[0].w, 400);
assert.equal(nb[1].w, 500);

// Flyt-tip: 1 kWh kl. 2 (pris 4) havde kostet 1 kr kl. 0 (pris 1).
const tip = shiftTip([0, 0, 1000, 0], [1, 3, 4, 2], (k) => t0 + k * H);
assert.equal(tip.hour, 2);
assert.equal(tip.kr, 4);
assert.equal(tip.bestHour, 0);
assert.equal(tip.bestKr, 1);
assert.equal(shiftTip([0, 0, 0], [1, 2, 3], (k) => t0 + k * H), null);
console.log("energy-center power detail ok");
