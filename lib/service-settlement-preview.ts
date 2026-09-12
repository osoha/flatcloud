import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { leaseAccessWhere } from "./access";
import { businessDateEndInstant, businessDateKey, businessDateKeyToInstant, businessTodayKey, type BusinessDateKey } from "./calendar";
import { effectiveLeaseEnd } from "./lease-lifecycle-core";

type Actor = { id: string; role: string; allProperties?: boolean };
const serviceCategories = new Set(["SERVICES", "WATER", "HEATING", "ELECTRICITY"]);

type AllocatableCost = { unitId: string | null; amountCents: number; allocations: Array<{ unitId: string; shareBasisPoints: number; amountCents: number }> };
export function serviceCostAllocationForUnit(cost: AllocatableCost, unitId: string) {
  if (cost.unitId) return cost.unitId === unitId ? { amountCents: cost.amountCents, label: "Přímo jednotce" } : null;
  const allocation = cost.allocations.find((row) => row.unitId === unitId);
  return allocation ? { amountCents: allocation.amountCents, label: `Uložené rozdělení ${(allocation.shareBasisPoints / 100).toLocaleString("cs-CZ")} %` } : null;
}

function validDateKey(value: string | undefined): value is BusinessDateKey {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = businessDateKeyToInstant(value as BusinessDateKey);
  return businessDateKey(date) === value;
}

export function defaultServiceSettlementPeriod(now = new Date()) {
  const year = Number(businessTodayKey(now).slice(0, 4)) - 1;
  return { from: `${year}-01-01` as BusinessDateKey, to: `${year}-12-31` as BusinessDateKey };
}

export function parseServiceSettlementPeriod(from: string | undefined, to: string | undefined, now = new Date()) {
  const defaults = defaultServiceSettlementPeriod(now), fromKey = from || defaults.from, toKey = to || defaults.to;
  if (!validDateKey(fromKey) || !validDateKey(toKey)) throw new Error("Zadejte platné datum začátku a konce zúčtovacího období.");
  if (fromKey > toKey) throw new Error("Začátek zúčtovacího období musí být před jeho koncem.");
  if (toKey > businessTodayKey(now)) throw new Error("Zúčtovací období nelze uzavřít do budoucnosti.");
  const days = Math.floor((businessDateKeyToInstant(toKey).getTime() - businessDateKeyToInstant(fromKey).getTime()) / 86_400_000) + 1;
  if (days > 370) throw new Error("Jeden pracovní náhled může pokrýt nejvýše 370 dní.");
  return { from: fromKey, to: toKey, fromDate: businessDateKeyToInstant(fromKey), toDate: businessDateEndInstant(toKey) };
}

async function loadServiceSettlementPreviewFrom(db: Prisma.TransactionClient | typeof prisma, actor: Actor, leaseId: string, from?: string, to?: string, now = new Date()) {
  const database = db as typeof prisma;
  const period = parseServiceSettlementPeriod(from, to, now);
  const lease = await database.lease.findFirst({ where: { id: leaseId, ...leaseAccessWhere(actor) }, include: {
    tenant: true,
    parties: { where: { role: "CONTRACTING_PARTY" }, include: { tenant: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
    unit: { include: {
      property: true,
      meters: {
        where: { active: true },
        include: { readings: { where: { readAt: { lte: period.toDate }, OR: [{ leaseId }, { leaseId: null }] }, orderBy: { readAt: "asc" } } },
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
      },
    } },
    charges: { where: { active: true }, include: { items: true, allocations: true, securityDepositOffsets: true, creditApplications: true }, orderBy: { period: "asc" } },
  } });
  if (!lease) throw new Error("Smlouva nebyla nalezena nebo k ní nemáte přístup.");

  const costs = await database.propertyCost.findMany({ where: { propertyId: lease.unit.propertyId, status: "ACTUAL", kind: "OPEX", category: "UTILITIES", effectiveAt: { gte: period.fromDate, lte: period.toDate } }, include: { allocations: true, documents: { where: { deletedAt: null }, select: { id: true, title: true } } }, orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] });
  const monthlyCharges = lease.charges.filter((charge) => /^\d{4}-\d{2}$/.test(charge.period) && charge.period >= period.from.slice(0, 7) && charge.period <= period.to.slice(0, 7));
  const advanceRows = monthlyCharges.map((charge) => ({ id: charge.id, period: charge.period, amountCents: charge.items.filter((item) => serviceCategories.has(item.category)).reduce((sum, item) => sum + item.amountCents, 0) })).filter((row) => row.amountCents > 0);
  const costRows = costs.flatMap((cost) => {
    const allocation = serviceCostAllocationForUnit(cost, lease.unitId);
    return allocation ? [{ id: cost.id, title: cost.title, effectiveAt: cost.effectiveAt, sourceAmountCents: cost.amountCents, allocatedAmountCents: allocation.amountCents, allocationLabel: allocation.label, documentCount: cost.documents.length }] : [];
  });
  const unallocatedCosts = costs.filter((cost) => !cost.unitId && !cost.allocations.some((row) => row.unitId === lease.unitId));
  const meterRows = lease.unit.meters.map((meter) => {
    const opening = meter.readings.filter((reading) => businessDateKey(reading.readAt) <= period.from).at(-1) || null;
    const closing = meter.readings.filter((reading) => businessDateKey(reading.readAt) <= period.to).at(-1) || null;
    return { id: meter.id, label: meter.label || meter.type, unitOfMeasure: meter.unitOfMeasure, opening, closing, consumption: opening && closing && closing.readAt > opening.readAt ? closing.value - opening.value : null };
  });
  const advancesCents = advanceRows.reduce((sum, row) => sum + row.amountCents, 0), actualCostsCents = costRows.reduce((sum, row) => sum + row.allocatedAmountCents, 0);
  const blockers: string[] = [], warnings: string[] = [];
  const end = effectiveLeaseEnd(lease);
  if (period.from < businessDateKey(lease.startDate) || (end && period.to > businessDateKey(end))) blockers.push("Zvolené období přesahuje platnost smlouvy. Pro první nebo poslední rok vyberte pouze skutečnou dobu nájmu.");
  if (!costRows.length) blockers.push("V období chybí skutečné OPEX náklady kategorie Energie a služby přiřazené této jednotce.");
  if (unallocatedCosts.length) blockers.push(`${unallocatedCosts.length} společných nákladů nemá uložené rozdělení na tuto jednotku.`);
  if (!advanceRows.length) warnings.push("V období nejsou dohledatelné žádné předepsané zálohy na služby.");
  if (meterRows.some((row) => !row.opening || !row.closing || row.consumption == null)) warnings.push("Alespoň jednomu aktivnímu měřidlu chybí použitelný počáteční nebo koncový odečet.");
  if (monthlyCharges.some((charge) => !charge.items.length)) warnings.push("Některý měsíční předpis nemá položkový rozpad; z jeho celkové částky nelze bezpečně určit zálohu na služby.");
  return { lease, period, advanceRows, costRows, unallocatedCosts, meterRows, advancesCents, actualCostsCents, balanceCents: actualCostsCents - advancesCents, blockers, warnings, ready: blockers.length === 0 };
}

export function loadServiceSettlementPreview(actor: Actor, leaseId: string, from?: string, to?: string, now = new Date()) {
  return loadServiceSettlementPreviewFrom(prisma, actor, leaseId, from, to, now);
}

export function loadServiceSettlementPreviewTx(tx: Prisma.TransactionClient, actor: Actor, leaseId: string, from?: string, to?: string, now = new Date()) {
  return loadServiceSettlementPreviewFrom(tx, actor, leaseId, from, to, now);
}
