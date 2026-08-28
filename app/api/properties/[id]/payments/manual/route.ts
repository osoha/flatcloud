import { prisma } from "@/lib/db";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { requireManagedProperty, audit } from "@/lib/management";
import { go, goWithMessage } from "@/lib/route-response";
import { resolveCollectionTasksIfSettled } from "@/lib/tasks";
import { outstandingCents } from "@/lib/charges";
import { recomputeTransactionStatus } from "@/lib/matching";
import { serializableTransaction } from "@/lib/serializable";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireManagedProperty(id);
  if (!access) return go(request, "/login");
  try {
    const form = await request.formData();
    const chargeId = text(form, "chargeId", true)!;
    const amountCents = moneyToCents(form, "amount");
    if (amountCents <= 0) throw new Error("Částka platby musí být vyšší než nula.");
    const result = await serializableTransaction(async (tx) => {
      const charge = await tx.charge.findFirst({ where: { id: chargeId, lease: { unit: { propertyId: id } } }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true, lease: { include: { tenant: true } } } });
      if (!charge) throw new Error("Vybraný předpis nebyl nalezen.");
      const remaining = outstandingCents(charge);
      if (remaining <= 0) throw new Error("Vybraný předpis je již plně uhrazen. Vyberte jiný předpis.");
      if (amountCents > remaining) throw new Error(`Na vybraném předpisu zbývá uhradit pouze ${(remaining / 100).toLocaleString("cs-CZ")} Kč.`);
      const account = await tx.bankAccount.upsert({ where: { provider_externalAccountId: { provider: "manual", externalAccountId: `manual-${id}` } }, update: {}, create: { propertyId: id, provider: "manual", bankName: "Ruční evidence", ibanMasked: "RUČNÍ PLATBY", externalAccountId: `manual-${id}` } });
      const transaction = await tx.bankTransaction.create({ data: {
        bankAccountId: account.id,
        externalId: `manual-${crypto.randomUUID()}`,
        bookedAt: dateValue(form, "bookedAt", true)!,
        amountCents,
        counterpartyName: text(form, "counterpartyName") || charge.lease.tenant.name,
        variableSymbol: text(form, "variableSymbol") || charge.lease.variableSymbol,
        message: text(form, "message") || "Ruční evidence platby",
        source: "manual",
        status: "UNMATCHED",
        allocations: { create: { chargeId, amountCents } },
      } });
      return { transaction, leaseId: charge.leaseId };
    });
    await recomputeTransactionStatus(result.transaction.id);
    await resolveCollectionTasksIfSettled(result.leaseId);
    await audit(access.user.id, "MANUAL_PAYMENT_CREATED", "BankTransaction", result.transaction.id, { propertyId: id, chargeId, amountCents, allocated: amountCents }, id);
    return goWithMessage(request, `/nemovitosti/${id}/platby`, "ok", "Ruční platba byla uložena.");
  } catch (error) {
    return goWithMessage(request, `/nemovitosti/${id}/platby/nova`, "error", error instanceof Error ? error.message : "Platbu se nepodařilo uložit.");
  }
}
