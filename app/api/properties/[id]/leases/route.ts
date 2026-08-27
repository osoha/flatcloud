import { prisma } from "@/lib/db";
import { requireManagedProperty, audit } from "@/lib/management";
import { tenantAccessWhere } from "@/lib/access";
import { go, goWithMessage } from "@/lib/route-response";
import { createLeaseFromForm } from "@/lib/lease-create";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const tenantId = String(form.get("tenantId") || "").trim();
    if (!tenantId) throw new Error("Vyberte nájemníka.");
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, ...tenantAccessWhere(access.user) }, select: { id: true } });
    if (!tenant) throw new Error("Vybraný nájemník není v rozsahu vašich oprávnění.");
    const result = await prisma.$transaction((tx) => createLeaseFromForm(tx, id, form, tenantId));
    await audit(access.user.id, "LEASE_CREATED", "Lease", result.lease.id, { propertyId: id, tenantId, unitId: result.unitId, lifecycleStatus: result.derivedStatus, ownerBankAccountId: result.ownerBankAccountId, tenantBankAccount: Boolean(result.tenantBankAccount), autoChargesEnabled: result.autoChargesEnabled, indexationEnabled: result.indexationEnabled }, id);
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/${result.lease.id}`, "ok", result.autoChargesEnabled ? "Smlouva i automatické předpisy byly vytvořeny." : "Smlouva byla vytvořena bez automatických předpisů.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy/nova`, "error", error instanceof Error ? error.message : "Smlouvu se nepodařilo vytvořit.");
  }
}
