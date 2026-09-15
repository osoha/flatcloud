import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

check("dense operational tables preserve readable columns", () => {
  const css = read("app/globals.css");
  const reports = read("app/reporty/page.tsx");
  assert.match(css, /\.portfolio-quality-page table,[\s\S]*\.distribution-page table,[\s\S]*\.dense-report-table\{min-width:1120px\}/);
  assert.match(css, /\.portfolio-quality-page \.entity-link,[\s\S]*min-width:170px/);
  assert.match(css, /\.distribution-page \.distribution-actions\{min-width:140px\}/);
  assert.match(reports, /headers\.length >= 8 \? "dense-report-table"/);
});

check("compact shell does not reserve space for a hidden sidebar", () => {
  const css = read("app/globals.css");
  const compactRule = css.match(/\/\* UX remodel R11B[\s\S]*?\/\* REPORT-DESIGN-1/)?.[0] || "";
  assert.match(compactRule, /@media\(max-width:900px\)/);
  assert.match(compactRule, /\.v21-shell \.main\{margin-left:0;width:100%\}/);
});

console.log(`R11B verifier passed (${passed} checks).`);
