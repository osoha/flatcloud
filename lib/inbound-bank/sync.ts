import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { appSettings } from "@/lib/settings";
import { openSecret } from "@/lib/secret";
import { fetchImapMessages, parseRawEmail } from "@/lib/inbound-bank/imap";
import { parseBankNotification } from "@/lib/inbound-bank/bank-email";
import { materializeInboxPayment } from "@/lib/inbound-bank/process";

function fallbackMessageId(uid: number, source: Buffer) {
  return `imap-${uid}-${createHash("sha256").update(source).digest("hex").slice(0, 20)}`;
}

export async function syncInboundMailbox() {
  const settings = await appSettings();
  const checkedAt = new Date();
  if (!settings.inboundMailEnabled) return { enabled: false, fetched: 0, recognized: 0, imported: 0, unmatched: 0, ignored: 0, errors: 0 };
  if (!settings.inboundMailHost || !settings.inboundMailUser || !settings.inboundMailPasswordEncrypted) throw new Error("Sběrný e-mail je zapnutý, ale chybí IMAP server, uživatel nebo heslo.");

  let fetched = 0, recognized = 0, imported = 0, unmatched = 0, ignored = 0, errors = 0;
  let safeLastUid = settings.inboundMailLastUid || 0;
  const result = await fetchImapMessages({
    host: settings.inboundMailHost,
    port: settings.inboundMailPort,
    secure: settings.inboundMailSecure,
    user: settings.inboundMailUser,
    pass: openSecret(settings.inboundMailPasswordEncrypted)!,
    mailbox: settings.inboundMailMailbox || "INBOX",
  }, safeLastUid);
  fetched = result.messages.length;

  for (const rawMessage of result.messages) {
    let inboxId: string | undefined;
    let parsedMessageId: string | undefined;
    try {
      const mail = parseRawEmail(rawMessage.source);
      const parsedPayment = parseBankNotification({ ...mail, messageId: mail.messageId || fallbackMessageId(rawMessage.uid, rawMessage.source) });
      parsedMessageId = parsedPayment.messageId;
      const existing = await prisma.inboxPayment.findUnique({ where: { messageId: parsedPayment.messageId } });
      if (existing) {
        safeLastUid = Math.max(safeLastUid, rawMessage.uid);
        continue;
      }
      if (parsedPayment.recognizedPayment) recognized += 1;
      const inbox = await prisma.inboxPayment.create({
        data: {
          source: "email",
          bank: parsedPayment.bank,
          messageId: parsedPayment.messageId,
          imapUid: rawMessage.uid,
          subject: parsedPayment.subject,
          sender: parsedPayment.sender,
          returnPath: mail.returnPath,
          authenticationResults: mail.authenticationResults,
          sourceTrusted: parsedPayment.trustedSource,
          receivedAt: parsedPayment.receivedAt,
          bookedAt: parsedPayment.bookedAt,
          amountCents: parsedPayment.amountCents,
          currency: parsedPayment.currency,
          recipientAccount: parsedPayment.recipientAccount,
          counterpartyName: parsedPayment.counterpartyName,
          counterpartyAccount: parsedPayment.counterpartyAccount,
          variableSymbol: parsedPayment.variableSymbol,
          specificSymbol: parsedPayment.specificSymbol,
          constantSymbol: parsedPayment.constantSymbol,
          message: parsedPayment.message,
          rawExcerpt: parsedPayment.rawExcerpt,
          status: parsedPayment.recognizedPayment ? "RECEIVED" : "ERROR",
          parseNote: parsedPayment.parseNote,
        },
      });
      inboxId = inbox.id;
      if (!parsedPayment.recognizedPayment) {
        errors += 1;
        safeLastUid = Math.max(safeLastUid, rawMessage.uid);
        continue;
      }
      if (!parsedPayment.autoProcessEligible) {
        unmatched += 1;
        safeLastUid = Math.max(safeLastUid, rawMessage.uid);
        continue;
      }
      const importedResult = await materializeInboxPayment(inbox.id);
      if (importedResult.imported) imported += 1; else if (importedResult.ignored) ignored += 1; else unmatched += 1;
      safeLastUid = Math.max(safeLastUid, rawMessage.uid);
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : "Neznámá chyba zpracování e-mailu.";
      console.error(`Chyba zpracování bankovního e-mailu UID ${rawMessage.uid}`, error);
      try {
        if (inboxId) {
          await prisma.inboxPayment.update({ where: { id: inboxId }, data: { status: "ERROR", parseNote: `Chyba zpracování: ${message}` } });
        } else {
          const messageId = parsedMessageId || fallbackMessageId(rawMessage.uid, rawMessage.source);
          await prisma.inboxPayment.upsert({
            where: { messageId },
            update: { status: "ERROR", parseNote: `Chyba zpracování: ${message}` },
            create: {
              source: "email",
              bank: "UNKNOWN",
              messageId,
              imapUid: rawMessage.uid,
              receivedAt: new Date(),
              sourceTrusted: false,
              rawExcerpt: rawMessage.source.toString("utf8").slice(0, 4000),
              status: "ERROR",
              parseNote: `Chyba zpracování: ${message}`,
            },
          });
        }
        safeLastUid = Math.max(safeLastUid, rawMessage.uid);
      } catch (persistError) {
        // Do not advance the UID checkpoint. Already persisted messages are deduplicated on retry.
        console.error(`Nelze uložit chybový e-mail UID ${rawMessage.uid}; checkpoint zůstává na ${safeLastUid}.`, persistError);
        throw persistError;
      }
    }
  }

  const summary = `E-mail: načteno ${fetched}; bankovní platby ${recognized}; importováno ${imported}; mimo nájmy ${ignored}; čeká ${unmatched}; chyby ${errors}.`;
  await prisma.appSetting.update({ where: { id: "global" }, data: { inboundMailLastUid: safeLastUid, inboundMailLastCheckedAt: checkedAt, inboundMailLastSummary: summary } });
  return { enabled: true, fetched, recognized, imported, unmatched, ignored, errors, summary };
}
