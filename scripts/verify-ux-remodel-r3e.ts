import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateAssetFinanceKpis } from "../lib/reporting/asset-finance-kpis";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

const completeRows = [
  { propertyId: "a", propertyName: "A", consolidationBasisPoints: 10_000, monthlyNetRentCents: 100_000, actualOpexTtmCents: 200_000, outstandingPrincipalCents: 4_000_000, annualDebtServiceCents: 500_000, marketValueCents: 10_000_000, valuationAsOfDate: new Date("2026-08-31") },
  { propertyId: "b", propertyName: "B", consolidationBasisPoints: 5_000, monthlyNetRentCents: 100_000, actualOpexTtmCents: 0, outstandingPrincipalCents: 0, annualDebtServiceCents: 0, marketValueCents: 8_000_000, valuationAsOfDate: new Date("2026-08-31") },
];

check("consolidated run-rate applies each property share to all financial inputs", () => {
  const result = calculateAssetFinanceKpis(completeRows);
  assert.equal(result.annualRentCents, 1_800_000);
  assert.equal(result.actualOpexTtmCents, 200_000);
  assert.equal(result.noiCents, 1_600_000);
  assert.equal(result.annualDebtServiceCents, 500_000);
  assert.equal(result.cashflowCents, 1_100_000);
  assert.equal(result.marketValueCents, 14_000_000);
  assert.equal(result.outstandingPrincipalCents, 4_000_000);
  assert.equal(result.equityCents, 10_000_000);
});

check("portfolio ratios use consolidated numerators and denominators", () => {
  const result = calculateAssetFinanceKpis(completeRows);
  assert.equal(result.yieldBps, 1143);
  assert.equal(result.roeBps, 1100);
  assert.equal(result.ltvBps, 2857);
  assert.equal(result.dscrBps, 32_000);
});

check("missing valuation fails closed for value-dependent ratios", () => {
  const result = calculateAssetFinanceKpis([{ ...completeRows[0], marketValueCents: null, valuationAsOfDate: null }]);
  assert.equal(result.marketValueCents, null);
  assert.equal(result.yieldBps, null);
  assert.equal(result.roeBps, null);
  assert.equal(result.ltvBps, null);
  assert.deepEqual(result.missingValuationProperties, ["A"]);
});

check("missing debt service fails closed without hiding NOI or LTV", () => {
  const result = calculateAssetFinanceKpis([{ ...completeRows[0], annualDebtServiceCents: null }]);
  assert.equal(result.noiCents, 1_000_000);
  assert.equal(result.cashflowCents, null);
  assert.equal(result.roeBps, null);
  assert.equal(result.dscrBps, null);
  assert.equal(result.ltvBps, 4000);
});

check("valuation history schema and migration are additive, sourced and immutable", () => {
  const schema = read("prisma/schema.prisma");
  for (const marker of ["enum PropertyValuationSource", "model PropertyValuationSnapshot", "marketValueCents BigInt", "createdBy        User", "valuations                        PropertyValuationSnapshot[]"]) assert.match(schema, new RegExp(marker.replace(/[?*+.[\]{}()]/g, "\\$&")));
  const migration = read("prisma/migrations/20260905010000_asset_kpi_valuations/migration.sql");
  assert.doesNotMatch(migration, /(?:^|\n)\s*(?:DROP|DELETE|TRUNCATE|UPDATE)\b/im);
  assert.match(migration, /PropertyValuationSnapshot_marketValueCents_check/);
  assert.match(migration, /"marketValueCents" BIGINT NOT NULL/);
  assert.match(migration, /ON DELETE RESTRICT/);
});

check("valuation writes require managed property access and audit", () => {
  const route = read("app/api/properties/[id]/valuations/route.ts");
  assert.match(route, /requireManagedProperty/);
  assert.match(route, /PROPERTY_VALUATION_SNAPSHOT_CREATED/);
  assert.match(route, /createdById: access\.user\.id/);
});

check("asset loader uses only confirmed assets and point-in-time valuation", () => {
  const service = read("lib/reporting/asset-finance-kpis.ts");
  assert.match(service, /flatcloudConsolidationBasisPoints \?\? 0\) > 0/);
  assert.match(service, /asOfDate: \{ lte: asOf \}/);
  assert.match(service, /kind: "OPEX", status: "ACTUAL"/);
  assert.match(service, /monthlyDebtServiceCents == null/);
});

check("asset UI defines every KPI and exposes missing-data states", () => {
  const report = read("app/reporty/page.tsx");
  for (const marker of ["Indikativní LIVE run-rate", "NOI · run-rate", "Cashflow po dluhové službě", "Yield", "ROE", "LTV", "DSCR", "Ocenění není úplné", "Chybí dluhová služba"]) assert.match(report, new RegExp(marker));
  const property = read("app/nemovitosti/[id]/[section]/page.tsx");
  for (const marker of ["Ocenění nemovitosti", "Zapsat ocenění", "Uložit ocenění do historie"]) assert.match(property, new RegExp(marker));
});

check("methodology, browser smoke and CI cover R3E", () => {
  assert.match(read("lib/methodology.ts"), /NOI, cashflow, yield, ROE, LTV a DSCR čtěte jako indikativní LIVE run-rate/);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /správce zapíše nové ocenění pro asset KPI/);
  assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r3e/);
});

console.log(`UX remodel R3E ověřen: ${count} kontrol.`);
