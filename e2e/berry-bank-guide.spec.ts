import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db";

test.beforeAll(() => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated database required");
});
test.afterAll(() => prisma.$disconnect());

test("Berry separates payment scope from delivery, preserves progress and does not claim verification", async ({ page }) => {
  const password = "Berry-Guide-QA-2026";
  const user = await prisma.user.create({ data: { email: `berry-${randomUUID()}@example.invalid`, name: "Berry QA", passwordHash: await bcrypt.hash(password, 4), role: "OWNER_VIEWER", onboardingStatus: "completed", isTestIdentity: true } });
  try {
    await page.goto("/login");
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Heslo", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/bankovni-ucty");
    await page.getByLabel("Banka pro tento účet").selectOption("2010");
    await page.getByRole("button", { name: "Spustit krokového průvodce s Berrym" }).click();
    const dialog = page.getByRole("dialog", { name: "Berryho průvodce propojením banky" });
    await expect(dialog.getByLabel("Které platby chcete sdílet?")).toHaveValue("selected");
    await expect(dialog).toContainText("chybným nebo chybějícím VS");
    await dialog.getByLabel("Jak budou oznámení doručována?").selectOption("direct");
    await dialog.getByRole("button", { name: "Pokračovat", exact: true }).click();
    await expect(dialog).toContainText("konkrétním variabilním symbolem");
    await dialog.getByRole("button", { name: "Pokračovat", exact: true }).click();
    await expect(dialog).toContainText("Do příjemce vybraných bankovních avíz");
    await expect(dialog.getByLabel("E-mailová služba")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Zpět", exact: true }).click();
    await dialog.getByRole("button", { name: "Zpět", exact: true }).click();
    await dialog.getByLabel("Jak budou oznámení doručována?").selectOption("forward");
    await dialog.getByRole("button", { name: "Pokračovat", exact: true }).click();
    await dialog.getByRole("button", { name: "Pokračovat", exact: true }).click();
    await expect(dialog).toContainText("Globální přeposílání všech zpráv ponechte vypnuté");
    await dialog.getByLabel("E-mailová služba").selectOption("centrum");
    await expect(dialog).toContainText("Pošli kopii na adresu");
    await expect(dialog).toContainText("A SOUČASNĚ");
    await dialog.getByLabel("E-mailová služba").selectOption("seznam");
    await expect(dialog).toContainText("Vytvořit nové pravidlo");
    await dialog.getByLabel("E-mailová služba").selectOption("outlook");
    await expect(dialog).toContainText("Microsoft 365");
    await dialog.getByRole("button", { name: "Pokračovat", exact: true }).click();
    await expect(dialog).toContainText("Test má vlastní VS");
    await expect(dialog).toContainText("minimální částka oznámení propustí 1 Kč");
    // The selected bank is derived from accounts, so select it again after reload.
    await page.reload();
    await page.getByLabel("Banka pro tento účet").selectOption("2010");
    await page.getByRole("button", { name: "Spustit krokového průvodce s Berrym" }).click();
    await expect(dialog).toContainText("Jedna testovací platba");
    await dialog.getByRole("button", { name: "Pokračovat", exact: true }).click();
    await dialog.getByRole("button", { name: "Pokračovat", exact: true }).click();
    await expect(dialog).toContainText("Propojení je potvrzené až podle skutečného výsledku");
    await expect(dialog).toContainText("odstraňte dočasnou výjimku");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.getByLabel("Banka pro tento účet").selectOption("6210");
    await expect(page.locator(".bank-guide-support")).toContainText("nemáme doložené");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Spustit krokového průvodce s Berrym" }).click();
    await expect(dialog.getByLabel("Které platby chcete sdílet?")).toHaveValue("selected");
    await dialog.getByLabel("Které platby chcete sdílet?").selectOption("incoming");
    await expect(dialog).toContainText("včetně případných soukromých příjmů");
    const bounds = await dialog.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(390);
  } finally {
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
  }
});
