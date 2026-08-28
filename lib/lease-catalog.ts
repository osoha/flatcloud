import { effectiveLeaseEnd, leaseStatusAt, pragueDateKey } from "./lease-lifecycle-core";

export type LeaseCatalogView = "ACTIVE" | "FUTURE" | "EXPIRING" | "HISTORY" | "ALL";
export type LeaseLifecycleRow = {
  startDate: Date; endDate?: Date | null; terminatedOn?: Date | null; cancelledAt?: Date | null;
};
export type LeaseCatalogRow = LeaseLifecycleRow & {
  contractNumber?: string | null; variableSymbol?: string | null;
  tenant: { name: string; email?: string | null };
  unit: { label: string; property: { name: string; address?: string; city?: string } };
};

export function addPragueCalendarMonths(now: Date, months: number) {
  const [year, month, day] = pragueDateKey(now).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function isLeaseExpiring(lease: LeaseLifecycleRow, now = new Date()) {
  if (leaseStatusAt(lease, now) !== "ACTIVE") return false;
  const end = effectiveLeaseEnd(lease);
  if (!end) return false;
  const today = pragueDateKey(now);
  const endKey = pragueDateKey(end);
  return endKey >= today && endKey <= addPragueCalendarMonths(now, 3);
}

export function leaseMatchesQuery(lease: LeaseCatalogRow, query: string) {
  const needle = query.trim().toLocaleLowerCase("cs-CZ");
  if (!needle) return true;
  return [lease.contractNumber, lease.variableSymbol, lease.tenant.name, lease.tenant.email, lease.unit.property.name, lease.unit.property.address, lease.unit.property.city, lease.unit.label]
    .some((value) => (value || "").toLocaleLowerCase("cs-CZ").includes(needle));
}

export function leaseMatchesView(lease: LeaseLifecycleRow, view: LeaseCatalogView, now = new Date()) {
  if (view === "ALL") return true;
  if (view === "EXPIRING") return isLeaseExpiring(lease, now);
  const status = leaseStatusAt(lease, now);
  return view === "HISTORY" ? status === "ENDED" : status === view;
}
