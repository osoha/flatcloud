import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { methodologyChapter, methodologyChapters } from "../lib/methodology";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) { run(); passed += 1; console.log(`✓ ${name}`); }

check("annual shareholder workflow has a complete internal methodology chapter", () => {
  const chapter = methodologyChapter("vyrocni-report");
  assert.ok(chapter);
  assert.equal(chapter.href, "/reporty/vyrocni");
  for (const marker of ["Q4 snapshoty", "slovo zakladatele", "PDF náhled", "novou revizi", "samo nic veřejně nerozesílá"]) assert.match(`${chapter.steps.join(" ")} ${chapter.check}`, new RegExp(marker));
});
check("distribution methodology reflects valuation prefill, option lifecycle and immutable events", () => {
  const chapter = methodologyChapter("crm-distribuce");
  assert.ok(chapter);
  for (const marker of ["poslední valuace", "stavem", "platnost", "referenci dokumentu", "neměnnou historii funnelu"]) assert.match(chapter.steps.join(" "), new RegExp(marker));
});
check("shareholder distribution methodology separates LIVE and historical views", () => {
  const chapter = methodologyChapter("reporting-distribuce");
  assert.ok(chapter);
  assert.match(chapter.steps.join(" "), /historický řez/);
  assert.match(chapter.check, /LIVE stav od historických pohybů/);
  assert.doesNotMatch(chapter.steps.join(" "), /chybějící historizaci/);
});
check("guidance is embedded in each relevant workflow", () => {
  const files: Record<string, string> = {
    "app/reporty/vyrocni/page.tsx": "vyrocni-report",
    "app/reporty/vyrocni/[groupId]/reporty/[reportId]/page.tsx": "vyrocni-report",
    "app/distribuce/zajemci/page.tsx": "crm-distribuce",
    "app/distribuce/reporting/page.tsx": "reporting-distribuce",
  };
  for (const [file, slug] of Object.entries(files)) {
    const source = read(file);
    assert.match(source, /MethodologyCallout/);
    assert.match(source, new RegExp(`slug=["']${slug}["']`));
  }
});
check("R15A is additive, migration-free and covered by browser smoke and CI", () => {
  assert.equal(readdirSync("prisma/migrations").filter((name) => /r15a|methodology_guidance/i.test(name)).length, 0);
  assert.ok(methodologyChapters.length >= 15);
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /Výroční report pro akcionáře/);
  assert.match(read(".github/workflows/ci.yml"), /verify:r15a-methodology-guidance/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R15A implementováno/);
});
console.log(`R15A verifier passed (${passed} checks).`);
