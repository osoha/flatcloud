import { currentUser } from "@/lib/auth";
import { paymentCoverDisposition } from "@/lib/lease-payment-cover/core";
import { paymentCoverPdf } from "@/lib/lease-payment-cover/pdf";
import { loadPaymentCover } from "@/lib/lease-payment-cover/service";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ leaseId: string }> }) {
  const actor = await currentUser(); if (!actor) return new Response("Not found", { status: 404 });
  const { leaseId } = await params;
  const context = await loadPaymentCover(actor, leaseId);
  if (!context) return new Response("Not found", { status: 404 });
  const key = new URL(request.url).searchParams.get("version");
  const version = context.versions.find(candidate => candidate.key === key);
  if (!version) return new Response("Uložená platební verze není dostupná. Obnovte platební přehled.", { status: 404 });
  try {
    const lease = context.lease;
    const bytes = await paymentCoverPdf({ version, contractNumber: lease.contractNumber, tenantNames: context.tenantNames,
      address: context.address, unitLabel: lease.unit.label, currency: lease.currency, account: context.account, variableSymbol: lease.variableSymbol,
      dueDay: lease.dueDay, rentTiming: lease.rentTiming, qrPayload: context.qrFor(version.totalCents), issuedAt: context.issuedAt });
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "Content-Disposition": paymentCoverDisposition(lease.contractNumber || context.tenantNames.join("-"), version.effectiveFrom) } });
  } catch (error) {
    console.error("Payment cover generation failed", { leaseId, error });
    return new Response("Platební list se nepodařilo vytvořit.", { status: 503 });
  }
}
