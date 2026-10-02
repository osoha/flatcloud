import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { defaultPropertyIllustration, illustration, illustrationCount, illustrationStyle, suggestedIllustration, validIllustration } from "../lib/illustration-library";

for (const kind of ["person", "house", "unit"] as const) {
  const options = Array.from({ length: illustrationCount[kind] }, (_, index) => illustration(kind, index));
  assert.equal(new Set(options).size, illustrationCount[kind]);
  assert(options.every(value => validIllustration(value, kind)));
  assert.equal(validIllustration(illustration(kind, illustrationCount[kind]), kind), false);
  assert.equal(validIllustration("library:person:1", kind), kind === "person");
  assert(options.includes(suggestedIllustration(kind, "fixed-record-id")));
  assert.equal(suggestedIllustration(kind, "fixed-record-id"), suggestedIllustration(kind, "fixed-record-id"));
  for (const value of options) {
    const number = Number(value.split(":")[2]);
    const style = illustrationStyle(value);
    assert(style.backgroundImage?.includes(kind === "person" && number <= 24 ? "people.webp" : `${kind}-${number}.webp`));
    if (kind !== "person") assert.equal(style.backgroundSize, "cover", "wide cards crop without stretching");
  }
  for (const invalid of [`library:${kind}:0`, `library:${kind}:01`, `library:${kind}:-1`, `library:${kind}:1.1`, `library:${kind}:49`]) assert.equal(validIllustration(invalid, kind), false);
}
async function verifyAssets() {
for (const kind of ["house", "unit", "person"] as const) {
  for (let n = kind === "person" ? 25 : 1; n <= illustrationCount[kind]; n++) {
    const file = readFileSync(join(process.cwd(), "public", "illustrations", `${kind}-${n}.webp`));
    const metadata = await sharp(file).metadata();
    assert(metadata.width && metadata.height);
    assert(kind === "person" ? metadata.width === metadata.height : Math.abs(metadata.width / metadata.height - 16 / 9) < .01);
    assert(file.length < 400 * 1024, "individual web assets stay light");
  }
}
for (const asset of ["people", "places"]) {
  const file = readFileSync(join(process.cwd(), "public", "illustrations", `${asset}.webp`));
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 800);
  assert(file.length < 1024 * 1024);
}
}
assert.equal(illustrationStyle("library:unit:1").backgroundPosition, "center");
assert.equal(illustrationStyle("library:unit:18").backgroundPosition, "center");
assert.equal(new Set(Array.from({length:12}, (_, index) => defaultPropertyIllustration("unit", "one-property", index))).size, 12);
assert.equal(defaultPropertyIllustration("unit", "one-property", 3), defaultPropertyIllustration("unit", "one-property", 3));
verifyAssets().then(() => console.log("Illustration library: 48 people, 18 houses, 18 interiors, stable choices, valid assets."));
