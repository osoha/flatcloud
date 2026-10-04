import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// This test uses an isolated, in-memory S3 endpoint. It never contacts live storage.
const db = new PrismaClient();
let storage: Server;
const objects = new Map<string, Buffer>();
test.beforeAll(async () => {
  test.skip(process.env.S3_ENDPOINT !== "http://127.0.0.1:3201", "Run with the isolated S3 fixture, separately from disabled-storage tests.");
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Requires isolated database");
  storage = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://127.0.0.1:3201").pathname;
    if (req.method === "PUT") {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      objects.set(path, Buffer.concat(chunks)); res.setHeader("ETag", '"qa-only"'); res.end();
    } else if (req.method === "DELETE") { objects.delete(path); res.statusCode = 204; res.end(); }
    else if (objects.has(path)) { res.setHeader("Content-Type", "application/pdf"); res.end(req.method === "HEAD" ? undefined : objects.get(path)); }
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>(resolve => storage.listen(3201, "127.0.0.1", resolve));
});
test.afterAll(async () => { if (storage) await new Promise<void>((resolve, reject) => storage.close(error => error ? reject(error) : resolve())); await db.$disconnect(); });
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test");
  await page.getByLabel("Heslo", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio/);
}
async function fixture() {
  const tag = `Lease upload QA ${randomUUID()}`;
  const actor = await db.user.findUniqueOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test" } });
  const owner = await db.owner.create({ data: { name: tag } });
  const property = await db.property.create({ data: { ownerId: owner.id, name: tag, address: "QA", city: "QA" } });
  const unit = await db.unit.create({ data: { propertyId: property.id, label: "QA 1" } });
  const tenant = await db.tenant.create({ data: { name: tag, createdById: actor.id, avatarChoice: "library:person:25" } });
  const lease = await db.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, startDate: new Date("2020-01-01T12:00Z"), endDate: new Date("2089-12-31T12:00Z"), financialTrackingFromPeriod: "2020-01", variableSymbol: randomUUID(), contractNumber: tag, rentCents: 100000, servicesCents: 0, autoChargesEnabled: false } });
  const future = await db.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, startDate: new Date("2090-01-01T12:00Z"), financialTrackingFromPeriod: "2090-01", variableSymbol: randomUUID(), contractNumber: `${tag} future`, rentCents: 100000, servicesCents: 0, autoChargesEnabled: false } });
  return { property, unit, tenant, lease, future };
}
const file = { name: "synthetic-contract.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n") };

test("unit contract tab and documents upload contract scans to the deliberately selected lease", async ({ page }, info) => {
  const f = await fixture();
  await login(page);
  const unitUrl = `/nemovitosti/${f.property.id}/jednotky/${f.unit.id}`;
  await page.goto(unitUrl);
  await page.locator('.unit-tabs a[href="#smlouva"]').click();
  await expect(page.getByRole("link", { name: "Nahrát smlouvu nebo dodatek" })).toHaveAttribute("href", `/smlouvy/${f.lease.id}#dokumenty`);
  await page.locator('.unit-tabs a[href="#dokumenty"]').click();
  await page.locator("#dokumenty details>summary").click();
  const form = page.locator("#dokumenty form.document-upload");
  await form.locator('select[name="category"]').selectOption("CONTRACT");
  await expect(form.locator('select[name="leaseId"]')).toHaveValue("");
  await form.locator('select[name="leaseId"]').selectOption(f.lease.id);
  const title = `Sken smlouvy QA ${randomUUID()}`;
  await form.getByLabel("Název", { exact: true }).fill(title);
  await form.locator('input[type="file"]').setInputFiles(file);
  await page.screenshot({ path: info.outputPath("unit-contract-upload.png"), fullPage: true });
  await form.getByRole("button", { name: "Nahrát přílohy" }).click();
  await expect(page).toHaveURL(/\?ok=/);
  const saved = await db.document.findFirstOrThrow({ where: { title }, include: { fileAsset: true } });
  expect(saved.category).toBe("CONTRACT"); expect(saved.leaseId).toBe(f.lease.id); expect(saved.unitId).toBe(f.unit.id);
  expect(objects.has(`/qa-documents/${saved.fileAsset.storageKey}`)).toBe(true);
  await expect(page.locator("#dokumenty")).toContainText(title);
  await page.goto(`/smlouvy/${f.lease.id}#dokumenty`);
  await expect(page.locator("#dokumenty")).toContainText(title);
  await page.goto(`/smlouvy/${f.future.id}#dokumenty`);
  await expect(page.locator("#dokumenty")).not.toContainText(title);
});

test("canonical lease upload stores addendum and unit shows selected avatar with Profi graphics disabled", async ({ page }) => {
  const f = await fixture();
  await login(page);
  await page.goto(`/smlouvy/${f.lease.id}#dokumenty`);
  await page.getByText("Nahrát dokument smlouvy", { exact: true }).click();
  const form = page.locator("#dokumenty form.document-upload");
  await form.locator('select[name="category"]').selectOption("CONTRACT_ADDENDUM");
  const title = `Dodatek QA ${randomUUID()}`;
  await form.getByLabel("Název", { exact: true }).fill(title);
  await form.locator('input[type="file"]').setInputFiles(file);
  await form.getByRole("button", { name: "Nahrát přílohy" }).click();
  await expect(page).toHaveURL(/\?ok=/);
  expect((await db.document.findFirstOrThrow({ where: { title } })).leaseId).toBe(f.lease.id);
  await page.goto(`/nemovitosti/${f.property.id}/jednotky/${f.unit.id}`);
  await expect(page.locator("#dokumenty")).toContainText(title);
  // Force the actual default presentation attribute; selected identity is still visible.
  await page.locator("html").evaluate(element => element.setAttribute("data-profi-graphics", "false"));
  await expect(page.locator(".main-person .tenant-avatar")).toHaveCSS("background-image", /person-25\.webp/);
  await expect(page.locator(".main-person .person-icon")).toHaveCount(0);
  await db.tenant.update({ where: { id: f.tenant.id }, data: { avatarMimeType: "image/png", avatarData: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2XwAAAABJRU5ErkJggg==", "base64") } });
  await page.reload();
  await page.locator("html").evaluate(element => element.setAttribute("data-profi-graphics", "false"));
  await expect(page.locator(".main-person .tenant-avatar img")).toBeVisible();
});
