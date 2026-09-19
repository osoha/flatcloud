import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";

async function main() {
const assetPath = "public/czech-regions-map.png";
const asset = readFileSync(assetPath);
const metadata = await sharp(asset).metadata();

assert.equal(metadata.width, 700);
assert.equal(metadata.height, 398);
assert.equal(createHash("sha256").update(asset).digest("hex"), "e0451850cec1014e52a6229b56adde220e3d914cbdd0907ff02f86d65730e22c");

const renderer = readFileSync("lib/reporting/pdf/annual-report-pdf.tsx", "utf8");
assert.doesNotMatch(renderer, /Souřadnice: OpenStreetMap contributors/);
assert.match(renderer, /CZECH_REGIONS_MAP_PATH/);

const editor = readFileSync("app/reporty/vyrocni/[groupId]/reporty/[reportId]/page.tsx", "utf8");
assert.match(editor, /OpenStreetMap Nominatim/);

const source = readFileSync("public/czech-regions-map.SOURCE.md", "utf8");
assert.match(source, /WIP deck/);
assert.match(source, /authoritative/);
assert.match(source, /only the silhouette and regional divisions common to both sources/);

console.log("R18E annual map cleanup verifier passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
