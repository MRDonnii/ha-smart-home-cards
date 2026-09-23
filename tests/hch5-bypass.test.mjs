import assert from "node:assert/strict";
import { build } from "esbuild";

const output = await build({
  entryPoints: [new URL("../src/cards/ha-hch5-live-card/source/bypass.ts", import.meta.url).pathname],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { bypassTravel } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);

for (const [moving, settled, direction, requestOn] of [[64, 255, "opening", true], [32, 0, "closing", false]]) {
  const midway = bypassTravel({ raw: moving, requestOn, direction, seconds: 166, total: 180 });
  assert.equal(midway.percent, 92);
  assert.equal(midway.awaitingEnd, false);
  assert.equal(midway.remainingSeconds, 14);

  const late = bypassTravel({ raw: moving, requestOn, direction, seconds: 183, total: 180 });
  assert.equal(late.percent, 99);
  assert.equal(late.awaitingEnd, true);
  assert.equal(late.remainingSeconds, null);
  assert.equal(bypassTravel({ raw: settled, requestOn: false }), null);
}
console.log("Validated HCH5 bypass travel in both directions");
