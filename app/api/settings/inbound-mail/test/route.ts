import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appSettings } from "@/lib/settings";
import { openSecret } from "@/lib/secret";
import { testImapConnection } from "@/lib/inbound-bank/imap";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const settings = await appSettings();
    if (!settings.inboundMailHost || !settings.inboundMailUser || !settings.inboundMailPasswordEncrypted) {
      throw new Error("Nejdřív uložte IMAP server, uživatele a heslo.");
    }
    const password = openSecret(settings.inboundMailPasswordEncrypted);
    if (!password) throw new Error("Uložené IMAP heslo není dostupné.");
    const result = await testImapConnection({
      host: settings.inboundMailHost,
      port: settings.inboundMailPort,
      secure: settings.inboundMailSecure,
      user: settings.inboundMailUser,
      pass: password,
      mailbox: settings.inboundMailMailbox || "INBOX",
    });
    const checkedAt = new Date();
    const summary = `IMAP připojení ověřeno; přihlášení i složka ${result.mailbox} jsou dostupné.`;
    await prisma.appSetting.update({ where: { id: "global" }, data: { inboundMailLastCheckedAt: checkedAt, inboundMailLastSummary: summary } });
    await audit(user.id, "INBOUND_MAIL_CONNECTION_TEST", "AppSetting", "global", { ok: true, mailbox: result.mailbox });
    return goWithMessage(request, "/nastaveni", "ok", summary);
  } catch (error) {
    return goWithMessage(request, "/nastaveni", "error", error instanceof Error ? error.message : "Test IMAP připojení selhal.");
  }
}
