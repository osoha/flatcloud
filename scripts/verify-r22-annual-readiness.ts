import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { annualChecklistTone } from "../lib/reporting/annual-readiness";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
function check(name: string, run: () => void) {
  run();
  checks += 1;
  console.log(`✓ ${checks}. ${name}`);
}

check("readiness is green only when every required source is complete", () => {
  const complete = {
    propertyCount: 2,
    hasPublishedQ4: true,
    annualStatus: "PUBLISHED",
    annualMissingCount: 0,
    missingValuations: 0,
    missingBudgets: 0,
    unresolvedCosts: 0,
  };
  assert.equal(annualChecklistTone(complete), "ok");
  assert.equal(annualChecklistTone({ ...complete, missingBudgets: 1 }), "bad");
  assert.equal(
    annualChecklistTone({ ...complete, annualStatus: "REVIEW" }),
    "warn",
  );
});
check(
  "loader is permission scoped and evaluates effective year-end properties",
  () => {
    const source = read("lib/reporting/annual-readiness.ts");
    for (const marker of [
      "listReportingBackofficeGroups(actor)",
      "reportingGroupPropertiesAt(group, to)",
      'status: "PUBLISHED"',
      "annualReportMissingFields",
      'category: "INVOICE"',
      "CONFIRMED_BY_ACCOUNTANT",
    ])
      assert.match(source, new RegExp(marker.replace(/[()]/g, "\\$&")));
  },
);
check("checklist is read-only and links to source workflows", () => {
  const page = read("app/reporty/rocni-checklist/page.tsx");
  for (const marker of [
    "Checklist nic automaticky neopravuje",
    "Publikovaný Q4",
    "Výroční revize",
    "Valuace",
    "Rozpočty",
    "Náklady a doklady",
    "Podklady vlastníků",
  ])
    assert.match(page, new RegExp(marker));
  assert.doesNotMatch(page, /action=|method="post"/);
});
check("R22 adds no migration and is browser gated", () => {
  assert.equal(
    readdirSync("prisma/migrations").filter((name) =>
      /r22|annual_readiness/i.test(name),
    ).length,
    0,
  );
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /R22: roční checklist/);
  assert.match(read(".github/workflows/ci.yml"), /verify:r22-annual-readiness/);
});
console.log(`R22 roční checklist ověřen: ${checks} kontrol.`);
