import { currentUser } from "@/lib/auth";
import { text } from "@/lib/forms";
import { audit, hasPropertyPermission } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return go(request, "/login"); const { id } = await params;
  if (!(await hasPropertyPermission(user, id, "EDIT"))) return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", "Nemáte oprávnění zapisovat do provozního deníku.");
  try { const form = await request.formData(); const body = text(form, "body", true)!; const category = text(form, "category") || "NOTE"; await audit(user.id, "PROPERTY_LOG_NOTE", "Property", id, { body, category }, id); return goWithMessage(request, `/nemovitosti/${id}/provoz`, "ok", "Záznam byl přidán do provozního deníku."); }
  catch(error){ return goWithMessage(request, `/nemovitosti/${id}/provoz`, "error", error instanceof Error ? error.message : "Záznam se nepodařilo uložit."); }
}
