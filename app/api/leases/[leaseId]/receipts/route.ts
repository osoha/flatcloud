import { assertReceiptWriteRequest, leaseReceiptReturnPath, receiptRequestActor } from "@/lib/owner-receipt-settings";
import { issueStaffReceipt } from "@/lib/tenant-payment-receipts";
import { go, goWithMessage } from "@/lib/route-response";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params; let target = `/smlouvy/${leaseId}#doklady`;
  try {
    assertReceiptWriteRequest(request); const actor = await receiptRequestActor(), form = await request.formData(); target = await leaseReceiptReturnPath(leaseId, form.get("returnTo"));
    const receipt = await issueStaffReceipt(actor, leaseId, String(form.get("chargeId") || ""));
    return go(request, `/api/leases/${leaseId}/receipts/${receipt.id}`);
  } catch (error) { return goWithMessage(request, target, "error", error instanceof Error ? error.message : "Doklad se nepodařilo vystavit."); }
}
