import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
let count = 0;
function check(name: string, test: () => void) { test(); count += 1; console.log(`✓ ${count}. ${name}`); }

const queue = read("app/platby/nesparovane/page.tsx");
const detail = read("app/nemovitosti/[id]/platby/[transactionId]/page.tsx");
const property = read("app/nemovitosti/[id]/[section]/page.tsx");
const ledger = read("components/PaymentLedgerTable.tsx");
const safety = read("lib/payment-safety.ts");
const matching = read("lib/matching.ts");
const ci = read(".github/workflows/ci.yml");
const packageJson = read("package.json");

check("actionable transaction query remains UNMATCHED/SUGGESTED", () => assert.match(queue, /amountCents: \{ gt: 0 \}, status: \{ in: \["UNMATCHED", "SUGGESTED"\] \}/));
check("actionable inbox query remains RECEIVED/UNMATCHED/ERROR", () => assert.match(queue, /status: \{ in: \["RECEIVED", "UNMATCHED", "ERROR"\] \}/));
check("history stays outside the actionable total", () => { assert.match(queue, /transactions\.length \+ inbox\.length/); assert.doesNotMatch(queue, /transactions\.length \+ inbox\.length \+ ignored/); });
check("history remains accessible and collapsed", () => assert.match(queue, /<details><summary>Historie a vyřazené/));
check("global queue remains SUPER_ADMIN only", () => assert.match(queue, /user\.role !== "SUPER_ADMIN"/));

check("transaction lookup retains bankTransactionAccessWhere", () => assert.match(detail, /AND: \[\{ id: transactionId, bankAccount: \{ propertyId: id \} \}, bankTransactionAccessWhere\(user\)\]/));
check("hero exposes amount status and remaining", () => { assert.match(detail, /Bankovní transakce/); assert.match(detail, /paymentStatuses\[transaction\.status\]/); assert.match(detail, /Zbývá přiřadit/); });
check("payer fallback is Plátce neuveden", () => assert.match(detail, /transaction\.counterpartyName \|\| "Plátce neuveden"/));
check("transaction message is labelled as bank evidence", () => assert.match(detail, /<span>Zpráva z banky<\/span><strong>\{transaction\.message/));
check("rent allocations appear as accounting usage", () => { assert.match(detail, /Zaúčtování platby/); assert.match(detail, /Úhrada předpisu/); });
check("received deposits appear as accounting usage", () => { assert.match(detail, /securityDepositReceipts: \{ where: \{ type: "RECEIVED" \}/); assert.match(detail, /transaction\.securityDepositReceipts\.map/); });
check("remaining includes rent and received deposits", () => assert.match(detail, /const allocated = transaction\.allocations\.reduce[\s\S]*transaction\.securityDepositReceipts\.reduce/));
check("system suggestion is informational", () => { assert.match(detail, /Návrh systému/); assert.match(detail, /Návrh není zaúčtování/); assert.doesNotMatch(detail, /accept-suggestion/); });
check("bank notification remains collapsed", () => assert.match(detail, /<details><summary>Údaje z bankovní notifikace/));
check("raw excerpt remains nested and collapsed", () => assert.match(detail, /rawExcerpt && <details[^>]*><summary>Původní obsah bankovní notifikace/));

check("allocation route and payload remain unchanged", () => { assert.match(detail, /action=\{`\/api\/properties\/\$\{id\}\/transactions\/\$\{transaction\.id\}\/allocate`\}/); assert.match(detail, /name="chargeId"/); assert.match(detail, /name="amount"/); });
check("deposit route and payload remain unchanged", () => { assert.match(detail, /action=\{`\/api\/properties\/\$\{id\}\/transactions\/\$\{transaction\.id\}\/deposit`\}/); for (const name of ["leaseId", "amount", "effectiveAt", "note"]) assert.ok(detail.includes(`name="${name}"`)); });
check("reassign route and payload remain unchanged", () => { assert.match(detail, /action=\{`\/api\/properties\/\$\{id\}\/transactions\/\$\{transaction\.id\}\/reassign`\}/); assert.match(detail, /name="targetLeaseId"/); });
check("matching-rule route and payload remain unchanged", () => { assert.match(detail, /action=\{`\/api\/properties\/\$\{id\}\/transactions\/\$\{transaction\.id\}\/rule`\}/); for (const name of ["ruleName", "targetLeaseId", "action"]) assert.ok(detail.includes(`name="${name}"`)); });
check("future ignore remains explicit opt-in", () => { assert.match(detail, /type="checkbox" name="future"/); assert.doesNotMatch(detail, /name="future"[^>]*defaultChecked/); });
check("deposit-linked rule and ignore actions remain unavailable", () => { assert.match(detail, /!transaction\.allocations\.length && !depositLinked/); assert.match(detail, /transaction\.source!=="manual" && !transaction\.allocations\.length && !depositLinked/); });
check("Payments1 safety guards remain intact", () => { for (const symbol of ["assertNoReceivedDepositForTransactionAction", "assertTransactionAcceptsRentAllocation", "assertTransactionAcceptsDeposit", "assertActiveChargeForPayment"]) assert.ok(safety.includes(symbol)); });

check("property page preserves status groupings", () => { assert.match(property, /status === "UNMATCHED" \|\| row\.status === "SUGGESTED"/); assert.match(property, /status === "MATCHED" \|\| row\.status === "PARTIAL" \|\| row\.status === "OVERPAYMENT"/); });
check("ignored property payments are secondary", () => assert.match(property, /<details><summary>Ignorované pohyby/));
check("property payer fallback terminology is consistent", () => assert.match(property, /counterpartyName \|\| "Plátce neuveden"/));

check("ledger allocation amount remains primary", () => assert.match(ledger, /<strong>\{money\(row\.allocatedAmountCents\)\}<\/strong>/));
check("whole bank transaction remains secondary", () => assert.match(ledger, /<small>Transakce celkem: \{money\(row\.transactionAmountCents\)\}<\/small>/));
check("ledger message identifies bank provenance", () => assert.match(ledger, /Zpráva z banky: \{row\.message/));

check("Payments2A adds no schema or migration", () => { assert.equal(fs.readdirSync(path.join(root, "prisma/migrations")).filter((name) => /payments2a/i.test(name)).length, 0); assert.doesNotMatch(read("prisma/schema.prisma"), /payments2a/i); });
check("matching implementation is not referenced by the UX patch", () => { assert.match(matching, /expectedTransactionStatus/); assert.doesNotMatch(detail + queue + property + ledger, /from "@\/lib\/matching"/); });
check("Payments1 remains before Payments2A and later safety checkpoints in CI", () => { assert.match(packageJson, /"verify:v22-c-payments2a": "tsx scripts\/verify-v22-c-payments2a\.ts"/); assert.ok(ci.includes("      - run: npm run verify:v22-c-part2ba3b3\n      - run: npm run verify:v22-c-payments1\n      - run: npm run verify:v22-c-payments2a\n      - run: npm run verify:v22-c-inactive-property-notifications\n      - run: npm run verify:report-design-1\n      - run: npm run verify:report-design-2\n      - run: npm run build")); });

console.log(`V22-C Payments2A verification passed: ${count} checks.`);
