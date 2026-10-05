import { prisma } from "@/lib/db";
import { requireManagedProperty, audit } from "@/lib/management";
import { tenantAccessWhere } from "@/lib/access";
import { go, goWithMessage } from "@/lib/route-response";
import { createLeaseFromForm } from "@/lib/lease-create";
import { stringArray } from "@/lib/forms";
import { allSelectedPartyIds, normalizeLeasePartySelections } from "@/lib/lease-parties";
import {runAutoTenantPortalInvitations} from "@/lib/tenant-portal-auto-invite";

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
    let invitations:Awaited<ReturnType<typeof runAutoTenantPortalInvitations>>|null=null;
    if(result.lease.autoPortalInvitationPending)try{invitations=await runAutoTenantPortalInvitations(result.lease.id);}catch(error){console.error("Tenant portal invitation failed after lease creation",{leaseId:result.lease.id,error});invitations={invited:0,waiting:0,skipped:0,failed:1,summary:"Pozvánku se nepodařilo připravit."};}
    const invitationNote=invitations?.failed?" Pozvánku se nepodařilo odeslat; zkontrolujte kartu nájemníka.":invitations?.invited?" Pozvánka do portálu byla připravena.":invitations?.waiting?" Pozvánka do portálu čeká na začátek smlouvy.":"";
    return goWithMessage(request, result.lease.documentOrigin === "NEW"
        ? `/smlouvy/${result.lease.id}/pripravit`
        : `/smlouvy/${result.lease.id}#dokumenty`, "ok", (result.autoChargesEnabled ? "Smlouva i automatické předpisy byly vytvořeny." : "Smlouva byla vytvořena bez automatických předpisů.")+invitationNote);
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy/nova`, "error", error instanceof Error ? error.message : "Smlouvu se nepodařilo vytvořit.");
  }
}
