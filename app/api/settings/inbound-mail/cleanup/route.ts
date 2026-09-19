import { currentUser } from "@/lib/auth";
import { cleanupInboundMailbox } from "@/lib/inbound-bank/retention";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const form = await request.formData();
    if (form.get("confirmCleanup") !== "on") return goWithMessage(request, "/nastaveni/system", "error", "Retenční čištění je nutné výslovně potvrdit.");
    const result = await cleanupInboundMailbox({ actorId: user.id });
    return goWithMessage(request, "/nastaveni/system", "ok", result.summary);
  } catch (error) {
    return goWithMessage(request, "/nastaveni/system", "error", error instanceof Error ? error.message : "Čištění bankovních notifikací selhalo.");
  }
}
