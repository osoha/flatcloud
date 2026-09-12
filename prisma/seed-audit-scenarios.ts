import type { PrismaClient } from "@prisma/client";

const cents = (value: number) => value * 100;
const marker = "QA_SCENARIOS_Q1_Q4_V1";

export async function ensureAuditScenarios(prisma: PrismaClient, adminId: string) {
  if (await prisma.property.findFirst({ where: { note: marker }, select: { id: true } })) {
    console.log("Scénářová QA data Q1–Q4 již existují.");
    return;
  }

  const owner = await prisma.owner.create({ data: { name: "QA · Audit scénáře", affiliation: "EXTERNAL", note: marker } });
  const property = await prisma.property.create({ data: {
    name: "QA · Regresní scénáře Q1–Q3", address: "Testovací 123", city: "Praha", ownerId: owner.id,
    note: marker, flatcloudConsolidationBasisPoints: 0,
  } });
  const paymentAccount = await prisma.ownerBankAccount.create({ data: { ownerId: owner.id, label: "QA scénáře · nájemné", accountNumber: "999000111", bankCode: "0800" } });
  await prisma.propertyPaymentAccount.create({ data: { propertyId: property.id, ownerBankAccountId: paymentAccount.id, primary: true } });
  const bankAccount = await prisma.bankAccount.create({ data: { propertyId: property.id, ownerId: owner.id, provider: "mock", bankName: "QA banka", ibanMasked: "999000111/0800", externalAccountId: "qa-audit-scenarios-v1" } });

  async function scenarioLease(input: { label: string; tenant: string; email: string; vs: string; rent: number; services: number; deposit?: number; interestBps?: number }) {
    const unit = await prisma.unit.create({ data: { propertyId: property.id, label: input.label, status: "OCCUPIED", type: "APARTMENT", areaM2: 50, ownerships: { create: { ownerId: owner.id, ownerBankAccountId: paymentAccount.id, shareBasisPoints: 10000 } } } });
    const tenant = await prisma.tenant.create({ data: { name: input.tenant, email: input.email, payerAccounts: [`CZQA${input.vs}`] } });
    await prisma.tenantProperty.create({ data: { tenantId: tenant.id, propertyId: property.id } });
    const lease = await prisma.lease.create({ data: {
      unitId: unit.id, tenantId: tenant.id, ownerBankAccountId: paymentAccount.id, tenantBankAccount: tenant.payerAccounts[0],
      contractNumber: `QA-${input.label}`, startDate: new Date("2025-01-01T12:00:00Z"), financialTrackingFromPeriod: "2025-01",
      variableSymbol: input.vs, rentCents: cents(input.rent), servicesCents: cents(input.services), depositCents: cents(input.deposit || 0),
      autoChargesEnabled: false, note: marker,
      parties: { create: { tenantId: tenant.id, role: "CONTRACTING_PARTY", isPrimary: true } },
      paymentItems: { create: [
        { name: "Nájemné", category: "RENT", amountCents: cents(input.rent), validFrom: new Date("2025-01-01T12:00:00Z"), sortOrder: 10 },
        { name: "Zálohy na služby", category: "SERVICES", amountCents: cents(input.services), validFrom: new Date("2025-01-01T12:00:00Z"), sortOrder: 20 },
      ] },
      securityDepositTerms: input.deposit || input.interestBps ? { create: { agreedAmountCents: cents(input.deposit || 0), annualRateBps: input.interestBps || 0, effectiveFrom: new Date("2025-01-01T12:00:00Z"), createdById: adminId, note: marker } } : undefined,
    } });
    return lease;
  }

  await scenarioLease({ label: "Q1 · Bezzměnový round-trip", tenant: "QA Q1 · Jana Bezzměnová", email: "qa-q1@example.test", vs: "910000001", rent: 19_000, services: 2_500, deposit: 38_000, interestBps: 275 });

  const q2 = await scenarioLease({ label: "Q2 · Změna 19→20 tis.", tenant: "QA Q2 · Petr Historie", email: "qa-q2@example.test", vs: "910000002", rent: 20_000, services: 2_500 });
  const initialRent = await prisma.leasePaymentItem.findFirstOrThrow({ where: { leaseId: q2.id, category: "RENT" } });
  await prisma.leasePaymentItem.update({ where: { id: initialRent.id }, data: { amountCents: cents(19_000), validTo: new Date("2026-09-30T12:00:00Z") } });
  await prisma.leasePaymentItem.create({ data: { leaseId: q2.id, name: "Nájemné", category: "RENT", amountCents: cents(20_000), validFrom: new Date("2026-10-01T12:00:00Z"), sortOrder: 10 } });
  await prisma.charge.create({ data: { leaseId: q2.id, period: "2026-09", dueDate: new Date("2026-09-05T12:00:00Z"), amountCents: cents(21_500), items: { create: [{ name: "Nájemné", category: "RENT", amountCents: cents(19_000) }, { name: "Zálohy na služby", category: "SERVICES", amountCents: cents(2_500) }] } } });
  await prisma.charge.create({ data: { leaseId: q2.id, period: "2026-10", dueDate: new Date("2026-10-05T12:00:00Z"), amountCents: cents(22_500), items: { create: [{ name: "Nájemné", category: "RENT", amountCents: cents(20_000) }, { name: "Zálohy na služby", category: "SERVICES", amountCents: cents(2_500) }] } } });

  const q3 = await scenarioLease({ label: "Q3 · Částečná úhrada", tenant: "QA Q3 · Alena Alokace", email: "qa-q3@example.test", vs: "910000003", rent: 19_000, services: 2_500 });
  const q3Charge = await prisma.charge.create({ data: { leaseId: q3.id, period: "2026-10", dueDate: new Date("2026-10-05T12:00:00Z"), amountCents: cents(21_500), items: { create: [{ name: "Nájemné", category: "RENT", amountCents: cents(19_000) }, { name: "Zálohy na služby", category: "SERVICES", amountCents: cents(2_500) }] } } });
  const transaction = await prisma.bankTransaction.create({ data: { bankAccountId: bankAccount.id, externalId: "qa-q3-partial", bookedAt: new Date("2026-09-20T12:00:00Z"), amountCents: cents(10_000), counterpartyName: "QA Q3 · Alena Alokace", variableSymbol: q3.variableSymbol, status: "PARTIAL" } });
  await prisma.paymentAllocation.create({ data: { transactionId: transaction.id, chargeId: q3Charge.id, amountCents: cents(10_000) } });

  const q4 = await prisma.property.create({ data: { name: "QA Q4 · Objekt bez účtu", address: "Bez účtu 4", city: "Brno", ownerId: owner.id, note: "QA_SCENARIO_Q4_NO_ACCOUNT", flatcloudConsolidationBasisPoints: 0 } });
  await prisma.propertyOwnership.create({ data: { propertyId: q4.id, ownerId: owner.id, shareBasisPoints: 10000 } });
  await prisma.unit.create({ data: { propertyId: q4.id, label: "Q4 · Volná bez účtu", status: "VACANT", type: "APARTMENT", areaM2: 42, ownerships: { create: { ownerId: owner.id, shareBasisPoints: 10000 } } } });
  await prisma.auditLog.create({ data: { userId: adminId, action: "QA_SCENARIOS_CREATED", entityType: "System", details: { marker, scenarios: ["Q1", "Q2", "Q3", "Q4"] } } });
  console.log("Scénářová QA data Q1–Q4 byla vložena.");
}
