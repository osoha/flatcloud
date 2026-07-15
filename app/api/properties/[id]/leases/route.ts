import { LeaseStatus, UnitStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue, intValue, moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const unitId = text(form, "unitId", true)!;
    const tenantId = text(form, "tenantId", true)!;
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, include: { leases: { where: { status: "ACTIVE" } } } });
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, active: true, leases: { some: { unit: { propertyId: id } } } } });
    if (!unit) throw new Error("Jednotka nebyla nalezena.");
    if (!tenant) throw new Error("Nájemník nebyl nalezen.");
    if (unit.leases.length) throw new Error("Jednotka už má aktivní smlouvu.");
    const startDate = dateValue(form, "startDate", true)!;
    const variableSymbol = text(form, "variableSymbol", true)!;
    const duplicateVs = await prisma.lease.findFirst({ where: { variableSymbol, unit: { propertyId: id } }, select: { id: true } });
    if (duplicateVs) throw new Error("Variabilní symbol už používá jiná smlouva v tomto objektu.");
    const status = (text(form, "status") || "ACTIVE") as LeaseStatus;
    const rentCents = moneyToCents(form, "rent");
    const servicesCents = moneyToCents(form, "services");
    const lease = await prisma.$transaction(async (tx) => {
      const created = await tx.lease.create({
        data: {
          unitId,
          tenantId,
          contractNumber: text(form, "contractNumber"),
          startDate,
          endDate: dateValue(form, "endDate"),
          dueDay: Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31),
          variableSymbol,
          rentCents,
          servicesCents,
          depositCents: moneyToCents(form, "deposit"),
          note: text(form, "note"),
          status,
          paymentItems: {
            create: [
              ...(rentCents ? [{ name: "Nájemné", category: "RENT" as const, amountCents: rentCents, validFrom: startDate, sortOrder: 10 }] : []),
              ...(servicesCents ? [{ name: "Zálohy na služby", category: "SERVICES" as const, amountCents: servicesCents, validFrom: startDate, sortOrder: 20 }] : []),
            ],
          },
        },
      });
      if (status === "ACTIVE") await tx.unit.update({ where: { id: unitId }, data: { status: UnitStatus.OCCUPIED } });
      return created;
    });
    await audit(access.user.id, "LEASE_CREATED", "Lease", lease.id, { propertyId: id, tenantId, unitId });
    return goWithMessage(request, `/nemovitosti/${id}/predpisy/${lease.id}`, "ok", "Smlouva byla vytvořena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy/nova`, "error", error instanceof Error ? error.message : "Smlouvu se nepodařilo vytvořit.");
  }
}
