import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

check("cost schema can identify a unit and linked source documents", () => {
  const schema = read("prisma/schema.prisma");
  for (const marker of ["documentNumber String?", "unit        Unit?", "documents   Document[]", "propertyCostId", "propertyCost                 PropertyCost?"]) assert.match(schema, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
});

check("R3C migration is additive and keeps removed parents non-destructive", () => {
  const migration = read("prisma/migrations/20260904210000_asset_cost_sources/migration.sql");
  assert.doesNotMatch(migration, /(?:^|\n)\s*(?:DROP|DELETE|TRUNCATE|UPDATE)\b/im);
  assert.match(migration, /ADD COLUMN "unitId"/);
  assert.match(migration, /ADD COLUMN "propertyCostId"/);
  assert.match(migration, /ON DELETE SET NULL/);
});

check("cost creation validates that its unit belongs to the property", () => {
  const route = read("app/api/properties/[id]/costs/route.ts");
  assert.match(route, /id: unitId, propertyId: id/);
  assert.match(route, /Vybraná jednotka do této nemovitosti nepatří/);
  assert.match(route, /documentNumber: text\(form, "documentNumber"\)/);
  assert.match(route, /PROPERTY_COST_CREATED/);
});

check("document authorization derives scope from the cost and its optional unit", () => {
  const service = read("lib/documents/service.ts");
  const access = read("lib/documents/access.ts");
  assert.match(service, /propertyCostId/);
  assert.match(service, /resolved\.cost\.unitId/);
  assert.match(service, /prisma\.propertyCost\.findUnique/);
  assert.match(access, /propertyCost:\{unit:ownUnit\}/);
});

check("upload and batch persistence retain the cost context", () => {
  for (const file of ["components/documents/DocumentUploadForm.tsx", "app/api/documents/upload/route.ts", "lib/documents/batch-service.ts"]) assert.match(read(file), /propertyCostId/);
});

check("cost detail exposes accounting context and source attachments", () => {
  const detail = read("app/nemovitosti/[id]/naklady/[costId]/page.tsx");
  for (const marker of ["Účetní kontext", "Rozsah nákladu", "Číslo dokladu", "Účetní podklady", "DocumentUploadForm", "DocumentAttachments"]) assert.match(detail, new RegExp(marker));
  assert.match(detail, /id: costId, propertyId: id/);
});

check("finance registry makes the cost scope and missing source actionable", () => {
  const page = read("app/nemovitosti/[id]/[section]/page.tsx");
  for (const marker of ["Rozsah nákladu", "Celý objekt", "Číslo dokladu", "Doplnit podklad"]) assert.match(page, new RegExp(marker));
  assert.ok(page.includes('href={`/nemovitosti/${id}/naklady/${cost.id}`}'));
});

check("methodology, browser smoke and CI cover R3C", () => {
  assert.match(read("lib/methodology.ts"), /Ke skutečné částce připojte číslo a soubor účetního podkladu/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /správce přiřadí náklad jednotce a dohledá účetní podklad/);
  assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r3c/);
});

console.log(`UX remodel R3C ověřen: ${count} kontrol.`);
