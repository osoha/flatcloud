import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LeaseStatus, PropertyPermission, UnitStatus } from "@prisma/client";
import { prisma } from "../lib/db";
import { hasPropertyPermission } from "../lib/management";
import { leaseStatusAt } from "../lib/lease-lifecycle-core";
import {
  LEASE_EXPIRED_REACTIVATION_ERROR,
  LEASE_INVALID_INTERVAL_ERROR,
  LEASE_NOT_CANCELLED_ERROR,
  LEASE_RESTORE_REASON_REQUIRED_ERROR,
  LEASE_TERMINATED_REACTIVATION_ERROR,
  restoreCancelledLease,
} from "../lib/lease-reactivation";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }
async function rejectsMessage(run: () => Promise<unknown>, message: string) { await assert.rejects(run, (error: Error) => error.message === message); }

const service = read("lib/lease-reactivation.ts");
const route = read("app/api/properties/[id]/leases/[leaseId]/reactivate/route.ts");
const ui = read("app/nemovitosti/[id]/smlouvy/[leaseId]/upravit/page.tsx");
const lifecycleCore = read("lib/lease-lifecycle-core.ts");
const terminateRoute = read("app/api/properties/[id]/leases/[leaseId]/terminate/route.ts");
const management = read("lib/management.ts");

async function main() {
  await check("dedicated route uses property ADMIN authorization", () => { assert.match(route, /requirePropertyAdmin\(id\)/); assert.doesNotMatch(route, /requireManagedProperty/); });
  await check("required correction reason is parsed and validated", () => { assert.match(route, /text\(form, "restoreReason", true\)/); assert.match(service, /restoreReason\.trim\(\)/); });
  await check("service derives status with cancellation removed", () => assert.match(service, /leaseStatusAt\(\{ \.\.\.lease, cancelledAt: null \}, now\)/));
  await check("shared overlap, VS, occupancy and charge invariants are used", () => { for (const token of ["assertNoLeaseOverlap", "excludeLeaseId: lease.id", "assertUniqueVariableSymbol", "syncUnitOccupancyCache", "syncLeaseCharges", "financialTrackingFromPeriod"]) assert.ok(service.includes(token)); });
  await check("charge synchronization respects the lease automation flag", () => assert.doesNotMatch(service, /syncLeaseCharges\([\s\S]{0,200}force:\s*true/));
  await check("audit preserves cancellation and correction reason", () => { for (const token of ["LEASE_REACTIVATED", "previousCancelledAt", "previousCancellationReason", "restoreReason", "derivedLifecycleStatus", "tenantId", "unitId"]) assert.ok(service.includes(token)); });
  await check("route sanitizes unexpected service failures", () => assert.match(route, /leaseReactivationErrorMessage\(error\)/));
  await check("service never mutates Tenant.active or deletes financial history", () => { assert.doesNotMatch(service, /tenant\.update|Tenant\.active|deleteMany|charge\.delete|allocation.*delete/i); });
  await check("UI limits cautious restoration form to cancelled admin leases", () => { assert.match(ui, /lease\.cancelledAt && canReactivate/); assert.match(ui, /PropertyPermission\.ADMIN/); assert.match(ui, /Obnovit zrušenou smlouvu/); assert.match(ui, /className="secondary"/); });
  await check("normal ended lifecycle presentation and termination workflow remain", () => { assert.match(ui, /lifecycleStatus === "ENDED"/); assert.match(ui, /lease\.terminatedOn/); assert.match(terminateRoute, /LEASE_TERMINATED/); });
  await check("core cancelled lifecycle semantics remain strict", () => assert.match(lifecycleCore, /if \(lease\.cancelledAt\) return "ENDED"/));
  await check("no manual lease status field was introduced", () => assert.doesNotMatch(ui, /name=["']status["']/));
  await check("shared admin semantics retain app-wide and property permission behavior", () => { assert.match(management, /if \(hasAllPropertyAccess\(user\)\) return true/); assert.match(management, /requirePropertyPermission\(propertyId, PropertyPermission\.ADMIN\)/); });
  await check("checkpoint adds no Prisma schema model or migration", () => { assert.doesNotMatch(read("prisma/schema.prisma"), /reactivat/i); assert.equal(fs.readdirSync(path.join(root, "prisma/migrations")).filter((name) => /reactivat/i.test(name)).length, 0); });

  const marker = `lease-reactivate-1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date("2026-09-02T12:00:00.000Z");
  const owner = await prisma.owner.create({ data: { name: `${marker}-owner` } });
  const account = await prisma.ownerBankAccount.create({ data: { ownerId: owner.id, label: marker, accountNumber: "123", bankCode: "0100" } });
  const property = await prisma.property.create({ data: { name: marker, address: "Test 1", city: "Praha", ownerId: owner.id } });
  const admin = await prisma.user.create({ data: { email: `${marker}-admin@example.test`, name: "Admin", passwordHash: "test", role: "OWNER_VIEWER" } });
  const editor = await prisma.user.create({ data: { email: `${marker}-edit@example.test`, name: "Editor", passwordHash: "test", role: "OWNER_VIEWER" } });
  const viewer = await prisma.user.create({ data: { email: `${marker}-view@example.test`, name: "Viewer", passwordHash: "test", role: "OWNER_VIEWER" } });
  const unitOnly = await prisma.user.create({ data: { email: `${marker}-unit@example.test`, name: "Unit", passwordHash: "test", role: "OWNER_VIEWER" } });
  const globalAdmin = await prisma.user.create({ data: { email: `${marker}-global@example.test`, name: "Global", passwordHash: "test", role: "SUPER_ADMIN", allProperties: true } });
  const tenant = await prisma.tenant.create({ data: { name: `${marker}-tenant`, payerAccounts: [], active: true } });
  const createdLeaseIds: string[] = [];
  const makeUnit = (label: string) => prisma.unit.create({ data: { propertyId: property.id, label } });
  const makeLease = async (unitId: string, variableSymbol: string, data: { startDate: Date; endDate?: Date | null; terminatedOn?: Date | null; cancelledAt?: Date | null; cancellationReason?: string | null; autoChargesEnabled?: boolean }) => {
    const lease = await prisma.lease.create({ data: { unitId, tenantId: tenant.id, ownerBankAccountId: account.id, financialTrackingFromPeriod: "2026-01", variableSymbol, rentCents: 10000, servicesCents: 1000, status: LeaseStatus.ENDED, autoChargesEnabled: data.autoChargesEnabled ?? true, startDate: data.startDate, endDate: data.endDate, terminatedOn: data.terminatedOn, cancelledAt: data.cancelledAt, cancellationReason: data.cancellationReason, paymentItems: { create: { name: "Nájemné", category: "RENT", amountCents: 10000, validFrom: data.startDate, sortOrder: 10 } } } });
    createdLeaseIds.push(lease.id); return lease;
  };

  try {
    await prisma.userProperty.createMany({ data: [
      { userId: admin.id, propertyId: property.id, permission: PropertyPermission.ADMIN },
      { userId: editor.id, propertyId: property.id, permission: PropertyPermission.EDIT },
      { userId: viewer.id, propertyId: property.id, permission: PropertyPermission.VIEW },
    ] });
    const permissionUnit = await makeUnit("Permission");
    await prisma.userUnit.create({ data: { userId: unitOnly.id, unitId: permissionUnit.id, permission: PropertyPermission.ADMIN } });
    await check("property ADMIN and app-wide admin satisfy shared authorization", async () => { assert.equal(await hasPropertyPermission(admin, property.id, PropertyPermission.ADMIN), true); assert.equal(await hasPropertyPermission(globalAdmin, property.id, PropertyPermission.ADMIN), true); });
    await check("property EDIT, VIEW and unit-only users cannot restore", async () => { assert.equal(await hasPropertyPermission(editor, property.id, PropertyPermission.ADMIN), false); assert.equal(await hasPropertyPermission(viewer, property.id, PropertyPermission.ADMIN), false); assert.equal(await hasPropertyPermission(unitOnly, property.id, PropertyPermission.ADMIN), false); });

    const invalidUnit = await makeUnit("Dominik");
    const invalid = await makeLease(invalidUnit.id, "810001", { startDate: new Date("2027-07-16T12:00:00Z"), endDate: new Date("2026-07-30T12:00:00Z"), cancelledAt: new Date("2026-08-01T12:00:00Z"), cancellationReason: "Historická migrace" });
    await check("invalid legacy interval is rejected before clearing cancellation", async () => {
      assert.equal(leaseStatusAt(await prisma.lease.findUniqueOrThrow({ where: { id: invalid.id } }), now), "ENDED");
      await rejectsMessage(() => restoreCancelledLease({ propertyId: property.id, leaseId: invalid.id, actor: admin, restoreReason: "Oprava", now }), LEASE_INVALID_INTERVAL_ERROR);
      assert.deepEqual(await prisma.lease.findUnique({ where: { id: invalid.id }, select: { cancelledAt: true } }), { cancelledAt: new Date("2026-08-01T12:00:00Z") });
      assert.equal(await prisma.auditLog.count({ where: { entityId: invalid.id, action: "LEASE_REACTIVATED" } }), 0);
      assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: invalidUnit.id } })).status, UnitStatus.VACANT);
    });
    await prisma.lease.update({ where: { id: invalid.id }, data: { startDate: new Date("2026-01-01T12:00:00Z"), endDate: null } });
    const preservedCharge = await prisma.charge.create({ data: { leaseId: invalid.id, period: "2026-02", dueDate: new Date("2026-02-05T12:00:00Z"), amountCents: 777, active: false, manualOverride: true } });
    await check("Dominik-like corrected ACTIVE lease restores transactionally", async () => {
      const result = await restoreCancelledLease({ propertyId: property.id, leaseId: invalid.id, actor: admin, restoreReason: "Oprava historického testovacího záznamu", now });
      assert.equal(result.derivedStatus, LeaseStatus.ACTIVE);
      const restored = await prisma.lease.findUniqueOrThrow({ where: { id: invalid.id }, include: { charges: true } });
      assert.equal(restored.cancelledAt, null); assert.equal(restored.cancellationReason, null); assert.equal(restored.status, leaseStatusAt(restored, now));
      assert.ok(restored.charges.some((charge) => charge.active));
      assert.deepEqual(await prisma.charge.findUnique({ where: { id: preservedCharge.id }, select: { amountCents: true, active: true, manualOverride: true } }), { amountCents: 777, active: false, manualOverride: true });
      assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: invalidUnit.id } })).status, UnitStatus.OCCUPIED);
      assert.equal(leaseStatusAt(restored, now), "ACTIVE");
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: invalid.id, action: "LEASE_REACTIVATED" } });
      assert.deepEqual(audit.details, { unitId: invalidUnit.id, tenantId: tenant.id, previousCancelledAt: "2026-08-01T12:00:00.000Z", previousCancellationReason: "Historická migrace", restoreReason: "Oprava historického testovacího záznamu", derivedLifecycleStatus: "ACTIVE" });
    });

    const futureUnit = await makeUnit("Future");
    const future = await makeLease(futureUnit.id, "810002", { startDate: new Date("2027-01-01T12:00:00Z"), endDate: new Date("2027-12-31T12:00:00Z"), cancelledAt: now, cancellationReason: "Omyl" });
    await check("valid FUTURE restore preserves current vacancy and derives tenant future state", async () => {
      const result = await restoreCancelledLease({ propertyId: property.id, leaseId: future.id, actor: admin, restoreReason: "Oprava budoucí smlouvy", now });
      assert.equal(result.derivedStatus, LeaseStatus.FUTURE);
      assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: futureUnit.id } })).status, UnitStatus.VACANT);
      const leases = await prisma.lease.findMany({ where: { tenantId: tenant.id } });
      assert.ok(leases.some((lease) => leaseStatusAt(lease, now) === "FUTURE"));
    });

    const overlapUnit = await makeUnit("Overlap");
    const cancelledOverlap = await makeLease(overlapUnit.id, "810003", { startDate: new Date("2026-01-01T12:00:00Z"), endDate: new Date("2026-12-31T12:00:00Z"), cancelledAt: now });
    const other = await makeLease(overlapUnit.id, "810004", { startDate: new Date("2026-06-01T12:00:00Z"), endDate: null, cancelledAt: null });
    await prisma.lease.update({ where: { id: other.id }, data: { status: LeaseStatus.ACTIVE } });
    await check("overlapping restore is rejected without mutation or success audit", async () => {
      await assert.rejects(() => restoreCancelledLease({ propertyId: property.id, leaseId: cancelledOverlap.id, actor: admin, restoreReason: "Oprava", now }), /Období smluv se nesmí překrývat/);
      assert.notEqual((await prisma.lease.findUniqueOrThrow({ where: { id: cancelledOverlap.id } })).cancelledAt, null);
      assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: other.id } })).status, LeaseStatus.ACTIVE);
      assert.equal(await prisma.auditLog.count({ where: { entityId: cancelledOverlap.id, action: "LEASE_REACTIVATED" } }), 0);
    });

    const expiredUnit = await makeUnit("Expired");
    const expired = await makeLease(expiredUnit.id, "810005", { startDate: new Date("2025-01-01T12:00:00Z"), endDate: new Date("2025-12-31T12:00:00Z"), cancelledAt: now });
    await check("contractually expired cancelled lease is not eligible", () => rejectsMessage(() => restoreCancelledLease({ propertyId: property.id, leaseId: expired.id, actor: admin, restoreReason: "Oprava", now }), LEASE_EXPIRED_REACTIVATION_ERROR));
    const terminatedUnit = await makeUnit("Terminated");
    const terminated = await makeLease(terminatedUnit.id, "810006", { startDate: new Date("2026-01-01T12:00:00Z"), endDate: null, terminatedOn: new Date("2026-08-01T12:00:00Z"), cancelledAt: now });
    await check("genuinely terminated lease is rejected without clearing termination", async () => { await rejectsMessage(() => restoreCancelledLease({ propertyId: property.id, leaseId: terminated.id, actor: admin, restoreReason: "Oprava", now }), LEASE_TERMINATED_REACTIVATION_ERROR); assert.notEqual((await prisma.lease.findUniqueOrThrow({ where: { id: terminated.id } })).terminatedOn, null); });
    await check("non-cancelled lease and blank reason are rejected", async () => { await rejectsMessage(() => restoreCancelledLease({ propertyId: property.id, leaseId: other.id, actor: admin, restoreReason: "Oprava", now }), LEASE_NOT_CANCELLED_ERROR); await rejectsMessage(() => restoreCancelledLease({ propertyId: property.id, leaseId: expired.id, actor: admin, restoreReason: "  ", now }), LEASE_RESTORE_REASON_REQUIRED_ERROR); });
  } finally {
    await prisma.auditLog.deleteMany({ where: { OR: [{ propertyId: property.id }, { entityId: { in: createdLeaseIds } }] } });
    await prisma.property.delete({ where: { id: property.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, editor.id, viewer.id, unitOnly.id, globalAdmin.id] } } });
    await prisma.owner.delete({ where: { id: owner.id } });
  }
  console.log(`LEASE-REACTIVATE-1 verification passed: ${count} checks.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
