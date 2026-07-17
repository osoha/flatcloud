import { UnitStatus, UnitType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { floatValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const ownerId = text(form, "ownerId", true)!;
    const ownerBankAccountId = text(form, "ownerBankAccountId", true)!;
    const [property, account] = await Promise.all([
      prisma.property.findUnique({ where: { id }, select: { id: true } }),
      prisma.ownerBankAccount.findFirst({ where: { id: ownerBankAccountId, ownerId, active: true }, select: { id: true } }),
    ]);
    if (!property) throw new Error("Nemovitost nebyla nalezena.");
    if (!account) throw new Error("Vyberte aktivní bankovní účet zvoleného vlastníka.");
    const unit = await prisma.unit.create({
      data: {
        propertyId: id,
        label: text(form, "label", true)!,
        floor: text(form, "floor"),
        type: (text(form, "type") || "APARTMENT") as UnitType,
        status: (text(form, "status") || "VACANT") as UnitStatus,
        areaM2: floatValue(form, "areaM2"),
        note: text(form, "note"),
        ownerships: { create: { ownerId, ownerBankAccountId, shareBasisPoints: 10000 } },
      },
    });
    await audit(access.user.id, "UNIT_CREATED", "Unit", unit.id, { propertyId: id, label: unit.label, ownerId, ownerBankAccountId });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky`, "ok", "Jednotka byla vytvořena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/nova`, "error", error instanceof Error ? error.message : "Jednotku se nepodařilo vytvořit.");
  }
}
