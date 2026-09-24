import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
test("soukromé ocenění zůstává oddělené a starší checkpoint má přednost i mimo posledních 20 zápisů", async ({ page }) => {
  const password = "FlatBerry-Private-Value-2026";
  const user = await db.user.create({ data: { name: "Private value test", email: `value-${Date.now()}@example.invalid`, passwordHash: await bcrypt.hash(password, 4), role: "OWNER_VIEWER" } });
  const other = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
  const owner = await db.owner.create({ data: { name: "Valuation test owner", userId: user.id } });
  const property = await db.property.create({ data: { name: "Private valuation test", address: "Testovací 2", city: "Plzeň", ownerId: owner.id, memberships: { create: { userId: user.id, permission: "VIEW" } } } });
  const unit = await db.unit.create({ data: { propertyId: property.id, label: "Test byt", type: "APARTMENT", areaM2: 50 } });
  try {
    await db.personalValueCheckpoint.create({ data: { userId: user.id, unitId: unit.id, kind: "OFFICIAL_APPRAISAL", valueCents: BigInt(123456700), asOfDate: new Date("2020-01-01"), sourceName: "Vlastní starší bankovní podklad", reference: "test-bank-2020" } });
    await db.personalValueCheckpoint.createMany({ data: Array.from({ length: 21 }, (_, i) => ({ userId: user.id, unitId: unit.id, kind: "LOCAL_MARKET_REFERENCE" as const, valueCents: BigInt(99999900), asOfDate: new Date(2021, 0, i + 1), sourceName: "Místní testovací údaj" })) });
    await db.personalValueCheckpoint.create({ data: { userId: other.id, unitId: unit.id, kind: "OFFICIAL_APPRAISAL", valueCents: BigInt(88888800), asOfDate: new Date("2025-01-01"), sourceName: "CIZÍ SOUKROMÝ POSUDEK", reference: "not-for-other-user" } });
    await page.goto("/login");
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Heslo", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
    await expect(page).toHaveURL(/\/portfolio/);
    await page.goto(`/nemovitosti/${property.id}/jednotky/${unit.id}`);
    const personal = page.locator("#osobni-hodnota");
    const selected = personal.locator(".summary-list > div").filter({ hasText: "Moje kontrolní hodnota" });
    await expect(selected).toContainText(/1\s*234\s*567/);
    await expect(personal).not.toContainText("CIZÍ SOUKROMÝ POSUDEK");
    await expect(personal.locator("tbody tr")).toHaveCount(20);
    expect(await db.unitValuationSnapshot.count({ where: { unitId: unit.id } })).toBe(0);
    await db.userProperty.delete({ where: { userId_propertyId: { userId: user.id, propertyId: property.id } } });
    const count = await db.personalValueCheckpoint.count({ where: { userId: user.id, unitId: unit.id } });
    await page.request.post(`/api/properties/${property.id}/units/${unit.id}/personal-value`, { form: { kind: "OFFICIAL_APPRAISAL", valueCzk: "1000000", asOfDate: "2025-01-01", sourceName: "Denied", reference: "Denied" } });
    expect(await db.personalValueCheckpoint.count({ where: { userId: user.id, unitId: unit.id } })).toBe(count);
  } finally {
    await db.property.update({ where: { id: property.id }, data: { active: false } });
    await db.user.update({ where: { id: user.id }, data: { active: false } });
  }
});
