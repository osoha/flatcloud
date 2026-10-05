import { assertReceiptWriteRequest, leaseReceiptReturnPath, receiptRequestActor, saveLeaseLandlordPeriod } from "@/lib/owner-receipt-settings";
import { goWithMessage } from "@/lib/route-response";
export async function POST(request: Request, { params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params; let target = `/smlouvy/${leaseId}#doklady`;
  try {
    assertReceiptWriteRequest(request); const actor = await receiptRequestActor(), form = await request.formData(); target = await leaseReceiptReturnPath(leaseId, form.get("returnTo"));
    await saveLeaseLandlordPeriod(actor, leaseId, { action: String(form.get("action") || ""), periodId: String(form.get("periodId") || ""), revision: String(form.get("revision") || ""), ownerId: String(form.get("ownerId") || ""), fromPeriod: String(form.get("fromPeriod") || ""), toPeriod: String(form.get("toPeriod") || ""), active: form.get("active") === "on" });
    return goWithMessage(request, target, "ok", "Pronajímatel byl pro zadané období výslovně potvrzen. Příjemce plateb se nemění.");
  } catch (error) { return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Pronajímatele se nepodařilo uložit."); }
}
