import { prisma } from "./db";

type OwnerViewer = { id: string; email: string; role: string };

export function normalizedOwnerEmail(value: string) {
  return value.trim().toLocaleLowerCase("cs-CZ");
}

function authorizedOwnershipWhere(userId: string, propertyId: string) {
  return {
    unit: {
      propertyId,
      OR: [
        { userAccesses: { some: { userId } } },
        { property: { memberships: { some: { userId } } } },
      ],
    },
  };
}

export async function ownerSelfServiceScope(user: OwnerViewer, propertyId: string) {
  if (user.role !== "OWNER_VIEWER") return null;
  const email = normalizedOwnerEmail(user.email);
  if (!email) return null;

  const candidates = await prisma.owner.findMany({
    where: { active: true, email: { not: null } },
    select: { id: true, email: true },
  });
  const exact = candidates.filter((owner) => owner.email && normalizedOwnerEmail(owner.email) === email);
  if (exact.length !== 1) return null;

  const owner = exact[0];
  const unitOwnerships = await prisma.unitOwnership.findMany({
    where: { ownerId: owner.id, ...authorizedOwnershipWhere(user.id, propertyId) },
    include: { unit: { include: { property: { select: { id: true, name: true } } } } },
    orderBy: { unit: { label: "asc" } },
  });
  if (!unitOwnerships.length) return null;

  const assignedAccountIds = [...new Set(unitOwnerships.map((row) => row.ownerBankAccountId).filter((id): id is string => Boolean(id)))];
  const paymentAccounts = assignedAccountIds.length
    ? await prisma.ownerBankAccount.findMany({
        where: { id: { in: assignedAccountIds }, ownerId: owner.id },
        orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      })
    : [];
  return { ...owner, unitOwnerships, paymentAccounts };
}

export async function requireOwnedAccount(user: OwnerViewer, propertyId: string, accountId: string) {
  const scope = await ownerSelfServiceScope(user, propertyId);
  if (!scope || !scope.paymentAccounts.some((account) => account.id === accountId)) return null;
  return scope;
}
