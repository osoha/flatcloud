import { currentUser } from "@/lib/auth";
import { materializeInboxPayment } from "@/lib/inbound-bank/process";
import { audit } from "@/lib/management";
import { text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  const { id } = await params;
  try {
    const form = await request.formData();
    const propertyId = text(form, "propertyId", true)!;
    const result = await materializeInboxPayment(id, undefined, propertyId);
    if (!result.imported) throw new Error(result.reason || "Pohyb nelze předat do výdajů.");
    await audit(user.id, "INBOUND_EXPENSE_ASSIGNED", "InboxPayment", id, { propertyId, transactionId: result.transactionId }, propertyId);
    return goWithMessage(request, `/nemovitosti/${propertyId}/bankovni-vydaje`, "ok", "Odchozí pohyb byl předán do výdajů k posouzení. Náklad nevzniká bez přiřazení nebo pravidla.");
  } catch (error) {
    return goWithMessage(request, `/platby/nesparovane/email/${id}`, "error", error instanceof Error ? error.message : "Pohyb se nepodařilo předat.");
  }
}
