import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

check("full and compact empty states have separate visual hierarchy", () => {
  const css = read("app/globals.css");
  const r11c = css.match(/\/\* UX remodel R11C[\s\S]*$/)?.[0] || "";
  assert.match(r11c, /\.v21-shell \.empty-state\{[^}]*min-height:190px[^}]*padding:40px 24px/);
  assert.match(r11c, /\.v21-shell \.compact-empty,[^{]*\{[^}]*min-height:112px[^}]*padding:20px 16px/);
  assert.match(r11c, /\.v21-shell \.empty-state h2,[^{]*\{[^}]*font-size:17px/);
});

check("mobile page actions remain visible and labelled", () => {
  const css = read("app/globals.css");
  const r11c = css.match(/\/\* UX remodel R11C[\s\S]*$/)?.[0] || "";
  assert.match(r11c, /\.page-title \.action-row \.secondary\{display:inline-flex\}/);
  assert.match(r11c, /\.page-title>\.primary,[^{]*\{[^}]*font-size:12px/);
  assert.match(r11c, /\.page-title\{align-items:stretch;flex-direction:column\}/);
});

check("form actions stack without losing cancel or submit", () => {
  const css = read("app/globals.css");
  const r11c = css.match(/\/\* UX remodel R11C[\s\S]*$/)?.[0] || "";
  assert.match(r11c, /\.form-actions\{display:grid;grid-template-columns:1fr 1fr\}/);
  assert.match(r11c, /\.form-actions \.primary,[^{]*\.form-actions \.secondary\{width:100%\}/);
});

console.log(`R11C verifier passed (${passed} checks).`);
