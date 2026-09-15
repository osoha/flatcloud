import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { comparePropertyBudget, type CostInput, type BudgetInput } from "../lib/property-budget-comparison";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

const cost = (amountCents: number, status: CostInput["status"], kind: CostInput["kind"] = "OPEX", category: CostInput["category"] = "REPAIRS"): CostInput => ({ amountCents, status, kind, category, effectiveAt: new Date("2097-04-01T12:00:00Z") });
const budget = (amountCents: number, kind: BudgetInput["kind"] = "OPEX", category: BudgetInput["category"] = "REPAIRS"): BudgetInput => ({ amountCents, kind, category, year: 2097 });

test("R25 category overspend is not hidden by other budgets; plans do not consume limits", () => {
  const rows = comparePropertyBudget([budget(10000), budget(500), budget(90000, "CAPEX")], [cost(10001, "ACTUAL"), cost(1500, "COMMITTED"), cost(99999, "PLANNED"), cost(12345, "ACTUAL", "OPEX", "INSURANCE")], 2097);
  expect(rows).toHaveLength(3);
  expect(rows.find(r => r.kind === "OPEX" && r.category === "REPAIRS")).toMatchObject({ budgetLines: 2, budgetCents: 10500, remainingCents: -1001, plannedCents: 99999, actualCents: 10001, committedCents: 1500 });
  expect(rows.find(r => r.category === "INSURANCE")).toMatchObject({ budgetLines: 0, remainingCents: null, actualCents: 12345 });
  expect(rows.find(r => r.kind === "CAPEX")).toMatchObject({ remainingCents: 90000 });
});

test("R25 year isolation, missing budget and lifecycle preserve exact cents", () => {
  expect(comparePropertyBudget([budget(10000)], [cost(1, "ACTUAL")], 2096)).toEqual([]);
  expect(comparePropertyBudget([], [cost(1, "PLANNED")], 2097)[0]).toMatchObject({ remainingCents: null, plannedCents: 1, actualCents: 0 });
  for (const status of ["COMMITTED", "ACTUAL"] as const) {
    const row = comparePropertyBudget([budget(123456)], [cost(123456, status)], 2097)[0];
    expect(row.remainingCents).toBe(0);
    expect(row.actualCents + row.committedCents).toBe(123456);
  }
});

test("R25 visible comparison uses selected year and retains foreign-owner denial", async ({ page, context }) => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local/CI database required");
  const db = new PrismaClient();
  try {
    const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.advanced } });
    const owner = await db.owner.create({ data: { name: "R24_AGENT_QA_2026_09 · R25 budget owner" } });
    const property = await db.property.create({ data: { name: "R24_AGENT_QA_2026_09 · R25 budget", address: "Syntetická 25", city: "Praha", ownerId: owner.id, memberships: { create: { userId: actor.id, permission: "EDIT" } } } });
    await db.propertyBudgetLine.createMany({ data: [budget(10000), budget(90000, "CAPEX")].map(b => ({ ...b, title: "R24_AGENT_QA_2026_09 · limit", propertyId: property.id })) });
    await db.propertyCost.createMany({ data: [cost(12345, "ACTUAL"), cost(1000, "COMMITTED"), cost(5000, "PLANNED"), cost(123, "ACTUAL", "OPEX", "INSURANCE")].map(c => ({ ...c, title: "R24_AGENT_QA_2026_09 · cost", propertyId: property.id })) });
    const login = async (email: string) => {
      await page.goto("/login"); await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD);
      await page.getByRole("button", { name: "Přihlásit se" }).click(); await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
    };
    await login(R24_ROLE_USERS.advanced);
    await page.goto(`/nemovitosti/${property.id}/finance?financeYear=2097`);
    const comparison = page.getByTestId("budget-comparison");
    await expect(comparison.getByRole("heading")).toContainText("2097");
    const repairs = comparison.getByRole("row").filter({ hasText: "Provozní náklad (OPEX)" }).filter({ hasText: "Opravy" });
    await expect(repairs).toContainText("123,45"); await expect(repairs).toContainText("-33,45"); await expect(repairs).toContainText("Překročeno");
    await expect(comparison.getByRole("row").filter({ hasText: "Pojištění" })).toContainText("Bez rozpočtu");
    await page.getByLabel("Rozpočtové období").selectOption("2096"); await page.getByRole("button", { name: "Zobrazit období" }).click();
    await expect(comparison).toContainText("Pro tento rok nejsou evidovány");
    await context.clearCookies(); await login(R24_ROLE_USERS.externalOwner);
    const denied = await page.goto(`/nemovitosti/${property.id}/finance?financeYear=2097`);
    expect(denied?.status()).toBe(404); await expect(comparison).toHaveCount(0);
  } finally { await db.$disconnect(); }
});
