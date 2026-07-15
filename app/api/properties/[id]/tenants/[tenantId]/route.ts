import { TenantType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { boolValue, stringArray, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; tenantId: string }> }) {
  const { id, tenantId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const allowed = await prisma.tenant.findFirst({ where: { id: tenantId, leases: { some: { unit: { propertyId: id } } } } });
    if (!allowed) throw new Error("Nájemník nebyl v této nemovitosti nalezen.");
    const form = await request.formData();
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        type: (text(form, "type") || "PERSON") as TenantType,
        name: text(form, "name", true)!,
        email: text(form, "email"),
        phone: text(form, "phone"),
        address: text(form, "address"),
        note: text(form, "note"),
        payerAccounts: stringArray(form, "payerAccounts").map((value) => value.replace(/\s+/g, "").toUpperCase()),
        active: boolValue(form, "active"),
      },
    });
    await audit(access.user.id, "TENANT_UPDATED", "Tenant", tenant.id, { propertyId: id, name: tenant.name });
    return goWithMessage(request, `/nemovitosti/${id}/najemnici`, "ok", "Nájemník byl upraven.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/najemnici/${tenantId}/upravit`, "error", error instanceof Error ? error.message : "Nájemníka se nepodařilo upravit.");
  }
}
