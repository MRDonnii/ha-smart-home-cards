import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundles the level helpers and a server renderer of the thermostat, like hch5-frost-lock.test.mjs.
const source = fileURLToPath(new URL("../src/cards/ha-hch5-live-card/source/", import.meta.url));
const output = await build({
  stdin: {
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { AfterheatThermostat } from "./AfterheatThermostat";
      export * from "./afterheatlevel";
      export const render = props => renderToStaticMarkup(createElement(AfterheatThermostat, props));
    `,
    resolveDir: source,
    loader: "tsx",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  loader: { ".css": "text" },
  banner: { js: `import { createRequire } from "node:module"; const require = createRequire(${JSON.stringify(fileURLToPath(import.meta.url))});` },
  write: false,
  logLevel: "silent",
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
const { afterheatLevelOf, levelLabel, wantedLabel, levelPercent, AFTERHEAT_LEVEL_MAX, render } = mod;

assert.equal(AFTERHEAT_LEVEL_MAX, 10);

// Older integrations: no attributes, or none of the new ones, show nothing.
assert.equal(afterheatLevelOf(undefined), null);
assert.equal(afterheatLevelOf({ temperature: 20, hvac_modes: ["heat", "off"] }), null);
// The gateway reports null while the level is stale; null must not read as level 0.
assert.equal(afterheatLevelOf({ hac1_level: null, level_wanted: null, control_reason: null }), null);
assert.equal(afterheatLevelOf({ hac1_level: "", control_reason: "  " }), null);

const reason = "Holder trin 3 · luft 21,2 °C mod mål 21,0 °C";
assert.deepEqual(afterheatLevelOf({ hac1_level: 3, level_wanted: 3.42, control_reason: reason }), { level: 3, wanted: 3.4, reason });
assert.deepEqual(afterheatLevelOf({ hac1_level: 0, level_wanted: 0 }), { level: 0, wanted: 0, reason: null });
// Numeric strings are accepted, out-of-range values are clamped to 0..10.
assert.deepEqual(afterheatLevelOf({ hac1_level: "12", level_wanted: -1 }), { level: 10, wanted: 0, reason: null });
// A reason alone (e.g. the level is stale) is still shown.
assert.deepEqual(afterheatLevelOf({ hac1_level: null, control_reason: "HAC1 styrer selv (forældet måling)" }),
  { level: null, wanted: null, reason: "HAC1 styrer selv (forældet måling)" });

assert.equal(levelLabel({ level: 3, wanted: null, reason: null }), "Trin 3/10");
assert.equal(levelLabel({ level: null, wanted: 2, reason: null }), "Trin —/10");
assert.equal(wantedLabel({ level: 3, wanted: 3.4, reason: null }), "mål 3,4");
assert.equal(wantedLabel({ level: 3, wanted: 4, reason: null }), "mål 4,0");
assert.equal(wantedLabel({ level: 3, wanted: null, reason: null }), null);
assert.equal(levelPercent(5), 50);
assert.equal(levelPercent(12), 100);

// Markup: bar with lit segments, the target marker and the reason under the thermostat.
const base = { value: 21, current: 21, onChange() {}, heating: true, lockout: false, cutoff: 15, outdoor: -2, airBefore: 14, airAfter: 21.2, registered: "21 °C", onConfirm() {}, onCancel() {} };
const html = render({ ...base, level: afterheatLevelOf({ hac1_level: 3, level_wanted: 3.4, control_reason: reason }) });
assert.match(html, /class="afterheat-thermostat tone-heating has-level"/);
assert.match(html, /<strong>Trin 3\/10<\/strong><em>mål 3,4<\/em>/);
assert.match(html, /role="meter" aria-label="HAC1-trin" aria-valuemin="0" aria-valuemax="10" aria-valuenow="3"/);
assert.equal((html.match(/<i class="lit"><\/i>/g) || []).length, 3);
assert.equal((html.match(/<i><\/i>/g) || []).length, 7);
assert.match(html, /class="thermostat-level-marker" style="left:34%"/);
assert.match(html, /<p class="thermostat-level-reason">Holder trin 3 · luft 21,2 °C mod mål 21,0 °C<\/p>/);

// Level 0 still draws the bar (no lit segments) and no marker without level_wanted.
const zero = render({ ...base, level: afterheatLevelOf({ hac1_level: 0 }) });
assert.match(zero, /Trin 0\/10/);
assert.doesNotMatch(zero, /<i class="lit">/);
assert.doesNotMatch(zero, /thermostat-level-marker/);
assert.doesNotMatch(zero, /thermostat-level-reason/);

// Reason only: no bar.
const reasonOnly = render({ ...base, level: afterheatLevelOf({ control_reason: "Frostsikring: mindst trin 1" }) });
assert.doesNotMatch(reasonOnly, /thermostat-level-bar/);
assert.match(reasonOnly, /Frostsikring: mindst trin 1/);

// A stale level (null) hides the bar and the wanted marker even when level_wanted is set; the reason stays.
const stale = render({ ...base, level: afterheatLevelOf({ hac1_level: null, level_wanted: 3.4, control_reason: "HAC1 styrer selv (forældet måling)" }) });
assert.doesNotMatch(stale, /thermostat-level-bar|thermostat-level-marker|Trin/);
assert.match(stale, /HAC1 styrer selv \(forældet måling\)/);

// Without the prop (older integrations) nothing changes.
for (const props of [base, { ...base, level: null }, { ...base, level: afterheatLevelOf({ temperature: 20 }) }]) {
  const plain = render(props);
  assert.doesNotMatch(plain, /has-level|thermostat-level|Trin/);
}

console.log("Validated HCH5 afterheat level");

// Valve opening: HAC1 level × 10 %, from the sensor, the climate attribute or the level.
{
  const { valvePercentOf, afterheatReadback } = mod;
  assert.equal(valvePercentOf("30", {}), 30);
  assert.equal(valvePercentOf(null, { valve_percent: 70, hac1_level: 3 }), 70);
  assert.equal(valvePercentOf(undefined, { hac1_level: 3 }), 30);
  assert.equal(valvePercentOf(undefined, { hac1_level: 14 }), 100);
  assert.equal(valvePercentOf("unknown", { hac1_level: null }), null);
  assert.equal(valvePercentOf(undefined, undefined), null);
  assert.equal(valvePercentOf(130, {}), 100);

  assert.deepEqual(afterheatReadback({ valvePercent: 20, level: 2, controlActive: "pi", heating: true, lockout: false }),
    { value: "Ventilåbning 20 %", note: "HAC1 trin 2/10 · Pi styrer" });
  assert.deepEqual(afterheatReadback({ valvePercent: 30, level: null, controlActive: "native", heating: true, lockout: false }),
    { value: "Ventilåbning 30 %", note: "HAC1 trin 3/10" });
  assert.deepEqual(afterheatReadback({ valvePercent: 0, level: 0, controlActive: "native", heating: false, lockout: true }),
    { value: "Ventilåbning 0 %", note: "Sommerstop: ude ≥ 15 °C" });
  // Older integrations without level or valve keep the old texts.
  assert.deepEqual(afterheatReadback({ valvePercent: null, level: null, heating: true, lockout: false }),
    { value: "Aktiv", note: "Kun setpunkt styres" });
  assert.deepEqual(afterheatReadback({ valvePercent: null, level: null, heating: false, lockout: true }),
    { value: "Spærret", note: "Sommerstop: ude ≥ 15 °C" });
}
