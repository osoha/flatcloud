import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateAssetFinanceKpis } from "../lib/reporting/asset-finance-kpis";
import {
  assertQuarterlyPeriodClosed,
  quarterlyPeriodState,
} from "../lib/reporting/quarterly-report-service";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

const baseFinanceRow = {
  propertyId: "property-a",
  propertyName: "Dům A",
  consolidationBasisPoints: 10_000,
  monthlyNetRentCents: 100_000,
  actualOpexTtmCents: 0,
  outstandingPrincipalCents: 4_000_000,
  annualDebtServiceCents: 300_000,
  marketValueCents: 10_000_000,
  valuationAsOfDate: new Date("2026-08-31T12:00:00Z"),
  fixedRateUntil: new Date("2028-01-01T12:00:00Z"),
  budgetPlannedCents: 0,
  budgetActualCents: 0,
};

check("missing OPEX suppresses dependent asset KPIs but preserves LTV", () => {
  const result = calculateAssetFinanceKpis(
    [{ ...baseFinanceRow, opexComplete: false }],
    new Date("2026-09-06T12:00:00Z"),
  );
  assert.equal(result.noiCents, null);
  assert.equal(result.cashflowCents, null);
  assert.equal(result.yieldBps, null);
  assert.equal(result.roeBps, null);
  assert.equal(result.dscrBps, null);
  assert.equal(result.ltvBps, 4000);
  assert.deepEqual(result.missingOpexProperties, ["Dům A"]);
  assert.ok(result.alerts.some((alert) => alert.id.endsWith("opex-unverified")));
});

check("confirmed zero OPEX remains a valid measured value", () => {
  const result = calculateAssetFinanceKpis(
    [{ ...baseFinanceRow, opexComplete: true }],
    new Date("2026-09-06T12:00:00Z"),
  );
  assert.equal(result.noiCents, 1_200_000);
  assert.equal(result.cashflowCents, 900_000);
  assert.equal(result.opexComplete, true);
});

check("future quarter end exposes the actual data cutoff", () => {
  const state = quarterlyPeriodState(
    new Date("2026-09-29T22:00:00Z"),
    new Date("2026-09-06T12:00:00Z"),
  );
  assert.deepEqual(state, {
    reportDate: "2026-09-30",
    dataThrough: "2026-09-06",
    open: true,
  });
  assert.throws(
    () => assertQuarterlyPeriodClosed(new Date("2026-09-29T22:00:00Z"), new Date("2026-09-06T12:00:00Z")),
    /Report period is still open/,
  );
});

check("closed quarter remains eligible for review and publication", () => {
  assert.doesNotThrow(() =>
    assertQuarterlyPeriodClosed(
      new Date("2026-06-29T22:00:00Z"),
      new Date("2026-09-06T12:00:00Z"),
    ),
  );
});

check("confidence gates exist in loader, UI and both workflow transitions", () => {
  const finance = read("lib/reporting/asset-finance-kpis.ts");
  const assetPage = read("app/reporty/page.tsx");
  const reportPage = read("app/reporty/kvartalni/[groupId]/reporty/[reportId]/page.tsx");
  const review = read("components/quarterly-report-workspace/QuarterlyReportReviewExport.tsx");
  const service = read("lib/reporting/quarterly-report-service.ts");
  assert.match(finance, /opexComplete: costs\.some/);
  assert.match(assetPage, /Nedoloženo/);
  assert.match(reportPage, /Reportovací období ještě není uzavřené/);
  assert.match(review, /periodOpen/);
  assert.equal((service.match(/assertQuarterlyPeriodClosed\(report\.asOfDate\)/g) || []).length, 2);
});

console.log(`R10C verifier passed (${passed} checks).`);
