import { TenantType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, stringArray, text } from "@/lib/forms";
import { normalizePayerAccount } from "@/lib/owner-bank-account";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; tenantId: string }> }) {
  const { id, tenantId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const allowed = await prisma.tenant.findFirst({ where: { id: tenantId, leases: { some: { unit: { propertyId: id } } } }, include: { leases: { where: { unit: { propertyId: id } }, orderBy: { startDate: "desc" }, take: 1 } } });
    if (!allowed) throw new Error("Nájemník nebyl v této nemovitosti nalezen.");
    const form = await request.formData();
    const typeRaw = text(form, "type") || "PERSON";
    const type = Object.values(TenantType).includes(typeRaw as TenantType) ? typeRaw as TenantType : TenantType.PERSON;
    const permanentAddress = type === "PERSON" ? text(form, "permanentAddress") : null;
    const billingAddress = type === "COMPANY" ? text(form, "billingAddress") : null;
    const billingEmail = type === "COMPANY" ? text(form, "billingEmail") : null;
    const communicationEmail = type === "COMPANY" ? text(form, "communicationEmail") : text(form, "email");
    const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { type, name: text(form, "name", true)!, email: communicationEmail || billingEmail, phone: text(form, "phone"), address: permanentAddress || billingAddress, ico: type === "COMPANY" ? text(form, "ico") : null, permanentAddress, correspondenceAddress: text(form, "correspondenceAddress"), billingAddress, billingEmail, communicationEmail, note: text(form, "note"), payerAccounts: Array.from(new Set(stringArray(form, "payerAccounts").map(normalizePayerAccount).filter(Boolean))), active: boolValue(form, "active") } });
    await audit(access.user.id, "TENANT_UPDATED", "Tenant", tenant.id, { propertyId: id, name: tenant.name });
    const unitId = allowed.leases[0]?.unitId;
    return goWithMessage(request, unitId ? `/nemovitosti/${id}/jednotky/${unitId}` : `/nemovitosti/${id}/najemnici`, "ok", "Nájemník byl upraven.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/najemnici/${tenantId}/upravit`, "error", error instanceof Error ? error.message : "Nájemníka se nepodařilo upravit.");
  }
}
