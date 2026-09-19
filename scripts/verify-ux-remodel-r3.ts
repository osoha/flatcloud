import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { basisPointsFromPercent, calculateAssetFinanceSummary } from "../lib/asset-finance";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

check("asset finance schema separates costs and loans", () => {
  const schema = read("prisma/schema.prisma");
  for (const marker of ["model PropertyCost", "model PropertyLoan", "enum PropertyCostKind", "enum PropertyCostStatus", "enum LoanRateType"]) assert.match(schema, new RegExp(marker));
});

check("asset finance migration is additive and constrained", () => {
  const migration = read("prisma/migrations/20260904150000_asset_finance_foundation/migration.sql");
  assert.doesNotMatch(migration, /(?:^|\n)\s*(?:DROP|DELETE|TRUNCATE|UPDATE)\b/im);
  assert.match(migration, /PropertyCost_amountCents_check/);
  assert.match(migration, /PropertyLoan_annualInterestRateBps_check/);
  assert.match(migration, /ON DELETE CASCADE/);
});

check("interest parsing is conservative", () => {
  assert.equal(basisPointsFromPercent("4,89"), 489);
  assert.equal(basisPointsFromPercent("0"), 0);
  assert.equal(basisPointsFromPercent("100"), 10_000);
  assert.throws(() => basisPointsFromPercent("4.891"));
  assert.throws(() => basisPointsFromPercent("-1"));
  assert.throws(() => basisPointsFromPercent("101"));
});

check("summary keeps plan, actual OPEX and actual CAPEX distinct", () => {
  const result = calculateAssetFinanceSummary([
    { kind: "OPEX", status: "ACTUAL", amountCents: 10_000, effectiveAt: new Date("2026-02-01") },
    { kind: "CAPEX", status: "ACTUAL", amountCents: 20_000, effectiveAt: new Date("2026-03-01") },
    { kind: "CAPEX", status: "PLANNED", amountCents: 30_000, effectiveAt: new Date("2026-04-01") },
    { kind: "OPEX", status: "COMMITTED", amountCents: 40_000, effectiveAt: new Date("2026-05-01") },
    { kind: "OPEX", status: "ACTUAL", amountCents: 99_000, effectiveAt: new Date("2025-05-01") },
  ], [{ active: true, outstandingPrincipalCents: 1_000_000, monthlyDebtServiceCents: 12_000 }, { active: false, outstandingPrincipalCents: 500_000, monthlyDebtServiceCents: 6_000 }], 2026);
  assert.deepEqual(result, { actualOpexCents: 10_000, actualCapexCents: 20_000, plannedCents: 70_000, outstandingPrincipalCents: 1_000_000, monthlyDebtServiceCents: 12_000 });
});

check("property UI names asset finance explicitly and preserves rent finance location", () => {
  const page = read("app/nemovitosti/[id]/[section]/page.tsx");
  const nav = read("components/PropertySubnav.tsx");
  assert.match(nav, /Náklady a úvěry/);
  assert.match(page, /Finance objektu, ne nájemní smlouvy/);
  assert.match(page, /Nájemné, služby, předpisy, úhrady a kauce/);
  for (const marker of ["OPEX skutečnost", "CAPEX skutečnost", "Aktuální jistina", "Měsíční dluhová služba"]) assert.match(page, new RegExp(marker));
});

check("cost and loan creation require managed property access and write audit events", () => {
  for (const [file, action] of [["app/api/properties/[id]/costs/route.ts", "PROPERTY_COST_CREATED"], ["app/api/properties/[id]/loans/route.ts", "PROPERTY_LOAN_CREATED"]]) {
    const source = read(file);
    assert.match(source, /requireManagedProperty/);
    assert.match(source, new RegExp(action));
  }
});

check("methodology and browser smoke cover asset finance", () => {
  assert.match(read("lib/methodology.ts"), /naklady-a-uvery/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /asset finance odděluje náklady a úvěry od nájemních financí/);
  assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r3/);
});

console.log(`UX remodel R3 ověřen: ${count} kontrol.`);
