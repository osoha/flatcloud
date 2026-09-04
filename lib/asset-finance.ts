import type { LoanRateType, PropertyCostCategory, PropertyCostKind, PropertyCostStatus } from "@prisma/client";

export const propertyCostKinds: Record<PropertyCostKind, string> = {
  OPEX: "Provozní náklad (OPEX)",
  CAPEX: "Investice (CAPEX)",
};

export const propertyCostStatuses: Record<PropertyCostStatus, string> = {
  PLANNED: "Plán",
  COMMITTED: "Objednáno",
  ACTUAL: "Skutečnost",
};

export const propertyCostCategories: Record<PropertyCostCategory, string> = {
  REPAIRS: "Opravy",
  MAINTENANCE: "Údržba",
  UTILITIES: "Energie a média",
  INSURANCE: "Pojištění",
  TAX: "Daně a poplatky",
  MANAGEMENT: "Správa",
  LEGAL: "Právní služby",
  CONSTRUCTION: "Stavební práce",
  EQUIPMENT: "Vybavení",
  FINANCING: "Financování",
  OTHER: "Ostatní",
};

export const loanRateTypes: Record<LoanRateType, string> = {
  FIXED: "Fixní sazba",
  FLOATING: "Pohyblivá sazba",
};

export function basisPointsFromPercent(raw: string) {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Úrok zadejte jako procento s nejvýše dvěma desetinnými místy.");
  const basisPoints = Math.round(Number(normalized) * 100);
  if (basisPoints < 0 || basisPoints > 10_000) throw new Error("Úroková sazba musí být mezi 0 a 100 %.");
  return basisPoints;
}

export function percentFromBasisPoints(basisPoints: number) {
  return `${(basisPoints / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} %`;
}

export function normalizeFinanceYear(raw: string | undefined, fallback = new Date().getUTCFullYear()) {
  if (!raw || !/^\d{4}$/.test(raw)) return fallback;
  const year = Number(raw);
  return year >= 2000 && year <= 2200 ? year : fallback;
}

export function calculateBudgetSummary(
  budgets: Array<{ kind: PropertyCostKind; category: PropertyCostCategory; amountCents: number; year: number }>,
  costs: Array<{ kind: PropertyCostKind; category: PropertyCostCategory; status: PropertyCostStatus; amountCents: number; effectiveAt: Date }>,
  year: number,
) {
  const budgetRows = budgets.filter((line) => line.year === year);
  const costRows = costs.filter((cost) => cost.effectiveAt.getUTCFullYear() === year);
  const budgetCents = budgetRows.reduce((sum, line) => sum + line.amountCents, 0);
  const committedCents = costRows.filter((cost) => cost.status === "COMMITTED").reduce((sum, cost) => sum + cost.amountCents, 0);
  const actualCents = costRows.filter((cost) => cost.status === "ACTUAL").reduce((sum, cost) => sum + cost.amountCents, 0);
  return { budgetCents, committedCents, actualCents, remainingCents: budgetCents - committedCents - actualCents };
}

export function calculateAssetFinanceSummary(
  costs: Array<{ kind: PropertyCostKind; status: PropertyCostStatus; amountCents: number; effectiveAt: Date }>,
  loans: Array<{ active: boolean; outstandingPrincipalCents: number; monthlyDebtServiceCents: number | null }>,
  year: number,
) {
  const inYear = costs.filter((cost) => cost.effectiveAt.getUTCFullYear() === year);
  return {
    actualOpexCents: inYear.filter((cost) => cost.kind === "OPEX" && cost.status === "ACTUAL").reduce((sum, cost) => sum + cost.amountCents, 0),
    actualCapexCents: inYear.filter((cost) => cost.kind === "CAPEX" && cost.status === "ACTUAL").reduce((sum, cost) => sum + cost.amountCents, 0),
    plannedCents: inYear.filter((cost) => cost.status === "PLANNED" || cost.status === "COMMITTED").reduce((sum, cost) => sum + cost.amountCents, 0),
    outstandingPrincipalCents: loans.filter((loan) => loan.active).reduce((sum, loan) => sum + loan.outstandingPrincipalCents, 0),
    monthlyDebtServiceCents: loans.filter((loan) => loan.active).reduce((sum, loan) => sum + (loan.monthlyDebtServiceCents || 0), 0),
  };
}
