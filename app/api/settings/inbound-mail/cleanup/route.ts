import { currentUser } from "@/lib/auth";
import { cleanupInboundMailbox } from "@/lib/inbound-bank/retention";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const result = await cleanupInboundMailbox({ actorId: user.id });
    return goWithMessage(request, "/nastaveni", "ok", result.summary);
  } catch (error) {
    return goWithMessage(request, "/nastaveni", "error", error instanceof Error ? error.message : "Čištění bankovních notifikací selhalo.");
  }
}
