import { prisma } from "@/lib/db";
import { appSettings } from "@/lib/settings";
import { openSecret } from "@/lib/secret";
import { deleteImapMessages } from "@/lib/inbound-bank/imap";
import { mailboxIdentity } from "@/lib/inbound-bank/mailbox-identity";

export async function cleanupInboundMailbox() {
  const settings = await appSettings();
  if (!settings.inboundMailEnabled) return { enabled: false, deleted: 0, summary: "Sběrný e-mail není zapnutý." };
  if (!settings.inboundMailHost || !settings.inboundMailUser || !settings.inboundMailPasswordEncrypted) throw new Error("Retence vyžaduje kompletní IMAP konfiguraci.");
  if (!settings.inboundMailUidValidity) throw new Error("Retence vyžaduje uloženou UIDVALIDITY schránky.");

  const now = new Date();
  const resolvedCutoff = new Date(now.getTime() - settings.inboundMailResolvedRetentionDays * 86_400_000);
  const unresolvedCutoff = new Date(now.getTime() - settings.inboundMailUnresolvedRetentionDays * 86_400_000);
  const imapOptions = { host: settings.inboundMailHost, port: settings.inboundMailPort, secure: settings.inboundMailSecure, user: settings.inboundMailUser, pass: openSecret(settings.inboundMailPasswordEncrypted)!, mailbox: settings.inboundMailMailbox || "INBOX" };
  const currentMailboxIdentity = mailboxIdentity(imapOptions);
  const candidates = await prisma.inboxPayment.findMany({
    where: {
      mailboxDeletedAt: null,
      imapUid: { not: null },
      imapUidValidity: settings.inboundMailUidValidity,
      imapMailboxIdentity: currentMailboxIdentity,
      OR: [
        { status: { in: ["IMPORTED", "IGNORED"] }, receivedAt: { lt: resolvedCutoff } },
        { status: { in: ["RECEIVED", "UNMATCHED", "ERROR"] }, receivedAt: { lt: unresolvedCutoff } },
      ],
    },
    select: { id: true, imapUid: true },
    orderBy: { imapUid: "asc" },
    take: 200,
  });
  const uids = candidates.map((candidate) => candidate.imapUid).filter((uid): uid is number => uid !== null);
  if (!uids.length) {
    const summary = "Retence: žádné zprávy ke smazání.";
    await prisma.appSetting.update({ where: { id: "global" }, data: { inboundMailLastCleanupAt: now, inboundMailLastCleanupSummary: summary } });
    return { enabled: true, deleted: 0, summary };
  }

  const deleted = await deleteImapMessages(imapOptions, settings.inboundMailUidValidity, uids);
  await prisma.inboxPayment.updateMany({ where: { id: { in: candidates.map((candidate) => candidate.id) }, mailboxDeletedAt: null }, data: { mailboxDeletedAt: now } });
  const summary = `Retence: odstraněno ${deleted} e-mailů z IMAP; InboxPayment v DB zachovány.`;
  await prisma.appSetting.update({ where: { id: "global" }, data: { inboundMailLastCleanupAt: now, inboundMailLastCleanupSummary: summary } });
  return { enabled: true, deleted, summary };
}
