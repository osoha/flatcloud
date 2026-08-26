import { currentUser } from "@/lib/auth";
import { manuallyVerifyNotificationPayment } from "@/lib/bank-email-verification";
import { text } from "@/lib/forms";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  const { id } = await params;
  try {
    const form = await request.formData();
    const linkId = text(form, "linkId", true)!;
    await manuallyVerifyNotificationPayment({ inboxId: id, linkId, userId: user.id });
    return goWithMessage(request, "/platby/nesparovane", "ok", "Testovací platba byla potvrzena. Bankovní e-mail pro vybraný účet a nemovitost je funkční.");
  } catch (error) {
    return goWithMessage(request, `/platby/nesparovane/email/${id}`, "error", error instanceof Error ? error.message : "Test bankovního účtu se nepodařilo potvrdit.");
  }
}
