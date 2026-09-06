import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CapexForecastInput } from "../lib/portfolio/capex-renewal-forecast";
import { buildCapexRenewalForecast, capexForecastStage } from "../lib/portfolio/capex-renewal-forecast";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
function check(name: string, run: () => void) {
  run();
  checks += 1;
  console.log(`✓ ${checks}. ${name}`);
}

const baseYear = 2026;
const item = (overrides: Partial<CapexForecastInput>): CapexForecastInput => ({
  id: "base",
  propertyId: "property",
  propertyName: "Testovací dům",
  unitId: "unit",
  unitLabel: "1A",
  planStatus: "PLANNED",
  plannedAmountCents: 100_000_00,
  targetDate: new Date("2026-06-30T00:00:00.000Z"),
  events: [],
  ...overrides,
});

check("stage follows immutable execution events before plan status", () => {
  assert.equal(capexForecastStage(item({ planStatus: "PLANNED" })), "INTENT");
  assert.equal(capexForecastStage(item({ planStatus: "APPROVED" })), "APPROVED");
  assert.equal(capexForecastStage(item({ planStatus: "APPROVED", events: [{ kind: "STARTED", actualAmountCents: null, effectiveAt: new Date("2026-01-01T00:00:00.000Z") }] })), "IN_PROGRESS");
  assert.equal(capexForecastStage(item({ planStatus: "IN_PROGRESS", events: [{ kind: "COMPLETED", actualAmountCents: 120_000_00, effectiveAt: new Date("2026-03-01T00:00:00.000Z") }] })), "COMPLETED");
});

const forecast = buildCapexRenewalForecast([
  item({ id: "overdue", targetDate: new Date("2025-12-31T00:00:00.000Z"), plannedAmountCents: 40_000_00 }),
  item({ id: "current", planStatus: "APPROVED", plannedAmountCents: 200_000_00 }),
  item({ id: "progress", targetDate: new Date("2028-05-01T00:00:00.000Z"), plannedAmountCents: 300_000_00, events: [{ kind: "STARTED", actualAmountCents: null, effectiveAt: new Date("2026-04-01T00:00:00.000Z") }] }),
  item({ id: "later", targetDate: new Date("2032-01-01T00:00:00.000Z"), plannedAmountCents: 500_000_00 }),
  item({ id: "unscheduled", targetDate: null, plannedAmountCents: 60_000_00 }),
  item({ id: "completed", planStatus: "COMPLETED", plannedAmountCents: 90_000_00, events: [{ kind: "COMPLETED", actualAmountCents: 105_000_00, effectiveAt: new Date("2026-02-01T00:00:00.000Z") }] }),
], baseYear);

check("forecast separates overdue, five-year, later and unscheduled plans", () => {
  assert.deepEqual(forecast.horizonYears, [2026, 2027, 2028, 2029, 2030]);
  assert.equal(forecast.buckets.length, 8);
  assert.equal(forecast.overdueCents, 40_000_00);
  assert.equal(forecast.scheduledFiveYearCents, 500_000_00);
  assert.equal(forecast.unscheduledCents, 60_000_00);
  assert.equal(forecast.buckets.find((bucket) => bucket.key === "LATER")?.plannedAmountCents, 500_000_00);
  assert.equal(forecast.inProgressCents, 300_000_00);
});

check("completed work contributes only to current-year actual and variance", () => {
  assert.equal(forecast.active.some((entry) => entry.id === "completed"), false);
  assert.equal(forecast.actualThisYearCents, 105_000_00);
  assert.equal(forecast.actualVarianceThisYearCents, 15_000_00);
});

check("page is portfolio-scoped and independent from Distribution", () => {
  const page = read("app/portfolio/kvalita/plan/page.tsx");
  for (const marker of ["accessibleProperties", "PortfolioScopePicker", "Časová mapa obnovy", "Aktivní plán obnovy", "bez vazby na interní Distribuci"]) assert.match(page, new RegExp(marker));
  assert.doesNotMatch(page, /distributionAssessment|distributionValuation|ProspectOpportunity/);
  const subnav = read("components/portfolio/PortfolioQualitySubnav.tsx");
  assert.match(subnav, /portfolio\/kvalita\/plan/);
  assert.match(subnav, /query/);
});

check("methodology, pipeline, visual backlog, browser smoke and CI cover R8D", () => {
  assert.match(read("lib/methodology.ts"), /Výhled je provozní plán, nikoli účetní či daňový podklad/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R8D implementováno bez migrace/);
  assert.match(read("docs/visual-polish-backlog.md"), /VP-01 — Filtry Dokumentů/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /CAPEX výhled vede z fronty/);
  assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r8d/);
});

console.log(`UX remodel R8D ověřen: ${checks} kontrol.`);
