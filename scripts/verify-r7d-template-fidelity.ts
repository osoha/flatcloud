import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { flatCloudQuarterly2026Config, reportDesignTemplateConfigSchema } from "../lib/reporting/design-template-schema";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let checks = 0;
const check = (name: string, test: () => void) => { test(); checks += 1; console.log(`✓ ${checks}. ${name}`); };

const html = read("components/reporting/quarterly-property/QuarterlyPropertyReportDocument.tsx");
const pdf = read("lib/reporting/presentation/pdf/QuarterlyPropertyLandscapePdfDocument.tsx");
const assets = read("lib/reporting/presentation/pdf/quarterly-property-pdf-assets.ts");
const preview = read("components/reporting/ReportDesignTemplatePreview.tsx");
const css = read("app/audit-polish.css");
const migration = read("prisma/migrations/20260905193000_quarterly_template_fidelity/migration.sql");

check("template schema accepts the measured 13:9 FlatCloud format", () => {
  assert.equal(reportDesignTemplateConfigSchema.parse(flatCloudQuarterly2026Config).page.format, "FLATCLOUD_13X9");
});
check("page ratio matches the 10.833 by 7.5 inch source deck", () => {
  assert.equal(flatCloudQuarterly2026Config.page.format, "FLATCLOUD_13X9");
  assert.match(pdf, /FLATCLOUD_PAGE_WIDTH = 780/);
  assert.match(pdf, /FLATCLOUD_PAGE_HEIGHT = 540/);
  assert.match(css, /275\.1667mm!important;height:190\.5mm/);
});
check("brand colors match the source background asset", () => {
  assert.equal(flatCloudQuarterly2026Config.brand.primaryDark, "#26639F");
  assert.equal(flatCloudQuarterly2026Config.brand.primaryLight, "#CADDF2");
  assert.ok(fs.existsSync(path.join(root, "public", "flatcloud-quarterly-page-header.png")));
  assert.match(pdf, /flatcloud-quarterly-page-header\.png/);
});
check("header rectangles match the 1040 by 720 source slide", () => {
  assert.deepEqual(flatCloudQuarterly2026Config.contentHeader.logoRect, { x: .714, y: .028, width: .225, height: .058 });
  assert.deepEqual(flatCloudQuarterly2026Config.contentHeader.reportLabelRect, { x: .035, y: .045, width: .5, height: .024 });
  assert.deepEqual(flatCloudQuarterly2026Config.contentHeader.propertyTitleRect, { x: .035, y: .084, width: .585, height: .078 });
});
check("content pages use the authentic colored logo while cover stays white", () => {
  assert.match(html, /qpr-content-logo[\s\S]*flatcloud-logo-report\.png/);
  assert.match(html, /qpr-cover-logo[\s\S]*flatcloud-logo-white\.png/);
  assert.match(preview, /content-logo[\s\S]*flatcloud-logo-report\.png/);
  assert.match(assets, /contentLogoPath[\s\S]*flatcloud-logo-report\.png/);
});
check("overview follows the compact PPTX hierarchy", () => {
  assert.match(html, /<h2>Komentář/);
  assert.doesNotMatch(html, /Komentář managementu|qpr-kicker|statusLabels/);
  assert.doesNotMatch(pdf, /Komentář managementu|styles\.kicker/);
});
check("technical, valuation and trend pages do not add unreferenced section titles", () => {
  assert.doesNotMatch(html, /role="TECHNICAL" title=|role="VALUATION" title=|role="TRENDS" title="Vývoj/);
  assert.doesNotMatch(pdf, /PageTitle title="Technický stav"|PageTitle title="Ocenění"|PageTitle title="Vývoj hlavních ukazatelů"/);
});
check("footer is unruled and preserves source casing", () => {
  assert.match(css, /\.qpr-footer\{[^}]*border:0[^}]*text-transform:none/);
  assert.match(css, /\.qpr-footer\{[^}]*top:var\(--qpr-footer-top\)!important[^}]*bottom:auto!important/);
  assert.match(html, /footerRect\(config\.footer\)/);
  assert.match(pdf, /footer: \{[^}]*fontSize: 7\.5/);
  assert.doesNotMatch(pdf, /footer: \{[^}]*borderTopWidth/);
});
check("system template migration updates already assigned reports", () => {
  assert.match(migration, /system-flatcloud-quarterly-2026-v1/);
  assert.match(migration, /FLATCLOUD_13X9/);
  assert.match(migration, /#CADDF2/);
});
check("cover follows the source title and period treatment", () => {
  assert.match(html, /Kvartální report - \{reportCoverPeriodLabel/);
  assert.doesNotMatch(html, /model\.property\.address<\/p>/);
  assert.match(pdf, /Kvartální report - \{reportCoverPeriodLabel/);
  assert.match(pdf, /public", "fonts", "Raleway-Bold\.ttf"/);
});

console.log(`R7D quarterly template fidelity verification passed: ${checks} checks.`);
