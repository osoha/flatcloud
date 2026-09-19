import { expect, test } from "@playwright/test";

test("R28: immutable legacy v2 plan keeps explicit two-step rent-change workflow", async ({ page }) => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) {
    throw new Error("Isolated CI database required");
  }
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("E2E admin credentials are required");

  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  try {
    const admin = await db.user.findUniqueOrThrow({ where: { email } });
    const tag = `R28 legacy-v2 ${crypto.randomUUID().slice(0, 8)}`;
    const owner = await db.owner.create({ data: { name: tag } });
    const property = await db.property.create({
      data: { name: tag, address: "Testovací 28", city: "Praha", ownerId: owner.id },
    });
    const unit = await db.unit.create({ data: { propertyId: property.id, label: "V2-01" } });
    const tenant = await db.tenant.create({ data: { name: `${tag} tenant` } });
    const lease = await db.lease.create({
      data: {
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: new Date("2024-01-01T00:00:00.000Z"),
        financialTrackingFromPeriod: "2024-01",
        variableSymbol: `28${Date.now()}`.slice(-10),
        rentCents: 1_000_000,
        servicesCents: 0,
      },
    });

    const inputSnapshot = {
      schemaVersion: 2,
      market: { annualGrowthBps: 0, catchUpMonths: 24 },
      scope: [{ propertyId: property.id, propertyName: property.name }],
      mfReferencePeriod: "QA legacy v2",
      rows: [{
        leaseId: lease.id,
        propertyId: property.id,
        propertyName: property.name,
        unitId: unit.id,
        unitLabel: unit.label,
        currentRentCents: 1_000_000,
        startDate: lease.startDate.toISOString(),
        effectiveEnd: null,
        indexationEnabled: false,
        indexationPercentBps: null,
        nextIndexationAt: null,
        mfMarketRentCents: 1_300_000,
      }],
    };
    const plan = await db.rentForecastPlan.create({
      data: {
        seriesId: crypto.randomUUID(),
        revision: 1,
        name: tag,
        status: "APPROVED",
        asOfDate: new Date("2026-09-19T12:00:00.000Z"),
        horizonMonths: 24,
        annualGrowthBps: 0,
        vacancyBps: 0,
        collectionBps: 10_000,
        marketGapCaptureBps: 10_000,
        inputSnapshot,
        createdById: admin.id,
        approvedById: admin.id,
        approvedAt: new Date(),
        properties: { create: [{ propertyId: property.id }] },
      },
    });
    const frozenSnapshot = JSON.stringify(plan.inputSnapshot);

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Heslo").fill(password);
    await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
    await expect(page).toHaveURL(/\/portfolio/);
    await page.goto(`/reporty/valorizace/${plan.id}`);

    await expect(page.getByText("Schváleno", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Náhled převodu do dodatků", exact: true })).toBeVisible();
    await expect(page.getByText("Dry run · bez zápisu", { exact: true })).toBeVisible();
    const createChange = page.locator(".rent-change-create").first();
    await expect(createChange).toBeVisible();
    await createChange.getByText("Připravit změnu", { exact: true }).click();
    await createChange.getByLabel("Poznámka", { exact: true }).fill("R28 explicitní kontrola legacy v2");
    await createChange.getByRole("button", { name: "Pokračovat ke kontrole", exact: true }).click();

    await expect(page).toHaveURL(/\/reporty\/valorizace\/.+\/navrhy\/.+/);
    await expect(page.getByRole("heading", { name: "Návrh změny nájemného", exact: true })).toBeVisible();
    await expect(page.getByText("Druhý krok · právní a finanční kontrola", { exact: true })).toBeVisible();
    await page.getByLabel(/Zkontroloval\/a jsem částku/).check();
    await page.getByRole("button", { name: "Potvrdit změnu nájemného", exact: true }).click();
    await expect(page.getByText("Změna nájemného byla potvrzena a budoucí neuhrazené předpisy synchronizovány.")).toBeVisible();
    await expect(page.getByText("Potvrzeno", { exact: true }).first()).toBeVisible();

    const unchanged = await db.rentForecastPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(JSON.stringify(unchanged.inputSnapshot)).toBe(frozenSnapshot);
    expect(unchanged.status).toBe("APPROVED");
    await db.property.update({ where: { id: property.id }, data: { active: false } });
  } finally {
    await db.$disconnect();
  }
});
