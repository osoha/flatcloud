import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Heslo", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio/);
}

function requireIsolatedDatabase() {
  test.skip(Boolean(process.env.E2E_BASE_URL), "Synthetic users and tasks belong only to isolated CI.");
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated CI database required");
}

test("super-admin can select a library avatar for another user without changing access", async ({ page }) => {
  requireIsolatedDatabase();
  const db = new PrismaClient();
  const target = await db.user.create({ data: { email: `admin-avatar-${crypto.randomUUID()}@flatcloud.test`, name: "Uživatel s avatarem", active: true, role: "OWNER_VIEWER", passwordHash: "not-a-login-fixture", avatarChoice: "library:person:1" } });
  try {
    await login(page, process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test", process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
    await page.goto(`/uzivatele/${target.id}`);
    await page.locator('input[name="avatarChoice"][value="library:person:25"]').check();
    await page.getByRole("button", { name: "Uložit změny uživatele" }).click();
    await expect(page.getByRole("status")).toContainText("uloženi");
    const saved = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(saved.avatarChoice).toBe("library:person:25");
    expect(saved.role).toBe("OWNER_VIEWER");
    await expect(page.locator('[data-testid="user-access-form"] .avatar').first()).toHaveCSS("background-image", /person-25\.webp/);
  } finally {
    await db.user.delete({ where: { id: target.id } });
    await db.$disconnect();
  }
});

test("Basic and Profi keep only five recent completed tasks; archive is paged and company avatar is respected", async ({ page }) => {
  requireIsolatedDatabase();
  const db = new PrismaClient();
  const password = "Task-Archive-E2E-2026";
  const tag = `Archiv ${crypto.randomUUID().slice(0, 8)}`;
  const owner = await db.owner.create({ data: { name: `${tag} vlastník` } });
  const property = await db.property.create({ data: { name: `${tag} dům`, address: "Testovací 3", city: "Praha", ownerId: owner.id } });
  const user = await db.user.create({ data: { email: `task-archive-${crypto.randomUUID()}@flatcloud.test`, name: `${tag} správce`, role: "PROPERTY_MANAGER", active: true, defaultDisplayMode: "basic", passwordHash: await bcrypt.hash(password, 8), memberships: { create: { propertyId: property.id, permission: "EDIT" } } } });
  const tenant = await db.tenant.create({ data: { type: "COMPANY", name: `${tag} společnost`, avatarChoice: "library:person:25", propertyLinks: { create: { propertyId: property.id } } } });
  try {
    const closedAt = new Date();
    await db.task.createMany({ data: [
      ...Array.from({ length: 31 }, (_, index) => ({ title: `${tag} hotový ${index}`, propertyId: property.id, createdById: user.id, status: "DONE" as const, closedAt: new Date(closedAt.getTime() - index * 86_400_000) })),
      { title: `${tag} zrušený`, propertyId: property.id, createdById: user.id, status: "CANCELLED" as const, closedAt },
      { title: `${tag} otevřený`, propertyId: property.id, createdById: user.id, status: "OPEN" as const, closedAt: null },
    ] });
    await login(page, user.email, password);
    await page.goto("/ukoly");
    await expect(page.locator(".basic-section-list .basic-section-item")).toHaveCount(6);
    await expect(page.getByRole("link", { name: /Zobrazit archivované dokončené úkoly/ })).toContainText("27 dalších");
    await page.getByRole("link", { name: /Zobrazit archivované dokončené úkoly/ }).click();
    await expect(page.locator(".basic-section-list .basic-section-item")).toHaveCount(25);
    await expect(page.getByRole("navigation", { name: "Stránky archivu" })).toContainText("Strana 1 z 2");
    await page.getByRole("link", { name: "Další →" }).click();
    await expect(page.locator(".basic-section-list .basic-section-item")).toHaveCount(7);
    await page.goto(`/najemnici/${tenant.id}`);
    await expect(page.locator(".tenant-title .tenant-avatar")).toHaveCSS("background-image", /person-25\.webp/);
    const image = await readFile("public/flatberry-logo.png");
    await db.tenant.update({ where: { id: tenant.id }, data: { avatarChoice: null, avatarMimeType: "image/png", avatarData: Uint8Array.from(image) } });
    await page.reload();
    await expect(page.locator(".tenant-title .tenant-avatar img")).toBeVisible();
    await page.locator(".sidebar .display-mode-switch button[value=pro]").click();
    await page.goto("/ukoly");
    await expect(page.locator(".portfolio-table-card tbody tr")).toHaveCount(6);
    await page.getByRole("link", { name: /Zobrazit archivované dokončené úkoly/ }).click();
    await expect(page.locator(".portfolio-table-card tbody tr")).toHaveCount(25);
  } finally {
    await db.task.deleteMany({ where: { propertyId: property.id } });
    await db.tenant.delete({ where: { id: tenant.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.property.delete({ where: { id: property.id } });
    await db.owner.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
