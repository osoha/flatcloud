import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LeaseStatus, PropertyPermission, UnitStatus } from "@prisma/client";
import { prisma } from "../lib/db";
import { runChargeAutomation, replaceRecurringAmount, syncLeaseCharges } from "../lib/charge-automation";
import { createLeaseFromForm } from "../lib/lease-create";
import { resolveActiveFinancialBoundary } from "../lib/lease-financial-boundary";
import { restoreCancelledLease, LEASE_TERMINATED_REACTIVATION_ERROR } from "../lib/lease-reactivation";
import { leaseStatusAt } from "../lib/lease-lifecycle-core";
import { loadLiveReport } from "../lib/reporting/live-service";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const now = new Date("2026-09-02T12:00:00.000Z");
const currentPeriod = "2026-09";
let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }

function leaseForm(unitId: string, variableSymbol: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    unitId,
    contractNumber: "NS-HEAVY-01",
    startDate: "2026-04-01",
    termType: "INDEFINITE",
    dueDay: "5",
    variableSymbol,
    rentTiming: "ADVANCE",
    rent: "23000",
    services: "4700",
    deposit: "25000",
    depositInterest: "0",
    autoChargesEnabled: "on",
    financialTrackingFromPeriod: currentPeriod,
    openingBalanceType: "ZERO",
    openingDepositStatus: "NOT_FUNDED",
  })) form.set(key, value);
  return form;
}

async function main() {
  await check("active future boundary is clamped only to the current month", () => assert.deepEqual(resolveActiveFinancialBoundary({ startDate: new Date("2026-04-01T12:00Z"), endDate: null, terminatedOn: null, cancelledAt: null, financialTrackingFromPeriod: "2027-07" }, now), { period: currentPeriod, previousPeriod: "2027-07", corrected: true }));
  await check("historical active boundary is never moved backwards", () => assert.equal(resolveActiveFinancialBoundary({ startDate: new Date("2022-01-01T12:00Z"), endDate: null, terminatedOn: null, cancelledAt: null, financialTrackingFromPeriod: "2026-08" }, now).corrected, false));
  await check("future lease keeps its legal future boundary", () => assert.equal(resolveActiveFinancialBoundary({ startDate: new Date("2027-01-01T12:00Z"), endDate: null, terminatedOn: null, cancelledAt: null, financialTrackingFromPeriod: "2027-01" }, now).corrected, false));

  const marker = `lease-report-heavy-1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const owner = await prisma.owner.create({ data: { name: `${marker}-owner` } });
  const account = await prisma.ownerBankAccount.create({ data: { ownerId: owner.id, label: marker, accountNumber: "987654321", bankCode: "0100" } });
  const property = await prisma.property.create({ data: { name: marker, address: "Dry Run 1", city: "Praha", ownerId: owner.id } });
  const admin = await prisma.user.create({ data: { email: `${marker}@example.test`, name: "Heavy Admin", passwordHash: "test", role: "OWNER_VIEWER" } });
  const tenant = await prisma.tenant.create({ data: { name: "Dominik Heavy", payerAccounts: [], active: true } });
  const unitIds: string[] = [];
  const leaseIds: string[] = [];

  async function makeUnit(label: string) {
    const unit = await prisma.unit.create({ data: { propertyId: property.id, label, areaM2: 50, operationalStatusEvents: { create: { status: "STANDARD", source: "MANUAL_BASELINE", effectiveAt: new Date("2020-01-01T12:00Z") } }, ownerships: { create: { ownerId: owner.id, ownerBankAccountId: account.id } } } });
    unitIds.push(unit.id);
    return unit;
  }

  async function directLease(unitId: string, variableSymbol: string, data: { startDate: Date; endDate?: Date | null; terminatedOn?: Date | null; cancelledAt?: Date | null; boundary: string; rent: number; services: number; status: LeaseStatus; auto?: boolean; contractNumber: string }) {
    const lease = await prisma.lease.create({ data: { unitId, tenantId: tenant.id, ownerBankAccountId: account.id, contractNumber: data.contractNumber, startDate: data.startDate, endDate: data.endDate, terminatedOn: data.terminatedOn, cancelledAt: data.cancelledAt, cancellationReason: data.cancelledAt ? "Dry-run correction" : null, financialTrackingFromPeriod: data.boundary, variableSymbol, rentCents: data.rent, servicesCents: data.services, depositCents: 2500000, status: data.status, autoChargesEnabled: data.auto ?? true, paymentItems: { create: [
      { name: "Nájemné", category: "RENT", amountCents: data.rent, validFrom: data.startDate, sortOrder: 10 },
      { name: "Zálohy na služby", category: "SERVICES", amountCents: data.services, validFrom: data.startDate, sortOrder: 20 },
    ] }, securityDepositTerms: { create: { agreedAmountCents: 2500000, annualRateBps: 0, effectiveFrom: data.startDate } } } });
    leaseIds.push(lease.id);
    return lease;
  }

  const report = () => loadLiveReport(admin, { mode: "SELECTED", propertyIds: [property.id] }, now);

  try {
    await prisma.userProperty.create({ data: { userId: admin.id, propertyId: property.id, permission: PropertyPermission.ADMIN } });

    const createdUnit = await makeUnit("Created");
    const created = await prisma.$transaction((tx) => createLeaseFromForm(tx, property.id, leaseForm(createdUnit.id, "920100101"), tenant.id, admin.id));
    leaseIds.push(created.lease.id);
    await check("real creation service stores contract rent and services", async () => assert.deepEqual(await prisma.lease.findUnique({ where: { id: created.lease.id }, select: { rentCents: true, servicesCents: true, financialTrackingFromPeriod: true } }), { rentCents: 2300000, servicesCents: 470000, financialTrackingFromPeriod: currentPeriod }));
    await check("creation service creates both recurring components", async () => assert.deepEqual((await prisma.leasePaymentItem.findMany({ where: { leaseId: created.lease.id }, orderBy: { sortOrder: "asc" }, select: { category: true, amountCents: true } })).map((item) => [item.category, item.amountCents]), [["RENT", 2300000], ["SERVICES", 470000]]));
    await check("creation service occupies the unit", async () => assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: createdUnit.id } })).status, UnitStatus.OCCUPIED));
    await check("new active lease is identical in tenancy LIVE report", async () => { const row = (await report()).tenancyRows.find((item) => item.leaseId === created.lease.id); assert.deepEqual(row && [row.netRentCents, row.servicesCents, row.agreedDepositCents], [2300000, 470000, 2500000]); });
    await check("new active lease is identical in contract report", async () => assert.equal((await report()).contractRows.find((item) => item.leaseId === created.lease.id)?.rentCents, 2300000));
    await check("new active lease has a current generated charge", async () => assert.deepEqual(await prisma.charge.findFirst({ where: { leaseId: created.lease.id, period: currentPeriod }, select: { active: true, amountCents: true } }), { active: true, amountCents: 2770000 }));

    const priorManual = await prisma.charge.create({ data: { leaseId: created.lease.id, period: "2026-08", dueDate: new Date("2026-08-05T12:00Z"), amountCents: 77700, active: false, manualOverride: true } });
    await prisma.$transaction(async (tx) => {
      const effectiveFrom = new Date("2026-09-01T12:00Z");
      await replaceRecurringAmount(tx, created.lease.id, "RENT", 2400000, effectiveFrom);
      await replaceRecurringAmount(tx, created.lease.id, "SERVICES", 500000, effectiveFrom);
      await tx.lease.update({ where: { id: created.lease.id }, data: { rentCents: 2400000, servicesCents: 500000 } });
      await syncLeaseCharges(tx, created.lease.id, { now, fromPeriod: currentPeriod, force: true });
    });
    await check("amount edit updates raw lease values used by cards", async () => assert.deepEqual(await prisma.lease.findUnique({ where: { id: created.lease.id }, select: { rentCents: true, servicesCents: true } }), { rentCents: 2400000, servicesCents: 500000 }));
    await check("amount edit updates tenancy report", async () => { const row = (await report()).tenancyRows.find((item) => item.leaseId === created.lease.id); assert.deepEqual(row && [row.netRentCents, row.servicesCents], [2400000, 500000]); });
    await check("amount edit updates current and future generated charges", async () => { const charges = await prisma.charge.findMany({ where: { leaseId: created.lease.id, period: { in: [currentPeriod, "2026-10"] } }, orderBy: { period: "asc" }, select: { period: true, amountCents: true, active: true } }); assert.deepEqual(charges, [{ period: currentPeriod, amountCents: 2900000, active: true }, { period: "2026-10", amountCents: 2900000, active: true }]); });
    await check("amount edit preserves prior manual history", async () => assert.deepEqual(await prisma.charge.findUnique({ where: { id: priorManual.id }, select: { amountCents: true, active: true, manualOverride: true } }), { amountCents: 77700, active: false, manualOverride: true }));

    await prisma.leasePaymentItem.createMany({ data: [
      { leaseId: created.lease.id, name: "Legacy duplicate rent", category: "RENT", amountCents: 630000, validFrom: new Date("2026-04-01T12:00Z"), sortOrder: 11 },
      { leaseId: created.lease.id, name: "Legacy future rent", category: "RENT", amountCents: 1800000, validFrom: new Date("2026-10-01T12:00Z"), sortOrder: 12 },
      { leaseId: created.lease.id, name: "Legacy duplicate services", category: "SERVICES", amountCents: 750000, validFrom: new Date("2026-04-01T12:00Z"), sortOrder: 21 },
    ] });
    await prisma.$transaction(async (tx) => {
      const effectiveFrom = new Date("2026-09-01T12:00Z");
      await replaceRecurringAmount(tx, created.lease.id, "RENT", 2400000, effectiveFrom);
      await replaceRecurringAmount(tx, created.lease.id, "SERVICES", 500000, effectiveFrom);
      await syncLeaseCharges(tx, created.lease.id, { now, fromPeriod: currentPeriod, force: true });
    });
    await check("saving unchanged contract totals collapses overlapping RENT and SERVICES schedules", async () => { const items = await prisma.leasePaymentItem.findMany({ where: { leaseId: created.lease.id, active: true, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }], category: { in: ["RENT", "SERVICES"] } }, orderBy: { category: "asc" }, select: { category: true, amountCents: true } }); assert.deepEqual(items, [{ category: "RENT", amountCents: 2400000 }, { category: "SERVICES", amountCents: 500000 }]); });
    await check("schedule normalization makes every unpaid current and future charge consistent", async () => { const charges = await prisma.charge.findMany({ where: { leaseId: created.lease.id, period: { in: [currentPeriod, "2026-10"] } }, orderBy: { period: "asc" }, select: { period: true, amountCents: true } }); assert.deepEqual(charges, [{ period: currentPeriod, amountCents: 2900000 }, { period: "2026-10", amountCents: 2900000 }]); });

    const currentCharge = await prisma.charge.findFirstOrThrow({ where: { leaseId: created.lease.id, period: currentPeriod } });
    await prisma.charge.update({
      where: { id: currentCharge.id },
      data: {
        manualOverride: true,
        amountCents: 5300000,
        items: {
          deleteMany: {},
          create: [
            { name: "Nájemné", category: "RENT", amountCents: 2400000 },
            { name: "Legacy duplicate rent", category: "RENT", amountCents: 2400000 },
            { name: "Zálohy na služby", category: "SERVICES", amountCents: 500000 },
          ],
        },
      },
    });
    await check("manual or legacy charge items never double contractual LIVE rent", async () => { const row = (await report()).tenancyRows.find((item) => item.leaseId === created.lease.id); assert.deepEqual(row && [row.netRentCents, row.servicesCents], [2400000, 500000]); });

    const correctedUnit = await makeUnit("Dominik corrected");
    const corrected = await directLease(correctedUnit.id, "920100201", { startDate: new Date("2026-04-01T12:00Z"), endDate: new Date("2026-12-30T12:00Z"), cancelledAt: new Date("2026-08-01T12:00Z"), boundary: "2027-07", rent: 2300000, services: 470000, status: LeaseStatus.ENDED, contractNumber: "NS-DOMINIK" });
    await prisma.leasePaymentItem.createMany({ data: [
      { leaseId: corrected.id, name: "Legacy overlapping rent", category: "RENT", amountCents: 1220000, validFrom: new Date("2026-04-01T12:00Z"), sortOrder: 11 },
      { leaseId: corrected.id, name: "Legacy overlapping services", category: "SERVICES", amountCents: 800000, validFrom: new Date("2026-10-01T12:00Z"), sortOrder: 21 },
    ] });
    for (const [period, amountCents] of [["2026-09", 3520000], ["2026-10", 2030000], ["2026-11", 2980000], ["2026-12", 2980000], ["2027-01", 120000]] as const) {
      await prisma.charge.create({ data: { leaseId: corrected.id, period, dueDate: new Date(`${period}-05T12:00Z`), amountCents } });
    }
    const restored = await restoreCancelledLease({ propertyId: property.id, leaseId: corrected.id, actor: admin, restoreReason: "Oprava ručně vrácené smlouvy", now });
    await check("Dominik-like correction restores ACTIVE lifecycle", () => assert.equal(restored.derivedStatus, LeaseStatus.ACTIVE));
    await check("reactivation clamps future financial boundary to current month", async () => assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: corrected.id } })).financialTrackingFromPeriod, currentPeriod));
    await check("reactivation never backfills months before corrected boundary", async () => assert.equal(await prisma.charge.count({ where: { leaseId: corrected.id, period: { lt: currentPeriod } } }), 0));
    await check("reactivation creates current rent plus services charge", async () => assert.deepEqual(await prisma.charge.findFirst({ where: { leaseId: corrected.id, period: currentPeriod }, select: { amountCents: true, active: true } }), { amountCents: 2770000, active: true }));
    await check("reactivation normalizes every unpaid in-term prescription", async () => { const charges = await prisma.charge.findMany({ where: { leaseId: corrected.id, period: { in: ["2026-09", "2026-10", "2026-11", "2026-12"] } }, orderBy: { period: "asc" }, select: { period: true, amountCents: true, active: true } }); assert.deepEqual(charges, ["2026-09", "2026-10", "2026-11", "2026-12"].map((period) => ({ period, amountCents: 2770000, active: true }))); });
    await check("reactivation disables but does not rewrite a prescription beyond contract end", async () => assert.deepEqual(await prisma.charge.findFirst({ where: { leaseId: corrected.id, period: "2027-01" }, select: { amountCents: true, active: true } }), { amountCents: 120000, active: false }));
    await check("reactivation collapses overlapping recurring components to stored contract totals", async () => { const items = await prisma.leasePaymentItem.findMany({ where: { leaseId: corrected.id, active: true, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }], category: { in: ["RENT", "SERVICES"] } }, orderBy: { category: "asc" }, select: { category: true, amountCents: true } }); assert.deepEqual(items, [{ category: "RENT", amountCents: 2300000 }, { category: "SERVICES", amountCents: 470000 }]); });
    await check("reactivated lease is occupied and visible with non-zero tenancy amounts", async () => { const data = await report(); const row = data.tenancyRows.find((item) => item.leaseId === corrected.id); assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: correctedUnit.id } })).status, UnitStatus.OCCUPIED); assert.deepEqual(row && [row.netRentCents, row.servicesCents], [2300000, 470000]); });
    await check("reactivation audit records financial correction provenance", async () => { const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: corrected.id, action: "LEASE_REACTIVATED" } }); assert.deepEqual(audit.details && [(audit.details as any).previousFinancialTrackingFromPeriod, (audit.details as any).correctedFinancialTrackingFromPeriod], ["2027-07", currentPeriod]); });

    const existingUnit = await makeUnit("Existing anomaly");
    const existing = await directLease(existingUnit.id, "920100301", { startDate: new Date("2026-04-01T12:00Z"), boundary: "2027-07", rent: 1700000, services: 310000, status: LeaseStatus.ACTIVE, contractNumber: "NS-EXISTING" });
    await prisma.leasePaymentItem.create({ data: { leaseId: existing.id, name: "Existing duplicate", category: "RENT", amountCents: 900000, validFrom: new Date("2026-04-01T12:00Z"), sortOrder: 11 } });
    await prisma.charge.create({ data: { leaseId: existing.id, period: currentPeriod, dueDate: new Date("2026-09-05T12:00Z"), amountCents: 2910000 } });
    await check("LIVE report immediately recovers contractual values for an existing anomaly", async () => { const data = await report(); const row = data.tenancyRows.find((item) => item.leaseId === existing.id); assert.deepEqual(row && [row.netRentCents, row.servicesCents], [1700000, 310000]); assert.ok(data.quality.some((issue) => issue.code === "ACTIVE_LEASE_FUTURE_FINANCIAL_TRACKING" && issue.leaseId === existing.id)); });
    await runChargeAutomation(now);
    await check("scheduler permanently self-heals existing active anomaly", async () => assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: existing.id } })).financialTrackingFromPeriod, currentPeriod));
    await check("scheduler normalizes random current charge without historical backfill", async () => { assert.equal(await prisma.charge.count({ where: { leaseId: existing.id, period: { lt: currentPeriod } } }), 0); assert.deepEqual(await prisma.charge.findFirst({ where: { leaseId: existing.id, period: currentPeriod }, select: { amountCents: true, active: true } }), { amountCents: 2010000, active: true }); });
    await check("scheduler correction is audited and clears LIVE anomaly", async () => { assert.ok(await prisma.auditLog.findFirst({ where: { entityId: existing.id, action: "LEASE_FINANCIAL_TRACKING_CORRECTED" } })); assert.ok(!(await report()).quality.some((issue) => issue.code === "ACTIVE_LEASE_FUTURE_FINANCIAL_TRACKING" && issue.leaseId === existing.id)); });

    const futureUnit = await makeUnit("Future restored");
    const future = await directLease(futureUnit.id, "920100401", { startDate: new Date("2027-01-01T12:00Z"), endDate: new Date("2027-12-31T12:00Z"), cancelledAt: now, boundary: "2027-01", rent: 1500000, services: 250000, status: LeaseStatus.ENDED, contractNumber: "NS-FUTURE" });
    await restoreCancelledLease({ propertyId: property.id, leaseId: future.id, actor: admin, restoreReason: "Obnova budoucí smlouvy", now });
    await check("future restoration remains FUTURE and keeps future boundary", async () => { const lease = await prisma.lease.findUniqueOrThrow({ where: { id: future.id } }); assert.equal(leaseStatusAt(lease, now), "FUTURE"); assert.equal(lease.financialTrackingFromPeriod, "2027-01"); assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: futureUnit.id } })).status, UnitStatus.VACANT); });
    await check("future restoration is absent from tenancy but visible in contracts with agreed rent", async () => { const data = await report(); assert.ok(!data.tenancyRows.some((row) => row.leaseId === future.id)); const row = data.contractRows.find((item) => item.leaseId === future.id); assert.deepEqual(row && [row.status, row.rentCents], ["FUTURE", 1500000]); });

    const terminatedUnit = await makeUnit("Terminated");
    const terminated = await directLease(terminatedUnit.id, "920100501", { startDate: new Date("2026-01-01T12:00Z"), terminatedOn: new Date("2026-08-01T12:00Z"), cancelledAt: now, boundary: "2026-01", rent: 1000000, services: 100000, status: LeaseStatus.ENDED, contractNumber: "NS-ENDED" });
    await check("genuinely terminated lease cannot be revived", async () => assert.rejects(() => restoreCancelledLease({ propertyId: property.id, leaseId: terminated.id, actor: admin, restoreReason: "Nesmí projít", now }), (error: Error) => error.message === LEASE_TERMINATED_REACTIVATION_ERROR));

    const cardSources = [read("app/nemovitosti/[id]/jednotky/[unitId]/page.tsx"), read("app/najemnici/[tenantId]/page.tsx"), read("app/smlouvy/page.tsx"), read("app/nemovitosti/[id]/[section]/page.tsx")];
    await check("unit tenant contract and property cards use shared lifecycle and stored amounts", () => { assert.ok(cardSources.every((source) => /leaseStatusAt|currentLeaseForUnit/.test(source))); assert.ok(cardSources.every((source) => /rentCents/.test(source))); assert.match(cardSources[0], /rentCents \+ activeLease\.servicesCents/); });
    await check("edit route always reconciles raw amounts recurring templates and generated charges together", () => { const route = read("app/api/properties/[id]/leases/[leaseId]/route.ts"); for (const token of ["await replaceRecurringAmount(tx, leaseId, \"RENT\", rentCents", "await replaceRecurringAmount(tx, leaseId, \"SERVICES\", servicesCents", "rentCents", "servicesCents", "syncLeaseCharges"]) assert.ok(route.includes(token)); });
    await check("report routes link tenancy rows back to tenant unit and contract cards", () => { const page = read("app/reporty/page.tsx"); for (const token of ["/najemnici/${row.tenantId}", "/jednotky/${row.unitId}", "/smlouvy/${row.leaseId}"]) assert.ok(page.includes(token)); });
  } finally {
    await prisma.auditLog.deleteMany({ where: { OR: [{ propertyId: property.id }, { entityId: { in: leaseIds } }] } });
    await prisma.property.delete({ where: { id: property.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.owner.delete({ where: { id: owner.id } });
  }

  console.log(`LEASE-REPORT-HEAVY-1 verification passed: ${count} checks.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
