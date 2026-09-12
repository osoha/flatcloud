import { prisma } from "@/lib/db";
import { requireManagedProperty, audit } from "@/lib/management";
import { tenantAccessWhere } from "@/lib/access";
import { go, goWithMessage } from "@/lib/route-response";
import { createLeaseFromForm } from "@/lib/lease-create";
import { stringArray } from "@/lib/forms";
import { allSelectedPartyIds, normalizeLeasePartySelections } from "@/lib/lease-parties";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const tenantId = String(form.get("tenantId") || "").trim();
    if (!tenantId) throw new Error("Vyberte nájemníka.");
    const partySelections = normalizeLeasePartySelections(tenantId, {
      contractingPartyIds: stringArray(form, "contractingPartyIds"),
      payerPartyIds: stringArray(form, "payerPartyIds"),
      contactPartyIds: stringArray(form, "contactPartyIds"),
      guarantorPartyIds: stringArray(form, "guarantorPartyIds"),
    });
    const requestedTenantIds = allSelectedPartyIds(tenantId, partySelections);
    const allowedTenants = await prisma.tenant.findMany({ where: { AND: [{ id: { in: requestedTenantIds } }, tenantAccessWhere(access.user)] }, select: { id: true } });
    const tenant = allowedTenants.find((row) => row.id === tenantId);
    if (!tenant) throw new Error("Vybraný nájemník není v rozsahu vašich oprávnění.");
    if (allowedTenants.length !== requestedTenantIds.length) throw new Error("Některá další smluvní strana není v rozsahu vašich oprávnění.");
    const result = await prisma.$transaction((tx) => createLeaseFromForm(tx, id, form, tenantId, access.user.id, partySelections));
    await audit(access.user.id, "LEASE_CREATED", "Lease", result.lease.id, { propertyId: id, leaseId: result.lease.id, tenantId, contractingPartyIds: result.contractingPartyIds, partyRoles: result.parties, unitId: result.unitId, legalStartDate: result.lease.startDate.toISOString(), financialTrackingFrom: result.financialTrackingFromPeriod, openingBalanceType: result.openingBalanceType, openingBalanceCents: result.openingBalanceCents, openingChargeId: result.openingChargeId, openingCreditId: result.openingCreditId, agreedDepositCents: result.agreedDepositCents, openingDepositStatus: result.openingDepositStatus, openingDepositHeldCents: result.openingDepositHeldCents, openingDepositMovementId: result.openingDepositMovementId, lifecycleStatus: result.derivedStatus, ownerBankAccountId: result.ownerBankAccountId, tenantBankAccount: Boolean(result.tenantBankAccount), autoChargesEnabled: result.autoChargesEnabled, indexationEnabled: result.indexationEnabled }, id);
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/${result.lease.id}`, "ok", result.autoChargesEnabled ? "Smlouva i automatické předpisy byly vytvořeny." : "Smlouva byla vytvořena bez automatických předpisů.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy/nova`, "error", error instanceof Error ? error.message : "Smlouvu se nepodařilo vytvořit.");
  }
}
