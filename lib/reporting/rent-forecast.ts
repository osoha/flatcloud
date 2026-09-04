export const rentForecastScenarios = {
  conservative: { label: "Konzervativní", annualGrowthBps: 100, vacancyBps: 700, collectionBps: 9_500, marketGapCaptureBps: 2_500 },
  base: { label: "Základní", annualGrowthBps: 300, vacancyBps: 500, collectionBps: 9_800, marketGapCaptureBps: 5_000 },
  optimistic: { label: "Optimistický", annualGrowthBps: 500, vacancyBps: 300, collectionBps: 9_900, marketGapCaptureBps: 7_500 },
} as const;

export type RentForecastScenario = keyof typeof rentForecastScenarios;
export type RentForecastAssumptions = {
  label: string;
  annualGrowthBps: number;
  vacancyBps: number;
  collectionBps: number;
  marketGapCaptureBps: number;
};

export type RentForecastInput = {
  leaseId: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
  currentRentCents: number;
  effectiveEnd: Date | null;
  indexationEnabled: boolean;
  indexationPercentBps: number | null;
  nextIndexationAt: Date | null;
  mfMarketRentCents: number | null;
};

const addMonths = (value: Date, months: number) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
const addYears = (value: Date, years: number) => new Date(Date.UTC(value.getUTCFullYear() + years, value.getUTCMonth(), value.getUTCDate()));
const endOfMonth = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0, 23, 59, 59, 999));
const periodKey = (value: Date) => value.toISOString().slice(0, 7);
const applyRate = (cents: number, basisPoints: number) => Math.round(cents * (10_000 + basisPoints) / 10_000);

function contractualRentAt(row: RentForecastInput, month: Date) {
  if (row.effectiveEnd && month > row.effectiveEnd) return 0;
  if (!row.indexationEnabled || !row.indexationPercentBps || !row.nextIndexationAt) return row.currentRentCents;
  let rent = row.currentRentCents;
  let next = row.nextIndexationAt;
  const boundary = endOfMonth(month);
  for (let count = 0; next <= boundary && (!row.effectiveEnd || next <= row.effectiveEnd) && count < 10; count += 1) {
    rent = applyRate(rent, row.indexationPercentBps);
    next = addYears(next, 1);
  }
  return rent;
}

function plannedRentAt(row: RentForecastInput, monthIndex: number, horizonMonths: number, scenario: RentForecastAssumptions) {
  const positiveMarketGap = Math.max(0, (row.mfMarketRentCents ?? row.currentRentCents) - row.currentRentCents);
  const captureProgress = Math.min(1, (monthIndex + 1) / Math.max(1, horizonMonths));
  let rent = row.currentRentCents + Math.round(positiveMarketGap * scenario.marketGapCaptureBps / 10_000 * captureProgress);
  for (let year = 0; year < Math.floor(monthIndex / 12); year += 1) rent = applyRate(rent, scenario.annualGrowthBps);
  return rent;
}

export function parseRentForecastScenario(value?: string): RentForecastScenario {
  return value && value in rentForecastScenarios ? value as RentForecastScenario : "base";
}

export function parseRentForecastHorizon(value?: string) {
  const parsed = Number(value);
  return parsed === 12 || parsed === 36 ? parsed : 24;
}

export function rentForecastBasisPointsFromPercent(value: string, label: string, maximum = 10_000) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`${label} zadejte jako procento s nejvýše dvěma desetinnými místy.`);
  const basisPoints = Math.round(Number(normalized) * 100);
  if (basisPoints < 0 || basisPoints > maximum) throw new Error(`${label} musí být mezi 0 a ${maximum / 100} %.`);
  return basisPoints;
}

function percentQueryToBasisPoints(value: string | undefined, fallback: number, maximum: number, label: string) {
  if (value === undefined) return fallback;
  try { return rentForecastBasisPointsFromPercent(value, label, maximum); } catch { return fallback; }
}

export function parseRentForecastAssumptions(input: { annualGrowthPercent?: string; vacancyPercent?: string; collectionPercent?: string; marketGapCapturePercent?: string }, scenarioKey: RentForecastScenario) {
  const preset = rentForecastScenarios[scenarioKey];
  const customized = Object.values(input).some((value) => value !== undefined);
  return {
    customized,
    assumptions: {
      label: customized ? "Vlastní" : preset.label,
      annualGrowthBps: percentQueryToBasisPoints(input.annualGrowthPercent, preset.annualGrowthBps, 2_000, "Roční růst"),
      vacancyBps: percentQueryToBasisPoints(input.vacancyPercent, preset.vacancyBps, 10_000, "Vacancy"),
      collectionBps: percentQueryToBasisPoints(input.collectionPercent, preset.collectionBps, 10_000, "Úspěšnost inkasa"),
      marketGapCaptureBps: percentQueryToBasisPoints(input.marketGapCapturePercent, preset.marketGapCaptureBps, 10_000, "Využití MF rozdílu"),
    } satisfies RentForecastAssumptions,
  };
}

export function calculateRentForecast(rows: RentForecastInput[], asOf: Date, scenarioKey: RentForecastScenario, horizonMonths: number) {
  return calculateRentForecastWithAssumptions(rows, asOf, scenarioKey, rentForecastScenarios[scenarioKey], horizonMonths);
}

export function calculateRentForecastWithAssumptions(rows: RentForecastInput[], asOf: Date, scenarioKey: string, scenario: RentForecastAssumptions, horizonMonths: number) {
  const firstMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const months = Array.from({ length: horizonMonths }, (_, index) => {
    const month = addMonths(firstMonth, index);
    const contractualCents = rows.reduce((sum, row) => sum + contractualRentAt(row, month), 0);
    const plannedCents = rows.reduce((sum, row) => sum + plannedRentAt(row, index, horizonMonths, scenario), 0);
    const expectedCollectedCents = Math.round(plannedCents * (10_000 - scenario.vacancyBps) / 10_000 * scenario.collectionBps / 10_000);
    const mfReferenceCents = rows.reduce((sum, row) => sum + (row.mfMarketRentCents ?? row.currentRentCents), 0);
    return { period: periodKey(month), contractualCents, plannedCents, expectedCollectedCents, mfReferenceCents };
  });
  const unitRows = rows.map((row) => {
    const finalMonth = months.length ? addMonths(firstMonth, months.length - 1) : firstMonth;
    const finalContractualCents = contractualRentAt(row, finalMonth);
    const finalPlannedCents = plannedRentAt(row, Math.max(0, months.length - 1), horizonMonths, scenario);
    return { ...row, finalContractualCents, finalPlannedCents, plannedUpliftCents: finalPlannedCents - finalContractualCents };
  });
  const sum = (select: (month: typeof months[number]) => number) => months.reduce((total, month) => total + select(month), 0);
  const contractualTotalCents = sum((month) => month.contractualCents);
  const plannedTotalCents = sum((month) => month.plannedCents);
  return {
    scenarioKey,
    scenario,
    horizonMonths,
    months,
    unitRows,
    leaseCount: rows.length,
    expiringLeaseCount: rows.filter((row) => row.effectiveEnd && row.effectiveEnd <= endOfMonth(addMonths(firstMonth, horizonMonths - 1))).length,
    mfCoveredCount: rows.filter((row) => row.mfMarketRentCents != null).length,
    contractualTotalCents,
    plannedTotalCents,
    expectedCollectedTotalCents: sum((month) => month.expectedCollectedCents),
    scenarioUpliftCents: plannedTotalCents - contractualTotalCents,
  };
}
