import { assertReceiptWriteRequest, receiptRequestActor, saveOwnerRepresentative } from "@/lib/owner-receipt-settings";
import { goWithMessage } from "@/lib/route-response";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, target = `/vlastnici/${id}/doklady`;
  try {
    assertReceiptWriteRequest(request); const actor = await receiptRequestActor(), form = await request.formData();
    await saveOwnerRepresentative(actor, id, { action: String(form.get("action") || ""), userEmail: String(form.get("userEmail") || ""), representativeId: String(form.get("representativeId") || ""), revision: String(form.get("revision") || ""), roleLabel: String(form.get("roleLabel") || ""), active: form.get("active") === "on" });
    return goWithMessage(request, target, "ok", "Osoba byla určena k podpisu. V jejích úkolech je odkaz na potvrzení zastoupení a podpisu.");
  } catch (error) { return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Zastoupení se nepodařilo uložit."); }
}
