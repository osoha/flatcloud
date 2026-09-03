import { leaseStatusAt, type LeaseLifecycleInput } from "../lease-lifecycle-core";
import { operationalStatusAt, type OperationalEvent } from "../unit-operational-history";
import { monthEndAsOf } from "./live-period";

type OccupancyUnit = {
  operationalStatusEvents: OperationalEvent[];
  leases: LeaseLifecycleInput[];
};

export type OccupancyTrendPoint = {
  label: string;
  rentable: number;
  occupied: number;
  vacant: number;
  unknown: number;
  occupancyBps: number | null;
};

export function calculateLiveOccupancyTrend(units: OccupancyUnit[], periods: string[], currentAsOf: Date): OccupancyTrendPoint[] {
  return periods.map((label) => {
    const asOf = monthEndAsOf(label, currentAsOf);
    let rentable = 0;
    let occupied = 0;
    let unknown = 0;
    for (const unit of units) {
      const operational = operationalStatusAt(unit.operationalStatusEvents, asOf);
      if (operational.kind === "UNKNOWN_BEFORE_HISTORY") {
        unknown += 1;
        continue;
      }
      if (operational.status !== "STANDARD") continue;
      rentable += 1;
      if (unit.leases.some((lease) => leaseStatusAt(lease, asOf) === "ACTIVE")) occupied += 1;
    }
    return {
      label,
      rentable,
      occupied,
      vacant: rentable - occupied,
      unknown,
      occupancyBps: rentable ? Math.round(occupied * 10_000 / rentable) : null,
    };
  });
}
