import type { Prisma, RentForecastPlanStatus } from "@prisma/client";
import { calculateSavedRentForecast } from "./rent-forecast-plans";

type SavedPlan = {
  name: string;
  status: RentForecastPlanStatus;
  asOfDate: Date;
  horizonMonths: number;
  annualGrowthBps: number;
  vacancyBps: number;
  collectionBps: number;
  marketGapCaptureBps: number;
  inputSnapshot: Prisma.JsonValue;
};

export const rentForecastTransferStates = {
  ADDENDUM_REVIEW: "K posouzení dodatku",
  RENEWAL_REQUIRED: "Nejprve obnovit nájem",
  INDEXATION_REVIEW: "Nejprve zohlednit indexaci",
  NO_CHANGE: "Bez navržené změny",
} as const;

export function calculateRentForecastTransferPreview(plan: SavedPlan) {
  if (plan.status !== "APPROVED") throw new Error("Náhled převodu je dostupný pouze pro schválený scénář.");
  const forecast = calculateSavedRentForecast(plan);
  const effectivePeriod = forecast.months.at(-1)?.period ?? plan.asOfDate.toISOString().slice(0, 7);
  const effectiveAt = new Date(`${effectivePeriod}-01T12:00:00.000Z`);
  const rows = forecast.unitRows.map((row) => {
    const state = row.effectiveEnd && row.effectiveEnd < effectiveAt ? "RENEWAL_REQUIRED" as const : row.nextIndexationAt && row.nextIndexationAt <= effectiveAt ? "INDEXATION_REVIEW" as const : row.finalPlannedCents === row.finalContractualCents ? "NO_CHANGE" as const : "ADDENDUM_REVIEW" as const;
    return { leaseId: row.leaseId, propertyId: row.propertyId, propertyName: row.propertyName, unitId: row.unitId, unitLabel: row.unitLabel, currentRentCents: row.currentRentCents, contractualRentCents: row.finalContractualCents, proposedRentCents: row.finalPlannedCents, differenceCents: row.finalPlannedCents - row.finalContractualCents, effectivePeriod, state };
  });
  return {
    effectivePeriod,
    rows,
    addendumReviewCount: rows.filter((row) => row.state === "ADDENDUM_REVIEW").length,
    renewalRequiredCount: rows.filter((row) => row.state === "RENEWAL_REQUIRED").length,
    indexationReviewCount: rows.filter((row) => row.state === "INDEXATION_REVIEW").length,
    noChangeCount: rows.filter((row) => row.state === "NO_CHANGE").length,
  };
}
