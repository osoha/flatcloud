import { businessMonthKey } from "./calendar";
import { leaseStatusAt } from "./lease-lifecycle-core";

type LeaseFinancialBoundary = {
  startDate: Date;
  endDate?: Date | null;
  terminatedOn?: Date | null;
  cancelledAt?: Date | null;
  financialTrackingFromPeriod: string;
};

export type ActiveFinancialBoundaryResolution = {
  period: string;
  previousPeriod: string;
  corrected: boolean;
};

/**
 * An ACTIVE lease cannot legitimately start financial tracking in a future month.
 * Clamp only to the current month so a correction never invents historical charges.
 */
export function resolveActiveFinancialBoundary(lease: LeaseFinancialBoundary, now = new Date()): ActiveFinancialBoundaryResolution {
  const currentPeriod = businessMonthKey(now);
  const corrected = leaseStatusAt(lease, now) === "ACTIVE" && lease.financialTrackingFromPeriod > currentPeriod;
  return {
    period: corrected ? currentPeriod : lease.financialTrackingFromPeriod,
    previousPeriod: lease.financialTrackingFromPeriod,
    corrected,
  };
}

export function leaseForLiveFinancialReporting<T extends LeaseFinancialBoundary>(lease: T, asOf = new Date()): T & { forceContractAmountsForLiveReporting?: boolean } {
  const resolution = resolveActiveFinancialBoundary(lease, asOf);
  return resolution.corrected ? { ...lease, financialTrackingFromPeriod: resolution.period, forceContractAmountsForLiveReporting: true } : lease;
}
