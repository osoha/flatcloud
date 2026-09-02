import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calculatedSnapshotDataSchema,
  manualBaselineSnapshotDataSchema,
  MANUAL_BASELINE_SCHEMA_VERSION,
} from "../lib/reporting/snapshot-schema";
import {
  parseHistoricalQuarterKpis,
  parseOptionalPercentToBps,
} from "../lib/reporting/historical-quarter-input";
import { snapshotTrendPoint } from "../lib/reporting/trend-series";
import { createManualBaselineSnapshotTx } from "../lib/reporting/manual-baseline-service";
const root = process.cwd(),
  read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  await fn();
  console.log(`✓ ${++count}. ${name}`);
}
const v1 = {
  source: "MANUAL_BASELINE",
  schemaVersion: 1,
  asOfDate: "2025-03-31",
  units: { rentable: 10, occupied: 9 },
  rentRoll: { monthlyNetRentCents: 0 },
} as const;
const v2 = {
  source: "MANUAL_BASELINE",
  schemaVersion: 2,
  asOfDate: "2025-03-31",
  units: { occupancyBps: 9150 },
  rentRoll: { monthlyNetRentCents: 21800000, weightedNetRentPerM2Cents: 20500 },
  collections: { overdueDebtCents: 3400000 },
} as const;
const calculated = {
  source: "CALCULATED",
  schemaVersion: 1,
  asOfDate: "2025-03-31",
  units: {
    total: 1,
    rentable: 1,
    occupied: 1,
    vacant: 0,
    renovation: 0,
    inactive: 0,
    unknownOperationalStatus: 0,
  },
  rentRoll: {
    monthlyNetRentCents: 0,
    monthlyServicesCents: 0,
    monthlyTotalCents: 0,
    rentableAreaM2: 1,
    occupiedAreaM2: 1,
    weightedNetRentPerM2Cents: 0,
    missingAreaUnits: 0,
  },
  collections: {
    quarterExpectedCents: 0,
    quarterPaidCents: 0,
    collectionRateBps: null,
    overdueDebtCents: 0,
  },
  deposits: {
    agreedCents: 0,
    heldPrincipalCents: 0,
    missingCents: 0,
    fundedLeases: 0,
    partialLeases: 0,
    unpaidLeases: 0,
    toSettleLeases: 0,
  },
  leases: { active: 0, future: 0, expiring90Days: 0, endedYtd: 0 },
} as const;
async function main() {
  const schema = read("prisma/schema.prisma"),
    service = read("lib/reporting/manual-baseline-service.ts"),
    trend = read("lib/reporting/trend-series.ts"),
    page = read("app/nemovitosti/[id]/reporting/page.tsx"),
    route = read(
      "app/api/properties/[id]/reporting/historical-quarter/route.ts",
    ),
    model = read(
      "lib/reporting/presentation/quarterly-property-presentation-model.ts",
    ),
    loader = read(
      "lib/reporting/presentation/quarterly-property-presentation-data.ts",
    ),
    html = read(
      "components/reporting/quarterly-property/QuarterlyPropertyReportDocument.tsx",
    ).replaceAll("MiniChart", "TrendChart"),
    pdf = read(
      "lib/reporting/presentation/pdf/QuarterlyPropertyLandscapePdfDocument.tsx",
    ),
    doc = read("REPORTING-V22.md"),
    ci = read(".github/workflows/ci.yml");
  await check("no new Prisma model", () =>
    assert.doesNotMatch(schema, /PropertyHistoricalQuarterMetric/),
  );
  await check("no trends migration", () =>
    assert.equal(
      fs.readdirSync("prisma/migrations").filter((x) => /trend/i.test(x))
        .length,
      0,
    ),
  );
  await check("QuarterSnapshot reused", () =>
    assert.match(service, /quarterSnapshot\.create/),
  );
  await check("manual v1 parses", () =>
    assert.ok(manualBaselineSnapshotDataSchema.safeParse(v1).success),
  );
  await check("calculated v1 parses", () =>
    assert.ok(calculatedSnapshotDataSchema.safeParse(calculated).success),
  );
  await check("manual v2 parses", () =>
    assert.ok(manualBaselineSnapshotDataSchema.safeParse(v2).success),
  );
  await check("v2 occupancy", () =>
    assert.equal(MANUAL_BASELINE_SCHEMA_VERSION, 2),
  );
  await check("occupancy lower bound", () =>
    assert.ok(
      manualBaselineSnapshotDataSchema.safeParse({
        ...v2,
        units: { occupancyBps: 0 },
      }).success,
    ),
  );
  await check("occupancy upper bound", () =>
    assert.ok(
      !manualBaselineSnapshotDataSchema.safeParse({
        ...v2,
        units: { occupancyBps: 10001 },
      }).success,
    ),
  );
  await check("no fake counts", () =>
    assert.deepEqual(Object.keys(v2.units), ["occupancyBps"]),
  );
  await check("source note required", () =>
    assert.match(service, /sourceNote.*trim/),
  );
  await check("canonical calendar", () =>
    assert.match(service, /quarterEndKey/),
  );
  let created: any, audit: any;
  const tx: any = {
    quarterSnapshot: {
      findFirst: async () => ({ revision: 2 }),
      create: async ({ data }: any) =>
        (created = { id: "s", createdAt: new Date(), ...data }),
    },
    auditLog: { create: async ({ data }: any) => (audit = data) },
  };
  await createManualBaselineSnapshotTx(tx, {
    propertyId: "p",
    year: 2025,
    quarter: 2,
    sourceNote: " source ",
    createdById: "u",
    kpis: {
      occupancyBps: 0,
      monthlyNetRentCents: 0,
      weightedNetRentPerM2Cents: 21100,
      collectionRateBps: 9850,
      overdueDebtCents: 2100000,
    },
  });
  await check("immutable N+1", () => assert.equal(created.revision, 3));
  await check("create not update", () =>
    assert.doesNotMatch(service, /quarterSnapshot\.update/),
  );
  await check("manual source", () =>
    assert.equal(created.source, "MANUAL_BASELINE"),
  );
  await check("schema version", () => assert.equal(created.schemaVersion, 2));
  await check("actor stored", () => assert.equal(created.createdById, "u"));
  await check("zero remains zero", () =>
    assert.equal(created.data.units.occupancyBps, 0),
  );
  const blank = new FormData();
  await check("blank unknown", () =>
    assert.deepEqual(parseHistoricalQuarterKpis(blank), {}),
  );
  await check("monthly roundtrip", () =>
    assert.equal(created.data.rentRoll.monthlyNetRentCents, 0),
  );
  await check("weighted roundtrip", () =>
    assert.equal(created.data.rentRoll.weightedNetRentPerM2Cents, 21100),
  );
  await check("collection roundtrip", () =>
    assert.equal(created.data.collections.collectionRateBps, 9850),
  );
  await check("debt roundtrip", () =>
    assert.equal(created.data.collections.overdueDebtCents, 2100000),
  );
  await check("audit created", () =>
    assert.equal(audit.action, "REPORTING_MANUAL_BASELINE_CREATED"),
  );
  await check("property section", () =>
    assert.match(read("components/PropertySubnav.tsx"), /reporting.*Reporty/),
  );
  await check("unit limited blocked", () =>
    assert.match(page, /!hasAllPropertyAccess\(user\)\s*&&\s*!membership/),
  );
  await check("property view reads", () => assert.match(page, /membership/));
  await check("edit admin writes", () => assert.match(page, /EDIT[\s\S]*ADMIN/));
  await check("unauthorized write", () => assert.match(route, /status:403/));
  await check("latest table revisions", () =>
    assert.match(page, /if\s*\(!latest\.has\(key\)\)/),
  );
  await check("provenance displayed", () =>
    assert.match(page, /row\.sourceNote/),
  );
  await check("manual fallback", () =>
    assert.match(trend, /quarterSnapshot\.findMany/),
  );
  await check("published precedence", () =>
    assert.ok(
      trend.indexOf("for(const row of published)") >
        trend.indexOf("for(const row of manual)"),
    ),
  );
  await check("current precedence", () =>
    assert.ok(
      trend.indexOf("periods.set(currentKey") >
        trend.indexOf("for(const row of published)"),
    ),
  );
  await check("no standalone calculated history", () =>
    assert.match(trend, /source:"MANUAL_BASELINE"/),
  );
  await check("future excluded", () => assert.match(trend, /key<=maxPeriod/));
  await check("no missing quarters", () =>
    assert.doesNotMatch(trend, /fill|interpolat/i),
  );
  await check("ascending", () =>
    assert.match(trend, /sort\(\(\[a\],\[b\]\)=>a-b\)/),
  );
  await check("last six", () => assert.match(trend, /slice\(-6\)/));
  await check("explicit occupancy converts", () =>
    assert.equal(snapshotTrendPoint(2025, 1, v2)?.occupancyPercent, 91.5),
  );
  await check("v1 occupancy real counts", () =>
    assert.equal(snapshotTrendPoint(2025, 1, v1)?.occupancyPercent, 90),
  );
  await check("v1 missing denominator", () =>
    assert.equal(
      snapshotTrendPoint(2025, 1, { ...v1, units: { occupied: 9 } })
        ?.occupancyPercent,
      null,
    ),
  );
  await check("all unknown omitted", () =>
    assert.equal(
      snapshotTrendPoint(2025, 1, {
        source: "MANUAL_BASELINE",
        schemaVersion: 1,
        asOfDate: "2025-03-31",
      }),
      null,
    ),
  );
  await check("known zero point", () =>
    assert.equal(
      snapshotTrendPoint(2025, 1, { ...v2, units: { occupancyBps: 0 } })
        ?.occupancyPercent,
      0,
    ),
  );
  await check("draft newest available", () =>
    assert.match(trend, /const cutoff=.*status===\"PUBLISHED\"/),
  );
  await check("published baseline cutoff", () =>
    assert.match(trend, /createdAt:\{lte:cutoff\}/),
  );
  await check("published report cutoff", () =>
    assert.match(trend, /publishedAt:\{lte:cutoff\}/),
  );
  await check("frozen deterministic query", () =>
    assert.match(trend, /Promise\.all/),
  );
  await check("weighted metric", () =>
    assert.match(model, /weightedNetRentPerM2Cents/),
  );
  await check("HTML four charts", () =>
    assert.equal((html.match(/<TrendChart /g) || []).length, 4),
  );
  await check("PDF four charts", () =>
    assert.equal((pdf.match(/<MiniChart /g) || []).length, 4),
  );
  await check("TRENDS-1 calculation remains free of later MF benchmark data", () =>
    assert.doesNotMatch(
      [service, trend].join(""),
      /Ministry|Cenová mapa|xlsx|benchmark/i,
    ),
  );
  await check("HTML consumes model only", () =>
    assert.doesNotMatch(html, /prisma\./),
  );
  await check("PDF consumes model only", () =>
    assert.doesNotMatch(pdf, /prisma\./),
  );
  await check("canonical PDF untouched by feature", () =>
    assert.doesNotMatch(
      read("lib/reporting/pdf/quarterly-report-pdf.tsx"),
      /occupancyBps|manual-baseline-v2/,
    ),
  );
  await check("canonical loader untouched", () =>
    assert.doesNotMatch(
      read("lib/reporting/pdf/quarterly-report-pdf-data.ts"),
      /occupancyBps|manual-baseline-v2/,
    ),
  );
  await check("publication untouched", () =>
    assert.doesNotMatch(
      read("lib/reporting/report-asset-service.ts"),
      /occupancyBps|manual-baseline-v2/,
    ),
  );
  await check("storage untouched", () =>
    assert.doesNotMatch(
      read("lib/storage/google-drive.ts"),
      /occupancyBps|manual-baseline-v2/,
    ),
  );
  await check("no dummy production history", () =>
    assert.doesNotMatch(
      page,
      /Investor report Q2\/2025|Export ze staré aplikace|Historický Excel/,
    ),
  );
  await check("documentation", () =>
    assert.match(doc, /TRENDS-1[\s\S]*publishedAt[\s\S]*createdAt/),
  );
  await check("CI ordering", () =>
    assert.ok(
      ci.indexOf("verify:report-design-4a") <
        ci.indexOf("verify:report-trends-1") &&
        ci.indexOf("verify:report-trends-1") < ci.indexOf("npm run build"),
    ),
  );
  await check("Czech decimals", () =>
    assert.equal(parseOptionalPercentToBps("92,5"), 9250),
  );
  console.log(`REPORT-TRENDS-1 verification passed: ${count} checks.`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
