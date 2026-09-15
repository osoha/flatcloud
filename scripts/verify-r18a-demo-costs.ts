import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { allocateCostAmount, allocationBasisPoints } from "../lib/property-cost-allocations";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) { run(); passed += 1; console.log(`✓ ${name}`); }

check("demo finance covers all three base properties and closed-year history", () => {
  const seed = read("prisma/seed-cost-scenarios.ts");
  for (const marker of ["Moskevská", "Karla Aksamita", "Dům ve správě", "2024-12-31", "2025-12-31", "2026-08-31"]) assert.match(seed, new RegExp(marker));
  for (const category of ["MAINTENANCE", "REPAIRS", "UTILITIES", "INSURANCE", "TAX", "MANAGEMENT", "LEGAL", "FINANCING", "CONSTRUCTION", "EQUIPMENT"]) assert.match(seed, new RegExp(`category: \\"${category}\\"`));
  for (const status of ["ACTUAL", "COMMITTED", "PLANNED"]) assert.match(seed, new RegExp(`status: \\"${status}\\"`));
});

check("seed is idempotent and also runs against an existing sandbox", () => {
  const helper = read("prisma/seed-cost-scenarios.ts");
  assert.match(helper, /DEMO_ASSET_FINANCE_R18A_V1/);
  assert.match(helper, /propertyCost\.findFirst/);
  assert.match(helper, /propertyBudgetLine\.findFirst/);
  assert.match(helper, /propertyLoanSnapshot\.findFirst/);
  const seed = read("prisma/seed.ts");
  assert.equal((seed.match(/ensureDemoCostScenarios\(prisma, admin\.id\)/g) || []).length, 2);
});

check("allocation math preserves the complete cost amount", () => {
  const shares = allocationBasisPoints("area", [{ id: "a", areaM2: 40 }, { id: "b", areaM2: 55 }, { id: "c", areaM2: 65 }]);
  assert.equal(shares.reduce((sum, row) => sum + row.shareBasisPoints, 0), 10_000);
  assert.equal(allocateCostAmount(23_800_000, shares).reduce((sum, row) => sum + row.amountCents, 0), 23_800_000);
});

check("R18A is migration-free and included in the release gate", () => {
  assert.equal(readdirSync("prisma/migrations").filter((name) => /r18a|demo_cost/i.test(name)).length, 0);
  assert.match(read(".github/workflows/ci.yml"), /verify:r18a-demo-costs/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R18A implementováno/);
});

console.log(`R18A verifier passed (${passed} checks).`);
