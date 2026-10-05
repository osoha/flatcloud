import {expect, test, type Page} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import {randomUUID} from "node:crypto";
import {businessTodayKey} from "../lib/calendar";
import {tenantPortalPaymentState} from "../lib/tenant-portal-payment-state";

const db = new PrismaClient();
const password = "Portal-Polish-Isolated-2026";
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

async function sessionHeaders(page: Page) {
  return {Cookie: (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join("; ")};
}

test("payment colors follow debt and Czech calendar, including partial and settled future rent", () => {
  const charge = {period: "2026-10", dueDate: new Date("2026-10-15T12:00:00Z"), remainingCents: 10000, receivedCents: 0, offsetCents: 0, debtTreatment: "CURRENT" as const};
  expect(tenantPortalPaymentState(charge, "2026-10-05")).toEqual({tone: "current", future: false, state: "Před splatností"});
  expect(tenantPortalPaymentState({...charge, period: "2026-11", dueDate: new Date("2026-11-15T12:00:00Z")}, "2026-10-05")).toEqual({tone: "scheduled", future: true, state: "Budoucí nájem"});
  expect(tenantPortalPaymentState({...charge, period: "2026-11", dueDate: new Date("2026-10-04T12:00:00Z"), receivedCents: 1000}, "2026-10-05")).toEqual({tone: "overdue", future: false, state: "Částečně · po splatnosti"});
  expect(tenantPortalPaymentState({...charge, period: "2026-11", remainingCents: 0}, "2026-10-05")).toEqual({tone: "paid", future: false, state: "Uhrazeno"});
  expect(tenantPortalPaymentState({...charge, remainingCents: 0, offsetCents: 10000}, "2026-10-05")).toMatchObject({tone: "paid", state: "Vypořádáno se zápočtem"});
  expect(tenantPortalPaymentState({...charge, dueDate: new Date("2026-10-04T22:30:00Z")}, "2026-10-05")).toMatchObject({tone: "current", state: "Splatnost dnes"});
  for (const debtTreatment of ["HISTORICAL", "EXCLUDED"] as const) expect(tenantPortalPaymentState({...charge, debtTreatment, dueDate: new Date("2025-01-01T12:00:00Z")}, "2026-10-05").tone).toBe("neutral");
});

test("portal shares canonical branding, landlord wording, four payment colors and working staff archive links", async ({page, browser}, info) => {
  test.setTimeout(90000);
  const tag = randomUUID(), passwordHash = await bcrypt.hash(password, 8);
  const manager = await db.user.create({data: {email: `polish-manager-${tag}@flatcloud.test`, name: "Petra Testovací", role: "PROPERTY_MANAGER", passwordHash, isTestIdentity: true, defaultDisplayMode: "pro", profiGraphics: true}});
  const actor = await db.user.create({data: {email: `polish-tenant-${tag}@flatcloud.test`, name: "Jana Testovací", role: "TENANT", passwordHash, isTestIdentity: true}});
  const owner = await db.owner.create({data: {name: "Brickflow QA", email: `owner-${tag}@flatcloud.test`}});
  const photo = await sharp({create: {width: 80, height: 80, channels: 3, background: "#e6d9c5"}}).png().toBuffer();
  const property = await db.property.create({data: {ownerId: owner.id, name: `Portál QA ${tag}`, address: "Testovací 1", city: "Praha", avatarPhotoId: "upload", avatarMimeType: "image/png", avatarData: new Uint8Array(photo), memberships: {create: {userId: manager.id, permission: "EDIT"}}}});
  const unit = await db.unit.create({data: {propertyId: property.id, label: "Byt 12"}});
  const tenant = await db.tenant.create({data: {name: actor.name, email: actor.email}});
  const lease = await db.lease.create({data: {unitId: unit.id, tenantId: tenant.id, startDate: new Date("2024-01-01T12:00:00Z"), financialTrackingFromPeriod: "2024-01", rentCents: 1250000, servicesCents: 0, variableSymbol: tag}});
  await db.tenantPortalAccess.create({data: {userId: actor.id, tenantId: tenant.id}});
  const bank = await db.bankAccount.create({data: {propertyId: property.id, ownerId: owner.id, provider: "qa", bankName: "QA banka", ibanMasked: "QA", externalAccountId: tag}});
  const today = businessTodayKey(), [year, month] = today.split("-").map(Number);
  const monthDate = (delta: number, day = 15) => new Date(Date.UTC(year, month - 1 + delta, day, 12));
  const monthKey = (delta: number) => monthDate(delta).toISOString().slice(0, 7);
  const paid = await db.charge.create({data: {leaseId: lease.id, period: monthKey(-2), dueDate: monthDate(-2), amountCents: 1250000}});
  const overdue = await db.charge.create({data: {leaseId: lease.id, period: monthKey(-1), dueDate: monthDate(-1), amountCents: 1250000}});
  await db.charge.createMany({data: [
    {leaseId: lease.id, period: monthKey(0), dueDate: new Date(Date.UTC(year, month, 0, 12)), amountCents: 1250000},
    {leaseId: lease.id, period: monthKey(1), dueDate: monthDate(1), amountCents: 1250000},
    {leaseId: lease.id, period: monthKey(2), dueDate: monthDate(2), amountCents: 1250000},
    {leaseId: lease.id, period: monthKey(-3), dueDate: monthDate(-3), amountCents: 1250000, debtTreatment: "EXCLUDED"},
  ]});
  await db.bankTransaction.createMany({data: [{bankAccountId: bank.id, externalId: `${tag}-paid`, bookedAt: monthDate(-1, 1), amountCents: 1250000, status: "MATCHED"}, {bankAccountId: bank.id, externalId: `${tag}-partial`, bookedAt: monthDate(-1, 1), amountCents: 250000, status: "MATCHED"}]});
  const transactions = await db.bankTransaction.findMany({where: {bankAccountId: bank.id}});
  await db.paymentAllocation.createMany({data: transactions.map(transaction => ({transactionId: transaction.id, chargeId: transaction.externalId.endsWith("-paid") ? paid.id : overdue.id, amountCents: transaction.amountCents}))});
  const file = await db.fileAsset.create({data: {storageKey: `portal-polish/${tag}`, originalName: "smlouva.pdf", mimeType: "application/pdf", sizeBytes: 20, sha256: tag, uploadedById: manager.id}});
  const sharedDocument = await db.document.create({data: {propertyId: property.id, unitId: unit.id, leaseId: lease.id, category: "CONTRACT", title: "Smlouva sdílená s nájemníkem", fileAssetId: file.id, createdById: manager.id, tenantVisible: true}});
  await db.document.create({data: {propertyId: property.id, unitId: unit.id, leaseId: lease.id, category: "CONTRACT", title: "Soukromá příloha správy", fileAssetId: file.id, createdById: manager.id, tenantVisible: false}});
  const receipt = await db.tenantPaymentReceipt.create({data: {id: `D-QA-${tag}`, chargeId: paid.id, issuerId: manager.id, snapshotHash: tag, snapshot: {amountCents: paid.amountCents}, pdfData: Buffer.from("%PDF-1.4\nQA archived receipt\n%%EOF")}});
  const managerPage = await browser.newPage();
  try {
    await login(page, actor.email);
    await page.goto(`/portal/najemnik/${tenant.id}`);
    await expect(page.locator(".tp-brand .flatberry-brand-bitmap")).toHaveCSS("background-image", /flatberry-logo\.png/);
    await expect(page.getByRole("heading", {name: "Kontakt na pronajímatele", exact: true})).toBeVisible();
    await expect(page.getByRole("link", {name: "Napsat pronajímateli", exact: true})).toBeVisible();
    const history = page.locator(".portal-payment-history");
    await expect(history.locator("tbody tr")).toHaveCount(4);
    const expected = [
      ["overdue", "rgb(255, 241, 242)", "Částečně · po splatnosti"],
      ["current", "rgb(255, 246, 233)", ""],
      ["scheduled", "rgb(240, 246, 255)", "Budoucí nájem"],
      ["paid", "rgb(240, 250, 242)", "Uhrazeno"],
    ];
    for (const [tone, background, label] of expected) {
      const row = history.locator(`tr.portal-${tone}`);
      await expect(row).toHaveCount(1); await expect(row).toHaveCSS("background-color", background);
      if (label) await expect(row).toContainText(label);
    }
    await expect(history.locator(".portal-current .tp-status")).toHaveText(/Před splatností|Splatnost dnes/);
    await expect(history.locator(".portal-scheduled")).toContainText(new Intl.DateTimeFormat("cs-CZ", {month: "long", year: "numeric"}).format(monthDate(1)).replace(/^./, letter => letter.toUpperCase()));
    await page.getByRole("button", {name: /Zobrazit další období/}).click();
    await expect(history.locator("tr.portal-neutral")).toContainText("Mimo aktuální dluh");
    await page.getByRole("button", {name: "Budoucí nájmy", exact: true}).click();
    await expect(history.locator("tbody tr")).toHaveCount(2);
    await expect(history.locator("tr.portal-paid")).toHaveCount(0);
    await page.getByRole("button", {name: "Přehled", exact: true}).click();
    await page.setViewportSize({width: 390, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({path: info.outputPath("portal-polish-mobile.png"), fullPage: true});
    await page.locator(`main a[href="#dokumenty-${lease.id}"]`).first().click();
    const documents = page.getByRole("dialog", {name: "Dokumenty", exact: true});
    await expect(documents).toContainText(sharedDocument.title); await expect(documents).not.toContainText("Soukromá příloha správy");
    await expect(documents.getByRole("link", {name: "Stáhnout", exact: true})).toHaveAttribute("href", `/api/portal/tenants/${tenant.id}/documents/${sharedDocument.id}`);

    await login(managerPage, manager.email);
    await managerPage.goto(`/portal/najemnik/${tenant.id}#dokumenty-${lease.id}`);
    const preview = managerPage.getByRole("dialog", {name: "Dokumenty", exact: true});
    await expect(preview.getByRole("link", {name: "Stáhnout", exact: true})).toHaveAttribute("href", `/api/documents/${sharedDocument.id}/download`);
    await preview.getByRole("tab", {name: "Doklady o zaplacení", exact: true}).click();
    await expect(preview.getByRole("button", {name: "Vygenerovat a stáhnout PDF", exact: true})).toBeDisabled();
    const receiptLink = preview.getByRole("link", {name: "stáhnout PDF", exact: true});
    await expect(receiptLink).toHaveAttribute("href", `/api/leases/${lease.id}/receipts/${receipt.id}`);
    const archived = await managerPage.request.get(await receiptLink.getAttribute("href") as string, {headers: await sessionHeaders(managerPage)});
    expect(archived.status()).toBe(200); expect((await archived.body()).subarray(0, 4).toString()).toBe("%PDF");
    await expect(preview.getByRole("link", {name: /detailu jednotky/})).toHaveAttribute("href", `/nemovitosti/${property.id}/jednotky/${unit.id}#doklady`);

    // A real uploaded photo must switch to a real glyph and back without a reload-dependent fallback.
    await managerPage.goto(`/nemovitosti/${property.id}/prehled`);
    const avatar = managerPage.locator('[data-testid="property-header-identity"] .entity-avatar').first();
    await expect(avatar.locator("img")).toBeVisible();
    await expect.poll(() => avatar.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await managerPage.goto("/ucet#vzhled");
    await managerPage.getByRole("button", {name: "Jednoduché ikony", exact: true}).click();
    await managerPage.goto(`/nemovitosti/${property.id}/prehled`);
    await expect(avatar.locator("img")).toBeHidden();
    await expect(avatar.locator("svg.entity-avatar-glyph")).toBeVisible();
    await managerPage.goto("/ucet#vzhled");
    await managerPage.getByRole("button", {name: "Avatary a fotografie", exact: true}).click();
    await managerPage.goto(`/nemovitosti/${property.id}/prehled`);
    await expect(avatar.locator("img")).toBeVisible();
    await expect(avatar.locator("svg.entity-avatar-glyph")).toBeHidden();
  } finally {
    await managerPage.close();
    await db.tenantPaymentReceipt.deleteMany({where: {charge: {leaseId: lease.id}}});
    await db.document.deleteMany({where: {leaseId: lease.id}}); await db.fileAsset.delete({where: {id: file.id}});
    await db.charge.deleteMany({where: {leaseId: lease.id}});
    await db.bankTransaction.deleteMany({where: {bankAccountId: bank.id}}); await db.bankAccount.delete({where: {id: bank.id}});
    await db.tenantPortalAccess.deleteMany({where: {tenantId: tenant.id}});
    await db.lease.delete({where: {id: lease.id}}); await db.tenant.delete({where: {id: tenant.id}});
    await db.unit.delete({where: {id: unit.id}}); await db.property.delete({where: {id: property.id}}); await db.owner.delete({where: {id: owner.id}});
    await db.auditLog.deleteMany({where: {userId: {in: [manager.id, actor.id]}}}); await db.user.deleteMany({where: {id: {in: [manager.id, actor.id]}}});
  }
});
