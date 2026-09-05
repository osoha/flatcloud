import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { paginateNarrativeText } from "../components/reporting/quarterly-property/QuarterlyPropertyReportDocument";
import { correctionPropertyData } from "../lib/reporting/quarterly-report-service";

const root = process.cwd(),
  read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const hash = (file: string) => digest(read(file));
const segment = (source: string, start: string, end: string) =>
  source.slice(source.indexOf(start), source.indexOf(end));
let count = 0;
function check(name: string, test: () => void) {
  test();
  count += 1;
  console.log(`✓ ${count}. ${name}`);
}

function main() {
  const schema = read("prisma/schema.prisma"),
    migration = read(
      "prisma/migrations/20260901160000_report_design_3b4_additional_commentary/migration.sql",
    ),
    editorial = read("lib/reporting/editorial-schema.ts"),
    editor = read("components/QuarterlyPropertyEditorialEditor.tsx"),
    workspace = read(
      "components/quarterly-report-workspace/QuarterlyReportPropertyWorkspace.tsx",
    ),
    route = read(
      "app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/properties/[propertyId]/content/route.ts",
    ),
    service = read("lib/reporting/quarterly-report-service.ts"),
    renderer = read(
      "components/reporting/quarterly-property/QuarterlyPropertyReportDocument.tsx",
    ),
    model = read(
      "lib/reporting/presentation/quarterly-property-presentation-model.ts",
    ),
    loader = read(
      "lib/reporting/presentation/quarterly-property-presentation-data.ts",
    ),
    css = read("app/globals.css"),
    quality = read("lib/reporting/quarterly-quality-gate.ts"),
    ci = read(".github/workflows/ci.yml");
  check("Prisma field is nullable and property-report scoped", () => {
    assert.match(
      schema,
      /model QuarterlyPropertyReport \{[\s\S]*additionalCommentary\s+String\?/,
    );
    assert.doesNotMatch(
      segment(schema, "model Property {", "model Unit {"),
      /additionalCommentary/,
    );
  });
  check("migration is additive and nullable", () => {
    assert.match(
      migration,
      /ALTER TABLE "QuarterlyPropertyReport"[\s\S]*ADD COLUMN "additionalCommentary" TEXT/,
    );
    assert.doesNotMatch(migration, /NOT NULL|DROP|DELETE|UPDATE/i);
  });
  check("DRAFT editor has the optional bounded textarea and helper", () => {
    assert.match(editor, /Doplňující komentář/);
    assert.match(
      editor,
      /name="additionalCommentary"[\s\S]*maxLength=\{10000\}/,
    );
    assert.match(
      editor,
      /Pokud zůstane prázdný, stránka se do reportu nevloží/,
    );
    assert.match(workspace, /editable \? <QuarterlyPropertyEditorialEditor/);
  });
  check(
    "content route validates and persists the field through the DRAFT-only service",
    () => {
      assert.match(
        route,
        /additionalCommentary: text\(form, "additionalCommentary"\)/,
      );
      assert.match(
        editorial,
        /additionalCommentary: optionalText\(10000\)\.optional\(\)\.default\(null\)/,
      );
      assert.match(
        service,
        /if \(report\.status !== "DRAFT"\) throw new Error\("Editorial content can only change in DRAFT\."\)/,
      );
      assert.match(
        service,
        /additionalCommentary: content\.additionalCommentary/,
      );
    },
  );
  check("null and empty commentary render no page", () => {
    assert.deepEqual(paginateNarrativeText(""), []);
    assert.deepEqual(paginateNarrativeText("   \n\t  "), []);
  });
  check("defined commentary is appended after Trends", () => {
    assert.match(model, /additionalCommentary: string \| null/);
    assert.match(
      loader,
      /additionalCommentary: propertyReport\.additionalCommentary/,
    );
    assert.match(
      renderer,
      /<Trends model=\{model\}\/?>\s*<AdditionalCommentary model=\{model\}\/?>/,
    );
  });
  check(
    "narrative pages use the requested heading and generated content treatment",
    () => {
      assert.match(renderer, /title="Doplňující komentář"/);
      assert.match(renderer, /role="TRENDS"[\s\S]*forceGenerated/);
      assert.match(renderer, /config\.pages\.TRENDS\.bodyRect/);
    },
  );
  check("paragraph breaks are preserved", () => {
    assert.deepEqual(
      paginateNarrativeText("První odstavec.\n\nDruhý odstavec."),
      ["První odstavec.\n\nDruhý odstavec."],
    );
    assert.match(
      css,
      /\.qpr-additional-commentary p\{[^}]*white-space:pre-wrap/,
    );
  });
  check(
    "long text continuation is deterministic and layout-capacity based",
    () => {
      const text = Array.from(
          { length: 900 },
          (_, index) => `slovo${index}`,
        ).join(" "),
        first = paginateNarrativeText(text),
        second = paginateNarrativeText(text);
      assert.deepEqual(first, second);
      assert.ok(first.length > 1);
      assert.ok(first.every((page) => page.split("\n").length <= 30));
      assert.match(renderer, /narrativeLineCapacity = 30/);
      assert.match(renderer, /narrativeCharactersPerLine = 115/);
      assert.match(renderer, /pokračování/);
    },
  );
  check("correction data clones commentary exactly", () => {
    const value = "První odstavec.\n\nDruhý odstavec.";
    const cloned = correctionPropertyData({
      propertyId: "property",
      propertyNameSnapshot: "Name",
      propertyAddressSnapshot: "Address",
      snapshotId: "snapshot",
      propertyStatus: null,
      managementCommentary: null,
      additionalCommentary: value,
      technicalSections: [],
      valuationRows: [],
    });
    assert.equal(cloned.additionalCommentary, value);
  });
  check("absence does not affect quality gate or completion", () => {
    assert.doesNotMatch(quality, /additionalCommentary/);
    assert.doesNotMatch(
      segment(
        read("app/reporty/kvartalni/[groupId]/reporty/[reportId]/page.tsx"),
        "function completionState",
        "export default",
      ),
      /additionalCommentary/,
    );
  });
  check("five-role template contract is unchanged", () => {
    const roleBlock =
      schema.match(/enum ReportDesignPageRole \{([\s\S]*?)\}/)?.[1] || "";
    assert.deepEqual(roleBlock.match(/\b[A-Z]+\b/g), [
      "COVER",
      "OVERVIEW",
      "TECHNICAL",
      "VALUATION",
      "TRENDS",
    ]);
    assert.doesNotMatch(schema, /ADDITIONAL_COMMENTARY/);
  });
  check(
    "cover parity is explicit while overview technical valuation and trends remain unchanged",
    () => {
      const cover = segment(renderer, "function Cover", "function Overview");
      assert.match(cover, /coverNarrativeRect/);
      assert.match(cover, /qpr-cover-stack/);
      assert.equal(
        digest(segment(renderer, "function Overview", "function Technical")),
        "e885a4ecd9ef9ab4c47977214732f530cd9423f10cc8e62d547b68f3a9bc1e6d",
      );
      assert.equal(
        digest(segment(renderer, "function Technical", "function Valuation")),
        "c7db68e263c926516fc1fddc4c014028e340b32a4b7d71fd05662d8ec1bbf13e",
      );
      assert.equal(
        digest(segment(renderer, "function Valuation", "function MiniChart")),
        "cacd994b9085d2d7fc37d313a3eb615e9bc44385e448c6e7ce978c85b59dc2bf",
      );
      assert.equal(
        digest(
          segment(renderer, "function Trends", "function AdditionalCommentary"),
        ),
        "0befe7282ff397ac5d0d73debd2d75b0fa4f5372043f68bdb6ebba62e1267c15",
      );
    },
  );
  check("storage and canonical PDF remain protected", () => {
    assert.equal(
      hash("lib/storage/google-drive.ts"),
      "149cc243f8cc8489153e25e86c1c96dc2ae56b8e5432acc8772eb7bbc723587b",
    );
    assert.equal(
      hash("lib/storage/locations.ts"),
      "6eca90cce50ceada1b737885b625a7583cba6b2974a454283b20dbfa41a3fcb9",
    );
    assert.equal(
      hash("lib/reporting/pdf/quarterly-report-pdf.tsx"),
      "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff",
    );
    assert.equal(
      hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"),
      "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b",
    );
  });
  check("3B.4 runs after 3B.3 and before build", () =>
    assert.ok(
      ci.includes(
        "      - run: npm run verify:report-design-3b3\n      - run: npm run verify:report-design-3b4\n      - run: npm run verify:report-design-4a\n      - run: npm run verify:report-trends-1\n      - run: npm run verify:mf-rent-1\n      - run: npm run verify:portfolio-deposit-polish\n      - run: npm run build",
      ),
    ),
  );
  console.log(`REPORT-DESIGN-3B.4 verification passed: ${count} checks.`);
}
main();
