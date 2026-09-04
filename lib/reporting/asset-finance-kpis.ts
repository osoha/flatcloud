import { prisma } from "../db";
import { consolidatedAmount } from "./flatcloud-asset-scope";

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
};

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

export function calculateAssetFinanceKpis(rows: AssetFinanceInputRow[]) {
  const propertyRows = rows.map((row) => {
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
  return {
    propertyRows,
    includedCount: propertyRows.length,
    valuationCount: propertyRows.filter((row) => row.marketValueCents != null).length,
    missingValuationProperties: propertyRows.filter((row) => row.marketValueCents == null).map((row) => row.propertyName),
    missingDebtServiceProperties: propertyRows.filter((row) => row.annualDebtServiceCents == null).map((row) => row.propertyName),
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
  const from = new Date(asOf);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  from.setUTCDate(from.getUTCDate() + 1);
  const [costs, loans, valuations] = propertyIds.length ? await Promise.all([
    prisma.propertyCost.findMany({ where: { propertyId: { in: propertyIds }, kind: "OPEX", status: "ACTUAL", effectiveAt: { gte: from, lte: asOf } }, select: { propertyId: true, amountCents: true } }),
    prisma.propertyLoan.findMany({ where: { propertyId: { in: propertyIds }, active: true }, select: { propertyId: true, outstandingPrincipalCents: true, monthlyDebtServiceCents: true } }),
    prisma.propertyValuationSnapshot.findMany({ where: { propertyId: { in: propertyIds }, asOfDate: { lte: asOf } }, select: { propertyId: true, marketValueCents: true, asOfDate: true }, orderBy: [{ propertyId: "asc" }, { asOfDate: "desc" }, { createdAt: "desc" }] }),
  ]) : [[], [], []];
  return calculateAssetFinanceKpis(included.map((row) => {
    const propertyLoans = loans.filter((loan) => loan.propertyId === row.property.id);
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
    };
  }));
}
