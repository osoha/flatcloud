import { LeaseStatus, TenantType, UnitStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue, intValue, moneyToCents, stringArray, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const unitId = text(form, "unitId", true)!;
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, include: { leases: { where: { status: "ACTIVE" } } } });
    if (!unit) throw new Error("Vybraná jednotka nebyla nalezena.");
    if (unit.leases.length) throw new Error("Vybraná jednotka už má aktivní smlouvu.");

    const startDate = dateValue(form, "startDate", true)!;
    const variableSymbol = text(form, "variableSymbol", true)!;
    const duplicateVs = await prisma.lease.findFirst({ where: { variableSymbol, unit: { propertyId: id } }, select: { id: true } });
    if (duplicateVs) throw new Error("Variabilní symbol už používá jiná smlouva v tomto objektu.");
    const status = (text(form, "leaseStatus") || "ACTIVE") as LeaseStatus;
    const rentCents = moneyToCents(form, "rent");
    const servicesCents = moneyToCents(form, "services");
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          type: (text(form, "tenantType") || "PERSON") as TenantType,
          name: text(form, "name", true)!,
          email: text(form, "email"),
          phone: text(form, "phone"),
          address: text(form, "tenantAddress"),
          note: text(form, "tenantNote"),
          payerAccounts: stringArray(form, "payerAccounts"),
        },
      });
      const lease = await tx.lease.create({
        data: {
          unitId,
          tenantId: tenant.id,
          contractNumber: text(form, "contractNumber"),
          startDate,
          endDate: dateValue(form, "endDate"),
          dueDay: Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31),
          variableSymbol,
          rentCents,
          servicesCents,
          depositCents: moneyToCents(form, "deposit"),
          note: text(form, "leaseNote"),
          status,
          paymentItems: {
            create: [
              ...(rentCents ? [{ name: "Nájemné", category: "RENT" as const, amountCents: rentCents, validFrom: startDate, sortOrder: 10 }] : []),
              ...(servicesCents ? [{ name: "Zálohy na služby", category: "SERVICES" as const, amountCents: servicesCents, validFrom: startDate, sortOrder: 20 }] : []),
            ],
          },
        },
      });
      await tx.unit.update({ where: { id: unitId }, data: { status: status === "ACTIVE" ? UnitStatus.OCCUPIED : unit.status } });
      return { tenant, lease };
    });
    await audit(access.user.id, "TENANT_AND_LEASE_CREATED", "Lease", result.lease.id, { propertyId: id, tenantId: result.tenant.id, unitId });
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/${result.lease.id}`, "ok", "Nájemník a smlouva byli vytvořeni.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/najemnici/novy`, "error", error instanceof Error ? error.message : "Nájemníka se nepodařilo vytvořit.");
  }
}
