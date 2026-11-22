import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundles the lock helpers and a server renderer of the thermostat into one module,
// so the markup test uses the same React as the component.
const source = fileURLToPath(new URL("../src/cards/ha-hch5-live-card/source/", import.meta.url));
const output = await build({
  stdin: {
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { AfterheatThermostat } from "./AfterheatThermostat";
      export * from "./frostlock";
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
  // react-dom/server requires Node built-ins, which a data: module can only reach through createRequire.
  banner: { js: `import { createRequire } from "node:module"; const require = createRequire(${JSON.stringify(fileURLToPath(import.meta.url))});` },
  write: false,
  logLevel: "silent",
});
const lock = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
const { frostLockOf, stepDown, stepUp, canStepDown, clampSetpoint, allowedWhileLocked, frostRefusal, coolBlocked, render } = lock;

// The lock comes from the climate entity: no "off" mode means locked, min_temp is the floor.
assert.deepEqual(frostLockOf({ hvac_modes: ["heat", "off"], min_temp: 10 }), { locked: false, floor: 10 });
assert.deepEqual(frostLockOf({ hvac_modes: ["heat"], min_temp: 18 }), { locked: true, floor: 18 });
assert.deepEqual(frostLockOf({ hvac_modes: ["heat"] }), { locked: true, floor: 10 });
// Older integrations without hvac_modes, or no entity at all, never lock.
assert.equal(frostLockOf({ min_temp: 18 }).locked, false);
assert.equal(frostLockOf(undefined).locked, false);

const locked = frostLockOf({ hvac_modes: ["heat"], min_temp: 18 });
const open = frostLockOf({ hvac_modes: ["heat", "off"], min_temp: 10 });

// Unlocked: the old behaviour, minus at 10 switches off.
assert.equal(stepDown(10, open), "off");
assert.equal(stepDown(20, open), 19);
assert.equal(stepUp("off", open), 10);
assert.equal(canStepDown("off", open), false);

// Locked: minus stops at the floor and never produces "off".
assert.equal(stepDown(19, locked), 18);
assert.equal(stepDown(18, locked), 18);
assert.equal(stepDown("off", locked), 18);
assert.equal(stepDown(15, locked), 15, "minus never raises a stored value under the floor");
assert.equal(canStepDown(18, locked), false);
assert.equal(canStepDown(19, locked), true);
assert.equal(stepUp("off", locked), 18);
assert.equal(stepUp(12, locked), 18);
assert.equal(stepUp(35, locked), 35);
assert.equal(clampSetpoint(10, locked), 18);
assert.equal(clampSetpoint(22, locked), 22);
assert.equal(clampSetpoint(10, open), 10);
for (let value = 10; value <= 35; value++) {
  assert.notEqual(stepDown(value, locked), "off");
  assert.ok(stepDown(value, locked) >= Math.min(value, 18));
}

// Confirm refuses "off" and values under the floor, with the Pi's own wording.
assert.equal(allowedWhileLocked("off", locked), false);
assert.equal(allowedWhileLocked(17, locked), false);
assert.equal(allowedWhileLocked(18, locked), true);
assert.equal(allowedWhileLocked("off", open), true);
assert.equal(frostRefusal("off", locked), "Frostsikring: eftervarmen kan ikke slukkes, mens det fryser.");
assert.equal(frostRefusal(12, locked), "Frostsikring: eftervarmen kan ikke sættes under 18 °C, mens det fryser.");
assert.equal(frostRefusal(20, locked), null);
assert.equal(frostRefusal("off", open), null);

// Køl start buttons: blocked while locked or when HA reports them unavailable.
assert.equal(coolBlocked(locked, "2026-01-01T00:00:00+00:00"), true);
assert.equal(coolBlocked(open, "unavailable"), true);
assert.equal(coolBlocked(open, "unknown"), false);
assert.equal(coolBlocked(open, "2026-01-01T00:00:00+00:00"), false);

// Markup: the power button is disabled with an explanation, and the note is shown.
const base = { onChange() {}, heating: true, lockout: false, cutoff: 15, outdoor: -2, airBefore: 14, airAfter: 21, registered: "18 °C", onConfirm() {}, onCancel() {} };
const powerButton = html => html.match(/<button[^>]*class="thermostat-power[^"]*"[^>]*>/)[0];
const lockedHtml = render({ ...base, value: 18, current: 18, frostLock: locked });
assert.match(powerButton(lockedHtml), /disabled=""/);
assert.match(powerButton(lockedHtml), /title="Frostsikring: eftervarmen kan ikke slukkes i frostvejr"/);
assert.match(lockedHtml, /Frostsikring: eftervarmen kan ikke slukkes i frostvejr \(mindst 18 °C\)/);
assert.match(lockedHtml, /aria-valuemin="18"/);
assert.match(lockedHtml, /<button type="button" aria-label="Sænk eftervarme" disabled="">/);

const openHtml = render({ ...base, value: 18, current: 18, frostLock: open });
assert.doesNotMatch(powerButton(openHtml), /disabled/);
assert.doesNotMatch(openHtml, /Frostsikring/);
// Without the prop the thermostat behaves as before.
assert.doesNotMatch(powerButton(render({ ...base, value: 18, current: 18 })), /disabled/);

// A draft of "off" left over from before the lock cannot be confirmed.
const staleDraft = render({ ...base, value: "off", current: 20, frostLock: locked });
assert.match(staleDraft, /<button type="button" class="thermostat-ok" disabled="">Bekræft<\/button>/);
assert.match(staleDraft, /Frostsikring: eftervarmen kan ikke slukkes, mens det fryser\./);
assert.doesNotMatch(render({ ...base, value: 22, current: 20, frostLock: locked }), /class="thermostat-ok" disabled/);
// Switching on from "off" while locked is still allowed.
assert.doesNotMatch(powerButton(render({ ...base, value: "off", current: "off", frostLock: locked })), /disabled/);

console.log("Validated HCH5 afterheat frost lock");
