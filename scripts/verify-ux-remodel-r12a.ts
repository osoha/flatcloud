import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

check("property workflows preserve the property in top-bar shortcuts", () => {
  const propertyPages = [
    "app/nemovitosti/[id]/dokumenty/page.tsx",
    "app/nemovitosti/[id]/najemnici/[tenantId]/upravit/page.tsx",
    "app/nemovitosti/[id]/najemnici/novy/page.tsx",
    "app/nemovitosti/[id]/naklady/[costId]/page.tsx",
    "app/nemovitosti/[id]/platby/nova/page.tsx",
    "app/nemovitosti/[id]/reporting/page.tsx",
    "app/nemovitosti/[id]/upravit/page.tsx",
  ];
  for (const path of propertyPages) assert.match(read(path), /<Shell user=\{user\} taskPropertyId=\{id\}/, path);
});

check("lease workflows preserve both property and lease in new tasks", () => {
  const exactMarkers: Array<[string, RegExp]> = [
    ["app/nemovitosti/[id]/predpisy/[leaseId]/page.tsx", /taskPropertyId=\{id\} taskLeaseId=\{lease\.id\}/],
    ["app/nemovitosti/[id]/predpisy/mesicni/[chargeId]/page.tsx", /taskPropertyId=\{id\} taskLeaseId=\{charge\.leaseId\}/],
    ["app/smlouvy/[leaseId]/finance/upravit/page.tsx", /taskPropertyId=\{lease\.unit\.propertyId\} taskLeaseId=\{lease\.id\}/],
    ["app/smlouvy/[leaseId]/vyuctovani/page.tsx", /taskPropertyId=\{preview\.lease\.unit\.propertyId\} taskLeaseId=\{preview\.lease\.id\}/],
    ["app/smlouvy/[leaseId]/vyuctovani/[protocolId]/page.tsx", /taskPropertyId=\{protocol\.lease\.unit\.propertyId\} taskLeaseId=\{protocol\.leaseId\}/],
  ];
  for (const [path, marker] of exactMarkers) assert.match(read(path), marker, path);
});

check("a payment preselects a lease only when its context is unambiguous", () => {
  const page = read("app/nemovitosti/[id]/platby/[transactionId]/page.tsx");
  assert.match(page, /const contextualLeaseIds = \[\.\.\.new Set\(/);
  assert.match(page, /transaction\.suggestedLeaseId/);
  assert.match(page, /transaction\.allocations\.map/);
  assert.match(page, /transaction\.securityDepositReceipts\.map/);
  assert.match(page, /taskLeaseId=\{contextualLeaseIds\.length === 1 \? contextualLeaseIds\[0\] : undefined\}/);
});

check("browser smoke verifies property and lease shortcut continuity", () => {
  const smoke = read("e2e/flatcloud.smoke.spec.ts");
  assert.match(smoke, /R12: horní zkratky zachovají kontext vnořené nemovitosti a smlouvy/);
  assert.match(smoke, /\/platby\/nova\?properties=\$\{propertyId\}/);
  assert.match(smoke, /expect\(leaseTaskHref\)\.toMatch\(\/\^\\\/ukoly/);
  assert.match(smoke, /toHaveAttribute\("href", leaseTaskHref!\)/);
});

console.log(`R12A verifier passed (${passed} checks).`);
