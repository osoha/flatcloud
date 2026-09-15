import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma as db } from "../lib/db";

const marker = "R24_AGENT_QA_2026_09";
test.beforeAll(() => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Preview fixtures require isolated DB");
  if (!["localhost", "127.0.0.1"].includes(new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3100").hostname)) throw new Error("Preview fixtures require isolated app");
});
test.afterAll(async () => { await db.$disconnect(); });

for (const scenario of ["desktop", "mobile", "error-retry"] as const) {
  test(`R24 H image preview: ${scenario} preserves context and keyboard access`, async ({ page }, testInfo) => {
    const title = `${marker} náhled ${randomUUID()} dlouhý název obrázku`;
    const admin = await db.user.findUniqueOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test" } });
    const property = await db.property.findFirstOrThrow({ where: { active: true } });
    const task = await db.task.create({ data: { title, propertyId: property.id, category: "MAINTENANCE", createdById: admin.id } });
    const entry = await db.taskEntry.create({ data: { taskId: task.id, authorId: admin.id, kind: "COMMENT", visibility: "INTERNAL", body: `${marker} preserved history` } });
    const asset = await db.fileAsset.create({ data: { storageKey: title, previewStorageKey: `${title}-preview`, thumbnailStorageKey: `${title}-thumb`, originalName: `${title}.png`, mimeType: "image/png", sizeBytes: 100, sha256: "0".repeat(64), uploadedById: admin.id } });
    const doc = await db.document.create({ data: { propertyId: property.id, taskId: task.id, taskEntryId: entry.id, fileAssetId: asset.id, category: "PHOTO", title, createdById: admin.id } });
    // UI-only image transport fixture; real authorization remains covered by the visibility suite.
    const image = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#235c91" } }).webp().toBuffer();
    let previews = 0;
    await page.route(`**/api/documents/${doc.id}/download?variant=*`, async route => {
      const preview = new URL(route.request().url()).searchParams.get("variant") === "preview";
      if (preview) previews++;
      if (preview && scenario === "error-retry" && previews === 1) return route.fulfill({ status: 404, body: "Not found" });
      await route.fulfill({ contentType: "image/webp", body: image });
    });
    if (scenario === "mobile") await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(admin.email);
    await page.getByLabel("Heslo").fill(process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
    await page.getByRole("button", { name: "Přihlásit se" }).click();
    await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
    await page.goto(`/ukoly/${task.id}`);
    const editPanel = page.locator("details").filter({ has: page.locator("summary", { hasText: "Upravit případ" }) });
    await editPanel.locator("summary").click();
    await expect(editPanel).toHaveAttribute("open", "");
    const draft = page.getByLabel("Nový záznam", { exact: true });
    await draft.fill(`${marker} unsaved draft`);
    const url = page.url();
    const trigger = page.getByRole("button", { name: `Otevřít náhled: ${title}` });
    await trigger.focus();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await trigger.press("Enter");
    const dialog = page.getByRole("dialog", { name: title });
    const close = dialog.getByRole("button", { name: "Zavřít náhled" });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    expect(await dialog.evaluate(el => el.matches(":modal"))).toBe(true);
    if (scenario === "error-retry") {
      await expect(dialog.getByRole("alert")).toContainText("Náhled se nepodařilo načíst");
      await close.press("Shift+Tab");
      await expect(dialog.getByRole("button", { name: "Zkusit znovu" })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await dialog.getByRole("button", { name: "Zkusit znovu" }).click();
    }
    await expect.poll(() => dialog.getByRole("img").evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    const bounds = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await testInfo.attach(`preview-${scenario}`, { body: await page.screenshot(), contentType: "image/png" });
    await close.focus();
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(editPanel).toHaveAttribute("open", "");
    expect(page.url()).toBe(url);
    await expect(draft).toHaveValue(`${marker} unsaved draft`);
    expect(await page.evaluate(before => Math.abs(window.scrollY - before), scrollBefore)).toBeLessThanOrEqual(1);
    await trigger.click();
    await expect(dialog).toBeVisible();
    await close.click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(page.url()).toBe(url);
    expect(await db.taskEntry.count({ where: { taskId: task.id } })).toBe(1);
    await expect(page.locator(`a[href="/api/documents/${doc.id}/download"]`)).toHaveText("Stáhnout");
  });
}
