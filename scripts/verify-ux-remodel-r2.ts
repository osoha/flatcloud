import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { consolidationBasisPoints, consolidationLabel } from "../lib/ownership-scope";
import { calculateFlatcloudAssetScope, consolidatedAmount } from "../lib/reporting/flatcloud-asset-scope";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

check("owner affiliation, management scope and consolidation are independent fields", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /enum OwnerAffiliation/);
  assert.match(schema, /enum PropertyManagementScope/);
  assert.match(schema, /affiliation\s+OwnerAffiliation/);
  assert.match(schema, /managementScope\s+PropertyManagementScope/);
  assert.match(schema, /flatcloudConsolidationBasisPoints\s+Int\?/);
});

check("migration is additive and existing assets remain unclassified", () => {
  const migration = read("prisma/migrations/20260904100000_ux_remodel_owner_scopes/migration.sql");
  assert.doesNotMatch(migration, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i);
  assert.match(migration, /DEFAULT 'UNCLASSIFIED'/);
  assert.match(migration, /flatcloudConsolidationBasisPoints" INTEGER;/);
  assert.match(migration, /BETWEEN 0 AND 10000/);
});

check("consolidation parser fails closed outside zero to one hundred percent", () => {
  assert.equal(consolidationBasisPoints(null), null);
  assert.equal(consolidationBasisPoints(""), null);
  assert.equal(consolidationBasisPoints("0"), 0);
  assert.equal(consolidationBasisPoints("12,5"), 1250);
  assert.equal(consolidationBasisPoints("100"), 10000);
  assert.throws(() => consolidationBasisPoints("-1"));
  assert.throws(() => consolidationBasisPoints("100.01"));
  assert.throws(() => consolidationBasisPoints("není číslo"));
});

check("classification copy distinguishes unclassified, external and consolidated assets", () => {
  assert.equal(consolidationLabel(null), "Nezařazeno");
  assert.equal(consolidationLabel(0), "Externí · 0 %");
  assert.equal(consolidationLabel(10000), "FlatCloud · 100 %");
});

check("administration writes classification without changing permission routes", () => {
  for (const file of ["app/api/owners/route.ts", "app/api/owners/[id]/route.ts"]) assert.match(read(file), /safeOwnerAffiliation/);
  for (const file of ["app/api/properties/route.ts", "app/api/properties/[id]/route.ts"]) {
    const source = read(file);
    assert.match(source, /safePropertyManagementScope/);
    assert.match(source, /consolidationBasisPoints/);
  }
  const migration = read("prisma/migrations/20260904100000_ux_remodel_owner_scopes/migration.sql");
  assert.doesNotMatch(migration, /UserProperty|UserUnit|permission/i);
});

check("portfolio exposes explicit FlatCloud and external scopes", () => {
  const picker = read("components/PortfolioScopePicker.tsx");
  const portfolio = read("app/portfolio/page.tsx");
  assert.match(picker, /FlatCloud Group/);
  assert.match(picker, /Externí správa/);
  assert.match(picker, /Nezařazené/);
  assert.match(portfolio, /KPI FlatCloud/);
  assert.match(portfolio, /consolidationLabel/);
});

check("asset scope excludes external and unclassified properties", () => {
  const rows = [
    { property: { flatcloudConsolidationBasisPoints: 10000 }, rentRoll: { monthlyNetRentCents: 100_000 }, collections: { overdueDebtCents: 10_000 }, deposits: { heldPrincipalCents: 30_000 } },
    { property: { flatcloudConsolidationBasisPoints: 2500 }, rentRoll: { monthlyNetRentCents: 80_000 }, collections: { overdueDebtCents: 8_000 }, deposits: { heldPrincipalCents: 20_000 } },
    { property: { flatcloudConsolidationBasisPoints: 0 }, rentRoll: { monthlyNetRentCents: 500_000 }, collections: { overdueDebtCents: 90_000 }, deposits: { heldPrincipalCents: 60_000 } },
    { property: { flatcloudConsolidationBasisPoints: null }, rentRoll: { monthlyNetRentCents: 700_000 }, collections: { overdueDebtCents: 120_000 }, deposits: { heldPrincipalCents: 70_000 } },
  ];
  const result = calculateFlatcloudAssetScope(rows);
  assert.equal(result.includedCount, 2);
  assert.equal(result.externalCount, 1);
  assert.equal(result.unclassifiedCount, 1);
  assert.equal(result.partialCount, 1);
  assert.equal(result.grossMonthlyNetRentCents, 180_000);
  assert.equal(result.consolidatedMonthlyNetRentCents, 120_000);
  assert.equal(result.consolidatedOverdueDebtCents, 12_000);
  assert.equal(result.consolidatedHeldDepositCents, 35_000);
  assert.equal(consolidatedAmount(500_000, 0), 0);
  assert.equal(consolidatedAmount(500_000, null), 0);
});

check("asset report is restricted to full portfolio access in the UI", () => {
  const report = read("app/reporty/page.tsx");
  assert.match(report, /requestedView === "asset" && !fullAccess/);
  assert.match(report, /view==="asset"&&fullAccess/);
  assert.match(report, /Externí a nezařazené nemovitosti/);
});

console.log(`UX remodel R2 ověřen: ${count} kontrol.`);
