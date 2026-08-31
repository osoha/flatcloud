import assert from "node:assert/strict";
import { calculatePropertySnapshot } from "../lib/reporting/snapshot-calculator";
import { rentRollAmountsAt } from "../lib/reporting/rent-roll";

let count = 0;
function check(name: string, fn: () => void) {
  fn();
  count += 1;
  console.log(`✓ ${count}. ${name}`);
}

const asOf = new Date("2026-06-30T12:00:00Z");
const baseLease = (overrides: Record<string, unknown> = {}) => ({
  id: "lease",
  startDate: new Date("2026-01-01T12:00:00Z"),
  endDate: null,
  terminatedOn: null,
  cancelledAt: null,
  rentCents: 10000,
  servicesCents: 0,
  depositCents: 0,
  paymentItems: [],
  charges: [],
  securityDepositTerms: [],
  securityDepositMovements: [],
  ...overrides,
});
const baseUnit = (leaseOverrides: Record<string, unknown> = {}) => ({
  id: "unit",
  areaM2: 50,
  operationalStatusEvents: [{ status: "STANDARD", effectiveAt: new Date("2020-01-01T12:00:00Z") }],
  leases: [baseLease(leaseOverrides)],
});

check("explicit zero legacy services remains known and monetarily zero", () => {
  const resolved = rentRollAmountsAt(baseLease({ rentCents: 9000, servicesCents: 0 }), asOf);
  assert.equal(resolved.services.amountCents, 0);
  assert.equal(resolved.services.source, "LEGACY");
  assert.equal(resolved.rent.amountCents, 9000);
  assert.equal(resolved.rent.source, "LEGACY");
});

check("explicit zero legacy services does not create legacy fallback warning", () => {
  const snapshot = calculatePropertySnapshot({ propertyId: "p", asOf, units: [baseUnit({ rentCents: 9000, servicesCents: 0 })] });
  assert.ok(!snapshot.quality.issues.some((issue) => issue.code === "RENT_SOURCE_LEGACY_FALLBACK" && issue.message.includes("SERVICES")));
  assert.equal(snapshot.data.rentRoll.monthlyServicesCents, 0);
});

check("non-zero legacy services still creates legacy fallback warning", () => {
  const snapshot = calculatePropertySnapshot({ propertyId: "p", asOf, units: [baseUnit({ rentCents: 9000, servicesCents: 2500 })] });
  assert.ok(snapshot.quality.issues.some((issue) => issue.code === "RENT_SOURCE_LEGACY_FALLBACK" && issue.message.includes("SERVICES")));
});

check("legacy rent still creates legacy fallback warning", () => {
  const snapshot = calculatePropertySnapshot({ propertyId: "p", asOf, units: [baseUnit({ rentCents: 9000, servicesCents: 0, charges: [{ active: true, period: "2026-06", items: [], allocations: [], securityDepositOffsets: [], creditApplications: [] }] })] });
  assert.ok(snapshot.quality.issues.some((issue) => issue.code === "RENT_SOURCE_LEGACY_FALLBACK" && issue.message.includes("RENT")));
});

check("rent-roll monetary calculation remains unchanged for legacy values", () => {
  const resolved = rentRollAmountsAt(baseLease({ rentCents: 17000, servicesCents: 0 }), asOf);
  const snapshot = calculatePropertySnapshot({ propertyId: "p", asOf, units: [baseUnit({ rentCents: 17000, servicesCents: 0 })] });
  assert.equal(resolved.rent.amountCents, 17000);
  assert.equal(resolved.services.amountCents, 0);
  assert.equal(snapshot.data.rentRoll.monthlyNetRentCents, 17000);
  assert.equal(snapshot.data.rentRoll.monthlyServicesCents, 0);
  assert.equal(snapshot.data.rentRoll.monthlyTotalCents, 17000);
});

console.log(`V22-C Part 2B-A3b.1 verification passed (${count} checks).`);
