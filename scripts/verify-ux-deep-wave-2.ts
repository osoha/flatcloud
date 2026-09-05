import assert from "node:assert/strict";
import { ChargeCategory } from "@prisma/client";
import { futureLeaseFinancialChangeDates } from "../lib/lease-financial-versions";
import {
  rentForecastSnapshotFingerprint,
  type RentForecastPlanSnapshot,
} from "../lib/reporting/rent-forecast-plans";

const date = (value: string) => new Date(`${value}T12:00:00Z`);
const paymentItem = (
  id: string,
  category: ChargeCategory,
  validFrom: string,
  validTo: string | null,
) => ({
  id,
  category,
  amountCents: 10_000,
  validFrom: date(validFrom),
  validTo: validTo ? date(validTo) : null,
  active: true,
});

const changes = futureLeaseFinancialChangeDates(
  {
    paymentItems: [
      paymentItem(
        "rent-current",
        ChargeCategory.RENT,
        "2026-09-01",
        "2026-09-30",
      ),
      paymentItem("rent-future", ChargeCategory.RENT, "2026-10-01", null),
      paymentItem(
        "services-current",
        ChargeCategory.SERVICES,
        "2026-09-01",
        "2026-09-30",
      ),
      paymentItem(
        "services-future",
        ChargeCategory.SERVICES,
        "2026-10-01",
        null,
      ),
    ],
    rentChangeProposals: [
      { effectiveFrom: date("2026-10-01"), status: "CONFIRMED" },
    ],
  },
  date("2026-09-05"),
);
assert.deepEqual(
  changes,
  ["2026-10-01"],
  "rent, services and proposal share one business boundary",
);

assert.deepEqual(
  futureLeaseFinancialChangeDates(
    {
      paymentItems: [
        paymentItem(
          "zero-services",
          ChargeCategory.SERVICES,
          "2026-09-01",
          "2026-09-30",
        ),
      ],
    },
    date("2026-09-05"),
  ),
  ["2026-10-01"],
  "a scheduled change to zero remains detectable from the previous version end",
);
assert.deepEqual(
  futureLeaseFinancialChangeDates(
    {
      paymentItems: [
        paymentItem("same-day", ChargeCategory.RENT, "2026-10-01", null),
      ],
    },
    date("2026-10-01"),
  ),
  [],
  "a change effective on the final day is not post-end",
);

const snapshot: RentForecastPlanSnapshot = {
  schemaVersion: 1,
  scope: [
    { propertyId: "p2", propertyName: "B" },
    { propertyId: "p1", propertyName: "A" },
  ],
  mfReferencePeriod: "Q3 2026",
  rows: [
    {
      leaseId: "l2",
      propertyId: "p2",
      propertyName: "B",
      unitId: "u2",
      unitLabel: "2",
      currentRentCents: 20_000,
      effectiveEnd: null,
      indexationEnabled: false,
      indexationPercentBps: null,
      nextIndexationAt: null,
      mfMarketRentCents: null,
    },
    {
      leaseId: "l1",
      propertyId: "p1",
      propertyName: "A",
      unitId: "u1",
      unitLabel: "1",
      currentRentCents: 10_000,
      effectiveEnd: null,
      indexationEnabled: false,
      indexationPercentBps: null,
      nextIndexationAt: null,
      mfMarketRentCents: null,
    },
  ],
};
const reversed = {
  ...snapshot,
  scope: [...snapshot.scope].reverse(),
  rows: [...snapshot.rows].reverse(),
};
const asOf = date("2026-09-05");
assert.equal(
  rentForecastSnapshotFingerprint(snapshot, asOf),
  rentForecastSnapshotFingerprint(reversed, asOf),
);
assert.notEqual(
  rentForecastSnapshotFingerprint(snapshot, asOf),
  rentForecastSnapshotFingerprint(
    {
      ...snapshot,
      rows: snapshot.rows.map((row) =>
        row.leaseId === "l1"
          ? { ...row, currentRentCents: row.currentRentCents + 1 }
          : row,
      ),
    },
    asOf,
  ),
);

console.log(
  "Deep wave 2 financial-boundary and forecast concurrency checks passed.",
);
