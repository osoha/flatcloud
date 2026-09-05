import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { editableUnitWhere } from "@/lib/access";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { audit } from "@/lib/management";
import { resolveCollectionTasksIfSettled } from "@/lib/tasks";
import { go, goWithMessage } from "@/lib/route-response";
import { outstandingCents } from "@/lib/charges";
import { recomputeTransactionStatus } from "@/lib/matching";
import { serializableTransaction } from "@/lib/serializable";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  let idempotencyExternalId = "";
  let errorPath = "/platby/nova";
  try {
    const form = await request.formData();
    const properties = text(form, "properties");
    if (properties) errorPath = `/platby/nova?properties=${encodeURIComponent(properties)}`;
    const leaseId = text(form, "leaseId", true)!;
    const idempotencyKey = text(form, "idempotencyKey", true)!;
    if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new Error("Platnost formuláře vypršela. Obnovte stránku a zadání zopakujte.");
    idempotencyExternalId = `manual-${idempotencyKey}`;
    const amountCents = moneyToCents(form, "amount");
    if (amountCents <= 0) throw new Error("Částka platby musí být vyšší než nula.");
    const result = await serializableTransaction(async (tx) => {
      const lease = await tx.lease.findFirst({ where: { id: leaseId, unit: editableUnitWhere(user) }, include: { tenant: true, unit: { include: { property: true } }, charges: { where: { active: true }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true }, orderBy: { dueDate: "asc" } } } });
      if (!lease) throw new Error("Vybraný nájemní vztah nebyl nalezen nebo k němu nemáte právo editace.");
      let remainingPayment = amountCents;
      const allocations: { chargeId: string; amountCents: number }[] = [];
      for (const charge of lease.charges) {
        if (remainingPayment <= 0) break;
        const outstanding = outstandingCents(charge);
        if (!outstanding) continue;
        const allocated = Math.min(outstanding, remainingPayment);
        allocations.push({ chargeId: charge.id, amountCents: allocated });
        remainingPayment -= allocated;
      }
      if (text(form, "chargeId") && !allocations.length) throw new Error("Vybraný předpis je již plně uhrazen. Vyberte jiný předpis.");
      const propertyId = lease.unit.propertyId;
      const account = await tx.bankAccount.upsert({ where: { provider_externalAccountId: { provider: "manual", externalAccountId: `manual-${propertyId}` } }, update: {}, create: { propertyId, provider: "manual", bankName: "Ruční evidence", ibanMasked: "RUČNÍ PLATBY", externalAccountId: `manual-${propertyId}` } });
      const transaction = await tx.bankTransaction.create({ data: {
        bankAccountId: account.id,
        externalId: idempotencyExternalId,
        bookedAt: dateValue(form, "bookedAt", true)!,
        amountCents,
        counterpartyName: text(form, "counterpartyName") || lease.tenant.name,
        variableSymbol: text(form, "variableSymbol") || lease.variableSymbol,
        message: text(form, "message") || "Ruční evidence platby",
        source: "manual",
        status: "UNMATCHED",
        suggestedLeaseId: lease.id,
        matchNote: remainingPayment > 0 ? `Přeplatek ${(remainingPayment / 100).toLocaleString("cs-CZ")} Kč vedený u smlouvy` : "Ruční platba přiřazená ke smlouvě",
        allocations: allocations.length ? { create: allocations } : undefined,
      } });
      return { transaction, propertyId, lease, remainingPayment };
    });
    await recomputeTransactionStatus(result.transaction.id);
    await resolveCollectionTasksIfSettled(leaseId);
    await audit(user.id, "MANUAL_PAYMENT_CREATED", "BankTransaction", result.transaction.id, { propertyId: result.propertyId, leaseId, amountCents, allocatedCents: amountCents - result.remainingPayment, overpaymentCents: result.remainingPayment }, result.propertyId);
    return goWithMessage(request, `/nemovitosti/${result.propertyId}/platby`, "ok", `Ruční platba byla přiřazena k ${result.lease.unit.label} · ${result.lease.tenant.name}.`);
  } catch (error) {
    if (idempotencyExternalId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.bankTransaction.findFirst({ where: { externalId: idempotencyExternalId, source: "manual", suggestedLease: { unit: editableUnitWhere(user) } }, include: { suggestedLease: { include: { tenant: true, unit: true } } } });
      if (existing?.suggestedLease) return goWithMessage(request, `/nemovitosti/${existing.suggestedLease.unit.propertyId}/platby`, "ok", `Tato ruční platba již byla uložena k ${existing.suggestedLease.unit.label} · ${existing.suggestedLease.tenant.name}; opakovaný požadavek nevytvořil duplikát.`);
    }
    return goWithMessage(request, errorPath, "error", error instanceof Error ? error.message : "Platbu se nepodařilo uložit.");
  }
}
