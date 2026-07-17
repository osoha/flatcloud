import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const cents = (value: number) => value * 100;

async function main() {
  const existingProperties = await prisma.property.count();
  if (existingProperties > 0) {
    console.log("Demo data nebyla vložena: databáze již obsahuje nemovitosti.");
    return;
  }

  const admin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN", active: true } });
  if (!admin) throw new Error("Nejprve vytvořte administrátora příkazem npm run db:bootstrap.");

  const flatcloud = await prisma.owner.create({ data: { name: "FlatCloud a.s.", ico: "09123456" } });
  const externalOwner = await prisma.owner.create({ data: { name: "Externí vlastník" } });
  const definitions = [
    { name: "Moskevská", address: "Moskevská 18", city: "Ústí nad Labem", ownerId: flatcloud.id, bank: "Česká spořitelna", accountNumber: "123456789", bankCode: "0800" },
    { name: "Karla Aksamita", address: "Karla Aksamita 12", city: "Teplice", ownerId: flatcloud.id, bank: "Česká spořitelna", accountNumber: "987654321", bankCode: "0800" },
    { name: "Dům ve správě", address: "Korunní 42", city: "Praha", ownerId: externalOwner.id, bank: "Raiffeisenbank", accountNumber: "456789123", bankCode: "5500" },
  ];

  for (let propertyIndex = 0; propertyIndex < definitions.length; propertyIndex += 1) {
    const definition = definitions[propertyIndex];
    const property = await prisma.property.create({
      data: {
        name: definition.name,
        address: definition.address,
        city: definition.city,
        ownerId: definition.ownerId,
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
        lastSyncedAt: new Date(),
      },
    });

    const paymentAccount = await prisma.ownerBankAccount.create({ data: { ownerId: definition.ownerId, label: `${definition.name} – nájemné`, accountNumber: definition.accountNumber, bankCode: definition.bankCode } });

    for (let index = 1; index <= 5; index += 1) {
      const unit = await prisma.unit.create({
        data: { propertyId: property.id, label: `${index}.0${index}`, floor: `${index}. NP`, status: "OCCUPIED", type: "APARTMENT", ownerships: { create: { ownerId: definition.ownerId, ownerBankAccountId: paymentAccount.id, shareBasisPoints: 10000 } } },
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
          variableSymbol: `${propertyIndex + 1}00${index}`,
          rentCents: cents(11_000 + index * 500),
          servicesCents: cents(2_500),
          depositCents: cents(30_000),
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
