import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const verification = readFileSync("lib/bank-email-verification.ts", "utf8");
const inbound = readFileSync("lib/inbound-bank/process.ts", "utf8");
const matching = readFileSync("lib/matching.ts", "utf8");
const notifications = readFileSync("lib/rent-notifications.ts", "utf8");
const inboxDetail = readFileSync("app/platby/nesparovane/email/[id]/page.tsx", "utf8");

const automaticTest = verification.slice(
  verification.indexOf("export async function tryVerifyNotificationPayment"),
  verification.indexOf("export async function manuallyVerifyNotificationPayment"),
);

assert.match(automaticTest, /where: \{ active: true, ownerBankAccountId:/);
assert.doesNotMatch(automaticTest, /property: \{ active: true \}/);
assert.match(automaticTest, /linkIsUsedByUnit/);
assert.match(inbound, /const verification = await tryVerifyNotificationPayment/);
assert.match(inbound, /prisma\.lease\.findMany\(\{\s*where: \{\s*\.\.\.\(ownerAccountIds\.length/);
assert.match(matching, /where: \{ unit: \{ propertyId \} \}/);
assert.match(matching, /charges: \{ where: \{ active: true \}/);
assert.match(notifications, /where: \{ unit: \{ property: \{ active: true \} \}/);
assert.doesNotMatch(inboxDetail, /property: \{ active: true \}/);
assert.match(inboxDetail, /propertyPaymentAccount\.findMany\(\{ where: \{ active: true \}/);
assert.match(inboxDetail, /lease\.findMany\(\{ include:/);

console.log("Neaktivní objekt: bankovní test a párování stávajících plateb jsou povolené; automatická komunikace zůstává vypnutá.");
