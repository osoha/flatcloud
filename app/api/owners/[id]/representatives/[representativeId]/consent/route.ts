import { assertReceiptWriteRequest, consentOwnerReceiptSignature, ownReceiptSignatureFromForm, receiptRequestActor } from "@/lib/owner-receipt-settings";
import { goWithMessage } from "@/lib/route-response";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; representativeId: string }> }) {
  const { id, representativeId } = await params, target = `/vlastnici/${id}/doklady`;
  try {
    assertReceiptWriteRequest(request); const actor = await receiptRequestActor(), form = await request.formData(), action = String(form.get("action") || "");
    await consentOwnerReceiptSignature(actor, id, representativeId, { revision: String(form.get("revision") || ""), profileRevision: Number(form.get("profileRevision")), action, authorization: form.get("authorization") === "on", ...(action === "consent" ? { signature: await ownReceiptSignatureFromForm(actor, form) } : {}) });
    return goWithMessage(request, target, "ok", action === "revoke" ? "Osobní souhlas byl odvolán. Již vystavené doklady zůstávají beze změny." : "Váš osobní souhlas a podpis pro tohoto vystavitele byly uloženy.");
  } catch (error) { return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Souhlas se nepodařilo uložit."); }
}
