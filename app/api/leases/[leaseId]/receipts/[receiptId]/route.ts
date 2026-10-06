import { receiptDownloadDisposition } from "@/lib/receipt-download";
import { receiptRequestActor } from "@/lib/owner-receipt-settings";
import { staffReceiptArchive } from "@/lib/tenant-payment-receipts";
export async function GET(_request: Request, { params }: { params: Promise<{ leaseId: string; receiptId: string }> }) {
  try {
    const actor = await receiptRequestActor(), { leaseId, receiptId } = await params;
    const receipt = await staffReceiptArchive(actor, leaseId, receiptId);
    if (!receipt) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(receipt.pdfData), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": receiptDownloadDisposition(receipt.snapshot) } });
  } catch { return new Response("Not found", { status: 404 }); }
}
