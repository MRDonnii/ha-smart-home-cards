// ha-energy-center-card: the tab bar carries the class "swiper", so hass-swipe-navigation leaves swipes on the tabs to
// the card instead of switching dashboard view (was the separate ha-swipe-fix.js resource).
import assert from "node:assert/strict";
import { installFakeDom, mockHass, renderCard, disconnect } from "./helpers/fake-dom.mjs";

installFakeDom();
// The fake DOM cannot run every section's chart code; the card logs that and carries on, which is not what is tested.
const warn = console.warn;
console.warn = (...args) => { if (!String(args[0]).startsWith("[energy-center]")) warn(...args); };
await import("../src/cards/ha-energy-center-card/ha-energy-center-card.js");
const card = await renderCard("ha-energy-center-card", { type: "custom:ha-energy-center-card", entities: { grid_power: "sensor.example_power" } },
  mockHass({ states: { "sensor.example_power": { state: "512", attributes: { unit_of_measurement: "W" } } } }));
assert.match(card.shadowRoot.innerHTML, /<nav class="tabs swiper" role="tablist">/);
disconnect(card);
console.log("energy center swipe tests passed");
process.exit(0);
