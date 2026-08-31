import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }

const source = read("lib/rent-notifications.ts");
const candidateWhere = { unit: { property: { active: true } }, charges: { some: { active: true } } } as const;

async function runtimeChecks() {
  const marker = `inactive-notifications-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const owner = await prisma.owner.create({ data: { name: `${marker}-owner` } });
  const tenant = await prisma.tenant.create({ data: { name: `${marker}-tenant`, payerAccounts: [] } });
  try {
    const activeProperty = await prisma.property.create({ data: { name: `${marker}-active`, address: "Test 1", city: "Praha", active: true, ownerId: owner.id } });
    const inactiveProperty = await prisma.property.create({ data: { name: `${marker}-inactive`, address: "Test 2", city: "Praha", active: true, ownerId: owner.id } });
    const activeUnit = await prisma.unit.create({ data: { propertyId: activeProperty.id, label: "A" } });
    const inactiveUnit = await prisma.unit.create({ data: { propertyId: inactiveProperty.id, label: "I" } });
    const activeLease = await prisma.lease.create({ data: { unitId: activeUnit.id, tenantId: tenant.id, startDate: new Date("2026-01-01T00:00:00Z"), financialTrackingFromPeriod: "2026-01", variableSymbol: "91001", rentCents: 10000, servicesCents: 0 } });
    const inactiveLease = await prisma.lease.create({ data: { unitId: inactiveUnit.id, tenantId: tenant.id, startDate: new Date("2026-01-01T00:00:00Z"), financialTrackingFromPeriod: "2026-01", variableSymbol: "91002", rentCents: 10000, servicesCents: 0 } });
    await prisma.charge.createMany({ data: [
      { leaseId: activeLease.id, period: "2026-01", dueDate: new Date("2026-01-05T00:00:00Z"), amountCents: 10000, active: true },
      { leaseId: inactiveLease.id, period: "2026-01", dueDate: new Date("2026-01-05T00:00:00Z"), amountCents: 10000, active: true },
    ] });
    const historicalNotification = await prisma.rentNotification.create({ data: { leaseId: inactiveLease.id, type: "FIRST_REMINDER", status: "SENT", recipient: "history@example.test", subject: "Historie", body: "Historie", referenceDate: new Date("2026-01-08T00:00:00Z"), outstandingCents: 10000, sentAt: new Date("2026-01-08T00:00:00Z") } });
    const historicalTask = await prisma.task.create({ data: { propertyId: inactiveProperty.id, unitId: inactiveUnit.id, leaseId: inactiveLease.id, tenantId: tenant.id, title: "Historický úkol", category: "COLLECTION", dedupeKey: `${marker}-task` } });
    await prisma.property.update({ where: { id: inactiveProperty.id }, data: { active: false } });

    const candidates = await prisma.lease.findMany({ where: candidateWhere, select: { id: true } });
    await check("active property with active charge remains eligible", () => assert.ok(candidates.some((row) => row.id === activeLease.id)));
    await check("inactive property with active charge is excluded", () => assert.ok(!candidates.some((row) => row.id === inactiveLease.id)));
    await check("existing RentNotification history survives deactivation unchanged", async () => assert.deepEqual(await prisma.rentNotification.findUnique({ where: { id: historicalNotification.id }, select: { status: true, subject: true, body: true, outstandingCents: true } }), { status: "SENT", subject: "Historie", body: "Historie", outstandingCents: 10000 }));
    await check("existing collection task survives deactivation unchanged", async () => assert.deepEqual(await prisma.task.findUnique({ where: { id: historicalTask.id }, select: { title: true, status: true, leaseId: true } }), { title: "Historický úkol", status: "OPEN", leaseId: inactiveLease.id }));
  } finally {
    await prisma.property.deleteMany({ where: { ownerId: owner.id } });
    await prisma.tenant.deleteMany({ where: { name: `${marker}-tenant` } });
    await prisma.owner.delete({ where: { id: owner.id } });
  }
}

async function main() {
  await check("notification candidate loader requires an active property", () => assert.match(source, /where: \{ unit: \{ property: \{ active: true \} \}, charges: \{ some: \{ active: true \} \} \}/));
  await runtimeChecks();
  await check("scheduled notification run uses the protected shared loader", () => { assert.match(source, /export type NotificationRunMode = "scheduled" \| "manual" \| "force"/); assert.match(source, /const leases = await loadLeases\(\)/); });
  await check("manual notification run cannot bypass the protected loader", () => { assert.match(source, /requestedMode: NotificationRunMode/); assert.doesNotMatch(source, /mode === "manual"[\s\S]{0,200}prisma\.lease/); });
  await check("forced reminder preview uses the protected shared loader", () => assert.match(source, /previewForceRentNotifications[\s\S]*Promise\.all\(\[appSettings\(\), loadLeases\(\)\]\)/));
  await check("forced reminder run cannot bypass the protected loader", () => { assert.match(source, /if \(mode === "force"\)/); assert.equal((source.match(/loadLeases\(\)/g) || []).length, 3); });
  await check("collection-task creation is reachable only through protected lease delivery", () => { const loop = source.indexOf("for (const lease of leases)", source.indexOf("runRentNotifications")); assert.ok(loop >= 0); assert.doesNotMatch(source, /export async function (tenantMessage|internalAlert)/); assert.ok(source.indexOf("await tenantMessage", loop) > loop); assert.ok(source.indexOf("await internalAlert", loop) > loop); assert.equal((source.match(/await ensureCollectionTask/g) || []).length, 2); });
  await check("active-property timing and reminder stages remain unchanged", () => { for (const token of ["paymentNoticeDaysBefore", "firstReminderDaysAfter", "secondReminderDaysAfter", "managerAlertDaysAfter", "escalationDaysAfter"]) assert.ok(source.includes(token)); for (const type of ["PAYMENT_NOTICE", "FIRST_REMINDER", "SECOND_REMINDER", "MANAGER_ALERT", "ESCALATION"]) assert.ok(source.includes(type)); });
  await check("checkpoint adds no Prisma schema or migration", () => { assert.doesNotMatch(read("prisma/schema.prisma"), /inactive-property-notifications/i); assert.equal(fs.readdirSync(path.join(root, "prisma/migrations")).filter((name) => /inactive.*notification/i.test(name)).length, 0); });
  console.log(`V22-C inactive-property notification safety verification passed: ${count} checks.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
