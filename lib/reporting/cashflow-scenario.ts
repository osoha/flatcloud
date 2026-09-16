/** Read-only planning overlay. Amounts are cents; never writes ledger or approved plans. */
export type CashflowIncomeMonth = { period: string; contractualCents: number; expectedCollectedCents: number };
export type CashflowAssumptions = {
  openingCashCents: number;
  monthlyOpexCents: number;
  annualOpexGrowthBps: number;
  monthlyDebtServiceCents: number;
  capexCents: number;
  capexMonth: number;
};
const LIMIT = 1_000_000_000_000;
export function cashflowCents(value: string, label: string, signed = false) {
  const normalized = value.trim().replace(",", ".");
  if (!(signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(normalized)) throw new Error(`${label}: zadejte částku s nejvýše dvěma desetinnými místy.`);
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > LIMIT) throw new Error(`${label}: částka je mimo povolený rozsah.`);
  return cents;
}
export function calculateCashflowScenario(income: CashflowIncomeMonth[], assumptions: CashflowAssumptions) {
  if (income.length < 1 || income.length > 360) throw new Error("Horizont musí mít 1 až 360 měsíců.");
  for (const [key, value] of Object.entries(assumptions)) {
    if (!Number.isSafeInteger(value) || Math.abs(value) > LIMIT || (key !== "openingCashCents" && value < 0)) throw new Error("Neplatný vstup cashflow.");
  }
  if (assumptions.annualOpexGrowthBps > 2000 || assumptions.capexMonth < 1 || assumptions.capexMonth > income.length) throw new Error("Růst nákladů musí být 0–20 % a CAPEX v rámci horizontu.");
  let cash = assumptions.openingCashCents;
  const months = income.map((month, index) => {
    if (![month.contractualCents, month.expectedCollectedCents].every(value => Number.isSafeInteger(value) && value >= 0 && value <= LIMIT)) throw new Error("Neplatný příjmový podklad.");
    const opexCents = Math.round(assumptions.monthlyOpexCents * (1 + assumptions.annualOpexGrowthBps / 10000) ** Math.floor(index / 12));
    const debtServiceCents = assumptions.monthlyDebtServiceCents;
    const capexCents = index + 1 === assumptions.capexMonth ? assumptions.capexCents : 0;
    const operatingCashflowCents = month.expectedCollectedCents - opexCents;
    const netCashflowCents = operatingCashflowCents - debtServiceCents - capexCents;
    cash += netCashflowCents;
    if (![opexCents, operatingCashflowCents, netCashflowCents, cash].every(Number.isSafeInteger)) throw new Error("Výsledek dlouhodobého scénáře překročil přesný číselný rozsah. Zkraťte horizont nebo upravte vstupy.");
    return { ...month, opexCents, debtServiceCents, capexCents, operatingCashflowCents, netCashflowCents, cashBalanceCents: cash };
  });
  const sum = (key: "expectedCollectedCents" | "opexCents" | "debtServiceCents" | "capexCents" | "netCashflowCents") => { const total = months.reduce((total, row) => total + row[key], 0); if (!Number.isSafeInteger(total)) throw new Error("Součet scénáře překročil přesný číselný rozsah."); return total; };
  return { months, incomeCents: sum("expectedCollectedCents"), opexCents: sum("opexCents"), debtServiceCents: sum("debtServiceCents"), capexCents: sum("capexCents"), netCashflowCents: sum("netCashflowCents"), closingCashCents: cash, minimumCashCents: Math.min(assumptions.openingCashCents, ...months.map(row => row.cashBalanceCents)), firstNegativePeriod: months.find(row => row.cashBalanceCents < 0)?.period ?? null };
}
