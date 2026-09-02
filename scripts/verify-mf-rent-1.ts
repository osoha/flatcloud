import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
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
import {
  importParsedMfRentRelease,
  isMfRentReleaseSourceShaCollision,
  MF_RENT_IMPORT_BATCH_SIZE,
  MF_RENT_IMPORT_TRANSACTION_TIMEOUT_MS,
  syncMfRentDatasets,
} from "../lib/reporting/mf-rent/service";
type ParsedMfRentWorkbook = Awaited<ReturnType<typeof parseMfRentWorkbook>>;
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
    rowCount?: number;
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
  for (let index = 0; index < (options.rowCount ?? 1); index++)
    s.addRow([
      "Kraj",
      `Území ${index}`,
      "Obec",
      100000 + index,
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
      "Území 0",
      "Obec",
      100000,
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
function release(marker: string) {
  return {
    url: `https://mf.gov.cz/assets/${marker}.xlsx`,
    fileName: `${marker}.xlsx`,
    publishedOn: new Date("2026-08-15T00:00:00.000Z"),
    marketYear: 2026,
    marketQuarter: 2,
    current: true,
  };
}
function parsedTerritories(marker: string, count: number) {
  const category = {
    referenceRentCentsPerM2: 24550,
    lowerIntervalCentsPerM2: null,
    upperIntervalCentsPerM2: null,
    newBuildReferenceRentCentsPerM2: null,
    minimumCentsPerM2: null,
    maximumCentsPerM2: null,
    medianCentsPerM2: null,
    dataCoverage: 1,
  };
  return {
    schemaFingerprint: `hotfix-${marker}`,
    coverage: { vk1: count, vk2: count, vk3: count, vk4: count },
    territories: Array.from({ length: count }, (_, index) => ({
      territoryCode: `${marker}-${index}`,
      territoryName: `Území ${index}`,
      municipalityName: "Obec",
      districtName: null,
      regionName: "Kraj",
      data: {
        schemaVersion: 1 as const,
        vk1: category,
        vk2: category,
        vk3: category,
        vk4: category,
      },
    })),
  } satisfies ParsedMfRentWorkbook;
}
function response(body: BodyInit, url: string, headers?: HeadersInit) {
  const value = new Response(body, { status: 200, headers });
  Object.defineProperty(value, "url", { value: url });
  return value;
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
  await check("MF transaction timeout exceeds Prisma default and is scoped", () => {
    assert.ok(MF_RENT_IMPORT_TRANSACTION_TIMEOUT_MS > 5_000);
    assert.match(
      service,
      /prisma\.\$transaction\([\s\S]*timeout:\s*MF_RENT_IMPORT_TRANSACTION_TIMEOUT_MS/,
    );
    assert.doesNotMatch(read("lib/db.ts"), /transactionOptions|60_000/);
  });
  await check("territory createMany remains conservatively batched", () => {
    assert.equal(MF_RENT_IMPORT_BATCH_SIZE, 1_000);
    assert.ok(MF_RENT_IMPORT_BATCH_SIZE > 0 && MF_RENT_IMPORT_BATCH_SIZE < 7_630);
    assert.match(service, /i \+= MF_RENT_IMPORT_BATCH_SIZE/);
    assert.match(service, /slice\(i, i \+ MF_RENT_IMPORT_BATCH_SIZE\)/);
  });
  if (process.env.DATABASE_URL) {
    const marker = `mf11-${Date.now()}`;
    const failedSha = createHash("sha256").update(`${marker}-failed`).digest("hex");
    const failing = parsedTerritories(marker, MF_RENT_IMPORT_BATCH_SIZE + 1);
    failing.territories[MF_RENT_IMPORT_BATCH_SIZE].territoryCode =
      failing.territories[0].territoryCode;
    await check("later batch failure rolls back release and every territory", async () => {
      await assert.rejects(
        () =>
          importParsedMfRentRelease({
            release: release(marker),
            sourceSha256: failedSha,
            parsed: failing,
          }),
        (error) =>
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          !isMfRentReleaseSourceShaCollision(error),
      );
      assert.equal(
        await prisma.mfRentDatasetRelease.count({
          where: { sourceSha256: failedSha },
        }),
        0,
      );
      assert.equal(
        await prisma.mfRentTerritorySnapshot.count({
          where: { territoryCode: { startsWith: `${marker}-` } },
        }),
        0,
      );
    });
    await check("retry after rolled-back failure succeeds atomically", async () => {
      const corrected = parsedTerritories(marker, MF_RENT_IMPORT_BATCH_SIZE + 1);
      const result = await importParsedMfRentRelease({
        release: release(marker),
        sourceSha256: failedSha,
        parsed: corrected,
      });
      assert.equal(
        await prisma.mfRentTerritorySnapshot.count({
          where: { releaseId: result.release.id },
        }),
        MF_RENT_IMPORT_BATCH_SIZE + 1,
      );
    });
    const concurrentMarker = `${marker}-concurrent`;
    const concurrentSha = createHash("sha256")
      .update(concurrentMarker)
      .digest("hex");
    const concurrentParsed = parsedTerritories(concurrentMarker, 25);
    await check("concurrent same-SHA import is an idempotent success", async () => {
      const results = await Promise.all([
        importParsedMfRentRelease({
          release: release(concurrentMarker),
          sourceSha256: concurrentSha,
          parsed: concurrentParsed,
        }),
        importParsedMfRentRelease({
          release: release(concurrentMarker),
          sourceSha256: concurrentSha,
          parsed: concurrentParsed,
        }),
      ]);
      assert.deepEqual(
        results.map((result) => result.status).sort(),
        ["already_imported", "imported"],
      );
      assert.equal(
        await prisma.mfRentDatasetRelease.count({
          where: { sourceSha256: concurrentSha },
        }),
        1,
      );
      assert.equal(
        await prisma.mfRentTerritorySnapshot.count({
          where: { releaseId: results[0].release.id },
        }),
        25,
      );
    });
    const nationalMarker = `${marker}-national`;
    await check("synthetic 7,630 territory release import completes", async () => {
      const result = await importParsedMfRentRelease({
        release: release(nationalMarker),
        sourceSha256: createHash("sha256").update(nationalMarker).digest("hex"),
        parsed: parsedTerritories(nationalMarker, 7_630),
      });
      assert.equal(
        await prisma.mfRentTerritorySnapshot.count({
          where: { releaseId: result.release.id },
        }),
        7_630,
      );
    });
    const workbook = await fixture({ rowCount: 7_630 });
    const workbookSha = createHash("sha256").update(workbook).digest("hex");
    const syncMarker = `${marker}-sync`;
    const pageUrl =
      "https://mf.gov.cz/cs/rozpoctova-politika/podpora-projektoveho-rizeni/cenova-mapa/cenova-mapa-infografika";
    const currentUrl = `https://mf.gov.cz/assets/${syncMarker}-2026-08-15.xlsx`;
    const historyUrl = `https://mf.gov.cz/assets/${syncMarker}-2026-05-15.xlsx`;
    const html = `<p>aktualizován 15.8.2026</p><a href="${currentUrl}">Cenová mapa - tabulkové výstupy</a><a href="${historyUrl}">Historická data – květen 2026</a>`;
    const fetcher = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url === pageUrl)
        return response(html, pageUrl, { "content-type": "text/html" });
      return response(workbook, url, {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }) as typeof fetch;
    await check("concurrent sync counts SHA collision as idempotent success", async () => {
      const syncAt = new Date(Date.now() + 500);
      const results = await Promise.all([
        syncMfRentDatasets({ force: true, fetcher, now: syncAt }),
        syncMfRentDatasets({ force: true, fetcher, now: syncAt }),
      ]);
      assert.equal(results.reduce((sum, result) => sum + result.newImports, 0), 1);
      assert.equal(
        results.reduce((sum, result) => sum + result.idempotentSkips, 0),
        3,
      );
      assert.ok(results.every((result) => result.status === "ok"));
      assert.ok(results.every((result) => !/Neúspěšná/.test(result.summary)));
      assert.equal(
        await prisma.mfRentDatasetRelease.count({
          where: { sourceSha256: workbookSha },
        }),
        1,
      );
      const imported = await prisma.mfRentDatasetRelease.findUniqueOrThrow({
        where: { sourceSha256: workbookSha },
      });
      assert.equal(
        await prisma.mfRentTerritorySnapshot.count({
          where: { releaseId: imported.id },
        }),
        7_630,
      );
      const settings = await prisma.appSetting.findUniqueOrThrow({
        where: { id: "global" },
      });
      assert.equal(settings.mfRentLastSuccessAt?.getTime(), syncAt.getTime());
      assert.doesNotMatch(settings.mfRentLastSummary || "", /Neúspěšná/);
    });
    await check("successful same SHA force retry remains idempotent", async () => {
      const retry = await syncMfRentDatasets({ force: true, fetcher });
      assert.equal(retry.newImports, 0);
      assert.equal(retry.idempotentSkips, 2);
      assert.equal(retry.status, "ok");
    });
    await check("failed force sync updates check only and sanitizes summary", async () => {
      const before = await prisma.appSetting.findUniqueOrThrow({
        where: { id: "global" },
      });
      const attemptedAt = new Date(Date.now() + 1_000);
      const releasesBefore = await prisma.mfRentDatasetRelease.count();
      const raw =
        "Invalid prisma invocation Transaction already closed DATABASE_URL=secret";
      const brokenFetcher = (async () => {
        throw new Error(raw);
      }) as typeof fetch;
      await assert.rejects(
        () =>
          syncMfRentDatasets({
            force: true,
            fetcher: brokenFetcher,
            now: attemptedAt,
          }),
        (error: Error) =>
          error.message === "Synchronizace dat MF se nezdařila." &&
          !error.message.includes(raw),
      );
      const after = await prisma.appSetting.findUniqueOrThrow({
        where: { id: "global" },
      });
      assert.equal(after.mfRentLastCheckedAt?.getTime(), attemptedAt.getTime());
      assert.equal(
        after.mfRentLastSuccessAt?.getTime(),
        before.mfRentLastSuccessAt?.getTime(),
      );
      assert.doesNotMatch(after.mfRentLastSummary || "", /prisma|DATABASE_URL|Transaction/i);
      assert.match(after.mfRentLastSummary || "", /Dříve importovaná data zůstávají aktivní/);
      assert.equal(await prisma.mfRentDatasetRelease.count(), releasesBefore);
      assert.ok(
        await prisma.mfRentDatasetRelease.findUnique({
          where: { sourceSha256: workbookSha },
        }),
      );
    });
  }
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
  await check("no category inference from unit label or area", () => {
    assert.doesNotMatch(
      service + location,
      /unit label|areaM2/i,
    );
    assert.match(schema, /disposition\s+UnitDisposition\?/);
    const liveBenchmark = read("lib/reporting/mf-rent/live-benchmark.ts");
    assert.match(liveBenchmark, /dispositionToMfRentCategory/);
    assert.doesNotMatch(liveBenchmark, /unitLabel\s*[).?]*\s*(?:includes|match)|areaM2\s*[).?]*\s*(?:includes|match)/);
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
