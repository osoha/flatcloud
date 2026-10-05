import { assertReceiptWriteRequest, receiptRequestActor, saveOwnerReceiptProfile } from "@/lib/owner-receipt-settings";
import { goWithMessage } from "@/lib/route-response";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, target = `/vlastnici/${id}/doklady`;
  try {
    assertReceiptWriteRequest(request); const actor = await receiptRequestActor(), form = await request.formData();
    await saveOwnerReceiptProfile(actor, id, { revision: String(form.get("revision") || ""), issuerName: String(form.get("issuerName") || ""), issuerAddress: String(form.get("issuerAddress") || ""), enabled: form.get("enabled") === "on", designatedRepresentativeId: String(form.get("designatedRepresentativeId") || "") });
    return goWithMessage(request, target, "ok", "Údaje vystavitele byly uloženy. Změna názvu nebo adresy vyžaduje nový osobní souhlas podepisující osoby.");
  } catch (error) { return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Nastavení se nepodařilo uložit."); }
}
