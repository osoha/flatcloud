import assert from "node:assert/strict";
import fs from "node:fs";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/db";
import { bankTransactionAccessWhere, leaseAccessWhere } from "../lib/access";
import { loadPaymentLedgerRows, payerPresentation } from "../lib/payment-ledger";
import { assertActiveChargeForPayment, assertNoReceivedDepositForTransactionAction, assertTransactionAcceptsDeposit, assertTransactionAcceptsRentAllocation, transactionLeaseRuleAction } from "../lib/payment-safety";

let count = 0;
async function check(name: string, test: () => unknown | Promise<unknown>) { await test(); count += 1; console.log(`✓ ${count}. ${name}`); }
const read = (path: string) => fs.readFileSync(path, "utf8");

async function runtimeChecks() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Payments1 runtime verification.");
  const marker = `verify-payments1-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `${marker}@example.test`, name: marker, passwordHash: "not-a-login", role: UserRole.OWNER_VIEWER, active: true } });
  const propertyUser = await prisma.user.create({ data: { email: `${marker}-property@example.test`, name: `${marker}-property`, passwordHash: "not-a-login", role: UserRole.PROPERTY_MANAGER, active: true } });
  const owner = await prisma.owner.create({ data: { name: `${marker}-owner` } });
  try {
    const propertyA = await prisma.property.create({ data: { name: `${marker}-A`, address: "A 1", city: "Praha", ownerId: owner.id } });
    await prisma.userProperty.create({ data: { userId: propertyUser.id, propertyId: propertyA.id, permission: "VIEW" } });
    const propertyB = await prisma.property.create({ data: { name: `${marker}-B`, address: "B 1", city: "Praha", ownerId: owner.id } });
    const unitA = await prisma.unit.create({ data: { propertyId: propertyA.id, label: "Unit A", userAccesses: { create: { userId: user.id, permission: "VIEW" } } } });
    const unitOther = await prisma.unit.create({ data: { propertyId: propertyA.id, label: "Unit Other" } });
    const unitB = await prisma.unit.create({ data: { propertyId: propertyB.id, label: "Unit B" } });
    const tenant = await prisma.tenant.create({ data: { name: `${marker}-tenant` } });
    const otherTenant = await prisma.tenant.create({ data: { name: `${marker}-other-tenant` } });
    const leaseA = await prisma.lease.create({ data: { unitId: unitA.id, tenantId: tenant.id, startDate: new Date("2026-01-01"), financialTrackingFromPeriod: "2026-01", variableSymbol: "123", rentCents: 1260000, servicesCents: 0 } });
    const leaseB = await prisma.lease.create({ data: { unitId: unitB.id, tenantId: tenant.id, startDate: new Date("2026-01-01"), financialTrackingFromPeriod: "2026-01", variableSymbol: "456", rentCents: 1000000, servicesCents: 0 } });
    const otherLease = await prisma.lease.create({ data: { unitId: unitOther.id, tenantId: otherTenant.id, startDate: new Date("2026-01-01"), financialTrackingFromPeriod: "2026-01", variableSymbol: "789", rentCents: 900000, servicesCents: 0 } });
    const [charge1, charge2] = await Promise.all([
      prisma.charge.create({ data: { leaseId: leaseA.id, period: "2026-01", dueDate: new Date("2026-01-05"), amountCents: 1260000 } }),
      prisma.charge.create({ data: { leaseId: leaseA.id, period: "2026-02", dueDate: new Date("2026-02-05"), amountCents: 440000 } }),
    ]);
    const account = await prisma.bankAccount.create({ data: { propertyId: propertyA.id, provider: "payments1", bankName: "Test banka", ibanMasked: "CZ••1234", externalAccountId: marker } });
    const otherCharge = await prisma.charge.create({ data: { leaseId: otherLease.id, period: "2026-01", dueDate: new Date("2026-01-05"), amountCents: 900000 } });
    const transaction = await prisma.bankTransaction.create({ data: { bankAccountId: account.id, externalId: `${marker}-split`, bookedAt: new Date("2026-02-10"), amountCents: 2000000, counterpartyName: "Partner nájemníka", counterpartyIban: "CZ6508000000192000145399", variableSymbol: "123", message: "Nájem a kauce", source: "email-bank", allocations: { create: [{ chargeId: charge1.id, amountCents: 1260000 }, { chargeId: charge2.id, amountCents: 440000 }] } } });
    await prisma.securityDepositMovement.create({ data: { leaseId: leaseA.id, type: "RECEIVED", amountCents: 300000, effectiveAt: new Date("2026-02-10"), bankTransactionId: transaction.id, createdById: user.id } });
    const depositOnly = await prisma.bankTransaction.create({ data: { bankAccountId: account.id, externalId: `${marker}-deposit`, bookedAt: new Date("2026-03-10"), amountCents: 500000, counterpartyIban: "123456/0800", variableSymbol: "999", message: "Jistota", source: "email-bank" } });
    await prisma.securityDepositMovement.create({ data: { leaseId: leaseA.id, type: "RECEIVED", amountCents: 500000, effectiveAt: new Date("2026-03-10"), bankTransactionId: depositOnly.id, createdById: user.id } });
    await prisma.inboxPayment.create({ data: { messageId: `${marker}@mail`, status: "IMPORTED", amountCents: 2000000, recipientAccount: "987654/0800", specificSymbol: "55", constantSymbol: "0308", rawExcerpt: "Původní obsah bankovní notifikace", transactionId: transaction.id } });
    const unrelatedTransaction = await prisma.bankTransaction.create({ data: { bankAccountId: account.id, externalId: `${marker}-unrelated`, bookedAt: new Date("2026-04-10"), amountCents: 900000, source: "email-bank", allocations: { create: { chargeId: otherCharge.id, amountCents: 900000 } } } });

    const rows = await loadPaymentLedgerRows([leaseA.id]);
    const rentRows = rows.filter((row) => row.accountingType === "Úhrada předpisu");
    await check("20,000 CZK transaction displays 12,600 CZK as the allocation amount", () => assert.equal(rentRows.find((row) => row.chargePeriod === "2026-01")?.allocatedAmountCents, 1260000));
    await check("allocation row retains the original 20,000 CZK transaction total", () => assert.equal(rentRows[0].transactionAmountCents, 2000000));
    await check("split allocations remain distinct and sum correctly", () => { assert.equal(rentRows.length, 2); assert.equal(rentRows.reduce((sum, row) => sum + row.allocatedAmountCents, 0), 1700000); });
    await check("received deposit appears in the finance ledger", () => assert.ok(rows.some((row) => row.accountingType === "Kauce" && row.allocatedAmountCents === 300000)));
    await check("deposit-only transaction appears in finance history", () => assert.ok(rows.some((row) => row.accountingType === "Kauce" && row.transactionId === depositOnly.id && row.allocatedAmountCents === 500000)));
    await check("payer name is preserved independently from tenant", () => assert.equal(rows.find((row) => row.transactionId === transaction.id)?.counterpartyName, "Partner nájemníka"));
    await check("missing payer name uses Plátce neuveden while retaining account", () => { const row = rows.find((item) => item.transactionId === depositOnly.id)!; assert.deepEqual(payerPresentation(row), { primary: "Plátce neuveden", secondary: "123456/0800" }); });
    await check("VS and message survive without payer identity", () => { const row = rows.find((item) => item.transactionId === depositOnly.id)!; assert.equal(row.variableSymbol, "999"); assert.equal(row.message, "Jistota"); });
    await check("tenant lease access excludes inaccessible property", async () => { const visible = await prisma.lease.findMany({ where: { tenantId: tenant.id, ...leaseAccessWhere(user) } }); assert.deepEqual(visible.map((lease) => lease.id), [leaseA.id]); assert.ok(!visible.some((lease) => lease.id === leaseB.id)); });
    const findTransaction = (actor: { id: string; role: string; allProperties?: boolean }, transactionId: string) => prisma.bankTransaction.findFirst({ where: { AND: [{ id: transactionId, bankAccount: { propertyId: propertyA.id } }, bankTransactionAccessWhere(actor)] }, include: { inboxPayment: true } });
    await check("property-wide user can open a property transaction", async () => assert.ok(await findTransaction(propertyUser, unrelatedTransaction.id)));
    await check("unit-scoped user can open transaction anchored to visible unit", async () => assert.ok(await findTransaction(user, transaction.id)));
    await check("unit-scoped user cannot open unrelated same-property transaction", async () => assert.equal(await findTransaction(user, unrelatedTransaction.id), null));
    await check("InboxPayment raw context follows the transaction access boundary", async () => { const visible = await findTransaction(user, transaction.id); const hidden = await findTransaction(user, unrelatedTransaction.id); assert.equal(visible?.inboxPayment?.rawExcerpt, "Původní obsah bankovní notifikace"); assert.equal(hidden, null); });
  } finally {
    await prisma.inboxPayment.deleteMany({ where: { messageId: `${marker}@mail` } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, propertyUser.id] } } });
    await prisma.property.deleteMany({ where: { ownerId: owner.id } });
    await prisma.tenant.deleteMany({ where: { name: { startsWith: marker } } });
    await prisma.owner.delete({ where: { id: owner.id } });
  }
}

async function main() {
  const ignore = read("app/api/properties/[id]/transactions/[transactionId]/ignore/route.ts");
  const rule = read("app/api/properties/[id]/transactions/[transactionId]/rule/route.ts");
  const allocate = read("app/api/properties/[id]/transactions/[transactionId]/allocate/route.ts");
  const deposit = read("app/api/properties/[id]/transactions/[transactionId]/deposit/route.ts");
  await check("deposit-linked transaction cannot be ignored", () => assert.throws(() => assertNoReceivedDepositForTransactionAction(1, "ignore"), /kauce/));
  await check("deposit-linked transaction cannot create or reprocess through a transaction rule", () => assert.throws(() => assertNoReceivedDepositForTransactionAction(1, "rule"), /párovací pravidlo/));
  await check("IGNORED transaction cannot receive rent allocation", () => assert.throws(() => assertTransactionAcceptsRentAllocation("IGNORED"), /Ignorovanou/));
  await check("IGNORED transaction cannot receive deposit receipt", () => assert.throws(() => assertTransactionAcceptsDeposit("IGNORED"), /Ignorovanou/));
  await check("inactive charge cannot receive normal allocation", () => assert.throws(() => assertActiveChargeForPayment(false), /neaktivnímu předpisu/));
  await check("active charge still accepts valid allocation", () => assert.doesNotThrow(() => { assertActiveChargeForPayment(true); assertTransactionAcceptsRentAllocation("UNMATCHED"); }));
  await check("transaction-created lease rule accepts only MATCH_LEASE or SUGGEST_LEASE", () => { assert.equal(transactionLeaseRuleAction("MATCH_LEASE"), "MATCH_LEASE"); assert.equal(transactionLeaseRuleAction("SUGGEST_LEASE"), "SUGGEST_LEASE"); for (const value of ["IGNORE", "DELETE", "match_lease"]) assert.throws(() => transactionLeaseRuleAction(value), /podporovanou akci/); });
  await check("all P0 guards are wired into their server routes", () => { assert.match(ignore, /assertNoReceivedDepositForTransactionAction/); assert.match(rule, /assertNoReceivedDepositForTransactionAction/); assert.match(allocate, /assertTransactionAcceptsRentAllocation/); assert.match(allocate, /assertActiveChargeForPayment/); assert.match(deposit, /assertTransactionAcceptsDeposit/); });
  await check("transaction detail combines property identity with bank transaction access scope", () => { const page = read("app/nemovitosti/[id]/platby/[transactionId]/page.tsx"); assert.match(page, /bankTransactionAccessWhere\(user\)/); assert.match(page, /AND: \[\{ id: transactionId, bankAccount: \{ propertyId: id \} \}, bankTransactionAccessWhere\(user\)\]/); });
  await check("lease-rule action is validated before rule creation and reprocessing", () => { assert.match(rule, /transactionLeaseRuleAction\(text\(form, "action"\)\)/); assert.ok(rule.indexOf("const action = transactionLeaseRuleAction") < rule.indexOf("bankMatchingRule.create")); assert.ok(rule.indexOf("const action = transactionLeaseRuleAction") < rule.indexOf("await processTransaction")); });
  await runtimeChecks();
  await check("email-bank detail exposes linked InboxPayment SS, KS and raw excerpt", () => { const page = read("app/nemovitosti/[id]/platby/[transactionId]/page.tsx"); assert.match(page, /inboxPayment: true/); for (const field of ["specificSymbol", "constantSymbol", "rawExcerpt"]) assert.ok(page.includes(`transaction.inboxPayment.${field}`)); });
  await check("tenant summary separates unpaid prescriptions from overdue debt", () => { const page = read("app/najemnici/[tenantId]/page.tsx"); for (const label of ["Předepsáno", "Uhrazeno / započteno", "Neuhrazené předpisy", "Dluh po splatnosti"]) assert.ok(page.includes(label)); assert.match(page, /charges\.filter\(\(charge\) => charge\.active\).*outstandingCents/); assert.match(page, /overdueDebtCents\(charge\)/); });
  await check("inactive charges do not inflate normal prescribed paid or outstanding summaries", () => { const page = read("app/najemnici/[tenantId]/page.tsx"); assert.equal((page.match(/charges\.filter\(\(charge\) => charge\.active\)/g) || []).length, 3); });
  await check("ledger queries remain strictly bounded by caller-authorized lease IDs", () => { const ledger = read("lib/payment-ledger.ts"); assert.match(ledger, /loadPaymentLedgerRows\(leaseIds: string\[\]\)/); assert.match(ledger, /charge: \{ leaseId: \{ in: leaseIds \} \}/); assert.match(ledger, /leaseId: \{ in: leaseIds \}, type: "RECEIVED"/); assert.doesNotMatch(ledger, /where: \{ tenant/); });
  await check("Payments1 displays payer evidence without learning tenant identity", () => { const sources = [read("lib/payment-ledger.ts"), read("components/PaymentLedgerTable.tsx"), read("app/najemnici/[tenantId]/page.tsx"), read("app/nemovitosti/[id]/jednotky/[unitId]/page.tsx")].join("\n"); assert.doesNotMatch(sources, /tenant\.(update|upsert)|payerAccounts:\s*\{|tenantBankAccount:\s*/); });
  await check("payment status recomputation remains canonical", () => { const matching = read("lib/matching.ts"); assert.match(matching, /expectedTransactionStatus/); assert.match(matching, /PaymentStatus\.PARTIAL/); assert.match(matching, /PaymentStatus\.OVERPAYMENT/); });
  await check("payment correction authorization and reconciliation remain intact", () => { const corrections = read("lib/payment-corrections.ts"); assert.match(corrections, /requireTransactionCorrectionAccess/); assert.match(corrections, /reconcileCollectionTasksAfterPaymentCorrectionTx/); });
  await check("bank-email import and matching paths remain intact", () => { const process = read("lib/inbound-bank/process.ts"); assert.match(process, /materializeInboxPayment/); assert.match(process, /allocateTransactionToLease/); assert.match(process, /processTransaction/); });
  await check("Payments1 adds no Prisma schema or migration", () => { assert.equal(fs.readdirSync("prisma/migrations").filter((name) => /payments1/i.test(name)).length, 0); assert.doesNotMatch(read("prisma/schema.prisma"), /payments1/i); });
  await check("Payments1 follows reporting checkpoints and precedes later safety checkpoints in CI", () => assert.ok(read(".github/workflows/ci.yml").includes("      - run: npm run verify:v22-c-part2ba3b3\n      - run: npm run verify:v22-c-payments1\n      - run: npm run verify:v22-c-payments2a\n      - run: npm run verify:v22-c-inactive-property-notifications\n      - run: npm run build")));
  console.log(`V22-C Payments Foundation verification passed: ${count} checks.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
