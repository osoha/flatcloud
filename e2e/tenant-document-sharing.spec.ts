import {randomUUID, createHash} from "node:crypto";
import {createServer, type Server} from "node:http";
import {expect, test, type Page} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient(), password = "Tenant-Document-Sharing-QA-2026";
const bytes = Buffer.from("%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n% tenant document sharing QA\n%%EOF\n");
const objects = new Map<string, Buffer>();
let storage: Server;
const bucket = process.env.S3_BUCKET || "qa-documents";
test.beforeAll(async () => {
  test.skip(process.env.S3_ENDPOINT !== "http://127.0.0.1:3201", "Run in the dedicated isolated S3 document verification step.");
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated database required");
  storage = createServer(async (request, response) => {
    const path = new URL(request.url!, "http://127.0.0.1:3201").pathname;
    if (request.method === "PUT") {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      objects.set(path, Buffer.concat(chunks)); response.setHeader("ETag", '"isolated-qa-only"'); response.end();
    } else if (request.method === "DELETE") {objects.delete(path); response.statusCode = 204; response.end();}
    else if (objects.has(path)) {response.setHeader("Content-Type", "application/pdf"); response.end(request.method === "HEAD" ? undefined : objects.get(path));}
    else {response.statusCode = 404; response.end();}
  });
  await new Promise<void>(resolve => storage.listen(3201, "127.0.0.1", resolve));
});
test.afterAll(async () => {if (storage) await new Promise<void>((resolve, reject) => storage.close(error => error ? reject(error) : resolve())); await db.$disconnect();});
async function login(page: Page, email: string) {
  await page.goto("/login"); await page.getByLabel("E-mail", {exact: true}).fill(email); await page.getByLabel("Heslo", {exact: true}).fill(password);
  await page.getByRole("button", {name: "Přihlásit se", exact: true}).click(); await expect(page).not.toHaveURL(/\/login/);
}
async function authHeaders(page: Page) {
  return {Cookie: (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join("; ")};
}
async function fixture() {
  const tag = randomUUID(), passwordHash = await bcrypt.hash(password, 8);
  const manager = await db.user.create({data: {email: `document-editor-${tag}@flatcloud.test`, name: "Správce jedné jednotky", role: "PROPERTY_MANAGER", passwordHash, isTestIdentity: true, defaultDisplayMode: "pro"}});
  const reader = await db.user.create({data: {email: `document-reader-${tag}@flatcloud.test`, name: "Čtenář portfolia", role: "OWNER_VIEWER", allProperties: true, passwordHash, isTestIdentity: true, defaultDisplayMode: "pro"}});
  const tenantActor = await db.user.create({data: {email: `document-tenant-${tag}@flatcloud.test`, name: "Jan Hrubý QA", role: "TENANT", passwordHash, isTestIdentity: true}});
  const foreignActor = await db.user.create({data: {email: `document-other-${tag}@flatcloud.test`, name: "Jiný nájemník QA", role: "TENANT", passwordHash, isTestIdentity: true}});
  const owner = await db.owner.create({data: {name: `Sdílení dokumentů ${tag}`}});
  const property = await db.property.create({data: {ownerId: owner.id, name: "Dům Lipová QA", address: "Lipová 12", city: "Praha", managerId: manager.id}});
  const otherProperty = await db.property.create({data: {ownerId: owner.id, name: "Cizí dům QA", address: "Jiná 8", city: "Praha"}});
  const unit = await db.unit.create({data: {propertyId: property.id, label: "Byt 1", userAccesses: {create: {userId: manager.id, permission: "EDIT"}}}});
  const otherUnit = await db.unit.create({data: {propertyId: property.id, label: "Byt 2"}});
  const tenant = await db.tenant.create({data: {name: tenantActor.name, email: tenantActor.email}}), foreignTenant = await db.tenant.create({data: {name: foreignActor.name, email: foreignActor.email}});
  const lease = await db.lease.create({data: {unitId: unit.id, tenantId: tenant.id, startDate: new Date("2025-01-01T12:00Z"), financialTrackingFromPeriod: "2025-01", variableSymbol: `doc-${tag}`, rentCents: 1000000, servicesCents: 0, autoChargesEnabled: false, contractNumber: "Smlouva Hrubý QA"}});
  const otherLease = await db.lease.create({data: {unitId: otherUnit.id, tenantId: foreignTenant.id, startDate: new Date("2025-01-01T12:00Z"), financialTrackingFromPeriod: "2025-01", variableSymbol: `other-${tag}`, rentCents: 1000000, servicesCents: 0, autoChargesEnabled: false}});
  await db.tenantPortalAccess.createMany({data: [{tenantId: tenant.id, userId: tenantActor.id}, {tenantId: foreignTenant.id, userId: foreignActor.id}]});
  const storageKey = `document-sharing/${tag}.pdf`;
  objects.set(`/${bucket}/${storageKey}`, bytes);
  const asset = await db.fileAsset.create({data: {storageKey, originalName: "najemni-smlouva.pdf", mimeType: "application/pdf", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), uploadedById: manager.id}});
  const contract = await db.document.create({data: {propertyId: property.id, unitId: unit.id, leaseId: lease.id, fileAssetId: asset.id, category: "CONTRACT", title: "Nájemní smlouva — Hrubý", createdById: manager.id}});
  const orphan = await db.document.create({data: {propertyId: property.id, unitId: unit.id, fileAssetId: asset.id, category: "OTHER", title: "Nepřiřazený dokument QA", createdById: manager.id}});
  const foreign = await db.document.create({data: {propertyId: property.id, unitId: otherUnit.id, leaseId: otherLease.id, fileAssetId: asset.id, category: "CONTRACT", title: "Cizí smlouva QA", createdById: manager.id}});
  const task = await db.task.create({data: {propertyId: property.id, unitId: unit.id, leaseId: lease.id, tenantId: tenant.id, title: "Interní vlákno QA", category: "GENERAL", createdById: manager.id}});
  const entry = await db.taskEntry.create({data: {taskId: task.id, authorId: manager.id, visibility: "INTERNAL", kind: "COMMENT", body: "Interní podklad nesmí uniknout do portálu."}});
  const internal = await db.document.create({data: {propertyId: property.id, unitId: unit.id, leaseId: lease.id, taskId: task.id, taskEntryId: entry.id, fileAssetId: asset.id, category: "OTHER", title: "LEGACY INTERNAL SECRET", tenantVisible: true, createdById: manager.id}});
  const wrongUnit = await db.document.create({data: {propertyId: property.id, unitId: otherUnit.id, leaseId: lease.id, fileAssetId: asset.id, category: "CONTRACT", title: "LEGACY WRONG UNIT SECRET", tenantVisible: true, createdById: manager.id}});
  const wrongProperty = await db.document.create({data: {propertyId: otherProperty.id, unitId: unit.id, leaseId: lease.id, fileAssetId: asset.id, category: "CONTRACT", title: "LEGACY WRONG PROPERTY SECRET", tenantVisible: true, createdById: manager.id}});
  return {tag, manager, reader, tenantActor, foreignActor, owner, property, otherProperty, unit, otherUnit, tenant, foreignTenant, lease, otherLease, asset, contract, orphan, foreign, internal, wrongUnit, wrongProperty, task};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function cleanup(f: Fixture) {
  const users = [f.manager.id, f.reader.id, f.tenantActor.id, f.foreignActor.id], properties = [f.property.id, f.otherProperty.id], tenants = [f.tenant.id, f.foreignTenant.id];
  const assets = await db.fileAsset.findMany({where: {uploadedById: {in: users}}, select: {id: true, storageKey: true}});
  await db.document.deleteMany({where: {createdById: {in: users}}});
  await db.fileAsset.deleteMany({where: {id: {in: assets.map(asset => asset.id)}}}); assets.forEach(asset => objects.delete(`/${bucket}/${asset.storageKey}`));
  await db.task.deleteMany({where: {propertyId: {in: properties}}});
  await db.tenantPortalAccess.deleteMany({where: {tenantId: {in: tenants}}});
  await db.lease.deleteMany({where: {id: {in: [f.lease.id, f.otherLease.id]}}});
  await db.tenant.deleteMany({where: {id: {in: tenants}}}); await db.unit.deleteMany({where: {propertyId: {in: properties}}});
  await db.property.deleteMany({where: {id: {in: properties}}}); await db.owner.delete({where: {id: f.owner.id}});
  await db.auditLog.deleteMany({where: {userId: {in: users}}}); await db.user.deleteMany({where: {id: {in: users}}});
}

test("unit and catalog expose explicit document sharing while tenant downloads enforce the exact lease", async ({page, browser}, info) => {
  const f = await fixture(), tenantContext = await browser.newContext(), tenantPage = await tenantContext.newPage();
  const unitUrl = `/nemovitosti/${f.property.id}/jednotky/${f.unit.id}`, tenantUrl = `/portal/najemnik/${f.tenant.id}`;
  const download = (id: string) => `/api/portal/tenants/${f.tenant.id}/documents/${id}`;
  try {
    await login(page, f.manager.email); await page.goto(`${unitUrl}#dokumenty`);
    const contract = page.locator(`[data-document-id="${f.contract.id}"]`), orphan = page.locator(`[data-document-id="${f.orphan.id}"]`);
    await expect(contract).toContainText("Pouze správa"); await expect(orphan).toContainText("Nepřiřazeno ke smlouvě");
    await expect(orphan.getByRole("button", {name: "Zpřístupnit nájemníkovi"})).toHaveCount(0);
    await expect(page.locator(`[data-document-id="${f.internal.id}"]`).getByRole("button", {name: "Skrýt v portálu"})).toHaveCount(0);
    await page.locator('#dokumenty').getByRole("link", {name: "Oznámení nájemníkovi", exact: true}).click();
    await expect(page.locator('select[name="audience"]')).toHaveValue(`lease:${f.lease.id}`);
    expect(await db.announcement.count({where: {createdById: f.manager.id}})).toBe(0);
    await page.goto(`${unitUrl}#dokumenty`);
    await login(tenantPage, f.tenantActor.email);
    expect((await tenantPage.request.get(download(f.contract.id), {headers: await authHeaders(tenantPage)})).status()).toBe(404);
    await tenantPage.goto(`${tenantUrl}#dokumenty-${f.lease.id}`);
    await expect(tenantPage.getByRole("dialog", {name: "Dokumenty", exact: true})).not.toContainText(f.contract.title);
    await contract.getByRole("button", {name: "Zpřístupnit nájemníkovi", exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`${unitUrl}\\?ok=.*#dokumenty$`));
    await expect(contract).toContainText("Zpřístupněno nájemníkovi");
    await expect(page.locator('.flash')).toContainText("Dokument je zpřístupněný");
    await contract.screenshot({path: info.outputPath("unit-document-sharing-desktop.png")});
    await page.setViewportSize({width: 390, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await contract.screenshot({path: info.outputPath("unit-document-sharing-mobile.png")});
    await tenantPage.reload();
    await expect(tenantPage.getByRole("dialog", {name: "Dokumenty", exact: true})).toContainText(f.contract.title);
    await expect(tenantPage.getByRole("dialog", {name: "Dokumenty", exact: true})).not.toContainText("LEGACY");
    const downloaded = await tenantPage.request.get(download(f.contract.id), {headers: await authHeaders(tenantPage)}); expect(downloaded.status()).toBe(200); expect(await downloaded.body()).toEqual(bytes);
    for (const doc of [f.internal, f.wrongUnit, f.wrongProperty, f.foreign, f.orphan]) expect((await tenantPage.request.get(download(doc.id), {headers: await authHeaders(tenantPage)})).status(), doc.title).toBe(404);
    const catalogue = `/dokumenty?property=${f.property.id}&q=${encodeURIComponent(f.contract.title)}`;
    await page.goto(catalogue); await expect(contract).toContainText("Zpřístupněno nájemníkovi");
    await contract.getByRole("button", {name: "Skrýt v portálu", exact: true}).click();
    expect(new URL(page.url()).pathname).toBe("/dokumenty"); expect(new URL(page.url()).searchParams.get("q")).toBe(f.contract.title); expect(new URL(page.url()).searchParams.get("property")).toBe(f.property.id);
    await expect(contract).toContainText("Pouze správa"); expect((await tenantPage.request.get(download(f.contract.id), {headers: await authHeaders(tenantPage)})).status()).toBe(404);
    await tenantPage.reload(); await expect(tenantPage.getByRole("dialog", {name: "Dokumenty", exact: true})).not.toContainText(f.contract.title);
    const unchanged = await db.fileAsset.findUniqueOrThrow({where: {id: f.asset.id}}); expect(unchanged.sha256).toBe(f.asset.sha256);
    const audit = await db.auditLog.findMany({where: {entityId: f.contract.id, action: "TENANT_DOCUMENT_VISIBILITY_CHANGED"}, orderBy: {createdAt: "asc"}});
    expect(audit).toHaveLength(2); expect(audit[0].details).toMatchObject({from: false, to: true, leaseId: f.lease.id}); expect(audit[1].details).toMatchObject({from: true, to: false});
  } finally {await tenantContext.close(); await cleanup(f);}
});

test("sharing rejects read-only, foreign, stale and internal document mutations; handover uploads stay private", async ({page, browser}) => {
  const f = await fixture(), readerContext = await browser.newContext(), reader = await readerContext.newPage();
  const shareUrl = (leaseId: string, docId: string) => `/api/leases/${leaseId}/documents/${docId}/tenant-visibility`;
  try {
    await login(page, f.manager.email); await login(reader, f.reader.email); await reader.goto(`/dokumenty?property=${f.property.id}`);
    await expect(reader.locator(`[data-document-id="${f.contract.id}"]`)).toContainText("Pouze správa");
    await expect(reader.getByRole("button", {name: "Zpřístupnit nájemníkovi", exact: true})).toHaveCount(0);
    await reader.request.post(shareUrl(f.lease.id, f.contract.id), {headers: await authHeaders(reader), form: {tenantVisible: "true"}, maxRedirects: 0});
    expect((await db.document.findUniqueOrThrow({where: {id: f.contract.id}})).tenantVisible).toBe(false);
    for (const [leaseId, doc] of [[f.otherLease.id, f.foreign], [f.otherLease.id, f.contract], [f.lease.id, f.orphan], [f.lease.id, f.internal], [f.lease.id, f.wrongUnit], [f.lease.id, f.wrongProperty]] as const) {
      const result = await page.request.post(shareUrl(leaseId, doc.id), {headers: await authHeaders(page), form: {tenantVisible: doc.tenantVisible ? "false" : "true"}, maxRedirects: 0});
      expect(result.headers().location).toContain("error=");
      expect((await db.document.findUniqueOrThrow({where: {id: doc.id}})).tenantVisible).toBe(doc.tenantVisible);
    }
    const crossSite = await page.request.post(shareUrl(f.lease.id, f.contract.id), {headers: {...await authHeaders(page), Origin: "https://untrusted.example", "Sec-Fetch-Site": "cross-site"}, form: {tenantVisible: "true"}, maxRedirects: 0});
    expect(crossSite.status()).toBe(403);
    const returned = await page.request.post(shareUrl(f.lease.id, f.contract.id), {headers: await authHeaders(page), form: {tenantVisible: "true", returnTo: "https://untrusted.example"}, maxRedirects: 0});
    expect(new URL(returned.headers().location).pathname).toBe(`/smlouvy/${f.lease.id}`);
    expect(new URL(returned.headers().location).hash).toBe("#dokumenty");
    await db.userUnit.update({where: {userId_unitId: {userId: f.manager.id, unitId: f.unit.id}}, data: {permission: "VIEW"}});
    const revoked = await page.request.post(shareUrl(f.lease.id, f.contract.id), {headers: await authHeaders(page), form: {tenantVisible: "false"}, maxRedirects: 0});
    expect(revoked.headers().location).toContain("error="); expect((await db.document.findUniqueOrThrow({where: {id: f.contract.id}})).tenantVisible).toBe(true);
    await db.userUnit.update({where: {userId_unitId: {userId: f.manager.id, unitId: f.unit.id}}, data: {permission: "EDIT"}});
    await page.goto(`/nemovitosti/${f.property.id}/jednotky/${f.unit.id}#dokumenty`); await page.locator("#dokumenty details:has(form.document-upload)>summary").click();
    const upload = page.locator("#dokumenty form.document-upload");
    await upload.locator('select[name="category"]').selectOption("HANDOVER_PROTOCOL"); await expect(upload.locator('select[name="leaseId"]')).toHaveValue(f.lease.id);
    await expect(upload).toContainText("Nové soubory jsou po nahrání pouze pro správu");
    await upload.getByLabel("Název", {exact: true}).fill("Předávací protokol — výslovné sdílení");
    await upload.locator('input[type="file"]').setInputFiles({name: "predani.pdf", mimeType: "application/pdf", buffer: bytes});
    await upload.getByRole("button", {name: "Nahrát přílohy", exact: true}).click(); await expect(page).toHaveURL(/\?ok=/);
    const saved = await db.document.findFirstOrThrow({where: {createdById: f.manager.id, title: "Předávací protokol — výslovné sdílení"}});
    expect(saved).toMatchObject({leaseId: f.lease.id, unitId: f.unit.id, tenantVisible: false, category: "HANDOVER_PROTOCOL"});
  } finally {await readerContext.close(); await cleanup(f);}
});
