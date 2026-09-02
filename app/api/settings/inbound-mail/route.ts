import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { intValue, text } from "@/lib/forms";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { sealSecret } from "@/lib/secret";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  try {
    const form = await request.formData();
    const current = await prisma.appSetting.findUnique({ where: { id: "global" } });
    const passwordValue = form.get("inboundMailPassword");
    const password = typeof passwordValue === "string" && passwordValue.length ? passwordValue : null;
    const inboundMailPort = Math.min(65535, Math.max(1, intValue(form, "inboundMailPort", 993)));
    const inboundMailHost = text(form, "inboundMailHost");
    const inboundMailUser = text(form, "inboundMailUser");
    const inboundMailMailbox = text(form, "inboundMailMailbox") || "INBOX";
    const inboundMailSecure = form.get("inboundMailSecure") === "on";
    const inboundMailEnabled = form.get("inboundMailEnabled") === "on";
    if (inboundMailEnabled && (!inboundMailHost || !inboundMailUser)) throw new Error("Pro aktivní sběrný e-mail vyplňte IMAP server a uživatele.");
    if (inboundMailEnabled && !password && !current?.inboundMailPasswordEncrypted) throw new Error("Pro první aktivaci sběrného e-mailu vyplňte IMAP heslo.");

    const mailboxChanged = Boolean(current && (
      current.inboundMailHost !== inboundMailHost ||
      current.inboundMailPort !== inboundMailPort ||
      current.inboundMailSecure !== inboundMailSecure ||
      current.inboundMailUser !== inboundMailUser ||
      current.inboundMailMailbox !== inboundMailMailbox
    ));
    const data = {
      inboundMailEnabled,
      inboundMailHost,
      inboundMailPort,
      inboundMailSecure,
      inboundMailUser,
      inboundMailMailbox,
      ...(password ? { inboundMailPasswordEncrypted: sealSecret(password) } : {}),
      ...(mailboxChanged ? { inboundMailLastUid: 0, inboundMailUidValidity: null, inboundMailLastSummary: "Konfigurace schránky byla změněna; UID checkpoint byl resetován." } : {}),
    };
    await prisma.appSetting.upsert({ where: { id: "global" }, update: data, create: { id: "global", ...data } });
    await audit(user.id, "INBOUND_MAIL_SETTINGS_UPDATED", "AppSetting", "global", { enabled: inboundMailEnabled, host: inboundMailHost, port: inboundMailPort, mailbox: inboundMailMailbox, secure: inboundMailSecure, passwordChanged: Boolean(password), uidReset: mailboxChanged });
    return goWithMessage(request, "/nastaveni", "ok", mailboxChanged ? "Nastavení sběrného e-mailu bylo uloženo a UID checkpoint resetován." : "Nastavení sběrného e-mailu bylo uloženo.");
  } catch (error) {
    return goWithMessage(request, "/nastaveni", "error", error instanceof Error ? error.message : "Nastavení sběrného e-mailu se nepodařilo uložit.");
  }
}
