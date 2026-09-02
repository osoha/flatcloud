import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { prisma } from "../lib/db";
import { formatCompoundUnitBusinessId, formatPropertyBusinessId, formatUnitBusinessId, isPropertyCode, isUnitCode, unitCodeCandidateFromLabel } from "../lib/business-identity";
import { proposedLeaseIdentity } from "../lib/variable-symbol";

const read = (path: string) => fs.readFileSync(path, "utf8");
const hash = (path: string) => createHash("sha256").update(read(path)).digest("hex");
let n = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>) { await fn(); console.log(`✓ ${++n}. ${name}`); }

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const marker = `identity-1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260902230000_identity_1/migration.sql");
  const propertyRoute = read("app/api/properties/[id]/route.ts");
  const unitRoute = read("app/api/properties/[id]/units/[unitId]/route.ts");
  const propertyForm = read("app/nemovitosti/[id]/upravit/page.tsx");
  const unitForm = read("app/nemovitosti/[id]/jednotky/[unitId]/upravit/page.tsx");
  const owner = await prisma.owner.create({ data: { name: marker } });
  const propertyIds: string[] = [];
  try {
    await check("Property.propertyCode exists", () => assert.match(schema, /propertyCode\s+String\s+@unique/));
    await check("Unit.unitCode exists", () => assert.match(schema, /unitCode\s+String/));
    await check("property format and range", () => { assert.ok(isPropertyCode("1001") && isPropertyCode("9999")); assert.ok(!isPropertyCode("1000") && !isPropertyCode("0001") && !isPropertyCode("10000")); });
    await check("unit format and range", () => { assert.ok(isUnitCode("001") && isUnitCode("999")); assert.ok(!isUnitCode("000") && !isUnitCode("1000") && !isUnitCode("12A")); });
    await check("display formatters are canonical", () => assert.deepEqual([formatPropertyBusinessId("1001"), formatUnitBusinessId("005"), formatCompoundUnitBusinessId("1001", "005")], ["P1001", "U005", "P1001-U005"]));
    await check("unit label parser preserves intuitive semantics", () => assert.deepEqual([unitCodeCandidateFromLabel("Byt 1"), unitCodeCandidateFromLabel("Jednotka č. 5"), unitCodeCandidateFromLabel("BJ 12 · 2+kk"), unitCodeCandidateFromLabel("Byt 1 / 2+kk")], ["001", "005", "012", "001"]));
    await check("odd and out-of-range labels have no candidate", () => assert.deepEqual([unitCodeCandidateFromLabel("Ateliér sever"), unitCodeCandidateFromLabel("Byt 1000")], [null, null]));

    const properties = await Promise.all(Array.from({ length: 8 }, (_, i) => prisma.property.create({ data: { name: `${marker}-p${i}`, address: `${i + 1}`, city: "Praha", ownerId: owner.id } })));
    propertyIds.push(...properties.map(p => p.id));
    await check("new properties receive automatic valid codes", () => assert.ok(properties.every(p => isPropertyCode(p.propertyCode))));
    await check("concurrent property allocation is unique", () => assert.equal(new Set(properties.map(p => p.propertyCode)).size, properties.length));
    const allProperties = await prisma.property.findMany({ select: { propertyCode: true } });
    await check("all properties are backfilled and globally unique", () => { assert.ok(allProperties.every(p => isPropertyCode(p.propertyCode))); assert.equal(new Set(allProperties.map(p => p.propertyCode)).size, allProperties.length); });

    const p1 = properties[0], p2 = properties[1];
    const intuitive = await Promise.all(["Byt 1", "Byt 2", "Byt 10"].map(label => prisma.unit.create({ data: { propertyId: p1.id, label } })));
    await check("new units prefer intuitive unused labels", () => assert.deepEqual(intuitive.map(u => u.unitCode), ["001", "002", "010"]));
    const concurrentUnits = await Promise.all(Array.from({ length: 8 }, (_, i) => prisma.unit.create({ data: { propertyId: p1.id, label: `${marker}-odd-${i}` } })));
    await check("concurrent same-property unit allocation is unique", () => assert.equal(new Set([...intuitive, ...concurrentUnits].map(u => u.unitCode)).size, intuitive.length + concurrentUnits.length));
    await check("all concurrent unit codes are valid", () => assert.ok(concurrentUnits.every(u => isUnitCode(u.unitCode))));
    const sameAcrossProperties = await prisma.unit.create({ data: { propertyId: p2.id, label: "Byt 1" } });
    await check("same unit code is allowed in different properties", () => assert.equal(sameAcrossProperties.unitCode, "001"));

    const originalPropertyCode = p1.propertyCode;
    const renamedProperty = await prisma.property.update({ where: { id: p1.id }, data: { name: `${marker}-renamed`, address: "Nová 99" } });
    await check("property name and address edits preserve code", () => assert.equal(renamedProperty.propertyCode, originalPropertyCode));
    const originalUnitCode = intuitive[0].unitCode;
    const renamedUnit = await prisma.unit.update({ where: { id: intuitive[0].id }, data: { label: "Byt přejmenovaný" } });
    await check("unit label edit preserves code", () => assert.equal(renamedUnit.unitCode, originalUnitCode));
    await check("database rejects property code mutation", async () => await assert.rejects(prisma.property.update({ where: { id: p1.id }, data: { propertyCode: "9999" } })));
    await check("database rejects unit code mutation", async () => await assert.rejects(prisma.unit.update({ where: { id: intuitive[0].id }, data: { unitCode: "999" } })));
    await check("ordinary update routes accept no injected codes", () => { assert.doesNotMatch(propertyRoute, /text\(form,"propertyCode"/); assert.doesNotMatch(unitRoute, /text\(form, "unitCode"/); });
    await check("normal edit forms expose no code inputs", () => { assert.doesNotMatch(propertyForm, /name="propertyCode"/); assert.doesNotMatch(unitForm, /name="unitCode"/); });

    const deletedCode = concurrentUnits[0].unitCode;
    await prisma.unit.delete({ where: { id: concurrentUnits[0].id } });
    const afterDelete = await prisma.unit.create({ data: { propertyId: p1.id, label: `Byt ${Number(deletedCode)}` } });
    await check("hard-deleted unit code is not reused", () => assert.notEqual(afterDelete.unitCode, deletedCode));
    const deletedPropertyCode = properties[7].propertyCode;
    await prisma.property.delete({ where: { id: properties[7].id } });
    const afterPropertyDelete = await prisma.property.create({ data: { name: `${marker}-after-delete`, address: "X", city: "Praha", ownerId: owner.id } });
    propertyIds.push(afterPropertyDelete.id);
    await check("hard-deleted property code is not reused", () => assert.notEqual(afterPropertyDelete.propertyCode, deletedPropertyCode));
    const inactiveCode = properties[6].propertyCode;
    await prisma.property.update({ where: { id: properties[6].id }, data: { active: false } });
    await check("inactive lifecycle preserves property code", async () => assert.equal((await prisma.property.findUniqueOrThrow({ where: { id: properties[6].id } })).propertyCode, inactiveCode));

    await check("property UI displays Pxxxx metadata", () => assert.match(read("app/nemovitosti/[id]/[section]/page.tsx"), /ID nemovitosti: \{formatPropertyBusinessId/));
    await check("unit UI displays compound metadata", () => assert.match(read("app/nemovitosti/[id]/jednotky/[unitId]/page.tsx"), /ID jednotky: \{formatCompoundUnitBusinessId/));
    await check("migration ordering is deterministic", () => assert.match(migration, /ORDER BY "createdAt" ASC, id ASC/));
    await check("duplicate and odd backfill uses bounded fallback", () => { assert.match(migration, /count\(\*\) OVER \(PARTITION BY "propertyId", candidate\)/); assert.match(migration, /generate_series\(1, 999\)/); });
    await check("database check constraints protect malformed codes", () => { assert.match(migration, /Property_propertyCode_check/); assert.match(migration, /Unit_unitCode_check/); });
    await check("database unique constraints have correct scope", () => { assert.match(migration, /Property_propertyCode_key/); assert.match(migration, /Unit_propertyId_unitCode_key/); });
    await check("migration is additive and preserves domain data", () => assert.doesNotMatch(migration, /DROP|TRUNCATE|DELETE FROM/i));
    await check("lease identity consumes accepted immutable business codes", () => assert.deepEqual(proposedLeaseIdentity({ propertyCode: "1201" }, { unitCode: "005", leases: [] }, new Set()), { sequence: 1, variableSymbol: "120100501", contractNumber: "NS-P1201-U005-01" }));
    await check("Drive location behavior is unchanged", () => assert.equal(hash("lib/storage/locations.ts"), "6eca90cce50ceada1b737885b625a7583cba6b2974a454283b20dbfa41a3fcb9"));
    await check("googleDriveFolderId is not migrated", () => assert.doesNotMatch(migration, /googleDriveFolderId/));
    await check("MF implementation is outside identity changes", () => assert.doesNotMatch(read("lib/business-identity.ts"), /MfRent|mf-rent/));
    await check("reporting implementation is outside identity changes", () => assert.doesNotMatch(read("lib/business-identity.ts"), /Quarterly|reporting/));
  } finally {
    await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
    await prisma.$executeRawUnsafe(`DELETE FROM "UnitBusinessCodeReservation" WHERE "propertyId" = ANY($1::text[])`, propertyIds).catch(() => undefined);
    await prisma.owner.delete({ where: { id: owner.id } });
    await prisma.$disconnect();
  }
  console.log(`IDENTITY-1 verified (${n} checks).`);
}

main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
