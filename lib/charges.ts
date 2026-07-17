const PRAGUE_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type AllocationLike = { amountCents: number };
type ChargeLike = {
  active: boolean;
  amountCents: number;
  dueDate: Date;
  allocations: AllocationLike[];
};

export function paidCents(charge: Pick<ChargeLike, "allocations">) {
  return charge.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
}

export function outstandingCents(charge: Pick<ChargeLike, "amountCents" | "allocations">) {
  return Math.max(0, charge.amountCents - paidCents(charge));
}

export function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function todayKey(now = new Date()) {
  return PRAGUE_DATE.format(now);
}

export function isPastDue(dueDate: Date, now = new Date()) {
  return dateKey(dueDate) < todayKey(now);
}

export function overdueDebtCents(charge: ChargeLike, now = new Date()) {
  if (!charge.active || !isPastDue(charge.dueDate, now)) return 0;
  return outstandingCents(charge);
}

export type ChargeDisplayState = "disabled" | "paid" | "overdue" | "partial" | "scheduled";

export function chargeDisplayState(charge: ChargeLike, now = new Date()): ChargeDisplayState {
  if (!charge.active) return "disabled";
  const paid = paidCents(charge);
  if (paid >= charge.amountCents) return "paid";
  if (isPastDue(charge.dueDate, now)) return "overdue";
  if (paid > 0) return "partial";
  return "scheduled";
}

export function chargeStateLabel(state: ChargeDisplayState) {
  return {
    disabled: "Vypnuto",
    paid: "Uhrazeno",
    overdue: "Po splatnosti",
    partial: "Částečně uhrazeno",
    scheduled: "Předepsáno",
  }[state];
}
