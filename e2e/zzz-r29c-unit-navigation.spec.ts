import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
}

test("unit-only owner gets unit reports but never report correction settings", async ({ page, context }) => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated CI database required");
  const db = new PrismaClient();
  const password = "R29C-Unit-Only-2026";
  try {
    const tag = `R29C ${crypto.randomUUID().slice(0, 8)}`;
    const owner = await db.owner.create({ data: { name: `${tag} owner` } });
    const property = await db.property.create({ data: { name: `${tag} property`, address: "Syntetická 29", city: "Praha", ownerId: owner.id } });
    const visibleUnit = await db.unit.create({ data: { propertyId: property.id, label: "R29C visible" } });
    const foreignUnit = await db.unit.create({ data: { propertyId: property.id, label: "R29C hidden" } });
    const tenant = await db.tenant.create({ data: { name: `${tag} tenant` } });
    await db.lease.create({ data: { unitId: visibleUnit.id, tenantId: tenant.id, startDate: new Date("2026-01-01"), endDate: new Date("2027-12-31"), financialTrackingFromPeriod: "2026-01", variableSymbol: `R29C${Date.now()}`, rentCents: 1500000, servicesCents: 300000, depositCents: 3000000 } });
    const user = await db.user.create({ data: { email: `r29c-${crypto.randomUUID()}@flatcloud.test`, name: `${tag} owner user`, role: "OWNER_VIEWER", active: true, allProperties: false, passwordHash: await bcrypt.hash(password, 8), isTestIdentity: true } });
    await db.userUnit.create({ data: { userId: user.id, unitId: visibleUnit.id, permission: "VIEW" } });

    await login(page, user.email, password);
    await page.goto(`/nemovitosti/${property.id}/reporting`);
    await expect(page.getByRole("heading", { name: "Reporty jednotek", exact: true })).toBeVisible();
    await expect(page.locator(".property-subnav").getByRole("link", { name: "Reporty", exact: true })).toBeVisible();
    await expect(page.getByText(visibleUnit.label, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(foreignUnit.label, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Nastavení reportů", exact: true })).toHaveCount(0);

    await page.goto(`/nemovitosti/${property.id}/reporting?unitId=${visibleUnit.id}`);
    await expect(page.getByText("Report jednotky", { exact: true })).toBeVisible();
    await expect(page.getByText("1 500 000 Kč", { exact: false })).toBeVisible();
    const forbidden = await page.goto(`/nemovitosti/${property.id}/nastaveni/reporting`);
    expect(forbidden?.status()).toBe(404);

    await context.clearCookies();
    await login(page, adminEmail, adminPassword);
    await page.goto(`/nemovitosti/${property.id}/reporting`);
    await expect(page.getByRole("link", { name: "Nastavení reportů", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Nastavení reportů", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Nastavení reportů", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Přiřazení cenové mapy MF", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Historická kvartální data", exact: true })).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

test("settlement source navigation preserves unit and lease context", async ({ page }) => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Isolated CI database required");
  const db = new PrismaClient();
  try {
    const tag = `R29C settlement ${crypto.randomUUID().slice(0, 8)}`;
    const owner = await db.owner.create({ data: { name: `${tag} owner` } });
    const property = await db.property.create({ data: { name: `${tag} property`, address: "Syntetická 29", city: "Praha", ownerId: owner.id } });
    const unit = await db.unit.create({ data: { propertyId: property.id, label: "R29C context unit" } });
    const tenant = await db.tenant.create({ data: { name: `${tag} tenant` } });
    const lease = await db.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, startDate: new Date("2025-01-01"), endDate: new Date("2027-12-31"), financialTrackingFromPeriod: "2025-01", variableSymbol: `R29CS${Date.now()}`, rentCents: 1200000, servicesCents: 250000, depositCents: 2400000 } });

    await login(page, adminEmail, adminPassword);
    await page.goto(`/smlouvy/${lease.id}/vyuctovani`);
    const sources = page.getByRole("link", { name: "Faktury a externí podklady vyúčtování", exact: true });
    await expect(sources).toHaveAttribute("href", new RegExp(`unitId=${unit.id}.*leaseId=${lease.id}`));
    await sources.click();
    await expect(page).toHaveURL(new RegExp(`/nemovitosti/${property.id}/vyuctovani/podklady\\?unitId=${unit.id}&leaseId=${lease.id}`));
    await expect(page.getByText("Kontext nájemního vztahu", { exact: true })).toBeVisible();
    await expect(page.getByText(unit.label, { exact: false }).first()).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
