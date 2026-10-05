import {expect, test, type Page, type TestInfo} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
import {randomUUID} from "node:crypto";
import {periodLabel} from "../lib/period";

const db = new PrismaClient();
const password = "Portal-Redesign-Isolated-2026";

test.beforeAll(() => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) {
    throw new Error("Isolated CI database required");
  }
});
test.afterAll(() => db.$disconnect());

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", {name: "Přihlásit se", exact: true}).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function headers(page: Page) {
  return {Cookie: (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join("; ")};
}

async function fixture() {
  const tag = randomUUID();
  const passwordHash = await bcrypt.hash(password, 8);
  const manager = await db.user.create({data: {email: `redesign-manager-${tag}@flatcloud.test`, name: "Petra Novotná", phone: "+420777123456", role: "PROPERTY_MANAGER", passwordHash, isTestIdentity: true}});
  const actor = await db.user.create({data: {email: `redesign-tenant-${tag}@flatcloud.test`, name: "Jana Testovací", role: "TENANT", passwordHash, isTestIdentity: true}});
  const otherActor = await db.user.create({data: {email: `redesign-other-${tag}@flatcloud.test`, name: "Pavel Jiný", role: "TENANT", passwordHash, isTestIdentity: true}});
  const payerActor = await db.user.create({data: {email: `redesign-payer-${tag}@flatcloud.test`, name: "Plátce Testovací", role: "TENANT", passwordHash, isTestIdentity: true}});
  const owner = await db.owner.create({data: {name: "Ilustrační vlastník QA"}});
  const property = await db.property.create({data: {ownerId: owner.id, managerId: manager.id, name: "Dům U parku", address: "Testovací 12", city: "Praha", memberships: {create: {userId: manager.id, permission: "EDIT"}}}});
  const unit = await db.unit.create({data: {propertyId: property.id, label: "Byt 5", areaM2: 64}});
  const otherUnit = await db.unit.create({data: {propertyId: property.id, label: "Byt 8"}});
  const tenant = await db.tenant.create({data: {name: actor.name, email: actor.email, type: "PERSON"}});
  const otherTenant = await db.tenant.create({data: {name: otherActor.name, email: otherActor.email}});
  const payer = await db.tenant.create({data: {name: payerActor.name, email: payerActor.email}});
  const ownerBank = await db.ownerBankAccount.create({data: {ownerId: owner.id, accountNumber: "123456789", bankCode: "0100"}});
  const lease = await db.lease.create({data: {unitId: unit.id, tenantId: tenant.id, ownerBankAccountId: ownerBank.id, startDate: new Date("2025-01-01T12:00:00Z"), financialTrackingFromPeriod: "2025-01", variableSymbol: "9152601", rentCents: 1000000, servicesCents: 250000}});
  const otherLease = await db.lease.create({data: {unitId: otherUnit.id, tenantId: otherTenant.id, startDate: new Date("2025-01-01T12:00:00Z"), financialTrackingFromPeriod: "2025-01", variableSymbol: "9152602", rentCents: 1000000, servicesCents: 0}});
  await db.leaseParty.create({data: {leaseId: lease.id, tenantId: payer.id, role: "PAYER"}});
  await db.tenantPortalAccess.createMany({data: [{tenantId: tenant.id, userId: actor.id}, {tenantId: otherTenant.id, userId: otherActor.id}, {tenantId: payer.id, userId: payerActor.id}]});
  const bank = await db.bankAccount.create({data: {ownerId: owner.id, propertyId: property.id, provider: "qa", bankName: "Testovací banka", ibanMasked: "QA", externalAccountId: tag}});
  return {tag, manager, actor, otherActor, payerActor, owner, property, unit, otherUnit, tenant, otherTenant, payer, lease, otherLease, bank, ownerBank};
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function cleanup(f: Fixture) {
  const userIds = [f.manager.id, f.actor.id, f.otherActor.id, f.payerActor.id];
  const tenantIds = [f.tenant.id, f.otherTenant.id, f.payer.id];
  const leaseIds = [f.lease.id, f.otherLease.id];
  await db.announcement.deleteMany({where: {createdById: {in: userIds}}});
  await db.task.deleteMany({where: {propertyId: f.property.id}});
  await db.tenantPaymentReceipt.deleteMany({where: {charge: {leaseId: {in: leaseIds}}}});
  await db.charge.deleteMany({where: {leaseId: {in: leaseIds}}});
  await db.leaseCredit.deleteMany({where: {leaseId: {in: leaseIds}}});
  await db.bankTransaction.deleteMany({where: {bankAccountId: f.bank.id}});
  await db.bankAccount.delete({where: {id: f.bank.id}});
  await db.tenantPortalAccess.deleteMany({where: {tenantId: {in: tenantIds}}});
  await db.leaseParty.deleteMany({where: {leaseId: {in: leaseIds}}});
  await db.lease.deleteMany({where: {id: {in: leaseIds}}});
  await db.tenant.deleteMany({where: {id: {in: tenantIds}}});
  await db.unit.deleteMany({where: {propertyId: f.property.id}});
  await db.property.delete({where: {id: f.property.id}});
  await db.ownerBankAccount.delete({where: {id: f.ownerBank.id}});
  await db.owner.delete({where: {id: f.owner.id}});
  await db.auditLog.deleteMany({where: {userId: {in: userIds}}});
  await db.user.deleteMany({where: {id: {in: userIds}}});
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({path, fullPage: true, animations: "disabled"});
  await info.attach(name, {path, contentType: "image/png"});
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function openDocuments(page: Page, leaseId: string, receipts = false) {
  await page.locator(`main a[href="#dokumenty-${leaseId}${receipts ? "-doklady" : ""}"]`).first().click();
  await expect(page.getByRole("dialog", {name: "Dokumenty", exact: true})).toBeVisible();
}

test("portal gives rent and human contact priority, keeps actions in dialogs and fits desktop/mobile", async ({page}, info) => {
  const f = await fixture();
  try {
    await login(page, f.actor.email);
    await page.goto(`/portal/najemnik/${f.tenant.id}`);
    await expect(page.getByRole("heading", {level: 1})).toHaveText("Dobrý den, Jano!");
    const priority = page.locator(".tp-priority");
    await expect(priority.getByRole("heading", {name: "Můj nájem", exact: true})).toBeVisible();
    await expect(priority.getByRole("heading", {name: "Váš správce", exact: true})).toBeVisible();
    await expect(priority.getByText(f.manager.name, {exact: true})).toBeVisible();
    await expect(priority.locator(`.tenant-portal-call[href="tel:${f.manager.phone}"]`)).toBeVisible();
    await expect(priority.getByRole("link", {name: /Napsat správci/})).toHaveAttribute("href", `mailto:${f.manager.email}`);
    const messages = page.locator(`#zpravy-${f.lease.id}`);
    await expect(messages).toBeVisible();
    const before = await priority.evaluate((element, id) => Boolean(element.compareDocumentPosition(document.getElementById(id)!) & Node.DOCUMENT_POSITION_FOLLOWING), `zpravy-${f.lease.id}`);
    expect(before).toBe(true);
    const priorityBounds = await priority.boundingBox(), messageBounds = await messages.boundingBox();
    expect(priorityBounds!.y + priorityBounds!.height).toBeLessThanOrEqual(messageBounds!.y + 1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("Co se stalo?")).not.toBeVisible();
    await expect(page.getByText("Poslední požadavek", {exact: true})).toHaveCount(0);
    await expect(page.getByRole("heading", {name: "Zaplatit nájem", exact: true})).toHaveCount(0);
    await expect(page.locator("main")).toContainText(f.unit.label);
    await expect(page.locator("main")).toContainText(f.property.address!);
    await noPageOverflow(page);
    await screenshot(page, info, "portal-overview-desktop");
    await page.locator(`main a[href="#domov-${f.lease.id}"]`).first().click();
    const homeDialog = page.getByRole("dialog", {name: "Můj domov", exact: true});
    await expect(homeDialog).toContainText(f.property.address!);
    await expect(homeDialog).toContainText("64 m²");
    await expect(homeDialog).toContainText("Nájem od");
    await expect(homeDialog).toContainText("Na dobu neurčitou");
    await page.keyboard.press("Escape");

    await page.locator(`main a[href="#zavady-${f.lease.id}"]`).click();
    const defectDialog = page.getByRole("dialog", {name: "Požadavky"});
    await expect(defectDialog.getByLabel("Co se stalo?")).toBeVisible();
    await expect(page.getByLabel("Co se stalo?")).toHaveCount(1);
    await expect(defectDialog.getByRole("tab", {name: "Nové hlášení"})).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(defectDialog).not.toBeVisible();
    await openDocuments(page, f.lease.id);
    const docs = page.getByRole("dialog", {name: "Dokumenty", exact: true});
    await expect(docs.getByRole("tab", {name: "Smlouvy a předání"})).toHaveAttribute("aria-selected", "true");
    await docs.getByRole("tab", {name: "Doklady o zaplacení"}).click();
    await expect(docs.getByRole("tab", {name: "Doklady o zaplacení"})).toHaveAttribute("aria-selected", "true");
    await expect(docs).toContainText(/Zatím.*uhrazen/);
    await page.keyboard.press("Escape");

    await page.setViewportSize({width: 390, height: 844});
    await noPageOverflow(page);
    const mobilePriority = await priority.boundingBox(), mobileMessages = await messages.boundingBox();
    expect(mobilePriority!.y + mobilePriority!.height).toBeLessThanOrEqual(mobileMessages!.y + 1);
    await screenshot(page, info, "portal-overview-mobile");
    await page.locator(`main a[href="#zavady-${f.lease.id}"]`).click();
    await expect(defectDialog.getByLabel("Co se stalo?")).toBeVisible();
    await noPageOverflow(page);
    await screenshot(page, info, "portal-defect-mobile");
    await defectDialog.getByRole("button", {name: "Zavřít", exact: true}).click();
    await expect(defectDialog).not.toBeVisible();
  } finally {
    await cleanup(f);
  }
});

test("rent wording and totals distinguish paid, future, overdue and partial payment with offset", async ({page}, info) => {
  const f = await fixture();
  try {
    const paid = await db.charge.create({data: {leaseId: f.lease.id, period: "2025-11", dueDate: new Date("2025-11-05T12:00:00Z"), amountCents: 1250000}});
    await db.bankTransaction.create({data: {bankAccountId: f.bank.id, externalId: `${f.tag}-paid`, bookedAt: new Date("2025-11-04T12:00:00Z"), amountCents: 1250000, status: "MATCHED", allocations: {create: {chargeId: paid.id, amountCents: 1250000}}}});
    await login(page, f.actor.email);
    await page.goto(`/portal/najemnik/${f.tenant.id}`);
    const priority = page.locator(".tp-priority");
    await expect(priority).toContainText("Vše máte uhrazeno");
    await expect(priority).not.toContainText("Aktuálně bez dluhu");
    await expect(priority.getByAltText("QR kód pro úhradu otevřeného předpisu")).toHaveCount(0);
    await expect(page.locator(".portal-payment-history tr.portal-paid")).toContainText("Připsáno");
    await screenshot(page, info, "portal-paid-desktop");

    const future = await db.charge.create({data: {leaseId: f.lease.id, period: "2099-01", dueDate: new Date("2099-01-05T12:00:00Z"), amountCents: 1250000}});
    // A future-booked transaction must neither settle today's rent nor unlock a receipt.
    await db.bankTransaction.create({data: {bankAccountId: f.bank.id, externalId: `${f.tag}-future`, bookedAt: new Date("2099-01-04T12:00:00Z"), amountCents: 1250000, status: "MATCHED", allocations: {create: {chargeId: future.id, amountCents: 1250000}}}});
    await page.reload();
    await expect(page.locator(".portal-payment-history tr.portal-scheduled")).toContainText("Budoucí nájem");
    await expect(priority).not.toContainText("Po splatnosti");
    await openDocuments(page, f.lease.id, true);
    await expect(page.locator("select[name=chargeId] option")).toHaveCount(1);
    await expect(page.locator("select[name=chargeId] option")).toContainText(new RegExp(periodLabel(paid.period), "i"));
    await page.keyboard.press("Escape");

    const overdue = await db.charge.create({data: {leaseId: f.lease.id, period: "2025-12", dueDate: new Date("2025-12-05T12:00:00Z"), amountCents: 1250000}});
    await page.reload();
    await expect(priority).toContainText("Po splatnosti");
    await expect(priority).toContainText(/12\s*500/);
    await expect(priority).not.toContainText("Vše máte uhrazeno");
    await expect(page.locator(".portal-payment-history tr.portal-overdue")).not.toContainText("Částečně");
    await db.bankTransaction.create({data: {bankAccountId: f.bank.id, externalId: `${f.tag}-partial`, bookedAt: new Date("2025-12-04T12:00:00Z"), amountCents: 500000, status: "PARTIAL", allocations: {create: {chargeId: overdue.id, amountCents: 500000}}}});
    await db.leaseCredit.create({data: {leaseId: f.lease.id, type: "MANUAL_ADJUSTMENT", amountCents: 500000, description: "Testovací zápočet", effectiveAt: new Date("2025-12-04T12:00:00Z"), applications: {create: {chargeId: overdue.id, amountCents: 500000, effectiveAt: new Date("2025-12-04T12:00:00Z")}}}});
    await page.reload();
    await expect(priority).toContainText("Po splatnosti");
    await expect(priority).toContainText(/2\s*500/);
    await expect(priority).not.toContainText("Vše máte uhrazeno");
    const partialRow = page.locator(".portal-payment-history tr.portal-overdue");
    await expect(partialRow).toContainText("Částečně");
    await expect(partialRow).toContainText(/Zápočet\s*5\s*000/);
    await expect(partialRow).toContainText(/2\s*500/);
    const qr = priority.getByAltText("QR kód pro úhradu otevřeného předpisu");
    await expect(qr).toBeVisible();
    expect((await qr.boundingBox())!.width).toBeGreaterThanOrEqual(164);
    await openDocuments(page, f.lease.id, true);
    await expect(page.locator("select[name=chargeId] option")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await screenshot(page, info, "portal-partial-offset-desktop");
    await page.setViewportSize({width: 390, height: 844});
    await noPageOverflow(page);
    await screenshot(page, info, "portal-partial-offset-mobile");

    // Excluded debt stays identifiable in history, but must not drive the payment banner.
    await db.charge.update({where: {id: overdue.id}, data: {debtTreatment: "EXCLUDED"}});
    await page.reload();
    await expect(priority).not.toContainText("Po splatnosti");
    await expect(page.locator(".portal-payment-history")).toContainText("Mimo aktuální dluh");
  } finally {
    await cleanup(f);
  }
});

test("only explicitly published tenant notices and tasks are visible, with read-only manager preview", async ({page, browser}, info) => {
  test.setTimeout(90000);
  const f = await fixture();
  const managerPage = await browser.newPage(), otherPage = await browser.newPage(), payerPage = await browser.newPage();
  try {
    const commonTask = {propertyId: f.property.id, unitId: f.unit.id, leaseId: f.lease.id, tenantId: f.tenant.id, createdById: f.manager.id};
    const published = await db.task.create({data: {...commonTask, title: "Interní název servisního zásahu", description: "INTERNÍ POPIS: osobní poznámka správce", dueAt: new Date("2099-01-10T12:00:00Z")}});
    const privateTask = await db.task.create({data: {...commonTask, title: "Soukromé prověření smlouvy", description: "Tento úkol nájemník nikdy nemá vidět."}});
    const otherTask = await db.task.create({data: {propertyId: f.property.id, unitId: f.otherUnit.id, leaseId: f.otherLease.id, tenantId: f.otherTenant.id, createdById: f.manager.id, title: "Interní cizí úkol", tenantPortalTitle: "Úkol pro jiný byt", tenantPortalBody: "Soukromé sdělení druhému nájemníkovi.", tenantPortalPublishedAt: new Date(), tenantPortalPublishedById: f.manager.id}});
    await login(managerPage, f.manager.email);
    await managerPage.goto("/ukoly/oznameni/najemnici");
    const noticeForm = managerPage.locator('form[action="/api/tenant-announcements"]');
    await noticeForm.getByLabel("Příjemci *", {exact: true}).selectOption(`property:${f.property.id}`);
    await noticeForm.getByLabel("Název *", {exact: true}).fill("Odstávka vody v domě");
    await noticeForm.getByLabel("Sdělení *", {exact: true}).fill("Ve středu prosím počítejte s odstávkou vody mezi 10. a 11. hodinou.");
    await noticeForm.getByLabel("Důležitost").selectOption("IMPORTANT");
    await noticeForm.getByRole("button", {name: "Zveřejnit nájemníkům", exact: true}).click();
    const propertyNotice = await db.announcement.findFirstOrThrow({where: {createdById: f.manager.id, title: "Odstávka vody v domě"}, include: {audiences: true}});
    expect(propertyNotice.audiences).toMatchObject([{kind: "TENANT_PROPERTY", propertyId: f.property.id}]);
    const ownNotice = await db.announcement.create({data: {title: "Předání nové sady klíčů", body: "Klíče pro váš byt jsou připravené u správce.", createdById: f.manager.id, startsAt: new Date("2025-01-01T12:00:00Z"), audiences: {create: {kind: "TENANT_LEASE", leaseId: f.lease.id}}}});
    const otherNotice = await db.announcement.create({data: {title: "Soukromé oznámení bytu 8", body: "Tato informace je určena pouze druhému bytu.", createdById: f.manager.id, startsAt: new Date("2025-01-01T12:00:00Z"), audiences: {create: {kind: "TENANT_LEASE", leaseId: f.otherLease.id}}}});
    const staffNotice = await db.announcement.create({data: {title: "INTERNÍ porada zaměstnanců", body: "Oznámení pro všechny uživatele interní aplikace.", createdById: f.manager.id, startsAt: new Date("2025-01-01T12:00:00Z"), audiences: {create: {kind: "ALL_USERS"}}}});
    await managerPage.goto(`/ukoly/${published.id}`);
    const publication = managerPage.locator("#portal-najemnika");
    await expect(publication).toContainText("Tento úkol je zatím pouze interní");
    await publication.getByLabel("Název pro nájemníka").fill("Prosíme potvrdit termín návštěvy");
    await publication.getByLabel("Sdělení nájemníkovi").fill("Technik může přijít ve středu v 10 hodin. Prosíme potvrďte přijetí zadání.");
    await publication.getByRole("button", {name: "Zveřejnit v portálu nájemníka", exact: true}).click();
    const posted = await db.task.findUniqueOrThrow({where: {id: published.id}});
    expect(posted.tenantPortalPublishedAt).not.toBeNull();
    expect(posted.tenantPortalPublishedById).toBe(f.manager.id);

    await login(page, f.actor.email);
    await page.goto(`/portal/najemnik/${f.tenant.id}`);
    const messages = page.locator(`#zpravy-${f.lease.id}`);
    await expect(messages.getByRole("heading", {name: propertyNotice.title, exact: true})).toBeVisible();
    await expect(messages.getByRole("heading", {name: ownNotice.title, exact: true})).toBeVisible();
    await expect(messages.getByRole("heading", {name: posted.tenantPortalTitle!, exact: true})).toBeVisible();
    await expect(messages).toContainText(f.manager.name);
    await expect(messages).toContainText("2099");
    for (const hidden of [privateTask.title, published.title, published.description!, otherTask.tenantPortalTitle!, otherNotice.title, staffNotice.title]) {
      await expect(page.locator("main")).not.toContainText(hidden);
    }
    await screenshot(page, info, "portal-messages-desktop");

    await managerPage.goto(`/portal/najemnik/${f.tenant.id}`);
    await expect(managerPage.locator("main")).toContainText(posted.tenantPortalTitle!);
    await expect(managerPage.getByRole("button", {name: "Potvrdit přijetí", exact: true})).toBeDisabled();
    await managerPage.request.post(`/api/portal/tenants/${f.tenant.id}/messages`, {headers: await headers(managerPage), form: {leaseId: f.lease.id, kind: "task", itemId: posted.id, action: "confirm", revision: posted.tenantPortalPublishedAt!.toISOString()}, maxRedirects: 0});
    expect(await db.taskUserState.count({where: {taskId: posted.id, tenantConfirmedAt: {not: null}}})).toBe(0);
    await managerPage.request.post(`/api/portal/tenants/${f.tenant.id}/messages`, {headers: await headers(managerPage), form: {leaseId: f.lease.id, kind: "announcement", itemId: propertyNotice.id, action: "dismiss"}, maxRedirects: 0});
    expect(await db.announcementUserState.count({where: {announcementId: propertyNotice.id}})).toBe(0);

    // Another tenant can read the house-wide notice, but cannot acknowledge this lease's messages.
    await login(otherPage, f.otherActor.email);
    await otherPage.goto(`/portal/najemnik/${f.otherTenant.id}`);
    await expect(otherPage.locator("main")).toContainText(propertyNotice.title);
    await expect(otherPage.locator("main")).not.toContainText(ownNotice.title);
    await expect(otherPage.locator("main")).not.toContainText(posted.tenantPortalTitle!);
    for (const targetTenant of [f.tenant.id, f.otherTenant.id]) {
      await otherPage.request.post(`/api/portal/tenants/${targetTenant}/messages`, {headers: await headers(otherPage), form: {leaseId: f.lease.id, kind: "task", itemId: posted.id, action: "confirm", revision: posted.tenantPortalPublishedAt!.toISOString()}, maxRedirects: 0});
      await otherPage.request.post(`/api/portal/tenants/${targetTenant}/messages`, {headers: await headers(otherPage), form: {leaseId: f.lease.id, kind: "announcement", itemId: ownNotice.id, action: "read"}, maxRedirects: 0});
    }
    expect(await db.taskUserState.count({where: {taskId: posted.id, userId: f.otherActor.id}})).toBe(0);
    expect(await db.announcementUserState.count({where: {announcementId: ownNotice.id, userId: f.otherActor.id}})).toBe(0);
    // Forging another lease's itemId inside the viewer's own lease also fails.
    await page.request.post(`/api/portal/tenants/${f.tenant.id}/messages`, {headers: await headers(page), form: {leaseId: f.lease.id, kind: "task", itemId: otherTask.id, action: "confirm", revision: otherTask.tenantPortalPublishedAt!.toISOString()}, maxRedirects: 0});
    expect(await db.taskUserState.count({where: {taskId: otherTask.id, userId: f.actor.id}})).toBe(0);
    await login(payerPage, f.payerActor.email);
    await payerPage.goto(`/portal/najemnik/${f.payer.id}`);
    await expect(payerPage.locator("main")).not.toContainText(propertyNotice.title);
    await expect(payerPage.locator("main")).not.toContainText(posted.tenantPortalTitle!);
    await payerPage.request.post(`/api/portal/tenants/${f.payer.id}/messages`, {headers: await headers(payerPage), form: {leaseId: f.lease.id, kind: "announcement", itemId: propertyNotice.id, action: "read"}, maxRedirects: 0});
    expect(await db.announcementUserState.count({where: {announcementId: propertyNotice.id, userId: f.payerActor.id}})).toBe(0);

    const ownTask = messages.locator("article").filter({has: page.getByRole("heading", {name: posted.tenantPortalTitle!, exact: true})});
    await ownTask.getByRole("button", {name: "Potvrdit přijetí", exact: true}).click();
    await expect(messages).toContainText("Přijetí potvrzeno");
    expect((await db.taskUserState.findUniqueOrThrow({where: {taskId_userId: {taskId: posted.id, userId: f.actor.id}}})).tenantConfirmedAt).not.toBeNull();
    // Acknowledgement is not completion of the manager's task.
    expect((await db.task.findUniqueOrThrow({where: {id: posted.id}})).status).toBe("OPEN");
    const ownAnnouncement = messages.locator("article").filter({has: page.getByRole("heading", {name: ownNotice.title, exact: true})});
    await ownAnnouncement.getByRole("button", {name: "Přečetl/a jsem", exact: true}).click();
    expect((await db.announcementUserState.findUniqueOrThrow({where: {announcementId_userId: {announcementId: ownNotice.id, userId: f.actor.id}}})).readAt).not.toBeNull();
    await ownAnnouncement.getByRole("button", {name: "Přesunout do archivu", exact: true}).click();
    await expect(messages.getByRole("heading", {name: ownNotice.title, exact: true})).not.toBeVisible();
    await messages.locator("details summary").click();
    await expect(messages.getByRole("heading", {name: ownNotice.title, exact: true})).toBeVisible();
    await ownAnnouncement.getByRole("button", {name: "Vrátit mezi oznámení", exact: true}).click();
    expect((await db.announcementUserState.findUniqueOrThrow({where: {announcementId_userId: {announcementId: ownNotice.id, userId: f.actor.id}}})).dismissedAt).toBeNull();
    await page.setViewportSize({width: 390, height: 844});
    await noPageOverflow(page);
    await screenshot(page, info, "portal-messages-mobile");

    // Republished content has to be read again: the old acknowledgement cannot authorize the new text.
    await managerPage.goto(`/ukoly/${posted.id}`);
    await publication.getByLabel("Sdělení nájemníkovi").fill("Termín návštěvy se změnil na čtvrtek v 11 hodin. Prosíme potvrďte nové zadání.");
    await publication.getByRole("button", {name: "Zveřejnit aktualizované zadání", exact: true}).click();
    await page.request.post(`/api/portal/tenants/${f.tenant.id}/messages`, {headers: await headers(page), form: {leaseId: f.lease.id, kind: "task", itemId: posted.id, action: "confirm", revision: posted.tenantPortalPublishedAt!.toISOString()}, maxRedirects: 0});
    expect((await db.taskUserState.findUnique({where: {taskId_userId: {taskId: posted.id, userId: f.actor.id}}}))?.tenantConfirmedAt ?? null).toBeNull();
    await page.reload();
    await expect(messages.getByRole("button", {name: "Potvrdit přijetí", exact: true})).toBeVisible();

    await managerPage.goto("/ukoly/oznameni/najemnici");
    const noticeEditor = managerPage.locator(`article[id="${ownNotice.id}"]`);
    await noticeEditor.getByText("Upravit sdělení", {exact: true}).click();
    const noticeEditForm = noticeEditor.locator('form').filter({has: managerPage.getByRole("button", {name: "Uložit sdělení", exact: true})});
    await noticeEditForm.getByLabel("Sdělení", {exact: true}).fill("Klíče budou nově připravené až ve čtvrtek. Přečtěte si prosím nové sdělení.");
    await noticeEditForm.getByRole("button", {name: "Uložit sdělení", exact: true}).click();
    await page.request.post(`/api/portal/tenants/${f.tenant.id}/messages`, {headers: await headers(page), form: {leaseId: f.lease.id, kind: "announcement", itemId: ownNotice.id, action: "read", revision: ownNotice.updatedAt.toISOString()}, maxRedirects: 0});
    expect((await db.announcementUserState.findUnique({where: {announcementId_userId: {announcementId: ownNotice.id, userId: f.actor.id}}}))?.readAt ?? null).toBeNull();
    await page.reload();
    await expect(ownAnnouncement.getByRole("button", {name: "Přečetl/a jsem", exact: true})).toBeVisible();
  } finally {
    await managerPage.close();
    await otherPage.close();
    await payerPage.close();
    await cleanup(f);
  }
});
