import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { illustration, illustrationCount, illustrationStyle, suggestedIllustration, validIllustration } from "../lib/illustration-library";

for (const kind of ["person", "house", "unit"] as const) {
  const options = Array.from({ length: illustrationCount[kind] }, (_, index) => illustration(kind, index));
  assert.equal(new Set(options).size, illustrationCount[kind]);
  assert(options.every(value => validIllustration(value, kind)));
  assert.equal(validIllustration(illustration(kind, illustrationCount[kind]), kind), false);
  assert.equal(validIllustration("library:person:1", kind), kind === "person");
  assert(options.includes(suggestedIllustration(kind, "fixed-record-id")));
  assert.equal(suggestedIllustration(kind, "fixed-record-id"), suggestedIllustration(kind, "fixed-record-id"));
  assert(options.every(value => illustrationStyle(value).backgroundImage?.includes(kind === "person" ? "people.webp" : "places.webp")));
}
async function verifyAssets() {
for (const asset of ["people", "places"]) {
  const file = readFileSync(join(process.cwd(), "public", "illustrations", `${asset}.webp`));
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 800);
  assert(file.length < 1024 * 1024);
}
}
assert.equal(illustrationStyle("library:unit:1").backgroundPosition, "0% 66.66666666666667%");
assert.equal(illustrationStyle("library:unit:12").backgroundPosition, "100% 100%");
verifyAssets().then(() => console.log("Illustration library: 24 people, 12 houses, 12 interiors, stable choices, valid assets."));
