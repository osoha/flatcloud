import { PrismaClient } from "@prisma/client";
import { ensureAuditScenarios } from "./seed-audit-scenarios";

const prisma = new PrismaClient();
const cents = (value: number) => value * 100;

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN", active: true } });
  if (!admin) throw new Error("Nejprve vytvořte administrátora příkazem npm run db:bootstrap.");
  const existingProperties = await prisma.property.count();
  if (existingProperties > 0) {
    await ensureAuditScenarios(prisma, admin.id);
    console.log("Základní demo data nebyla vložena: databáze již obsahuje nemovitosti.");
    return;
  }

  const flatcloud = await prisma.owner.create({ data: { name: "FlatCloud a.s.", ico: "09123456", affiliation: "FLATCLOUD_PARENT" } });
  const externalOwner = await prisma.owner.create({ data: { name: "Externí vlastník", affiliation: "EXTERNAL" } });
  const definitions = [
    { name: "Moskevská", address: "Moskevská 18", city: "Ústí nad Labem", ownerId: flatcloud.id, consolidationBasisPoints: 10000, bank: "Česká spořitelna", accountNumber: "123456789", bankCode: "0800" },
    { name: "Karla Aksamita", address: "Karla Aksamita 12", city: "Teplice", ownerId: flatcloud.id, consolidationBasisPoints: 10000, bank: "Česká spořitelna", accountNumber: "987654321", bankCode: "0800" },
    { name: "Dům ve správě", address: "Korunní 42", city: "Praha", ownerId: externalOwner.id, consolidationBasisPoints: 0, bank: "Raiffeisenbank", accountNumber: "456789123", bankCode: "5500" },
  ];

  for (let propertyIndex = 0; propertyIndex < definitions.length; propertyIndex += 1) {
    const definition = definitions[propertyIndex];
    const property = await prisma.property.create({
      data: {
        name: definition.name,
        address: definition.address,
        city: definition.city,
        ownerId: definition.ownerId,
        flatcloudConsolidationBasisPoints: definition.consolidationBasisPoints,
      },
    });
    const bankAccount = await prisma.bankAccount.create({
      data: {
        propertyId: property.id,
        provider: "mock",
        bankName: definition.bank,
        ownerId: definition.ownerId,
        ibanMasked: `${definition.accountNumber}/${definition.bankCode}`,
        externalAccountId: `mock-${propertyIndex + 1}`,
      },
    });

    const paymentAccount = await prisma.ownerBankAccount.create({ data: { ownerId: definition.ownerId, label: `${definition.name} – nájemné`, accountNumber: definition.accountNumber, bankCode: definition.bankCode } });
    await prisma.propertyPaymentAccount.create({ data: { propertyId: property.id, ownerBankAccountId: paymentAccount.id, primary: true } });

    if (propertyIndex === 0) {
      await prisma.propertyCost.createMany({ data: [
        { propertyId: property.id, kind: "OPEX", status: "ACTUAL", category: "MAINTENANCE", title: "Servis výtahu", amountCents: cents(18_500), effectiveAt: new Date("2026-03-15"), vendor: "Výtahy Servis s.r.o.", documentNumber: "FV-2026-0315" },
        { propertyId: property.id, kind: "CAPEX", status: "PLANNED", category: "CONSTRUCTION", title: "Revitalizace fasády", amountCents: cents(480_000), effectiveAt: new Date("2026-11-01") },
      ] });
      await prisma.propertyBudgetLine.createMany({ data: [
        { propertyId: property.id, year: 2026, kind: "OPEX", category: "MAINTENANCE", title: "Servis a údržba", amountCents: cents(120_000), note: "Schválený roční plán" },
        { propertyId: property.id, year: 2026, kind: "CAPEX", category: "CONSTRUCTION", title: "Investice do domu", amountCents: cents(600_000), note: "Schválený investiční rámec" },
      ] });
      await prisma.propertyLoan.create({ data: { propertyId: property.id, lender: "Česká spořitelna", label: "Investiční úvěr 2024", principalCents: cents(12_000_000), outstandingPrincipalCents: cents(9_250_000), annualInterestRateBps: 489, rateType: "FIXED", fixedUntil: new Date("2028-06-30"), maturityDate: new Date("2044-06-30"), monthlyDebtServiceCents: cents(78_000), snapshots: { create: { asOfDate: new Date("2026-08-31"), outstandingPrincipalCents: cents(9_250_000), annualInterestRateBps: 489, monthlyDebtServiceCents: cents(78_000), note: "Výpis banky" } } } });
    }
    if (propertyIndex < 2) await prisma.propertyValuationSnapshot.create({ data: { propertyId: property.id, asOfDate: new Date("2026-08-31"), marketValueCents: BigInt(cents(propertyIndex === 0 ? 25_000_000 : 18_000_000)), source: "INTERNAL", note: "Demo interní ocenění pro asset KPI", createdById: admin.id } });

    for (let index = 1; index <= 5; index += 1) {
      const unit = await prisma.unit.create({
        data: { propertyId: property.id, label: `${index}.0${index}`, floor: `${index}. NP`, status: "OCCUPIED", type: "APARTMENT", areaM2: 35 + index * 5, ownerships: { create: { ownerId: definition.ownerId, ownerBankAccountId: paymentAccount.id, shareBasisPoints: 10000 } } },
      });
      const tenantName = ["Jan Novák", "Petra Malá", "Tomáš Dvořák", "Eva Veselá", "Martin Černý"][index - 1];
      const tenant = await prisma.tenant.create({
        data: {
          name: tenantName,
          email: `najemnik${propertyIndex}${index}@example.cz`,
          payerAccounts: [`CZMOCK${propertyIndex}${index}`],
        },
      });
      const lease = await prisma.lease.create({
        data: {
          unitId: unit.id,
          tenantId: tenant.id,
          ownerBankAccountId: paymentAccount.id,
          tenantBankAccount: tenant.payerAccounts[0],
          startDate: new Date("2025-01-01"),
          financialTrackingFromPeriod: "2025-01",
          variableSymbol: `${propertyIndex + 1}00${index}`,
          rentCents: cents(11_000 + index * 500),
          servicesCents: cents(2_500),
          depositCents: cents(30_000),
          parties: { create: { tenantId: tenant.id, role: "CONTRACTING_PARTY", isPrimary: true } },
          paymentItems: {
            create: [
              { name: "Nájemné", category: "RENT", amountCents: cents(11_000 + index * 500), validFrom: new Date("2025-01-01"), sortOrder: 10 },
              { name: "Zálohy na služby", category: "SERVICES", amountCents: cents(2_500), validFrom: new Date("2025-01-01"), sortOrder: 20 },
            ],
          },
        },
      });
      const charge = await prisma.charge.create({
        data: {
          leaseId: lease.id,
          period: "2026-07",
          dueDate: new Date("2026-07-05"),
          amountCents: lease.rentCents + lease.servicesCents,
          items: {
            create: [
              { name: "Nájemné", category: "RENT", amountCents: lease.rentCents },
              { name: "Zálohy na služby", category: "SERVICES", amountCents: lease.servicesCents },
            ],
          },
        },
      });

      if (index < 5) {
        const transaction = await prisma.bankTransaction.create({
          data: {
            bankAccountId: bankAccount.id,
            externalId: `seed-${propertyIndex}-${index}`,
            bookedAt: new Date(`2026-07-0${index + 1}`),
            amountCents: charge.amountCents,
            counterpartyName: tenant.name,
            variableSymbol: lease.variableSymbol,
            status: "MATCHED",
          },
        });
        await prisma.paymentAllocation.create({
          data: { transactionId: transaction.id, chargeId: charge.id, amountCents: charge.amountCents },
        });
      }
    }
  }

  await ensureAuditScenarios(prisma, admin.id);

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "DEMO_DATA_CREATED",
      entityType: "System",
      details: { propertyCount: definitions.length },
    },
  });
  console.log("Nedestruktivní demo data byla vložena.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
