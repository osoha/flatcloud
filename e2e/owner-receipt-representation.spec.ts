import {expect, test, type Download, type Page, type TestInfo} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import {randomUUID} from "node:crypto";
import {businessTodayKey} from "../lib/calendar";

const db = new PrismaClient();
const password = "Owner-Receipt-Isolated-2026";
test.beforeAll(() => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated CI database required");
});
test.afterAll(() => db.$disconnect());

async function login(page: Page, email: string) {
  await page.goto("/login"); await page.getByLabel("E-mail").fill(email); await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", {name: "Přihlásit se", exact: true}).click(); await expect(page).not.toHaveURL(/\/login/);
}
async function sessionHeaders(page: Page) {
  return {Cookie: (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join("; ")};
}
async function bytes(download: Download) {
  const stream = await download.createReadStream(); if (!stream) throw new Error("PDF download is unavailable");
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks);
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(Math.min(800, page.viewportSize()!.width - 10), 100);
  await page.waitForTimeout(250);
  const path = info.outputPath(`${name}.png`);
  const geometry = await page.evaluate(() => ({
    viewport: {width: innerWidth, height: innerHeight, scrollX, scrollY},
    htmlClasses: document.documentElement.className,
    elements: [".main", ".sidebar", ".page"].map(selector => {
      const element = document.querySelector(selector);
      if (!element) return {selector, missing: true};
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return {selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height, marginLeft: style.marginLeft, cssWidth: style.width, display: style.display, transform: style.transform};
    }),
  }));
  await info.attach(`${name}-geometry`, {body: JSON.stringify(geometry, null, 2), contentType: "application/json"});
  if (name.startsWith("unit-receipts")) {
    const section = page.locator('section[aria-labelledby^="receipt-lease-"]').first();
    await section.scrollIntoViewIfNeeded(); await section.screenshot({path});
  } else {await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({path, fullPage: true});}
  await info.attach(name, {path, contentType: "image/png"});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function fixture() {
  const tag = randomUUID(), passwordHash = await bcrypt.hash(password, 8);
  const admin = await db.user.create({data: {email: `issuer-admin-${tag}@flatcloud.test`, name: "Ondřej Jednající", role: "SUPER_ADMIN", passwordHash, isTestIdentity: true, defaultDisplayMode: "pro"}});
  const viewer = await db.user.create({data: {email: `issuer-viewer-${tag}@flatcloud.test`, name: "Čtenář Dokladů", role: "OWNER_VIEWER", allProperties: true, passwordHash, isTestIdentity: true}});
  const actor = await db.user.create({data: {email: `issuer-tenant-${tag}@flatcloud.test`, name: "Jan Nájemník", role: "TENANT", passwordHash, isTestIdentity: true}});
  const owner = await db.owner.create({data: {name: `Brickflow QA ${tag}`, address: "Smluvní 25, Praha", userId: admin.id}});
  const property = await db.property.create({data: {ownerId: owner.id, managerId: admin.id, name: "Doklady QA", address: "Smluvní 25", city: "Praha"}});
  const unit = await db.unit.create({data: {propertyId: property.id, label: "Byt 12"}});
  const tenant = await db.tenant.create({data: {name: actor.name, email: actor.email, address: "Smluvní 25, Praha"}});
  const lease = await db.lease.create({data: {unitId: unit.id, tenantId: tenant.id, startDate: new Date("2024-01-01T12:00:00Z"), financialTrackingFromPeriod: "2024-01", rentCents: 1250000, servicesCents: 0, variableSymbol: tag}});
  await db.tenantPortalAccess.create({data: {userId: actor.id, tenantId: tenant.id}});
  const bank = await db.bankAccount.create({data: {propertyId: property.id, ownerId: owner.id, provider: "qa", bankName: "QA banka", ibanMasked: "QA", externalAccountId: tag}});
  const [year, month] = businessTodayKey().split("-").map(Number), paidDate = new Date(Date.UTC(year, month - 2, 5, 12));
  const charge = await db.charge.create({data: {leaseId: lease.id, period: paidDate.toISOString().slice(0, 7), dueDate: paidDate, amountCents: 1250000}});
  await db.bankTransaction.create({data: {bankAccountId: bank.id, externalId: tag, bookedAt: paidDate, amountCents: charge.amountCents, status: "MATCHED", allocations: {create: {chargeId: charge.id, amountCents: charge.amountCents}}}});
  return {tag, admin, viewer, actor, owner, property, unit, tenant, lease, bank, charge, unitUrl: `/nemovitosti/${property.id}/jednotky/${unit.id}`, ownerUrl: `/vlastnici/${owner.id}/doklady`};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function cleanup(f: Fixture) {
  await db.tenantPaymentReceipt.deleteMany({where: {charge: {leaseId: f.lease.id}}});
  await db.leaseLandlordPeriod.deleteMany({where: {leaseId: f.lease.id}});
  await db.ownerReceiptProfile.deleteMany({where: {ownerId: f.owner.id}}); await db.ownerRepresentative.deleteMany({where: {ownerId: f.owner.id}});
  await db.charge.deleteMany({where: {leaseId: f.lease.id}}); await db.bankTransaction.deleteMany({where: {bankAccountId: f.bank.id}}); await db.bankAccount.delete({where: {id: f.bank.id}});
  await db.tenantPortalAccess.deleteMany({where: {tenantId: f.tenant.id}}); await db.lease.delete({where: {id: f.lease.id}}); await db.tenant.delete({where: {id: f.tenant.id}});
  await db.unit.delete({where: {id: f.unit.id}}); await db.property.delete({where: {id: f.property.id}}); await db.owner.delete({where: {id: f.owner.id}});
  await db.auditLog.deleteMany({where: {userId: {in: [f.admin.id, f.viewer.id, f.actor.id]}}}); await db.user.deleteMany({where: {id: {in: [f.admin.id, f.viewer.id, f.actor.id]}}});
}

test("owner confirms identity, their own signature and lease period before staff and tenant share one immutable PDF", async ({page, browser}, info) => {
  test.setTimeout(120000);
  const f = await fixture(), tenantPage = await browser.newPage();
  try {
    await login(page, f.admin.email); await page.goto(f.ownerUrl);
    const profile = page.locator(`form[action="/api/owners/${f.owner.id}/receipt-profile"]`);
    await profile.getByLabel("Název / jméno vystavitele").fill("Brickflow Nájemní QA s.r.o.");
    await profile.getByLabel("Adresa vystavitele").fill("Smluvní 25, 110 00 Praha");
    await profile.getByRole("button", {name: "Uložit údaje a vystavování", exact: true}).click();
    await expect(page).toHaveURL(/\?ok=/);
    const add = page.locator(`form[action="/api/owners/${f.owner.id}/representatives"]`).filter({has: page.locator('input[name="action"][value="add"]')});
    await add.getByLabel("E-mail uživatele aplikace").fill(f.admin.email); await add.getByLabel("Funkce / oprávnění").fill("Jednatel");
    await add.getByRole("button", {name: "Přidat jednající osobu", exact: true}).click();
    const representative = await db.ownerRepresentative.findUniqueOrThrow({where: {ownerId_userId: {ownerId: f.owner.id, userId: f.admin.id}}});
    expect(representative.consentedAt).toBeNull(); expect(representative.signatureData).toBeNull();
    const consent = page.locator(`form[action="/api/owners/${f.owner.id}/representatives/${representative.id}/consent"]`).filter({has: page.locator('input[name="action"][value="consent"]')});
    await consent.getByRole("radio", {name: "Nahrát obrázek", exact: true}).check();
    const signature = await sharp(Buffer.from('<svg width="500" height="140"><rect width="500" height="140" fill="white"/><path d="M25 85 Q65 15 100 80 T190 60 Q240 15 270 95 L430 70" fill="none" stroke="black" stroke-width="4"/></svg>')).png().toBuffer();
    await consent.locator('input[name="signature"]').setInputFiles({name: "muj-podpis-qa.png", mimeType: "image/png", buffer: signature});
    await expect(consent.getByAltText("Náhled vašeho podpisu")).toBeVisible();
    await consent.getByRole("checkbox", {name: /Jsem oprávněn jednat za Brickflow Nájemní QA/}).check();
    await consent.getByRole("button", {name: "Potvrdit oprávnění a uložit podpis", exact: true}).click();
    await expect(page.locator("#doklady-a-podpisy")).toContainText("Souhlas a podpis platný");
    const signed = await db.ownerRepresentative.findUniqueOrThrow({where: {id: representative.id}});
    expect(signed.signatureHash).toBeTruthy(); expect(signed.consentedAt).not.toBeNull();
    await profile.getByLabel("Osoba podepisující doklady").selectOption(representative.id);
    await profile.getByRole("checkbox", {name: "Povolit vystavování dokladů za tohoto pronajímatele", exact: true}).check();
    await profile.getByRole("button", {name: "Uložit údaje a vystavování", exact: true}).click();
    await expect(page.locator("#doklady-a-podpisy")).toContainText("Vystavování připraveno");
    await capture(page, info, "owner-receipt-settings-desktop");
    await page.setViewportSize({width: 390, height: 844}); await capture(page, info, "owner-receipt-settings-mobile");
    await page.setViewportSize({width: 1440, height: 1000});

    await page.goto(`${f.unitUrl}#doklady`);
    const assignment = page.locator(`form[action="/api/leases/${f.lease.id}/landlord"]`).filter({has: page.locator('input[name="action"][value="add"]')});
    await assignment.getByLabel("Smluvní pronajímatel").selectOption(f.owner.id);
    await assignment.getByLabel("Od období včetně").fill(f.charge.period);
    await assignment.getByRole("button", {name: "Potvrdit pronajímatele pro období", exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`/jednotky/${f.unit.id}\\?ok=`));
    expect(await db.leaseLandlordPeriod.count({where: {leaseId: f.lease.id, ownerId: f.owner.id, fromPeriod: f.charge.period}})).toBe(1);
    await expect(page.locator("#doklady").getByRole("button", {name: "Vystavit a stáhnout PDF", exact: true})).toBeEnabled();
    await capture(page, info, "unit-receipts-desktop");
    await page.setViewportSize({width: 390, height: 844}); await capture(page, info, "unit-receipts-mobile");
    const [staffDownload] = await Promise.all([page.waitForEvent("download"), page.locator("#doklady").getByRole("button", {name: "Vystavit a stáhnout PDF", exact: true}).click()]);
    const staffBytes = await bytes(staffDownload); expect(staffBytes.subarray(0, 4).toString()).toBe("%PDF");
    const receipt = await db.tenantPaymentReceipt.findFirstOrThrow({where: {chargeId: f.charge.id}});
    expect(receipt.issuerOwnerId).toBe(f.owner.id); expect(receipt.issuerId).toBe(f.admin.id); expect(receipt.requestedById).toBe(f.admin.id); expect(receipt.issuanceMode).toBe("staff");
    expect(receipt.snapshot).toMatchObject({issuerName: "Brickflow Nájemní QA s.r.o.", signerName: f.admin.name, signerRole: "Jednatel", period: f.charge.period, signatureHash: signed.signatureHash});
    await login(tenantPage, f.actor.email); await tenantPage.goto(`/portal/najemnik/${f.tenant.id}#dokumenty-${f.lease.id}-doklady`);
    const dialog = tenantPage.getByRole("dialog", {name: "Dokumenty", exact: true});
    await expect(dialog.getByRole("button", {name: "Vygenerovat a stáhnout PDF", exact: true})).toBeEnabled();
    const [tenantDownload] = await Promise.all([tenantPage.waitForEvent("download"), dialog.getByRole("button", {name: "Vygenerovat a stáhnout PDF", exact: true}).click()]);
    expect(await bytes(tenantDownload)).toEqual(staffBytes); expect(await db.tenantPaymentReceipt.count({where: {chargeId: f.charge.id}})).toBe(1);
    await page.goto(`${f.unitUrl}#doklady`); await expect(page.locator("#doklady").getByRole("link", {name: "Stáhnout PDF", exact: true})).toBeVisible();
    const audit = await db.auditLog.findFirstOrThrow({where: {action: "OWNER_RECEIPT_SIGNATURE_CONSENTED", entityId: representative.id}});
    expect(audit.userId).toBe(f.admin.id);
  } finally {await tenantPage.close(); await cleanup(f);}
});

test("read-only viewers and impersonated accounts cannot alter representation, consent, landlord or issue receipts", async ({page, browser}) => {
  test.setTimeout(90000);
  const f = await fixture(), viewerPage = await browser.newPage();
  try {
    const profile = await db.ownerReceiptProfile.create({data: {ownerId: f.owner.id, issuerName: f.owner.name, issuerAddress: f.owner.address!, updatedById: f.admin.id}});
    const representative = await db.ownerRepresentative.create({data: {ownerId: f.owner.id, userId: f.admin.id, createdById: f.admin.id}});
    const requests: {path: string; form: Record<string, string>}[] = [
      {path: `/api/owners/${f.owner.id}/receipt-profile`, form: {revision: profile.updatedAt.toISOString(), issuerName: "Nesmí se uložit", issuerAddress: "Cizí adresa", enabled: "on"}},
      {path: `/api/owners/${f.owner.id}/representatives`, form: {action: "add", userEmail: f.viewer.email, roleLabel: "Nepovolené", active: "on"}},
      {path: `/api/owners/${f.owner.id}/representatives/${representative.id}/consent`, form: {action: "revoke", revision: representative.updatedAt.toISOString(), profileRevision: "1"}},
      {path: `/api/leases/${f.lease.id}/landlord`, form: {action: "add", ownerId: f.owner.id, fromPeriod: f.charge.period, active: "on"}},
      {path: `/api/leases/${f.lease.id}/receipts`, form: {chargeId: f.charge.id}},
    ];
    const assertUnchanged = async () => {
      expect((await db.ownerReceiptProfile.findUniqueOrThrow({where: {ownerId: f.owner.id}})).issuerName).toBe(f.owner.name);
      expect(await db.ownerRepresentative.count({where: {ownerId: f.owner.id}})).toBe(1);
      expect((await db.ownerRepresentative.findUniqueOrThrow({where: {id: representative.id}})).revokedAt).toBeNull();
      expect(await db.leaseLandlordPeriod.count({where: {leaseId: f.lease.id}})).toBe(0);
      expect(await db.tenantPaymentReceipt.count({where: {chargeId: f.charge.id}})).toBe(0);
    };
    await login(viewerPage, f.viewer.email);
    for (const request of requests) {
      const response = await viewerPage.request.post(request.path, {headers: await sessionHeaders(viewerPage), form: request.form, maxRedirects: 0});
      expect(response.status()).toBe(303); expect(response.headers().location).toContain("error=");
    }
    await assertUnchanged();
    await login(page, f.admin.email);
    const preview = await page.request.post("/api/admin/user-preview", {headers: await sessionHeaders(page), form: {userId: f.viewer.id}, maxRedirects: 0}); expect(preview.status()).toBe(303);
    expect((await page.context().cookies()).some(cookie => cookie.name === "fb_user_preview")).toBe(true);
    for (const request of requests) expect((await page.request.post(request.path, {headers: await sessionHeaders(page), form: request.form, maxRedirects: 0})).status()).toBe(403);
    await assertUnchanged();
    await page.request.post("/api/admin/user-preview/exit", {headers: await sessionHeaders(page), maxRedirects: 0});
    expect((await page.context().cookies()).some(cookie => cookie.name === "fb_user_preview")).toBe(false);
  } finally {await viewerPage.close(); await cleanup(f);}
});
