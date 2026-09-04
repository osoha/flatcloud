import { LeasePartyRole, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export function normalizeContractingPartyIds(primaryTenantId: string, tenantIds: string[]) {
  return Array.from(
    new Set(tenantIds.map((id) => id.trim()).filter((id) => id && id !== primaryTenantId)),
  );
}

export async function syncContractingParties(
  tx: Tx,
  leaseId: string,
  primaryTenantId: string,
  additionalTenantIds: string[],
) {
  const secondaryIds = normalizeContractingPartyIds(primaryTenantId, additionalTenantIds);
  const retainedIds = [primaryTenantId, ...secondaryIds];

  await tx.leaseParty.deleteMany({
    where: {
      leaseId,
      role: LeasePartyRole.CONTRACTING_PARTY,
      tenantId: { notIn: retainedIds },
    },
  });
  await tx.leaseParty.updateMany({
    where: { leaseId, role: LeasePartyRole.CONTRACTING_PARTY, isPrimary: true },
    data: { isPrimary: false },
  });
  await tx.leaseParty.upsert({
    where: {
      leaseId_tenantId_role: {
        leaseId,
        tenantId: primaryTenantId,
        role: LeasePartyRole.CONTRACTING_PARTY,
      },
    },
    update: { isPrimary: true },
    create: {
      leaseId,
      tenantId: primaryTenantId,
      role: LeasePartyRole.CONTRACTING_PARTY,
      isPrimary: true,
    },
  });
  for (const tenantId of secondaryIds) {
    await tx.leaseParty.upsert({
      where: {
        leaseId_tenantId_role: {
          leaseId,
          tenantId,
          role: LeasePartyRole.CONTRACTING_PARTY,
        },
      },
      update: { isPrimary: false },
      create: {
        leaseId,
        tenantId,
        role: LeasePartyRole.CONTRACTING_PARTY,
        isPrimary: false,
      },
    });
  }

  return retainedIds;
}

export function contractingPartyNames(lease: {
  tenant: { id: string; name: string };
  parties?: Array<{
    role: LeasePartyRole | string;
    isPrimary: boolean;
    tenant: { id: string; name: string };
  }>;
}) {
  const explicit = (lease.parties || [])
    .filter((party) => party.role === LeasePartyRole.CONTRACTING_PARTY)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const names = explicit.map((party) => party.tenant.name);
  return names.length ? names : [lease.tenant.name];
}
