import { businessDateKey, businessDateKeyToInstant, type BusinessDateKey } from "@/lib/calendar";
import { paidCentsAsOf } from "@/lib/reporting/finance";

type Charge = Parameters<typeof paidCentsAsOf>[0] & { period: string; active: boolean; amountCents: number };

/** Compare the same elapsed days, including February/year boundaries. Missing data is not zero. */
export function collectionComparison(charges: Charge[], asOf = new Date()) {
  const [year, month, day] = businessDateKey(asOf).split("-").map(Number);
  const previousMonth = new Date(Date.UTC(year, month - 2, 1, 12));
  const previousPeriod = previousMonth.toISOString().slice(0, 7);
  const previousMonthDays = new Date(Date.UTC(year, month - 1, 0, 12)).getUTCDate();
  const comparisonDay = Math.min(day, previousMonthDays);
  // The current month must use the same number of days if the previous month was shorter.
  const currentPeriod = `${year}-${String(month).padStart(2, "0")}`;
  const currentCutoff = businessDateKeyToInstant(`${currentPeriod}-${String(comparisonDay).padStart(2, "0")}` as BusinessDateKey);
  const previousCutoff = businessDateKeyToInstant(`${previousPeriod}-${String(comparisonDay).padStart(2, "0")}` as BusinessDateKey);
  function periodTotal(period: string, cutoff: Date) {
    const rows = charges.filter(charge => charge.active && charge.period === period);
    const expected = rows.reduce((sum, charge) => sum + charge.amountCents, 0);
    const paid = rows.reduce((sum, charge) => sum + paidCentsAsOf(charge, cutoff), 0);
    return { expected, paid, rate: expected > 0 ? paid / expected * 100 : null };
  }
  const current = periodTotal(currentPeriod, currentCutoff), previous = periodTotal(previousPeriod, previousCutoff);
  if (current.rate === null || previous.rate === null) return null;
  return { deltaPoints: current.rate - previous.rate, current, previous, currentPeriod, previousPeriod, comparisonDay };
}
