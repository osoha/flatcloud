import { LeasePartyRole, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type LeasePartySelections = {
  contractingPartyIds?: string[];
  payerPartyIds?: string[];
  contactPartyIds?: string[];
  guarantorPartyIds?: string[];
};

function normalizeIds(primaryTenantId: string, tenantIds: string[] = []) {
  return Array.from(new Set(tenantIds.map((id) => id.trim()).filter((id) => id && id !== primaryTenantId)));
}

export function normalizeLeasePartySelections(primaryTenantId: string, selections: LeasePartySelections) {
  return {
    contractingPartyIds: normalizeIds(primaryTenantId, selections.contractingPartyIds),
    payerPartyIds: normalizeIds(primaryTenantId, selections.payerPartyIds),
    contactPartyIds: normalizeIds(primaryTenantId, selections.contactPartyIds),
    guarantorPartyIds: normalizeIds(primaryTenantId, selections.guarantorPartyIds),
  };
}

export function normalizeContractingPartyIds(primaryTenantId: string, tenantIds: string[]) {
  return normalizeLeasePartySelections(primaryTenantId, { contractingPartyIds: tenantIds }).contractingPartyIds;
}

async function syncRole(tx: Tx, leaseId: string, role: LeasePartyRole, primaryTenantId: string | null, tenantIds: string[]) {
  const retainedIds = [...(primaryTenantId ? [primaryTenantId] : []), ...tenantIds];
  await tx.leaseParty.deleteMany({ where: { leaseId, role, tenantId: { notIn: retainedIds } } });
  await tx.leaseParty.updateMany({ where: { leaseId, role, isPrimary: true }, data: { isPrimary: false } });
  for (const tenantId of retainedIds) {
    await tx.leaseParty.upsert({
      where: { leaseId_tenantId_role: { leaseId, tenantId, role } },
      update: { isPrimary: tenantId === primaryTenantId },
      create: { leaseId, tenantId, role, isPrimary: tenantId === primaryTenantId },
    });
  }
}

export async function syncLeaseParties(tx: Tx, leaseId: string, primaryTenantId: string, selections: LeasePartySelections = {}) {
  const normalized = normalizeLeasePartySelections(primaryTenantId, selections);
  await syncRole(tx, leaseId, LeasePartyRole.CONTRACTING_PARTY, primaryTenantId, normalized.contractingPartyIds);
  await syncRole(tx, leaseId, LeasePartyRole.PAYER, primaryTenantId, normalized.payerPartyIds);
  await syncRole(tx, leaseId, LeasePartyRole.CONTACT, primaryTenantId, normalized.contactPartyIds);
  await syncRole(tx, leaseId, LeasePartyRole.GUARANTOR, null, normalized.guarantorPartyIds);
  return normalized;
}

export async function syncContractingParties(tx: Tx, leaseId: string, primaryTenantId: string, additionalTenantIds: string[]) {
  const normalized = await syncLeaseParties(tx, leaseId, primaryTenantId, { contractingPartyIds: additionalTenantIds });
  return [primaryTenantId, ...normalized.contractingPartyIds];
}

export function allSelectedPartyIds(primaryTenantId: string, selections: LeasePartySelections) {
  const normalized = normalizeLeasePartySelections(primaryTenantId, selections);
  return Array.from(new Set([primaryTenantId, ...Object.values(normalized).flat()]));
}

export function contractingPartyNames(lease: {
  tenant: { id: string; name: string };
  parties?: Array<{ role: LeasePartyRole | string; isPrimary: boolean; tenant: { id: string; name: string } }>;
}) {
  const explicit = (lease.parties || [])
    .filter((party) => party.role === LeasePartyRole.CONTRACTING_PARTY)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const names = explicit.map((party) => party.tenant.name);
  return names.length ? names : [lease.tenant.name];
}
