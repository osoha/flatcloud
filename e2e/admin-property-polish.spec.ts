import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { prisma as db } from "../lib/db";
import { documentAccessWhere } from "../lib/documents/access";
import { responsibleUserForUnit } from "../lib/housing-responsibility";

test.setTimeout(120000);
const tag = randomUUID(), password = "Polish-Isolated-2026";
let f: Awaited<ReturnType<typeof fixture>>;
async function fixture() {
  const hash = await bcrypt.hash(password, 8);
  const actor = async (name: string, role: "SUPER_ADMIN" | "OWNER_VIEWER" | "PROPERTY_MANAGER") => db.user.create({ data: { name, email: `${name}-${tag}@flatcloud.test`, passwordHash: hash, role, isTestIdentity: true, defaultDisplayMode: "pro", onboardingStatus: "completed" } });
  const admin = await actor("polish-admin", "SUPER_ADMIN"), viewer = await actor("polish-owner", "OWNER_VIEWER"), manager = await actor("polish-manager", "PROPERTY_MANAGER"), outsider = await actor("polish-outsider", "OWNER_VIEWER");
  const own = await db.owner.create({ data: { name: `Vlastník ${tag}`, userId: viewer.id } }), foreign = await db.owner.create({ data: { name: `Jiný vlastník ${tag}` } });
  const property = await db.property.create({ data: { name: `Polish ${tag}`, address: "Testovací 1", city: "Praha", ownershipMode: "UNIT_BASED", ownerId: foreign.id, memberships: { create: [{ userId: viewer.id, permission: "VIEW" }, { userId: manager.id, permission: "EDIT" }] } } });
  const unit = await db.unit.create({ data: { propertyId: property.id, label: "Vlastní jednotka", ownerships: { create: { ownerId: own.id } } } });
  const otherUnit = await db.unit.create({ data: { propertyId: property.id, label: "Cizí jednotka", ownerships: { create: { ownerId: foreign.id } } } });
  const tenant = await db.tenant.create({ data: { name: `Nájemník ${tag}` } });
  const lease = await db.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, startDate: new Date("2020-01-01"), financialTrackingFromPeriod: "2020-01", variableSymbol: tag, rentCents: 100000, servicesCents: 0 } });
  const otherLease = await db.lease.create({ data: { unitId: otherUnit.id, tenantId: tenant.id, startDate: new Date("2020-01-01"), financialTrackingFromPeriod: "2020-01", variableSymbol: `other-${tag}`, rentCents: 100000, servicesCents: 0 } });
  const task = await db.task.create({ data: { propertyId: property.id, unitId: unit.id, leaseId: lease.id, title: `Přiřadit odpovědného ${tag}`, createdById: admin.id } });
  const otherTask = await db.task.create({ data: { propertyId: property.id, leaseId: otherLease.id, title: `Cizí případ ${tag}`, createdById: admin.id } });
  const entry = await db.taskEntry.create({ data: { taskId: otherTask.id, kind: "COMMENT", visibility: "OWNER_VISIBLE", body: "Cizí příloha" } });
  const unrelated = await db.task.create({ data: { title: `ČSOB úkol jiného řešitele ${tag}`, assigneeId: manager.id, createdById: admin.id } });
  const personal = await db.task.create({ data: { title: `Vlastní obecný úkol ${tag}`, assigneeId: admin.id, createdById: manager.id } });
  const asset = await db.fileAsset.create({ data: { storageKey: tag, originalName: "synthetic.pdf", mimeType: "application/pdf", sizeBytes: 20, sha256: tag, uploadedById: admin.id } });
  const base = { propertyId: property.id, fileAssetId: asset.id, createdById: admin.id, category: "OTHER" as const };
  const common = await db.document.create({ data: { ...base, title: "Společný dokument" } });
  const ownDoc = await db.document.create({ data: { ...base, unitId: unit.id, title: "Vlastní dokument" } });
  const forbidden = await Promise.all([
    db.document.create({ data: { ...base, unitId: otherUnit.id, title: "Cizí dokument jednotky" } }),
    db.document.create({ data: { ...base, leaseId: otherLease.id, title: "Cizí dokument smlouvy" } }),
    db.document.create({ data: { ...base, taskId: otherTask.id, title: "Cizí dokument úkolu" } }),
    db.document.create({ data: { ...base, taskEntryId: entry.id, title: "Cizí dokument komentáře" } }),
  ]);
  const bank = await db.bankAccount.create({ data: { propertyId: property.id, provider: "test", bankName: "Test", ibanMasked: "test", externalAccountId: tag } });
  for (let i = 0; i < 12; i++) {
    const day = new Date(Date.UTC(2024, i, 10));
    const charge = await db.charge.create({ data: { leaseId: lease.id, period: `2024-${String(i + 1).padStart(2, "0")}`, dueDate: day, amountCents: 100000 } });
    await db.bankTransaction.create({ data: { bankAccountId: bank.id, externalId: `${tag}-${i}`, bookedAt: day, amountCents: 100000, status: "MATCHED", counterpartyName: "Nájemce", allocations: { create: { chargeId: charge.id, amountCents: 100000 } } } });
    await db.rentNotification.create({ data: { leaseId: lease.id, chargeId: charge.id, type: "PAYMENT_NOTICE", status: "SENT", recipient: "test@flatcloud.test", subject: "Syntetická zpráva", body: "Pouze databázový záznam, neodesílá se.", referenceDate: day, createdAt: day, sentAt: day } });
  }
  return { admin, viewer, manager, outsider, own, foreign, property, unit, otherUnit, tenant, lease, task, unrelated, personal, common, ownDoc, forbidden };
}
async function login(page: Page, user: { email: string }) {
  await page.goto("/login"); await page.getByLabel("E-mail", { exact: true }).fill(user.email); await page.getByLabel("Heslo", { exact: true }).fill(password); await page.getByRole("button", { name: "Přihlásit se", exact: true }).click(); await expect(page).toHaveURL(/\/portfolio/);
}
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated database required");
  f = await fixture();
});
test.afterAll(async () => {
  if (f) await db.user.updateMany({ where: { id: { in: [f.admin.id, f.viewer.id, f.manager.id, f.outsider.id] } }, data: { active: false } });
  await db.$disconnect();
});

test("personal queue omits unrelated general tasks and responsible person is editable with a revision guard", async ({ page }) => {
  await login(page, f.admin);
  await page.goto(`/ukoly?properties=${f.property.id}`);
  await expect(page.locator("main")).not.toContainText(f.unrelated.title);
  await expect(page.locator("main")).toContainText(f.personal.title);
  await page.getByRole("link", { name: "Všechny dostupné úkoly", exact: true }).click();
  await expect(page.locator("main")).toContainText(f.unrelated.title);
  await page.goto(`/ukoly/${f.task.id}`);
  const form = page.locator(".task-assignee-form");
  const revision = await form.locator('input[name="revision"]').inputValue();
  await form.getByLabel("Odpovědný za úkol").selectOption(f.manager.id);
  await form.getByRole("button", { name: "Přiřadit odpovědného" }).click();
  await expect(page.getByRole("status")).toContainText("Odpovědný byl přiřazen");
  expect((await db.task.findUniqueOrThrow({ where: { id: f.task.id } })).assigneeId).toBe(f.manager.id);
  await page.request.post(`/api/tasks/${f.task.id}/members`, { form: { action: "assign", userId: f.admin.id, revision } });
  expect((await db.task.findUniqueOrThrow({ where: { id: f.task.id } })).assigneeId).toBe(f.manager.id);
  const fresh = await db.task.findUniqueOrThrow({ where: { id: f.task.id } });
  await page.request.post(`/api/tasks/${f.task.id}/members`, { form: { action: "assign", userId: f.outsider.id, revision: fresh.updatedAt.toISOString() } });
  expect((await db.task.findUniqueOrThrow({ where: { id: f.task.id } })).assigneeId).toBe(f.manager.id);
  expect(await responsibleUserForUnit(f.unit.id)).toBe(f.manager.id);
  await db.userProperty.delete({ where: { userId_propertyId: { userId: f.manager.id, propertyId: f.property.id } } });
  expect(await responsibleUserForUnit(f.unit.id)).toBe(f.viewer.id);
  await db.userProperty.create({ data: { userId: f.manager.id, propertyId: f.property.id, permission: "EDIT" } });
});

test("a shared-house VIEW grant never exposes another owner's direct or indirect documents", async ({ page }) => {
  await login(page, f.viewer);
  const allowed = await db.document.findMany({ where: { AND: [documentAccessWhere(f.viewer), { propertyId: f.property.id }] }, select: { id: true } });
  expect(allowed.map(row => row.id).sort()).toEqual([f.common.id, f.ownDoc.id].sort());
  await page.goto(`/nemovitosti/${f.property.id}/dokumenty`);
  await expect(page.getByRole("heading", { name: "Společné dokumenty objektu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dokumenty po jednotkách" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Cizí dokument");
  await page.locator(".document-unit-group summary").click();
  await expect(page.locator("main")).toContainText("Vlastní dokument");
  for (const document of f.forbidden) expect((await page.request.get(`/api/documents/${document.id}/download`)).status()).toBe(404);
  // Even an unlinked owner with a building VIEW grant gets common documents only.
  await db.userProperty.create({ data: { userId: f.outsider.id, propertyId: f.property.id, permission: "VIEW" } });
  expect((await db.document.findMany({ where: { AND: [documentAccessWhere(f.outsider), { propertyId: f.property.id }] }, select: { id: true } })).map(row => row.id)).toEqual([f.common.id]);
  await db.userProperty.delete({ where: { userId_propertyId: { userId: f.outsider.id, propertyId: f.property.id } } });
});

test("unit histories show ten rows then expand; property tenant and contract rows navigate", async ({ page }, info) => {
  await login(page, f.admin);
  expect((await db.user.findUniqueOrThrow({ where: { id: f.admin.id } })).profiGraphics).toBe(true);
  await page.goto(`/nemovitosti/${f.property.id}/jednotky/${f.unit.id}`);
  const histories = page.locator(".recent-history");
  await expect(histories).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const history = histories.nth(i);
    await expect(history.locator(":scope > .table-wrap tbody tr")).toHaveCount(10);
    await history.locator("summary").click();
    await expect(history.locator("details tbody tr")).toHaveCount(2);
  }
  await page.screenshot({ path: info.outputPath("unit-histories-desktop.png"), fullPage: true });
  await page.goto(`/nemovitosti/${f.property.id}/najemnici`);
  await page.locator(".navigable-table-row").first().locator("td").nth(2).click();
  await expect(page).toHaveURL(new RegExp(`/najemnici/${f.tenant.id}`));
  await page.goto(`/nemovitosti/${f.property.id}/smlouvy`);
  const leaseRow = page.locator(".navigable-table-row").filter({ has: page.locator(`a[href="/smlouvy/${f.lease.id}"]`) });
  await leaseRow.locator("td").nth(3).click();
  await expect(page).toHaveURL(new RegExp(`/smlouvy/${f.lease.id}`));
  await page.goto(`/nemovitosti/${f.property.id}/platby`);
  await expect(page.getByRole("columnheader", { name: "Jednotka", exact: true })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText(f.unit.label);
});

test("admin and property layouts preserve controls on desktop and mobile", async ({ page }, info) => {
  await login(page, f.admin);
  const routes = ["/nastaveni/system", "/nastaveni/oznameni", "/nastaveni/automaticke-ukoly", "/nastaveni/cenovy-benchmark", "/reporty/sablony", `/nemovitosti/${f.property.id}/nastaveni`, `/nemovitosti/${f.property.id}/technicke-udaje`, `/nemovitosti/${f.property.id}/finance`, `/nemovitosti/${f.property.id}/meridla`];
  for (const [index, route] of routes.entries()) {
    const response = await page.goto(route); expect(response?.status()).toBe(200);
    await expect(page.locator("main h1")).toBeVisible();
    await page.screenshot({ path: info.outputPath(`polish-desktop-${index}.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`polish-mobile-${index}.png`), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});
