import {test, expect, type Page} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {createServer, type Server} from "node:http";
import {randomUUID} from "node:crypto";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import {businessTodayKey} from "../lib/calendar";
import {cleanupImmutableMeterReadings} from "./cleanup-immutable-meter-readings";

// Deliberately separate from the ordinary disabled-storage browser run.
// Every byte stays in this test process; no live storage or email is involved.
const db = new PrismaClient();
const objects = new Map<string, {body: Buffer; contentType: string}>();
let storage: Server | undefined;

test.beforeAll(async () => {
  test.skip(process.env.S3_ENDPOINT !== "http://127.0.0.1:3201", "Requires the isolated in-memory S3 fixture.");
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated CI database required");
  storage = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://127.0.0.1:3201");
    if (request.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      objects.set(url.pathname, {body: Buffer.concat(chunks), contentType: request.headers["content-type"] || "application/octet-stream"});
      response.setHeader("ETag", '"portal-qa-only"'); response.end();
    } else if (request.method === "DELETE") {
      objects.delete(url.pathname); response.statusCode = 204; response.end();
    } else if (objects.has(url.pathname)) {
      const object = objects.get(url.pathname)!;
      response.setHeader("Content-Type", url.searchParams.get("response-content-type") || object.contentType);
      response.end(request.method === "HEAD" ? undefined : object.body);
    } else { response.statusCode = 404; response.end(); }
  });
  await new Promise<void>((resolve, reject) => {
    storage!.once("error", reject);
    storage!.listen(3201, "127.0.0.1", resolve);
  });
});
test.afterAll(async () => {
  if (storage) await new Promise<void>((resolve, reject) => storage!.close(error => error ? reject(error) : resolve()));
  objects.clear(); await db.$disconnect();
});

async function sessionHeaders(page: Page) {
  return {Cookie: (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join("; ")};
}

test("tenant submits a meter photograph and only the correct active lease can download it", async ({page, browser}, info) => {
  const tag = randomUUID(), password = "Portal-Meter-Photo-Isolated-2026", passwordHash = await bcrypt.hash(password, 8);
  const actor = await db.user.create({data: {email: `photo-${tag}@flatcloud.test`, name: "Jana Testovací", role: "TENANT", passwordHash, isTestIdentity: true}});
  const otherActor = await db.user.create({data: {email: `photo-other-${tag}@flatcloud.test`, name: "Pavel Jiný", role: "TENANT", passwordHash, isTestIdentity: true}});
  const owner = await db.owner.create({data: {name: `Odečty QA ${tag}`}});
  const property = await db.property.create({data: {ownerId: owner.id, name: "Měřidla QA", address: "Testovací 1", city: "Praha"}});
  const unit = await db.unit.create({data: {propertyId: property.id, label: "Byt 1"}});
  const otherUnit = await db.unit.create({data: {propertyId: property.id, label: "Byt 2"}});
  const tenant = await db.tenant.create({data: {name: actor.name, email: actor.email}});
  const otherTenant = await db.tenant.create({data: {name: otherActor.name, email: otherActor.email}});
  const lease = await db.lease.create({data: {unitId: unit.id, tenantId: tenant.id, startDate: new Date("2025-01-01T12:00:00Z"), financialTrackingFromPeriod: "2025-01", rentCents: 1000000, servicesCents: 0, variableSymbol: `${tag}-1`}});
  const otherLease = await db.lease.create({data: {unitId: otherUnit.id, tenantId: otherTenant.id, startDate: new Date("2025-01-01T12:00:00Z"), financialTrackingFromPeriod: "2025-01", rentCents: 1000000, servicesCents: 0, variableSymbol: `${tag}-2`}});
  const meter = await db.meter.create({data: {propertyId: property.id, unitId: unit.id, scope: "UNIT", type: "COLD_WATER", unitOfMeasure: "m³", label: "Studená voda", serialNumber: "QA-001"}});
  await db.tenantPortalAccess.createMany({data: [{userId: actor.id, tenantId: tenant.id}, {userId: otherActor.id, tenantId: otherTenant.id}]});
  const otherPage = await browser.newPage();
  try {
    await page.goto("/login"); await page.getByLabel("E-mail").fill(actor.email); await page.getByLabel("Heslo").fill(password);
    await page.getByRole("button", {name: "Přihlásit se", exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`/portal/najemnik/${tenant.id}`));
    await page.locator(`main a[href="#odecty-${lease.id}"]`).click();
    const dialog = page.getByRole("dialog", {name: "Měřidla a odečty", exact: true});
    await expect(dialog).toContainText("QA-001");
    await dialog.getByLabel("Nový stav (m³)").fill("12.5");
    const photo = await sharp({create: {width: 240, height: 180, channels: 3, background: {r: 180, g: 190, b: 170}}}).png().toBuffer();
    await dialog.getByLabel("Fotografie měřidla (nepovinné)").setInputFiles({name: "qa-vodomer.png", mimeType: "image/png", buffer: photo});
    await dialog.getByRole("button", {name: "Uložit odečet", exact: true}).click();
    await expect(page).toHaveURL(/\?ok=/);
    const reading = await db.meterReading.findFirstOrThrow({where: {meterId: meter.id}});
    expect(reading.value).toBe(12.5); expect(reading.leaseId).toBe(lease.id); expect(reading.evidenceDocumentId).not.toBeNull();
    const evidence = await db.document.findUniqueOrThrow({where: {id: reading.evidenceDocumentId!}, include: {fileAsset: true}});
    expect(evidence.leaseId).toBe(lease.id); expect(evidence.unitId).toBe(unit.id); expect(evidence.tenantVisible).toBe(true);
    expect(objects.has(`/qa-documents/${evidence.fileAsset.storageKey}`)).toBe(true);
    await expect(dialog.getByRole("link", {name: "Fotografie odečtu", exact: true})).toBeVisible();
    const downloaded = await page.request.get(`/api/portal/tenants/${tenant.id}/documents/${evidence.id}`, {headers: await sessionHeaders(page)});
    expect(downloaded.status()).toBe(200); expect(downloaded.headers()["content-type"]).toMatch(/^image\//);
    expect((await downloaded.body()).length).toBeGreaterThan(0);
    await page.setViewportSize({width: 390, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const screenshotPath = info.outputPath("portal-meter-photo-mobile.png");
    await page.screenshot({path: screenshotPath, fullPage: false});
    await info.attach("portal-meter-photo-mobile", {path: screenshotPath, contentType: "image/png"});

    await otherPage.goto("/login"); await otherPage.getByLabel("E-mail").fill(otherActor.email); await otherPage.getByLabel("Heslo").fill(password);
    await otherPage.getByRole("button", {name: "Přihlásit se", exact: true}).click();
    await expect(otherPage).toHaveURL(new RegExp(`/portal/najemnik/${otherTenant.id}`));
    expect((await otherPage.request.get(`/api/portal/tenants/${otherTenant.id}/documents/${evidence.id}`, {headers: await sessionHeaders(otherPage)})).status()).toBe(404);
    expect((await otherPage.request.get(`/api/portal/tenants/${tenant.id}/documents/${evidence.id}`, {headers: await sessionHeaders(otherPage)})).status()).toBe(404);
    await page.request.post(`/api/portal/tenants/${tenant.id}/readings`, {headers: await sessionHeaders(page), form: {leaseId: lease.id, meterId: meter.id, readAt: businessTodayKey(), value: "11"}, maxRedirects: 0});
    expect(await db.meterReading.count({where: {meterId: meter.id}})).toBe(1);
    await db.tenant.update({where: {id: tenant.id}, data: {communicationEmail: `changed-${tag}@flatcloud.test`}});
    expect((await page.request.get(`/api/portal/tenants/${tenant.id}/documents/${evidence.id}`, {headers: await sessionHeaders(page)})).status()).toBe(404);
  } finally {
    await otherPage.close();
    await cleanupImmutableMeterReadings(db, [meter.id]);
    await db.document.deleteMany({where: {createdById: actor.id, propertyId: property.id}});
    await db.fileAsset.deleteMany({where: {uploadedById: actor.id}});
    await db.auditLog.deleteMany({where: {userId: {in: [actor.id, otherActor.id]}}});
    await db.tenantPortalAccess.deleteMany({where: {tenantId: {in: [tenant.id, otherTenant.id]}}});
    await db.meter.delete({where: {id: meter.id}});
    await db.lease.deleteMany({where: {id: {in: [lease.id, otherLease.id]}}});
    await db.tenant.deleteMany({where: {id: {in: [tenant.id, otherTenant.id]}}});
    await db.unit.deleteMany({where: {propertyId: property.id}});
    await db.property.delete({where: {id: property.id}});
    await db.owner.delete({where: {id: owner.id}});
    await db.user.deleteMany({where: {id: {in: [actor.id, otherActor.id]}}});
  }
});
