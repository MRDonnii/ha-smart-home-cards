// th-pages (th-weather-page-card, th-security-card, th-tech-card): config normalisation + render smoke tests with
// example data (node tests/th-pages.test.mjs).
import assert from "node:assert/strict";
import { installFakeDom, mockHass, renderCard, disconnect } from "./helpers/fake-dom.mjs";

installFakeDom();
const cfg = await import("../src/cards/th-pages/config.js");
const { toMs } = await import("../src/cards/th-pages/weather-page.js");
await import("../src/cards/th-pages/th-pages.js");

// ---------------------------------------------------------------- config
{
  const w = cfg.normalizeWeatherConfig({ weather: "weather.home" });
  assert.equal(w.weather, "weather.home");
  assert.equal(w.prefix, null);
  assert.ok(Object.values(w.ent).every((v) => v === null), "no sensor defaults without a prefix");
  assert.equal(w.radar, null);
  assert.equal(w.source, "");
  const p = cfg.normalizeWeatherConfig({ weather: "weather.home", prefix: "sensor.example_wx_", entities: { humidity: "sensor.example_humidity", pressure: null }, satellite_image_entity: null });
  assert.equal(p.prefix, "sensor.example_wx_");
  assert.equal(p.ent.solar_radiation, "sensor.example_wx_solindstraling");
  assert.equal(p.ent.temperature, "sensor.example_wx_temperatur");
  assert.equal(p.ent.humidity, "sensor.example_humidity");
  assert.equal(p.ent.pressure, null);
  assert.equal(p.radar, "image.example_wx_radarkort");
  assert.equal(p.satellite, null);
  assert.equal(p.source, "DMI");
  assert.equal(cfg.normalizeWeatherConfig({ prefix: "example_wx" }).prefix, "sensor.example_wx_", "bare prefix accepted");
  assert.equal(cfg.normalizeWeatherConfig({}).weather, null);
  assert.equal(toMs(36, "km/h"), 10);
  assert.equal(toMs(7, "m/s"), 7);
}
{
  const s = cfg.normalizeSecurityConfig({});
  assert.equal(s.alarm, null);
  assert.equal(s.lock, null);
  assert.deepEqual(s.doors, []);
  assert.ok(s.ent.pv.startsWith("sensor.emma_"), "Huawei default name for the PV warning");
  const t = cfg.normalizeSecurityConfig({ alarm: "alarm_control_panel.home_alarm", lock: { entity: "lock.back_door", name: "Bagdør" },
    freezers: ["sensor.example_freezer", { entity: "sensor.example_fridge", name: "Køleskabet", max: 8 }], printers: [{ name: "Printer A", prefix: "sensor.example_printer" }] });
  assert.deepEqual(t.alarm, { entity: "alarm_control_panel.home_alarm", name: null });
  assert.deepEqual(t.lock, { entity: "lock.back_door", name: "Bagdør", definite: "bagdøren" });
  assert.deepEqual(t.freezers, [{ entity: "sensor.example_freezer", name: "Fryseren", max: -15 }, { entity: "sensor.example_fridge", name: "Køleskabet", max: 8 }]);
  assert.deepEqual(t.printers, [{ name: "Printer A", prefix: "example_printer_" }]);
  assert.equal(cfg.normalizeSecurityConfig({ huawei: false }).ent.pv, null);
}
{
  const t = cfg.normalizeTechConfig({});
  assert.deepEqual(t.power, []);
  assert.equal(t.relay_platform, "shelly");
  assert.ok(t.ent.cpu.startsWith("sensor.system_monitor") && t.ent.cpu.endsWith("_processor_use"), "System Monitor standard name");
  assert.ok(t.ent.backup_last.startsWith("sensor.backup_"), "Backup standard name");
  const u = cfg.normalizeTechConfig({ power: [{ entity: "switch.router", name: "Router", icon: "router", warning: "Internet off" }, "switch.tv"], relay_platform: false, relays: ["switch.example_relay"], entities: { cpu: "sensor.example_cpu", backup_next: null } });
  assert.deepEqual(u.power[0], { entity: "switch.router", name: "Router", icon: "router", warning: "Internet off" });
  assert.deepEqual(u.power[1], { entity: "switch.tv", name: null, icon: "plug", warning: "" });
  assert.equal(u.relay_platform, null);
  assert.deepEqual(u.relays, ["switch.example_relay"]);
  assert.equal(u.ent.cpu, "sensor.example_cpu");
  assert.equal(u.ent.backup_next, null);
}

const ago = (min) => new Date(Date.now() - min * 6e4).toISOString();
const fire = (el, sel) => el.onclick({ target: { closest: (s) => (s === sel ? {} : null) } });

// ---------------------------------------------------------------- weather page
{
  const hass = mockHass({ states: {
    "sun.sun": "above_horizon",
    "weather.home": { state: "cloudy", attributes: { temperature: 5.2, humidity: 81, pressure: 1012, cloud_coverage: 75, wind_gust_speed: 36, wind_speed_unit: "km/h", dew_point: 2.1, visibility: 10, uv_index: 1 } },
    "image.example_radar": { state: new Date().toISOString(), attributes: { entity_picture: "/api/image_proxy/image.example_radar?token=x" } },
  } });
  const card = await renderCard("th-weather-page-card", { type: "custom:th-weather-page-card", weather: "weather.home", radar_image_entity: "image.example_radar" }, hass);
  const root = card.shadowRoot;
  assert.match(root.queried("#g").innerHTML, /<th-weather-card id="hero">/);
  assert.match(root.queried("#g").innerHTML, /Radar/);
  assert.doesNotMatch(root.queried("#g").innerHTML, /id="rtabs"/, "no tabs with only a radar image");
  assert.match(root.queried("#g").innerHTML, /Målinger lige nu</);
  const cells = root.queried("#cells").innerHTML;
  assert.match(cells, /Luftfugtighed.*81/);
  assert.match(cells, /dugpunkt 2,1°/);
  assert.match(cells, /Vindstød.*10,0/);
  assert.match(cells, /Lufttryk.*1\.012|Lufttryk.*1012/);
  assert.match(cells, /sigtbarhed 10 km/);
  assert.doesNotMatch(cells, /Solindstråling/, "no sensor, no attribute → cell left out");
  assert.match(root.queried("#rts").innerHTML, /^Radar · opdateret \d\d\.\d\d$/);
  assert.ok(hass.calls.length === 0, "no service calls");
  card._daily = Array.from({ length: 7 }, (_, i) => ({ datetime: new Date(Date.now() + i * 864e5).toISOString(), condition: "rainy", temperature: 6 + i, templow: 1 + i, precipitation_probability: 40 }));
  card.daily();
  assert.match(root.queried("#days").innerHTML, /I dag/);
  assert.match(root.queried("#days").innerHTML, /40%/);
  disconnect(card);
  const minimal = await renderCard("th-weather-page-card", { type: "custom:th-weather-page-card" }, mockHass());
  assert.match(minimal.shadowRoot.queried("#g").innerHTML, /Vælg en vejr-entitet/);
  disconnect(minimal);
}

// ---------------------------------------------------------------- security
{
  const hass = mockHass({ states: {
    "alarm_control_panel.home_alarm": { state: "armed_home", last_changed: ago(90) },
    "lock.front_door": { state: "unlocked", last_changed: ago(20) },
    "binary_sensor.front_door": { state: "on", last_changed: ago(15) },
    "binary_sensor.back_door": { state: "off", last_changed: ago(300) },
    "sensor.example_freezer": "-9.5",
    "sensor.example_printer_black_ink": { state: "3", attributes: { friendly_name: "Printer A black ink" } },
    "sensor.example_emma_pv_output_power": "unavailable",
  } });
  const card = await renderCard("th-security-card", { type: "custom:th-security-card", huawei: { emma: "example_emma" },
    alarm: { entity: "alarm_control_panel.home_alarm", name: "Example" }, lock: "lock.front_door",
    doors: [{ entity: "binary_sensor.front_door", name: "Hoveddør" }, { entity: "binary_sensor.back_door", name: "Bagdør" }],
    freezers: [{ entity: "sensor.example_freezer", name: "Testfryseren" }], printers: [{ name: "Printer A", prefix: "sensor.example_printer_" }] }, hass);
  const root = card.shadowRoot;
  assert.match(root.queried("#g").innerHTML, /Example alarm/);
  assert.match(root.queried("#g").innerHTML, /<\/span>Hoveddør<\/div>/);
  assert.equal(root.queried("#ast").innerHTML, "Til · hjemme");
  assert.equal(root.queried("#lst").innerHTML, "Ulåst");
  assert.match(root.queried("#dsum").innerHTML, /1 åben/);
  const als = root.queried("#als").innerHTML;
  assert.match(als, /Hoveddør står åben/);
  assert.match(als, /Hoveddøren er ikke låst/);
  assert.match(als, /Testfryseren er for varm/);
  assert.match(als, /Printer Printer A: blæk snart tomt/);
  assert.match(als, /Ingen data fra solcellerne/);
  // alarm and lock go through the code pad
  card.armPad("arm_away");
  let pad = root.appended.at(-1);
  assert.match(pad.innerHTML, /Slå til · ude/);
  await fire(pad, "[data-go]");
  assert.deepEqual(hass.calls.at(-1), { domain: "alarm_control_panel", service: "alarm_arm_away", data: { entity_id: "alarm_control_panel.home_alarm" }, target: undefined });
  card.lockPad();
  pad = root.appended.at(-1);
  assert.match(pad.innerHTML, /Lås hoveddøren</);
  await fire(pad, "[data-go]");
  assert.deepEqual(hass.calls.at(-1), { domain: "lock", service: "lock", data: { entity_id: "lock.front_door" }, target: undefined });
  disconnect(card);
  const minimal = await renderCard("th-security-card", { type: "custom:th-security-card" }, mockHass());
  assert.match(minimal.shadowRoot.queried("#g").innerHTML, /Tilføj <b>alarm<\/b>/);
  assert.match(minimal.shadowRoot.queried("#als").innerHTML, /Alt er roligt/);
  disconnect(minimal);
}

// ---------------------------------------------------------------- tech
{
  const hass = mockHass({ states: {
    "switch.router": "on", "switch.tv_plug": "off",
    "switch.example_relay": { state: "on", attributes: { friendly_name: "Example relay" } },
    "switch.other_relay": { state: "off", attributes: { friendly_name: "Other relay" } },
    "sensor.example_cpu": "42", "sensor.example_memory": "61", "sensor.example_cpu_temp": "48",
    "sensor.example_printer_black_ink": "55", "sensor.example_printer_cyan_ink": "8",
    "sensor.example_backup_last": new Date(Date.now() - 6 * 36e5).toISOString(), "sensor.example_backup_next": new Date(Date.now() + 18 * 36e5).toISOString(),
    "update.example_addon": "on",
  } });
  hass.entities = { "switch.example_relay": { entity_id: "switch.example_relay", platform: "shelly", area_id: "room_1" }, "switch.other_relay": { entity_id: "switch.other_relay", platform: "other" } };
  hass.areas = { room_1: { area_id: "room_1", name: "Room 1" } };
  const card = await renderCard("th-tech-card", { type: "custom:th-tech-card",
    power: [{ entity: "switch.router", name: "Router", icon: "router", warning: "Internettet afbrydes." }, { entity: "switch.tv_plug", name: "TV", icon: "mdi:television" }],
    printers: [{ name: "Example Printer", prefix: "sensor.example_printer_" }],
    entities: { cpu: "sensor.example_cpu", memory: "sensor.example_memory", cpu_temperature: "sensor.example_cpu_temp", backup_last: "sensor.example_backup_last", backup_next: "sensor.example_backup_next" } }, hass);
  const root = card.shadowRoot;
  assert.match(root.queried("#pw").innerHTML, /Router.*Tændt/);
  assert.match(root.queried("#pw").innerHTML, /<ha-icon icon="mdi:television"/);
  assert.match(root.queried("#rl").innerHTML, /Example relay<br><small>Room 1/);
  assert.doesNotMatch(root.queried("#rl").innerHTML, /Other relay/, "only the relay platform");
  assert.match(root.queried("#gau").innerHTML, />42</);
  assert.match(root.queried("#upd").innerHTML, /1 opdatering</);
  assert.match(root.queried("#ink").innerHTML, /Example Printer/);
  assert.match(root.queried("#ink").innerHTML, /tk low/);
  assert.match(root.queried("#bk").innerHTML, /Seneste/);
  // switching off a switch with a warning asks first; switching on does not
  card.toggle("switch.router", "Internettet afbrydes.", "Router");
  const dlg = root.appended.at(-1);
  assert.match(dlg.innerHTML, /Sluk Router\?/);
  assert.equal(hass.calls.length, 0);
  fire(dlg, "[data-ok]");
  assert.deepEqual(hass.calls.at(-1), { domain: "switch", service: "turn_off", data: { entity_id: "switch.router" }, target: undefined });
  card.toggle("switch.tv_plug");
  assert.deepEqual(hass.calls.at(-1), { domain: "switch", service: "turn_on", data: { entity_id: "switch.tv_plug" }, target: undefined });
  disconnect(card);
  // explicit relay list when discovery is off
  const list = await renderCard("th-tech-card", { type: "custom:th-tech-card", relay_platform: false, relays: ["switch.other_relay", "switch.missing_relay"] }, hass);
  assert.match(list.shadowRoot.queried("#rl").innerHTML, /Other relay/);
  assert.doesNotMatch(list.shadowRoot.queried("#g").innerHTML, /Printere/, "printer block hidden without printers");
  disconnect(list);
  const minimal = await renderCard("th-tech-card", { type: "custom:th-tech-card" }, mockHass());
  assert.match(minimal.shadowRoot.queried("#pw").innerHTML, /Ingen kontakter sat op/);
  disconnect(minimal);
}

for (const tag of ["th-weather-page-card", "th-security-card", "th-tech-card"]) {
  assert.ok(customElements.get(tag), `${tag} registered`);
  assert.ok(window.customCards.some((c) => c.type === tag), `${tag} in customCards`);
}
console.log("th-pages tests passed");
process.exit(0);
