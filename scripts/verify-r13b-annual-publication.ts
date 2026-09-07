import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { annualReportMissingFields, assertAnnualReportTransitionAllowed } from "../lib/reporting/annual-report-service";
import type { FrozenAnnualReportPdfData } from "../lib/reporting/pdf/annual-report-pdf-data";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
async function check(name: string, run: () => void | Promise<void>) { await run(); passed += 1; console.log(`✓ ${name}`); }

async function main() {
await check("annual lifecycle enforces edit and admin boundaries", () => {
  assert.doesNotThrow(() => assertAnnualReportTransitionAllowed("DRAFT", "REVIEW", "EDIT"));
  assert.doesNotThrow(() => assertAnnualReportTransitionAllowed("REVIEW", "DRAFT", "ADMIN"));
  assert.doesNotThrow(() => assertAnnualReportTransitionAllowed("REVIEW", "PUBLISHED", "SUPER_ADMIN"));
  assert.throws(() => assertAnnualReportTransitionAllowed("REVIEW", "PUBLISHED", "EDIT"));
  assert.throws(() => assertAnnualReportTransitionAllowed("PUBLISHED", "DRAFT", "SUPER_ADMIN"), /immutable/);
});

await check("review completeness covers corporate, value, share and property layers", () => {
  const complete = {
    founderLetter: "Slovo", executiveSummary: "Shrnutí", investmentThesis: "Teze", valueCreationSummary: "Hodnota", outlook: "Výhled",
    grossAssetValueCents: BigInt(1), netAssetValueCents: BigInt(1), debtCents: BigInt(0), targetPortfolioValueCents: BigInt(1), issuedShares: 100, treasuryShares: 0, sharePriceCents: BigInt(1),
    propertyReports: [{ propertyNameSnapshot: "Dům", openingValueCents: BigInt(1), currentValueCents: BigInt(1), targetValueCents: BigInt(1), investmentCase: "Případ", valueCreationNarrative: "Tvorba", outlook: "Výhled", sourceNote: "Zdroj" }],
  };
  assert.deepEqual(annualReportMissingFields(complete), []);
  assert.match(annualReportMissingFields({ ...complete, sharePriceCents: null, propertyReports: [{ ...complete.propertyReports[0], sourceNote: null }] }).join(" · "), /Cena akcie.*Dům: zdroj hodnot/);
});

await check("review requires closed period, complete immutable scope and approved preview", () => {
  const service = read("lib/reporting/annual-report-service.ts");
  for (const marker of ["assertAnnualPeriodClosed", "assertAnnualScopeAndSnapshots", "annualReportMissingFields", "ANNUAL_REPORT_SUBMITTED_REVIEW", "ANNUAL_REPORT_PREVIEW_APPROVED", "Annual report PDF preview must be approved before publication", "ANNUAL_REPORT_PUBLISHED"]) assert.match(service, new RegExp(marker));
  assert.match(service, /where: \{ id: report\.id, status: "REVIEW" \}/);
});

await check("corrections are versioned clones without overwriting published output", () => {
  const service = read("lib/reporting/annual-report-service.ts");
  assert.match(service, /source\.status !== "PUBLISHED"/);
  assert.match(service, /const revision = source\.revision \+ 1/);
  assert.match(service, /status: "DRAFT"/);
  assert.match(service, /sourceReportId: source\.id/);
  assert.doesNotMatch(service.slice(service.indexOf("export async function createAnnualCorrectionRevision")), /publishedAssetId: source\.publishedAssetId/);
});

await check("annual PDF rendering is deterministic for identical frozen input", async () => {
  const { renderAnnualReportPdf } = await import("../lib/reporting/pdf/annual-report-pdf");
  const data: FrozenAnnualReportPdfData = {
    reportingGroupName: "FlatCloud test", year: 2025, revision: 1, asOfDate: new Date("2025-12-31T23:00:00.000Z"), founderLetter: "Slovo zakladatele", executiveSummary: "Shrnutí", investmentThesis: "Teze", valueCreationSummary: "Tvorba hodnoty", outlook: "Výhled", grossAssetValueCents: BigInt(100000000), netAssetValueCents: BigInt(70000000), debtCents: BigInt(30000000), targetPortfolioValueCents: BigInt(120000000), realizedExitProceedsCents: BigInt(0), plannedExitProceedsCents: BigInt(15000000), issuedShares: 1000, treasuryShares: 10, sharePriceCents: BigInt(7000000), properties: [{ propertyName: "Moskevská", propertyAddress: "Ústí nad Labem", openingValueCents: BigInt(50000000), currentValueCents: BigInt(60000000), targetValueCents: BigInt(75000000), realizedExitProceedsCents: BigInt(0), plannedExitProceedsCents: BigInt(0), plannedExitYear: 2027, investmentCase: "Investiční případ", valueCreationNarrative: "Tvorba hodnoty", outlook: "Milníky", sourceNote: "Interní valuace", snapshot: { revision: 1, source: "CALCULATED", schemaVersion: 1, calculatorVersion: "r13b-test", sourceNote: null, fingerprint: "a".repeat(64) } }],
  };
  const first = await renderAnnualReportPdf(data);
  const second = await renderAnnualReportPdf(data);
  assert.equal(Buffer.from(first).subarray(0, 4).toString(), "%PDF");
  assert.equal(createHash("sha256").update(first).digest("hex"), createHash("sha256").update(second).digest("hex"));
});

await check("preview, final asset and download routes remain internal and audited", () => {
  const asset = read("lib/reporting/annual-report-asset-service.ts");
  for (const marker of ["loadFrozenAnnualReportPdfData", "ANNUAL_REPORT_PUBLISHED_ASSET_GENERATED", "sha256", "publishedAssetId: null", "annualReportStoragePlacement"]) assert.match(asset, new RegExp(marker));
  const page = read("components/annual-report/AnnualReportReviewExport.tsx");
  for (const marker of ["Stáhnout PDF náhled", "Potvrdit kontrolu PDF", "Interně publikovat revizi", "Vytvořit opravnou revizi", "Veřejná distribuce není součástí"]) assert.match(page, new RegExp(marker));
  for (const path of ["preview", "generate", "download"]) assert.ok(readFileSync(`app/api/reporting-groups/[groupId]/annual-reports/[reportId]/assets/${path}/route.ts`, "utf8"));
});

await check("R13B is wired into browser smoke, CI and the pipeline", () => {
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /R13B: výroční report prochází kontrolou a verzovanou publikací/);
  assert.match(read(".github/workflows/ci.yml"), /verify:r13b-annual-publication/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R13B implementováno/);
});

console.log(`R13B verifier passed (${passed} checks).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
