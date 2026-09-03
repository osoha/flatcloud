import { businessDateKey } from "../calendar";

export type LiveReportRangeMode = "rolling12" | "ytd" | "custom";
export type LiveReportPeriodRange = {
  mode: LiveReportRangeMode;
  from: string;
  to: string;
  currentMonth: string;
  periods: string[];
  label: string;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_CUSTOM_MONTHS = 60;

function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1, 12)).toISOString().slice(0, 7);
}

function enumerateMonths(from: string, to: string) {
  const periods: string[] = [];
  let cursor = from;
  while (cursor <= to && periods.length < MAX_CUSTOM_MONTHS) {
    periods.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return periods;
}

export function parseLiveReportPeriodRange(
  query: { range?: string; from?: string; to?: string },
  asOf = new Date(),
): LiveReportPeriodRange {
  const currentMonth = businessDateKey(asOf).slice(0, 7);
  if (query.range === "ytd") {
    const from = `${currentMonth.slice(0, 4)}-01`;
    return { mode: "ytd", from, to: currentMonth, currentMonth, periods: enumerateMonths(from, currentMonth), label: "Od začátku roku" };
  }
  if (query.range === "custom" && query.from && query.to && MONTH_PATTERN.test(query.from) && MONTH_PATTERN.test(query.to) && query.from <= query.to && query.to <= currentMonth) {
    const all = enumerateMonths(query.from, query.to);
    if (all.length && all.at(-1) === query.to) {
      return { mode: "custom", from: query.from, to: query.to, currentMonth, periods: all, label: `${query.from} – ${query.to}` };
    }
  }
  const from = shiftMonth(currentMonth, -11);
  return { mode: "rolling12", from, to: currentMonth, currentMonth, periods: enumerateMonths(from, currentMonth), label: "Posledních 12 měsíců" };
}

export function monthEndAsOf(period: string, currentAsOf: Date) {
  const currentMonth = businessDateKey(currentAsOf).slice(0, 7);
  if (period === currentMonth) return currentAsOf;
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0, 12));
}
