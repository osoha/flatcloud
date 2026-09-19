import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { methodologyGlossary, methodologyMediaBriefs, methodologySearchText } from "../lib/methodology";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) { run(); passed += 1; console.log(`✓ ${name}`); }

check("glossary covers reporting, finance and distribution vocabulary", () => {
  for (const term of ["LIVE stav", "Snapshot", "Q4 snapshot", "OPEX", "CAPEX", "NOI", "LTV", "DSCR", "Konsolidační podíl", "Příležitost", "Opce", "PII"]) {
    assert.ok(methodologyGlossary.some((item) => item.term === term), `Missing term ${term}`);
  }
  assert.ok(methodologyGlossary.every((term) => term.definition.length >= 45 && term.chapterSlug));
});

check("search index includes aliases, definitions and media outlines", () => {
  const live = methodologyGlossary.find((term) => term.term === "LIVE stav")!;
  assert.match(methodologySearchText(live), /dnešní stav/);
  assert.ok(methodologyMediaBriefs.some((brief) => brief.kind === "Podcast"));
  assert.ok(methodologyMediaBriefs.some((brief) => brief.kind === "Video"));
  assert.ok(methodologyMediaBriefs.every((brief) => methodologySearchText(brief).includes(brief.outline[0])));
});

check("methodology UI labels briefs as internal and not published", () => {
  const page = read("app/metodika/page.tsx");
  for (const marker of ["Slovník pojmů", "Podcastové a video osnovy", "Nejde o publikovaný ani automaticky distribuovaný obsah", "methodologySearchText"]) assert.match(page, new RegExp(marker));
});

check("R15B is additive, migration-free and in CI", () => {
  assert.equal(readdirSync("prisma/migrations").filter((name) => /r15b|methodology_library/i.test(name)).length, 0);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /Slovník pojmů/);
  assert.match(read(".github/workflows/ci.yml"), /verify:r15b-methodology-library/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R15B implementováno/);
});

console.log(`R15B verifier passed (${passed} checks).`);
