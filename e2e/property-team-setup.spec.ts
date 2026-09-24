import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
test("vlastník nastaví samostatnou správu z průvodce; čtenář ji nezmění", async ({ page }) => {
  const suffix = `${Date.now()}`;
  const password = "FlatBerry-Team-Setup-2026";
  const user = await db.user.create({ data: { name: "Team setup test", email: `team-${suffix}@example.invalid`, passwordHash: await bcrypt.hash(password, 4), role: "OWNER_VIEWER" } });
  const owner = await db.owner.create({ data: { name: "Team setup owner", userId: user.id } });
  const property = await db.property.create({ data: { name: "Team setup test house", address: "Testovací 1", city: "Plzeň", ownerId: owner.id, memberships: { create: { userId: user.id, permission: "ADMIN" } } } });
  try {
    await page.goto("/login");
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Heslo", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
    await expect(page).toHaveURL(/\/portfolio/);
    await page.goto(`/nemovitosti/${property.id}/prehled`);
    await page.locator(".onboarding-checklist summary").click();
    const step = page.locator(".onboarding-step-card").filter({ hasText: "Správce a spolupracovníci" });
    await expect(step).not.toHaveClass(/done/);
    await step.click();
    await expect(page).toHaveURL(new RegExp(`/nastaveni/uzivatele$`));
    await expect(page.locator(".property-subnav a.active")).toHaveText("Nastavení");
    await page.getByRole("button", { name: "Spravuji nemovitost sám", exact: true }).click();
    await expect(page.getByText("Samostatná správa potvrzena", { exact: true })).toBeVisible();
    expect((await db.property.findUniqueOrThrow({ where: { id: property.id } })).selfManaged).toBe(true);
    expect(await db.userProperty.count({ where: { propertyId: property.id } })).toBe(1);
    await page.goto(`/nemovitosti/${property.id}/prehled`);
    await page.locator(".onboarding-checklist summary").click();
    await expect(step).toHaveClass(/done/);
    await page.goto(`/nemovitosti/${property.id}/nastaveni`);
    await page.getByRole("link", { name: "Nastavit přístupy", exact: true }).click();
    await page.getByRole("button", { name: "Změnit na týmovou správu", exact: true }).click();
    expect((await db.property.findUniqueOrThrow({ where: { id: property.id } })).selfManaged).toBe(false);
    await db.userProperty.update({ where: { userId_propertyId: { userId: user.id, propertyId: property.id } }, data: { permission: "VIEW" } });
    await page.reload();
    await expect(page.getByRole("button", { name: "Spravuji nemovitost sám", exact: true })).toHaveCount(0);
    await page.request.post(`/api/properties/${property.id}/team-setup`, { form: { selfManaged: "true" } });
    expect((await db.property.findUniqueOrThrow({ where: { id: property.id } })).selfManaged).toBe(false);
  } finally {
    await db.property.update({ where: { id: property.id }, data: { active: false } });
    await db.user.update({ where: { id: user.id }, data: { active: false } });
  }
});
