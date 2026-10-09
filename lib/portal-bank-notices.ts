import { prisma } from "./db";

/** The issued recipient snapshot remains authoritative after a lease ends or changes tenant. */
export async function portalBankNotices(tenantId: string, userId: string, leaseIds: string[], preview: boolean) {
  if (preview && !leaseIds.length) return [];
  return prisma.bankAccountNotice.findMany({
    where: { tenantIds: { has: tenantId }, ...(preview ? { leaseId: { in: leaseIds } } : {}) },
    select: { id: true, leaseId: true, title: true, body: true, pdfHash: true, createdAt: true,
      change: { select: { status: true, effectiveAt: true } },
      reads: { where: { userId: preview ? "" : userId }, select: { confirmedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
}
export type PortalBankNotice = Awaited<ReturnType<typeof portalBankNotices>>[number];
