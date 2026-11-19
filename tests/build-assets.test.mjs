import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The committed bundle is what HACS installs, so it must carry the inlined Calefa unit image.
const bundle = await readFile(new URL("../dist/ha-smart-home-cards.js", import.meta.url), "utf8");
const image = bundle.match(/CALEFA_DEFAULT_UNIT_IMAGE = "([^"]*)"/);
assert.ok(image, "CALEFA_DEFAULT_UNIT_IMAGE is missing from the bundle");
assert.match(image[1], /^data:image\/webp;base64,.{1000}/, "the Calefa unit image is empty in the bundle");

// The build plugin's filter must match both POSIX and Windows paths.
const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
const filter = new RegExp(build.match(/filter: \/(.+?)\/ \}/)[1]);
assert.ok(filter.test("/repo/src/cards/ha-calefa-flow-card/ha-calefa-flow-card.js"), "POSIX path");
assert.ok(filter.test("C:\\repo\\src\\cards\\ha-calefa-flow-card\\ha-calefa-flow-card.js"), "Windows path");
console.log("build asset tests passed");
