import {test, expect, type Page} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {randomUUID} from "node:crypto";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import {currentPeriod} from "../lib/period";

const db = new PrismaClient();
const password = "Tenant-Account-Isolated-2026";
test.beforeAll(() => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated CI database required");
});
test.afterAll(() => db.$disconnect());
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo", {exact: true}).fill(password);
  await page.getByRole("button", {name: "Přihlásit se", exact: true}).click();
  await expect(page).not.toHaveURL(/\/login/);
}
async function sessionHeaders(page: Page) {
  return {Cookie: (await page.context().cookies()).map(c => `${c.name}=${c.value}`).join("; ")};
}

test("tenant account supports own avatar and password, revokes old sessions, and keeps previews read-only", async ({page, browser}, info) => {
  test.setTimeout(90000);
  const tag = randomUUID(), hash = await bcrypt.hash(password, 8);
  const tenantUser = await db.user.create({data: {email: `account-${tag}@flatcloud.test`, name: "Jana Účet", role: "TENANT", passwordHash: hash, isTestIdentity: true}});
  const admin = await db.user.create({data: {email: `account-admin-${tag}@flatcloud.test`, name: "Správce náhledu", role: "SUPER_ADMIN", passwordHash: hash, isTestIdentity: true}});
  const owner = await db.owner.create({data: {name: `Account owner ${tag}`}});
  const property = await db.property.create({data: {name: `Account property ${tag}`, address: "Test 1", city: "Praha", ownerId: owner.id}});
  const unit = await db.unit.create({data: {propertyId: property.id, label: "Byt účtu"}});
  const tenant = await db.tenant.create({data: {name: tenantUser.name, email: tenantUser.email}});
  const lease = await db.lease.create({data: {unitId: unit.id, tenantId: tenant.id, startDate: new Date("2020-01-01T12:00Z"), financialTrackingFromPeriod: "2020-01", rentCents: 100000, servicesCents: 0, variableSymbol: `account-${tag}`}});
  const adminPage = await browser.newPage(), oldSession = await browser.newPage();
  try {
    // An account also works before any tenant access has been assigned.
    await login(page, tenantUser.email);
    await page.getByRole("link", {name: "Můj účet", exact: true}).click();
    await expect(page).toHaveURL(/\/ucet$/);
    await expect(page.getByRole("heading", {name: "Můj účet", exact: true})).toBeVisible();
    await expect(page.getByRole("heading", {name: /Vzhled|Podpis a doklady/})).toHaveCount(0);
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await db.tenantPortalAccess.create({data: {userId: tenantUser.id, tenantId: tenant.id}});
    await page.locator(".tp-nav").getByRole("link", {name: "Přehled", exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`/portal/najemnik/${tenant.id}`));
    await page.locator(".tp-nav").getByRole("link", {name: "Můj účet", exact: true}).click();
    await expect(page.locator('.tp-nav a[aria-current="page"]')).toHaveText("Můj účet");

    const image = await sharp({create: {width: 64, height: 64, channels: 3, background: "#287bc7"}}).png().toBuffer();
    await page.getByLabel("Nahrát profilovou fotografii").setInputFiles({name: "own-avatar.png", mimeType: "image/png", buffer: image});
    await page.getByRole("button", {name: "Uložit avatar", exact: true}).click();
    await expect(page.getByAltText(`Avatar uživatele ${tenantUser.name}`)).toBeVisible();
    expect((await page.request.get(`/api/users/${tenantUser.id}/avatar`, {headers: await sessionHeaders(page)})).status()).toBe(200);
    expect((await page.request.get(`/api/users/${admin.id}/avatar`, {headers: await sessionHeaders(page)})).status()).toBe(401);
    expect((await page.request.post("/api/account/receipt-signature", {headers: await sessionHeaders(page), form: {issuanceEnabled: "on"}, maxRedirects: 0})).status()).toBe(403);
    await page.goto("/portfolio");
    await expect(page).toHaveURL(new RegExp(`/portal/najemnik/${tenant.id}`));
    await page.goto("/ucet");
    await page.screenshot({path: info.outputPath("tenant-account-desktop.png"), fullPage: true});
    await page.setViewportSize({width: 390, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({path: info.outputPath("tenant-account-mobile.png"), fullPage: true});

    await login(adminPage, admin.email);
    await adminPage.goto(`/portal/najemnik/${tenant.id}`);
    await expect(adminPage.locator('.tp-nav [aria-disabled="true"]')).toContainText("Můj účet");
    await expect(adminPage.locator('.tp-nav a[href="/ucet"]')).toHaveCount(0);
    await adminPage.request.post("/api/admin/user-preview", {headers: await sessionHeaders(adminPage), form: {userId: tenantUser.id}, maxRedirects: 0});
    await adminPage.goto("/ucet");
    await expect(adminPage.locator(".user-preview-banner")).toContainText("pouze pro čtení");
    const before = await db.user.findUniqueOrThrow({where: {id: tenantUser.id}});
    for (const route of ["avatar", "password"]) {
      expect((await adminPage.request.post(`/api/account/${route}`, {headers: await sessionHeaders(adminPage), form: {removeAvatar: "on", currentPassword: password, newPassword: "Preview-Must-Not-Write-2026", confirmPassword: "Preview-Must-Not-Write-2026"}, maxRedirects: 0})).status()).toBe(403);
    }
    const after = await db.user.findUniqueOrThrow({where: {id: tenantUser.id}});
    expect(after.avatarData).toEqual(before.avatarData);
    expect(after.passwordHash).toBe(before.passwordHash);

    await login(oldSession, tenantUser.email);
    await page.getByLabel("Současné heslo", {exact: true}).fill("wrong-password");
    await page.getByLabel("Nové heslo", {exact: true}).fill("New-Tenant-Account-Password-2026");
    await page.getByLabel("Nové heslo znovu", {exact: true}).fill("New-Tenant-Account-Password-2026");
    await page.getByRole("button", {name: "Změnit heslo", exact: true}).click();
    await expect(page.locator(".error")).toContainText("Současné heslo není správné");
    await page.getByLabel("Současné heslo", {exact: true}).fill(password);
    await page.getByLabel("Nové heslo", {exact: true}).fill("New-Tenant-Account-Password-2026");
    await page.getByLabel("Nové heslo znovu", {exact: true}).fill("New-Tenant-Account-Password-2026");
    await page.getByRole("button", {name: "Změnit heslo", exact: true}).click();
    await expect(page).toHaveURL(/\/ucet\?changed=1/);
    await expect(page.locator(".success-notice")).toContainText("úspěšně změněno");
    expect((await db.user.findUniqueOrThrow({where: {id: tenantUser.id}})).sessionVersion).toBe(before.sessionVersion + 1);
    expect((await db.user.findUniqueOrThrow({where: {id: admin.id}})).passwordHash).toBe(hash);
    await oldSession.goto("/ucet"); await expect(oldSession).toHaveURL(/\/login/);
    await page.locator(".tp-nav").getByRole("link", {name: "Přehled", exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`/portal/najemnik/${tenant.id}`));
  } finally {
    await adminPage.close(); await oldSession.close();
    await db.tenantPortalAccess.deleteMany({where: {tenantId: tenant.id}});
    await db.lease.delete({where: {id: lease.id}}); await db.tenant.delete({where: {id: tenant.id}});
    await db.unit.delete({where: {id: unit.id}}); await db.property.delete({where: {id: property.id}}); await db.owner.delete({where: {id: owner.id}});
    await db.auditLog.deleteMany({where: {userId: {in: [tenantUser.id, admin.id]}}});
    await db.user.deleteMany({where: {id: {in: [tenantUser.id, admin.id]}}});
  }
});

test("Basic keeps scope through task detail and legacy links, includes inactive-property tasks and labels only actual future dues", async ({page}) => {
  test.setTimeout(60000);
  const tag = randomUUID(), hash = await bcrypt.hash(password, 8);
  const user = await db.user.create({data: {email: `basic-polish-${tag}@flatcloud.test`, name: "Ondřej Testovací", role: "PROPERTY_MANAGER", passwordHash: hash, defaultDisplayMode: "basic", isTestIdentity: true}});
  const owner = await db.owner.create({data: {name: `Basic owner ${tag}`}});
  const property = await db.property.create({data: {name: `Basic house ${tag}`, address: "Test 2", city: "Praha", ownerId: owner.id, memberships: {create: {userId: user.id, permission: "EDIT"}}}});
  const archived = await db.property.create({data: {name: `Inactive ${tag}`, address: "Test 3", city: "Praha", ownerId: owner.id, active: false, memberships: {create: {userId: user.id, permission: "EDIT"}}}});
  const unit = await db.unit.create({data: {propertyId: property.id, label: "Byt s předpisy"}});
  const tenant = await db.tenant.create({data: {name: "Nájemník Basic"}});
  const lease = await db.lease.create({data: {unitId: unit.id, tenantId: tenant.id, startDate: new Date("2020-01-01T12:00Z"), financialTrackingFromPeriod: "2020-01", rentCents: 100000, servicesCents: 0, variableSymbol: `basic-${tag}`}});
  const task = await db.task.create({data: {propertyId: property.id, title: `Detail ${tag}`, createdById: user.id, status: "OPEN"}});
  const archivedTask = await db.task.create({data: {propertyId: archived.id, title: `Neaktivní ${tag}`, createdById: user.id, status: "OPEN"}});
  const charge = await db.charge.create({data: {leaseId: lease.id, period: currentPeriod(), dueDate: new Date("2000-01-01T12:00Z"), amountCents: 100000, debtTreatment: "EXCLUDED"}});
  try {
    await login(page, user.email);
    await page.goto(`/portfolio?properties=${archived.id}`);
    await expect(page.locator(".basic-tasks .basic-summary-body > strong")).toHaveText("1");
    await expect(page.locator('.sidebar a[aria-label="Úkoly"] .nav-count')).toHaveText("1");
    await page.locator(".basic-tasks").click();
    await expect(page.locator(".basic-section-list")).toContainText(archivedTask.title);
    await page.goto(`/portfolio?propertyId=${property.id}`);
    await expect(page.locator(".basic-property-card .basic-rent")).toContainText("Mimo běžný dluh");
    await expect(page.locator(".basic-property-card .basic-rent")).not.toContainText("Před splatností");
    await expect(page.locator(".basic-berry-note")).not.toContainText("čeká na splatnost");
    await page.locator(".basic-tasks").click(); await expect(page).toHaveURL(new RegExp(`properties=${property.id}`));
    await page.locator(".basic-section-list").getByRole("link", {name: new RegExp(task.title)}).click();
    await expect(page).toHaveURL(new RegExp(`/ukoly/${task.id}\\?properties=${property.id}`));
    await page.locator(".breadcrumb").getByRole("link", {name: "Úkoly", exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`/ukoly\\?properties=${property.id}`));
    await expect(page.locator(".basic-section-list")).not.toContainText(archivedTask.title);
    await db.charge.update({where: {id: charge.id}, data: {debtTreatment: "CURRENT", dueDate: new Date("2099-01-01T12:00Z")}});
    await page.goto(`/portfolio?properties=${property.id}`);
    await expect(page.locator(".basic-property-card .basic-rent")).toContainText(/Před splatností 1\s000/);
    await expect(page.locator(".basic-payment-late")).toHaveCount(0);
    await expect(page.locator(".basic-berry-note")).toContainText("čeká na splatnost");
    await db.charge.update({where: {id: charge.id}, data: {dueDate: new Date("2000-01-01T12:00Z")}});
    await page.reload(); await expect(page.locator(".basic-payment-late")).toContainText(/Po splatnosti 1\s000/);
  } finally {
    await db.task.deleteMany({where: {id: {in: [task.id, archivedTask.id]}}});
    await db.charge.delete({where: {id: charge.id}}); await db.lease.delete({where: {id: lease.id}}); await db.tenant.delete({where: {id: tenant.id}});
    await db.unit.delete({where: {id: unit.id}}); await db.property.deleteMany({where: {id: {in: [property.id, archived.id]}}}); await db.owner.delete({where: {id: owner.id}});
    await db.auditLog.deleteMany({where: {userId: user.id}}); await db.user.delete({where: {id: user.id}});
  }
});
