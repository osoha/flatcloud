import { requireManagedProperty } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { transferOwnership } from "@/lib/ownership-transfer";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    await transferOwnership({propertyId:id,actorId:access.user.id,form});
    return goWithMessage(request, `/nemovitosti/${id}/vlastnici`, "ok", "Změna byla potvrzena a historie zachována.");
  } catch(error) { return goWithMessage(request, `/nemovitosti/${id}/vlastnici`, "error", error instanceof Error ? error.message : "Změnu se nepodařilo uložit."); }
}
