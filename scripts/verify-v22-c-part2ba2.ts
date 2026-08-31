import assert from "node:assert/strict";
import fs from "node:fs";
import { quarterlyReportQualityGate } from "../lib/reporting/quarterly-quality-gate";

let count = 0;

function check(name: string, fn: () => void) {
  fn();
  count += 1;
  console.log(`✓ ${count}. ${name}`);
}

const read = (path: string) => fs.readFileSync(path, "utf8");

check(
  "quality gate counts INFO/WARNING/BLOCKER and invalid quality safely",
  () => {
    const gate = quarterlyReportQualityGate([
      {
        propertyId: "p1",
        quality: {
          issues: [
            {
              code: "MISSING_UNIT_AREA",
              severity: "INFO",
              message: "i",
            },
            {
              code: "MISSING_RENT_SOURCE",
              severity: "WARNING",
              message: "w",
            },
            {
              code: "NO_RENTABLE_UNITS",
              severity: "BLOCKER",
              message: "b",
            },
          ],
        },
      },
      { propertyId: "p2", quality: { broken: true } },
    ]);

    assert.equal(gate.infoCount, 1);
    assert.equal(gate.warningCount, 1);
    assert.equal(gate.blockerCount, 2);
    assert.equal(gate.invalidQualityCount, 1);
    assert.equal(gate.issues[0].propertyId, "p1");
  },
);

check(
  "service enforces blocker gate and current-review warning acknowledgement",
  () => {
    const service = read("lib/reporting/quarterly-report-service.ts");

    assert.match(service, /REPORT_WARNINGS_ACKNOWLEDGED/);
    assert.match(service, /Report has blocking data quality issues/);
    assert.match(
      service,
      /Report warnings must be acknowledged before publication/,
    );
    assert.match(service, /createdAt: \{ gte: reviewStartedAt \}/);
    assert.match(service, /qualityWarningCount/);
  },
);

check(
  "workspace exposes gated publish, acknowledgement and immutable correction flow",
  () => {
    const page = read(
      "app/reporty/kvartalni/[groupId]/reporty/[reportId]/page.tsx",
    );

    assert.match(page, /Potvrdit warningy/);
    assert.match(page, /Publikovat/);
    assert.match(page, /Vytvořit opravnou revizi/);
    assert.match(page, /qualityGate\.blockerCount === 0/);
    assert.match(page, /warningsAcknowledged/);
  },
);

check(
  "transition route keeps actor server-side and exposes A2 actions",
  () => {
    const route = read(
      "app/api/reporting-groups/[groupId]/quarterly-reports/[reportId]/transition/route.ts",
    );

    assert.match(route, /requireUser\(\)/);
    assert.match(route, /acknowledgeQuarterlyReportWarnings/);
    assert.match(route, /publishQuarterlyReport/);
    assert.match(route, /createCorrectionRevision/);
    assert.doesNotMatch(route, /actorId|userRole|permission/);
  },
);

check("A2 verifier follows A1 in CI", () => {
  const ci = read(".github/workflows/ci.yml");

  assert.ok(
    ci.includes(
      "      - run: npm run verify:v22-c-part2ba1\n" +
      "      - run: npm run verify:v22-c-part2ba2\n" +
      "      - run: npm run verify:v22-c-part2ba3a\n" +
      "      - run: npm run verify:v22-c-part2ba3b\n" +
      "      - run: npm run verify:v22-c-part2ba3b0\n" +
      "      - run: npm run verify:v22-c-part2ba3b1\n" +
      "      - run: npm run verify:v22-c-part2ba3b2\n" +
      "      - run: npm run verify:v22-c-part2ba3b3\n" +
      "      - run: npm run verify:v22-c-payments1\n" +
      "      - run: npm run verify:v22-c-payments2a\n" +
      "      - run: npm run verify:v22-c-inactive-property-notifications\n" +
      "      - run: npm run build",
    ),
  );
});

console.log(
  `V22-C Part 2B-A2 verification passed (${count} checks).`,
);
