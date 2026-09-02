import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { flatCloudQuarterly2026Config } from "../lib/reporting/design-template-schema";

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
  const renderer = read(
      "components/reporting/quarterly-property/QuarterlyPropertyReportDocument.tsx",
    ),
    generated = read(
      "components/reporting/ReportDesignGeneratedBackground.tsx",
    ),
    admin = read("components/reporting/ReportDesignTemplatePreview.tsx"),
    editorial = read("lib/reporting/editorial-schema.ts"),
    css = read("app/globals.css"),
    ci = read(".github/workflows/ci.yml");
  check(
    "generated polygons use an explicit full-page normalized coordinate system",
    () => {
      assert.match(generated, /viewBox="0 0 1 1"/);
      assert.match(generated, /preserveAspectRatio="none"/);
      assert.match(
        css,
        /\.qpr-generated-background\{position:absolute;inset:0;[^}]*width:100%;height:100%/,
      );
    },
  );
  check("left and right lower header endpoints differ", () => {
    const dark = flatCloudQuarterly2026Config.contentHeader.darkPolygon,
      light = flatCloudQuarterly2026Config.contentHeader.lightPolygon;
    assert.equal(dark[3][1], 0.256);
    assert.equal(light[2][1], 0.139);
    assert.notEqual(dark[3][1], light[2][1]);
  });
  check("lower boundary cannot collapse to a horizontal header line", () => {
    const lowerY = [
      flatCloudQuarterly2026Config.contentHeader.darkPolygon[3][1],
      flatCloudQuarterly2026Config.contentHeader.darkPolygon[2][1],
      flatCloudQuarterly2026Config.contentHeader.lightPolygon[3][1],
      flatCloudQuarterly2026Config.contentHeader.lightPolygon[2][1],
    ];
    assert.ok(new Set(lowerY).size >= 3);
    assert.doesNotMatch(
      generated,
      /height:\s*config\.contentHeader\.height|clipPath/,
    );
  });
  check(
    "admin and property previews share the same generated component",
    () => {
      assert.match(
        renderer,
        /<ReportDesignGeneratedBackground config=\{config\}\/?>/,
      );
      assert.match(
        admin,
        /<ReportDesignGeneratedBackground config=\{config\} className="design-generated-background"\/?>/,
      );
    },
  );
  check("technical renderer still consumes technicalSections", () =>
    assert.match(
      renderer,
      /paginateTechnicalSections\(model\.technicalSections\)/,
    ),
  );
  check("technical statuses retain exact semantics", () => {
    for (const status of ["OK", "WATCH", "ACTION", "RISK"])
      assert.match(editorial, new RegExp(`"${status}"`));
  });
  check("technical presentation has no dashboard card chrome", () => {
    assert.doesNotMatch(
      renderer,
      /qpr-technical-card|qpr-technical-item|qpr-technical-accent/,
    );
    assert.match(renderer, /qpr-technical-table/);
    assert.match(
      css,
      /\.qpr-technical-table\{[^}]*gap:0[^}]*border-top:1px solid var\(--qpr-primary\)/,
    );
  });
  check("technical continuation behavior remains deterministic", () => {
    assert.match(renderer, /splitText\(section\.commentary, 320\)/);
    assert.match(renderer, /current\.length === 9/);
    assert.match(renderer, /if \(index > 0\) flush\(\)/);
  });
  check("footer exposes no raw role and keeps period copy", () => {
    const footer =
      renderer.match(/<footer className="qpr-footer"[\s\S]*?<\/footer>/)?.[0] ||
      "";
    assert.doesNotMatch(
      footer,
      /\{role\}|COVER|OVERVIEW|TECHNICAL|VALUATION|TRENDS/,
    );
    assert.match(footer, /Q\{model\.report\.quarter\} \{model\.report\.year\}/);
  });
  check("footer uses readable presentation typography", () => {
    assert.match(
      css,
      /\.qpr-footer\{top:auto!important;bottom:2\.4%;height:2\.8%!important/,
    );
    assert.match(css, /font:550 clamp\(7px,\.76vw,10px\)/);
    assert.match(css, /color:#50677f/);
  });
  check("cover implementation is unchanged", () =>
    assert.equal(
      digest(segment(renderer, "function Cover", "function Overview")),
      "b88a7c413ebd532c481f57d4969a28774140451d95cf5a323a07c5337acbe42b",
    ),
  );
  check("overview implementation is unchanged", () =>
    assert.equal(
      digest(segment(renderer, "function Overview", "function Technical")),
      "feeefc44496e26092c954daf1a7fd88a60069ec46a330740f120e8afa0d6d49d",
    ),
  );
  check("valuation implementation is unchanged", () =>
    assert.equal(
      digest(segment(renderer, "function Valuation", "function MiniChart")),
      "80d070f2f44d0844a9eb5d69971d99eb3ae14dfba5afa932e8421b4f22e6fdd3",
    ),
  );
  check(
    "trend renderer remains unchanged while later selection delegates",
    () => {
      assert.equal(
        digest(
          segment(renderer, "function Trends", "function AdditionalCommentary"),
        ),
        "c2c5ba45e04b337b5119419ee54533521d233a3b883a8e79de06f08f7e379df2",
      );
      assert.match(
        read(
          "lib/reporting/presentation/quarterly-property-presentation-data.ts",
        ),
        /resolveQuarterlyPropertyTrendSeries/,
      );
    },
  );
  check("canonical PDF remains protected", () => {
    assert.equal(
      hash("lib/reporting/pdf/quarterly-report-pdf.tsx"),
      "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff",
    );
    assert.equal(
      hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"),
      "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b",
    );
  });
  check(
    "storage remains protected and Prisma has only the later nullable narrative",
    () => {
      assert.equal(
        hash("lib/storage/google-drive.ts"),
        "149cc243f8cc8489153e25e86c1c96dc2ae56b8e5432acc8772eb7bbc723587b",
      );
      assert.equal(
        hash("lib/storage/locations.ts"),
        "6eca90cce50ceada1b737885b625a7583cba6b2974a454283b20dbfa41a3fcb9",
      );
      const schema = read("prisma/schema.prisma");
      assert.match(schema, /model ReportDesignTemplatePage/);
      assert.match(schema, /backgroundAssetId\s+String\?/);
      assert.match(schema, /backgroundMode\s+ReportDesignBackgroundMode/);
    },
  );
  check("3B.2 follows 3B.1 in CI", () =>
    assert.ok(
      ci.includes(
        "      - run: npm run verify:report-design-3b1\n      - run: npm run verify:report-design-3b2\n      - run: npm run verify:report-design-3b3\n      - run: npm run verify:report-design-3b4\n      - run: npm run verify:report-design-4a\n      - run: npm run verify:report-trends-1\n      - run: npm run verify:mf-rent-1\n      - run: npm run verify:portfolio-deposit-polish\n      - run: npm run build",
      ),
    ),
  );
  console.log(`REPORT-DESIGN-3B.2 verification passed: ${count} checks.`);
}
main();
