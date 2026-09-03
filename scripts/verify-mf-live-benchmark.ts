import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateLiveMfRentBenchmark, dispositionToMfRentCategory } from "../lib/reporting/mf-rent/live-benchmark";
import { parseMfCadastralArea, selectMfTerritoryFromPropertyData } from "../lib/reporting/mf-rent/property-location";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
function check(name: string, run: () => void) {
  run();
  count += 1;
  console.log(`✓ ${count}. ${name}`);
}

const category = (referenceRentCentsPerM2: number) => ({
  referenceRentCentsPerM2,
  lowerIntervalCentsPerM2: null,
  upperIntervalCentsPerM2: null,
  newBuildReferenceRentCentsPerM2: null,
  minimumCentsPerM2: null,
  maximumCentsPerM2: null,
  medianCentsPerM2: null,
  dataCoverage: 1,
});
const benchmarkData = {
  schemaVersion: 1 as const,
  vk1: category(20_000),
  vk2: category(30_000),
  vk3: category(40_000),
  vk4: category(50_000),
};
const unit = (overrides: Record<string, unknown> = {}) => ({
  leaseId: "lease-1",
  propertyId: "property-1",
  propertyName: "Veská",
  unitId: "unit-1",
  unitLabel: "1",
  unitType: "APARTMENT",
  occupancyStatus: "OCCUPIED" as const,
  disposition: "ONE_KK" as const,
  areaM2: 50,
  actualRentPerM2Cents: 18_000,
  ...overrides,
});

check("all supported dispositions map only to official VK groups", () => {
  assert.equal(dispositionToMfRentCategory("STUDIO"), "vk1");
  assert.equal(dispositionToMfRentCategory("ONE_KK"), "vk1");
  assert.equal(dispositionToMfRentCategory("ONE_PLUS_ONE"), "vk1");
  assert.equal(dispositionToMfRentCategory("TWO_KK"), "vk2");
  assert.equal(dispositionToMfRentCategory("TWO_PLUS_ONE"), "vk2");
  assert.equal(dispositionToMfRentCategory("THREE_KK"), "vk3");
  assert.equal(dispositionToMfRentCategory("THREE_PLUS_ONE"), "vk3");
  assert.equal(dispositionToMfRentCategory("FOUR_KK"), "vk4");
  assert.equal(dispositionToMfRentCategory("FOUR_PLUS_ONE"), "vk4");
  assert.equal(dispositionToMfRentCategory("OTHER"), null);
  assert.equal(dispositionToMfRentCategory(null), null);
});

check("benchmark preserves signed rent gap and area-weighted portfolio values", () => {
  const result = calculateLiveMfRentBenchmark(
    [
      unit(),
      unit({ leaseId: "lease-2", unitId: "unit-2", areaM2: 100, actualRentPerM2Cents: 33_000, disposition: "TWO_KK" }),
    ],
    [{ propertyId: "property-1", territoryName: "Veská", data: benchmarkData }],
  );
  assert.equal(result.rows[0].marketGapPerM2Cents, 2_000);
  assert.equal(result.rows[0].reversionaryPotentialCents, 100_000);
  assert.equal(result.rows[1].marketGapPerM2Cents, -3_000);
  assert.equal(result.rows[1].reversionaryPotentialCents, -300_000);
  assert.equal(result.aggregate.actualRentPerM2Cents, 28_000);
  assert.equal(result.aggregate.marketRentPerM2Cents, 26_667);
  assert.equal(result.aggregate.reversionaryPotentialCents, -200_000);
});

check("vacant apartments contribute zero actual rent and full MF letting potential", () => {
  const result = calculateLiveMfRentBenchmark(
    [
      unit(),
      unit({
        leaseId: null,
        unitId: "unit-vacant",
        unitLabel: "3",
        occupancyStatus: "VACANT",
        areaM2: 60,
        actualRentPerM2Cents: 0,
        disposition: "TWO_KK",
      }),
    ],
    [{ propertyId: "property-1", territoryName: "Veská", data: benchmarkData }],
  );
  const vacant = result.rows.find((row) => row.unitId === "unit-vacant");
  assert.equal(result.propertyRows[0].coveredUnits, 2);
  assert.equal(result.propertyRows[0].comparableUnits, 2);
  assert.equal(vacant?.actualRentPerM2Cents, 0);
  assert.equal(vacant?.marketRentPerM2Cents, 30_000);
  assert.equal(vacant?.rentToMarketBps, 0);
  assert.equal(vacant?.reversionaryPotentialCents, 1_800_000);
});

check("coverage fails closed for missing area, disposition, territory or non-apartment", () => {
  const result = calculateLiveMfRentBenchmark(
    [
      unit(),
      unit({ leaseId: "lease-2", unitId: "unit-2", disposition: null }),
      unit({ leaseId: "lease-3", unitId: "unit-3", areaM2: null }),
      unit({ leaseId: "lease-4", unitId: "unit-4", propertyId: "property-2" }),
      unit({ leaseId: "lease-5", unitId: "unit-5", unitType: "COMMERCIAL" }),
    ],
    [{ propertyId: "property-1", territoryName: "Veská", data: benchmarkData }],
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.aggregate.comparableUnits, 3);
  assert.equal(result.aggregate.coveredUnits, 1);
  assert.equal(result.aggregate.coverageBps, 3_333);
  assert.deepEqual(
    result.dataQualityIssues.map((issue) => issue.code).sort(),
    ["MISSING_MF_PROPERTY_LOCATION", "MISSING_MF_UNIT_DISPOSITION"],
  );
});

check("property cadastral data resolves exact unique territory including accents", () => {
  const selected = selectMfTerritoryFromPropertyData({
    cadastralArea: "Veská",
    city: "Sezemice",
    candidates: [{ territoryCode: "785", territoryName: "Veska", municipalityName: "Sezemice" }],
  });
  assert.equal(selected?.territoryCode, "785");
});

check("property cadastral descriptor accepts the stable six-digit MF code", () => {
  assert.deepEqual(parseMfCadastralArea(" Černice [620106] "), {
    raw: "Černice [620106]",
    name: "Černice",
    code: "620106",
  });
  const selected = selectMfTerritoryFromPropertyData({
    cadastralArea: "Černice [620106]",
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
  const propertyPage = read("app/nemovitosti/[id]/reporting/page.tsx");
  for (const token of ["MF benchmark", "Pokrytí", "Datové období MF", "pouze ke čtení"])
    assert.ok(page.includes(token), token);
  assert.ok(service.includes("PROPERTY_CADASTRAL_DATA"));
  assert.ok(propertyPage.includes("Údaje nemovitosti"));
  assert.ok(propertyPage.includes("Plzeň Černice nebo 620106"));
  assert.ok(read("app/nemovitosti/[id]/upravit/page.tsx").includes("Černice [620106]"));
  assert.ok(page.indexOf("<QualityPanel") > page.indexOf("<PropertyPerformance"));
  assert.doesNotMatch(page, /<details className="card quality-panel" open=/);
  assert.ok(page.includes("<MfBenchmarkTable"));
  const drilldown = read("components/MfBenchmarkTable.tsx");
  for (const token of ["aria-expanded", "mf-unit-drilldown", "Kategorie MF", "Potenciál / měsíc", "Volná", "Obsazená"])
    assert.ok(drilldown.includes(token), token);
  assert.ok(liveService.includes("const mfUnits = reportingUnits.flatMap"));
  assert.ok(liveService.includes('operational.status !== "STANDARD"'));
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
