import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/management";
import { parseBankNotification } from "@/lib/inbound-bank/bank-email";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  const { id } = await params;
  const row = await prisma.inboxPayment.findUnique({ where: { id } });
  if (!row) return goWithMessage(request, "/platby/nesparovane", "error", "E-mail nebyl nalezen.");
  const parsed = parseBankNotification({
    messageId: row.messageId, subject: row.subject, from: row.sender, returnPath: row.returnPath,
    authenticationResults: row.authenticationResults, date: row.receivedAt, text: row.rawExcerpt,
  });
  const bankLike = parsed.bankLike || row.bank !== "UNKNOWN" || row.amountCents !== null || Boolean(row.recipientAccount || row.counterpartyAccount || row.variableSymbol);
  const manualNote = `${row.parseNote || ""} Ručně označeno jako nerelevantní.`.trim();
  await prisma.inboxPayment.update({
    where: { id },
    data: { status: "IGNORED", parseNote: bankLike ? manualNote : `Nerelevantní e-mail: ${manualNote}` },
  });
  await audit(user.id, "INBOUND_PAYMENT_IGNORED", "InboxPayment", id);
  return goWithMessage(request, "/platby/nesparovane", "ok", "E-mail byl označen jako nerelevantní.");
}
