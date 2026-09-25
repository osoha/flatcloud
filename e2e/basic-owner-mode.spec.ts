import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

test("Basic switch persists and unit-only access stays scoped", async ({ page, context }, testInfo) => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated CI database required");
  const db = new PrismaClient();
  const password = "Basic-Owner-E2E-2026";
  try {
    const tag = `Basic ${crypto.randomUUID().slice(0, 8)}`;
    const owner = await db.owner.create({ data: { name: `${tag} owner` } });
    const property = await db.property.create({ data: { name: `${tag} house`, address: "Testovací 2", city: "Praha", ownerId: owner.id } });
    const visible = await db.unit.create({ data: { propertyId: property.id, label: `${tag} visible` } });
    const hidden = await db.unit.create({ data: { propertyId: property.id, label: `${tag} hidden` } });
    const user = await db.user.create({ data: { email: `basic-${crypto.randomUUID()}@flatcloud.test`, name: `${tag} user`, role: "OWNER_VIEWER", active: true, allProperties: false, passwordHash: await bcrypt.hash(password, 8), isTestIdentity: false } });
    await db.userUnit.create({ data: { userId: user.id, unitId: visible.id, permission: "VIEW" } });

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Heslo").fill(password);
    await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
    await expect(page).toHaveURL(/\/portfolio/);
    await page.locator(".sidebar .display-mode-switch button[value=basic]").click();
    await expect(page.locator(".basic-portfolio")).toBeVisible();
    await expect(page.locator(".basic-property-card")).toHaveCount(1);
    await expect(page.locator(".basic-property-card")).toContainText(visible.label);
    await expect(page.locator("main")).not.toContainText(hidden.label);
    await expect.poll(() => page.evaluate(() => { const sidebar = document.querySelector(".sidebar")!.getBoundingClientRect(); const content = document.querySelector(".basic-hero")!.getBoundingClientRect(); return content.left >= sidebar.right + 12 && document.documentElement.scrollWidth <= window.innerWidth + 1; }), { message: "Desktop Basic content remains clear of the fixed sidebar" }).toBe(true);
    await page.waitForTimeout(250); // Let the sidebar width transition finish before capturing fixed elements.
    await page.screenshot({ path: testInfo.outputPath("basic-owner-desktop.png") });
    await page.reload();
    await expect(page.locator(".basic-portfolio")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".topbar .display-mode-switch button[value=pro]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("basic-owner-mobile.png"), fullPage: true });
    await page.locator(".topbar .display-mode-switch button[value=pro]").click();
    await expect(page.locator(".v21-portfolio")).toBeVisible();
    await context.clearCookies();
  } finally {
    await db.$disconnect();
  }
});
