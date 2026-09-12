import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateAssetFinanceKpis, type AssetFinanceInputRow } from "../lib/reporting/asset-finance-kpis";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const asOf = new Date("2026-09-04T12:00:00Z");
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

const base: AssetFinanceInputRow = {
  propertyId: "a",
  propertyName: "Dům A",
  consolidationBasisPoints: 10_000,
  monthlyNetRentCents: 100_000,
  actualOpexTtmCents: 200_000,
  outstandingPrincipalCents: 5_000_000,
  annualDebtServiceCents: 500_000,
  marketValueCents: 10_000_000,
  valuationAsOfDate: new Date("2026-08-31"),
  approvedBudgetCents: 1_000_000,
  actualAndCommittedYtdCents: 100_000,
  loanFixations: [],
};
const ids = (row: AssetFinanceInputRow) => calculateAssetFinanceKpis([row], asOf).alerts.map((alert) => alert.id);

check("critical and warning LTV thresholds are strict and visible", () => {
  assert(ids({ ...base, outstandingPrincipalCents: 7_100_000 }).includes("a:ltv-critical"));
  assert(ids({ ...base, outstandingPrincipalCents: 6_100_000 }).includes("a:ltv-warning"));
  assert(!ids({ ...base, outstandingPrincipalCents: 6_000_000 }).some((id) => id.includes("ltv-")));
});

check("critical and warning DSCR thresholds distinguish coverage risk", () => {
  assert(ids({ ...base, annualDebtServiceCents: 1_100_000 }).includes("a:dscr-critical"));
  assert(ids({ ...base, annualDebtServiceCents: 900_000 }).includes("a:dscr-warning"));
  assert(!ids({ ...base, annualDebtServiceCents: 800_000 }).some((id) => id.includes("dscr-")));
});

check("missing and stale financial inputs fail into actionable warnings", () => {
  const result = ids({ ...base, marketValueCents: null, valuationAsOfDate: null, annualDebtServiceCents: null });
  assert(result.includes("a:valuation-missing"));
  assert(result.includes("a:debt-service-missing"));
  assert(ids({ ...base, valuationAsOfDate: new Date("2025-09-03") }).includes("a:valuation-stale"));
  assert(!ids({ ...base, valuationAsOfDate: new Date("2025-09-04") }).includes("a:valuation-stale"));
});

check("annual budget alerts distinguish missing, near and exceeded limits", () => {
  assert(ids({ ...base, approvedBudgetCents: null }).includes("a:budget-missing"));
  assert(ids({ ...base, actualAndCommittedYtdCents: 900_000 }).includes("a:budget-near"));
  assert(ids({ ...base, actualAndCommittedYtdCents: 1_000_001 }).includes("a:budget-exceeded"));
  assert(!ids({ ...base, actualAndCommittedYtdCents: 899_999 }).some((id) => id.includes("budget-")));
});

check("fixed-rate loans flag missing, overdue and upcoming fixation only", () => {
  const loan = { loanId: "l", label: "Úvěr", rateType: "FIXED" as const, fixedUntil: null };
  assert(ids({ ...base, loanFixations: [loan] }).includes("a:fixation-missing:l"));
  assert(ids({ ...base, loanFixations: [{ ...loan, fixedUntil: new Date("2026-09-03") }] }).includes("a:fixation-overdue:l"));
  assert(ids({ ...base, loanFixations: [{ ...loan, fixedUntil: new Date("2027-09-04") }] }).includes("a:fixation-upcoming:l"));
  assert(!ids({ ...base, loanFixations: [{ ...loan, rateType: "FLOATING" }] }).some((id) => id.includes("fixation-")));
});

check("critical alerts are ordered before warnings across properties", () => {
  const result = calculateAssetFinanceKpis([
    { ...base, propertyId: "warn", propertyName: "A", outstandingPrincipalCents: 6_500_000 },
    { ...base, propertyId: "bad", propertyName: "Z", outstandingPrincipalCents: 8_000_000 },
  ], asOf);
  assert.equal(result.alerts[0].tone, "bad");
  assert.equal(result.criticalAlertCount, 1);
});

check("asset loader reads budgets, YTD costs and active loan fixations", () => {
  const service = read("lib/reporting/asset-finance-kpis.ts");
  for (const marker of ["propertyBudgetLine.findMany", "status: { in: [\"ACTUAL\", \"COMMITTED\"] }", "fixedUntil: true", "rateType: true", "calculateAssetFinanceAlerts"]) assert.match(service, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
});

check("asset cockpit presents severity, thresholds and direct remediation links", () => {
  const report = read("app/reporty/page.tsx");
  for (const marker of ["Finanční alarmy", "před konsolidací", "LTV varování nad 60 %", "DSCR varování pod 1,20×", "fixace do 12 měsíců", "alert.href", "Bez finančních alarmů"]) assert.match(report, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
});

check("methodology, browser smoke, pipeline and CI cover R3F", () => {
  assert.match(read("lib/methodology.ts"), /Ve finančních alarmech řešte nejprve kritické překročení LTV 70 %/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /DSCR kleslo pod 1,00×/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R3F implementováno bez migrace/);
  assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r3f/);
});

console.log(`UX remodel R3F ověřen: ${count} kontrol.`);
