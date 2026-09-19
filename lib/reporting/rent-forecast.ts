export const rentForecastScenarios = {
  conservative: { label: "Konzervativní", annualGrowthBps: 100, marketAnnualGrowthBps: -100, marketCatchUpMonths: 24, vacancyBps: 700, collectionBps: 9_500, marketGapCaptureBps: 2_500, expiryStrategy: "RENEW" as const, relettingTargetBps: 9_500, relettingVacancyMonths: 1 },
  base: { label: "Základní", annualGrowthBps: 300, marketAnnualGrowthBps: 200, marketCatchUpMonths: 24, vacancyBps: 500, collectionBps: 9_800, marketGapCaptureBps: 5_000, expiryStrategy: "RENEW" as const, relettingTargetBps: 10_000, relettingVacancyMonths: 1 },
  optimistic: { label: "Optimistický", annualGrowthBps: 500, marketAnnualGrowthBps: 400, marketCatchUpMonths: 24, vacancyBps: 300, collectionBps: 9_900, marketGapCaptureBps: 7_500, expiryStrategy: "RELET" as const, relettingTargetBps: 10_000, relettingVacancyMonths: 0 },
} as const;

export type RentForecastScenario = keyof typeof rentForecastScenarios;
export type RentForecastAssumptions = {
  label: string;
  annualGrowthBps: number;
  marketAnnualGrowthBps?: number;
  marketCatchUpMonths?: number;
  vacancyBps: number;
  collectionBps: number;
  marketGapCaptureBps: number;
  expiryStrategy?: "RENEW" | "RELET";
  relettingTargetBps?: number;
  relettingVacancyMonths?: number;
};

export type RentForecastInput = {
  leaseId: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
  currentRentCents: number;
  startDate?: Date | null;
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

function contractualRentAt(row: RentForecastInput, month: Date, version: 1 | 2 | 3) {
  if (row.effectiveEnd && month > row.effectiveEnd) return 0;
  if (!row.indexationEnabled || !row.indexationPercentBps || !row.nextIndexationAt) return row.currentRentCents;
  let rent = row.currentRentCents;
  let next = row.nextIndexationAt;
  const boundary = endOfMonth(month);
  for (let count = 0; next <= boundary && (!row.effectiveEnd || next <= row.effectiveEnd) && count < (version === 1 ? 10 : 200); count += 1) {
    rent = applyRate(rent, row.indexationPercentBps);
    next = addYears(next, 1);
  }
  return rent;
}

function monthDistance(from: Date, to: Date) {
  return Math.max(0, (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth());
}

function inferredTermMonths(row: RentForecastInput) {
  if (!row.startDate || !row.effectiveEnd) return null;
  return Math.max(1, (row.effectiveEnd.getUTCFullYear() - row.startDate.getUTCFullYear()) * 12 + row.effectiveEnd.getUTCMonth() - row.startDate.getUTCMonth() + 1);
}

function marketRentAt(row: RentForecastInput, month: Date, asOf: Date, scenario: RentForecastAssumptions) {
  if (row.mfMarketRentCents == null) return null;
  const years = Math.max(0, month.getUTCFullYear() - asOf.getUTCFullYear());
  return Math.round(row.mfMarketRentCents * (1 + (scenario.marketAnnualGrowthBps ?? 0) / 10_000) ** years);
}

function eventDrivenPlanAt(row: RentForecastInput, month: Date, asOf: Date, scenario: RentForecastAssumptions) {
  const boundary = endOfMonth(month);
  const firstMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  let rent = row.currentRentCents;
  let lastEvent = firstMonth;
  let vacancyStart: Date | null = null;
  let vacancyUntil: Date | null = null;
  const events: Array<{ date: Date; kind: "INDEXATION" | "EXPIRY" }> = [];

  if (row.indexationEnabled && row.nextIndexationAt) {
    for (let d = row.nextIndexationAt, count = 0; d <= boundary && (!row.effectiveEnd || d <= row.effectiveEnd) && count < 200; d = addYears(d, 1), count += 1) {
      events.push({ date: d, kind: "INDEXATION" });
    }
  }

  if (row.effectiveEnd) {
    const firstExpiry = new Date(Date.UTC(row.effectiveEnd.getUTCFullYear(), row.effectiveEnd.getUTCMonth() + 1, 1));
    const term = inferredTermMonths(row);
    for (let d = firstExpiry, count = 0; d <= boundary && count < 200; d = term ? addMonths(d, term) : new Date(8640000000000000), count += 1) {
      events.push({ date: d, kind: "EXPIRY" });
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime() || a.kind.localeCompare(b.kind));
  for (const event of events) {
    if (event.date < firstMonth) continue;
    const market = marketRentAt(row, event.date, asOf, scenario);
    if (event.kind === "EXPIRY" && (scenario.expiryStrategy ?? "RENEW") === "RELET") {
      if (market != null) rent = Math.round(market * (scenario.relettingTargetBps ?? 10_000) / 10_000);
      const vacancyMonths = Math.max(0, scenario.relettingVacancyMonths ?? 1);
      vacancyStart = new Date(Date.UTC(event.date.getUTCFullYear(), event.date.getUTCMonth(), 1));
      vacancyUntil = vacancyMonths ? addMonths(vacancyStart, vacancyMonths) : vacancyStart;
    } else {
      const elapsed = Math.max(1, monthDistance(lastEvent, event.date));
      const annualFactor = (1 + scenario.annualGrowthBps / 10_000) ** (elapsed / 12);
      const growthTarget = Math.round(rent * annualFactor);
      const totalElapsed = monthDistance(firstMonth, event.date) + 1;
      const captureProgress = Math.min(1, totalElapsed / Math.max(1, scenario.marketCatchUpMonths ?? 24));
      const marketGap = market == null ? 0 : Math.max(0, market - row.currentRentCents);
      const gapTarget = row.currentRentCents + Math.round(marketGap * (scenario.marketGapCaptureBps / 10_000) * captureProgress);
      rent = Math.max(rent, growthTarget, gapTarget);
    }
    lastEvent = event.date;
  }

  const vacant = Boolean(vacancyStart && vacancyUntil && month >= vacancyStart && month < vacancyUntil);
  return { rent, vacant };
}

function plannedRentAt(row: RentForecastInput, monthIndex: number, horizonMonths: number, scenario: RentForecastAssumptions, version: 1 | 2 | 3, month?: Date, asOf?: Date) {
  if (version === 3 && month && asOf) return eventDrivenPlanAt(row, month, asOf, scenario);
  const positiveMarketGap = Math.max(0, (row.mfMarketRentCents ?? row.currentRentCents) - row.currentRentCents);
  const captureProgress = Math.min(1, (monthIndex + 1) / Math.max(1, version === 1 ? horizonMonths : scenario.marketCatchUpMonths ?? 24));
  let rent = row.currentRentCents + Math.round(positiveMarketGap * scenario.marketGapCaptureBps / 10_000 * captureProgress);
  for (let year = 0; year < Math.floor(monthIndex / 12); year += 1) rent = applyRate(rent, scenario.annualGrowthBps);
  return { rent, vacant: false };
}

export function parseRentForecastScenario(value?: string): RentForecastScenario {
  return value && value in rentForecastScenarios ? value as RentForecastScenario : "base";
}

export function parseRentForecastHorizon(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 360 ? parsed : 24;
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

export function parseRentForecastAssumptions(input: { annualGrowthPercent?: string; vacancyPercent?: string; collectionPercent?: string; marketGapCapturePercent?: string; marketAnnualGrowthPercent?: string; marketCatchUpMonths?: string; expiryStrategy?: string; relettingTargetPercent?: string; relettingVacancyMonths?: string }, scenarioKey: RentForecastScenario) {
  const preset = rentForecastScenarios[scenarioKey];
  const customized = Object.values(input).some((value) => value !== undefined);
  return {
    customized,
    assumptions: {
      label: customized ? "Vlastní" : preset.label,
      annualGrowthBps: percentQueryToBasisPoints(input.annualGrowthPercent, preset.annualGrowthBps, 2_000, "Roční růst"),
      vacancyBps: percentQueryToBasisPoints(input.vacancyPercent, preset.vacancyBps, 10_000, "Vacancy"),
      collectionBps: percentQueryToBasisPoints(input.collectionPercent, preset.collectionBps, 10_000, "Úspěšnost inkasa"),
      marketAnnualGrowthBps: marketGrowthOrDefault(input.marketAnnualGrowthPercent, preset.marketAnnualGrowthBps),
      marketCatchUpMonths: input.marketCatchUpMonths === undefined ? preset.marketCatchUpMonths : parseRentForecastHorizon(input.marketCatchUpMonths),
      marketGapCaptureBps: percentQueryToBasisPoints(input.marketGapCapturePercent, preset.marketGapCaptureBps, 10_000, "Využití MF rozdílu"),
      expiryStrategy: input.expiryStrategy === "RELET" ? "RELET" : input.expiryStrategy === "RENEW" ? "RENEW" : preset.expiryStrategy,
      relettingTargetBps: percentQueryToBasisPoints(input.relettingTargetPercent, preset.relettingTargetBps, 15_000, "Headline rent při přeobsazení"),
      relettingVacancyMonths: input.relettingVacancyMonths === undefined ? preset.relettingVacancyMonths : Math.max(0, Math.min(24, Math.trunc(Number(input.relettingVacancyMonths) || 0))),
    } satisfies RentForecastAssumptions,
  };
}

export function calculateRentForecast(rows: RentForecastInput[], asOf: Date, scenarioKey: RentForecastScenario, horizonMonths: number) {
  return calculateRentForecastWithAssumptions(rows, asOf, scenarioKey, rentForecastScenarios[scenarioKey], horizonMonths, 2);
}

export function calculateRentForecastWithAssumptions(rows: RentForecastInput[], asOf: Date, scenarioKey: string, scenario: RentForecastAssumptions, horizonMonths: number, version: 1 | 2 | 3 = 2) {
  if (!Number.isInteger(horizonMonths) || horizonMonths < 1 || horizonMonths > 360) throw new Error("Horizont musí mít 1 až 360 měsíců.");
  const firstMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const months = Array.from({ length: horizonMonths }, (_, index) => {
    const month = addMonths(firstMonth, index);
    const contractualCents = rows.reduce((sum, row) => sum + contractualRentAt(row, month, version), 0);
    const plannedStates = rows.map((row) => plannedRentAt(row, index, horizonMonths, scenario, version, month, asOf));
    const plannedCents = plannedStates.reduce((sum, state) => sum + state.rent, 0);
    const expectedCollectedCents = Math.round(plannedStates.reduce((sum, state) => sum + (state.vacant ? 0 : state.rent), 0) * (10_000 - scenario.vacancyBps) / 10_000 * scenario.collectionBps / 10_000);
    const mfReferenceCents = rows.reduce((sum, row) => sum + (row.mfMarketRentCents ?? row.currentRentCents), 0);
    const mfProjectedCents = rows.length && rows.every((row) => row.mfMarketRentCents != null)
      ? rows.reduce((sum, row) => sum + (version === 3 ? marketRentAt(row, month, asOf, scenario)! : Math.round(row.mfMarketRentCents! * (1 + (version === 1 ? 0 : scenario.marketAnnualGrowthBps ?? 0) / 10_000) ** Math.floor(index / 12))), 0)
      : null;
    return { period: periodKey(month), contractualCents, plannedCents, expectedCollectedCents, mfReferenceCents, mfProjectedCents };
  });
  const unitRows = rows.map((row) => {
    const finalMonth = months.length ? addMonths(firstMonth, months.length - 1) : firstMonth;
    const finalContractualCents = contractualRentAt(row, finalMonth, version);
    const finalPlannedCents = plannedRentAt(row, Math.max(0, months.length - 1), horizonMonths, scenario, version, finalMonth, asOf).rent;
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

export function marketGrowthBasisPoints(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Růst trhu zadejte jako procento s nejvýše dvěma desetinnými místy.");
  const bps = Math.round(Number(normalized) * 100);
  if (!Number.isInteger(bps) || bps < -2000 || bps > 2000) throw new Error("Růst trhu musí být mezi −20 a 20 %.");
  return bps;
}

function marketGrowthOrDefault(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  try { return marketGrowthBasisPoints(value); } catch { return fallback; }
}