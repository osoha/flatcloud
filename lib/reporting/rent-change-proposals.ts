import { Prisma, PropertyPermission } from "@prisma/client";
import { hasPropertyPermission } from "../management";
import { prisma } from "../db";
import { serializableTransaction } from "../serializable";
import { businessDateKey } from "../calendar";
import { isMonthlyChargePeriod, periodKeyForDate, replaceRecurringAmount, syncLeaseCharges } from "../charge-automation";
import { effectiveLeaseEnd, leaseStatusAt } from "../lease-lifecycle-core";
import { rentRollAmountsAt } from "./rent-roll";
import { loadAccessibleRentForecastPlan } from "./rent-forecast-plans";
import { calculateRentForecastTransferPreview } from "./rent-forecast-transfer-preview";

type Actor = { id: string; role: string; allProperties?: boolean };
const proposalInclude = {
  createdBy: { select: { id: true, name: true } }, confirmedBy: { select: { id: true, name: true } },
  lease: { include: { tenant: true, unit: { include: { property: true } }, paymentItems: true, charges: { include: { items: true, allocations: true } } } },
} as const;
export const rentChangeProposalStatuses = { DRAFT: "Návrh", CONFIRMED: "Potvrzeno", CANCELLED: "Zrušeno" } as const;

function monthStart(value = new Date()) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 12)); }
function addMonths(value: Date, months: number) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1, 12)); }
function currentRent(lease: Parameters<typeof rentRollAmountsAt>[0], asOf = new Date()) { return rentRollAmountsAt(lease, asOf).rent.amountCents; }
function validateProposalInput(effectiveFrom: Date, legalBasis: string, plan: { asOfDate: Date; horizonMonths: number }, lease: { startDate: Date; endDate: Date | null; terminatedOn: Date | null; cancelledAt: Date | null }) {
  if (Number.isNaN(effectiveFrom.getTime()) || effectiveFrom.getUTCDate() !== 1) throw new Error("Účinnost změny musí být první den měsíce.");
  if (effectiveFrom < monthStart()) throw new Error("Účinnost změny nesmí být v uzavřeném minulém měsíci.");
  if (effectiveFrom > addMonths(monthStart(plan.asOfDate), plan.horizonMonths - 1)) throw new Error("Účinnost musí zůstat v horizontu schváleného plánu.");
  if (leaseStatusAt(lease, effectiveFrom) !== "ACTIVE") throw new Error("Smlouva nebude k datu účinnosti aktivní. Nejprve obnovte nájemní vztah.");
  if (!legalBasis.trim() || legalBasis.trim().length > 200) throw new Error("Právní důvod musí mít 1 až 200 znaků.");
}

export async function listRentChangeProposals(actor: Actor, planId: string) {
  await loadAccessibleRentForecastPlan(actor, planId);
  return prisma.rentChangeProposal.findMany({ where: { forecastPlanId: planId }, include: proposalInclude, orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] });
}

export async function loadRentChangeProposal(actor: Actor, planId: string, proposalId: string) {
  await loadAccessibleRentForecastPlan(actor, planId);
  const proposal = await prisma.rentChangeProposal.findFirst({ where: { id: proposalId, forecastPlanId: planId }, include: proposalInclude });
  if (!proposal) throw new Error("Návrh změny nebyl nalezen nebo k němu nemáte přístup.");
  return proposal;
}

export async function createRentChangeProposal(actor: Actor, planId: string, leaseId: string, input: { effectiveFrom: Date; legalBasis: string; note?: string | null }) {
  const plan = await loadAccessibleRentForecastPlan(actor, planId);
  if (plan.status !== "APPROVED") throw new Error("Návrh změny lze připravit pouze ze schváleného plánu.");
  const preview = calculateRentForecastTransferPreview(plan), row = preview.rows.find((item) => item.leaseId === leaseId);
  if (!row || row.state !== "ADDENDUM_REVIEW") throw new Error("Tento řádek není určen k přípravě dodatku.");
  if (!await hasPropertyPermission(actor, row.propertyId, PropertyPermission.EDIT)) throw new Error("K přípravě změny potřebujete právo upravovat tuto nemovitost.");
  const lease = await prisma.lease.findFirst({ where: { id: leaseId, unit: { propertyId: row.propertyId } }, include: { paymentItems: true, charges: { include: { items: true } } } });
  if (!lease) throw new Error("Smlouva nebyla nalezena.");
  validateProposalInput(input.effectiveFrom, input.legalBasis, plan, lease);
  const liveRent = currentRent(lease);
  if (liveRent !== row.currentRentCents) throw new Error("Nájemné se od zmrazení plánu změnilo. Vytvořte novou revizi z LIVE dat.");
  try {
    return await serializableTransaction(async (tx) => {
      const proposal = await tx.rentChangeProposal.create({ data: { forecastPlanId: plan.id, leaseId, previousRentCents: liveRent, proposedRentCents: row.proposedRentCents, effectiveFrom: input.effectiveFrom, legalBasis: input.legalBasis.trim(), note: input.note?.trim() || null, createdById: actor.id } });
      await tx.auditLog.create({ data: { userId: actor.id, propertyId: row.propertyId, action: "RENT_CHANGE_PROPOSAL_CREATED", entityType: "RentChangeProposal", entityId: proposal.id, details: { forecastPlanId: plan.id, leaseId, previousRentCents: liveRent, proposedRentCents: row.proposedRentCents, effectiveFrom: businessDateKey(input.effectiveFrom) } } });
      return proposal;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("Pro tuto smlouvu už v daném plánu existuje návrh změny.");
    throw error;
  }
}

export async function confirmRentChangeProposal(actor: Actor, planId: string, proposalId: string) {
  const plan = await loadAccessibleRentForecastPlan(actor, planId), proposal = await loadRentChangeProposal(actor, planId, proposalId);
  if (plan.status !== "APPROVED" || proposal.status !== "DRAFT") throw new Error("Potvrdit lze pouze otevřený návrh ze schváleného plánu.");
  const propertyId = proposal.lease.unit.propertyId;
  if (!await hasPropertyPermission(actor, propertyId, PropertyPermission.EDIT)) throw new Error("K potvrzení změny potřebujete právo upravovat tuto nemovitost.");
  return serializableTransaction(async (tx) => {
    // Re-read every mutable dependency inside the serializable transaction. This
    // prevents two browser tabs or concurrent plans from both passing stale
    // pre-flight checks and scheduling incompatible rent versions.
    const fresh = await tx.rentChangeProposal.findFirst({ where: { id: proposal.id, forecastPlanId: plan.id }, include: proposalInclude });
    if (!fresh || fresh.status !== "DRAFT") throw new Error("Návrh mezitím změnil stav. Obnovte stránku.");
    validateProposalInput(fresh.effectiveFrom, fresh.legalBasis, plan, fresh.lease);
    if (currentRent(fresh.lease) !== fresh.previousRentCents) throw new Error("Aktuální nájemné už neodpovídá návrhu. Změnu nepotvrzujte a vytvořte novou revizi.");
    if (fresh.lease.nextIndexationAt && fresh.lease.nextIndexationAt <= fresh.effectiveFrom) throw new Error("Před účinností návrhu proběhne smluvní indexace. Nejprve vytvořte novou revizi plánu.");
    const fromPeriod = periodKeyForDate(fresh.effectiveFrom);
    const protectedCharge = fresh.lease.charges.find((charge) => isMonthlyChargePeriod(charge.period) && charge.period >= fromPeriod && (charge.manualOverride || charge.allocations.length > 0));
    if (protectedCharge) throw new Error(`Předpis ${protectedCharge.period} je ručně upravený nebo už uhrazený. Změnu nelze bezpečně potvrdit.`);
    const competing = await tx.rentChangeProposal.findFirst({ where: { leaseId: fresh.leaseId, status: "CONFIRMED", effectiveFrom: { gte: monthStart() }, id: { not: fresh.id } }, select: { id: true } });
    if (competing) throw new Error("Smlouva už má jinou potvrzenou budoucí změnu nájemného.");
    const changed = await tx.rentChangeProposal.updateMany({ where: { id: fresh.id, status: "DRAFT" }, data: { status: "CONFIRMED", confirmedById: actor.id, confirmedAt: new Date() } });
    if (changed.count !== 1) throw new Error("Návrh mezitím změnil stav. Obnovte stránku.");
    await replaceRecurringAmount(tx, fresh.leaseId, "RENT", fresh.proposedRentCents, fresh.effectiveFrom);
    await tx.lease.update({ where: { id: fresh.leaseId }, data: { rentCents: fresh.proposedRentCents } });
    const sync = await syncLeaseCharges(tx, fresh.leaseId, { fromPeriod, force: true });
    await tx.auditLog.create({ data: { userId: actor.id, propertyId, action: "RENT_CHANGE_PROPOSAL_CONFIRMED", entityType: "RentChangeProposal", entityId: fresh.id, details: { forecastPlanId: plan.id, leaseId: fresh.leaseId, previousRentCents: fresh.previousRentCents, proposedRentCents: fresh.proposedRentCents, effectiveFrom: businessDateKey(fresh.effectiveFrom), legalBasis: fresh.legalBasis, chargeSync: sync } } });
    return tx.rentChangeProposal.findUniqueOrThrow({ where: { id: fresh.id } });
  });
}
