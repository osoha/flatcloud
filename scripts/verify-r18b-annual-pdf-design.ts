import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import type { FrozenAnnualReportPdfData } from "../lib/reporting/pdf/annual-report-pdf-data";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
async function check(name: string, run: () => void | Promise<void>) { await run(); passed += 1; console.log(`✓ ${name}`); }

async function main() {
  await check("annual output follows the FlatCloud 13:9 master", () => {
    const pdf = read("lib/reporting/pdf/annual-report-pdf.tsx");
    for (const marker of ["ANNUAL_REPORT_PAGE_SIZE = { width: 780, height: 540 }", "FlatCloudRalewayAnnual", "REPORT_PDF_CONTENT_HEADER_PATH", "REPORT_PDF_LOGO_WHITE_PATH", "ANNUAL_REPORT_COVER_PATH", "Portfolio nemovitostí", "Důvěrný dokument"]) assert.match(pdf, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(pdf, /size="A4"/);
  });

  await check("visible shareholder pages do not expose renderer or snapshot internals", () => {
    const pdf = read("lib/reporting/pdf/annual-report-pdf.tsx");
    for (const forbidden of ["Fingerprint snapshotu", "schéma", "kalkulátor", "PDF renderer:", "revize ${data.revision}"]) assert.doesNotMatch(pdf, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(pdf, /data\.reportingGroupName/);
  });

  await check("empty and populated states render as intentional pages", async () => {
    const { renderAnnualReportPdf } = await import("../lib/reporting/pdf/annual-report-pdf");
    const data: FrozenAnnualReportPdfData = { reportingGroupName: "AGT-INTERNAL", year: 2025, revision: 1, asOfDate: new Date("2025-12-31T12:00:00Z"), founderLetter: null, executiveSummary: null, investmentThesis: null, valueCreationSummary: null, outlook: null, grossAssetValueCents: null, netAssetValueCents: null, debtCents: null, targetPortfolioValueCents: null, realizedExitProceedsCents: null, plannedExitProceedsCents: null, issuedShares: null, treasuryShares: null, sharePriceCents: null, properties: [{ propertyName: "Moskevská", propertyAddress: "Moskevská 18", openingValueCents: null, currentValueCents: null, targetValueCents: null, realizedExitProceedsCents: null, plannedExitProceedsCents: null, plannedExitYear: null, investmentCase: null, valueCreationNarrative: null, outlook: null, sourceNote: null, snapshot: { revision: 1, source: "CALCULATED", schemaVersion: 1, calculatorVersion: "internal", sourceNote: null, fingerprint: "a".repeat(64) } }] };
    const bytes = await renderAnnualReportPdf(data);
    const document = await PDFDocument.load(bytes);
    assert.equal(document.getPageCount(), 7);
    for (const page of document.getPages()) assert.deepEqual(page.getSize(), { width: 780, height: 540 });
  });

  await check("R18B assets and release gate are present", () => {
    for (const path of ["public/annual-report-cover.jpg", "public/flatcloud-quarterly-page-header.png", "public/fonts/Raleway-Regular.ttf", "public/fonts/Raleway-Bold.ttf"]) assert.ok(readFileSync(path).length > 0);
    assert.match(read(".github/workflows/ci.yml"), /verify:r18b-annual-pdf-design/);
    assert.match(read("UX-REMODEL-PIPELINE.md"), /R18B implementováno/);
  });

  console.log(`R18B verifier passed (${passed} checks).`);
}

main().catch((error) => { console.error(error); process.exit(1); });
