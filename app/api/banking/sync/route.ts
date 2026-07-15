import { NextResponse } from "next/server";
import { currentUser, canManageProperty, canSeeAll } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bankingProvider } from "@/lib/banking";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);
  if (!canManageProperty(user.role)) return new NextResponse("Forbidden", { status: 403 });

  const form = await request.formData();
  const propertyId = String(form.get("propertyId") || "");
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      ...(canSeeAll(user.role) ? {} : { memberships: { some: { userId: user.id } } }),
    },
    include: { bankAccounts: true },
  });
  if (!property) return new NextResponse("Forbidden", { status: 403 });

  const account = property.bankAccounts[0];
  if (!account) return NextResponse.redirect(new URL(`/nemovitosti/${propertyId}/banka`, request.url), 303);

  const incoming = await bankingProvider().sync(account);
  await prisma.$transaction(async (transaction) => {
    for (const item of incoming) {
      await transaction.bankTransaction.upsert({
        where: { bankAccountId_externalId: { bankAccountId: account.id, externalId: item.externalId } },
        update: { ...item },
        create: { ...item, bankAccountId: account.id },
      });
    }
    await transaction.bankAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } });
    await transaction.auditLog.create({
      data: {
        userId: user.id,
        action: "BANK_SYNC",
        entityType: "BankAccount",
        entityId: account.id,
        details: { count: incoming.length },
      },
    });
  });

  return NextResponse.redirect(new URL(`/nemovitosti/${propertyId}/banka`, request.url), 303);
}
