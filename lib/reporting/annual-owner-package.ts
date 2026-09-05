import { prisma } from "@/lib/db";
import { businessDateEndInstant, businessDateKeyToInstant } from "@/lib/calendar";
import { reportingPropertyAccessWhere, reportingScopeForUser, reportingUnitAccessWhere, type ReportingUser } from "@/lib/reporting/access";

export type AnnualPackageIssue = { code: string; severity: "BLOCKER" | "WARNING"; message: string; href?: string };
export type AnnualIncomeRow = { id: string; bookedAt: Date; propertyId: string; propertyName: string; unitLabel: string; tenantName: string; counterpartyName: string | null; variableSymbol: string | null; receivedCents: number; ownerShareBasisPoints: number; ownerAmountCents: number; rentCents: number; servicesCents: number; depositCents: number; otherCents: number; allocationNote: string };
export type AnnualExpenseRow = { id: string; effectiveAt: Date; propertyId: string; propertyName: string; title: string; kind: string; category: string; documentNumber: string | null; sourceAmountCents: number; ownerShareBasisPoints: number | null; ownerAmountCents: number; allocationNote: string; documentCount: number };
export type AnnualLoanRow = { id: string; propertyId: string; propertyName: string; label: string; lender: string; outstandingPrincipalCents: number; annualInterestRateBps: number; asOfDate: Date | null; evidence: string };

function yearRange(year: number) { return { from: businessDateKeyToInstant(`${year}-01-01`), to: businessDateEndInstant(`${year}-12-31`) }; }
export function normalizeAnnualPackageYear(value: string | undefined, now = new Date()) { const previousYear = now.getUTCFullYear() - 1; const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 2000 && parsed <= now.getUTCFullYear() ? parsed : previousYear; }
function proportional(amountCents: number | bigint, basisPoints: number) { const amount=Number(amountCents); if(!Number.isSafeInteger(amount))throw new Error("Jistina je mimo bezpečný rozsah reportu."); return Math.round(amount * basisPoints / 10_000); }

export async function loadAnnualOwnerPackage(user: ReportingUser, input: { ownerId?: string; year: number }) {
  const scope = reportingScopeForUser(user), propertyWhere = reportingPropertyAccessWhere(scope), unitWhere = reportingUnitAccessWhere(scope);
  const properties = await prisma.property.findMany({ where: propertyWhere, select: {
    id: true, name: true, address: true, ownershipMode: true, ownerId: true, owner: { select: { id: true, name: true } },
    ownerships: { select: { ownerId: true, shareBasisPoints: true, owner: { select: { id: true, name: true } } } },
    units: { where: unitWhere, select: { id: true, label: true, ownerships: { select: { ownerId: true, shareBasisPoints: true, owner: { select: { id: true, name: true } } } } } },
  }, orderBy: { name: "asc" } });
  const wholePropertyIds = scope.mode === "ALL" ? properties.map((property) => property.id) : scope.wholePropertyIds, wholePropertyIdSet = new Set(wholePropertyIds);
  const propertyIds = properties.map((property) => property.id), unitIds = properties.flatMap((property) => property.units.map((unit) => unit.id));
  const ownerMap = new Map<string, string>();
  for (const property of properties) {
    if (wholePropertyIdSet.has(property.id)) { for (const ownership of property.ownerships) ownerMap.set(ownership.owner.id, ownership.owner.name); if (!property.ownerships.length && property.ownershipMode === "WHOLE_OBJECT") ownerMap.set(property.owner.id, property.owner.name); }
    for (const unit of property.units) for (const ownership of unit.ownerships) ownerMap.set(ownership.owner.id, ownership.owner.name);
  }
  const owners = [...ownerMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "cs"));
  const selectedOwner = owners.find((owner) => owner.id === input.ownerId) || null, range = yearRange(input.year);
  if (!selectedOwner || !propertyIds.length || !unitIds.length) return emptyPackage(input.year, owners, selectedOwner);

  const costAccess = scope.mode === "ALL" ? { propertyId: { in: propertyIds } } : { OR: [
    ...(scope.wholePropertyIds.length ? [{ propertyId: { in: scope.wholePropertyIds } }] : []),
    ...(scope.unitIds.length ? [{ unitId: { in: scope.unitIds } }, { allocations: { some: { unitId: { in: scope.unitIds } } } }] : []),
  ] };
  const [paymentAllocations, costs, loans] = await Promise.all([
    prisma.paymentAllocation.findMany({ where: { amountCents: { gt: 0 }, transaction: { bookedAt: { gte: range.from, lte: range.to } }, charge: { lease: { unitId: { in: unitIds } } } }, select: {
      id: true, amountCents: true, transaction: { select: { bookedAt: true, counterpartyName: true, variableSymbol: true } },
      charge: { select: { amountCents: true, items: { select: { category: true, amountCents: true } }, lease: { select: { tenant: { select: { name: true } }, unit: { select: { id: true, label: true, property: { select: { id: true, name: true, ownershipMode: true, ownerId: true, ownerships: { select: { ownerId: true, shareBasisPoints: true } } } }, ownerships: { select: { ownerId: true, shareBasisPoints: true } } } } } } } },
    }, orderBy: [{ transaction: { bookedAt: "asc" } }, { id: "asc" }] }),
    prisma.propertyCost.findMany({ where: { ...costAccess, status: "ACTUAL", effectiveAt: { gte: range.from, lte: range.to } }, select: {
      id: true, propertyId: true, title: true, kind: true, category: true, amountCents: true, effectiveAt: true, documentNumber: true, unitId: true,
      property: { select: { name: true, ownershipMode: true, ownerId: true, ownerships: { select: { ownerId: true, shareBasisPoints: true } } } }, unit: { select: { ownerships: { select: { ownerId: true, shareBasisPoints: true } } } },
      allocations: { where: scope.mode === "ALL" ? undefined : { unitId: { in: unitIds } }, select: { amountCents: true, unit: { select: { ownerships: { select: { ownerId: true, shareBasisPoints: true } } } } } }, documents: { where: { deletedAt: null }, select: { id: true } },
    }, orderBy: [{ effectiveAt: "asc" }, { id: "asc" }] }),
    prisma.propertyLoan.findMany({ where: { propertyId: { in: wholePropertyIds }, active: true }, select: {
      id: true, propertyId: true, label: true, lender: true, outstandingPrincipalCents: true, annualInterestRateBps: true,
      property: { select: { name: true, ownershipMode: true, ownerId: true, ownerships: { select: { ownerId: true, shareBasisPoints: true } } } },
      snapshots: { where: { asOfDate: { lte: range.to } }, orderBy: { asOfDate: "desc" }, take: 1, select: { asOfDate: true, outstandingPrincipalCents: true, annualInterestRateBps: true } },
    }, orderBy: [{ property: { name: "asc" } }, { label: "asc" }] }),
  ]);

  const issues: AnnualPackageIssue[] = [{ code: "CURRENT_OWNERSHIP", severity: "WARNING", message: "Rozdělení používá současné vlastnické podíly. Aplikace zatím neeviduje jejich historickou účinnost; změny vlastníka v průběhu roku ověřte mimo tento balíček." }];
  const ownerShareForUnit = (unit: { ownerships: Array<{ ownerId: string; shareBasisPoints: number }>; property: { ownershipMode: string; ownerId: string; ownerships: Array<{ ownerId: string; shareBasisPoints: number }> } }) => {
    const unitShare = unit.ownerships.find((row) => row.ownerId === selectedOwner.id)?.shareBasisPoints; if (unitShare != null) return unitShare;
    if (unit.property.ownershipMode !== "WHOLE_OBJECT") return 0;
    return unit.property.ownerships.find((row) => row.ownerId === selectedOwner.id)?.shareBasisPoints ?? (unit.property.ownerId === selectedOwner.id ? 10_000 : 0);
  };
  let missingChargeItems = false;
  const incomeRows: AnnualIncomeRow[] = paymentAllocations.flatMap((allocation) => {
    const share = ownerShareForUnit(allocation.charge.lease.unit); if (!share) return [];
    const ownerAmountCents = proportional(allocation.amountCents, share), chargeAmount = allocation.charge.amountCents;
    const byCategory = (categories: string[]) => allocation.charge.items.filter((item) => categories.includes(item.category)).reduce((sum, item) => sum + item.amountCents, 0);
    const allocateCategory = (sourceCents: number) => chargeAmount > 0 ? Math.round(ownerAmountCents * sourceCents / chargeAmount) : 0;
    if (!allocation.charge.items.length) missingChargeItems = true;
    const rentCents = allocateCategory(byCategory(["RENT"])), depositCents = allocateCategory(byCategory(["DEPOSIT"])), servicesCents = allocateCategory(byCategory(["WATER", "HEATING", "ELECTRICITY", "SERVICES"]));
    return [{ id: allocation.id, bookedAt: allocation.transaction.bookedAt, propertyId: allocation.charge.lease.unit.property.id, propertyName: allocation.charge.lease.unit.property.name, unitLabel: allocation.charge.lease.unit.label, tenantName: allocation.charge.lease.tenant.name, counterpartyName: allocation.transaction.counterpartyName, variableSymbol: allocation.transaction.variableSymbol, receivedCents: allocation.amountCents, ownerShareBasisPoints: share, ownerAmountCents, rentCents, servicesCents, depositCents, otherCents: ownerAmountCents-rentCents-depositCents-servicesCents, allocationNote: share === 10_000 ? "100 % podle současného vlastníka" : `${(share/100).toLocaleString("cs-CZ")} % podle současného podílu` }];
  });
  if (missingChargeItems) issues.push({ code: "MISSING_CHARGE_ITEMS", severity: "WARNING", message: "Některá přijatá úhrada nemá rozpad předpisu. Částka je v přehledu, ale její věcná kategorie zůstává v poli Ostatní." });

  const expenseRows: AnnualExpenseRow[] = [];
  for (const cost of costs) {
    let ownerAmountCents = 0, ownerShareBasisPoints: number | null = null, allocationNote = "";
    if (cost.allocations.length) { ownerAmountCents = cost.allocations.reduce((sum, item) => sum + proportional(item.amountCents, item.unit.ownerships.find((owner) => owner.ownerId === selectedOwner.id)?.shareBasisPoints || 0), 0); allocationNote = "Uložené rozdělení na jednotky × současný podíl vlastníka"; }
    else if (cost.unit) { ownerShareBasisPoints = cost.unit.ownerships.find((row) => row.ownerId === selectedOwner.id)?.shareBasisPoints || (cost.property.ownershipMode === "WHOLE_OBJECT" ? cost.property.ownerships.find((row) => row.ownerId === selectedOwner.id)?.shareBasisPoints ?? (cost.property.ownerId === selectedOwner.id ? 10_000 : 0) : 0); ownerAmountCents = proportional(cost.amountCents, ownerShareBasisPoints); allocationNote = "Přímý náklad jednotky × současný podíl vlastníka"; }
    else if (cost.property.ownershipMode === "WHOLE_OBJECT") { ownerShareBasisPoints = cost.property.ownerships.find((row) => row.ownerId === selectedOwner.id)?.shareBasisPoints ?? (cost.property.ownerId === selectedOwner.id ? 10_000 : 0); ownerAmountCents = proportional(cost.amountCents, ownerShareBasisPoints); allocationNote = "Náklad objektu × současný podíl vlastníka"; }
    else issues.push({ code: `UNALLOCATED_COST:${cost.id}`, severity: "BLOCKER", message: `${cost.property.name}: náklad „${cost.title}“ není rozdělený na jednotky, proto jej nelze přiřadit vlastníkovi.`, href: `/nemovitosti/${cost.propertyId}/naklady/${cost.id}` });
    if (!ownerAmountCents) continue;
    if (!cost.documents.length) issues.push({ code: `MISSING_COST_DOCUMENT:${cost.id}`, severity: "WARNING", message: `${cost.property.name}: náklad „${cost.title}“ nemá připojený účetní doklad.`, href: `/nemovitosti/${cost.propertyId}/naklady/${cost.id}` });
    expenseRows.push({ id: cost.id, effectiveAt: cost.effectiveAt, propertyId: cost.propertyId, propertyName: cost.property.name, title: cost.title, kind: cost.kind, category: cost.category, documentNumber: cost.documentNumber, sourceAmountCents: cost.amountCents, ownerShareBasisPoints, ownerAmountCents, allocationNote, documentCount: cost.documents.length });
  }
  const loanRows: AnnualLoanRow[] = loans.flatMap((loan) => { const share = loan.property.ownershipMode === "WHOLE_OBJECT" ? loan.property.ownerships.find((row) => row.ownerId === selectedOwner.id)?.shareBasisPoints ?? (loan.property.ownerId === selectedOwner.id ? 10_000 : 0) : 0; const snapshot=loan.snapshots[0]; if (!share||!snapshot) return []; return [{ id:loan.id, propertyId:loan.propertyId, propertyName:loan.property.name, label:loan.label, lender:loan.lender, outstandingPrincipalCents:proportional(snapshot.outstandingPrincipalCents,share), annualInterestRateBps:snapshot.annualInterestRateBps, asOfDate:snapshot.asOfDate, evidence:"Sazba a jistina nejsou dokladem zaplaceného úroku" }]; });
  if (loanRows.length) issues.push({ code: "LOAN_INTEREST_SOURCE", severity: "BLOCKER", message: "U úvěrů chybí samostatná evidence skutečně zaplacených úroků. Sazba a zůstatek jistiny jsou pouze kontrolní údaje; doplňte finanční náklad a účetní doklad." });
  const incomeCents=incomeRows.reduce((sum,row)=>sum+row.ownerAmountCents,0), rentIncomeCents=incomeRows.reduce((sum,row)=>sum+row.rentCents,0), servicesIncomeCents=incomeRows.reduce((sum,row)=>sum+row.servicesCents,0), depositIncomeCents=incomeRows.reduce((sum,row)=>sum+row.depositCents,0), expenseCents=expenseRows.reduce((sum,row)=>sum+row.ownerAmountCents,0), documentedExpenseCents=expenseRows.filter((row)=>row.documentCount>0).reduce((sum,row)=>sum+row.ownerAmountCents,0);
  return { year:input.year, owners, selectedOwner, incomeRows, expenseRows, loanRows, issues, totals:{incomeCents,rentIncomeCents,servicesIncomeCents,depositIncomeCents,expenseCents,differenceCents:incomeCents-depositIncomeCents-expenseCents,documentedExpenseCents}, ready:!issues.some((issue)=>issue.severity==="BLOCKER") };
}

function emptyPackage(year:number,owners:Array<{id:string;name:string}>,selectedOwner:{id:string;name:string}|null){return {year,owners,selectedOwner,incomeRows:[] as AnnualIncomeRow[],expenseRows:[] as AnnualExpenseRow[],loanRows:[] as AnnualLoanRow[],issues:[] as AnnualPackageIssue[],totals:{incomeCents:0,rentIncomeCents:0,servicesIncomeCents:0,depositIncomeCents:0,expenseCents:0,differenceCents:0,documentedExpenseCents:0},ready:false};}
