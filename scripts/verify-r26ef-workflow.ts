import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  approveSettlement,
  closeSettlementPayments,
  deliverSettlement,
  recordSettlementObjection,
  resolveSettlementObjection,
  settleSettlement,
} from "../lib/service-settlement-workflow";

const db = new PrismaClient();
let n = 0;

async function check(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`✓ ${++n}. ${name}`);
}

const snapshot = (property: any, unit: any, lease: any) => ({
  schemaVersion: 2,
  purpose: "WORKING_PAPER",
  blockers: [],
  period: { from: "2025-01-01", to: "2025-12-31" },
  property: { id: property.id, name: property.name, address: property.address, city: property.city },
  unit: { id: unit.id, label: unit.label },
  lease: { id: lease.id, contractNumber: null, tenantNames: ["QA"] },
  totals: { advancesCents: 1000000, actualCostsCents: 1200000, balanceCents: 200000 },
  advances: [{ period: "2025-01", amountCents: 1000000 }],
  costs: [{ sourceCostId: "x", title: "Voda", effectiveAt: "2025-12-31", sourceAmountCents: 1200000, allocatedAmountCents: 1200000, allocationLabel: "QA", documentCount: 1 }],
  meters: [],
  warnings: [],
});

async function main() {
  const tag = `R26EF-${Date.now()}`;
  try {
    const user = await db.user.create({ data: { email: `${tag}@test.invalid`, name: tag, passwordHash: "x", role: "SUPER_ADMIN", allProperties: true } });
    const owner = await db.owner.create({ data: { name: tag } });
    const property = await db.property.create({ data: { ownerId: owner.id, name: tag, address: "QA 1", city: "Praha" } });
    const unit = await db.unit.create({ data: { propertyId: property.id, label: "1" } });
    const tenant = await db.tenant.create({ data: { name: "QA" } });
    const lease = await db.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, startDate: new Date("2025-01-01T12:00:00Z"), financialTrackingFromPeriod: "2025-01", variableSymbol: String(Date.now()).slice(-9), rentCents: 100000, servicesCents: 1000000, autoChargesEnabled: false } });
    const charge = await db.charge.create({ data: { leaseId: lease.id, period: "2025-01", dueDate: new Date("2025-01-05"), amountCents: 1100000, items: { create: [{ name: "Nájem", category: "RENT", amountCents: 100000 }, { name: "Služby", category: "SERVICES", amountCents: 1000000 }] } } });
    const account = await db.bankAccount.create({ data: { propertyId: property.id, provider: "QA", bankName: "QA", ibanMasked: "QA", externalAccountId: tag } });
    const tx = await db.bankTransaction.create({ data: { bankAccountId: account.id, externalId: tag, bookedAt: new Date("2025-01-05"), amountCents: 1100000, status: "MATCHED" } });
    await db.paymentAllocation.create({ data: { transactionId: tx.id, chargeId: charge.id, amountCents: 1100000 } });
    await db.settlementSource.create({ data: { propertyId: property.id, identityKey: tag, version: 1, payload: { schemaVersion: 1, mode: "EXTERNAL_UNIT", kind: "EXTERNAL", vendor: "QA", reference: tag, from: "2025-01-01", to: "2025-12-31", supplyAmount: "12000", supplierAdvances: "0", unitId: unit.id, creditForId: "", propertyCostId: "", revisionReason: "", lines: [{ key: "water", service: "WATER", role: "COST", from: "2025-01-01", to: "2025-12-31", amount: "12000", unitId: unit.id, leaseId: lease.id, base: "", consumptionComponent: "", correction: "", rounding: "", quantity: "", measure: "", explanation: "", componentsComplete: false, ownerOverride: false, ownerReason: "" }] }, createdById: user.id, confirmedById: user.id, confirmedAt: new Date(), confirmation: { qa: true } } });
    const protocol = await db.serviceSettlementProtocol.create({ data: { leaseId: lease.id, periodFrom: new Date("2025-01-01"), periodTo: new Date("2025-12-31"), advancesCents: 1000000, actualCostsCents: 1200000, balanceCents: 200000, snapshot: snapshot(property, unit, lease), issuedById: user.id } });

    await check("payment close uses confirmed bank payment, not prescribed amount alone", async () => {
      const workflow = await closeSettlementPayments(user, protocol.id);
      const payment = workflow.paymentSnapshot as any;
      assert.equal(payment.paidServiceAdvancesCents, 1000000);
      assert.equal(payment.finalBalanceCents, 200000);
      assert.deepEqual(payment.blockers, []);
    });

    await check("approval creates no financial movement", async () => {
      await approveSettlement(user, protocol.id);
      assert.equal(await db.charge.count({ where: { period: { startsWith: "SETTLEMENT-FINAL-" } } }), 0);
      assert.equal(await db.leaseCredit.count({ where: { leaseId: lease.id } }), 0);
    });

    await check("delivery and objection block financial settlement", async () => {
      await deliverSettlement(user, protocol.id, { method: "E-mail", reference: "qa", objectionUntil: new Date("2025-01-01") });
      await recordSettlementObjection(user, protocol.id, "Nájemce žádá kontrolu vody.");
      await assert.rejects(() => settleSettlement(user, protocol.id, new Date()), /nevyřešenou námitku/);
      await resolveSettlementObjection(user, protocol.id, "Kontrola provedena, podklady beze změny.");
    });

    await check("settlement posts exactly one final debit", async () => {
      const workflow = await settleSettlement(user, protocol.id, new Date("2026-01-15"));
      assert.ok(workflow.chargeId);
      assert.equal(workflow.creditId, null);
      const finalCharge = await db.charge.findUniqueOrThrow({ where: { id: workflow.chargeId! } });
      assert.equal(finalCharge.amountCents, 200000);
      await assert.rejects(() => settleSettlement(user, protocol.id, new Date()), /už bylo finančně vypořádáno|Vypořádat lze/);
    });

    console.log(`R26E/F workflow: ${n} checks.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
