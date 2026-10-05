import {expect, test, type Page, type TestInfo} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
import {randomUUID} from "node:crypto";

const db = new PrismaClient();
const password = "Portal-Conversation-Isolated-2026";
test.beforeAll(() => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated CI database required");
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
  return {Cookie: (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join("; "), Accept: "application/json"};
}
async function fixture() {
  const tag = randomUUID(), passwordHash = await bcrypt.hash(password, 8);
  const manager = await db.user.create({data: {email: `conversation-manager-${tag}@flatcloud.test`, name: "Petra Novotná", phone: "+420777123456", role: "PROPERTY_MANAGER", passwordHash, isTestIdentity: true}});
  const actor = await db.user.create({data: {email: `conversation-tenant-${tag}@flatcloud.test`, name: "Jana Testovací", role: "TENANT", passwordHash, isTestIdentity: true}});
  const outsider = await db.user.create({data: {email: `conversation-other-${tag}@flatcloud.test`, name: "Pavel Jiný", role: "TENANT", passwordHash, isTestIdentity: true}});
  const payerActor = await db.user.create({data: {email: `conversation-payer-${tag}@flatcloud.test`, name: "Plátce Testovací", role: "TENANT", passwordHash, isTestIdentity: true}});
  const reader = await db.user.create({data: {email: `conversation-reader-${tag}@flatcloud.test`, name: "Pouze čtenář", role: "OWNER_VIEWER", allProperties: true, passwordHash, isTestIdentity: true}});
  const owner = await db.owner.create({data: {name: "Ilustrační vlastník QA"}});
  const property = await db.property.create({data: {ownerId: owner.id, managerId: manager.id, name: "Dům U parku", address: "Testovací 12", city: "Praha", memberships: {create: {userId: manager.id, permission: "EDIT"}}}});
  const unit = await db.unit.create({data: {propertyId: property.id, label: "Byt 5", areaM2: 64}});
  const otherUnit = await db.unit.create({data: {propertyId: property.id, label: "Byt 8"}});
  const tenant = await db.tenant.create({data: {name: actor.name, email: actor.email, phone: "+420777111222", type: "PERSON"}});
  const otherTenant = await db.tenant.create({data: {name: outsider.name, email: outsider.email}});
  const payer = await db.tenant.create({data: {name: payerActor.name, email: payerActor.email}});
  const lease = await db.lease.create({data: {unitId: unit.id, tenantId: tenant.id, startDate: new Date("2025-01-01T12:00:00Z"), financialTrackingFromPeriod: "2025-01", variableSymbol: "8152601", rentCents: 1000000, servicesCents: 250000}});
  const otherLease = await db.lease.create({data: {unitId: otherUnit.id, tenantId: otherTenant.id, startDate: new Date("2025-01-01T12:00:00Z"), financialTrackingFromPeriod: "2025-01", variableSymbol: "8152602", rentCents: 1000000, servicesCents: 0}});
  await db.leaseParty.create({data: {leaseId: lease.id, tenantId: payer.id, role: "PAYER"}});
  await db.tenantPortalAccess.createMany({data: [{tenantId: tenant.id, userId: actor.id}, {tenantId: otherTenant.id, userId: outsider.id}, {tenantId: payer.id, userId: payerActor.id}]});
  return {tag, manager, actor, outsider, payerActor, reader, owner, property, unit, otherUnit, tenant, otherTenant, payer, lease, otherLease};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function cleanup(f: Fixture) {
  const users = [f.manager.id, f.actor.id, f.outsider.id, f.payerActor.id, f.reader.id];
  const tenants = [f.tenant.id, f.otherTenant.id, f.payer.id], leases = [f.lease.id, f.otherLease.id];
  const tasks = await db.task.findMany({where: {propertyId: f.property.id}, select: {id: true}});
  await db.tenantPortalNotification.deleteMany({where: {propertyId: f.property.id}});
  await db.tenantPortalNotificationSnapshot.deleteMany({where: {taskId: {in: tasks.map(task => task.id)}}});
  await db.task.deleteMany({where: {propertyId: f.property.id}});
  await db.tenantPortalAccess.deleteMany({where: {tenantId: {in: tenants}}});
  await db.leaseParty.deleteMany({where: {leaseId: {in: leases}}});
  await db.lease.deleteMany({where: {id: {in: leases}}});
  await db.tenant.deleteMany({where: {id: {in: tenants}}});
  await db.unit.deleteMany({where: {propertyId: f.property.id}});
  await db.property.delete({where: {id: f.property.id}});
  await db.owner.delete({where: {id: f.owner.id}});
  await db.auditLog.deleteMany({where: {userId: {in: users}}});
  await db.user.deleteMany({where: {id: {in: users}}});
}
async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({path, fullPage: !(await page.locator("dialog[open]").count()), animations: "disabled"});
  await info.attach(name, {path, contentType: "image/png"});
}

test("tenant and manager converse in one audited task while private entries, foreign tenants and payer actions stay isolated", async ({page, browser}, info) => {
  const f = await fixture(), staffContext = await browser.newContext(), otherContext = await browser.newContext();
  const staff = await staffContext.newPage(), other = await otherContext.newPage();
  const endpoint = `/api/portal/tenants/${f.tenant.id}/conversations`;
  try {
    await login(page, f.actor.email);
    await page.goto(`/portal/najemnik/${f.tenant.id}`);
    const notificationPreferences = await db.taskNotificationPreference.findUnique({where: {userId: f.actor.id}});
    const optOut = await page.request.post("/api/account/notifications", {headers: await headers(page), form: {}, maxRedirects: 0});
    expect(optOut.status()).toBe(303);
    expect(await db.taskNotificationPreference.findUnique({where: {userId: f.actor.id}})).toEqual(notificationPreferences);
    await expect(page.locator('input[name="emailEnabled"]')).toHaveCount(0);
    await page.getByRole("link", {name: "Napsat správci", exact: true}).click();
    const dialog = page.getByRole("dialog", {name: "Zprávy se správou bydlení", exact: true});
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Čeho se zpráva týká?").fill("Domluva předání klíčů");
    await dialog.getByLabel("Vaše zpráva", {exact: true}).fill("Dobrý den, mohu si v úterý vyzvednout náhradní klíče?");
    await shot(page, info, "portal-message-compose-desktop");
    await dialog.getByRole("button", {name: "Odeslat zprávu", exact: true}).click();
    await expect(page).toHaveURL(/#zpravy-spravci-.*--.+/);
    await expect(dialog.getByRole("heading", {name: "Domluva předání klíčů"})).toBeVisible();
    const taskId = new URL(page.url()).hash.split("--")[1];
    const task = await db.task.findUniqueOrThrow({where: {id: taskId}});
    expect(task).toMatchObject({tenantId: f.tenant.id, leaseId: f.lease.id, tenantPortalRequestKind: "MESSAGE", createdById: f.actor.id, assigneeId: f.manager.id});
    await db.task.update({where: {id: taskId}, data: {description: "PRIVATE TASK DESCRIPTION NEVER SHARED", title: "PRIVATE INTERNAL TITLE"}});

    await login(staff, f.manager.email);
    const staffHeaders = await headers(staff);
    for (const visibility of ["INTERNAL", "OWNER_VISIBLE"]) {
      const response = await staff.request.post(`/api/tasks/${taskId}/entries`, {headers: staffHeaders, multipart: {body: `PRIVATE ${visibility} CONTENT`, visibility, kind: "COMMENT", mentions: "[]"}});
      expect(response.status(), await response.text()).toBe(200);
    }
    await staff.goto(`/ukoly/${taskId}`);
    await staff.getByLabel("Viditelnost záznamu").selectOption("INTERNAL");
    await staff.getByLabel("Nový komentář", {exact: true}).fill("PRIVATE UNSENT DRAFT NEVER SHARED");
    await staff.getByLabel("Viditelnost záznamu").selectOption("TENANT_VISIBLE");
    await expect(staff.getByLabel("Zpráva nájemníkovi", {exact: true})).toHaveValue("");
    await staff.getByLabel("Zpráva nájemníkovi", {exact: true}).fill("Dobrý den, Jano, v úterý v 17 hodin budu u domu. Klíče vám předám osobně.");
    await staff.getByLabel("Viditelnost záznamu").selectOption("INTERNAL");
    await expect(staff.getByLabel("Nový komentář", {exact: true})).toHaveValue("PRIVATE UNSENT DRAFT NEVER SHARED");
    await staff.getByLabel("Viditelnost záznamu").selectOption("TENANT_VISIBLE");
    await expect(staff.getByLabel("Zpráva nájemníkovi", {exact: true})).toHaveValue("Dobrý den, Jano, v úterý v 17 hodin budu u domu. Klíče vám předám osobně.");
    await expect(staff.getByRole("button", {name: "Přiložit", exact: true})).toHaveCount(0);
    const sent = staff.waitForRequest(request => request.url().endsWith(`/api/tasks/${taskId}/entries`) && request.method() === "POST");
    await staff.locator(".thread-composer-v211").getByRole("button", {name: "Odeslat nájemníkovi", exact: true}).click();
    expect((await sent).postData()).not.toContain("PRIVATE UNSENT DRAFT");
    await expect(staff).toHaveURL(/\?ok=/);
    await page.reload();
    await expect(dialog).toContainText("Klíče vám předám osobně.");
    await expect(dialog).not.toContainText("PRIVATE");
    await expect(dialog).toContainText("Domluva předání klíčů");
    await dialog.getByLabel("Vaše odpověď").fill("Děkuji, v 17 hodin se potkáme u vchodu.");
    await dialog.getByRole("button", {name: "Odeslat odpověď", exact: true}).click();
    await expect(dialog.locator(".tp-chat-tenant")).toContainText("Děkuji, v 17 hodin");
    await shot(page, info, "portal-conversation-desktop");
    await page.setViewportSize({width: 390, height: 844});
    await shot(page, info, "portal-conversation-mobile");
    await expect.poll(() => db.tenantPortalNotification.count({where: {taskId, kind: "REPLY", userId: f.actor.id}})).toBe(1);

    const tenantHeaders = await headers(page), key = randomUUID();
    const repeat = {leaseId: f.lease.id, title: "Opakování při ztrátě spojení", body: "Tato zpráva smí vytvořit pouze jeden úkol.", submissionKey: key};
    const first = await page.request.post(endpoint, {headers: tenantHeaders, multipart: repeat});
    expect(first.ok(), await first.text()).toBe(true);
    const firstBody = await first.json();
    const second = await page.request.post(endpoint, {headers: tenantHeaders, multipart: repeat});
    expect(second.ok(), await second.text()).toBe(true);
    expect((await second.json()).taskId).toBe(firstBody.taskId);
    const changed = await page.request.post(endpoint, {headers: tenantHeaders, multipart: {...repeat, body: "Jiný obsah se stejným klíčem"}});
    expect(changed.status()).toBe(409);
    expect(await db.task.count({where: {tenantId: f.tenant.id, tenantPortalTitle: repeat.title}})).toBe(1);
    const reply = {body: "Odolná odpověď bez duplikace", submissionKey: randomUUID()};
    const firstReply = await page.request.post(`${endpoint}/${taskId}`, {headers: tenantHeaders, multipart: reply});
    expect(firstReply.ok(), await firstReply.text()).toBe(true);
    const replayReply = await page.request.post(`${endpoint}/${taskId}`, {headers: tenantHeaders, multipart: reply});
    expect(replayReply.ok(), await replayReply.text()).toBe(true);
    expect(await db.taskEntry.count({where: {taskId, body: reply.body}})).toBe(1);

    await login(other, f.outsider.email);
    expect([403, 404]).toContain((await other.request.get(`${endpoint}/${taskId}`, {headers: await headers(other)})).status());
    expect([403, 404]).toContain((await other.request.post(endpoint, {headers: await headers(other), multipart: {...repeat, submissionKey: randomUUID()}})).status());
    await other.context().clearCookies(); await login(other, f.payerActor.email);
    const payerEndpoint = `/api/portal/tenants/${f.payer.id}/conversations`;
    expect([403, 404]).toContain((await other.request.get(`${payerEndpoint}?leaseId=${f.lease.id}`, {headers: await headers(other)})).status());
    expect([403, 404]).toContain((await other.request.post(payerEndpoint, {headers: await headers(other), multipart: {...repeat, submissionKey: randomUUID()}})).status());
    const preview = await staff.request.get(`${endpoint}/${taskId}?preview=1`, {headers: staffHeaders});
    expect(preview.status()).toBe(200); expect((await preview.json()).conversation.canReply).toBe(false);
    expect((await staff.request.post(`${endpoint}/${taskId}?preview=1`, {headers: staffHeaders, multipart: {body: "Preview cannot send", submissionKey: randomUUID()}})).status()).toBe(403);
    await other.context().clearCookies(); await login(other, f.reader.email);
    expect([403, 404]).toContain((await other.request.get(`${endpoint}/${taskId}?preview=1`, {headers: await headers(other)})).status());
    await db.task.update({where: {id: taskId}, data: {status: "DONE", closedAt: new Date()}});
    expect((await page.request.post(`${endpoint}/${taskId}`, {headers: tenantHeaders, multipart: {body: "Closed cannot reply", submissionKey: randomUUID()}})).status()).toBe(409);
    await page.reload(); await expect(dialog.getByLabel("Vaše odpověď")).toHaveCount(0);
    await expect(dialog).toContainText("Tato konverzace je uzavřená");
  } finally {await staffContext.close(); await otherContext.close(); await cleanup(f);}
});

test("contact changes preserve an audited request and staff outcome without silently changing identity or portal access", async ({page, browser}, info) => {
  const f = await fixture(), staffContext = await browser.newContext(), otherContext = await browser.newContext();
  const staff = await staffContext.newPage(), other = await otherContext.newPage();
  const endpoint = `/api/portal/tenants/${f.tenant.id}/contact-change-requests`;
  try {
    await login(page, f.actor.email); await page.goto(`/portal/najemnik/${f.tenant.id}`);
    await page.getByRole("link", {name: "Nahlásit změnu kontaktu", exact: true}).click();
    const dialog = page.getByRole("dialog", {name: "Moje kontaktní údaje", exact: true});
    await expect(dialog.getByLabel(/^Kontaktní e-mail/)).toHaveValue(f.actor.email);
    await dialog.getByLabel(/^Kontaktní e-mail/).fill("jana.novy-kontakt@flatcloud.test");
    await dialog.getByLabel(/^Telefon/).fill("+420777999888");
    await dialog.getByLabel("Poznámka ke změně (nepovinná)").fill("Nový kontakt prosím ověřte při domluveném předání klíčů.");
    await shot(page, info, "portal-contact-change-desktop");
    await page.setViewportSize({width: 390, height: 844});
    await shot(page, info, "portal-contact-change-mobile");
    await dialog.getByRole("button", {name: "Nahlásit změnu", exact: true}).click();
    await expect(dialog).toContainText("Požadavek jsme předali");
    const request = await db.tenantContactChangeRequest.findFirstOrThrow({where: {task: {tenantId: f.tenant.id}}});
    expect(request.requested).toMatchObject({email: "jana.novy-kontakt@flatcloud.test", phone: "+420777999888"});
    expect(request.before).toMatchObject({email: f.actor.email, phone: f.tenant.phone});
    const task = await db.task.findUniqueOrThrow({where: {id: request.taskId}});
    const key = task.dedupeKey!.split(":").at(-1)!;
    const replay = await page.request.post(endpoint, {headers: await headers(page), data: {leaseId: f.lease.id, submissionKey: key, email: "jana.novy-kontakt@flatcloud.test", phone: "+420777999888", reason: request.reason}});
    expect(replay.status()).toBe(201); expect((await replay.json()).request.id).toBe(request.id);
    expect(await db.tenantContactChangeRequest.count({where: {task: {tenantId: f.tenant.id}}})).toBe(1);
    await login(other, f.outsider.email);
    expect((await other.request.get(`${endpoint}?leaseId=${f.lease.id}`, {headers: await headers(other)})).status()).toBe(403);
    await other.context().clearCookies(); await login(other, f.payerActor.email);
    expect((await other.request.get(`/api/portal/tenants/${f.payer.id}/contact-change-requests?leaseId=${f.lease.id}`, {headers: await headers(other)})).status()).toBe(403);
    await login(staff, f.manager.email);
    await staff.goto(`/ukoly/${request.taskId}`);
    const review = staff.locator("#zmena-kontaktu");
    await expect(review).toContainText("jana.novy-kontakt@flatcloud.test");
    await review.getByLabel("Zpráva nájemníkovi a další postup").fill("Děkuji, změnu ověříme osobně při předání klíčů. Přístup zatím zůstává stejný.");
    await review.getByRole("button", {name: "Převzít k vyřízení", exact: true}).click();
    await expect(staff).toHaveURL(/\?ok=/);
    const reviewed = await db.tenantContactChangeRequest.findUniqueOrThrow({where: {id: request.id}});
    expect(reviewed).toMatchObject({status: "ACKNOWLEDGED", reviewedById: f.manager.id});
    expect(reviewed.before).toEqual(request.before); expect(reviewed.requested).toEqual(request.requested);
    const stale = await staff.request.post(`/api/tasks/${request.taskId}/contact-change-request`, {headers: await headers(staff), form: {decision: "REJECTED", revision: request.updatedAt.toISOString(), reviewNote: "Tato stará revize se nesmí zapsat."}, maxRedirects: 0});
    expect(stale.headers().location).toContain("error=");
    expect(await db.taskEntry.count({where: {taskId: request.taskId, visibility: "TENANT_VISIBLE"}})).toBe(1);
    expect(await db.tenantPortalNotification.count({where: {taskId: request.taskId, kind: "REPLY", userId: f.actor.id}})).toBe(1);
    const tenant = await db.tenant.findUniqueOrThrow({where: {id: f.tenant.id}}), actor = await db.user.findUniqueOrThrow({where: {id: f.actor.id}});
    expect(tenant.email).toBe(f.tenant.email); expect(tenant.phone).toBe(f.tenant.phone); expect(actor.email).toBe(f.actor.email);
    expect(await db.tenantPortalAccess.count({where: {userId: f.actor.id, tenantId: f.tenant.id}})).toBe(1);
    expect(await db.auditLog.count({where: {entityId: request.id, action: {in: ["TENANT_CONTACT_CHANGE_REQUESTED", "TENANT_CONTACT_CHANGE_REVIEWED"]}}})).toBe(2);
    await page.goto(`/portal/najemnik/${f.tenant.id}#zpravy-spravci-${f.lease.id}--${request.taskId}`);
    await expect(page.getByRole("dialog", {name: "Zprávy se správou bydlení"})).toContainText("Děkuji, změnu ověříme osobně");
    await shot(page, info, "portal-contact-outcome-mobile");
  } finally {await staffContext.close(); await otherContext.close(); await cleanup(f);}
});
