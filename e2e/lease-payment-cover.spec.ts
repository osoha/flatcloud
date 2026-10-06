import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

const db = new PrismaClient(), password = "Payment-Cover-QA-Only-2026";
test.beforeAll(() => { if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated test database required"); });
test.afterAll(() => db.$disconnect());
async function login(page: Page, email: string) { await page.goto("/login"); await page.getByLabel("E-mail", { exact: true }).fill(email); await page.getByLabel("Heslo", { exact: true }).fill(password); await page.getByRole("button", { name: "Přihlásit se", exact: true }).click(); await expect(page).not.toHaveURL(/\/login/); }
// Production cookies are Secure. Chromium accepts them on loopback HTTP, while
// APIRequestContext does not send them automatically; reuse the signed-in session.
async function sessionHeaders(page: Page) { return { Cookie: (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join("; ") }; }

test("saved future payment cover exports only authorized server data and never changes payments", async ({ page, browser }, info) => {
  test.setTimeout(90000);
  const tag = randomUUID(), passwordHash = await bcrypt.hash(password, 8), now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 12)), next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 12)), previousEnd = new Date(next.getTime() - 86400000), version = next.toISOString().slice(0, 10);
  const viewer = await db.user.create({ data: { name: "Platební list QA", email: `cover-${tag}@flatcloud.test`, role: "OWNER_VIEWER", passwordHash, isTestIdentity: true } });
  const outsider = await db.user.create({ data: { name: "Cizí čtenář QA", email: `cover-other-${tag}@flatcloud.test`, role: "OWNER_VIEWER", passwordHash, isTestIdentity: true } });
  const owner = await db.owner.create({ data: { name: "Platební list vlastník QA" } });
  const account = await db.ownerBankAccount.create({ data: { ownerId: owner.id, accountNumber: "2000145399", bankCode: "0800", currency: "CZK" } });
  const property = await db.property.create({ data: { name: "Platební list QA", address: "Ukázková 24", city: "Brno", postalCode: "60200", ownerId: owner.id, memberships: { create: { userId: viewer.id, permission: "VIEW" } } } });
  const unit = await db.unit.create({ data: { label: "Byt 12", propertyId: property.id } });
  const tenant = await db.tenant.create({ data: { name: "Tereza Novotná QA" } });
  const lease = await db.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, ownerBankAccountId: account.id, startDate: start, financialTrackingFromPeriod: start.toISOString().slice(0, 7), contractNumber: "NS-QA-024", rentCents: 1890000, servicesCents: 350001, variableSymbol: "101010101", autoChargesEnabled: false, paymentItems: { create: [
    { name: "Nájemné", category: "RENT", amountCents: 1700100, validFrom: start, validTo: previousEnd }, { name: "Nájemné", category: "RENT", amountCents: 1890000, validFrom: next }, { name: "Voda a teplo", category: "SERVICES", amountCents: 350001, validFrom: start },
  ] } } });
  const url = `/smlouvy/${lease.id}/finance/platebni-list`, api = `/api/leases/${lease.id}/payment-cover?version=${version}`;
  try {
    const anon = await browser.newContext(); expect((await anon.request.get(api)).status()).toBe(404); await anon.close();
    await login(page, viewer.email); await page.goto(url);
    await expect(page.getByRole("heading", { name: "Platební list k dodatku", exact: true })).toBeVisible();
    await expect(page.getByLabel("Uložená platební verze")).toHaveValue(version);
    await expect(page.getByRole("heading", { name: /22\s*400,01/ })).toBeVisible();
    const before = await db.lease.findUniqueOrThrow({ where: { id: lease.id }, include: { paymentItems: true, charges: true, documents: true } });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Stáhnout platební list PDF", exact: true }).click()]);
    expect(download.suggestedFilename()).toBe(`Platebni-list-${version}-NS-QA-024.pdf`); expect(await download.failure()).toBeNull();
    const response = await page.request.get(api + "&rentCents=1&servicesCents=0&account=99999999", { headers: await sessionHeaders(page) });
    expect(response.status(), response.ok() ? "PDF export succeeded" : await response.text()).toBe(200); expect(response.headers()["content-type"]).toBe("application/pdf"); expect(response.headers()["cache-control"]).toContain("no-store"); expect(response.headers()["content-disposition"]).toContain(`Platebni-list-${version}-NS-QA-024.pdf`);
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-"); await info.attach("payment-cover", { body: await response.body(), contentType: "application/pdf" });
    expect((await page.request.get(api.replace(version, "1990-01-01"), { headers: await sessionHeaders(page) })).status()).toBe(404);
    const after = await db.lease.findUniqueOrThrow({ where: { id: lease.id }, include: { paymentItems: true, charges: true, documents: true } }); expect(after).toEqual(before);
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: info.outputPath("payment-cover-mobile.png"), fullPage: true }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const otherContext = await browser.newContext(), other = await otherContext.newPage(); await login(other, outsider.email); expect((await other.request.get(api, { headers: await sessionHeaders(other) })).status()).toBe(404); await other.goto(url); await expect(other.getByRole("heading", { name: "Platební list k dodatku", exact: true })).toHaveCount(0); await otherContext.close();
  } finally {
    await db.lease.delete({ where: { id: lease.id } }); await db.tenant.delete({ where: { id: tenant.id } }); await db.unit.delete({ where: { id: unit.id } }); await db.property.delete({ where: { id: property.id } }); await db.ownerBankAccount.delete({ where: { id: account.id } }); await db.owner.delete({ where: { id: owner.id } }); await db.auditLog.deleteMany({ where: { userId: { in: [viewer.id, outsider.id] } } }); await db.user.deleteMany({ where: { id: { in: [viewer.id, outsider.id] } } });
  }
});
