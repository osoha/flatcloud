import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateLeaseFinancialChange } from "../lib/lease-financial-change";

const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
function check(name: string, run: () => void) { run(); checks += 1; console.log(`✓ ${checks}. ${name}`); }

check("financial change is future-dated and reasoned", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  assert.equal(validateLeaseFinancialChange({ rentCents: 18_111_00, servicesCents: 3_000_00, effectiveFrom: new Date("2026-10-01T12:00:00Z"), reason: "Podepsaný dodatek" }, now).reason, "Podepsaný dodatek");
  assert.throws(() => validateLeaseFinancialChange({ rentCents: 18_111_00, servicesCents: 3_000_00, effectiveFrom: new Date("2026-09-01T12:00:00Z"), reason: "Dodatek" }, now), /příštího měsíce/);
  assert.throws(() => validateLeaseFinancialChange({ rentCents: 18_111_00, servicesCents: 3_000_00, effectiveFrom: new Date("2026-10-02T12:00:00Z"), reason: "Dodatek" }, now), /první den/);
});

check("general lease edit cannot mutate financial amounts", () => {
  const page = read("app/nemovitosti/[id]/smlouvy/[leaseId]/upravit/page.tsx");
  const route = read("app/api/properties/[id]/leases/[leaseId]/route.ts");
  assert.doesNotMatch(page, /name="rent"|name="services"/);
  assert.doesNotMatch(route, /moneyToCents\(form, "rent"\)|moneyToCents\(form, "services"\)/);
  assert.match(page, /Změnit od budoucího měsíce/);
});

check("two-step finance UI previews affected charges", () => {
  const page = read("app/smlouvy/[leaseId]/finance/upravit/page.tsx");
  for (const marker of ["Zkontrolovat dopad", "Budoucí předpisy k přepočtu", "Potvrdit budoucí změnu", "Historie se nepřepisuje"]) assert.match(page, new RegExp(marker));
  assert.match(read("lib/lease-financial-change.ts"), /manualOverride \|\| charge\.allocations\.length > 0/);
});

check("paid monthly charges are locked in UI and server routes", () => {
  const page = read("app/nemovitosti/[id]/predpisy/mesicni/[chargeId]/page.tsx");
  const itemRoute = read("app/api/properties/[id]/charges/[chargeId]/items/[itemId]/route.ts");
  const chargeRoute = read("app/api/properties/[id]/charges/[chargeId]/route.ts");
  assert.match(page, /Uhrazený předpis je uzamčen/);
  assert.match(itemRoute, /if \(paid > 0\) throw new Error/);
  assert.match(chargeRoute, /if \(paid > 0\) throw new Error/);
});

check("canonical rent and services rows cannot bypass the workflow", () => {
  const edit = read("app/api/properties/[id]/leases/[leaseId]/items/[itemId]/route.ts");
  const create = read("app/api/properties/[id]/leases/[leaseId]/items/route.ts");
  assert.match(edit, /\["RENT", "SERVICES"\]/);
  assert.match(create, /\["RENT", "SERVICES"\]/);
});

check("portfolio scope reaches operational queues and drill-down links", () => {
  for (const path of ["app/ukoly/page.tsx", "app/revize/page.tsx", "app/reporty/[report]/page.tsx", "app/platby/nesparovane/page.tsx"]) {
    const source = read(path); assert.match(source, /parsePortfolioSelection/); assert.match(source, /selectedPropertyIds/);
  }
  const portfolio = read("app/portfolio/page.tsx");
  assert.match(portfolio, /reporty\/saldo\?\$\{scopeQuery\.slice\(1\)\}/);
  assert.match(portfolio, /platby\/nesparovane\?\$\{scopeQuery\.slice\(1\)\}/);
});

console.log(`Audit remediation P0A ověřena: ${checks} kontrol.`);
