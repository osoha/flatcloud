import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { annualQuarterlyAlignment } from "../lib/reporting/annual-quarterly-alignment";

const read = (path: string) => readFileSync(path, "utf8");
const date = (value: string) => new Date(`${value}T12:00:00Z`);
let passed = 0;
function check(name: string, run: () => void) { run(); passed += 1; console.log(`✓ ${name}`); }

check("alignment requires the same date and property scope", () => {
  const aligned = annualQuarterlyAlignment({ annualAsOfDate: date("2025-12-31"), annualPropertyIds: ["b", "a"], publishedQ4: { id: "q4", revision: 2, asOfDate: date("2025-12-31"), propertyIds: ["a", "b"] } });
  assert.equal(aligned.status, "ALIGNED");
  assert.equal(aligned.dateMatches, true);
  assert.equal(aligned.scopeMatches, true);
});

check("missing Q4 and both mismatch dimensions remain explicit", () => {
  assert.equal(annualQuarterlyAlignment({ annualAsOfDate: date("2025-12-31"), annualPropertyIds: ["a"], publishedQ4: null }).status, "NO_PUBLISHED_Q4");
  const mismatch = annualQuarterlyAlignment({ annualAsOfDate: date("2025-12-31"), annualPropertyIds: ["a", "b"], publishedQ4: { id: "q4", revision: 1, asOfDate: date("2025-09-30"), propertyIds: ["a", "c"] } });
  assert.equal(mismatch.status, "DATE_AND_SCOPE_MISMATCH");
  assert.deepEqual(mismatch.missingInQ4, ["b"]);
  assert.deepEqual(mismatch.extraInQ4, ["c"]);
});

check("workspace comparison is read-only and uses the latest published Q4", () => {
  const page = read("app/reporty/vyrocni/[groupId]/reporty/[reportId]/page.tsx");
  for (const marker of ["quarter: 4", "status: \"PUBLISHED\"", "orderBy: { revision: \"desc\" }", "Q4 a výroční rozsah jsou sladěné", "Výroční snapshoty se automaticky nemění"]) assert.match(page, new RegExp(marker));
  assert.doesNotMatch(page, /quarterlyReport\.(update|create|delete)/);
});

check("R17A is migration-free and covered by CI and browser smoke", () => {
  assert.equal(readdirSync("prisma/migrations").filter((name) => /r17a|quarterly_annual_alignment/i.test(name)).length, 0);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /annual-q4-alignment/);
  assert.match(read(".github/workflows/ci.yml"), /verify:r17a-quarterly-annual-alignment/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R17A implementováno/);
});

console.log(`R17A verifier passed (${passed} checks).`);
