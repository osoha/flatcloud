import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { methodologyGlossary, methodologySearchText } from "../lib/methodology";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) { run(); passed += 1; console.log(`✓ ${name}`); }

check("finance glossary mirrors every published LIVE KPI formula", () => {
  const expected = new Map([
    ["Roční nájemné", "Měsíční čisté nájemné × 12"],
    ["NOI", "Roční nájemné − skutečný OPEX za posledních 12 měsíců"],
    ["Cashflow", "NOI − roční dluhová služba"],
    ["Yield", "NOI ÷ tržní hodnota × 100 %"],
    ["ROE", "Cashflow ÷ (tržní hodnota − nesplacená jistina) × 100 %"],
    ["LTV", "Nesplacená jistina ÷ tržní hodnota × 100 %"],
    ["DSCR", "NOI ÷ roční dluhová služba"],
  ]);
  for (const [term, formula] of expected) {
    const item = methodologyGlossary.find((candidate) => candidate.term === term);
    assert.equal(item?.formula, formula, `Formula mismatch for ${term}`);
    assert.match(methodologySearchText(item!), new RegExp(formula.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

check("formula wording stays aligned with the finance calculator", () => {
  const finance = read("lib/reporting/asset-finance-kpis.ts");
  for (const marker of ["monthlyNetRentCents * 12", "annualRentCents - row.actualOpexTtmCents", "noiCents - row.annualDebtServiceCents", "ratioBasisPoints(noiCents, row.marketValueCents)", "ratioBasisPoints(cashflowCents, equityCents)", "ratioBasisPoints(row.outstandingPrincipalCents, row.marketValueCents)", "ratioBasisPoints(noiCents, row.annualDebtServiceCents)"]) assert.match(finance, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

check("methodology offers a responsive three-way landing screen", () => {
  const page = read("app/metodika/page.tsx");
  const css = read("app/globals.css");
  for (const marker of ["Rozcestník metodiky", "Praktické postupy", "Slovník a vzorce", "Znalostní média", "Vzorec v aplikaci"]) assert.match(page, new RegExp(marker));
  assert.match(read("e2e/flatcloud.smoke.spec.ts"), /Slovník pojmů a vzorců/);
  assert.match(css, /\.methodology-hub\{display:grid;grid-template-columns:repeat\(3/);
  assert.match(css, /methodology-media-grid,.methodology-hub,.onboarding-step-grid\{grid-template-columns:1fr\}/);
});

check("R18C is additive, migration-free and release-gated", () => {
  assert.equal(readdirSync("prisma/migrations").filter((name) => /r18c|methodology_formula/i.test(name)).length, 0);
  assert.match(read(".github/workflows/ci.yml"), /verify:r18c-methodology-formulas/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R18C implementováno/);
});

console.log(`R18C verifier passed (${passed} checks).`);
