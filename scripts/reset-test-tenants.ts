import { prisma } from "../lib/db";
import { syncUnitOccupancyCache } from "../lib/lease-lifecycle";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const tenantIds = args.filter((arg) => arg !== "--apply" && arg !== "--dry-run");

if (!tenantIds.length || tenantIds.some((id) => !id || id.startsWith("-"))) {
  throw new Error("Reset vyžaduje explicitní tenant IDs, například: tsx scripts/reset-test-tenants.ts tenant_id [tenant_id] [--apply]");
}
if (tenantIds.includes("all") || tenantIds.includes("*")) throw new Error("Wildcard ani reset všech tenantů není povolen.");
if (apply && process.env.ALLOW_TEST_TENANT_RESET !== "1") throw new Error("--apply vyžaduje env ALLOW_TEST_TENANT_RESET=1.");

async function main() {
  const tenants = await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, include: { leases: { include: { unit: { include: { property: true } }, occupants: true, paymentItems: true, charges: { include: { allocations: true } }, notifications: true, tasks: true, meterReadings: true } }, tasks: true } });
  if (tenants.length !== tenantIds.length) throw new Error(`Některý tenant ID nebyl nalezen (${tenants.length}/${tenantIds.length}).`);
  const leaseIds = tenants.flatMap((tenant) => tenant.leases.map((lease) => lease.id));
  const transactionIds = [...new Set(tenants.flatMap((tenant) => tenant.leases.flatMap((lease) => lease.charges.flatMap((charge) => charge.allocations.map((allocation) => allocation.transactionId)))))];
  const count = (getter: (tenant: typeof tenants[number]) => number) => tenants.reduce((sum, tenant) => sum + getter(tenant), 0);
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", tenants: tenants.map((tenant) => ({ id: tenant.id, name: tenant.name, leases: tenant.leases.map((lease) => ({ id: lease.id, property: lease.unit.property.name, unit: lease.unit.label, paymentItems: lease.paymentItems.length, charges: lease.charges.length, allocations: lease.charges.reduce((sum, charge) => sum + charge.allocations.length, 0), occupants: lease.occupants.length, notifications: lease.notifications.length, meterReadings: lease.meterReadings.length, tasks: lease.tasks.length })) })), totals: { leases: leaseIds.length, properties: new Set(tenants.flatMap((tenant) => tenant.leases.map((lease) => lease.unit.propertyId))).size, units: new Set(tenants.flatMap((tenant) => tenant.leases.map((lease) => lease.unitId))).size, paymentItems: count((tenant) => tenant.leases.reduce((sum, lease) => sum + lease.paymentItems.length, 0)), charges: count((tenant) => tenant.leases.reduce((sum, lease) => sum + lease.charges.length, 0)), allocations: count((tenant) => tenant.leases.reduce((sum, lease) => sum + lease.charges.reduce((inner, charge) => inner + charge.allocations.length, 0), 0)), occupants: count((tenant) => tenant.leases.reduce((sum, lease) => sum + lease.occupants.length, 0)), notifications: count((tenant) => tenant.leases.reduce((sum, lease) => sum + lease.notifications.length, 0)), meterReadings: count((tenant) => tenant.leases.reduce((sum, lease) => sum + lease.meterReadings.length, 0)), tasks: count((tenant) => tenant.tasks.length + tenant.leases.reduce((sum, lease) => sum + lease.tasks.length, 0)), bankTransactionsAffected: transactionIds.length } }, null, 2));
  if (!apply) return;

  await prisma.$transaction(async (tx) => {
    const affectedUnits = [...new Set(tenants.flatMap((tenant) => tenant.leases.map((lease) => lease.unitId)))];
    await tx.task.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { leaseId: { in: leaseIds } }] } });
    await tx.meterReading.updateMany({ where: { leaseId: { in: leaseIds } }, data: { leaseId: null } });
    await tx.lease.deleteMany({ where: { id: { in: leaseIds } } });
    await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    for (const transactionId of transactionIds) {
      const transaction = await tx.bankTransaction.findUnique({ where: { id: transactionId }, select: { amountCents: true } });
      if (!transaction) continue;
      const allocations = await tx.paymentAllocation.findMany({ where: { transactionId }, select: { amountCents: true, charge: { select: { amountCents: true } } } });
      const allocated = allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
      const status = allocated === 0
        ? "UNMATCHED"
        : allocated < transaction.amountCents
          ? "OVERPAYMENT"
          : allocations.some((allocation) => allocation.amountCents < allocation.charge.amountCents)
            ? "PARTIAL"
            : "MATCHED";
      await tx.bankTransaction.update({ where: { id: transactionId }, data: { status, suggestedLeaseId: null, matchedRuleId: null, matchNote: "Stav byl přepočten po selektivním test resetu." } });
    }
    for (const unitId of affectedUnits) await syncUnitOccupancyCache(tx, unitId);
    await tx.auditLog.create({ data: { action: "TEST_TENANTS_RESET", entityType: "Tenant", entityId: tenantIds.join(","), details: { tenantIds, leaseIds, affectedTransactionIds: transactionIds, affectedUnitIds: affectedUnits } } });
  });
  console.log("Reset dokončen. Nemovitosti, jednotky, BankTransaction a MeterReading byly zachovány.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
