import assert from "node:assert/strict";
import { installFakeDom, mockHass, renderCard, disconnect } from "./helpers/fake-dom.mjs";

installFakeDom({ now: "2026-06-01T10:00:00Z" });
const cfgMod = await import("../src/cards/mr-weather-studio-card/config.js");
const core = await import("../src/cards/mr-weather-studio-card/mr-weather-studio-core.js");
await import("../src/cards/mr-weather-studio-card/mr-weather-studio-card.js");
const tag = "mr-weather-studio-card";
assert.ok(customElements.get(tag));
assert.equal(core.VERSION, "1.0.2");

// Config helpers: only generic defaults, sensors from `entities` or `sensor_prefix`.
const base = cfgMod.normalizeConfig({});
assert.equal(base.weather_entity, null);
assert.equal(base.sun_entity, "sun.sun");
assert.equal(base.warnings_entity, null);
assert.equal(base.sensor_prefix, null);
assert.equal(base.title, "Vejret");
assert.equal(base.today_title, "Dagen i kommunen");
assert.deepEqual(cfgMod.normalizeConfig(undefined), base);
assert.equal(cfgMod.sensorId(base, "temperatur"), null);
assert.equal(cfgMod.sensorId({ sensor_prefix: "sensor.example_weather_" }, "temperatur"), "sensor.example_weather_temperatur");
assert.equal(cfgMod.sensorId({ sensor_prefix: "sensor.example_weather_", entities: { temperatur: "sensor.example_temp" } }, "temperatur"), "sensor.example_temp");
assert.ok(cfgMod.sensorKeys().includes("nedbor_lige_nu") && cfgMod.sensorKeys().includes("vandstand_havn"));
assert.equal(cfgMod.locationText({ location: "Example Town" }, { config: { location_name: "Home" } }), "Example Town");
assert.equal(cfgMod.locationText({ location: null }, { config: { location_name: "Home" } }), "Home");
assert.equal(cfgMod.locationText({}, undefined), "");
assert.equal(cfgMod.stubConfig(null, ["sun.sun", "weather.example_home"]).weather_entity, "weather.example_home");
assert.equal(cfgMod.stubConfig({ states: {} }).weather_entity, "weather.forecast_home");

// Core helpers.
assert.equal(core.WIND(36, "km/h"), 10);
assert.equal(core.COMPASS(90), "Ø");
assert.equal(core.CONDITION("partlycloudy"), "Let skyet");
assert.equal(core.rainInsight([], "mm"), "Afventer de næste timers prognose");

// Render with example data: weather entity + forecasts from weather.get_forecasts.
const now = Date.parse("2026-06-01T10:00:00Z");
const hourly = Array.from({ length: 30 }, (_, i) => ({ datetime: new Date(now + i * 3600e3).toISOString(), condition: "sunny", temperature: 18 + i / 10, precipitation: 0, precipitation_probability: 5, wind_speed: 4 }));
const daily = Array.from({ length: 7 }, (_, i) => ({ datetime: new Date(now + i * 86400e3).toISOString(), condition: "rainy", temperature: 20, templow: 11, precipitation: 1.2, precipitation_probability: 60 }));
const weather = { state: "sunny", attributes: { temperature: 21.4, temperature_unit: "°C", apparent_temperature: 20.1, humidity: 55, wind_speed: 4.2, wind_speed_unit: "m/s", wind_gust_speed: 8, wind_bearing: 270, pressure: 1016, pressure_unit: "hPa", precipitation_unit: "mm" } };
const hass = mockHass({
  states: {
    "weather.example_home": weather,
    "sun.sun": { state: "above_horizon", attributes: { next_setting: "2026-06-01T20:00:00Z", next_rising: "2026-06-02T03:00:00Z" } },
    "sensor.example_weather_warnings": { state: "0", attributes: { warnings: [] } },
    "sensor.example_weather_temperatur": { state: "20.9", attributes: { unit_of_measurement: "°C", station_name: "Example station" } },
  },
  config: { location_name: "Example Home" },
  ws: { call_service: (m) => ({ response: { [m.service_data.entity_id]: { forecast: m.service_data.type === "daily" ? daily : hourly } } }) },
});
const card = await renderCard(tag, { type: `custom:${tag}`, weather_entity: "weather.example_home", warnings_entity: "sensor.example_weather_warnings", sensor_prefix: "sensor.example_weather_", today_title: "Dagen i byen" }, hass);
let html = card._shell.innerHTML;
assert.match(html, /<h2>Vejret<\/h2>/);
assert.match(html, /MRDonnii · DMI · Example Home/);
assert.match(html, /21,4<small>°<\/small>/);
assert.match(html, /Solrigt/);
assert.match(html, /Ingen aktive vejrvarsler/);
assert.match(html, /De næste syv dage/);
assert.match(html, /I dag/);
const fetches = hass.calls.filter((c) => c.ws === "call_service" && c.msg.service === "get_forecasts");
assert.deepEqual(fetches.map((c) => c.msg.service_data.type).sort(), ["daily", "hourly"]);
assert.ok(fetches.every((c) => c.msg.service_data.entity_id === "weather.example_home"));
assert.equal(card._hourly.length, 30);

// Details tab: configured prefix shows every group (with the custom "today" title).
card._tab = "details"; card._render(); html = card._shell.innerHTML;
assert.match(html, /Dagen i byen/);
assert.match(html, /Example station/);
assert.match(html, /20,9 °C/);

// Without DMI sensors: no warnings box, Details falls back to the weather entity's attributes, other groups hidden.
const generic = await renderCard(tag, { type: `custom:${tag}`, weather_entity: "weather.example_home", location: "" }, hass);
html = generic._shell.innerHTML;
assert.doesNotMatch(html, /vejrvarsler/i);
assert.match(html, /MRDonnii · DMI<\/div>/);
generic._tab = "details"; generic._render(); html = generic._shell.innerHTML;
assert.match(html, /1\.016 hPa|1016 hPa/);
assert.doesNotMatch(html, /Ved vandet|Dagen i kommunen|risikoprognoser/);
generic._tab = "radar"; generic._render();
assert.match(generic._shell.innerHTML, /ikke valgt et kortbillede/);

// Refresh calls weather.get_forecasts again.
const before = hass.calls.length;
await generic._fetchForecasts(true);
assert.ok(hass.calls.slice(before).some((c) => c.msg?.service === "get_forecasts"));

// More-info helper fires hass-more-info for an entity.
generic._more("weather.example_home");
assert.equal(generic.lastEvent.type, "hass-more-info");
assert.equal(generic.lastEvent.detail.entityId, "weather.example_home");

// A minimal config does not throw and asks for a weather entity.
const empty = await renderCard(tag, { type: `custom:${tag}` }, mockHass());
assert.match(empty._shell.innerHTML, /weather_entity/);

for (const c of [card, generic, empty]) disconnect(c);
console.log("mr-weather-studio-card tests passed");
process.exit(0);
