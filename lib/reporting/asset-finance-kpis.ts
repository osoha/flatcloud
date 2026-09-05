import { prisma } from "../db";
import { consolidatedAmount } from "./flatcloud-asset-scope";
import { businessDateEndInstant, businessDateKey } from "../calendar";

export type AssetFinanceInputRow = {
  propertyId: string;
  propertyName: string;
  consolidationBasisPoints: number;
  monthlyNetRentCents: number;
  actualOpexTtmCents: number;
  outstandingPrincipalCents: number;
  annualDebtServiceCents: number | null;
  marketValueCents: number | null;
  valuationAsOfDate: Date | null;
  approvedBudgetCents?: number | null;
  actualAndCommittedYtdCents?: number;
  loanFixations?: Array<{ loanId: string; label: string; rateType: "FIXED" | "FLOATING"; fixedUntil: Date | null }>;
};

export type AssetFinanceAlert = {
  id: string;
  propertyId: string;
  propertyName: string;
  tone: "bad" | "warn";
  title: string;
  detail: string;
  href: string;
};

const percent = (basisPoints: number) => `${(basisPoints / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %`;
const multiple = (basisPoints: number) => `${(basisPoints / 10_000).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
const amount = (cents: number) => new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(cents / 100);
const day = (value: Date) => new Intl.DateTimeFormat("cs-CZ", { timeZone: "UTC" }).format(value);

function calculateAssetFinanceAlerts(rows: ReturnType<typeof calculatePropertyFinanceRows>, asOf: Date): AssetFinanceAlert[] {
  const alerts: AssetFinanceAlert[] = [];
  const today = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const fixationHorizon = new Date(today);
  fixationHorizon.setUTCFullYear(fixationHorizon.getUTCFullYear() + 1);
  const valuationFreshness = new Date(today);
  valuationFreshness.setUTCFullYear(valuationFreshness.getUTCFullYear() - 1);
  const add = (row: typeof rows[number], alert: Omit<AssetFinanceAlert, "id" | "propertyId" | "propertyName"> & { suffix: string }) => alerts.push({ id: `${row.propertyId}:${alert.suffix}`, propertyId: row.propertyId, propertyName: row.propertyName, tone: alert.tone, title: alert.title, detail: alert.detail, href: alert.href });

  for (const row of rows) {
    if (row.marketValueCents == null) add(row, { suffix: "valuation-missing", tone: "warn", title: "Ocenění není úplné", detail: "Doplňte datované tržní ocenění se zdrojem; bez něj nelze vyhodnotit yield, ROE ani LTV.", href: `/nemovitosti/${row.propertyId}/finance#oceneni` });
    else if (row.valuationAsOfDate && row.valuationAsOfDate < valuationFreshness) add(row, { suffix: "valuation-stale", tone: "warn", title: "Ocenění je starší než 12 měsíců", detail: `Poslední stav je k ${day(row.valuationAsOfDate)}. Zapište aktuální ocenění jako nový historický stav.`, href: `/nemovitosti/${row.propertyId}/finance#oceneni` });
    if (row.annualDebtServiceCents == null) add(row, { suffix: "debt-service-missing", tone: "warn", title: "Chybí dluhová služba", detail: "Doplňte měsíční splátku aktivního úvěru; bez ní nelze vyhodnotit cashflow, ROE ani DSCR.", href: `/nemovitosti/${row.propertyId}/finance#uvery` });
    if (row.ltvBps != null && row.ltvBps > 7_000) add(row, { suffix: "ltv-critical", tone: "bad", title: "LTV překročilo 70 %", detail: `Aktuální LTV je ${percent(row.ltvBps)}. Prověřte ocenění, jistinu a financování.`, href: `/nemovitosti/${row.propertyId}/finance#uvery` });
    else if (row.ltvBps != null && row.ltvBps > 6_000) add(row, { suffix: "ltv-warning", tone: "warn", title: "LTV překročilo 60 %", detail: `Aktuální LTV je ${percent(row.ltvBps)}; kritická hranice je 70 %.`, href: `/nemovitosti/${row.propertyId}/finance#uvery` });
    if (row.dscrBps != null && row.dscrBps < 10_000) add(row, { suffix: "dscr-critical", tone: "bad", title: "DSCR kleslo pod 1,00×", detail: `Aktuální DSCR je ${multiple(row.dscrBps)}. NOI nepokrývá evidovanou dluhovou službu.`, href: `/nemovitosti/${row.propertyId}/finance#uvery` });
    else if (row.dscrBps != null && row.dscrBps < 12_000) add(row, { suffix: "dscr-warning", tone: "warn", title: "DSCR kleslo pod 1,20×", detail: `Aktuální DSCR je ${multiple(row.dscrBps)}; minimální rezerva je nastavena na 1,20×.`, href: `/nemovitosti/${row.propertyId}/finance#uvery` });

    const ytd = row.actualAndCommittedYtdCents || 0;
    if (row.approvedBudgetCents == null) add(row, { suffix: "budget-missing", tone: "warn", title: `Chybí schválený rozpočet ${today.getUTCFullYear()}`, detail: ytd ? `Skutečnost a závazky už dosahují ${amount(ytd)}.` : "Založte roční limit odděleně od pracovních plánů.", href: `/nemovitosti/${row.propertyId}/finance#rozpocet` });
    else if (ytd > row.approvedBudgetCents) add(row, { suffix: "budget-exceeded", tone: "bad", title: "Schválený rozpočet je překročen", detail: `${amount(ytd)} skutečnost a závazky proti limitu ${amount(row.approvedBudgetCents)}.`, href: `/nemovitosti/${row.propertyId}/finance#rozpocet` });
    else if (row.approvedBudgetCents > 0 && ytd * 10 >= row.approvedBudgetCents * 9) add(row, { suffix: "budget-near", tone: "warn", title: "Rozpočet je vyčerpán z 90 %", detail: `${amount(ytd)} skutečnost a závazky proti limitu ${amount(row.approvedBudgetCents)}.`, href: `/nemovitosti/${row.propertyId}/finance#rozpocet` });

    for (const loan of row.loanFixations || []) {
      if (loan.rateType !== "FIXED") continue;
      if (!loan.fixedUntil) add(row, { suffix: `fixation-missing:${loan.loanId}`, tone: "warn", title: "Chybí datum konce fixace", detail: `${loan.label} · doplňte datum pro včasné refinancování.`, href: `/nemovitosti/${row.propertyId}/finance#uvery` });
      else if (loan.fixedUntil < today) add(row, { suffix: `fixation-overdue:${loan.loanId}`, tone: "bad", title: "Fixace úvěru je po termínu", detail: `${loan.label} · fixace skončila ${day(loan.fixedUntil)}.`, href: `/nemovitosti/${row.propertyId}/finance#uvery` });
      else if (loan.fixedUntil <= fixationHorizon) add(row, { suffix: `fixation-upcoming:${loan.loanId}`, tone: "warn", title: "Fixace končí do 12 měsíců", detail: `${loan.label} · konec fixace ${day(loan.fixedUntil)}.`, href: `/nemovitosti/${row.propertyId}/finance#uvery` });
    }
  }
  const severity = { bad: 0, warn: 1 } as const;
  return alerts.sort((a, b) => severity[a.tone] - severity[b.tone] || a.propertyName.localeCompare(b.propertyName, "cs") || a.title.localeCompare(b.title, "cs"));
}

function ratioBasisPoints(numerator: number, denominator: number) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) return null;
  const sign = numerator < 0 ? BigInt(-1) : BigInt(1);
  const absolute = BigInt(Math.abs(numerator));
  const divisor = BigInt(denominator);
  const rounded = (absolute * BigInt(10_000) + divisor / BigInt(2)) / divisor;
  const value = Number(sign * rounded);
  return Number.isSafeInteger(value) ? value : null;
}

function safeBigIntToNumber(value: bigint) {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) throw new Error("Tržní hodnota je mimo bezpečný rozsah finančního reportu.");
  return converted;
}

function calculatePropertyFinanceRows(rows: AssetFinanceInputRow[]) {
  return rows.map((row) => {
    const annualRentCents = row.monthlyNetRentCents * 12;
    const noiCents = annualRentCents - row.actualOpexTtmCents;
    const cashflowCents = row.annualDebtServiceCents == null ? null : noiCents - row.annualDebtServiceCents;
    const equityCents = row.marketValueCents == null ? null : row.marketValueCents - row.outstandingPrincipalCents;
    return {
      ...row,
      annualRentCents,
      noiCents,
      cashflowCents,
      equityCents,
      yieldBps: row.marketValueCents == null ? null : ratioBasisPoints(noiCents, row.marketValueCents),
      roeBps: cashflowCents == null || equityCents == null ? null : ratioBasisPoints(cashflowCents, equityCents),
      ltvBps: row.marketValueCents == null ? null : ratioBasisPoints(row.outstandingPrincipalCents, row.marketValueCents),
      dscrBps: row.annualDebtServiceCents == null || row.annualDebtServiceCents === 0 ? null : ratioBasisPoints(noiCents, row.annualDebtServiceCents),
    };
  });
}

export function calculateAssetFinanceKpis(rows: AssetFinanceInputRow[], asOf = new Date()) {
  const propertyRows = calculatePropertyFinanceRows(rows);
  const valuationComplete = propertyRows.every((row) => row.marketValueCents != null);
  const debtServiceComplete = propertyRows.every((row) => row.annualDebtServiceCents != null);
  const sumConsolidated = (select: (row: typeof propertyRows[number]) => number | null) => propertyRows.reduce((sum, row) => sum + consolidatedAmount(select(row), row.consolidationBasisPoints), 0);
  const annualRentCents = sumConsolidated((row) => row.annualRentCents);
  const actualOpexTtmCents = sumConsolidated((row) => row.actualOpexTtmCents);
  const noiCents = sumConsolidated((row) => row.noiCents);
  const annualDebtServiceCents = debtServiceComplete ? sumConsolidated((row) => row.annualDebtServiceCents) : null;
  const cashflowCents = debtServiceComplete ? sumConsolidated((row) => row.cashflowCents) : null;
  const marketValueCents = valuationComplete ? sumConsolidated((row) => row.marketValueCents) : null;
  const outstandingPrincipalCents = sumConsolidated((row) => row.outstandingPrincipalCents);
  const equityCents = marketValueCents == null ? null : marketValueCents - outstandingPrincipalCents;
  const alerts = calculateAssetFinanceAlerts(propertyRows, asOf);
  return {
    propertyRows,
    includedCount: propertyRows.length,
    valuationCount: propertyRows.filter((row) => row.marketValueCents != null).length,
    missingValuationProperties: propertyRows.filter((row) => row.marketValueCents == null).map((row) => row.propertyName),
    missingDebtServiceProperties: propertyRows.filter((row) => row.annualDebtServiceCents == null).map((row) => row.propertyName),
    alerts,
    criticalAlertCount: alerts.filter((alert) => alert.tone === "bad").length,
    annualRentCents,
    actualOpexTtmCents,
    noiCents,
    annualDebtServiceCents,
    cashflowCents,
    marketValueCents,
    outstandingPrincipalCents,
    equityCents,
    yieldBps: marketValueCents == null ? null : ratioBasisPoints(noiCents, marketValueCents),
    roeBps: cashflowCents == null || equityCents == null ? null : ratioBasisPoints(cashflowCents, equityCents),
    ltvBps: marketValueCents == null ? null : ratioBasisPoints(outstandingPrincipalCents, marketValueCents),
    dscrBps: annualDebtServiceCents == null || annualDebtServiceCents === 0 ? null : ratioBasisPoints(noiCents, annualDebtServiceCents),
  };
}

export async function loadAssetFinanceKpis(rows: Array<{ property: { id: string; name: string; flatcloudConsolidationBasisPoints: number | null }; rentRoll: { monthlyNetRentCents: number | null } }>, asOf: Date) {
  const included = rows.filter((row) => (row.property.flatcloudConsolidationBasisPoints ?? 0) > 0);
  const propertyIds = included.map((row) => row.property.id);
  const asOfEnd = businessDateEndInstant(businessDateKey(asOf));
  const from = new Date(asOfEnd);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  from.setUTCDate(from.getUTCDate() + 1);
  const budgetYear = asOf.getUTCFullYear();
  const yearStart = new Date(Date.UTC(budgetYear, 0, 1));
  const [costs, loans, valuations, budgets, yearCosts] = propertyIds.length ? await Promise.all([
    prisma.propertyCost.findMany({ where: { propertyId: { in: propertyIds }, kind: "OPEX", status: "ACTUAL", effectiveAt: { gte: from, lte: asOfEnd } }, select: { propertyId: true, amountCents: true } }),
    prisma.propertyLoan.findMany({ where: { propertyId: { in: propertyIds }, active: true }, select: { id: true, propertyId: true, label: true, rateType: true, fixedUntil: true, snapshots: { where: { asOfDate: { lte: asOfEnd } }, orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }], take: 1, select: { outstandingPrincipalCents: true, monthlyDebtServiceCents: true } } } }),
    prisma.propertyValuationSnapshot.findMany({ where: { propertyId: { in: propertyIds }, asOfDate: { lte: asOfEnd } }, select: { propertyId: true, marketValueCents: true, asOfDate: true }, orderBy: [{ propertyId: "asc" }, { asOfDate: "desc" }, { createdAt: "desc" }] }),
    prisma.propertyBudgetLine.findMany({ where: { propertyId: { in: propertyIds }, year: budgetYear }, select: { propertyId: true, amountCents: true } }),
    prisma.propertyCost.findMany({ where: { propertyId: { in: propertyIds }, status: { in: ["ACTUAL", "COMMITTED"] }, effectiveAt: { gte: yearStart, lte: asOfEnd } }, select: { propertyId: true, amountCents: true } }),
  ]) : [[], [], [], [], []];
  return calculateAssetFinanceKpis(included.map((row) => {
    const propertyLoans = loans.filter((loan) => loan.propertyId === row.property.id && loan.snapshots.length).map((loan)=>({ ...loan, outstandingPrincipalCents:safeBigIntToNumber(loan.snapshots[0].outstandingPrincipalCents), monthlyDebtServiceCents:loan.snapshots[0].monthlyDebtServiceCents==null?null:safeBigIntToNumber(loan.snapshots[0].monthlyDebtServiceCents) }));
    const propertyBudgets = budgets.filter((line) => line.propertyId === row.property.id);
    const latestValuation = valuations.find((valuation) => valuation.propertyId === row.property.id);
    return {
      propertyId: row.property.id,
      propertyName: row.property.name,
      consolidationBasisPoints: row.property.flatcloudConsolidationBasisPoints!,
      monthlyNetRentCents: row.rentRoll.monthlyNetRentCents || 0,
      actualOpexTtmCents: costs.filter((cost) => cost.propertyId === row.property.id).reduce((sum, cost) => sum + cost.amountCents, 0),
      outstandingPrincipalCents: propertyLoans.reduce((sum, loan) => sum + loan.outstandingPrincipalCents, 0),
      annualDebtServiceCents: propertyLoans.some((loan) => loan.monthlyDebtServiceCents == null) ? null : propertyLoans.reduce((sum, loan) => sum + (loan.monthlyDebtServiceCents || 0) * 12, 0),
      marketValueCents: latestValuation ? safeBigIntToNumber(latestValuation.marketValueCents) : null,
      valuationAsOfDate: latestValuation?.asOfDate ?? null,
      approvedBudgetCents: propertyBudgets.length ? propertyBudgets.reduce((sum, line) => sum + line.amountCents, 0) : null,
      actualAndCommittedYtdCents: yearCosts.filter((cost) => cost.propertyId === row.property.id).reduce((sum, cost) => sum + cost.amountCents, 0),
      loanFixations: propertyLoans.map((loan) => ({ loanId: loan.id, label: loan.label, rateType: loan.rateType, fixedUntil: loan.fixedUntil })),
    };
  }), asOf);
}
