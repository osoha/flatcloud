import {expect, test, type Page, type TestInfo} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
import {randomUUID} from "node:crypto";

const db = new PrismaClient();
const password = "User-Settings-Isolated-2026";
test.beforeAll(() => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated database required");
});
test.afterAll(() => db.$disconnect());
async function login(page: Page, email: string, pass = password) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(pass);
  await page.getByRole("button", {name: "Přihlásit se", exact: true}).click();
  await expect(page).not.toHaveURL(/\/login/);
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await page.locator('.form-page > .card, .form-page > .page-title, [data-testid="user-access-form"]').evaluateAll(elements => elements.every(element => element.getBoundingClientRect().right <= innerWidth + 1))).toBe(true);
  await page.screenshot({path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled"});
}

test("archived permissions survive closed and older forms, explicit revocation still needs confirmation", async ({page}, info) => {
  test.setTimeout(90000);
  const tag = randomUUID();
  const user = await db.user.create({data: {name: "Testovací správkyně s delším jménem", email: `settings-${tag}@flatcloud.test`, role: "PROPERTY_MANAGER", passwordHash: await bcrypt.hash(password, 8), isTestIdentity: true}});
  const owner = await db.owner.create({data: {name: `Vlastník ${tag}`}});
  const active = await db.property.create({data: {ownerId: owner.id, name: "Aktivní testovací dům", address: "Zahradní 12", city: "Praha", memberships: {create: {userId: user.id, permission: "EDIT"}}}});
  const archive = await db.property.create({data: {ownerId: owner.id, name: "Archivovaný testovací dům", address: "Dlouhá 24", city: "Praha", active: false, memberships: {create: {userId: user.id, permission: "ADMIN"}}}});
  const unit = await db.unit.create({data: {propertyId: archive.id, label: "Archivovaný byt 12", userAccesses: {create: {userId: user.id, permission: "VIEW"}}}});
  try {
    await login(page, process.env.INITIAL_ADMIN_EMAIL!, process.env.INITIAL_ADMIN_PASSWORD!);
    await page.goto(`/uzivatele?q=${encodeURIComponent(user.email)}`);
    const add = page.getByTestId("add-user");
    await expect(add).not.toHaveAttribute("open", "");
    await expect(add.getByRole("button", {name: "Přidat uživatele", exact: true})).toBeHidden();
    await shot(page, info, "users-desktop");
    await page.setViewportSize({width: 390, height: 844});
    await shot(page, info, "users-mobile");
    await page.goto(`/uzivatele/${user.id}`);
    const archived = page.getByTestId("archived-property-permissions");
    await expect(archived).not.toHaveAttribute("open", "");
    await expect(page.locator('input[type="file"]')).toBeHidden();
    await shot(page, info, "user-edit-mobile");
    await page.setViewportSize({width: 1440, height: 1000});
    await archived.locator("summary").first().click();
    await expect(page.getByLabel(`Oprávnění pro nemovitost ${archive.name}`, {exact: true})).toHaveValue("ADMIN");
    await expect(page.getByLabel(`Oprávnění pro jednotku ${unit.label} v ${archive.name}`, {exact: true})).toHaveValue("VIEW");
    await shot(page, info, "user-edit-archived-desktop");
    await archived.locator("summary").first().click();
    await page.getByLabel("Telefon", {exact: true}).fill("+420777123456");
    await page.getByRole("button", {name: "Uložit změny uživatele"}).click();
    await expect(page).toHaveURL(/ok=/);
    expect(await db.userProperty.count({where: {userId: user.id}})).toBe(2);
    expect(await db.userUnit.count({where: {userId: user.id, unitId: unit.id}})).toBe(1);
    const headers = {Cookie: (await page.context().cookies()).map(c => `${c.name}=${c.value}`).join("; ")};
    const olderForm = {name: user.name, email: user.email, role: user.role, active: "on", [`property:${active.id}`]: "EDIT"};
    const saved = await page.request.post(`/api/users/${user.id}`, {headers, multipart: olderForm, maxRedirects: 0});
    expect(saved.headers().location).toContain("ok=");
    expect(await db.userProperty.count({where: {userId: user.id, propertyId: archive.id, permission: "ADMIN"}})).toBe(1);
    expect(await db.userUnit.count({where: {userId: user.id, unitId: unit.id}})).toBe(1);
    const revoke = {...olderForm, [`property:${archive.id}`]: "", [`unit:${unit.id}`]: ""};
    const denied = await page.request.post(`/api/users/${user.id}`, {headers, multipart: revoke, maxRedirects: 0});
    expect(denied.headers().location).toContain("error=");
    expect(await db.userProperty.count({where: {userId: user.id, propertyId: archive.id}})).toBe(1);
    const confirmed = await page.request.post(`/api/users/${user.id}`, {headers, multipart: {...revoke, confirmAccessChange: "on"}, maxRedirects: 0});
    expect(confirmed.headers().location).toContain("ok=");
    expect(await db.userProperty.count({where: {userId: user.id, propertyId: archive.id}})).toBe(0);
    expect(await db.userUnit.count({where: {userId: user.id, unitId: unit.id}})).toBe(0);
  } finally {
    await db.auditLog.deleteMany({where: {entityId: user.id}});
    await db.property.deleteMany({where: {id: {in: [active.id, archive.id]}}});
    await db.owner.delete({where: {id: owner.id}});
    await db.user.delete({where: {id: user.id}});
  }
});

test("whole-house manager is the portal contact and request assignee before the landlord", async ({page}, info) => {
  const tag = randomUUID(), passwordHash = await bcrypt.hash(password, 8);
  const manager = await db.user.create({data: {name: "Správkyně testovacího domu", email: `manager-${tag}@flatcloud.test`, phone: "+420777123456", role: "PROPERTY_MANAGER", passwordHash, isTestIdentity: true, avatarMimeType: "image/png", avatarData: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzfoAAAAASUVORK5CYII=", "base64")}});
  const actor = await db.user.create({data: {name: "Testovací nájemník", email: `tenant-${tag}@flatcloud.test`, role: "TENANT", passwordHash, isTestIdentity: true}});
  const owner = await db.owner.create({data: {name: "Pronajímatel testovacího domu", email: "landlord@example.test"}});
  const property = await db.property.create({data: {ownerId: owner.id, ownershipMode: "WHOLE_OBJECT", name: "Dům se správkyní", address: "Testovací 24", city: "Praha", memberships: {create: {userId: manager.id, permission: "ADMIN"}}}});
  const unit = await db.unit.create({data: {propertyId: property.id, label: "Byt 3"}});
  const tenant = await db.tenant.create({data: {name: actor.name, email: actor.email}});
  const lease = await db.lease.create({data: {unitId: unit.id, tenantId: tenant.id, startDate: new Date("2025-01-01"), financialTrackingFromPeriod: "2025-01", rentCents: 1000000, servicesCents: 0, variableSymbol: String(Date.now()).slice(-9)}});
  await db.tenantPortalAccess.create({data: {userId: actor.id, tenantId: tenant.id}});
  try {
    await login(page, actor.email);
    await page.goto(`/portal/najemnik/${tenant.id}`);
    const contact = page.locator(`#kontakt-${lease.id}`);
    await expect(contact).toContainText(manager.name);
    await expect(contact).not.toContainText(owner.name);
    await expect(contact.getByRole("link", {name: manager.email, exact: true})).toBeVisible();
    const headers = {Cookie: (await page.context().cookies()).map(c => `${c.name}=${c.value}`).join("; "), Accept: "application/json"};
    expect((await page.request.get(`/api/portal/tenants/${tenant.id}/manager-avatar/${manager.id}`, {headers})).status()).toBe(200);
    expect((await page.request.get(`/api/portal/tenants/${tenant.id}/manager-avatar/${actor.id}`, {headers})).status()).toBe(404);
    const message = await page.request.post(`/api/portal/tenants/${tenant.id}/conversations`, {headers, multipart: {leaseId: lease.id, title: "Dotaz pro správkyni", body: "Prosím o informaci k testovacímu bydlení.", submissionKey: randomUUID()}});
    expect(message.ok(), await message.text()).toBe(true);
    const taskId = (await message.json()).taskId;
    expect((await db.task.findUniqueOrThrow({where: {id: taskId}})).assigneeId).toBe(manager.id);
    await shot(page, info, "portal-manager-desktop");
    await db.userProperty.deleteMany({where: {userId: manager.id, propertyId: property.id}});
    await page.reload();
    await expect(contact).toContainText(owner.name);
    await expect(contact).not.toContainText(manager.name);
    expect((await page.request.get(`/api/portal/tenants/${tenant.id}/manager-avatar/${manager.id}`, {headers})).status()).toBe(404);
  } finally {
    await db.task.deleteMany({where: {propertyId: property.id}});
    await db.auditLog.deleteMany({where: {OR: [{propertyId: property.id}, {userId: {in: [actor.id, manager.id]}}]}});
    await db.property.delete({where: {id: property.id}});
    await db.tenant.delete({where: {id: tenant.id}});
    await db.owner.delete({where: {id: owner.id}});
    await db.user.deleteMany({where: {id: {in: [manager.id, actor.id]}}});
  }
});
