import { prisma } from "@/lib/db";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { createLeaseFromForm } from "@/lib/lease-create";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const result = await prisma.$transaction((tx) => createLeaseFromForm(tx, id, form, undefined, access.user.id));
    await audit(access.user.id, "TENANT_AND_LEASE_CREATED", "Lease", result.lease.id, { propertyId: id, leaseId: result.lease.id, tenantId: result.tenant.id, unitId: result.unitId, legalStartDate: result.lease.startDate.toISOString(), financialTrackingFrom: result.financialTrackingFromPeriod, openingBalanceType: result.openingBalanceType, openingBalanceCents: result.openingBalanceCents, openingChargeId: result.openingChargeId, openingCreditId: result.openingCreditId, lifecycleStatus: result.derivedStatus, ownerBankAccountId: result.ownerBankAccountId, tenantBankAccount: Boolean(result.tenantBankAccount) }, id);
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${result.unitId}`, "ok", "Nájemník a smlouva byli vytvořeni.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/najemnici/novy`, "error", error instanceof Error ? error.message : "Nájemníka se nepodařilo vytvořit.");
  }
}
