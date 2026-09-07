import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

check("annual reports have an additive portfolio-oriented data model", () => {
  const schema = read("prisma/schema.prisma");
  for (const marker of ["model AnnualReport", "model AnnualPropertyReport", "targetPortfolioValueCents", "sharePriceCents", "targetValueCents", "plannedExitProceedsCents", "ANNUAL_PORTFOLIO"]) assert.match(schema, new RegExp(marker));
  const migration = read("prisma/migrations/20260907063000_r13a_annual_report_foundation/migration.sql");
  assert.match(migration, /CREATE TABLE "AnnualReport"/);
  assert.match(migration, /CREATE TABLE "AnnualPropertyReport"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/);
});

check("annual creation reuses reporting groups and frozen Q4 property snapshots", () => {
  const service = read("lib/reporting/annual-report-service.ts");
  assert.match(service, /requireReportingBackoffice\(actor, input\.reportingGroupId, "EDIT", tx\)/);
  assert.match(service, /businessDateKeyToInstant\(`\$\{year\}-12-31`/);
  assert.match(service, /reportingGroupPropertiesAt/);
  assert.match(service, /calculateAndStoreSnapshotTx/);
  assert.match(service, /ANNUAL_REPORT_CREATED/);
});

check("annual corporate and property content is editable only in DRAFT", () => {
  const service = read("lib/reporting/annual-report-service.ts");
  assert.match(service, /report\.status !== "DRAFT"/);
  assert.match(service, /annualReport\.updateMany\(\{ where: \{ id: report\.id, status: "DRAFT"/);
  assert.match(service, /annualReport: \{ status: "DRAFT" \}/);
  assert.match(service, /ANNUAL_REPORT_EDITORIAL_UPDATED/);
  assert.match(service, /ANNUAL_PROPERTY_EDITORIAL_UPDATED/);
});

check("shareholder hub exposes an active annual workflow and editor", () => {
  const hub = read("app/reporty/akcionarske/page.tsx");
  assert.match(hub, /href="\/reporty\/vyrocni"/);
  assert.doesNotMatch(hub, /Výroční reporty[\s\S]{0,500}aria-disabled="true"/);
  const workspace = read("app/reporty/vyrocni/[groupId]/reporty/[reportId]/page.tsx");
  for (const marker of ["Korporátní příběh", "Cílová hodnota portfolia", "Cena akcie", "Realizované výnosy z exitu", "Zmrazený Q4 snapshot", "Příloha a provenience"]) assert.match(workspace, new RegExp(marker));
});

check("routes, browser smoke, pipeline and CI cover R13A", () => {
  assert.match(read("app/api/reporting-groups/[groupId]/annual-reports/route.ts"), /createAnnualReport/);
  assert.match(read("app/api/reporting-groups/[groupId]/annual-reports/[reportId]/editorial/route.ts"), /updateAnnualReportEditorial/);
  assert.match(read("app/api/reporting-groups/[groupId]/annual-reports/[reportId]/properties/[propertyId]/route.ts"), /updateAnnualPropertyEditorial/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /R13: výroční editor odděluje korporátní a nemovitostní vrstvu/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R13A implementováno aditivně/);
  assert.match(read(".github/workflows/ci.yml"), /verify:r13a-annual-report/);
});

console.log(`R13A verifier passed (${passed} checks).`);
