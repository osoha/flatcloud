import { test, expect, type Page } from "@playwright/test";
import { prisma as db } from "../lib/db";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

const marker = "R24_AGENT_QA_2026_09";
test.beforeAll(() => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Requires isolated CI DB");
});
test.afterAll(async () => { await db.$disconnect(); });
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Heslo", { exact: true }).fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio/);
}
async function fixture() {
  const property = await db.property.findFirstOrThrow({ where: { name: "Dům ve správě" } });
  const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.unitManager } });
  const item = await db.complianceItem.create({ data: { propertyId: property.id, name: `${marker} history ${Date.now()}`, category: "TEST", frequencyMonths: 12, nextDueAt: new Date("2026-09-10T12:00:00Z") } });
  for (let i = 1; i <= 4; i++) {
    await db.complianceRecord.create({ data: { complianceItemId: item.id, performedAt: new Date(`${2020+i}-09-11T12:00:00Z`), result: i === 4 ? "ISSUE" : "OK", note: `${marker} record ${i}`, performedBy: "Synthetic inspector", createdById: actor.id } });
  }
  const oldest = await db.complianceRecord.findFirstOrThrow({ where: { complianceItemId: item.id }, orderBy: { performedAt: "asc" } });
  const asset = await db.fileAsset.create({ data: { storageKey: `${marker}-${item.id}`, originalName: "protocol.pdf", mimeType: "application/pdf", sizeBytes: 4, sha256: "metadata-only", uploadedById: actor.id } });
  const doc = await db.document.create({ data: { propertyId: property.id, complianceRecordId: oldest.id, fileAssetId: asset.id, createdById: actor.id, title: `${marker} oldest protocol`, category: "INSPECTION_PROTOCOL" } });
  await db.document.create({ data: { propertyId: property.id, complianceRecordId: oldest.id, fileAssetId: asset.id, createdById: actor.id, title: `${marker} hidden deleted protocol`, category: "INSPECTION_PROTOCOL", deletedAt: new Date() } });
  return { property, item, doc };
}

test("R24 compliance: completion shows full history, notes, actor and original protocol", async ({ page }) => {
  const { property, item, doc } = await fixture();
  await login(page, R24_ROLE_USERS.unitManager);
  await page.goto(`/nemovitosti/${property.id}/provoz`);
  const row = page.locator(".compliance-row").filter({ hasText: item.name });
  await row.getByText("Provedeno", { exact: true }).click();
  await row.getByLabel("Datum kontroly", { exact: true }).fill("2026-09-11");
  await row.getByLabel("Provedl", { exact: true }).fill("R24 synthetic technician");
  await row.getByLabel("Poznámka", { exact: true }).fill(`${marker} completed in UI`);
  await row.getByRole("button", { name: "Uložit provedení" }).click();
  await expect(page.getByRole("status")).toContainText("Kontrola byla zaznamenána");
  await row.getByText("Historie kontrol (5)", { exact: true }).click();
  const history = row.locator(".compliance-history");
  await expect(history).toContainText(`${marker} record 1`);
  await expect(history).toContainText(`${marker} completed in UI`);
  await expect(history).toContainText("R24 synthetic technician");
  await expect(history).toContainText("Závada");
  await expect(history.locator(`a[href="/api/documents/${doc.id}/download"]`)).toBeVisible();
  await expect(history).not.toContainText("hidden deleted protocol");
  const rows = await history.locator("h3").allTextContents();
  expect(rows[0]).toContain("2026"); expect(rows[4]).toContain("2021");
  expect((await db.complianceItem.findUniqueOrThrow({ where: { id: item.id } })).nextDueAt.toISOString().slice(0,10)).toBe("2027-09-11");
  expect(await db.complianceRecord.count({ where: { complianceItemId: item.id } })).toBe(5);
});

test("R24 compliance: property VIEW reads history; unit-only and foreign scopes cannot open it", async ({ page }) => {
  const { property, item } = await fixture();
  await login(page, R24_ROLE_USERS.externalOwner);
  await page.goto(`/nemovitosti/${property.id}/provoz`);
  const row = page.locator(".compliance-row").filter({ hasText: item.name });
  await row.getByText("Historie kontrol (4)", { exact: true }).click();
  await expect(row).toContainText(`${marker} record 1`);
  await expect(row.getByRole("button", { name: "Uložit provedení" })).toHaveCount(0);
  await expect(row).not.toContainText("hidden deleted protocol");
  for (const email of [R24_ROLE_USERS.novice, R24_ROLE_USERS.advanced]) {
    await page.getByRole("button", { name: "Odhlásit", exact: true }).click();
    await login(page, email);
    const response = await page.goto(`/nemovitosti/${property.id}/provoz`);
    expect(response?.status()).toBe(404);
    await expect(page.locator("body")).not.toContainText(item.name);
    if (email === R24_ROLE_USERS.novice) await page.goto("/portfolio");
  }
});
