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
    const leaseId = text(form, "leaseId", true)!;
    if (!(await prisma.lease.findFirst({ where: { id: leaseId, unitId, unit: { propertyId: id } }, select: { id: true } }))) throw new Error("Nájemní vztah nebyl nalezen.");
    const occupant = await prisma.occupant.create({ data: { leaseId, name: text(form, "name", true)!, email: text(form, "email"), phone: text(form, "phone"), permanentAddress: text(form, "permanentAddress"), correspondenceAddress: text(form, "correspondenceAddress"), note: text(form, "note") } });
    await audit(access.user.id, "OCCUPANT_CREATED", "Occupant", occupant.id, { propertyId: id, unitId, leaseId });
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#osoby`, "ok", "Osoba byla přidána.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}#osoby`, "error", error instanceof Error ? error.message : "Osobu se nepodařilo přidat.");
  }
}
