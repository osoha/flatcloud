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
    "cover overview technical valuation and trends remain unchanged",
    () => {
      assert.equal(
        digest(segment(renderer, "function Cover", "function Overview")),
        "b88a7c413ebd532c481f57d4969a28774140451d95cf5a323a07c5337acbe42b",
      );
      assert.equal(
        digest(segment(renderer, "function Overview", "function Technical")),
        "feeefc44496e26092c954daf1a7fd88a60069ec46a330740f120e8afa0d6d49d",
      );
      assert.equal(
        digest(segment(renderer, "function Technical", "function Valuation")),
        "e1c6fe66c4e24f9bca4442180376833f8f7101e008071001401e2f2ca9094ac6",
      );
      assert.equal(
        digest(segment(renderer, "function Valuation", "function MiniChart")),
        "80d070f2f44d0844a9eb5d69971d99eb3ae14dfba5afa932e8421b4f22e6fdd3",
      );
      assert.equal(
        digest(
          segment(renderer, "function Trends", "function AdditionalCommentary"),
        ),
        "c2c5ba45e04b337b5119419ee54533521d233a3b883a8e79de06f08f7e379df2",
      );
    },
  );
  check("storage and canonical PDF remain protected", () => {
    assert.equal(
      hash("lib/storage/google-drive.ts"),
      "50d0988f0b1215fc3d0ffe13d0ed5cebbc666e31d999799cce58cc8fceb5eb4b",
    );
    assert.equal(
      hash("lib/storage/locations.ts"),
      "676e036c2fb1202650525e0e43424ae4840d16d476c0c436317d5346f8b2d9f8",
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
        "      - run: npm run verify:report-design-3b3\n      - run: npm run verify:report-design-3b4\n      - run: npm run verify:report-design-4a\n      - run: npm run verify:report-trends-1\n      - run: npm run verify:mf-rent-1\n      - run: npm run build",
      ),
    ),
  );
  console.log(`REPORT-DESIGN-3B.4 verification passed: ${count} checks.`);
}
main();
