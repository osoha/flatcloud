import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { bankVerificationCoverage } from "../lib/bank-verification-scope";


const coverage = bankVerificationCoverage([
  { id: "u1", label: "BJ 1", ownerships: [{ ownerBankAccountId: "acc-1" }] },
  { id: "u2", label: "BJ 2", ownerships: [{ ownerBankAccountId: "acc-2" }] },
  { id: "u3", label: "BJ 3", ownerships: [{ ownerBankAccountId: "acc-3", ownerBankAccount: { notificationVerifiedAt: new Date("2026-08-26T12:00:00Z") } }] },
]);
assert.equal(coverage.verifiedUnits, 1);
assert.equal(coverage.totalUnits, 3);
assert.equal(coverage.allVerified, false);

const schema = readFileSync("prisma/schema.prisma", "utf8");
assert.match(schema, /manualOverride\s+Boolean\s+@default\(false\)/);
assert.ok(existsSync("prisma/migrations/20260826200000_v21_3_4_charge_manual_override/migration.sql"));

const automation = readFileSync("lib/charge-automation.ts", "utf8");
assert.match(automation, /existing\?\.manualOverride\) continue/);

const chargeRoute = readFileSync("app/api/properties/[id]/charges/[chargeId]/route.ts", "utf8");
assert.match(chargeRoute, /CHARGE_WAIVED/);
assert.match(chargeRoute, /CHARGE_OVERRIDE_RESET/);
assert.match(chargeRoute, /manualOverride: true/);
assert.doesNotMatch(chargeRoute, /moneyToCents\(form,\s*"amount"\)/);

const monthlyPage = readFileSync("app/nemovitosti/[id]/predpisy/mesicni/[chargeId]/page.tsx", "utf8");
assert.match(monthlyPage, /Rozpad měsíčního předpisu/);
assert.match(monthlyPage, /Přidat jednorázovou položku/);
assert.match(monthlyPage, /Odpustit \/ vypnout tento předpis/);
assert.match(monthlyPage, /Obnovit podle pravidelné šablony/);

const addItem = readFileSync("app/api/properties/[id]/charges/[chargeId]/items/route.ts", "utf8");
const editItem = readFileSync("app/api/properties/[id]/charges/[chargeId]/items/[itemId]/route.ts", "utf8");
assert.match(addItem, /manualOverride: true/);
assert.match(editItem, /manualOverride: true/);
assert.match(editItem, /mode === "delete"/);

const report = readFileSync("app/reporty/[report]/page.tsx", "utf8");
assert.match(report, /Otevřít předpis/);
assert.match(report, /Ruční úprava/);
assert.match(report, /jednotky\/\$\{row\.unit\.id\}/);

const shell = readFileSync("components/Shell.tsx", "utf8");
assert.match(shell, /flatcloud-logo-white\.png/);
assert.ok(existsSync("public/flatcloud-logo-white.png"));

const settingsPage = readFileSync("app/nastaveni/system/page.tsx", "utf8");
assert.match(settingsPage, /\/api\/settings\/inbound-mail\/test/);
assert.match(settingsPage, /Otestovat IMAP připojení/);
const imap = readFileSync("lib/inbound-bank/imap.ts", "utf8");
assert.match(imap, /export async function testImapConnection/);
assert.match(imap, /socket\.on\("close"/);

const propertyPage = readFileSync("app/nemovitosti/[id]/[section]/page.tsx", "utf8");
assert.match(propertyPage, /bankVerificationCoverage\(p\.units, propertyPaymentLinks\)/);
assert.doesNotMatch(propertyPage, /verifiedPaymentLinks/);

console.log("V21.3.4 release blockers: bank scope + IMAP + logo + monthly charge overrides: OK");
