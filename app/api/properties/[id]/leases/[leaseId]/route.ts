import { LeaseStatus, RentTiming, UnitStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue, intValue, moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.lease.findFirst({ where: { id: leaseId, unit: { propertyId: id } } });
    if (!existing) throw new Error("Smlouva nebyla nalezena.");
    const form = await request.formData();
    const unitId = text(form, "unitId", true)!;
    const tenantId = text(form, "tenantId", true)!;
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, include: { leases: { where: { status: "ACTIVE", NOT: { id: leaseId } } } } });
    if (!unit) throw new Error("Vybraná jednotka nebyla nalezena.");
    if (unit.leases.length) throw new Error("Vybraná jednotka už má jinou aktivní smlouvu.");
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, OR: [{ leases: { some: { unit: { propertyId: id } } } }, { id: existing.tenantId }] } });
    if (!tenant) throw new Error("Vybraný nájemník nepatří k této nemovitosti.");
    const variableSymbol = text(form, "variableSymbol", true)!;
    const duplicateVs = await prisma.lease.findFirst({ where: { variableSymbol, id: { not: leaseId }, unit: { propertyId: id } }, select: { id: true } });
    if (duplicateVs) throw new Error("Variabilní symbol už používá jiná smlouva v tomto objektu.");
    const status = (text(form, "status") || "ACTIVE") as LeaseStatus;
    const lease = await prisma.$transaction(async (tx) => {
      const updated = await tx.lease.update({
        where: { id: leaseId },
        data: {
          unitId,
          tenantId,
          contractNumber: text(form, "contractNumber"),
          startDate: dateValue(form, "startDate", true)!,
          endDate: dateValue(form, "endDate"),
          dueDay: Math.min(Math.max(intValue(form, "dueDay", 5), 1), 31),
          variableSymbol,
          rentTiming: ((text(form, "rentTiming") || "ADVANCE") as RentTiming),
          rentCents: moneyToCents(form, "rent"),
          servicesCents: moneyToCents(form, "services"),
          depositCents: moneyToCents(form, "deposit"),
          note: text(form, "note"),
          status,
        },
      });
      if (existing.unitId !== unitId && existing.status === "ACTIVE") {
        await tx.unit.update({ where: { id: existing.unitId }, data: { status: UnitStatus.VACANT } });
      }
      await tx.unit.update({ where: { id: unitId }, data: { status: status === "ACTIVE" ? UnitStatus.OCCUPIED : UnitStatus.VACANT } });
      return updated;
    });
    await audit(access.user.id, "LEASE_UPDATED", "Lease", lease.id, { propertyId: id, status });
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy`, "ok", "Smlouva byla upravena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/smlouvy/${leaseId}/upravit`, "error", error instanceof Error ? error.message : "Smlouvu se nepodařilo upravit.");
  }
}
