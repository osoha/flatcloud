import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  parseMfRentWorkbook,
  normalizeMfHeader,
} from "../lib/reporting/mf-rent/parser";
import {
  discoverMfReleases,
  assertOfficialMfUrl,
  marketPeriodBeforePublication,
  MF_XLSX_MAX_BYTES,
  MF_REQUEST_TIMEOUT_MS,
} from "../lib/reporting/mf-rent/source";
const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
let count = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  await fn();
  count++;
  console.log(`✓ ${count}. ${name}`);
}
const labels = [
  "Nájemné referenčního bytu za m² v Kč za 1 měsíc",
  "Dolní interval nájemného u referenčního bytu za m² v Kč za 1 měsíc",
  "Horní interval nájemného u referenčního bytu za m² v Kč za 1 měsíc",
  "Nájemné referenčního bytu novostavby za m² v Kč za 1 měsíc",
  "Minimální hodnota nájemného za m² v Kč",
  "Maximální hodnota nájemného za m² v Kč",
  "Mediánová hodnota nájemného za m² v Kč",
  "Datová pokrytost",
];
async function fixture(
  options: {
    missing?: boolean;
    duplicate?: boolean;
    reordered?: boolean;
    duplicateTerritory?: boolean;
  } = {},
) {
  const w = new ExcelJS.Workbook(),
    s = w.addWorksheet(" Cenové mapy nájemného ");
  const block = (vk: number) =>
    [
      "VK",
      ...(options.reordered
        ? [
            labels[6],
            labels[0],
            labels[3],
            labels[2],
            labels[1],
            labels[5],
            labels[4],
            labels[7],
          ]
        : labels),
    ].map((x) =>
      options.missing && vk === 4 && x === labels[0] ? "jiný sloupec" : x,
    );
  let headers = [
    " Kraj ",
    "Katastrální   území",
    "Obec",
    "Kód obce",
    ...block(1),
    "",
    ...block(2),
    "",
    ...block(3),
    "",
    ...block(4),
  ];
  if (options.duplicate) headers[6] = labels[0];
  s.addRow(headers);
  const values = (vk: number) =>
    options.reordered
      ? [vk, 222, 123.45, 333, 145, 100, 500, 120, 1]
      : [vk, 123.45, 100, 145, 333, 120, 500, 222, 1];
  s.addRow([
    "Kraj",
    "Území",
    "Obec",
    123456,
    ...values(1),
    "",
    ...values(2),
    "",
    ...values(3),
    "",
    ...values(4),
  ]);
  if (options.duplicateTerritory)
    s.addRow([
      "Kraj",
      "Území",
      "Obec",
      123456,
      ...values(1),
      "",
      ...values(2),
      "",
      ...values(3),
      "",
      ...values(4),
    ]);
  return new Uint8Array(await w.xlsx.writeBuffer());
}
async function main() {
  const schema = read("prisma/schema.prisma"),
    migration = read(
      "prisma/migrations/20260902120000_mf_rent_data_foundation/migration.sql",
    ),
    source = read("lib/reporting/mf-rent/source.ts"),
    parser = read("lib/reporting/mf-rent/parser.ts"),
    service = read("lib/reporting/mf-rent/service.ts"),
    location = read("lib/reporting/mf-rent/location-service.ts"),
    scheduler = read("scripts/scheduler-cron.ts"),
    settings = read("app/nastaveni/page.tsx"),
    doc = read("REPORTING-V22.md"),
    ci = read(".github/workflows/ci.yml"),
    pkg = JSON.parse(read("package.json"));
  await check("additive MF models and migration", () => {
    for (const m of [
      "MfRentDatasetRelease",
      "MfRentTerritorySnapshot",
      "PropertyMfRentLocation",
    ])
      assert.match(schema, new RegExp(`model ${m}`));
    assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
  });
  await check("immutable SHA release", () => {
    assert.match(schema, /sourceSha256\s+String\s+@unique/);
    assert.doesNotMatch(service, /mfRentDatasetRelease\.update/);
  });
  await check("same market period is not unique", () =>
    assert.doesNotMatch(schema, /@@unique\(\[marketYear, marketQuarter\]\)/),
  );
  await check("official HTTPS allowlist", () => {
    assert.equal(
      assertOfficialMfUrl("https://mf.gov.cz/a.xlsx").hostname,
      "mf.gov.cz",
    );
    assert.throws(() => assertOfficialMfUrl("http://mf.gov.cz/a.xlsx"));
    assert.throws(() => assertOfficialMfUrl("https://evil.example/a.xlsx"));
  });
  await check(
    "discovery current and history without hardcoded filename",
    () => {
      const html =
        '<p>aktualizován 13.8.2026</p><a href="/assets/x/current-random.xlsx">Cenová mapa - tabulkové výstupy</a><a href="https://mf.gov.cz/assets/x/history-random.xlsx">Historická data – květen 2026</a>';
      const rows = discoverMfReleases(html);
      assert.equal(rows.length, 2);
      assert.ok(rows.some((x) => x.current) && rows.some((x) => !x.current));
    },
  );
  await check("publication maps to preceding quarter", () =>
    assert.deepEqual(marketPeriodBeforePublication(new Date("2026-08-13Z")), {
      marketYear: 2026,
      marketQuarter: 2,
    }),
  );
  await check("resource guards", () => {
    assert.equal(MF_XLSX_MAX_BYTES, 10485760);
    assert.ok(MF_REQUEST_TIMEOUT_MS > 0);
    assert.match(source, /redirect:\s*"follow"/);
    assert.match(source, /hostname\.toLowerCase\(\)\s*!==\s*"mf\.gov\.cz"/);
    assert.match(source, /0x50[\s\S]*0x4b[\s\S]*0x03[\s\S]*0x04/);
  });
  await check("normalized benign headers", () =>
    assert.equal(
      normalizeMfHeader("  Nájemné—REFERENČNÍHO  bytu "),
      "najemne referencniho bytu",
    ),
  );
  const parsed = await parseMfRentWorkbook(await fixture({ reordered: true }), {
    minimumTerritories: 1,
  });
  await check("semantic parser tolerates reordered columns", () =>
    assert.equal(parsed.territories[0].data.vk1.referenceRentCentsPerM2, 12345),
  );
  await check("VK1–VK4 parsed", () =>
    assert.deepEqual(
      [
        parsed.territories[0].data.vk1,
        parsed.territories[0].data.vk2,
        parsed.territories[0].data.vk3,
        parsed.territories[0].data.vk4,
      ].map((x) => x.newBuildReferenceRentCentsPerM2),
      [33300, 33300, 33300, 33300],
    ),
  );
  await check("fingerprint deterministic", async () =>
    assert.equal(
      parsed.schemaFingerprint,
      (
        await parseMfRentWorkbook(await fixture({ reordered: true }), {
          minimumTerritories: 1,
        })
      ).schemaFingerprint,
    ),
  );
  await check("missing header fails closed", async () =>
    assert.rejects(async () =>
      parseMfRentWorkbook(await fixture({ missing: true }), {
        minimumTerritories: 1,
      }),
    ),
  );
  await check("ambiguous header fails closed", async () =>
    assert.rejects(async () =>
      parseMfRentWorkbook(await fixture({ duplicate: true }), {
        minimumTerritories: 1,
      }),
    ),
  );
  await check("duplicate territory fails", async () =>
    assert.rejects(async () =>
      parseMfRentWorkbook(await fixture({ duplicateTerritory: true }), {
        minimumTerritories: 1,
      }),
    ),
  );
  await check("null and zero remain distinct", async () => {
    const w = await fixture();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      w.buffer.slice(w.byteOffset, w.byteOffset + w.byteLength) as ArrayBuffer,
    );
    const s = wb.worksheets[0];
    s.getCell(2, 6).value = null;
    s.getCell(2, 7).value = 0;
    const p = await parseMfRentWorkbook(
      new Uint8Array(await wb.xlsx.writeBuffer()),
      { minimumTerritories: 1, minimumCoverageRatio: 0 },
    );
    assert.equal(p.territories[0].data.vk1.referenceRentCentsPerM2, null);
    assert.equal(p.territories[0].data.vk1.lowerIntervalCentsPerM2, 0);
  });
  await check("atomic transaction and idempotency", () => {
    assert.match(service, /prisma\.\$transaction/);
    assert.match(service, /findUnique\([\s\S]*?where:\s*\{\s*sourceSha256/);
    assert.match(service, /createMany/);
  });
  await check("bootstrap current plus seven periods", () =>
    assert.match(service, /slice\(0,\s*8\)/),
  );
  await check("freshness and force", () => {
    assert.match(service, /FRESH_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    assert.match(service, /!options\.force/);
  });
  await check("scheduler MF is soft", () => {
    assert.match(scheduler, /name: "mf-rent"/);
    const tail = scheduler.slice(scheduler.indexOf('name: "mf-rent"'));
    assert.doesNotMatch(tail.slice(0, 300), /hardFailure = true/);
  });
  await check("SUPER_ADMIN route and diagnostics", () => {
    assert.match(
      read("app/api/settings/mf-rent/sync/route.ts"),
      /role!=="SUPER_ADMIN"/,
    );
    assert.match(settings, /Cenová mapa nájemného MF/);
    assert.match(settings, /Zkontrolovat data MF/);
  });
  await check("mapping explicit bounded and audited", () => {
    assert.match(location, /Math\.min\(Math\.max\(limit,\s*1\),\s*30\)/);
    assert.match(location, /MF_RENT_LOCATION_ASSIGNED/);
    assert.match(location, /"EDIT",\s*"ADMIN"/);
    assert.match(
      read("app/api/properties/[id]/mf-rent/location/route.ts"),
      /form\.get\("territoryCode"\)/,
    );
  });
  await check("unit-limited cannot map", () =>
    assert.match(location, /unit\s*===\s*0/),
  );
  await check("deterministic cutoff resolver", () => {
    assert.match(service, /publishedOn:\s*\{\s*lte:\s*cutoff/);
    assert.match(service, /marketQuarter:\s*\{\s*lte:\s*targetQuarter/);
    assert.match(service, /publishedOn:\s*"desc"/);
  });
  await check("property resolver returns four categories", () => {
    for (const vk of ["vk1", "vk2", "vk3", "vk4"])
      assert.match(service, new RegExp(vk));
  });
  await check("no weighting or inference", () => {
    assert.doesNotMatch(
      service + location,
      /weight|disposition|unit label|areaM2/i,
    );
    assert.doesNotMatch(schema, /disposition/);
  });
  await check("no contractual mutation", () =>
    assert.doesNotMatch(
      service + location,
      /prisma\.lease\.(update|create)|leasePaymentItem|prisma\.charge\.(update|create)|indexation/i,
    ),
  );
  await check("snapshot and trends remain MF-free", () => {
    assert.doesNotMatch(
      read("lib/reporting/snapshot-schema.ts"),
      /mfRent|MF benchmark/i,
    );
    assert.doesNotMatch(
      read(
        "lib/reporting/presentation/quarterly-property-presentation-model.ts",
      ),
      /mfRent|MF benchmark/i,
    );
  });
  await check(
    "protected render/publication/storage files untouched by MF",
    () => {
      for (const f of [
        "components/reporting/quarterly-property/QuarterlyPropertyReportDocument.tsx",
        "lib/reporting/presentation/pdf/QuarterlyPropertyLandscapePdfDocument.tsx",
        "lib/reporting/trend-series.ts",
        "lib/reporting/pdf/quarterly-report-pdf.tsx",
        "lib/reporting/pdf/quarterly-report-pdf-data.ts",
        "lib/reporting/report-asset-service.ts",
        "lib/storage/google-drive.ts",
      ])
        assert.doesNotMatch(read(f), /mfRent|Cenová mapa/i);
    },
  );
  await check("documentation", () =>
    assert.match(
      doc,
      /MF-1[\s\S]*katastrální[\s\S]*nemění smluvní nájemné[\s\S]*nedefinuje vážení/,
    ),
  );
  await check("ExcelJS server dependency", () =>
    assert.equal(pkg.dependencies.exceljs, "4.4.0"),
  );
  await check("CI order", () =>
    assert.ok(
      ci.indexOf("verify:report-trends-1") < ci.indexOf("verify:mf-rent-1") &&
        ci.indexOf("verify:mf-rent-1") < ci.indexOf("npm run build"),
    ),
  );
  console.log(`MF-1 verification passed: ${count} checks.`);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
