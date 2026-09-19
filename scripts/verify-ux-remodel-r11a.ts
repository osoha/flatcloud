import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

check("document filters use an explicit responsive grid", () => {
  const css = read("app/documents.css");
  assert.match(css, /\.document-filter-row \{[\s\S]*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 1600px\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.doesNotMatch(css, /\.filter-row input\{min-width:220px/);
});

check("filter actions retain a stable visual hierarchy", () => {
  const css = read("app/documents.css");
  const page = read("app/dokumenty/page.tsx");
  assert.match(css, /\.document-filter-actions[\s\S]*min-height: 44px/);
  assert.match(css, /\.document-filter-actions \.text-button/);
  assert.match(page, /className="document-filter-actions"/);
  assert.match(page, /className="text-button" href="\/dokumenty">Zrušit filtry/);
});

check("every unit sub-navigation anchor clears sticky chrome", () => {
  const css = read("app/globals.css");
  const page = read("app/nemovitosti/[id]/jednotky/[unitId]/page.tsx");
  const targets = ["prehled", "kvalita", "predpisy", "platby", "smlouva", "komunikace", "osoby", "dokumenty", "meridla"];
  for (const target of targets) {
    assert.match(css, new RegExp(`#${target}(?:,|\\{)`));
    assert.match(page, new RegExp(`(?:href|id)="#?${target}"`));
  }
  assert.match(css, /scroll-margin-top:145px/);
});

console.log(`R11A verifier passed (${passed} checks).`);
