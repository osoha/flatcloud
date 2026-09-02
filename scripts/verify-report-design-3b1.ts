import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  flatCloudQuarterly2026Config,
  reportDesignTemplateConfigSchema,
} from "../lib/reporting/design-template-schema";

const root = process.cwd(),
  read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const hash = (file: string) =>
  createHash("sha256").update(read(file)).digest("hex");
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
    adminPreview = read("components/reporting/ReportDesignTemplatePreview.tsx"),
    service = read("lib/reporting/design-template-service.ts"),
    route = read(
      "app/api/report-design-templates/versions/[versionId]/route.ts",
    ),
    page = read("app/reporty/sablony/[versionId]/page.tsx"),
    css = read("app/globals.css"),
    ci = read(".github/workflows/ci.yml");
  check("property presentation uses the real white FlatCloud logo", () => {
    assert.match(
      renderer,
      /<img src="\/flatcloud-logo-white\.png" alt="FlatCloud"\/>/,
    );
    assert.equal(
      (renderer.match(/flatcloud-logo-white\.png/g) || []).length,
      2,
    );
  });
  check("text-only report logo placeholder is absent", () =>
    assert.doesNotMatch(renderer, />FLATCLOUD<\/span>/),
  );
  check("admin preview uses the same actual logo", () => {
    assert.equal(
      (adminPreview.match(/flatcloud-logo-white\.png/g) || []).length,
      2,
    );
    assert.doesNotMatch(adminPreview, />FLATCLOUD<\/div>/);
  });
  check("logo treatment preserves aspect ratio without fake frame", () => {
    assert.match(css, /\.qpr-logo img\{[^}]*object-fit:contain/);
    assert.match(css, /\.qpr-logo\{[^}]*border:0[^}]*background:transparent/);
    assert.match(css, /\.design-logo img\{[^}]*object-fit:contain/);
  });
  check("generated header lower boundary changes diagonally", () => {
    const dark = flatCloudQuarterly2026Config.contentHeader.darkPolygon,
      light = flatCloudQuarterly2026Config.contentHeader.lightPolygon;
    assert.notEqual(dark[2][1], dark[3][1]);
    assert.notEqual(light[2][1], light[3][1]);
    assert.deepEqual(dark, [
      [0, 0],
      [0.655, 0],
      [0.635, 0.183],
      [0, 0.256],
    ]);
    assert.deepEqual(light, [
      [0.655, 0],
      [1, 0],
      [1, 0.139],
      [0.635, 0.183],
    ]);
  });
  check(
    "generated polygons remain normalized through the config schema",
    () => {
      assert.deepEqual(
        reportDesignTemplateConfigSchema.parse(flatCloudQuarterly2026Config),
        flatCloudQuarterly2026Config,
      );
      for (const point of [
        ...flatCloudQuarterly2026Config.contentHeader.darkPolygon,
        ...flatCloudQuarterly2026Config.contentHeader.lightPolygon,
      ])
        for (const coordinate of point)
          assert.ok(coordinate >= 0 && coordinate <= 1);
    },
  );
  check("DRAFT explicitly adopts the current system preset", () => {
    assert.match(service, /applyCurrentFlatCloudPreset/);
    assert.match(service, /const version = await editableVersion/);
    assert.match(service, /data: \{ config: flatCloudQuarterly2026Config \}/);
    assert.match(route, /action === "apply-current-preset"/);
    assert.match(page, /Použít aktuální FlatCloud preset/);
  });
  check("ACTIVE and RETIRED versions cannot adopt a preset", () => {
    assert.match(
      service,
      /if \(version\.status !== "DRAFT"\) throw new Error\("Only DRAFT template versions are editable\."\)/,
    );
    assert.doesNotMatch(
      service.match(/applyCurrentFlatCloudPreset[\s\S]*?\n\}/)?.[0] || "",
      /status:\s*"ACTIVE"|status:\s*"RETIRED"/,
    );
  });
  check("preset adoption preserves page modes and assets", () => {
    const adoption = service.slice(
      service.indexOf("export async function applyCurrentFlatCloudPreset"),
      service.indexOf("export async function setGeneratedTemplateBackground"),
    );
    assert.doesNotMatch(
      adoption,
      /reportDesignTemplatePage|pages:|backgroundMode|backgroundAssetId/,
    );
  });
  check("preset adoption is audited", () =>
    assert.match(service, /REPORT_DESIGN_TEMPLATE_PRESET_APPLIED/),
  );
  check(
    "ASSET background delivery remains unchanged and later trend selection delegates",
    () => {
      assert.equal(
        hash(
          "app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/presentation/backgrounds/[role]/route.ts",
        ),
        "722f0e768649e54eb454e897282ec92adbd346e9ec2845ebe889ab2b993a87aa",
      );
      const presentationData = read(
        "lib/reporting/presentation/quarterly-property-presentation-data.ts",
      );
      assert.match(
        presentationData,
        /additionalCommentary: propertyReport\.additionalCommentary/,
      );
      assert.match(presentationData, /resolveQuarterlyPropertyTrendSeries/);
    },
  );
  check("canonical PDF and storage code remain unchanged", () => {
    assert.equal(
      hash("lib/reporting/pdf/quarterly-report-pdf.tsx"),
      "ae22aeb7e1f81b95bb73ec7dae498811bcdbc380a6c2cd3de40e61d3809b24ff",
    );
    assert.equal(
      hash("lib/reporting/pdf/quarterly-report-pdf-data.ts"),
      "dcca6ef52c3854c225698999aecf9442e49a3bf8cd530bebc2c3a49911f4a86b",
    );
    assert.equal(
      hash("lib/storage/google-drive.ts"),
      "149cc243f8cc8489153e25e86c1c96dc2ae56b8e5432acc8772eb7bbc723587b",
    );
    assert.equal(
      hash("lib/storage/locations.ts"),
      "6eca90cce50ceada1b737885b625a7583cba6b2974a454283b20dbfa41a3fcb9",
    );
  });
  check(
    "Prisma retains the template contract with the later nullable narrative field",
    () => {
      const schema = read("prisma/schema.prisma");
      for (const model of ["ReportDesignTemplate", "ReportDesignTemplateVersion", "ReportDesignTemplatePage"])
        assert.match(schema, new RegExp(`model ${model}`));
      assert.match(
        schema,
        /additionalCommentary\s+String\?/,
      );
    },
  );
  check("3B.1 follows 3B in CI", () =>
    assert.ok(
      ci.includes(
        "      - run: npm run verify:report-design-3b\n      - run: npm run verify:report-design-3b1\n      - run: npm run verify:report-design-3b2\n      - run: npm run verify:report-design-3b3\n      - run: npm run verify:report-design-3b4\n      - run: npm run verify:report-design-4a\n      - run: npm run verify:report-trends-1\n      - run: npm run verify:mf-rent-1\n      - run: npm run build",
      ),
    ),
  );
  console.log(`REPORT-DESIGN-3B.1 verification passed: ${count} checks.`);
}
main();
