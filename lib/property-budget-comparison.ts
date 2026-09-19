import type { PropertyCostCategory, PropertyCostKind, PropertyCostStatus } from "@prisma/client";

export type BudgetInput = { year: number; kind: PropertyCostKind; category: PropertyCostCategory; amountCents: number };
export type CostInput = { effectiveAt: Date; kind: PropertyCostKind; category: PropertyCostCategory; status: PropertyCostStatus; amountCents: number };
export type BudgetComparisonRow = {
  kind: PropertyCostKind;
  category: PropertyCostCategory;
  budgetLines: number;
  budgetCents: number;
  plannedCents: number;
  committedCents: number;
  actualCents: number;
  remainingCents: number | null;
};

// Inputs are already restricted to one accessible property by the caller.
// A cost occurs once in its current lifecycle status; allocations are not extra costs.
export function comparePropertyBudget(budgets: BudgetInput[], costs: CostInput[], year: number) {
  const rows = new Map<string, BudgetComparisonRow>();
  const get = (kind: PropertyCostKind, category: PropertyCostCategory) => {
    const key = `${kind}:${category}`;
    let row = rows.get(key);
    if (!row) {
      row = { kind, category, budgetLines: 0, budgetCents: 0, plannedCents: 0, committedCents: 0, actualCents: 0, remainingCents: null };
      rows.set(key, row);
    }
    return row;
  };
  for (const budget of budgets) {
    if (budget.year !== year) continue;
    const row = get(budget.kind, budget.category);
    row.budgetLines++;
    row.budgetCents += budget.amountCents;
  }
  for (const cost of costs) {
    if (cost.effectiveAt.getUTCFullYear() !== year) continue;
    const row = get(cost.kind, cost.category);
    if (cost.status === "ACTUAL") row.actualCents += cost.amountCents;
    else if (cost.status === "COMMITTED") row.committedCents += cost.amountCents;
    else row.plannedCents += cost.amountCents;
  }
  for (const row of rows.values()) {
    row.remainingCents = row.budgetLines ? row.budgetCents - row.actualCents - row.committedCents : null;
    for (const value of [row.budgetCents, row.actualCents, row.committedCents, row.plannedCents, row.remainingCents ?? 0]) {
      if (!Number.isSafeInteger(value)) throw new Error("Částka porovnání rozpočtu je mimo bezpečný rozsah.");
    }
  }
  return [...rows.values()].sort((a, b) => (a.kind === b.kind ? a.category.localeCompare(b.category) : a.kind === "OPEX" ? -1 : 1));
}
