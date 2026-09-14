import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { confirmedLoanState } from "../lib/asset-finance";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

test("R25 loan chronology excludes future and handles unsorted history", () => {
  const state = (day: string, value: number) => ({ asOfDate: new Date(day), outstandingPrincipalCents: value, annualInterestRateBps: 450, monthlyDebtServiceCents: null });
  const loan = { outstandingPrincipalCents: 999, annualInterestRateBps: 999, monthlyDebtServiceCents: null, snapshots: [state("2026-01-01", 100), state("2027-01-01", 50), state("2026-03-01", 90)] };
  expect(confirmedLoanState(loan, new Date("2026-04-01T12:00:00Z"))).toMatchObject({ outstandingPrincipalCents: 90, confirmedAsOfDate: new Date("2026-03-01") });
  expect(loan.snapshots[0].outstandingPrincipalCents).toBe(100);
});

test("R25 loan evidence preserves backdated history, audit, VIEW and foreign denial", async ({ page, context }) => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local/CI database required");
  const db = new PrismaClient();
  try {
    const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.advanced } });
    const owner = await db.owner.create({ data: { name: "R24_AGENT_QA_2026_09 · R25 loan owner" } });
    const property = await db.property.create({ data: { name: "R24_AGENT_QA_2026_09 · R25 loan", address: "Syntetická 25", city: "Praha", ownerId: owner.id, memberships: { create: { userId: actor.id, permission: "EDIT" } } } });
    const loan = await db.propertyLoan.create({ data: { propertyId: property.id, lender: "Syntetická banka", label: "R24_AGENT_QA_2026_09 · Úvěr", principalCents: 100000, outstandingPrincipalCents: 90000, annualInterestRateBps: 450, monthlyDebtServiceCents: 12345, snapshots: { create: { asOfDate: new Date("2020-03-01"), outstandingPrincipalCents: 90000, annualInterestRateBps: 450, monthlyDebtServiceCents: 12345, note: "Novější výpis" } } } });
    const login = async (email: string) => { await page.goto("/login"); await page.getByLabel("E-mail").fill(email); await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD); await page.getByRole("button", { name: "Přihlásit se" }).click(); await expect(page).toHaveURL(/\/portfolio(?:\?|$)/); };
    await login(R24_ROLE_USERS.advanced);
    const url = `/nemovitosti/${property.id}/uvery/${loan.id}`;
    const post = () => page.evaluate(async endpoint => { const response = await fetch(endpoint, { method: "POST", body: new URLSearchParams({ asOfDate: "2020-01-01", outstandingPrincipal: "950.01", annualInterestRatePercent: "4.50", monthlyDebtService: "100.01", note: "R24_AGENT_QA_2026_09 · Starší výpis" }) }); return response.url; }, `/api/properties/${property.id}/loans/${loan.id}/snapshots`);
    expect(new URL(await post()).searchParams.has("ok")).toBe(true);
    expect((await db.propertyLoan.findUniqueOrThrow({ where: { id: loan.id } })).outstandingPrincipalCents).toBe(BigInt(90000));
    expect(await db.propertyLoanSnapshot.count({ where: { loanId: loan.id } })).toBe(2);
    expect(await db.auditLog.count({ where: { propertyId: property.id, action: "PROPERTY_LOAN_SNAPSHOT_CREATED" } })).toBe(1);
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Potvrzený stav úvěru" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Historie stavů; tabulku lze posouvat" })).toContainText("950,01");
    await expect(page.getByText("Roční evidence úroků zatím chybí.")).toBeVisible();
    await db.userProperty.update({ where: { userId_propertyId: { userId: actor.id, propertyId: property.id } }, data: { permission: "VIEW" } });
    await page.reload(); await expect(page.getByRole("heading", { name: "Potvrzený stav úvěru" })).toBeVisible();
    expect(new URL(await post()).searchParams.has("error")).toBe(true);
    expect(await db.propertyLoanSnapshot.count({ where: { loanId: loan.id } })).toBe(2);
    await context.clearCookies(); await login(R24_ROLE_USERS.externalOwner);
    expect((await page.goto(url))?.status()).toBe(404);
  } finally { await db.$disconnect(); }
});
