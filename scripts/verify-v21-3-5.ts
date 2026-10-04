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
assert.match(portfolio, /unmatchedQueueCount\(user,propertyIds\)/);
const queueCounts = read("lib/inbound-bank/queue-counts.ts");
assert.match(queueCounts, /bankAccountScopes\(actor\)/);
assert.match(queueCounts, /bankAccount:\{propertyId:\{in:propertyIds\}\}/);
assert.match(queueCounts, /recipient===actor\.id&&\(scopes\.some\(account=>bankAccountMatches\(account,row\.recipientAccount\)\)\|\|payer===actor\.id\)/);
assert.match(queueCounts, /actor\.role==="SUPER_ADMIN"\?!recipient/);

const task = read("app/ukoly/\[id\]/page.tsx");
assert.match(task, /orderBy:\{createdAt:"desc"\}/);
assert.match(task, /latestPromise=task\.entries\.find/);
assert.match(task, /lastActivity=task\.entries\[0\]/);

const process = read("lib/inbound-bank/process.ts");
assert.match(process, /tryVerifyNotificationPayment/);
assert.ok(process.indexOf("tryVerifyNotificationPayment") < process.indexOf("matchingRuleForInbox(route.propertyId"));
assert.doesNotMatch(process, /!explicitLeaseId && !route\.strong && !matchingRule/);
assert.match(process, /status: "IGNORED", propertyId: route\.propertyId/);
assert.match(process, /reconcileTransactionReview/);
assert.match(process, /ownerAccountIds\.length && vs/);
const touch = process.indexOf("await touchPropertyPaymentNotification(route.propertyId");
const materialize = process.indexOf("const transaction = await prisma.bankTransaction.upsert");
assert.ok(touch > process.indexOf("if (!route.propertyId)") && touch < materialize);
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
assert.match(portfolio, /portfolioPropertyStatus\(\{archived,expectedCents:propertyExpected,paidCents:propertyPaid,overdueDebtCents:propertyDebt\}\)/);
const portfolioStatus = read("lib/portfolio-property-status.ts");
assert.match(portfolioStatus, /if \(input\.archived\) return \{ label: "Archivováno", tone: "archived" \}/);
assert.match(portfolioStatus, /if \(input\.overdueDebtCents > 0\) return \{ label: "Vyžaduje pozornost", tone: "bad" \}/);
assert.match(css, /\.discussion-content>p\{font-size:14px/);

console.log("V21.3.5 verification passed.");
