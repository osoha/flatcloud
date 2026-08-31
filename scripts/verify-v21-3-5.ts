import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const access = read("lib/access.ts");
assert.match(access, /includeInactive\?: boolean/);
assert.match(access, /\["SUPER_ADMIN", "MANAGER", "PROPERTY_MANAGER"\]\.includes\(user\.role\)/);
assert.match(access, /includeInactive \? \{\} : \{ active: true \}/);

const portfolio = read("app/portfolio/page.tsx");
assert.match(portfolio, /accessibleProperties\(user, \{ includeInactive: true \}\)/);
assert.match(portfolio, /activeProperties = properties\.filter/);
assert.match(portfolio, /Neaktivní \/ archivované/);
assert.match(portfolio, /leaseAlertsForProperties\(activeProperties\)/);
assert.match(portfolio, /taskScope = fullAccess \? \{ propertyId: \{ in: propertyIds \} \}/);
assert.match(portfolio, /bankAccount: \{ propertyId: \{ in: propertyIds \} \}/);
assert.match(portfolio, /OR: \[\{ propertyId: null \}, \{ propertyId: \{ in: propertyIds \} \}\]/);

const task = read("app/ukoly/\[id\]/page.tsx");
assert.match(task, /orderBy:\{createdAt:"desc"\}/);
assert.match(task, /latestPromise=task\.entries\.find/);
assert.match(task, /lastActivity=task\.entries\[0\]/);

const process = read("lib/inbound-bank/process.ts");
assert.match(process, /tryVerifyNotificationPayment/);
assert.ok(process.indexOf("tryVerifyNotificationPayment") < process.indexOf("matchingRuleForInbox(route.propertyId"));
assert.match(process, /!explicitLeaseId && !route\.strong && !matchingRule/);
assert.match(process, /status: "IGNORED", propertyId: route\.propertyId/);
assert.match(process, /Příjem na známý účet bez vazby na nájemní evidenci/);
assert.match(process, /ownerAccountIds\.length && vs/);
const touch = process.indexOf("await touchPropertyPaymentNotification(route.propertyId");
const relevanceIgnore = process.indexOf("!explicitLeaseId && !route.strong && !matchingRule");
assert.ok(touch > process.indexOf("if (!route.propertyId)") && touch < relevanceIgnore);
assert.match(process, /externalAccountId === `bank-email:\$\{rule\.bankAccount\.propertyId\}:\$\{fingerprint\}`/);
assert.match(process, /rule\.bankAccount\.provider === "bank-email"/);

const matching = read("lib/matching.ts");
assert.doesNotMatch(matching, /choose\(scored\.filter\(\(row\) => row\.vs\)/);
assert.match(matching, /row\.ownerAccount && row\.vs/);

const queue = read("app/platby/nesparovane/page.tsx");
assert.match(queue, /where: \{ status: "IGNORED" \}/);
assert.match(queue, /take: 100/);
assert.match(queue, /Ostatní bankovní notifikace/);
assert.match(queue, /transactions\.length \+ inbox\.length/);

const sync = read("lib/inbound-bank/sync.ts");
assert.match(sync, /mimo nájmy \$\{ignored\}/);

const css = read("app/globals.css");
assert.match(css, /V21\.3\.5 typography, archive and bank-notification polish/);
assert.match(css, /\.archived-property-row/);
assert.match(css, /\.status\.archived\{color:#667085;background:#eef0f3\}/);
assert.match(portfolio, /archived\?"archived":propertyDebt\?"bad"/);
assert.match(css, /\.discussion-content>p\{font-size:14px/);

console.log("V21.3.5 verification passed.");
