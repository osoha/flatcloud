import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { allocateCostAmount, allocationBasisPoints, shareBasisPointsFromPercent, validateCustomShares } from "../lib/property-cost-allocations";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

check("equal and area methods always produce exactly 100 percent", () => {
  const equal = allocationBasisPoints("equal", [{ id: "a", areaM2: 40 }, { id: "b", areaM2: 60 }, { id: "c", areaM2: 50 }]);
  assert.equal(equal.reduce((sum, row) => sum + row.shareBasisPoints, 0), 10_000);
  assert.deepEqual(equal.map((row) => row.shareBasisPoints), [3334, 3333, 3333]);
  const area = allocationBasisPoints("area", [{ id: "a", areaM2: 40 }, { id: "b", areaM2: 60 }]);
  assert.deepEqual(area.map((row) => row.shareBasisPoints), [4000, 6000]);
});

check("amount rounding preserves the exact source cost", () => {
  const result = allocateCostAmount(1_850_001, [{ unitId: "a", shareBasisPoints: 6000 }, { unitId: "b", shareBasisPoints: 4000 }]);
  assert.deepEqual(result.map((row) => row.amountCents), [1_110_001, 740_000]);
  assert.equal(result.reduce((sum, row) => sum + row.amountCents, 0), 1_850_001);
});

check("custom percentages are strict and must total 100 percent", () => {
  assert.equal(shareBasisPointsFromPercent("33,25"), 3325);
  assert.throws(() => shareBasisPointsFromPercent("1.234"), /nejvýše dvěma/);
  assert.throws(() => validateCustomShares([{ unitId: "a", shareBasisPoints: 9999 }]), /přesně 100/);
});

check("area split refuses incomplete unit metadata", () => {
  assert.throws(() => allocationBasisPoints("area", [{ id: "a", areaM2: null }]), /doplňte výměru/);
});

check("schema and migration keep explicit auditable shares and exact amounts", () => {
  const schema = read("prisma/schema.prisma");
  for (const marker of ["model PropertyCostAllocation", "shareBasisPoints Int", "amountCents      Int", "allocations    PropertyCostAllocation[]", "assetCostAllocations    PropertyCostAllocation[]"]) assert.match(schema, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
  const migration = read("prisma/migrations/20260904230000_asset_cost_allocations/migration.sql");
  assert.doesNotMatch(migration, /(?:^|\n)\s*(?:DROP|DELETE|TRUNCATE|UPDATE)\b/im);
  assert.match(migration, /shareBasisPoints_check/);
  assert.match(migration, /INSERT INTO "PropertyCostAllocation"/);
  assert.match(migration, /WHERE "unitId" IS NOT NULL/);
});

check("allocation write is scoped, serializable and audited", () => {
  const route = read("app/api/properties/[id]/costs/[costId]/allocations/route.ts");
  assert.match(route, /requireManagedProperty/);
  assert.match(route, /id: costId, propertyId: id/);
  assert.match(route, /serializableTransaction/);
  assert.match(route, /PROPERTY_COST_ALLOCATED/);
  assert.match(route, /PROPERTY_COST_ALLOCATION_CLEARED/);
});

check("cost detail explains allocation and offers three understandable methods", () => {
  const detail = read("app/nemovitosti/[id]/naklady/[costId]/page.tsx");
  for (const marker of ["Rozdělení nákladu na jednotky", "Rozdělit rovnoměrně", "Rozdělit podle plochy", "Vlastní podíly", "Součet musí být přesně 100 %", "Vrátit na celý objekt"]) assert.match(detail, new RegExp(marker));
  assert.match(read("app/nemovitosti/[id]/[section]/page.tsx"), /propertyCostScopeLabel/);
});

check("methodology, browser smoke and CI cover R3D", () => {
  assert.match(read("lib/methodology.ts"), /Společný náklad rozdělte rovnoměrně, podle plochy nebo vlastními podíly/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /správce rozdělí společný náklad mezi více jednotek/);
  assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r3d/);
});

console.log(`UX remodel R3D ověřen: ${count} kontrol.`);
