import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { contentLogoRect, coverNarrativeRect, reportCoverPeriodLabel, reportMasterLabel, reportPeriodLabel } from "../lib/reporting/presentation/report-design-parity";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let checks = 0;
const check = (name: string, test: () => void) => { test(); checks += 1; console.log(`✓ ${checks}. ${name}`); };

check("reference-style period and master labels stay canonical", () => {
  assert.equal(reportPeriodLabel(3, 2026), "3Q 2026");
  assert.equal(reportCoverPeriodLabel(3, 2026), "3Q / 2026");
  assert.equal(reportMasterLabel(3, 2026), "FlatCloud | Kvartální report | 3Q 2026");
});
check("content logo preserves the measured template frame", () => {
  const source = { x: .714, y: .028, width: .225, height: .058 };
  assert.deepEqual(contentLogoRect(source), source);
});
check("cover narrative gains a collision-free vertical field", () => {
  const rect = coverNarrativeRect({ x: .53, y: .38, width: .4, height: .12 });
  assert.equal(rect.height, .16);
  assert.ok(rect.y + rect.height <= .7);
});

const html = read("components/reporting/quarterly-property/QuarterlyPropertyReportDocument.tsx");
const pdf = read("lib/reporting/presentation/pdf/QuarterlyPropertyLandscapePdfDocument.tsx");
const preview = read("components/reporting/ReportDesignTemplatePreview.tsx");
const css = read("app/audit-polish.css");
check("HTML preview uses one cover stack and reference-style master chrome", () => {
  assert.match(html, /qpr-cover-title qpr-cover-stack/);
  assert.match(html, /reportMasterLabel/);
  assert.match(html, /qpr-page-number/);
  assert.doesNotMatch(html, /className="qpr-cover-period"/);
});
check("PDF mirrors the HTML hierarchy and adds real page numbers", () => {
  assert.match(pdf, /coverNarrativeRect/);
  assert.match(pdf, /reportMasterLabel/);
  assert.match(pdf, /render=\{\(\{ pageNumber \}\) => `\$\{pageNumber\}`\}/);
});
check("template preview mirrors production geometry", () => {
  assert.match(preview, /design-cover-stack/);
  assert.match(preview, /contentLogoRect/);
  assert.match(preview, /FlatCloud \| Kvartální report \| 3Q 2026/);
});
check("empty technical report occupies one deliberate frame", () => {
  assert.match(css, /\.qpr-technical-table>\.qpr-empty\{grid-column:1\/-1;grid-row:1\/-1/);
});

console.log(`R7C quarterly report parity verification passed: ${checks} checks.`);
