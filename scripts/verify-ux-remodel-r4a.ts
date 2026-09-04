import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateRentForecast, parseRentForecastHorizon, parseRentForecastScenario, type RentForecastInput } from "../lib/reporting/rent-forecast";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const asOf = new Date("2026-01-15T12:00:00Z");
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

const base: RentForecastInput = {
  leaseId: "lease-a",
  propertyId: "property-a",
  propertyName: "Dům A",
  unitId: "unit-a",
  unitLabel: "1.01",
  currentRentCents: 100_000,
  effectiveEnd: null,
  indexationEnabled: false,
  indexationPercentBps: null,
  nextIndexationAt: null,
  mfMarketRentCents: null,
};

check("scenario and horizon inputs fail closed to understandable defaults", () => {
  assert.equal(parseRentForecastScenario("conservative"), "conservative");
  assert.equal(parseRentForecastScenario("unknown"), "base");
  assert.equal(parseRentForecastHorizon("12"), 12);
  assert.equal(parseRentForecastHorizon("48"), 24);
});

check("contractual curve applies configured fixed indexation at its actual anniversary", () => {
  const result = calculateRentForecast([{ ...base, indexationEnabled: true, indexationPercentBps: 1_000, nextIndexationAt: new Date("2027-01-01") }], asOf, "base", 24);
  assert.equal(result.months[11].contractualCents, 100_000);
  assert.equal(result.months[12].contractualCents, 110_000);
});

check("contractual curve stops after expiry while the planning scenario stays explicit", () => {
  const result = calculateRentForecast([{ ...base, effectiveEnd: new Date("2026-06-30") }], asOf, "base", 12);
  assert.equal(result.months[5].contractualCents, 100_000);
  assert.equal(result.months[6].contractualCents, 0);
  assert.equal(result.months[6].plannedCents, 100_000);
  assert.equal(result.expiringLeaseCount, 1);
});

check("positive MF gap is captured gradually and never forces a rent decrease", () => {
  const upward = calculateRentForecast([{ ...base, mfMarketRentCents: 200_000 }], asOf, "base", 12);
  assert(upward.months[0].plannedCents > 100_000 && upward.months[0].plannedCents < 150_000);
  assert.equal(upward.months[11].plannedCents, 150_000);
  const downward = calculateRentForecast([{ ...base, mfMarketRentCents: 80_000 }], asOf, "base", 12);
  assert.equal(downward.months[11].plannedCents, 100_000);
});

check("expected collection applies visible vacancy and collection assumptions", () => {
  const result = calculateRentForecast([{ ...base, mfMarketRentCents: 200_000 }], asOf, "base", 12);
  assert.equal(result.months[11].expectedCollectedCents, 139_650);
  assert.equal(result.mfCoveredCount, 1);
  assert.equal(result.contractualTotalCents, 1_200_000);
});

check("forecast source uses current scoped lease and MF data without a write route", () => {
  const live = read("lib/reporting/live-service.ts");
  for (const marker of ["indexationEnabled: lease.indexationEnabled", "indexationPercentBps: lease.indexationPercentBps", "nextIndexationAt: lease.nextIndexationAt"]) assert.match(live, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
  const report = read("app/reporty/page.tsx");
  assert.match(report, /mfByUnit\.get\(row\.unitId\)/);
  assert.doesNotMatch(read("lib/reporting/rent-forecast.ts"), /prisma|fetch\(|\.create\(|\.update\(/);
});

check("UI separates contract, plan, expected collection and MF reference", () => {
  const report = read("app/reporty/page.tsx");
  for (const marker of ["Valorizace a forecast nájemného", "nic nemění ve smlouvách ani předpisech", "Smluvní příjem · horizont", "Plánovaný příjem · hrubý", "Očekávané inkaso", "MF rozdíl využitý do konce horizontu", "Model · ne schválený plán"]) assert.match(report, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
  const chart = read("components/ReportChart.tsx");
  for (const marker of ["RentForecastChart", "Smluvní vývoj", "Plán scénáře", "Očekávané inkaso"]) assert.match(chart, new RegExp(marker));
});

check("methodology, browser smoke, pipeline and CI cover R4A", () => {
  assert.match(read("lib/methodology.ts"), /chybějící pokrytí nepovažujte za nulový potenciál/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /valorizace odděluje read-only scénář od smluv a předpisů/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R4A implementováno bez migrace/);
  assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r4a/);
});

console.log(`UX remodel R4A ověřen: ${count} kontrol.`);
