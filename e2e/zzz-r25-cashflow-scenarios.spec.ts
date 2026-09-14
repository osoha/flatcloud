import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { calculateCashflowScenario, cashflowCents } from "../lib/reporting/cashflow-scenario";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";
const income = (count: number) => Array.from({ length: count }, (_, index) => ({ period: `${2026 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`, contractualCents: 120000, expectedCollectedCents: 100001 }));
const assumptions = { openingCashCents: 0, monthlyOpexCents: 10000, annualOpexGrowthBps: 1000, monthlyDebtServiceCents: 20000, capexCents: 90000, capexMonth: 1 };

test("R25 cashflow exact cents, annual boundary, one CAPEX and debt service counted once", () => {
  const rows = income(24), original = JSON.stringify(rows);
  const result = calculateCashflowScenario(rows, assumptions);
  expect(result.months[0]).toMatchObject({ netCashflowCents: -19999, cashBalanceCents: -19999 });
  expect(result.months[11].opexCents).toBe(10000); expect(result.months[12].opexCents).toBe(11000);
  expect(result.capexCents).toBe(90000); expect(result.debtServiceCents).toBe(480000);
  expect(result.opexCents).toBe(252000); expect(result.netCashflowCents).toBe(1578024);
  expect(result.firstNegativePeriod).toBe("2026-01"); expect(result.minimumCashCents).toBe(-19999);
  expect(JSON.stringify(rows)).toBe(original);
});
test("R25 cashflow rejects incomplete, fractional and unsafe amounts and out-of-horizon CAPEX", () => {
  expect(cashflowCents("123,45", "Test")).toBe(12345); expect(cashflowCents("-0.01", "Test", true)).toBe(-1);
  for (const value of ["", "1.001", "NaN", "Infinity", "1e9", "99999999999999999", "-1"]) expect(() => cashflowCents(value, "Test")).toThrow();
  expect(() => calculateCashflowScenario(income(12), { ...assumptions, capexMonth: 13 })).toThrow();
  expect(() => calculateCashflowScenario(income(12), { ...assumptions, annualOpexGrowthBps: 2001 })).toThrow();
  expect(calculateCashflowScenario(income(36), { ...assumptions, capexMonth: 36 }).months[35].capexCents).toBe(90000);
});

test("R25 saved forecast cashflow is read-only, recalculates and preserves frozen plan and scope", async ({ page, context }) => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local/CI database required");
  const db = new PrismaClient();
  try {
    const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.advanced } });
    const owner = await db.owner.create({ data: { name: "R24_AGENT_QA_2026_09 · Cashflow owner" } });
    const property = await db.property.create({ data: { name: "R24_AGENT_QA_2026_09 · Cashflow", address: "Syntetická 25", city: "Praha", ownerId: owner.id, memberships: { create: { userId: actor.id, permission: "VIEW" } } } });
    const plan = await db.rentForecastPlan.create({ data: { seriesId: `r25-${property.id}`, name: "R24_AGENT_QA_2026_09 · Frozen cashflow", status: "DRAFT", asOfDate: new Date("2026-01-01T12:00:00Z"), horizonMonths: 12, annualGrowthBps: 0, vacancyBps: 0, collectionBps: 10000, marketGapCaptureBps: 0, createdById: actor.id, properties: { create: { propertyId: property.id } }, inputSnapshot: { schemaVersion: 1, scope: [{ propertyId: property.id, propertyName: property.name }], mfReferencePeriod: "Syntetická reference", rows: [{ leaseId: "synthetic-lease", propertyId: property.id, propertyName: property.name, unitId: "synthetic-unit", unitLabel: "QA", currentRentCents: 100001, effectiveEnd: null, indexationEnabled: false, indexationPercentBps: null, nextIndexationAt: null, mfMarketRentCents: 120000 }] } } });
    const login = async (email: string) => { await page.goto("/login"); await page.getByLabel("E-mail").fill(email); await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD); await page.getByRole("button", { name: "Přihlásit se" }).click(); await expect(page).toHaveURL(/\/portfolio(?:\?|$)/); };
    await login(R24_ROLE_USERS.advanced); const url = `/reporty/valorizace/${plan.id}`; await page.goto(url);
    const panel = page.getByTestId("cashflow-scenario");
    await panel.getByLabel("Počáteční hotovost v Kč", { exact: true }).fill("0");
    await panel.getByLabel("Měsíční OPEX v Kč", { exact: true }).fill("100");
    await panel.getByLabel("Měsíční dluhová služba v Kč", { exact: true }).fill("200");
    await panel.getByLabel("Jednorázový CAPEX v Kč", { exact: true }).fill("900");
    await panel.getByRole("button", { name: "Spočítat cashflow" }).click();
    await expect(panel.getByRole("heading", { name: "Výsledek scénáře · 12 měsíců" })).toBeVisible();
    await expect(panel).toContainText("2026-01"); await expect(panel).toContainText("-199,99");
    await panel.getByLabel("Jednorázový CAPEX v Kč", { exact: true }).fill("0");
    await expect(panel.getByRole("heading", { name: "Výsledek scénáře · 12 měsíců" })).toHaveCount(0);
    await panel.getByRole("button", { name: "Spočítat cashflow" }).click(); await expect(panel).toContainText("Na konci žádného měsíce není hotovost záporná.");
    const after = await db.rentForecastPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.inputSnapshot).toEqual(plan.inputSnapshot); expect(after.updatedAt).toEqual(plan.updatedAt); expect(after.status).toBe("DRAFT");
    await page.reload(); await expect(panel.getByLabel("Měsíční OPEX v Kč", { exact: true })).toHaveValue("");
    await context.clearCookies(); await login(R24_ROLE_USERS.externalOwner); expect((await page.goto(url))?.status()).toBe(404);
  } finally { await db.$disconnect(); }
});
