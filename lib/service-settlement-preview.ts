import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { leaseAccessWhere } from "./access";
import { businessDateEndInstant, businessDateKey, businessDateKeyToInstant, businessTodayKey, type BusinessDateKey } from "./calendar";
import { projectSettlementCosts } from "./settlement-cost-projection";
import { sourcePropertyWhere } from "./settlement-sources";
import type { SourcePayload } from "./settlement-source-rules";
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
  // Calendar months, not a 370-day approximation; use date-only UTC arithmetic (DST independent).
  const [year, month, day] = fromKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  const anniversary = new Date(Date.UTC(year + 1, month - 1, Math.min(day, lastDay))).toISOString().slice(0, 10);
  if (toKey >= anniversary) throw new Error("Zúčtovací období může být nejvýše 12 měsíců.");
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
  const sourceRecords = await database.settlementSource.findMany({ where: { propertyId: lease.unit.propertyId }, orderBy: { version: "asc" } });
  const usesConfirmedSources = sourceRecords.some(s => s.confirmedAt);
  const canReadSources = Boolean(await database.property.findFirst({ where: { id: lease.unit.propertyId, ...sourcePropertyWhere(actor) }, select: { id: true } }));
  const unitLeases = await database.lease.findMany({ where: { unitId: lease.unitId } });
  const evidence = projectSettlementCosts(canReadSources ? sourceRecords.map(s => ({ ...s, payload: s.payload as unknown as SourcePayload })) : [], {
    leaseId, unitId: lease.unitId, from: period.from, to: period.to,
    leases: unitLeases.map(l => ({ id: l.id, from: businessDateKey(l.startDate), to: effectiveLeaseEnd(l) ? businessDateKey(effectiveLeaseEnd(l)!) : null })),
  });
  const monthlyCharges = lease.charges.filter((charge) => /^\d{4}-\d{2}$/.test(charge.period) && charge.period >= period.from.slice(0, 7) && charge.period <= period.to.slice(0, 7));
  const advanceRows = monthlyCharges.map((charge) => ({ id: charge.id, period: charge.period, amountCents: charge.items.filter((item) => serviceCategories.has(item.category)).reduce((sum, item) => sum + item.amountCents, 0) })).filter((row) => row.amountCents > 0);
  const legacyCostRows = costs.flatMap((cost) => {
    const allocation = serviceCostAllocationForUnit(cost, lease.unitId);
    return allocation ? [{ id: cost.id, title: cost.title, effectiveAt: cost.effectiveAt, sourceAmountCents: cost.amountCents, allocatedAmountCents: allocation.amountCents, allocationLabel: allocation.label, documentCount: cost.documents.length }] : [];
  });
  // Once confirmed documents exist, accounting costs become reference-only.
  // Mixing both representations would count the same delivery twice, including
  // unlinked copies which cannot safely be identified by their title or amount.
  const costRows = usesConfirmedSources ? evidence.rows.map(row => ({
    id: row.id, title: row.title, effectiveAt: businessDateKeyToInstant(row.from as BusinessDateKey),
    sourceAmountCents: row.amountCents, allocatedAmountCents: row.amountCents,
    allocationLabel: row.allocationLabel, documentCount: 1,
  })) : legacyCostRows;
  const unallocatedCosts = costs.filter((cost) => !cost.unitId && !cost.allocations.some((row) => row.unitId === lease.unitId));
  const meterRows = lease.unit.meters.map((meter) => {
    const opening = meter.readings.filter((reading) => businessDateKey(reading.readAt) <= period.from).at(-1) || null;
    const closing = meter.readings.filter((reading) => businessDateKey(reading.readAt) <= period.to).at(-1) || null;
    return { id: meter.id, label: meter.label || meter.type, unitOfMeasure: meter.unitOfMeasure, opening, closing, consumption: opening && closing && closing.readAt > opening.readAt ? closing.value - opening.value : null };
  });
  const advancesCents = advanceRows.reduce((sum, row) => sum + row.amountCents, 0), actualCostsCents = costRows.reduce((sum, row) => sum + row.allocatedAmountCents, 0);
  const blockers: string[] = [
    "Pracovní podklad není kompletní vyúčtování: chybí potvrzené členění nákladů a přijatých záloh po službách.",
    "Teplo a ohřev vody: ověřte rozsah služeb. Pokud jsou poskytovány, čeká se na externí rozúčtování; ruční odečty je nenahrazují.",
    ...evidence.blockers,
  ], warnings: string[] = [...evidence.warnings];
  if (usesConfirmedSources && !canReadSources) blockers.push("Potvrzené podklady vyžadují kontrolu správce s přístupem k celému domu.");
  if (usesConfirmedSources && legacyCostRows.length) warnings.push("Účetní OPEX náklady jsou pouze informativní a do součtu se nepřičítají. Náklady vyúčtování nyní čerpáme výhradně z potvrzených podkladů.");
  if (!usesConfirmedSources) warnings.push("Dosavadní účetní náklady jsou orientační. Pro potvrzené náklady vyúčtování vložte a potvrďte faktury nebo externí výsledky.");
  const end = effectiveLeaseEnd(lease);
  if (period.from < businessDateKey(lease.startDate) || (end && period.to > businessDateKey(end))) blockers.push("Zvolené období přesahuje platnost smlouvy. Pro první nebo poslední rok vyberte pouze skutečnou dobu nájmu.");
  if (!costRows.length) blockers.push(usesConfirmedSources ? "V období chybí použitelné potvrzené náklady pro tuto smlouvu." : "V období chybí skutečné OPEX náklady kategorie Energie a služby přiřazené této jednotce.");
  if (!usesConfirmedSources && unallocatedCosts.length) blockers.push(`${unallocatedCosts.length} společných nákladů nemá uložené rozdělení na tuto jednotku.`);
  if (!advanceRows.length) warnings.push("V období nejsou dohledatelné žádné předepsané zálohy na služby.");
  if (meterRows.some((row) => !row.opening || !row.closing || row.consumption == null)) warnings.push("Alespoň jednomu aktivnímu měřidlu chybí použitelný počáteční nebo koncový odečet.");
  if (monthlyCharges.some((charge) => !charge.items.length)) warnings.push("Některý měsíční předpis nemá položkový rozpad; z jeho celkové částky nelze bezpečně určit zálohu na služby.");
  return { lease, period, advanceRows, costRows, evidenceRows: evidence.rows, usesConfirmedSources, unallocatedCosts, meterRows, advancesCents, actualCostsCents, balanceCents: actualCostsCents - advancesCents, blockers, warnings, ready: blockers.length === 0 };
}

export function loadServiceSettlementPreview(actor: Actor, leaseId: string, from?: string, to?: string, now = new Date()) {
  return loadServiceSettlementPreviewFrom(prisma, actor, leaseId, from, to, now);
}

export function loadServiceSettlementPreviewTx(tx: Prisma.TransactionClient, actor: Actor, leaseId: string, from?: string, to?: string, now = new Date()) {
  return loadServiceSettlementPreviewFrom(tx, actor, leaseId, from, to, now);
}
