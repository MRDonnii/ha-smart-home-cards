import assert from "node:assert/strict";

const registry = new Map();
class FakeElement {
  constructor() { this.isConnected = true; }
  attachShadow() {
    this.shadowRoot = { innerHTML: "", querySelectorAll() { return []; }, querySelector() { return null; } };
    return this.shadowRoot;
  }
  dispatchEvent(event) { this.lastEvent = event; }
}
globalThis.HTMLElement = FakeElement;
globalThis.customElements = { define(name, constructor) { registry.set(name, constructor); }, get(name) { return registry.get(name); } };
globalThis.window = { customCards: [] };
globalThis.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
globalThis.console.info = () => {};

const air = await import("../src/cards/shared/air-quality.js");

// CO2 levels: good below 800, fair to 1000, poor to 1400, very poor above.
assert.equal(air.co2Rank(550), 0);
assert.equal(air.co2Rank(850), 1);
assert.equal(air.co2Rank(1000), 3);
assert.equal(air.co2Rank(1500), 4);
assert.equal(air.co2Rank(900, { co2_good: 950 }), 0);
assert.equal(air.co2Rank(Number.NaN), undefined);
assert.equal(air.pm25Rank(2), 0);
assert.equal(air.pm25Rank(20), 1);
assert.equal(air.pm25Rank(40), 3);
assert.equal(air.qualityRank("very_poor"), 4);
assert.equal(air.qualityRank("Very poor"), 4);
assert.equal(air.qualityRank("nonsense"), undefined);

const states = (values) => ({ states: Object.fromEntries(Object.entries(values).map(([id, state]) => [id, { state }])) });
const cfg = { co2: "sensor.room_co2", pm25: "sensor.room_pm25", air_quality: "sensor.room_quality" };

assert.deepEqual(air.airQuality(states({}), {}), { configured: false });
const good = air.airQuality(states({ "sensor.room_co2": "546", "sensor.room_pm25": "2", "sensor.room_quality": "good" }), cfg);
assert.equal(good.label, "God");
assert.equal(good.tone, "good");
assert.equal(good.text, "546 ppm");
// The worst of the three wins, so a high CO2 is not hidden by a "good" rating.
const high = air.airQuality(states({ "sensor.room_co2": "1180", "sensor.room_pm25": "2", "sensor.room_quality": "good" }), cfg);
assert.equal(high.label, "Dårlig");
assert.equal(high.tone, "poor");
const rated = air.airQuality(states({ "sensor.room_quality": "moderate" }), { air_quality: "sensor.room_quality" });
assert.equal(rated.label, "Moderat");
assert.equal(rated.text, "Moderat");
const offline = air.airQuality(states({ "sensor.room_co2": "unavailable", "sensor.room_quality": "unavailable" }), cfg);
assert.equal(offline.offline, true);
assert.equal(offline.label, "Offline");

await import("../src/cards/ha-air-quality-card/ha-air-quality-card.js");
const Card = registry.get("ha-air-quality-card");
assert.ok(Card, "ha-air-quality-card is registered");
assert.ok(window.customCards.some((card) => card.type === "ha-air-quality-card"));
assert.throws(() => new Card().setConfig({ name: "Room" }), /mindst én/);

const now = Date.now();
const history = {
  "sensor.room_co2": [
    { s: "480", lu: (now - 20 * 3600000) / 1000 },
    { s: "1120", lu: (now - 8 * 3600000) / 1000 },
    { s: "560", lu: (now - 7 * 3600000) / 1000 },
  ],
  "sensor.room_pm25": [{ s: "3", lu: (now - 20 * 3600000) / 1000 }, { s: "4", lu: (now - 2 * 3600000) / 1000 }],
  "sensor.room_quality": [{ s: "good", lu: (now - 20 * 3600000) / 1000 }, { s: "poor", lu: (now - 8 * 3600000) / 1000 }, { s: "good", lu: (now - 7 * 3600000) / 1000 }],
};
let request;
const hass = {
  ...states({ "sensor.room_co2": "546", "sensor.room_pm25": "2", "sensor.room_quality": "good" }),
  language: "da",
  callWS: async (message) => { request = message; return history; },
};
const card = new Card();
card.setConfig({ name: "Soverum", ...cfg });
card.hass = hass;
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(request.type, "history/history_during_period");
assert.deepEqual(request.entity_ids, [cfg.co2, cfg.pm25, cfg.air_quality]);
const html = card.shadowRoot.innerHTML;
assert.match(html, /Luftkvalitet · Soverum/);
assert.match(html, /<strong>God<\/strong>/);
assert.match(html, /546<small>ppm<\/small>/);
assert.match(html, /data-plot="co2"/);
assert.match(html, /data-plot="pm25"/);
assert.match(html, /1000 ppm · luft ud/);
assert.match(html, /over 1000: 1 t/);
assert.match(html, /Målerens vurdering/);
assert.doesNotMatch(html, /(stop-color|stroke|fill)="var\(/, "CSS variables must not be used in SVG presentation attributes");

// The room cards load and register with the shared helper.
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
await import("../src/cards/ha-radiator-overview-card-v2/ha-radiator-overview-card-v2.js");
await import("../src/cards/ha-home-room-overview-card-v3/ha-home-room-overview-card-v3.js");
assert.ok(registry.get("ha-radiator-overview-card-v2"));
assert.ok(registry.get("ha-home-room-overview-card-v3"));

console.log("air quality card tests passed");
