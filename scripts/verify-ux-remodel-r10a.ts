import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { annualPackagePeriod, normalizeAnnualPackageYear } from "../lib/reporting/annual-owner-package";
import { confirmedLoanState } from "../lib/asset-finance";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) { run(); passed += 1; console.log(`✓ ${name}`); }

const september = new Date("2026-09-06T12:00:00Z");
check("annual package defaults to the previous closed business year", () => assert.equal(normalizeAnnualPackageYear(undefined, september), 2025));
check("current annual period is explicitly YTD and cut off today", () => assert.deepEqual(annualPackagePeriod(2026, september), { from: new Date("2025-12-31T23:00:00.000Z"), to: new Date("2026-09-06T21:59:59.999Z"), toKey: "2026-09-06", closed: false, mode: "YTD" }));
check("past annual period is closed at year end", () => { const period=annualPackagePeriod(2025,september); assert.equal(period.mode,"CLOSED"); assert.equal(period.toKey,"2025-12-31"); });
check("future loan snapshots never replace current finance state", () => {
  const loan=confirmedLoanState({ outstandingPrincipalCents:9_100_000,annualInterestRateBps:500,monthlyDebtServiceCents:50_000,snapshots:[
    {asOfDate:new Date("2026-10-05T12:00:00Z"),outstandingPrincipalCents:8_900_000,annualInterestRateBps:450,monthlyDebtServiceCents:49_000},
    {asOfDate:new Date("2026-08-05T12:00:00Z"),outstandingPrincipalCents:9_000_000,annualInterestRateBps:480,monthlyDebtServiceCents:50_000},
  ]},september);
  assert.equal(loan.outstandingPrincipalCents,9_000_000);assert.equal(loan.annualInterestRateBps,480);assert.equal(loan.confirmedAsOfDate?.toISOString().slice(0,10),"2026-08-05");
});
check("collections period picker controls KPI and property table", () => { const page=read("app/reporty/page.tsx"),service=read("lib/reporting/live-service.ts"); assert.match(page,/data\.collectionRange\.expectedCents/);assert.match(page,/collectionRangeByProperty/);assert.match(service,/periods\.includes\(row\.charge\.period\)/);assert.match(page,/Filtr řídí graf, KPI i tabulku/); });
check("open annual export is visibly non-final", () => { const page=read("app/reporty/rocni-podklady/page.tsx"),route=read("app/api/reports/annual-owner-package.csv/route.ts"),service=read("lib/reporting/annual-owner-package.ts"); assert.match(service,/OPEN_ANNUAL_PERIOD/);assert.match(page,/Průběžné YTD podklady/);assert.match(route,/PRŮBĚŽNÉ YTD PODKLADY/);assert.match(route,/ytd-do-/); });

console.log(`R10A verifier passed (${passed} checks).`);
