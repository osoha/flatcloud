import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

check("editor does not hard-code A4 for every template", () => {
  const workspace = read("components/quarterly-report-workspace/QuarterlyReportPropertyWorkspace.tsx");
  assert.doesNotMatch(workspace, /ve formátu A4 na šířku/);
  assert.match(workspace, /v jejím nativním formátu/);
});

check("preview exposes the actual active template format", () => {
  const page = read("app/reporty/kvartalni/[groupId]/reporty/[reportId]/nahled/[propertyId]/page.tsx");
  assert.match(page, /config\.page\.format === "FLATCLOUD_13X9"/);
  assert.match(page, /"FlatCloud 13:9" : "A4 na šířku"/);
  assert.match(page, /qpr-format-badge/);
  assert.match(page, /Pro tisk a kontrolu rozměrů použijte PDF export/);
});

check("preview export actions use a responsive shared style", () => {
  const css = read("app/globals.css");
  assert.match(css, /\/\* UX remodel R11D[\s\S]*\.qpr-preview-actions\{display:grid/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.qpr-preview-actions\{justify-items:start;text-align:left\}/);
});

console.log(`R11D verifier passed (${passed} checks).`);
