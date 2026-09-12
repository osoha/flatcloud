import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { classifyAnnualExpenseEvidence, missingAnnualExpenseEvidenceSeverity } from "../lib/reporting/annual-owner-package";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) { run(); passed += 1; console.log(`✓ ${name}`); }

check("only invoices count as accounting evidence", () => {
  assert.deepEqual(classifyAnnualExpenseEvidence(["INVOICE", "OFFER", "OTHER"]), { accountingDocumentCount: 1, supportingDocumentCount: 2, evidenceStatus: "ACCOUNTING_DOCUMENT" });
  assert.deepEqual(classifyAnnualExpenseEvidence(["OFFER", "OTHER"]), { accountingDocumentCount: 0, supportingDocumentCount: 2, evidenceStatus: "SUPPORT_ONLY" });
  assert.deepEqual(classifyAnnualExpenseEvidence([]), { accountingDocumentCount: 0, supportingDocumentCount: 0, evidenceStatus: "MISSING" });
});

check("closed-year gaps block readiness while YTD gaps warn", () => {
  assert.equal(missingAnnualExpenseEvidenceSeverity(true), "BLOCKER");
  assert.equal(missingAnnualExpenseEvidenceSeverity(false), "WARNING");
});

check("annual UI and CSV expose evidence provenance", () => {
  const page = read("app/reporty/rocni-podklady/page.tsx");
  for (const marker of ["Účetní doklady pokrývají", "Pouze podpůrná příloha", "Chybí účetní doklad"]) assert.match(page, new RegExp(marker));
  const csv = read("app/api/reports/annual-owner-package.csv/route.ts");
  for (const marker of ["Účetní doklady", "Podpůrné přílohy", "Stav evidence"]) assert.match(csv, new RegExp(marker));
});

check("cost detail explains the distinction and R16A is migration-free", () => {
  assert.match(read("app/nemovitosti/[id]/naklady/[costId]/page.tsx"), /samy účetní doklad nenahrazují/);
  assert.equal(readdirSync("prisma/migrations").filter((name) => /r16a|cost_evidence/i.test(name)).length, 0);
  assert.match(read(".github/workflows/ci.yml"), /verify:r16a-cost-evidence/);
  assert.match(read("UX-REMODEL-PIPELINE.md"), /R16A implementováno/);
});

console.log(`R16A verifier passed (${passed} checks).`);
