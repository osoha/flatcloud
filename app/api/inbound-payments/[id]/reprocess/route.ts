import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseBankNotification } from "@/lib/inbound-bank/bank-email";
import { materializeInboxPayment } from "@/lib/inbound-bank/process";
import { audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.role !== "SUPER_ADMIN") return go(request, "/login");
  const { id } = await params;
  try {
    const row = await prisma.inboxPayment.findUnique({ where: { id } });
    if (!row) throw new Error("Bankovní e-mail nebyl nalezen.");
    if (row.transactionId) throw new Error("Tento e-mail už byl importován jako bankovní transakce.");

    const parsed = parseBankNotification({
      messageId: row.messageId,
      subject: row.subject,
      from: row.sender,
      returnPath: row.returnPath,
      authenticationResults: row.authenticationResults,
      date: row.receivedAt,
      text: row.rawExcerpt,
    });

    await prisma.inboxPayment.update({
      where: { id },
      data: {
        bank: parsed.bank,
        sourceTrusted: parsed.trustedSource,
        bookedAt: parsed.bookedAt,
        amountCents: parsed.amountCents,
        currency: parsed.currency,
        recipientAccount: parsed.recipientAccount,
        counterpartyName: parsed.counterpartyName,
        counterpartyAccount: parsed.counterpartyAccount,
        variableSymbol: parsed.variableSymbol,
        specificSymbol: parsed.specificSymbol,
        constantSymbol: parsed.constantSymbol,
        message: parsed.message,
        status: parsed.recognizedPayment ? "RECEIVED" : "ERROR",
        parseNote: parsed.parseNote,
      },
    });

    await audit(user.id, "INBOUND_PAYMENT_REPROCESSED", "InboxPayment", id, {
      bank: parsed.bank,
      trustedSource: parsed.trustedSource,
      recognizedPayment: parsed.recognizedPayment,
      autoProcessEligible: parsed.autoProcessEligible,
    });

    if (!parsed.recognizedPayment) return goWithMessage(request, `/platby/nesparovane/email/${id}`, "error", parsed.parseNote);

    if (parsed.autoProcessEligible) {
      const result = await materializeInboxPayment(id);
      if (result.imported) return goWithMessage(request, "/platby/nesparovane", "ok", result.reason || "Bankovní e-mail byl znovu zpracován a importován.");
      return goWithMessage(request, `/platby/nesparovane/email/${id}`, "ok", `E-mail byl znovu zpracován. ${result.reason || "Čeká na ruční přiřazení."}`);
    }

    return goWithMessage(request, `/platby/nesparovane/email/${id}`, "ok", "Platební údaje byly rozpoznány. Zdroj není zatím automaticky důvěryhodný, proto platba čeká na ruční potvrzení.");
  } catch (error) {
    return goWithMessage(request, `/platby/nesparovane/email/${id}`, "error", error instanceof Error ? error.message : "E-mail se nepodařilo znovu zpracovat.");
  }
}
