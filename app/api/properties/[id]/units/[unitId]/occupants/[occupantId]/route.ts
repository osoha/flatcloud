import { prisma } from "@/lib/db";
import { boolValue, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string; occupantId: string }> }) {
  const { id, unitId, occupantId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const existing = await prisma.occupant.findFirst({ where: { id: occupantId, lease: { unitId, unit: { propertyId: id } } } });
    if (!existing) throw new Error("Osoba nebyla nalezena.");
    const form = await request.formData();
    if (text(form, "mode") === "delete") {
      await prisma.occupant.delete({ where: { id: occupantId } });
      await audit(access.user.id, "OCCUPANT_DELETED", "Occupant", occupantId, { propertyId: id, unitId });
      return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#osoby`, "ok", "Osoba byla odebrána.");
    }
    await prisma.occupant.update({ where: { id: occupantId }, data: { name: text(form, "name", true)!, email: text(form, "email"), phone: text(form, "phone"), permanentAddress: text(form, "permanentAddress"), correspondenceAddress: text(form, "correspondenceAddress"), note: text(form, "note"), active: boolValue(form, "active") } });
    await audit(access.user.id, "OCCUPANT_UPDATED", "Occupant", occupantId, { propertyId: id, unitId });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#osoby`, "ok", "Osoba byla upravena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#osoby`, "error", error instanceof Error ? error.message : "Osobu se nepodařilo upravit.");
  }
}
