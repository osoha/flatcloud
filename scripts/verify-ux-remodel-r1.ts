import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

check("pipeline separates operations from FlatCloud financial consolidation", () => {
  const source = read("UX-REMODEL-PIPELINE.md");
  assert.match(source, /Globální cockpit správce/);
  assert.match(source, /Asset dashboard FlatCloud/);
  assert.match(source, /Externí vlastník/);
  assert.match(source, /konsolidace KPI/);
});

check("methodology is available globally and in context", () => {
  const shell = read("components/Shell.tsx");
  const page = read("app/metodika/page.tsx");
  const property = read("app/nemovitosti/nova/page.tsx");
  const newLease = read("app/nemovitosti/[id]/smlouvy/nova/page.tsx");
  const lease = read("app/smlouvy/[leaseId]/page.tsx");
  assert.match(shell, /href="\/metodika"/);
  assert.match(page, /Metodika správy/);
  assert.match(property, /MethodologyCallout slug="zalozeni-nemovitosti"/);
  assert.match(newLease, /MethodologyCallout slug="najemni-smlouva"/);
  assert.match(lease, /MethodologyCallout slug="najemni-smlouva"/);
});

check("lease detail exposes the financial headline and lifecycle actions", () => {
  const source = read("app/smlouvy/[leaseId]/page.tsx");
  for (const label of ["Nájemné", "Zálohy na služby", "Celkem měsíčně", "Aktuální úhrada", "Kauce", "Ukončit vztah"]) assert.match(source, new RegExp(label));
  assert.match(source, /currentCharge/);
  assert.match(source, /chargeDisplayState/);
  assert.match(source, /Otevřít aktuální předpis/);
});

check("property overview has a guided readiness checklist", () => {
  const source = read("app/nemovitosti/[id]/[section]/page.tsx");
  assert.match(source, /PropertyOnboardingChecklist/);
  for (const label of ["Jednotky", "Nájemní smlouvy", "Předpisy", "Účty pro inkaso", "Revize a kontroly"]) assert.match(source, new RegExp(label));
});

check("R1 UI remains schema-neutral", () => {
  const migrationNames = fs.readdirSync(path.join(root, "prisma/migrations"));
  assert.equal(migrationNames.filter((name) => /ux[-_]?remodel[-_]?r1/i.test(name)).length, 0);
  assert.doesNotMatch(read("prisma/schema.prisma"), /MethodologyChapter|OnboardingChecklist/);
});

check("contracting parties are explicit and occupants remain separate", () => {
  const fields = read("components/LeaseCoreFields.tsx");
  const pipeline = read("UX-REMODEL-PIPELINE.md");
  assert.match(fields, /Hlavní smluvní strana/);
  assert.match(fields, /Další smluvní partneři/);
  assert.match(fields, /Obyvatele bez smluvní odpovědnosti evidujte zvlášť/);
  assert.match(pipeline, /R2D implementováno aditivně/);
});

check("CI and browser smoke cover the first remodel slice", () => {
  assert.match(read(".github/workflows/ci.yml"), /verify:ux-remodel-r1/);
  const smoke = read("e2e/flatcloud.smoke.spec.ts");
  for (const marker of ["metodika je dohledatelná", "přehled nemovitosti ukazuje stav založení", "detail smlouvy má čitelný finanční cockpit"]) assert.match(smoke, new RegExp(marker));
});

check("management scope is explicit and filterable by owner", () => {
  const picker = read("components/PortfolioScopePicker.tsx");
  const reports = read("app/reporty/page.tsx");
  const portfolio = read("app/portfolio/page.tsx");
  assert.match(picker, /Rozsah správy/);
  assert.match(picker, /Vše ve správě/);
  assert.match(picker, /scope-owner-preset/);
  assert.match(reports, /Nejde o konsolidované finanční KPI skupiny FlatCloud/);
  assert.match(portfolio, /Provozní cockpit · napříč vlastníky/);
});

console.log(`UX remodel R1 ověřen: ${count} kontrol.`);
