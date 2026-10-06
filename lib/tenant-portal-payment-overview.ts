import type {PortalPaymentTone} from "./tenant-portal-payment-state";

type OverviewRow = {id: string; periodKey: string; tone: PortalPaymentTone};
const monthly = (period: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period);

/** Presentation only: preserve the server's balances and payment classifications. */
export function tenantPortalPaymentOverview<T extends OverviewRow>(rows: T[], currentPeriod: string) {
  const descending = (a: T, b: T) => b.periodKey.localeCompare(a.periodKey) || a.id.localeCompare(b.id);
  const overdue = rows.filter(row => row.tone === "overdue").sort((a, b) => -descending(a, b));
  const history = rows.filter(row => row.tone !== "overdue").sort(descending);
  const nextPeriod = history.filter(row => monthly(row.periodKey) && row.periodKey > currentPeriod)
    .map(row => row.periodKey).sort()[0];
  const recentPaidPeriods = [...new Set(history.filter(row => monthly(row.periodKey) && row.periodKey < currentPeriod && row.tone === "paid")
    .map(row => row.periodKey))].slice(0, 3);
  const compact = [
    ...history.filter(row => row.periodKey === nextPeriod),
    ...history.filter(row => row.periodKey === currentPeriod),
    ...history.filter(row => row.tone === "paid" && recentPaidPeriods.includes(row.periodKey)),
  ];
  return {overdue, history, compact};
}
