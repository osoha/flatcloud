import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Heslo").fill(adminPassword);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
}

async function expectViewportDialog(page: Page, dialogName: string | RegExp) {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  const content = dialog.locator(".dismissible-details-content");
  await content.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await dialog.getByRole("button", { name: "Zavřít", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
}

test("velké modaly kvality a distribuce zůstávají ve viewportu", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 768 });
  await login(page);

  await page.goto("/portfolio/kvalita");
  const snapshot = page.locator(".condition-assessment").last();
  await snapshot.getByText("Nový snapshot", { exact: true }).click();
  await expectViewportDialog(page, "Nové hodnocení kvality");

  await page.goto("/distribuce");
  const assessment = page.locator(".distribution-assessment").filter({ hasText: "Změnit připravenost" }).first();
  await assessment.getByText("Změnit připravenost", { exact: true }).click();
  await expectViewportDialog(page, "Změna distribuční připravenosti");

  const valuation = page.locator(".distribution-valuation").first();
  await valuation.getByText("Nová valuace", { exact: true }).click();
  await expectViewportDialog(page, "Nová valuace jednotky");
});

test("viewport modal funguje i na mobilu a zavře se Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/portfolio/kvalita");
  const trigger = page.locator(".condition-assessment").last();
  await trigger.getByText("Nový snapshot", { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nové hodnocení kvality" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  expect(box!.y + box!.height).toBeLessThanOrEqual(845);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("CRM editace používá viewport modal, pokud jsou seedované příležitosti", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 768 });
  await login(page);
  await page.goto("/distribuce/zajemci");
  const edit = page.locator(".crm-opportunity-edit").first();
  if (await edit.count()) {
    await edit.getByText("Upravit", { exact: true }).click();
    await expectViewportDialog(page, /Upravit příležitost/);
  }
});
