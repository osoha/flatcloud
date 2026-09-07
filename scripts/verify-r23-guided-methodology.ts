import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { methodologyGuides } from "../lib/methodology";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
function check(name: string, run: () => void) {
  run();
  checks += 1;
  console.log(`✓ ${checks}. ${name}`);
}

check("life-situation guides cover the main operating journeys", () => {
  assert.ok(methodologyGuides.length >= 6);
  for (const title of [
    "Přebírám nový dům do správy",
    "Nastěhovávám nového nájemce",
    "Nájemce neuhradil předpis",
    "Připravuji roční závěrku a report",
    "Dokončili jsme prodej novému vlastníkovi",
  ])
    assert.ok(methodologyGuides.some((guide) => guide.title === title));
  assert.ok(
    methodologyGuides.every(
      (guide) =>
        guide.steps.length >= 3 &&
        guide.steps.every(
          (step) => step.href.startsWith("/") && step.note.length > 20,
        ),
    ),
  );
});
check("support navigation separates low-frequency knowledge areas", () => {
  const shell = read("components/Shell.tsx");
  for (const marker of [
    "Podpora práce",
    "view=guides",
    "view=chapters",
    "view=glossary",
    "view=media",
    "activeQuery",
  ])
    assert.match(shell, new RegExp(marker));
  assert.match(shell, /CollapsibleNavGroup id="support"/);
});
check(
  "methodology views preserve search context and distinguish internal media",
  () => {
    const page = read("app/metodika/page.tsx");
    for (const marker of [
      "Průvodci podle životní situace",
      "Kroky samy nic nezapisují",
      'name="view"',
      "Slovník pojmů a vzorců",
      "Nejde o publikovaný ani automaticky distribuovaný obsah",
    ])
      assert.match(page, new RegExp(marker));
  },
);
check(
  "query-aware navigation exposes only the selected submodule as current",
  () => {
    const link = read("components/ScopeAwareLink.tsx");
    assert.match(link, /activeQuery/);
    assert.match(link, /searchParams\.get\(key\) === value/);
  },
);
check("R23 is migration-free and browser gated", () => {
  assert.equal(
    readdirSync("prisma/migrations").filter((name) =>
      /r23|guided_methodology/i.test(name),
    ).length,
    0,
  );
  assert.match(
    read("e2e/flatcloud.smoke.spec.ts"),
    /Průvodci podle životní situace/,
  );
  assert.match(
    read(".github/workflows/ci.yml"),
    /verify:r23-guided-methodology/,
  );
});
console.log(`R23 vedená metodika ověřena: ${checks} kontrol.`);
