import { prisma } from "@/lib/db";
import { text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  const { id, unitId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const ownerId = text(form, "ownerId", true)!;
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId: id }, select: { id: true } });
    const owner = await prisma.owner.findFirst({ where: { id: ownerId, active: true }, select: { id: true } });
    if (!unit || !owner) throw new Error("Jednotka nebo vlastník nebyli nalezeni.");
    await prisma.$transaction(async (tx) => {
      await tx.unitOwnership.deleteMany({ where: { unitId } });
      await tx.unitOwnership.create({ data: { unitId, ownerId, shareBasisPoints: 10000 } });
    });
    await audit(access.user.id, "UNIT_OWNER_REPLACED", "Unit", unitId, { ownerId });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}`, "ok", "Vlastník jednotky byl uložen.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}/upravit`, "error", error instanceof Error ? error.message : "Vlastníka se nepodařilo uložit.");
  }
}
