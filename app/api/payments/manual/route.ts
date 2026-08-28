import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { editableUnitWhere } from "@/lib/access";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { audit } from "@/lib/management";
import { resolveCollectionTasksIfSettled } from "@/lib/tasks";
import { go, goWithMessage } from "@/lib/route-response";
import { outstandingCents } from "@/lib/charges";
import { recomputeTransactionStatus } from "@/lib/matching";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return go(request, "/login");
  try {
    const form = await request.formData();
    const leaseId = text(form, "leaseId", true)!;
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, unit: editableUnitWhere(user) },
      include: {
        tenant: true,
        unit: { include: { property: true } },
        charges: { where: { active: true }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true }, orderBy: { dueDate: "asc" } },
      },
    });
    if (!lease) throw new Error("Vybraný nájemní vztah nebyl nalezen nebo k němu nemáte právo editace.");
    const amountCents = moneyToCents(form, "amount");
    if (amountCents <= 0) throw new Error("Částka platby musí být vyšší než nula.");

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
    const account = await prisma.bankAccount.upsert({
      where: { provider_externalAccountId: { provider: "manual", externalAccountId: `manual-${propertyId}` } },
      update: {},
      create: { propertyId, provider: "manual", bankName: "Ruční evidence", ibanMasked: "RUČNÍ PLATBY", externalAccountId: `manual-${propertyId}` },
    });
    const transaction = await prisma.bankTransaction.create({
      data: {
        bankAccountId: account.id,
        externalId: `manual-${crypto.randomUUID()}`,
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
      },
    });
    await recomputeTransactionStatus(transaction.id);
    await resolveCollectionTasksIfSettled(leaseId);
    await audit(user.id, "MANUAL_PAYMENT_CREATED", "BankTransaction", transaction.id, { propertyId, leaseId, amountCents, allocatedCents: amountCents - remainingPayment, overpaymentCents: remainingPayment }, propertyId);
    return goWithMessage(request, `/nemovitosti/${propertyId}/platby`, "ok", `Ruční platba byla přiřazena k ${lease.unit.label} · ${lease.tenant.name}.`);
  } catch (error) {
    return goWithMessage(request, "/platby/nova", "error", error instanceof Error ? error.message : "Platbu se nepodařilo uložit.");
  }
}
