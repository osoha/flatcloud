import { currentUser } from "@/lib/auth";
import { syncInboundMailbox } from "@/lib/inbound-bank/sync";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const result = await syncInboundMailbox();
    await audit(user.id, "INBOUND_MAIL_MANUAL_SYNC", "AppSetting", "global", result);
    return goWithMessage(request, "/nastaveni", "ok", result.enabled ? result.summary || "Sběrný e-mail byl zkontrolován." : "Sběrný e-mail je vypnutý.");
  } catch (error) {
    return goWithMessage(request, "/nastaveni", "error", error instanceof Error ? error.message : "Kontrola sběrného e-mailu selhala.");
  }
}
