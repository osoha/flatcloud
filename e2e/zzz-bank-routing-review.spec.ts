import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { materializeInboxPayment } from "../lib/inbound-bank/process";
import { reconcileTransactionReview, reconcileInboxReview } from "../lib/bank-review-tasks";
import { applyExpense } from "../lib/bank-expenses";
import { loadAnnualOwnerPackage } from "../lib/reporting/annual-owner-package";
import { loadPayerDisplayNames } from "../lib/bank-payer-display";
import { R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

const db = new PrismaClient();
test.beforeAll(() => { if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local/CI DB only"); });
test.afterAll(() => db.$disconnect());
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test");
  await page.getByLabel("Heslo").fill(process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/portfolio/);
}
async function fixture() {
  const token = randomUUID(), accountNumber = String(Math.floor(Math.random() * 8000000000) + 1000000000);
  const manager = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.advanced } });
  const owner = await db.owner.create({ data: { name: `Bank review owner ${token}` } });
  const property = await db.property.create({ data: { name: `Bank review ${token}`, address: "Testovací 1", city: "Test", ownerId: owner.id, managerId: manager.id,
    memberships: { create: { userId: manager.id, permission: "EDIT" } } } });
  const account = await db.ownerBankAccount.create({ data: { ownerId: owner.id, accountNumber, bankCode: "3030", propertyLinks: { create: { propertyId: property.id } } } });
  const unit = await db.unit.create({ data: { propertyId: property.id, label: "7", ownerships: { create: { ownerId: owner.id, ownerBankAccountId: account.id } } } });
  const admin = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
  const recipientAccount = `${accountNumber}/3030`;
  const inbox = (amountCents: number, extra: Record<string, string> = {}) => db.inboxPayment.create({ data: { messageId: randomUUID(), amountCents, recipientAccount,
    counterpartyAccount: "19-2000145399/0800", sourceTrusted: true, bank: "3030", status: "RECEIVED", bookedAt: new Date("2026-01-15T12:00:00Z"), ...extra } });
  return { token, manager, owner, property, account, unit, admin, recipientAccount, inbox };
}
test("known-account income remains for review, task is assigned once and closes after explicit ignore", async ({ page }) => {
  const f = await fixture(), row = await f.inbox(120000, { variableSymbol: "UNKNOWN" });
  const result = await materializeInboxPayment(row.id);
  expect(result.transactionId).toBeTruthy();
  const tx = await db.bankTransaction.findUniqueOrThrow({ where: { id: result.transactionId! } });
  expect(tx.status).toBe("UNMATCHED");
  expect(await db.paymentAllocation.count({ where: { transactionId: tx.id } })).toBe(0);
  await Promise.all([reconcileTransactionReview(tx.id), reconcileTransactionReview(tx.id)]);
  const tasks = await db.task.findMany({ where: { dedupeKey: `bank-review:transaction:${tx.id}` } });
  expect(tasks).toHaveLength(1);
  expect(tasks[0].assigneeId).toBe(f.manager.id);
  expect(tasks[0].propertyId).toBe(f.property.id);
  expect(tasks[0].unitId).toBeNull();
  const report = await loadAnnualOwnerPackage(f.admin, { ownerId: f.owner.id, year: 2026 });
  expect(report.issues.some(i => i.code === "BANK_UNCLASSIFIED")).toBe(true);
  await login(page);
  await page.goto(`/nemovitosti/${f.property.id}/platby/${tx.id}`);
  await page.getByText("Ignorovat platbu", { exact: true }).click();
  await page.getByRole("button", { name: "Ignorovat pouze tuto platbu", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Platba byla ignorována");
  expect((await db.task.findUniqueOrThrow({ where: { id: tasks[0].id } })).status).toBe("DONE");
  expect((await loadAnnualOwnerPackage(f.admin, { ownerId: f.owner.id, year: 2026 })).issues.some(i => i.code === "BANK_UNCLASSIFIED")).toBe(false);
});

test("outgoing SVJ remains reviewable, recurring bank fee is ignored, settlements and annual report stay separate", async ({ page }) => {
  const f = await fixture(), svj = await f.inbox(-250000, { message: "Zálohy SVJ", counterpartyName: "Testovací SVJ" });
  const result = await materializeInboxPayment(svj.id), tx = await db.bankTransaction.findUniqueOrThrow({ where: { id: result.transactionId! } });
  expect(tx.status).toBe("IGNORED"); // only ignored by rental matching, still open in expense ledger
  expect(tx.expenseIgnoredAt).toBeNull();
  expect(await db.propertyCost.count({ where: { propertyId: f.property.id } })).toBe(0);
  const rule = await db.bankExpenseRule.create({ data: { sourcePropertyId: f.property.id, targetPropertyId: f.property.id, bankAccountId: tx.bankAccountId,
    name: "Ignorovat poplatek účtu", action: "IGNORE", conditions: { direction: "OUT", message: "Poplatek za vedení účtu" }, createdById: f.manager.id } });
  const fee = await f.inbox(-15000, { message: "Poplatek za vedení účtu" });
  const feeResult = await materializeInboxPayment(fee.id), feeTx = await db.bankTransaction.findUniqueOrThrow({ where: { id: feeResult.transactionId! } });
  expect(feeTx.expenseIgnoredAt).not.toBeNull();
  expect(feeTx.expenseSuggestedRuleId).toBe(rule.id);
  expect(await db.task.count({ where: { dedupeKey: `bank-review:transaction:${feeTx.id}` } })).toBe(0);
  expect(await db.auditLog.count({ where: { entityId: feeTx.id, action: "BANK_EXPENSE_RULE_APPLIED" } })).toBe(1);
  const cost = await db.propertyCost.create({ data: { propertyId: f.property.id, unitId: f.unit.id, title: "Doložený náklad SVJ", kind: "OPEX", status: "ACTUAL", amountCents: 250000,
    effectiveAt: new Date("2025-12-15T12:00:00Z"), allocations: { create: { unitId: f.unit.id, shareBasisPoints: 10000, amountCents: 250000 } } } });
  const command = { transactionId: tx.id, sourcePropertyId: f.property.id, targetPropertyId: f.property.id, userId: f.manager.id,
    expectedRevision: 0, kind: "COST_PAYMENT" as const, costId: cost.id, amountCents: 100000, reason: "Test doloženého podkladu" };
  await applyExpense(command);
  const task = await db.task.findUniqueOrThrow({ where: { dedupeKey: `bank-review:transaction:${tx.id}` } });
  expect(task.status).toBe("OPEN");
  await applyExpense({ ...command, expectedRevision: 1, amountCents: 150000 });
  expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("DONE");
  const report = await loadAnnualOwnerPackage(f.admin, { ownerId: f.owner.id, year: 2026 });
  expect(report.issues.some(i => i.code === "BANK_UNCLASSIFIED")).toBe(false);
  expect(report.expenseRows).toHaveLength(0);
  expect(report.costPaymentRows.reduce((s, p) => s + p.amountCents, 0)).toBe(250000);
  expect(await db.paymentAllocation.count({ where: { transactionId: tx.id } })).toBe(0);
  await login(page);
  await page.goto(`/nemovitosti/${f.property.id}/bankovni-vydaje?year=2026&state=open`);
  await expect(page.locator(`[id="pohyb-${tx.id}"]`)).toHaveCount(0);
  await page.goto(`/nemovitosti/${f.property.id}/bankovni-vydaje?year=2026&state=ignored`);
  const feeRow = page.locator(`[id="pohyb-${feeTx.id}"]`);
  await expect(feeRow.locator(":scope > summary")).toContainText("Ignorováno");
  await feeRow.locator(":scope > summary").click();
  await expect(feeRow).toContainText("Poplatek za vedení účtu");
  await page.screenshot({ path: test.info().outputPath("ignored-bank-fee-history.png"), fullPage: true });
  const allocation = await db.bankExpenseAllocation.findFirstOrThrow({ where: { transactionId: tx.id }, orderBy: { createdAt: "desc" } });
  await applyExpense({ ...command, expectedRevision: 2, amountCents: 0, voidId: allocation.id });
  expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("OPEN");
});

test("payer presentation identifies the tenant without overwriting bank evidence and stays ambiguous across tenants", async ({ page }) => {
  const f = await fixture();
  const tenant = await db.tenant.create({ data: { name: `Identifikovaný nájemník ${f.token}` } });
  const lease = await db.lease.create({ data: { unitId: f.unit.id, tenantId: tenant.id, ownerBankAccountId: f.account.id,
    tenantBankAccount: "19-2000145399/0800", variableSymbol: "770001", startDate: new Date("2026-01-01T12:00:00Z"), financialTrackingFromPeriod: "2026-01", rentCents: 120000, servicesCents: 0 } });
  await db.charge.create({ data: { leaseId: lease.id, period: "2026-01", dueDate: new Date("2026-01-05T12:00:00Z"), amountCents: 120000,
    items: { create: { name: "Nájemné", category: "RENT", amountCents: 120000 } } } });
  const row = await f.inbox(120000, { variableSymbol: "770001", rawExcerpt: "Původní bankovní údaj bez jména" });
  const result = await materializeInboxPayment(row.id), tx = await db.bankTransaction.findUniqueOrThrow({ where: { id: result.transactionId! } });
  expect(tx.counterpartyName).toBeNull();
  const input = { ...tx, propertyId: f.property.id, counterpartyAccount: tx.counterpartyIban };
  expect((await loadPayerDisplayNames(f.admin, [input])).get(tx.id)).toBe(tenant.name);
  await login(page);
  await page.goto(`/nemovitosti/${f.property.id}/platby`);
  await expect(page.locator("tr").filter({ has: page.locator(`a[href='/nemovitosti/${f.property.id}/platby/${tx.id}']`) })).toContainText(tenant.name);
  await page.screenshot({ path: test.info().outputPath("identified-tenant-payment.png"), fullPage: true });
  const otherTenant = await db.tenant.create({ data: { name: `Jiný nájemník ${f.token}` } });
  const otherUnit = await db.unit.create({ data: { propertyId: f.property.id, label: "8" } });
  await db.lease.create({ data: { unitId: otherUnit.id, tenantId: otherTenant.id, ownerBankAccountId: f.account.id, tenantBankAccount: lease.tenantBankAccount,
    variableSymbol: "770002", startDate: lease.startDate, financialTrackingFromPeriod: "2026-01", rentCents: 120000, servicesCents: 0 } });
  expect((await loadPayerDisplayNames(f.admin, [input])).has(tx.id)).toBe(false);
  expect((await db.inboxPayment.findUniqueOrThrow({ where: { id: row.id } })).rawExcerpt).toBe("Původní bankovní údaj bez jména");
});

test("shared account is not guessed from outgoing VS and a superadmin can route to a linked inactive house", async ({ page }) => {
  const f = await fixture();
  const other = await db.property.create({ data: { name: `Neaktivní ${f.token}`, address: "Testovací 2", city: "Test", ownerId: f.owner.id, active: false } });
  await db.propertyPaymentAccount.create({ data: { propertyId: other.id, ownerBankAccountId: f.account.id } });
  const row = await f.inbox(-10000, { variableSymbol: "770001" });
  expect((await materializeInboxPayment(row.id)).imported).toBe(false);
  await reconcileInboxReview(row.id);
  const task = await db.task.findUniqueOrThrow({ where: { dedupeKey: `bank-review:inbox:${row.id}` } });
  expect(task.propertyId).toBeNull();
  expect((await db.user.findUniqueOrThrow({ where: { id: task.assigneeId! } })).role).toBe("SUPER_ADMIN");
  await login(page);
  await page.goto(`/platby/nesparovane/email/${row.id}`);
  await page.getByLabel("Nemovitost", { exact: true }).selectOption(other.id);
  await page.getByRole("button", { name: "Předat výdaj k posouzení" }).click();
  await expect(page.getByRole("status")).toContainText("Odchozí pohyb byl předán");
  const saved = await db.inboxPayment.findUniqueOrThrow({ where: { id: row.id } });
  expect(saved.propertyId).toBe(other.id);
  expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("DONE");
});
