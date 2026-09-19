import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  computeMfRentBenchmark,
  dispositionToMfRentCategory,
  selectMfTerritoryFromPropertyData,
} from "../lib/reporting/mf-rent/live-benchmark";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
let count = 0;
function check(name: string, fn: () => void) {
  fn();
  console.log(`✓ ${++count}. ${name}`);
}

check("all supported dispositions map only to official VK groups", () => {
  const rows = [
    ["STUDIO", "vk1"],
    ["ONE_PLUS_KK", "vk1"],
    ["ONE_PLUS_ONE", "vk1"],
    ["TWO_PLUS_KK", "vk2"],
    ["TWO_PLUS_ONE", "vk2"],
    ["THREE_PLUS_KK", "vk3"],
    ["THREE_PLUS_ONE", "vk3"],
    ["FOUR_PLUS_KK", "vk4"],
    ["FOUR_PLUS_ONE", "vk4"],
    ["FIVE_PLUS_KK", "vk4"],
    ["FIVE_PLUS_ONE", "vk4"],
  ] as const;
  for (const [disposition, expected] of rows)
    assert.equal(dispositionToMfRentCategory(disposition), expected);
  assert.equal(dispositionToMfRentCategory("OTHER"), null);
});

const release = {
  id: "release",
  marketYear: 2026,
  marketQuarter: 2,
  publishedOn: new Date("2026-08-15T00:00:00Z"),
  sourceUrl: "https://mf.gov.cz/source.xlsx",
};
const mapped = {
  locationSource: "MANUAL" as const,
  mapping: {
    territoryCode: "620106/cernice",
    territoryName: "Černice",
    municipalityName: "Plzeň",
  },
  release,
  categories: {
    vk1: { referenceRentCentsPerM2: 30000 },
    vk2: { referenceRentCentsPerM2: 28000 },
    vk3: { referenceRentCentsPerM2: 26000 },
    vk4: { referenceRentCentsPerM2: 24000 },
  },
};

check("benchmark preserves signed rent gap and area-weighted portfolio values", () => {
  const result = computeMfRentBenchmark({
    ...mapped,
    units: [
      { id: "u1", label: "1", type: "APARTMENT", disposition: "ONE_PLUS_KK", areaM2: 30, operationalStatus: "STANDARD", actualMonthlyNetRentCents: 800000 },
      { id: "u2", label: "2", type: "APARTMENT", disposition: "TWO_PLUS_KK", areaM2: 50, operationalStatus: "STANDARD", actualMonthlyNetRentCents: 1500000 },
    ],
  });
  assert.equal(result.coveredUnits, 2);
  assert.equal(result.coveredAreaM2, 80);
  assert.equal(result.actualMonthlyNetRentCents, 2300000);
  assert.equal(result.mfMonthlyReferenceRentCents, 2300000);
  assert.equal(result.monthlyPotentialCents, 0);
  assert.equal(result.weightedActualRentPerM2Cents, 28750);
  assert.equal(result.weightedMfReferenceRentPerM2Cents, 28750);
});

check("vacant apartments contribute zero actual rent and full MF letting potential", () => {
  const result = computeMfRentBenchmark({
    ...mapped,
    units: [
      { id: "u1", label: "1", type: "APARTMENT", disposition: "ONE_PLUS_KK", areaM2: 40, operationalStatus: "STANDARD", actualMonthlyNetRentCents: 0 },
    ],
  });
  assert.equal(result.actualMonthlyNetRentCents, 0);
  assert.equal(result.mfMonthlyReferenceRentCents, 1200000);
  assert.equal(result.monthlyPotentialCents, 1200000);
});

check("properties remain visible when no unit is currently benchmark eligible", () => {
  const result = computeMfRentBenchmark({
    ...mapped,
    units: [
      { id: "u1", label: "1", type: "COMMERCIAL", disposition: null, areaM2: 40, operationalStatus: "STANDARD", actualMonthlyNetRentCents: 0 },
    ],
  });
  assert.equal(result.coveredUnits, 0);
  assert.equal(result.coveredAreaM2, 0);
  assert.equal(result.actualMonthlyNetRentCents, null);
  assert.equal(result.mfMonthlyReferenceRentCents, null);
});

check("coverage fails closed for missing area, disposition, territory or non-apartment", () => {
  const result = computeMfRentBenchmark({
    ...mapped,
    units: [
      { id: "a", label: "A", type: "APARTMENT", disposition: null, areaM2: 30, operationalStatus: "STANDARD", actualMonthlyNetRentCents: 0 },
      { id: "b", label: "B", type: "APARTMENT", disposition: "ONE_PLUS_KK", areaM2: null, operationalStatus: "STANDARD", actualMonthlyNetRentCents: 0 },
      { id: "c", label: "C", type: "COMMERCIAL", disposition: "ONE_PLUS_KK", areaM2: 30, operationalStatus: "STANDARD", actualMonthlyNetRentCents: 0 },
      { id: "d", label: "D", type: "APARTMENT", disposition: "ONE_PLUS_KK", areaM2: 30, operationalStatus: "RENOVATION", actualMonthlyNetRentCents: 0 },
    ],
  });
  assert.equal(result.coveredUnits, 0);
  assert.equal(result.uncoveredUnits, 4);
});

check("property cadastral data resolves exact unique territory including accents", () => {
  const selected = selectMfTerritoryFromPropertyData({
    cadastralArea: "Černice",
    city: "Plzeň",
    candidates: [
      { territoryCode: "620106/cernice", territoryName: "Černice", municipalityName: "Plzeň" },
      { territoryCode: "999999/cernice", territoryName: "Černice", municipalityName: "Jiná obec" },
    ],
  });
  assert.equal(selected?.territoryCode, "620106/cernice");
});

check("property cadastral descriptor accepts the stable six-digit MF code", () => {
  const selected = selectMfTerritoryFromPropertyData({
    cadastralArea: "620106",
    city: "Plzeň",
    candidates: [
      { territoryCode: "620106/cernice", territoryName: "Černice", municipalityName: "Plzeň" },
      { territoryCode: "999999/cernice", territoryName: "Černice", municipalityName: "Jiná obec" },
    ],
  });
  assert.equal(selected?.territoryCode, "620106/cernice");
});

check("duplicate territory names require a unique municipality match", () => {
  const candidates = [
    { territoryCode: "1", territoryName: "Nová Ves", municipalityName: "Obec A" },
    { territoryCode: "2", territoryName: "Nová Ves", municipalityName: "Obec B" },
  ];
  assert.equal(selectMfTerritoryFromPropertyData({ cadastralArea: "Nová Ves", city: "Obec B", candidates })?.territoryCode, "2");
  assert.equal(selectMfTerritoryFromPropertyData({ cadastralArea: "Nová Ves", city: "Jiná obec", candidates }), null);
});

check("schema and migration are additive", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260902210000_mf_live_benchmark/migration.sql");
  assert.match(schema, /enum UnitDisposition/);
  assert.match(schema, /disposition\s+UnitDisposition\?/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
});

check("live report is read-only and shows period, coverage and source provenance", () => {
  const page = read("app/reporty/page.tsx");
  const service = read("lib/reporting/mf-rent/service.ts");
  const liveService = read("lib/reporting/live-service.ts");
  const propertyReportPage = read("app/nemovitosti/[id]/reporting/page.tsx");
  const propertyReportSettings = read("app/nemovitosti/[id]/nastaveni/reporting/page.tsx");
  for (const token of ["MF benchmark", "Pokrytí", "Datové období MF", "pouze ke čtení"])
    assert.ok(page.includes(token), token);
  assert.ok(service.includes("PROPERTY_CADASTRAL_DATA"));
  assert.ok(propertyReportPage.includes("pouze ke čtení"));
  assert.ok(propertyReportSettings.includes("Údaje nemovitosti"));
  assert.ok(propertyReportSettings.includes("Plzeň Černice nebo 620106"));
  assert.ok(read("app/nemovitosti/[id]/upravit/page.tsx").includes("Černice [620106]"));
  assert.ok(page.indexOf("<QualityPanel") > page.indexOf("<PropertyPerformance"));
  assert.doesNotMatch(page, /<details className="card quality-panel" open=/);
  assert.ok(page.includes("<MfBenchmarkTable"));
  const drilldown = read("components/MfBenchmarkTable.tsx");
  for (const token of ["aria-expanded", "mf-unit-drilldown", "Kategorie MF", "Potenciál / měsíc", "Volná", "Obsazená", "Doplnit dispozici"])
    assert.ok(drilldown.includes(token), token);
  assert.ok(liveService.includes("const mfUnits = reportingUnits.map"));
  assert.ok(liveService.includes('operational.status === "STANDARD"'));
  assert.doesNotMatch(read("lib/reporting/mf-rent/live-benchmark.ts"), /servicesCents|charge|update\(|create\(|delete\(/);
});

check("unit forms and API persist validated explicit dispositions", () => {
  const createForm = read("app/nemovitosti/[id]/jednotky/nova/page.tsx");
  const editForm = read("app/nemovitosti/[id]/jednotky/[unitId]/upravit/page.tsx");
  const createRoute = read("app/api/properties/[id]/units/route.ts");
  const editRoute = read("app/api/properties/[id]/units/[unitId]/route.ts");
  for (const source of [createForm, editForm]) assert.ok(source.includes('name="disposition"'));
  for (const source of [createRoute, editRoute]) {
    assert.ok(source.includes("Object.values(UnitDisposition).includes"));
    assert.ok(source.includes("dispositionCustom"));
  }
});

console.log(`MF live benchmark verification passed (${count} checks).`);