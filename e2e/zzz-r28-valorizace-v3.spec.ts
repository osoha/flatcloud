import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

test("Valorizace v3 renders event-driven saved scenario on mobile without mutating snapshot", async ({ page }) => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local/CI database required");
  const db = new PrismaClient();
  try {
    const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.advanced } });
    const owner = await db.owner.create({ data: { name: "R28 Valorizace owner" } });
    const property = await db.property.create({ data: { name: "R28 Valorizace property", city: "Praha", address: "Syntetická 28", ownerId: owner.id, memberships: { create: { userId: actor.id, permission: "EDIT" } } } });
    const unit = await db.unit.create({ data: { propertyId: property.id, label: "3M-01" } });
    const tenant = await db.tenant.create({ data: { name: "R28 Valorizace tenant" } });
    const lease = await db.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, startDate: new Date("2026-07-01T00:00:00Z"), endDate: new Date("2026-09-30T23:59:59Z"), financialTrackingFromPeriod: "2026-07", variableSymbol: `R28${Date.now().toString().slice(-7)}`, rentCents: 1_250_000, servicesCents: 0, depositCents: 0 } });
    const snapshot = {
      schemaVersion: 3,
      market: { annualGrowthBps: 200, catchUpMonths: 24, expiryStrategy: "RELET", relettingTargetBps: 10_000, relettingVacancyMonths: 1 },
      scope: [{ propertyId: property.id, propertyName: property.name }],
      mfReferencePeriod: "Q2 2026",
      rows: [{ leaseId: lease.id, propertyId: property.id, propertyName: property.name, unitId: unit.id, unitLabel: unit.label, currentRentCents: 1_250_000, startDate: "2026-07-01T00:00:00.000Z", effectiveEnd: "2026-09-30T23:59:59.000Z", indexationEnabled: false, indexationPercentBps: null, nextIndexationAt: null, mfMarketRentCents: 1_683_940 }],
    };
    const plan = await db.rentForecastPlan.create({ data: { seriesId: `r28-${property.id}`, name: "R28 · Event-driven 3M reletting", status: "DRAFT", asOfDate: new Date("2026-09-15T12:00:00Z"), horizonMonths: 8, annualGrowthBps: 300, vacancyBps: 0, collectionBps: 10_000, marketGapCaptureBps: 5_000, createdById: actor.id, properties: { create: { propertyId: property.id } }, inputSnapshot: snapshot } });
    const before = await db.rentForecastPlan.findUniqueOrThrow({ where: { id: plan.id } });
    await page.goto("/login"); await page.getByLabel("E-mail").fill(actor.email); await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD); await page.getByRole("button", { name: "Přihlásit se" }).click(); await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/reporty/valorizace/${plan.id}`);
    await expect(page.getByRole("heading", { name: "R28 · Event-driven 3M reletting" })).toBeVisible();
    await expect(page.getByText("Zmrazený plán · smlouvy a předpisy zůstávají beze změny", { exact: true })).toBeVisible();
    await expect(page.getByText("Růst trhu 2 % ročně · doba přiblížení 24 měsíců.", { exact: false })).toBeVisible();
    const chart = page.locator(".rent-forecast-chart");
    await expect(chart.locator(".forecast-point")).toHaveCount(8);
    await expect(chart.locator(".financial-event-marker")).toHaveCount(3);
    await chart.locator(".financial-event-marker").first().focus();
    await expect(chart.locator(".financial-event-tooltip")).toContainText("R28 Valorizace property · 3M-01");
    await expect(chart.locator(".financial-event-tooltip")).toContainText("Přeobsadit · vacancy 1 m");
    const box = await chart.locator("svg").boundingBox(); expect(box).not.toBeNull(); expect(box!.width).toBeLessThanOrEqual(390);
    await chart.getByText("Datová tabulka grafu", { exact: true }).click();
    await expect(chart.getByRole("table").getByRole("row")).toHaveCount(9);
    await expect(chart).toContainText("2027-01");
    const after = await db.rentForecastPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.inputSnapshot).toEqual(before.inputSnapshot); expect(after.updatedAt).toEqual(before.updatedAt);
  } finally { await db.$disconnect(); }
});
