export const BUSINESS_TIME_ZONE = "Europe/Prague";
export type BusinessDateKey = `${number}-${number}-${number}`;

const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function businessDateKey(date: Date): BusinessDateKey {
  return dateFormatter.format(date) as BusinessDateKey;
}
export function businessTodayKey(now = new Date()) { return businessDateKey(now); }
export function businessMonthKey(date: Date) { return businessDateKey(date).slice(0, 7); }
export function businessQuarter(date: Date) {
  const [year, month] = businessDateKey(date).split("-").map(Number);
  return { year, quarter: Math.floor((month - 1) / 3) + 1 };
}
function assertQuarter(quarter: number) { if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new Error("Quarter must be 1-4."); }
export function quarterStartKey(year: number, quarter: number): BusinessDateKey { assertQuarter(quarter); return `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01` as BusinessDateKey; }
export function quarterEndKey(year: number, quarter: number): BusinessDateKey {
  assertQuarter(quarter); const nextMonth = quarter * 3; const end = new Date(Date.UTC(year, nextMonth, 0, 12)); return end.toISOString().slice(0, 10) as BusinessDateKey;
}
export function compareBusinessDates(a: Date | string, b: Date | string) { const ak = typeof a === "string" ? a : businessDateKey(a); const bk = typeof b === "string" ? b : businessDateKey(b); return ak < bk ? -1 : ak > bk ? 1 : 0; }
export function isBusinessDateOnOrBefore(a: Date | string, b: Date | string) { return compareBusinessDates(a, b) <= 0; }
export function businessDateRange(start: BusinessDateKey, end: BusinessDateKey) {
  if (start > end) return []; const result: BusinessDateKey[] = []; const cursor = new Date(`${start}T12:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= end) { result.push(cursor.toISOString().slice(0, 10) as BusinessDateKey); cursor.setUTCDate(cursor.getUTCDate() + 1); } return result;
}
const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23" });
function nextDateKey(key:BusinessDateKey){const d=new Date(`${key}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10) as BusinessDateKey}
/** Prague local midnight for a date key. Two passes resolve the applicable CET/CEST offset deterministically. */
export function businessDateKeyToInstant(key: BusinessDateKey) { if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error("Invalid business date key.");const desired=Date.parse(`${key}T00:00:00Z`);let candidate=desired;for(let pass=0;pass<2;pass++){const p=Object.fromEntries(dateTimeFormatter.formatToParts(new Date(candidate)).map(x=>[x.type,x.value]));const represented=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));candidate=desired-(represented-candidate)}return new Date(candidate); }
export function businessDateEndInstant(key:BusinessDateKey){return new Date(businessDateKeyToInstant(nextDateKey(key)).getTime()-1)}
