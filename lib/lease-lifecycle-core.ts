export type LeaseLifecycleStatus = "ACTIVE" | "FUTURE" | "ENDED";

export type LeaseLifecycleInput = {
  startDate: Date;
  endDate?: Date | null;
  terminatedOn?: Date | null;
  cancelledAt?: Date | null;
};

import { businessDateKey } from "./calendar";
export const pragueDateKey = businessDateKey;

export function effectiveLeaseEnd(lease: Pick<LeaseLifecycleInput, "endDate" | "terminatedOn">) {
  if (lease.endDate && lease.terminatedOn) {
    return pragueDateKey(lease.terminatedOn) < pragueDateKey(lease.endDate) ? lease.terminatedOn : lease.endDate;
  }
  return lease.terminatedOn || lease.endDate || null;
}

export function leaseStatusAt(lease: LeaseLifecycleInput, now = new Date()): LeaseLifecycleStatus {
  if (lease.cancelledAt) return "ENDED";
  const today = pragueDateKey(now);
  if (today < pragueDateKey(lease.startDate)) return "FUTURE";
  const end = effectiveLeaseEnd(lease);
  if (end && today > pragueDateKey(end)) return "ENDED";
  return "ACTIVE";
}

export function isLeaseCurrentAt(lease: LeaseLifecycleInput, now = new Date()) {
  return leaseStatusAt(lease, now) === "ACTIVE";
}

export function isLeaseFutureAt(lease: LeaseLifecycleInput, now = new Date()) {
  return leaseStatusAt(lease, now) === "FUTURE";
}

export function isLeaseEndedAt(lease: LeaseLifecycleInput, now = new Date()) {
  return leaseStatusAt(lease, now) === "ENDED";
}

function intervalEndKey(lease: LeaseLifecycleInput) {
  if (lease.cancelledAt) return null;
  const end = effectiveLeaseEnd(lease);
  return end ? pragueDateKey(end) : "9999-12-31";
}

export function leaseIntervalsOverlap(a: LeaseLifecycleInput, b: LeaseLifecycleInput) {
  if (a.cancelledAt || b.cancelledAt) return false;
  const aStart = pragueDateKey(a.startDate);
  const bStart = pragueDateKey(b.startDate);
  const aEnd = intervalEndKey(a)!;
  const bEnd = intervalEndKey(b)!;
  return aStart <= bEnd && bStart <= aEnd;
}

export function leaseOverlapsPeriod(lease: LeaseLifecycleInput, periodStart: Date, periodEnd: Date) {
  if (lease.cancelledAt) return false;
  const leaseStart = pragueDateKey(lease.startDate);
  const leaseEnd = intervalEndKey(lease)!;
  return leaseStart <= pragueDateKey(periodEnd) && pragueDateKey(periodStart) <= leaseEnd;
}

export function currentLeaseForUnit<T extends LeaseLifecycleInput>(leases: T[], now = new Date()) {
  return leases.find((lease) => isLeaseCurrentAt(lease, now)) || null;
}

export function futureLeasesForUnit<T extends LeaseLifecycleInput>(leases: T[], now = new Date()) {
  return leases.filter((lease) => isLeaseFutureAt(lease, now)).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

export function pastLeasesForUnit<T extends LeaseLifecycleInput>(leases: T[], now = new Date()) {
  return leases.filter((lease) => isLeaseEndedAt(lease, now)).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
}
