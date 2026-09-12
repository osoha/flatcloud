import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateBudgetSummary, normalizeFinanceYear } from "../lib/asset-finance";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

check("schema separates approved budgets and immutable loan snapshots", () => {
  const schema = read("prisma/schema.prisma");
  for (const marker of ["model PropertyBudgetLine", "model PropertyLoanSnapshot", "snapshots                 PropertyLoanSnapshot[]", "budgets                           PropertyBudgetLine[]"]) assert.match(schema, new RegExp(marker.replace(/[\[\]]/g, "\\$&")));
});

check("R3B migration is additive, constrained and backfills an opening snapshot", () => {
  const migration = read("prisma/migrations/20260904190000_asset_finance_history/migration.sql");
  assert.doesNotMatch(migration, /(?:^|\n)\s*(?:DROP|DELETE|TRUNCATE|UPDATE)\b/im);
  assert.match(migration, /PropertyBudgetLine_year_check/);
  assert.match(migration, /PropertyLoanSnapshot_annualInterestRateBps_check/);
  assert.match(migration, /INSERT INTO "PropertyLoanSnapshot"/);
  assert.match(migration, /FROM "PropertyLoan"/);
});

check("budget summary never merges approved budget with commitments or actuals", () => {
  const result = calculateBudgetSummary(
    [{ year: 2026, kind: "OPEX", category: "MAINTENANCE", amountCents: 100_000 }, { year: 2025, kind: "CAPEX", category: "CONSTRUCTION", amountCents: 900_000 }],
    [
      { kind: "OPEX", category: "MAINTENANCE", status: "PLANNED", amountCents: 99_000, effectiveAt: new Date("2026-01-01") },
      { kind: "OPEX", category: "MAINTENANCE", status: "COMMITTED", amountCents: 20_000, effectiveAt: new Date("2026-02-01") },
      { kind: "OPEX", category: "MAINTENANCE", status: "ACTUAL", amountCents: 30_000, effectiveAt: new Date("2026-03-01") },
    ],
    2026,
  );
  assert.deepEqual(result, { budgetCents: 100_000, committedCents: 20_000, actualCents: 30_000, remainingCents: 50_000 });
});

check("finance year parsing rejects ambiguous and out-of-range input", () => {
  assert.equal(normalizeFinanceYear("2026", 2025), 2026);
  assert.equal(normalizeFinanceYear("2026x", 2025), 2025);
  assert.equal(normalizeFinanceYear("1999", 2025), 2025);
  assert.equal(normalizeFinanceYear(undefined, 2025), 2025);
});

check("budget and loan history writes require managed property access and audit events", () => {
  for (const [file, action] of [
    ["app/api/properties/[id]/budgets/route.ts", "PROPERTY_BUDGET_LINE_CREATED"],
    ["app/api/properties/[id]/loans/[loanId]/snapshots/route.ts", "PROPERTY_LOAN_SNAPSHOT_CREATED"],
  ]) {
    const source = read(file);
    assert.match(source, /requireManagedProperty/);
    assert.match(source, new RegExp(action));
  }
});

check("loan snapshot route scopes the updated loan to its property", () => {
  const route = read("app/api/properties/[id]/loans/[loanId]/snapshots/route.ts");
  assert.match(route, /findFirst\(\{ where: \{ id: loanId, propertyId: id \} \}\)/);
  assert.match(route, /propertyLoanSnapshot\.create/);
  assert.match(route, /propertyLoan\.update/);
});

check("asset finance UI explains period, approved budget and immutable history", () => {
  const page = read("app/nemovitosti/[id]/[section]/page.tsx");
  for (const marker of ["Rozpočtové období", "Schválený rozpočet", "rozpočet − závazky − skutečnost", "Starší záznamy se nepřepisují", "Uložit stav do historie"]) assert.match(page, new RegExp(marker));
});

check("methodology, browser smoke and CI cover R3B", () => {
  assert.match(read("lib/methodology.ts"), /Nový zůstatek, sazbu a splátku úvěru vždy zapište s datem do historie/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /správce porovná rozpočet a zapíše nový stav úvěru/);
  assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r3b/);
});

console.log(`UX remodel R3B ověřen: ${count} kontrol.`);
