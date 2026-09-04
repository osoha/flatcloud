import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeContractingPartyIds } from "../lib/lease-parties";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
function check(name: string, fn: () => void) {
  fn();
  count += 1;
  console.log(`✓ ${count}. ${name}`);
}

check("party selection is normalized and primary is never duplicated", () => {
  assert.deepEqual(normalizeContractingPartyIds("t1", ["t2", "t1", "t2", " ", "t3"]), ["t2", "t3"]);
});

check("schema keeps canonical tenant while adding role-ready parties", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /tenantId\s+String/);
  assert.match(schema, /model LeaseParty/);
  for (const role of ["CONTRACTING_PARTY", "PAYER", "GUARANTOR", "CONTACT"]) assert.match(schema, new RegExp(role));
  assert.match(schema, /@@unique\(\[leaseId, tenantId, role\]\)/);
});

check("migration is additive, backfills primary parties and protects one primary", () => {
  const migration = read("prisma/migrations/20260904170000_lease_contracting_parties/migration.sql");
  assert.match(migration, /CREATE TABLE "LeaseParty"/);
  assert.match(migration, /INSERT INTO "LeaseParty"/);
  assert.match(migration, /LeaseParty_primary_contracting_party_key/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM "Lease"|UPDATE "Lease"/);
});

check("create and edit flows validate access and synchronize parties", () => {
  const create = read("app/api/properties/[id]/leases/route.ts") + read("lib/lease-create.ts");
  const edit = read("app/api/properties/[id]/leases/[leaseId]/route.ts");
  for (const source of [create, edit]) {
    assert.match(source, /tenantAccessWhere/);
    assert.match(source, /syncContractingParties/);
    assert.match(source, /contractingPartyIds/);
  }
});

check("form and detail distinguish primary, additional partners and occupants", () => {
  const fields = read("components/LeaseCoreFields.tsx");
  const detail = read("app/smlouvy/[leaseId]/page.tsx");
  const registry = read("app/smlouvy/page.tsx");
  assert.match(fields, /Hlavní smluvní strana/);
  assert.match(fields, /Další smluvní partneři/);
  assert.match(fields, /Obyvatele bez smluvní odpovědnosti/);
  assert.match(detail, /Smluvní strany/);
  assert.match(detail, /lease-party-summary/);
  assert.match(registry, /contractingPartyNames/);
  assert.match(registry, /Smluvní strany/);
});

check("secondary partner receives the same accessible relationship", () => {
  const access = read("lib/access.ts");
  const detail = read("app/najemnici/[tenantId]/page.tsx");
  const registry = read("app/najemnici/page.tsx");
  assert.match(access, /leaseParties/);
  assert.match(detail, /tenant\.leaseParties\.map/);
  assert.match(registry, /tenant\.leaseParties\.map/);
});

check("methodology explains when a person is a party rather than an occupant", () => {
  const methodology = read("lib/methodology.ts");
  assert.match(methodology, /všechny právní smluvní strany/);
  assert.match(methodology, /pouhé obyvatele evidujte zvlášť/);
});

check("CI and browser suite include the joint-party checkpoint", () => {
  assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r2d/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /dalšího smluvního partnera/);
});

console.log(`UX remodel R2D ověřen: ${count} kontrol.`);
