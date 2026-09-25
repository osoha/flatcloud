import { prisma } from "@/lib/db";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { createLeaseFromForm } from "@/lib/lease-create";
import { text } from "@/lib/forms";
import { tenantDataFromForm } from "@/lib/tenant-form";
import { processAvatarUpload } from "@/lib/avatar";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const uploadedAvatar = text(form, "avatarChoice") === "upload" ? await processAvatarUpload(form.get("avatar")) : null;
    if (text(form, "avatarChoice") === "upload" && !uploadedAvatar) throw new Error("Vyberte fotografii avatara.");
    if (text(form, "creationMode") === "PROFILE") {
      const tenant = await prisma.$transaction(async (tx) => {
        const created = await tx.tenant.create({ data: { ...tenantDataFromForm(form), ...uploadedAvatar, ...(uploadedAvatar ? { avatarChoice: null } : {}) } });
        await tx.tenantProperty.create({ data: { tenantId: created.id, propertyId: id } });
        return created;
      });
      await audit(access.user.id, "TENANT_CREATED", "Tenant", tenant.id, { propertyId: id, withoutLease: true }, id);
      return goWithMessage(request, `/najemnici/${tenant.id}`, "ok", "Profil nájemníka byl vytvořen. Nyní jej můžete přidat do nové nebo existující smlouvy.");
    }
    const result = await prisma.$transaction(async (tx) => {
      const created = await createLeaseFromForm(tx, id, form, undefined, access.user.id);
      if (uploadedAvatar) await tx.tenant.update({ where: { id: created.tenant.id }, data: { ...uploadedAvatar, avatarChoice: null } });
      return created;
    });
    await audit(access.user.id, "TENANT_AND_LEASE_CREATED", "Lease", result.lease.id, { propertyId: id, leaseId: result.lease.id, tenantId: result.tenant.id, unitId: result.unitId, legalStartDate: result.lease.startDate.toISOString(), financialTrackingFrom: result.financialTrackingFromPeriod, openingBalanceType: result.openingBalanceType, openingBalanceCents: result.openingBalanceCents, openingChargeId: result.openingChargeId, openingCreditId: result.openingCreditId, agreedDepositCents: result.agreedDepositCents, openingDepositStatus: result.openingDepositStatus, openingDepositHeldCents: result.openingDepositHeldCents, openingDepositMovementId: result.openingDepositMovementId, lifecycleStatus: result.derivedStatus, ownerBankAccountId: result.ownerBankAccountId, tenantBankAccount: Boolean(result.tenantBankAccount) }, id);
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${result.unitId}`, "ok", "Nájemník a smlouva byli vytvořeni.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/najemnici/novy`, "error", error instanceof Error ? error.message : "Nájemníka se nepodařilo vytvořit.");
  }
}
