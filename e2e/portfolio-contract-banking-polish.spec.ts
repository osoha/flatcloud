import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { prisma as db } from "../lib/db";
import { defaultBasicPortfolioView } from "../lib/basic-portfolio-view";

const password = "Portfolio-Polish-QA-Only-2026";
test.setTimeout(90000);
async function login(page: Page, email: string) {
  await page.goto("/login"); await page.getByLabel("E-mail", {exact: true}).fill(email);
  await page.getByLabel("Heslo", {exact: true}).fill(password);
  await page.getByRole("button", {name: "Přihlásit se", exact: true}).click();
  await expect(page).not.toHaveURL(/\/login/);
}
async function authHeaders(page: Page) { return {Cookie: (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join("; ")}; }
async function fixture() {
  const tag = randomUUID(), hash = await bcrypt.hash(password, 10);
  const actor = await db.user.create({data: {email: `polish-admin-${tag}@flatcloud.test`, name: "Správce polish QA", role: "SUPER_ADMIN", passwordHash: hash, isTestIdentity: true, onboardingStatus: "completed", defaultDisplayMode: "pro"}});
  const manager = await db.user.create({data: {email: `polish-manager-${tag}@flatcloud.test`, name: "Správce jedné jednotky QA", role: "PROPERTY_MANAGER", passwordHash: hash, isTestIdentity: true, onboardingStatus: "completed", defaultDisplayMode: "pro"}});
  const reader = await db.user.create({data: {email: `polish-reader-${tag}@flatcloud.test`, name: "Čtenář QA", role: "OWNER_VIEWER", allProperties: true, passwordHash: hash, isTestIdentity: true, onboardingStatus: "completed", defaultDisplayMode: "pro"}});
  const owner = await db.owner.create({data: {name: `Vlastník polish ${tag}`, userId: manager.id}});
  const otherOwner = await db.owner.create({data: {name: `Jiný vlastník polish ${tag}`}});
  const account = await db.ownerBankAccount.create({data: {ownerId: owner.id, label: `Hlavní účet ${tag}`, accountNumber: "2000145399", bankCode: "0800", notificationVerifiedAt: new Date()}});
  const foreignAccount = await db.ownerBankAccount.create({data: {ownerId: otherOwner.id, label: `Cizí účet ${tag}`, accountNumber: "123123", bankCode: "0300"}});
  const property = await db.property.create({data: {ownerId: owner.id, name: `Polish dům A ${tag}`, address: "Testovací 1", city: "Praha"}});
  const other = await db.property.create({data: {ownerId: otherOwner.id, name: `Polish dům B ${tag}`, address: "Testovací 2", city: "Praha"}});
  const units = await Promise.all(Array.from({length: 7}, (_, index) => db.unit.create({data: {propertyId: property.id, label: `Jednotka ${index + 1}`, areaM2: index === 6 ? 0 : 50, type: index === 6 ? "PARKING" : "APARTMENT", ownerships: {create: {ownerId: owner.id, ownerBankAccountId: account.id}}, ...(index === 0 ? {userAccesses: {create: {userId: manager.id, permission: "EDIT"}}} : {})}})));
  const foreignUnit = await db.unit.create({data: {propertyId: other.id, label: "Cizí jednotka", ownerships: {create: {ownerId: otherOwner.id, ownerBankAccountId: foreignAccount.id}}}});
  const tenants = await Promise.all(Array.from({length: 43}, (_, index) => db.tenant.create({data: {name: `Polish ${String(index).padStart(2, "0")} ${tag}`, createdById: manager.id, payerAccounts: index === 42 ? ["987654321/0300"] : [], propertyLinks: {create: {propertyId: property.id}}}})));
  const foreignTenant = await db.tenant.create({data: {name: `Cizí nájemník ${tag}`, propertyLinks: {create: {propertyId: other.id}}}});
  const start = new Date(); start.setUTCFullYear(start.getUTCFullYear() - 1); start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(); end.setUTCDate(end.getUTCDate() + 30);
  const lease = await db.lease.create({data: {unitId: units[0].id, tenantId: tenants[0].id, startDate: start, endDate: end, financialTrackingFromPeriod: "2025-01", variableSymbol: `polish-${tag}`, contractNumber: "QA přiřazení dokumentu", rentCents: 100000, servicesCents: 0, ownerBankAccountId: account.id, autoChargesEnabled: false}});
  const anniversary = await db.lease.create({data: {unitId: units[1].id, tenantId: tenants[1].id, startDate: start, financialTrackingFromPeriod: "2025-01", variableSymbol: `anniversary-${tag}`, rentCents: 100000, servicesCents: 0, ownerBankAccountId: account.id, autoChargesEnabled: false}});
  const future = await db.lease.create({data: {unitId: units[2].id, tenantId: tenants[2].id, startDate: new Date("2030-01-01T12:00Z"), endDate: new Date("2030-12-31T12:00Z"), financialTrackingFromPeriod: "2030-01", variableSymbol: `future-${tag}`, rentCents: 100000, servicesCents: 0, autoChargesEnabled: false}});
  const asset = await db.fileAsset.create({data: {storageKey: `polish/${tag}.pdf`, originalName: "dokument.pdf", mimeType: "application/pdf", sizeBytes: 25, sha256: tag, uploadedById: actor.id}});
  const document = await db.document.create({data: {propertyId: property.id, unitId: units[0].id, fileAssetId: asset.id, title: "Nepřiřazený dokument QA", category: "PHOTO", createdById: actor.id}});
  return {tag, actor, manager, reader, owner, otherOwner, account, foreignAccount, property, other, units, foreignUnit, tenants, foreignTenant, lease, anniversary, future, asset, document};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
let f: Fixture;
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated database required");
  f = await fixture();
});
test.afterAll(async () => {
  if (f) {
    const properties = [f.property.id, f.other.id], users = [f.actor.id, f.manager.id, f.reader.id];
    await db.auditLog.deleteMany({where: {OR: [{propertyId: {in: properties}}, {userId: {in: users}}]}});
    await db.document.deleteMany({where: {propertyId: {in: properties}}});
    await db.fileAsset.deleteMany({where: {id: f.asset.id}});
    await db.task.deleteMany({where: {propertyId: {in: properties}}});
    await db.lease.deleteMany({where: {unit: {propertyId: {in: properties}}}});
    await db.unit.deleteMany({where: {propertyId: {in: properties}}});
    await db.property.deleteMany({where: {id: {in: properties}}});
    await db.tenant.deleteMany({where: {id: {in: [...f.tenants.map(row => row.id), f.foreignTenant.id]}}});
    await db.ownerBankAccount.deleteMany({where: {ownerId: {in: [f.owner.id, f.otherOwner.id]}}});
    await db.owner.deleteMany({where: {id: {in: [f.owner.id, f.otherOwner.id]}}});
    await db.user.deleteMany({where: {id: {in: users}}});
  }
  await db.$disconnect();
});

test("only the selected tab is blue; actual hover changes an inactive tab", async ({page}) => {
  await login(page, f.actor.email);
  for (const [url, selector] of [[`/smlouvy?properties=${f.property.id}`, ".registry-tabs"], [`/reporty?properties=${f.property.id}`, ".report-tabs"]]) {
    await page.goto(url); const links = page.locator(`${selector} a`);
    await expect(page.locator(`${selector} a[aria-current=page]`)).toHaveCount(1);
    const inactive = links.nth(1);
    const before = await inactive.evaluate(el => getComputedStyle(el).backgroundColor);
    await inactive.hover(); await page.waitForTimeout(200);
    expect(await inactive.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(before);
    await inactive.click(); await expect(inactive).toHaveAttribute("aria-current", "page");
    await expect(page.locator(`${selector} a[aria-current=page]`)).toHaveCount(1);
  }
});

test("lease badge and expiry KPI agree in the selected portfolio without counting anniversaries", async ({page}) => {
  await login(page, f.actor.email);
  await page.goto(`/smlouvy?properties=${f.property.id}&view=EXPIRING`);
  await expect(page.locator('.sidebar a[href*="/smlouvy"] .nav-count')).toHaveText("1");
  await expect(page.locator('a.stat[href*="view=EXPIRING"] strong')).toHaveText("1");
  await expect(page.locator(".registry-table tbody tr")).toHaveCount(1);
  await page.goto(`/smlouvy?properties=${f.other.id}&view=EXPIRING`);
  await expect(page.locator('.sidebar a[href*="/smlouvy"] .nav-count')).toHaveCount(0);
  await expect(page.locator('a.stat[href*="view=EXPIRING"] strong')).toHaveText("0");
});

test("document assignment is editable with EDIT, preserves the file, remains private and rejects another unit", async ({page}) => {
  await login(page, f.manager.email); await page.goto(`/dokumenty?properties=${f.property.id}`);
  const card = page.locator(`[data-document-id="${f.document.id}"]`);
  await card.getByText("Upravit zařazení", {exact: true}).click();
  await card.getByLabel("Kategorie dokumentu").selectOption("CONTRACT");
  await card.getByLabel("Přiřazení ke smlouvě").selectOption(f.lease.id);
  await card.getByRole("button", {name: "Uložit zařazení"}).click();
  await expect(page).toHaveURL(/ok=/);
  const document = await db.document.findUniqueOrThrow({where: {id: f.document.id}});
  expect([document.leaseId, document.category, document.fileAssetId, document.tenantVisible]).toEqual([f.lease.id, "CONTRACT", f.asset.id, false]);
  await expect(card.getByRole("button", {name: "Zpřístupnit nájemníkovi"})).toBeVisible();
  const history = await db.lease.create({data: {unitId: f.units[0].id, tenantId: f.tenants[3].id, startDate: new Date("2024-01-01T12:00Z"), endDate: new Date("2024-12-31T12:00Z"), financialTrackingFromPeriod: "2024-01", variableSymbol: `history-${f.tag}`, rentCents: 100000, servicesCents: 0, autoChargesEnabled: false}});
  await db.document.update({where: {id: f.document.id}, data: {tenantVisible: true}});
  const reassigned = await page.request.post(`/api/documents/${f.document.id}/metadata`, {headers: await authHeaders(page), form: {title: document.title, category: "CONTRACT", leaseId: history.id, returnTo: "/dokumenty"}, maxRedirects: 0});
  expect(reassigned.headers().location).toContain("ok=");
  const after = await db.document.findUniqueOrThrow({where: {id: f.document.id}});
  expect([after.leaseId, after.tenantVisible, after.fileAssetId]).toEqual([history.id, false, f.asset.id]);
  const denied = await page.request.post(`/api/documents/${f.document.id}/metadata`, {headers: await authHeaders(page), form: {title: "Nepřiřazený dokument QA", category: "CONTRACT", leaseId: f.anniversary.id, returnTo: "/dokumenty"}, maxRedirects: 0});
  expect(denied.headers().location).toContain("error=");
  expect((await db.document.findUniqueOrThrow({where: {id: f.document.id}})).leaseId).toBe(history.id);
  expect((await page.request.post(`/api/documents/${f.document.id}/metadata`, {headers: {...await authHeaders(page), Origin: "https://outside.example"}, form: {title: "CSRF", category: "OTHER", leaseId: ""}, maxRedirects: 0})).status()).toBe(403);
});

test("global read access exposes no document edit controls and cannot change metadata", async ({page}) => {
  await login(page, f.reader.email); await page.goto(`/dokumenty?properties=${f.property.id}`);
  const card = page.locator(`[data-document-id="${f.document.id}"]`);
  await expect(card.getByText("Upravit zařazení", {exact: true})).toHaveCount(0);
  const response = await page.request.post(`/api/documents/${f.document.id}/metadata`, {headers: await authHeaders(page), form: {title: "Forbidden", category: "OTHER", leaseId: "", returnTo: "/dokumenty"}, maxRedirects: 0});
  expect(response.headers().location).toContain("error=");
  expect((await db.document.findUniqueOrThrow({where: {id: f.document.id}})).title).toBe("Nepřiřazený dokument QA");
});

test("tenant search pages the directory, protects foreign profiles and respects planned lease dates", async ({page}) => {
  await login(page, f.manager.email); await page.goto(`/nemovitosti/${f.property.id}/smlouvy/nova?unitId=${f.units[6].id}`);
  const select = page.locator('select[name="tenantId"]');
  await expect(select.locator("option")).toHaveCount(41);
  await page.getByLabel("Hledat nájemníka", {exact: true}).fill(`Polish 42 ${f.tag}`);
  await expect(select.locator(`option[value="${f.tenants[42].id}"]`)).toHaveCount(1);
  await select.selectOption(f.tenants[42].id);
  await expect(page.getByLabel("Účet nájemníka ve smlouvě")).toHaveValue("987654321/0300");
  await page.getByLabel("Hledat nájemníka", {exact: true}).fill("nenalezená osoba");
  await expect(select).toHaveValue(f.tenants[42].id);
  const response = await page.request.get(`/api/properties/${f.property.id}/lease-tenants?scope=AVAILABLE&selected=${f.foreignTenant.id}`, {headers: await authHeaders(page)});
  const directory = await response.json(); expect(directory.selected).toEqual([]);
  const free = async (startDate: string, endDate: string) => (await (await page.request.get(`/api/properties/${f.property.id}/lease-tenants?scope=PROPERTY&free=1&startDate=${startDate}&endDate=${endDate}&q=Polish%2002`, {headers: await authHeaders(page)})).json()).options.map((row: string[]) => row[0]);
  expect(await free("2027-01-01", "2027-12-31")).toContain(f.tenants[2].id);
  expect(await free("2030-01-01", "2030-02-01")).not.toContain(f.tenants[2].id);
  // Contract creation requires a whole-property EDIT grant, beyond the unit's document grant.
  const grant = await db.userProperty.create({data: {propertyId: f.property.id, userId: f.manager.id, permission: "EDIT"}});
  const forged = await page.request.post(`/api/properties/${f.property.id}/leases`, {headers: await authHeaders(page), form: {tenantId: f.foreignTenant.id, unitId: f.units[6].id}, maxRedirects: 0});
  expect(forged.headers().location).toContain("error=");
  expect(await db.lease.count({where: {tenantId: f.foreignTenant.id}})).toBe(0);
  await db.userProperty.deleteMany({where: {userId: grant.userId, propertyId: grant.propertyId}});
});

test("bank filters remain scoped, account detail is compact and Berry launches the wizard", async ({page}, info) => {
  await login(page, f.manager.email); await page.goto("/bankovni-ucty");
  await expect(page.locator(".bank-account-row")).toHaveCount(1);
  await expect(page.locator(".bank-account-row")).not.toHaveAttribute("open");
  await expect(page.locator("main")).not.toContainText(f.foreignAccount.label!);
  await page.getByRole("button", {name: "Spustit krokového průvodce s Berrym"}).click();
  await expect(page.getByRole("dialog", {name: "Průvodce propojením banky"})).toBeVisible();
  await page.getByRole("button", {name: "Zavřít průvodce"}).click();
  await page.getByLabel("Hledat účet").fill("nenalezený účet"); await page.getByRole("button", {name: "Filtrovat", exact: true}).click();
  await expect(page.locator(".bank-account-row")).toHaveCount(0);
  await page.goto(`/bankovni-ucty?unitId=${f.units[0].id}#pridat-ucet`);
  await expect(page.locator("#pridat-ucet form")).toBeVisible();
  await page.screenshot({path: info.outputPath("bank-accounts-desktop.png"), fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({path: info.outputPath("bank-accounts-mobile.png"), fullPage: true});
});

test("Basic groups larger portfolios, drills into a building and remembers the manual view", async ({page}) => {
  expect(defaultBasicPortfolioView(6, 2)).toBe("units"); expect(defaultBasicPortfolioView(7, 2)).toBe("buildings"); expect(defaultBasicPortfolioView(50, 1)).toBe("units");
  await login(page, f.actor.email);
  const scope = `${f.property.id},${f.other.id}`;
  await page.request.post("/api/display-mode", {headers: await authHeaders(page), maxRedirects: 0, form: {mode: "basic", returnTo: `/portfolio?properties=${scope}`}});
  await page.goto(`/portfolio?properties=${scope}`);
  await expect(page.locator("[data-portfolio-view=buildings] .basic-property-card")).toHaveCount(2);
  await page.locator('[data-portfolio-view=buildings] .basic-property-name').first().click();
  await expect(page.locator("[data-portfolio-view=units]")).toBeVisible();
  await page.getByRole("link", {name: "← Zpět na budovy"}).click();
  await expect(page.locator("[data-portfolio-view=buildings] .basic-property-card")).toHaveCount(2);
  await page.getByRole("form", {name: "Pohled na nemovitosti"}).getByRole("button", {name: "Jednotky", exact: true}).click();
  await expect(page.locator("[data-portfolio-view=units] .basic-property-card")).toHaveCount(8);
  await page.reload(); await expect(page.locator("[data-portfolio-view=units]")).toBeVisible();
});

test("a vacant zero-area unit offers a prefilled new contract and displays zero", async ({page}) => {
  await login(page, f.actor.email); await page.goto(`/nemovitosti/${f.property.id}/jednotky/${f.units[6].id}#smlouva`);
  const empty = page.locator("#smlouva");
  await expect(page.locator(".unit-hero")).toContainText("0 m²");
  await expect(empty.getByRole("link", {name: "Nová smlouva"})).toHaveAttribute("href", `/nemovitosti/${f.property.id}/smlouvy/nova?unitId=${f.units[6].id}`);
  await empty.getByRole("link", {name: "Nová smlouva"}).click();
  await expect(page.locator('select[name="unitId"]')).toHaveValue(f.units[6].id);
});
