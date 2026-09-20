import assert from "node:assert/strict";
import { collectionComparison } from "../lib/collection-comparison";
function charge(period: string, amount: number, paid: number, booked: string) { return { period, active: true, amountCents: amount, allocations: [{ amountCents: paid, transaction: { bookedAt: new Date(`${booked}T12:00Z`) } }] }; }
assert.equal(collectionComparison([], new Date("2026-09-20T12:00Z")), null);
assert.equal(collectionComparison([charge("2026-09", 10000, 5000, "2026-09-12")], new Date("2026-09-20T12:00Z")), null);
const september = collectionComparison([charge("2026-09", 10000, 6000, "2026-09-12"), charge("2026-08", 10000, 3000, "2026-08-10"), charge("2026-08", 0, 2000, "2026-08-25")], new Date("2026-09-20T12:00Z"))!;
assert.equal(september.deltaPoints, 30); // late August payment excluded from the same-day comparison
assert.equal(september.comparisonDay, 20);
const january = collectionComparison([charge("2026-01", 100, 25, "2026-01-01"), charge("2025-12", 100, 50, "2025-12-01")], new Date("2026-01-10T12:00Z"))!;
assert.equal(january.previousPeriod, "2025-12"); assert.equal(january.deltaPoints, -25);
const march = collectionComparison([charge("2026-03", 100, 25, "2026-03-30"), charge("2026-02", 100, 50, "2026-02-28")], new Date("2026-03-31T12:00Z"))!;
assert.equal(march.comparisonDay, 28); assert.equal(march.current.paid, 0);
console.log("Flatberry collection comparison: missing history, same-day cutoffs, year boundary and February verified.");
