import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`✓ ${checks}. ${name}`); }

check("lease detail links directly to a dedicated termination preflight", () => {
  const detail = read("app/smlouvy/[leaseId]/page.tsx");
  const page = read("app/smlouvy/[leaseId]/ukoncit/page.tsx");
  assert.match(detail, /\/smlouvy\/\$\{lease\.id\}\/ukoncit/);
  for (const marker of ["Otevřené předpisy", "Držená kauce", "Budoucí změny nájmu", "Co se po potvrzení stane", "Následné kroky"]) assert.match(page, new RegExp(marker));
});
check("termination is explicitly confirmed and cleans future proposals", () => {
  const route = read("app/api/properties/[id]/leases/[leaseId]/terminate/route.ts");
  assert.match(route, /confirmed/);
  assert.match(route, /rentChangeProposal\.updateMany/);
  assert.match(route, /status: "CANCELLED"/);
  assert.match(route, /\/smlouvy\/\$\{leaseId\}\/ukoncit/);
});
check("deposit gap labels no longer combine opposite meanings", () => {
  const page = read("app/smlouvy/[leaseId]/page.tsx");
  assert.match(page, /Zbývá složit/);
  assert.match(page, /Evidovaný přebytek/);
  assert.doesNotMatch(page, /Chybí doplatit \/ přebytek/);
});
check("compliance completion has visible action priority", () => {
  const css = read("app/globals.css");
  assert.match(css, /zapsat výsledek/);
  assert.match(css, /compliance-complete>summary/);
});

console.log(`Audit remediation P1 ověřena: ${checks} kontrol.`);
