import { requireInboxBankAccess, requireInboxLeaseTarget } from "@/lib/account-banking-access";
import { currentUser } from "@/lib/auth";
import { materializeInboxPayment } from "@/lib/inbound-bank/process";
import { audit } from "@/lib/management";
import { text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  const { id } = await params;
  try {
    const {row,accounts}=await requireInboxBankAccess(user,id);
    if (row.transactionId) throw new Error("Pohyb už byl předán do evidence.");
    const form = await request.formData();
    const leaseId = text(form, "leaseId", true)!;
    await requireInboxLeaseTarget(user,row,leaseId);
    const result = await materializeInboxPayment(id, leaseId);
    if (!result.imported) throw new Error(result.reason || "Platbu se nepodařilo importovat.");
    await audit(user.id, "INBOUND_PAYMENT_ASSIGNED", "InboxPayment", id, { leaseId, transactionId: result.transactionId, propertyId: result.propertyId });
    return goWithMessage(request, "/platby/nesparovane", "ok", "Bankovní platba byla přiřazena a zaúčtována.");
  } catch (error) {
    return goWithMessage(request, `/platby/nesparovane/email/${id}`, "error", error instanceof Error ? error.message : "Platbu se nepodařilo přiřadit.");
  }
}
