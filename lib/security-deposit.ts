import { prisma } from "./db";
import { leaseAccessWhere } from "./access";
import { calculateSecurityDepositSnapshot } from "./security-deposit-core";
import { pragueDateKey } from "./lease-lifecycle-core";

export const securityDepositLeaseInclude = {
  tenant: true,
  unit: { include: { property: true } },
  securityDepositTerms: { orderBy: [{ effectiveFrom: "asc" as const }, { createdAt: "asc" as const }] },
  securityDepositMovements: { orderBy: [{ effectiveAt: "asc" as const }, { createdAt: "asc" as const }] },
};

export async function findVisibleSecurityDepositLeases(user: { id: string; role: string; allProperties?: boolean }) {
  return prisma.lease.findMany({ where: leaseAccessWhere(user), include: securityDepositLeaseInclude, orderBy: { startDate: "desc" } });
}

export function securityDepositDateAsOf(asOf: Date) {
  return new Date(`${pragueDateKey(asOf)}T23:59:59.999Z`);
}

export function securityDepositSnapshot(lease: { depositCents: number; endDate: Date | null; terminatedOn?: Date | null; securityDepositTerms: Parameters<typeof calculateSecurityDepositSnapshot>[0]["terms"]; securityDepositMovements: Parameters<typeof calculateSecurityDepositSnapshot>[0]["movements"] }, asOf = new Date()) {
  const dateAsOf = securityDepositDateAsOf(asOf);
  return calculateSecurityDepositSnapshot({ depositCents: lease.depositCents, terms: lease.securityDepositTerms, movements: lease.securityDepositMovements, asOf: dateAsOf, leaseEnded: Boolean(lease.terminatedOn || lease.endDate && lease.endDate <= dateAsOf) });
}
