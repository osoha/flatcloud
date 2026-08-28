import { SecurityDepositMovementType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { editableUnitWhere } from "@/lib/access";
import { audit } from "@/lib/management";
import { dateValue, moneyToCents, text } from "@/lib/forms";
import { validateSecurityDepositTimeline } from "@/lib/security-deposit-core";
import { outstandingCents } from "@/lib/charges";
import { resolveCollectionTasksIfSettled } from "@/lib/tasks";
import { go, goWithMessage } from "@/lib/route-response";
import { serializableTransaction } from "@/lib/serializable";

const actionByType: Record<string, string> = { RECEIVED: "SECURITY_DEPOSIT_RECEIVED", RETURNED: "SECURITY_DEPOSIT_RETURNED", OFFSET: "SECURITY_DEPOSIT_OFFSET", INTEREST_PAID: "SECURITY_DEPOSIT_INTEREST_PAID" };
export async function POST(request: Request, { params }: { params: Promise<{ id: string; leaseId: string }> }) {
  const { id, leaseId } = await params;
  const user = await currentUser();
  if (!user) return go(request, "/login");
  try {
    const form = await request.formData();
    const type = text(form, "type", true)! as SecurityDepositMovementType;
    if (!Object.values(SecurityDepositMovementType).includes(type)) throw new Error("Neplatný typ pohybu kauce.");
    const amountCents = moneyToCents(form, "amount");
    if (amountCents <= 0) throw new Error("Částka musí být vyšší než nula.");
    const effectiveAt = dateValue(form, "effectiveAt", true)!;
    const note = text(form, "note");
    if (["OFFSET", "ADJUSTMENT_INCREASE", "ADJUSTMENT_DECREASE", "INTEREST_ADJUSTMENT_INCREASE", "INTEREST_ADJUSTMENT_DECREASE"].includes(type) && !note) throw new Error("U korekce nebo zápočtu je poznámka povinná.");
    const chargeId = text(form, "chargeId");
    const { lease, movement } = await serializableTransaction(async (tx) => {
      const lease = await tx.lease.findFirst({ where: { id: leaseId, unit: editableUnitWhere(user, id) }, include: { tenant: true, unit: true, securityDepositTerms: true, securityDepositMovements: true } });
      if (!lease) throw new Error("Smlouva nebyla nalezena nebo k ní nemáte právo editace.");
      if (type === "OFFSET" && chargeId) {
        const charge = await tx.charge.findFirst({ where: { id: chargeId, leaseId }, include: { allocations: true, securityDepositOffsets: true, creditApplications: true } });
        if (!charge) throw new Error("Předpis nepatří ke stejné smlouvě.");
        if (amountCents > outstandingCents(charge)) throw new Error("Zápočet převyšuje aktuální dluh předpisu.");
      }
      validateSecurityDepositTimeline({ depositCents: lease.depositCents, terms: lease.securityDepositTerms, movements: [...lease.securityDepositMovements, { type, amountCents, effectiveAt, createdAt: new Date() }] });
      const movement = await tx.securityDepositMovement.create({ data: { leaseId, type, amountCents, effectiveAt, note, offsetChargeId: type === "OFFSET" ? chargeId : null, createdById: user.id } });
      return { lease, movement };
    });
    await audit(user.id, actionByType[type] || "SECURITY_DEPOSIT_ADJUSTED", "SecurityDepositMovement", movement.id, { leaseId, tenantId: lease.tenantId, unitId: lease.unitId, amount: amountCents, date: effectiveAt.toISOString(), chargeId }, id);
    if (type === "OFFSET") await resolveCollectionTasksIfSettled(leaseId);
    return goWithMessage(request, `/smlouvy/${leaseId}#kauce`, "ok", "Pohyb kauce byl zaevidován.");
  } catch (error) { return goWithMessage(request, `/smlouvy/${leaseId}#kauce`, "error", error instanceof Error ? error.message : "Pohyb kauce se nepodařilo uložit."); }
}
