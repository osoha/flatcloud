export type LeaseAlertKind = "EXPIRY" | "ANNIVERSARY";

export type LeaseAlert = {
  kind: LeaseAlertKind;
  date: Date;
  lease: {
    id: string;
    contractNumber: string | null;
    startDate: Date;
    endDate: Date | null;
    status: string;
    tenant: { id: string; name: string };
    unit: { id: string; label: string; propertyId: string };
  };
  property: { id: string; name: string };
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dayInYear(year: number, month: number, day: number) {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

export function addCalendarMonths(date: Date, months: number) {
  const source = startOfDay(date);
  const targetMonth = source.getMonth() + months;
  const year = source.getFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  return dayInYear(year, month, source.getDate());
}

export function nextLeaseAnniversary(startDate: Date, now = new Date()) {
  const today = startOfDay(now);
  let anniversary = dayInYear(today.getFullYear(), startDate.getMonth(), startDate.getDate());
  if (anniversary < today) anniversary = dayInYear(today.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
  return anniversary;
}

export function leaseAlertsForProperties(properties: Array<{
  id: string;
  name: string;
  units: Array<{
    id: string;
    label: string;
    propertyId: string;
    leases: Array<{
      id: string;
      contractNumber: string | null;
      startDate: Date;
      endDate: Date | null;
      status: string;
      tenant: { id: string; name: string };
    }>;
  }>;
}>, now = new Date(), months = 3): LeaseAlert[] {
  const today = startOfDay(now);
  const horizon = addCalendarMonths(today, months);
  const alerts: LeaseAlert[] = [];
  for (const property of properties) for (const unit of property.units) for (const lease of unit.leases) {
    if (lease.status !== "ACTIVE") continue;
    const base = { lease: { ...lease, unit: { id: unit.id, label: unit.label, propertyId: unit.propertyId } }, property: { id: property.id, name: property.name } };
    if (lease.endDate) {
      const end = startOfDay(lease.endDate);
      if (end >= today && end <= horizon) alerts.push({ kind: "EXPIRY", date: end, ...base });
    }
    const anniversary = nextLeaseAnniversary(lease.startDate, today);
    const leaseEnd = lease.endDate ? startOfDay(lease.endDate) : null;
    if (anniversary >= today && anniversary <= horizon && (!leaseEnd || anniversary <= leaseEnd)) {
      alerts.push({ kind: "ANNIVERSARY", date: anniversary, ...base });
    }
  }
  return alerts.sort((a, b) => a.date.getTime() - b.date.getTime() || a.kind.localeCompare(b.kind));
}
