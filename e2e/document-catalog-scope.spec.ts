import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

test("document catalog carries portfolio scope through navigation, filters, pagination and display modes", async ({ page }) => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Isolated database required");
  const db = new PrismaClient();
  let actorId: string | undefined;
  try {
    const tag = `Document scope QA ${randomUUID()}`;
    const template = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.advanced } });
    // A separate actor keeps these extra memberships out of shared cost fixtures.
    const actor = await db.user.create({ data: { email: `document-scope-${randomUUID()}@flatcloud.test`, name: tag, role: "PROPERTY_MANAGER", passwordHash: template.passwordHash, active: true, defaultDisplayMode: "pro", isTestIdentity: true } });
    actorId = actor.id;
    const owner = await db.owner.create({ data: { name: tag } });
    const properties: { id: string; name: string }[] = [];
    for (let i = 0; i < 3; i++) properties.push(await db.property.create({ data: { name: `${tag} property ${i}`, ownerId: owner.id, address: "QA", city: "QA", ...(i < 2 ? { memberships: { create: { userId: actor.id, permission: "VIEW" } } } : {}) } }));
    const asset = await db.fileAsset.create({ data: { storageKey: tag, originalName: "synthetic.pdf", mimeType: "application/pdf", sizeBytes: 20, sha256: "qa-only", uploadedById: actor.id } });
    await db.document.createMany({ data: Array.from({ length: 51 }, (_, i) => ({ propertyId: properties[0].id, fileAssetId: asset.id, category: "CONTRACT" as const, title: `${tag} selected ${i}`, createdById: actor.id })) });
    const reportPhoto = `${tag} Fotografie pro kvartální report`;
    const denied = `${tag} denied`;
    await db.document.createMany({ data: [
      { propertyId: properties[1].id, fileAssetId: asset.id, category: "PHOTO", title: reportPhoto, createdById: actor.id },
      { propertyId: properties[2].id, fileAssetId: asset.id, category: "CONTRACT", title: denied, createdById: actor.id },
    ] });
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(actor.email);
    await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD);
    await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
    await expect(page).toHaveURL(/\/portfolio/);
    await page.locator('.display-mode-switch button[value="basic"]').first().click();
    const scopedUrl = `/dokumenty?properties=${properties[0].id}`;
    await page.goto(`/portfolio?properties=${properties[0].id}`);
    const navigation = page.locator(".sidebar").getByRole("link", { name: "Dokumenty", exact: true });
    await expect(navigation).toHaveAttribute("href", scopedUrl);
    await navigation.click();
    await expect(page).toHaveURL(new RegExp(`properties=${properties[0].id}`));
    await expect(page.locator(".document-card")).toHaveCount(50);
    await expect(page.locator(".document-grid")).not.toContainText(reportPhoto);
    await expect(page.locator(".basic-section-property")).toHaveCount(1);
    await expect(page.locator(".basic-section-property")).toContainText(properties[0].name);
    await page.locator(".pagination").getByRole("link", { name: "Další" }).click();
    await expect(page.locator(".document-card")).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get("properties")).toBe(properties[0].id);
    await page.locator(".basic-section-filter summary").click();
    const form = page.getByRole("form", { name: "Filtry katalogu dokumentů" });
    await form.getByLabel("Hledat", { exact: true }).fill(tag);
    await form.getByRole("button", { name: "Filtrovat", exact: true }).click();
    expect(new URL(page.url()).searchParams.get("properties")).toBe(properties[0].id);
    await expect(page.locator(".document-card")).toHaveCount(50);
    const reset = page.getByRole("link", { name: "Zrušit filtry", exact: true });
    await expect(reset).toHaveAttribute("href", scopedUrl);
    await reset.click();
    await expect(page).toHaveURL(new RegExp(`/dokumenty\\?properties=${properties[0].id}$`));
    await expect(page.locator('.display-mode-switch input[name="returnTo"]').first()).toHaveValue(scopedUrl);
    await page.locator('.display-mode-switch button[value="pro"]').first().click();
    await expect(page).toHaveURL(new RegExp(`/dokumenty\\?properties=${properties[0].id}`));
    await expect(page.locator(".basic-section-page")).toHaveCount(0);
    await expect(page.locator(".document-card")).toHaveCount(50);
    await expect(page.locator(".document-grid")).not.toContainText(reportPhoto);
    await page.goto(`${scopedUrl}&property=${properties[1].id}`);
    await expect(page.locator(".document-card")).toHaveCount(0);
    await page.goto(`/dokumenty?properties=&q=${encodeURIComponent(tag)}`);
    await expect(page.locator(".document-card")).toHaveCount(0);
    await expect(page.locator(".sidebar").getByRole("link", { name: "Dokumenty", exact: true })).toHaveAttribute("href", "/dokumenty?properties=");
    await page.goto(`/dokumenty?properties=${properties[1].id},${properties[2].id}&q=${encodeURIComponent(tag)}`);
    await expect(page.locator(".document-card")).toHaveCount(1);
    await expect(page.locator(".document-grid")).toContainText(reportPhoto);
    await expect(page.locator(".document-grid")).not.toContainText(denied);
    await page.locator('.display-mode-switch button[value="basic"]').first().click();
    await expect(page.locator(".basic-section-page")).toHaveCount(1);
    await expect(page.locator(".basic-section-property")).toHaveCount(0);
    await expect(page.locator(".document-card")).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get("properties")).toBe(properties[1].id);
    expect(new URL(page.url()).searchParams.get("q")).toBe(tag);
  } finally {
    // Keep temporary test identities out of subsequent active-team fixtures.
    try { if (actorId) await db.user.update({ where: { id: actorId }, data: { active: false } }); }
    finally { await db.$disconnect(); }
  }
});
