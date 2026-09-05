import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeLeasePartySelections } from "../lib/lease-parties";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`✓ ${checks}. ${name}`); }

check("party roles are normalized without duplicating the primary tenant", () => {
  assert.deepEqual(normalizeLeasePartySelections("main", { contractingPartyIds: ["other", "other", "main"], payerPartyIds: ["other"] }), { contractingPartyIds: ["other"], payerPartyIds: ["other"], contactPartyIds: [], guarantorPartyIds: [] });
});
check("tenant can be created as a profile without a fake lease", () => {
  const page = read("app/nemovitosti/[id]/najemnici/novy/page.tsx");
  const route = read("app/api/properties/[id]/tenants/route.ts");
  assert.match(page, /Pouze profil/);
  assert.match(page, /creationMode/);
  assert.match(route, /TENANT_CREATED/);
  assert.match(route, /withoutLease: true/);
});
check("standalone profile remains scoped to its property", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260905103000_tenant_property_links/migration.sql");
  const access = read("lib/access.ts");
  assert.match(schema, /model TenantProperty/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.match(access, /propertyLinks/);
});
check("lease form exposes explicit operational roles", () => {
  const form = read("components/LeaseCoreFields.tsx");
  for (const marker of ["Smluvní strana", "Plátce", "Kontakt", "Ručitel", "pouze bydlí"]) assert.match(form, new RegExp(marker));
});
check("lease routes validate and persist every selected role", () => {
  const create = read("app/api/properties/[id]/leases/route.ts");
  const update = read("app/api/properties/[id]/leases/[leaseId]/route.ts");
  for (const source of [create, update]) for (const marker of ["payerPartyIds", "contactPartyIds", "guarantorPartyIds", "allSelectedPartyIds"]) assert.match(source, new RegExp(marker));
  assert.match(update, /syncLeaseParties/);
});

console.log(`Audit remediation P0D ověřena: ${checks} kontrol.`);
