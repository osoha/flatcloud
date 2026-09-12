import { requireManagedProperty } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { transferOwnership } from "@/lib/ownership-transfer";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  const { id, unitId } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    await transferOwnership({propertyId:id,unitId,actorId:access.user.id,form});
    return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}/upravit`, "ok", "Změna byla potvrzena a historie zachována.");
  } catch(error) { return goWithMessage(request, `/nemovitosti/${id}/jednotky/${unitId}/upravit`, "error", error instanceof Error ? error.message : "Změnu se nepodařilo uložit."); }
}
