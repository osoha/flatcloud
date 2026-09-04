import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import sharp from "sharp";
import { flatCloudQuarterly2026Config } from "../lib/reporting/design-template-schema";
import type { QuarterlyPropertyPresentation } from "../lib/reporting/presentation/quarterly-property-presentation-model";
import {
  buildQuarterlyPropertyPdfPagePlan,
  paginatePdfNarrative,
  PDF_TECHNICAL_CELLS_PER_PAGE,
  PDF_VALUATION_ROWS_PER_PAGE,
} from "../lib/reporting/presentation/pdf/quarterly-property-pdf-plan";

const root = process.cwd(),
  read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const hash = (file: string) =>
  createHash("sha256")
    .update(fs.readFileSync(path.join(root, file)))
    .digest("hex");
let count = 0;
function check(name: string, test: () => void | Promise<void>) {
  return Promise.resolve()
    .then(test)
    .then(() => {
      count++;
      console.log(`✓ ${count}. ${name}`);
    });
}
function renderedPageMediaBoxes(bytes: Uint8Array) {
  const source = Buffer.from(bytes).toString("latin1");
  const pages = [
    ...source.matchAll(
      /\/Type\s*\/Page\b[\s\S]*?\/MediaBox\s*\[\s*([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s*\]/g,
    ),
  ];
  return pages.map((match) => ({
    width: Number(match[3]) - Number(match[1]),
    height: Number(match[4]) - Number(match[2]),
  }));
}
function renderedPageContentStreams(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes),
    source = buffer.toString("latin1");
  const pages = [
    ...source.matchAll(
      /\d+ 0 obj\s*<<[\s\S]*?\/Type\s*\/Page\b[\s\S]*?\/Contents\s+(\d+)\s+0\s+R[\s\S]*?endobj/g,
    ),
  ];
  return pages.map((page) => {
    const object = new RegExp(
      `${page[1]} 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n`,
    ).exec(source);
    assert.ok(object, `content stream ${page[1]} must exist`);
    const start = object.index + object[0].length,
      end = source.indexOf("endstream", start);
    let data: Uint8Array = buffer.subarray(start, end);
    while (data.at(-1) === 10 || data.at(-1) === 13)
      data = data.subarray(0, -1);
    if (/\/FlateDecode/.test(object[1])) data = inflateSync(data);
    return Buffer.from(data).toString("latin1");
  });
}
const backgrounds = Object.fromEntries(
  ["COVER", "OVERVIEW", "TECHNICAL", "VALUATION", "TRENDS"].map((role) => [
    role,
    { role, mode: "GENERATED", imageUrl: null },
  ]),
) as QuarterlyPropertyPresentation["template"]["backgrounds"];
const baseModel: QuarterlyPropertyPresentation = {
  report: {
    id: "report",
    groupId: "group",
    year: 2026,
    quarter: 3,
    status: "DRAFT",
  },
  property: {
    id: "property",
    name: "Karla Aksamita",
    address: "Praha",
    status: "STABILIZED",
  },
  template: {
    id: "version",
    name: "FlatCloud",
    version: 1,
    config: flatCloudQuarterly2026Config,
    backgrounds,
  },
  media: { primary: null, supportive: null },
  managementCommentary: "Komentář managementu.",
  additionalCommentary: null,
  technicalSections: [],
  valuationRows: [],
  valuationTotalCents: 0,
  trends: [],
};
const imageModel: QuarterlyPropertyPresentation = {
  ...baseModel,
  media: {
    primary: {
      id: "primary",
      caption: "Hlavní fotografie",
      imageUrl: "server-only",
    },
    supportive: {
      id: "supportive",
      caption: "Doplňková fotografie",
      imageUrl: "server-only",
    },
  },
  managementCommentary:
    "Nemovitost je stabilizovaná a správa pokračuje podle schváleného plánu.",
  technicalSections: Array.from({ length: 9 }, (_, index) => ({
    title: `Technická oblast ${index + 1}`,
    commentary: "Stav byl prověřen.",
    status: "OK" as const,
  })),
  valuationRows: Array.from({ length: 4 }, (_, index) => ({
    kind: "UNIT" as const,
    unitLabel: `Jednotka ${index + 1}`,
    disposition: "2+kk",
    floor: `${index + 1}. NP`,
    areaM2: 52 + index,
    amountCents: 600_000_000 + index * 10_000_000,
  })),
  valuationTotalCents: 2_460_000_000,
  trends: [
    {
      label: "Q3 2026",
      occupancyPercent: 98,
      monthlyNetRentCents: 1_200_000,
      weightedNetRentPerM2Cents: null,
      collectionRatePercent: 99,
      overdueDebtCents: 0,
    },
  ],
};
const model = (changes: Partial<QuarterlyPropertyPresentation> = {}) => ({
  ...baseModel,
  ...changes,
});
const kinds = (value: QuarterlyPropertyPresentation) =>
  buildQuarterlyPropertyPdfPagePlan(value).map((page) => page.kind);
async function renderWithoutWarnings(render: () => Promise<Uint8Array>) {
  const warnings: string[] = [],
    originalWarn = console.warn,
    originalError = console.error;
  console.warn = (...values: unknown[]) =>
    warnings.push(values.map(String).join(" "));
  console.error = (...values: unknown[]) =>
    warnings.push(values.map(String).join(" "));
  try {
    return { bytes: await render(), warnings };
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}
async function syntheticPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
) {
  const bytes = await sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function main() {
  const schema = read("prisma/schema.prisma"),
    renderer = read(
      "lib/reporting/presentation/pdf/QuarterlyPropertyLandscapePdfDocument.tsx",
    ),
    assets = read(
      "lib/reporting/presentation/pdf/quarterly-property-pdf-assets.ts",
    ),
    service = read(
      "lib/reporting/presentation/pdf/quarterly-property-pdf-service.ts",
    ),
    route = read(
      "app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/presentation/pdf/route.ts",
    ),
    ci = read(".github/workflows/ci.yml"),
    quality = read("lib/reporting/quarterly-quality-gate.ts"),
    loader = read(
      "lib/reporting/presentation/quarterly-property-presentation-data.ts",
    );
  await check("Prisma report-design contracts remain intact for RD4A", () => {
    const schema = read("prisma/schema.prisma");
    assert.match(schema, /designTemplateVersionId\s+String\?/);
    assert.match(schema, /designTemplateVersion\s+ReportDesignTemplateVersion\?/);
    assert.match(schema, /model ReportDesignTemplatePage/);
  });
  await check("RD4A adds no migration", () =>
    assert.equal(
      fs
        .readdirSync(path.join(root, "prisma/migrations"))
        .filter((name) => /4a/i.test(name)).length,
      0,
    ),
  );
  await check("dedicated landscape renderer exists", () =>
    assert.match(renderer, /QuarterlyPropertyLandscapePdfDocument/),
  );
  await check("renderer uses React PDF", () =>
    assert.match(renderer, /from "@react-pdf\/renderer"/),
  );
  await check("renderer uses one explicit A4 landscape size", () => {
    assert.match(
      renderer,
      /A4_LANDSCAPE_PAGE_SIZE = \{ width: A4_LANDSCAPE_WIDTH, height: A4_LANDSCAPE_HEIGHT \}/,
    );
    assert.match(
      renderer,
      /page: \{ width: A4_LANDSCAPE_WIDTH, height: A4_LANDSCAPE_HEIGHT/,
    );
    assert.equal(renderer.match(/size=\{A4_LANDSCAPE_PAGE_SIZE\}/g)?.length, 2);
    assert.doesNotMatch(renderer, /size="A4"|orientation="landscape"/);
  });
  await check("HTML renderer remains protected", () =>
    assert.equal(
      hash(
        "components/reporting/quarterly-property/QuarterlyPropertyReportDocument.tsx",
      ),
      "15b7b476b210c393733274da38739fafa351c24b94e7c275bf01f2df11c5b367",
    ),
  );
  await check(
    "semantic loader consumes the later reusable trend resolver",
    () => assert.match(loader, /resolveQuarterlyPropertyTrendSeries/),
  );
  await check("page plan starts with Cover", () =>
    assert.equal(kinds(baseModel)[0], "COVER"),
  );
  await check("Overview follows Cover", () =>
    assert.equal(kinds(baseModel)[1], "OVERVIEW"),
  );
  await check("Technical follows Overview", () =>
    assert.equal(kinds(baseModel)[2], "TECHNICAL"),
  );
  await check("Valuation follows Technical", () =>
    assert.equal(kinds(baseModel)[3], "VALUATION"),
  );
  await check("Trends follows Valuation", () =>
    assert.equal(kinds(baseModel)[4], "TRENDS"),
  );
  await check("null commentary adds no page", () =>
    assert.doesNotMatch(
      kinds(model({ additionalCommentary: null })).join(),
      /ADDITIONAL/,
    ),
  );
  await check("empty commentary adds no page", () =>
    assert.doesNotMatch(
      kinds(model({ additionalCommentary: "" })).join(),
      /ADDITIONAL/,
    ),
  );
  await check("whitespace commentary adds no page", () =>
    assert.doesNotMatch(
      kinds(model({ additionalCommentary: " \n\t" })).join(),
      /ADDITIONAL/,
    ),
  );
  await check("defined commentary follows Trends", () =>
    assert.deepEqual(kinds(model({ additionalCommentary: "Text" })).slice(-2), [
      "TRENDS",
      "ADDITIONAL_COMMENTARY",
    ]),
  );
  await check("long commentary continuation is deterministic", () => {
    const value = Array.from({ length: 1500 }, (_, i) => `slovo${i}`).join(" ");
    assert.deepEqual(paginatePdfNarrative(value), paginatePdfNarrative(value));
    assert.ok(paginatePdfNarrative(value).length > 1);
  });
  await check("paragraph breaks are preserved", () =>
    assert.equal(
      paginatePdfNarrative("První.\n\nDruhý.")[0],
      "První.\n\nDruhý.",
    ),
  );
  await check("technical limit is nine", () =>
    assert.equal(PDF_TECHNICAL_CELLS_PER_PAGE, 9),
  );
  await check("technical plan never exceeds nine cells", () => {
    const technicalSections = Array.from({ length: 20 }, (_, i) => ({
      title: `T${i}`,
      commentary: "Text",
      status: "OK" as const,
    }));
    assert.ok(
      buildQuarterlyPropertyPdfPagePlan(model({ technicalSections }))
        .filter((p) => p.kind === "TECHNICAL")
        .every((p) => p.kind === "TECHNICAL" && p.sections.length <= 9),
    );
  });
  await check("technical renderer is three-column blue-band ruled grid", () => {
    assert.match(renderer, /width: "33\.333%"/);
    assert.match(renderer, /technicalBand/);
    assert.match(renderer, /backgroundColor: config\.brand\.primary/);
    assert.match(renderer, /borderWidth/);
  });
  await check("valuation limit is twelve", () =>
    assert.equal(PDF_VALUATION_ROWS_PER_PAGE, 12),
  );
  await check("valuation plan never exceeds twelve rows", () => {
    const valuationRows = Array.from({ length: 25 }, (_, i) => ({
      kind: "UNIT" as const,
      unitLabel: `U${i}`,
      disposition: null,
      floor: null,
      areaM2: null,
      amountCents: i,
    }));
    assert.ok(
      buildQuarterlyPropertyPdfPagePlan(model({ valuationRows }))
        .filter((p) => p.kind === "VALUATION")
        .every((p) => p.kind === "VALUATION" && p.rows.length <= 12),
    );
  });
  await check("trends consume model trend points", () => {
    assert.match(renderer, /PresentationTrendPoint/);
    assert.match(renderer, /model\.trends/);
    assert.doesNotMatch(renderer, /prisma\./);
  });
  await check("empty trends retain accepted state", () =>
    assert.match(renderer, /Historická data zatím nejsou dostupná/),
  );
  await check("generated polygons come from template config", () => {
    assert.match(renderer, /config\.contentHeader\.darkPolygon/);
    assert.match(renderer, /config\.contentHeader\.lightPolygon/);
  });
  await check(
    "generated header owns a full-width explicit SVG viewport",
    () => {
      const header = renderer.slice(
        renderer.indexOf("function GeneratedHeader"),
        renderer.indexOf("function ContentHeaderLabels"),
      );
      assert.match(
        header,
        /const headerHeight = config\.contentHeader\.height \* A4_LANDSCAPE_HEIGHT/,
      );
      assert.match(
        header,
        /<Svg width=\{A4_LANDSCAPE_WIDTH\} height=\{headerHeight\} preserveAspectRatio="none"/,
      );
      assert.match(header, /left: 0, top: 0/);
      assert.doesNotMatch(header, /margin|padding/);
    },
  );
  await check("actual white logo is repository-local", () =>
    assert.match(assets, /public.*, "flatcloud-logo-white\.png"/),
  );
  await check("media resolves through QuarterlyPropertyReportMedia", () => {
    assert.match(assets, /quarterlyPropertyReport\.findFirst/);
    assert.match(assets, /media:/);
    assert.doesNotMatch(assets, /prisma\.property\./);
  });
  await check("background resolves from assigned template version", () =>
    assert.match(assets, /quarterlyReport:[\s\S]*designTemplateVersion/),
  );
  await check(
    "assets reuse one server-side storage reader concurrently",
    () => {
      assert.equal(assets.match(/createFileStorage\(\)/g)?.length, 1);
      assert.match(assets, /storage\.getObject/);
      assert.match(assets, /Promise\.all/);
    },
  );
  await check("RD4A performs no storage writes", () =>
    assert.doesNotMatch(
      `${assets}\n${service}\n${renderer}`,
      /putObject|deleteObject/,
    ),
  );
  await check("RD4A performs no FileAsset create", () =>
    assert.doesNotMatch(
      `${assets}\n${service}\n${renderer}`,
      /fileAsset\.create/,
    ),
  );
  await check("RD4A performs no published asset mutation", () =>
    assert.doesNotMatch(
      `${assets}\n${service}\n${renderer}`,
      /publishedAssetId|REPORT_PUBLISHED_ASSET_GENERATED/,
    ),
  );
  await check("service matches backoffice authorization", () => {
    assert.match(service, /backofficePermissionForGroup/);
    assert.match(service, /canReadReportingBackoffice/);
  });
  await check("route is group report property scoped", () =>
    assert.match(route, /groupId, reportId, propertyId/),
  );
  await check("response is PDF", () =>
    assert.match(route, /"Content-Type": preview\.mimeType/),
  );
  await check("WIP response downloads as an attachment", () =>
    assert.match(route, /"Content-Disposition": `attachment;/),
  );
  await check("response is private no-store", () =>
    assert.match(route, /"Cache-Control": "private, no-store"/),
  );
  await check("route does not expose storage keys", () =>
    assert.doesNotMatch(route, /storageKey|provider|OAuth|stack/),
  );
  await check("DRAFT preview has no status gate", () =>
    assert.doesNotMatch(service, /status.*DRAFT|DRAFT.*status/),
  );
  await check("REVIEW preview has no status gate", () =>
    assert.doesNotMatch(service, /status.*REVIEW|REVIEW.*status/),
  );
  await check("PUBLISHED preview has no status gate", () =>
    assert.doesNotMatch(service, /status.*PUBLISHED|PUBLISHED.*status/),
  );
  await check(
    "synthetic multi-page render has valid geometry and content",
    async () => {
      const { renderQuarterlyPropertyLandscapePdf } = await import(
        "../lib/reporting/presentation/pdf/QuarterlyPropertyLandscapePdfDocument"
      );
      const bytes = await renderQuarterlyPropertyLandscapePdf(baseModel, {
        logo: path.join(root, "public/flatcloud-logo-white.png"),
        primary: null,
        supportive: null,
        backgrounds: {},
      });
      const expectedPages = buildQuarterlyPropertyPdfPagePlan(baseModel).length,
        boxes = renderedPageMediaBoxes(bytes),
        source = Buffer.from(bytes).toString("latin1");
      if (process.env.RD4A_SMOKE_OUTPUT)
        fs.writeFileSync(process.env.RD4A_SMOKE_OUTPUT, bytes);
      assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
      assert.ok(bytes.length > 1000);
      assert.equal(boxes.length, expectedPages);
      assert.equal(expectedPages, 5);
      assert.match(source, /stream\r?\n/);
      for (const box of boxes) {
        assert.ok(Math.abs(box.width - 841.89) < 0.02, JSON.stringify(box));
        assert.ok(Math.abs(box.height - 595.28) < 0.02, JSON.stringify(box));
        assert.ok(box.width > box.height, JSON.stringify(box));
        assert.ok(box.height > 0, JSON.stringify(box));
      }
    },
  );
  await check(
    "image-bearing cover and overview add no physical pages",
    async () => {
      const { renderQuarterlyPropertyLandscapePdf } = await import(
        "../lib/reporting/presentation/pdf/QuarterlyPropertyLandscapePdfDocument"
      );
      const expectedPages =
        buildQuarterlyPropertyPdfPagePlan(imageModel).length;
      const [primary, supportive] = await Promise.all([
        syntheticPng(500, 750, { r: 55, g: 105, b: 145 }),
        syntheticPng(900, 500, { r: 115, g: 155, b: 105 }),
      ]);
      const { bytes, warnings } = await renderWithoutWarnings(() =>
        renderQuarterlyPropertyLandscapePdf(imageModel, {
          logo: path.join(root, "public/flatcloud-logo-white.png"),
          primary,
          supportive,
          backgrounds: {},
        }),
      );
      const boxes = renderedPageMediaBoxes(bytes),
        source = Buffer.from(bytes).toString("latin1"),
        streams = renderedPageContentStreams(bytes);
      assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
      assert.equal(expectedPages, 5);
      assert.equal(boxes.length, expectedPages);
      assert.match(source, /stream\r?\n/);
      assert.deepEqual(
        warnings,
        [],
        `React-PDF emitted warnings: ${warnings.join(" | ")}`,
      );
      assert.ok(
        (source.match(/\/Subtype\s*\/Image/g) || []).length >= 3,
        "cover/supportive/logo image resources must exist",
      );
      assert.ok(
        (streams[0].match(/\/I\d+ Do/g) || []).length >= 2,
        "cover image and logo must draw in the first page stream",
      );
      assert.ok(
        (streams[0].match(/\bBT\b/g) || []).length >= 6,
        "cover title/address/period text must draw in the first page stream",
      );
      assert.match(
        streams[1],
        /0\.84189\s+0\s+0\s+0\.59528\s+0\s+0\s+cm/,
        "generated header must map its 1000-unit viewport to the full physical page width",
      );
      for (const box of boxes) {
        assert.ok(Math.abs(box.width - 841.89) < 0.02, JSON.stringify(box));
        assert.ok(Math.abs(box.height - 595.28) < 0.02, JSON.stringify(box));
        assert.ok(box.width > box.height);
        assert.ok(box.height > 0);
      }
      if (process.env.RD4A_IMAGE_SMOKE_OUTPUT)
        fs.writeFileSync(process.env.RD4A_IMAGE_SMOKE_OUTPUT, bytes);
    },
  );
  await check(
    "cover primitives are fixed and removed from pagination flow",
    () => {
      const cover = renderer.slice(
        renderer.indexOf("function Cover"),
        renderer.indexOf("function Overview"),
      );
      assert.match(cover, /<Image fixed src=\{assets\.primary\}/);
      assert.match(cover, /<Image fixed src=\{assets\.logo\}/);
      assert.match(cover, /<View fixed style=/);
      assert.match(cover, /<Text fixed style=/);
      assert.doesNotMatch(cover, /pageCanvas|wrap=\{false\}/);
      assert.doesNotMatch(cover, /<Page[^>]*wrap=\{false\}/);
    },
  );
  await check("React-PDF conditionals contain no explicit space children", () =>
    assert.doesNotMatch(renderer, /\/>\}\x20+\{/),
  );
  await check("optional missing photos render placeholders", () => {
    assert.match(renderer, /Fotografie není k dispozici/);
    assert.match(renderer, /Podpůrná fotografie není k dispozici/);
  });
  await check("canonical PDF renderer protected", () =>
    assert.equal(
      hash("lib/reporting/pdf/quarterly-report-pdf.tsx"),
      "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff",
    ),
  );
  await check("canonical PDF loader protected", () =>
    assert.equal(
      hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"),
      "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b",
    ),
  );
  await check("canonical report asset service protected", () =>
    assert.equal(
      hash("lib/reporting/report-asset-service.ts"),
      "0b899638eda52df007a99e71052b30600a84eecac7d5d3f35a0528f0811af897",
    ),
  );
  await check("Google Drive implementation protected", () =>
    assert.equal(
      hash("lib/storage/google-drive.ts"),
      "149cc243f8cc8489153e25e86c1c96dc2ae56b8e5432acc8772eb7bbc723587b",
    ),
  );
  await check("storage locations protected", () =>
    assert.equal(
      hash("lib/storage/locations.ts"),
      "6eca90cce50ceada1b737885b625a7583cba6b2974a454283b20dbfa41a3fcb9",
    ),
  );
  await check("quality gate protected", () =>
    assert.equal(
      hash("lib/reporting/quarterly-quality-gate.ts"),
      "bee943a48d16afe527c3f9340947821022d98794066134ff7783dea3d2f4fcf1",
    ),
  );
  await check(
    "later trend foundation leaves RD4A rendering ownership intact",
    () => {
      assert.match(loader, /resolveQuarterlyPropertyTrendSeries/);
      assert.doesNotMatch(loader, /MiniChart|Svg|Path/);
    },
  );
  await check("there is no sixth page role", () => {
    const roles = schema
      .match(/enum ReportDesignPageRole \{([\s\S]*?)\}/)?.[1]
      .match(/\b[A-Z]+\b/g);
    assert.deepEqual(roles, [
      "COVER",
      "OVERVIEW",
      "TECHNICAL",
      "VALUATION",
      "TRENDS",
    ]);
  });
  await check("4A CI ordering is after 3B4 and before later checks/build", () => {
    const prior = ci.indexOf("npm run verify:report-design-3b4");
    const design4a = ci.indexOf("npm run verify:report-design-4a");
    const trends = ci.indexOf("npm run verify:report-trends-1");
    const build = ci.indexOf("npm run build");
    assert.ok(prior < design4a && design4a < trends && trends < build);
  });
  await check("HTML global styles are protected", () =>
    assert.equal(
      hash("app/globals.css"),
      "84b867949b8cfacdf16f3c5330a4876af6536b240d753fc91f88fa2deebb724e",
    ),
  );
  await check(
    "presentation model only gains later weighted-rent trend data",
    () =>
      assert.match(
        read(
          "lib/reporting/presentation/quarterly-property-presentation-model.ts",
        ),
        /weightedNetRentPerM2Cents/,
      ),
  );
  console.log(`REPORT-DESIGN-4A verification passed: ${count} checks.`);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
