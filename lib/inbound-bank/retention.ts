import { prisma } from "@/lib/db";
import { appSettings } from "@/lib/settings";
import { openSecret } from "@/lib/secret";
import { deleteImapMessages } from "@/lib/inbound-bank/imap";
import { mailboxIdentity } from "@/lib/inbound-bank/mailbox-identity";

export const BANK_EMAIL_RAW_RETENTION_DAYS = 100;
export const BANK_EMAIL_RETENTION_BATCH_SIZE = 200;
const DAY_MS = 86_400_000;

export function bankEmailRawRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - BANK_EMAIL_RAW_RETENTION_DAYS * DAY_MS);
}

type CleanupOptions = { now?: Date; actorId?: string | null };

/** Purges messages received at or before the absolute timestamp cutoff. */
export async function cleanupInboundMailbox(options: CleanupOptions = {}) {
  const started = Date.now();
  const now = options.now ?? new Date();
  const cutoff = bankEmailRawRetentionCutoff(now);
  let scanned = 0, purged = 0, alreadyPurged = 0, failedStorageDeletes = 0, batchCount = 0;
  let afterId: string | undefined;
  let failure: unknown;

  try {
    const settings = await appSettings();
    const canCleanImap = Boolean(settings.inboundMailEnabled && settings.inboundMailHost && settings.inboundMailUser && settings.inboundMailPasswordEncrypted && settings.inboundMailUidValidity);
    const imapOptions = canCleanImap ? { host: settings.inboundMailHost!, port: settings.inboundMailPort, secure: settings.inboundMailSecure, user: settings.inboundMailUser!, pass: openSecret(settings.inboundMailPasswordEncrypted!)!, mailbox: settings.inboundMailMailbox || "INBOX" } : null;
    const currentMailboxIdentity = imapOptions ? mailboxIdentity(imapOptions) : null;

    for (;;) {
      const rows = await prisma.inboxPayment.findMany({
        where: { receivedAt: { lte: cutoff }, ...(afterId ? { id: { gt: afterId } } : {}), OR: [
          { rawExcerpt: { not: null } }, { rawPurgedAt: null },
          ...(imapOptions ? [{ mailboxDeletedAt: null, imapUid: { not: null }, imapUidValidity: settings.inboundMailUidValidity, imapMailboxIdentity: currentMailboxIdentity }] : []),
        ] },
        select: { id: true, rawExcerpt: true, rawPurgedAt: true, mailboxDeletedAt: true, imapUid: true, imapUidValidity: true, imapMailboxIdentity: true },
        orderBy: { id: "asc" }, take: BANK_EMAIL_RETENTION_BATCH_SIZE,
      });
      if (!rows.length) break;
      batchCount += 1;
      scanned += rows.length;
      afterId = rows[rows.length - 1].id;
      for (const row of rows) {
        const needsRawPurge = row.rawExcerpt !== null;
        const needsPurgeMarker = row.rawPurgedAt === null;
        if (!needsRawPurge && needsPurgeMarker) alreadyPurged += 1;
        let mailboxDeletedAt = row.mailboxDeletedAt;
        const ownsCurrentImapMessage = imapOptions && row.mailboxDeletedAt === null && row.imapUid !== null && row.imapUidValidity === settings.inboundMailUidValidity && row.imapMailboxIdentity === currentMailboxIdentity;
        if (ownsCurrentImapMessage) {
          try {
            await deleteImapMessages(imapOptions, settings.inboundMailUidValidity!, [row.imapUid!]);
            mailboxDeletedAt = now;
          } catch {
            failedStorageDeletes += 1;
          }
        }
        if (needsRawPurge || needsPurgeMarker || mailboxDeletedAt !== row.mailboxDeletedAt) {
          await prisma.inboxPayment.update({ where: { id: row.id }, data: { ...((needsRawPurge || needsPurgeMarker) ? { rawExcerpt: null, rawPurgedAt: now } : {}), ...(mailboxDeletedAt !== row.mailboxDeletedAt ? { mailboxDeletedAt } : {}) } });
          if (needsRawPurge) purged += 1;
        }
      }
      if (rows.length < BANK_EMAIL_RETENTION_BATCH_SIZE) break;
    }
  } catch (error) { failure = error; }

  const durationMs = Date.now() - started;
  const success = !failure;
  const summary = success ? `Retence raw bankovních notifikací: odstraněno ${purged}, již čistých ${alreadyPurged}, selhání IMAP ${failedStorageDeletes}.` : `Retence raw bankovních notifikací selhala: ${failure instanceof Error ? failure.message : String(failure)}`;
  const details = { cutoff: cutoff.toISOString(), scanned, purged, alreadyPurged, failedStorageDeletes, batchCount, batchSize: BANK_EMAIL_RETENTION_BATCH_SIZE, durationMs, success, summary };
  await prisma.appSetting.upsert({ where: { id: "global" }, update: { inboundMailLastCleanupAt: now, inboundMailLastCleanupPurged: purged, inboundMailLastCleanupSummary: summary, ...(success ? { inboundMailLastCleanupSuccessAt: now } : {}) }, create: { id: "global", inboundMailLastCleanupAt: now, inboundMailLastCleanupPurged: purged, inboundMailLastCleanupSummary: summary, ...(success ? { inboundMailLastCleanupSuccessAt: now } : {}) } }).catch(() => undefined);
  await prisma.auditLog.create({ data: { userId: options.actorId ?? null, action: "BANK_EMAIL_RETENTION_RUN", entityType: "AppSetting", entityId: "global", details } }).catch(() => undefined);
  if (failure) throw failure;
  return { enabled: true, ...details };
}
