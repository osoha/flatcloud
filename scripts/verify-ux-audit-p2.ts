import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const seed = read("prisma/seed-audit-scenarios.ts");
const leaseFields = read("components/LeaseCoreFields.tsx");
const editPage = read("app/nemovitosti/[id]/smlouvy/[leaseId]/upravit/page.tsx");
const editRoute = read("app/api/properties/[id]/leases/[leaseId]/route.ts");
const e2e = read("e2e/flatcloud.smoke.spec.ts");
const formUi = read("components/FormUi.tsx");
const css = read("app/audit-polish.css");

assert.match(seed, /QA_SCENARIOS_Q1_Q4_V1/);
for (const scenario of ["Q1 · Bezzměnový round-trip", "Q2 · Změna 19→20 tis.", "Q3 · Částečná úhrada", "QA Q4 · Objekt bez účtu"]) assert.match(seed, new RegExp(scenario.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(seed, /annualRateBps: input\.interestBps/);
assert.match(seed, /period: "2026-09"[\s\S]*amountCents: cents\(21_500\)/);
assert.match(seed, /period: "2026-10"[\s\S]*amountCents: cents\(22_500\)/);
assert.match(seed, /status: "PARTIAL"/);
assert.match(seed, /paymentAllocation\.create/);
assert.match(seed, /QA_SCENARIO_Q4_NO_ACCOUNT/);
assert.match(leaseFields, /defaultDepositInterest/);
assert.match(editPage, /securityDepositTerms:[\s\S]*defaultDepositInterest/);
assert.match(editRoute, /ratePercentToBps[\s\S]*depositInterestBps !== currentDepositInterestBps/);
for (const scenario of ["Q1:", "Q2:", "Q3:", "Q4:"]) assert.match(e2e, new RegExp(scenario));
assert.match(formUi, /role=\{error \? "alert" : "status"\}/);
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log("UX audit P2 scenario, regression and accessibility checks passed.");
