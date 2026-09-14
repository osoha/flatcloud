import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { chartDomain, chartPercentRows, chartTickIndices } from "../lib/financial-chart";
import { depositHistoryRows } from "../lib/reporting/deposit-chart-data";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

test("financial chart axes include every value, preserve zero/gaps and bound mobile ticks", () => {
  const values = [19000000, 20000000, 21000000, null];
  const detail = chartDomain(values, false), zero = chartDomain(values, true);
  expect(detail.min).toBeGreaterThan(0); expect(detail.min).toBeLessThan(19000000); expect(detail.max).toBeGreaterThan(21000000); expect(zero.min).toBe(0);
  for (const data of [[], [null], [0, 0], [-5, -5], [123, 123], [0, 100]]) { const axis = chartDomain(data, false); expect(axis.max).toBeGreaterThan(axis.min); }
  expect(chartDomain([0, 21000000], false).min).toBe(0);
  const ticks = chartTickIndices(36, 250); expect(ticks).toEqual([0, 35]);
});
test("percentage chart uses each initial value and never divides by missing or zero bases", () => {
  const rows = [{ label: "2026-01", values: [10000, 0, null] }, { label: "2027-01", values: [10500, 1200, 2000] }];
  const before = JSON.stringify(rows), result = chartPercentRows(rows);
  expect(result[0].values).toEqual([0, null, null]); expect(result[1].values[0]).toBeCloseTo(5); expect(result[1].values.slice(1)).toEqual([null, null]); expect(JSON.stringify(rows)).toBe(before);
});
test("deposit history uses dated cash movements, not agreed deposits or future refunds", () => {
  const leases = [{ depositCents: 999999, securityDepositTerms: [], securityDepositMovements: [{ type: "RECEIVED" as const, amountCents: 12345, effectiveAt: new Date("2026-02-10T12:00:00Z") }, { type: "RETURNED" as const, amountCents: 2345, effectiveAt: new Date("2026-03-10T12:00:00Z") }, { type: "RETURNED" as const, amountCents: 10000, effectiveAt: new Date("2026-04-01T12:00:00Z") }] }];
  expect(depositHistoryRows(leases, ["2026-01", "2026-02", "2026-03", "2026-04"], new Date("2026-03-15T12:00:00Z")).map(row=>row.values[0])).toEqual([null, 12345, 10000, null]);
  expect(depositHistoryRows([{ ...leases[0], securityDepositMovements: [] }], ["2026-03"], new Date("2026-03-15T12:00:00Z"))[0].values).toEqual([null]);
});

test("financial charts fit mobile, expose exact data and retain VIEW/foreign scope", async ({ page, context }) => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local/CI database required");
  const db = new PrismaClient();
  try {
    const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.advanced } });
    const owner = await db.owner.create({ data: { name: "R24_AGENT_QA_2026_09 · Chart owner" } });
    const property = await db.property.create({ data: { name: "R24_AGENT_QA_2026_09 · Chart property", city: "Praha", address: "Syntetická 26", ownerId: owner.id, memberships: { create: { userId: actor.id, permission: "VIEW" } } } });
    const unit = await db.unit.create({ data: { propertyId: property.id, label: "QA graf" } });
    const tenant = await db.tenant.create({ data: { name: "R24_AGENT_QA_2026_09 · Chart tenant" } });
    const lease = await db.lease.create({ data: { unitId: unit.id, tenantId: tenant.id, startDate: new Date("2020-01-01"), financialTrackingFromPeriod: "2020-01", variableSymbol: "R25CHART", rentCents: 1000000, servicesCents: 0, depositCents: 200000, securityDepositMovements: { create: { type: "RECEIVED", amountCents: 12345, effectiveAt: new Date("2020-02-01") } } } });
    const plan = await db.rentForecastPlan.create({ data: { seriesId: `chart-${property.id}`, name: "R24_AGENT_QA_2026_09 · 36M chart", status: "DRAFT", asOfDate: new Date("2026-01-01T12:00:00Z"), horizonMonths: 36, annualGrowthBps: 500, vacancyBps: 500, collectionBps: 9800, marketGapCaptureBps: 0, createdById: actor.id, properties: { create: { propertyId: property.id } }, inputSnapshot: { schemaVersion: 1, scope: [{ propertyId: property.id, propertyName: property.name }], mfReferencePeriod: "Syntetická reference", rows: [{ leaseId: lease.id, propertyId: property.id, propertyName: property.name, unitId: unit.id, unitLabel: unit.label, currentRentCents: 1000000, effectiveEnd: null, indexationEnabled: false, indexationPercentBps: null, nextIndexationAt: null, mfMarketRentCents: null }] } } });
    const login = async (email: string) => { await page.goto("/login"); await page.getByLabel("E-mail").fill(email); await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD); await page.getByRole("button", { name: "Přihlásit se" }).click(); await expect(page).toHaveURL(/\/portfolio(?:\?|$)/); };
    await login(actor.email); await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/reporty/valorizace/${plan.id}`);
    const chart = page.locator(".rent-forecast-chart"); await expect(chart.locator(".forecast-point")).toHaveCount(36);
    await expect(chart.getByText("Detailní měřítko podle dat; osa nemusí začínat nulou.", { exact: false })).toBeVisible();
    const rect = await chart.locator("svg").boundingBox(); expect(rect!.width).toBeLessThanOrEqual(390); expect(rect!.height).toBe(290);
    await chart.getByRole("button", { name: "Změna v %", exact: true }).click(); await expect(chart).toContainText("10,25 %");
    await chart.locator(".forecast-point").first().focus(); await expect(chart.locator(".financial-chart-values")).toContainText("2026-01");
    await chart.getByRole("button", { name: "Od nuly", exact: true }).click(); await expect(chart).toContainText("Osa zahrnuje nulu.");
    await chart.getByRole("button", { name: "Kč / měsíc", exact: true }).click(); await chart.getByText("Datová tabulka grafu", { exact: true }).click(); await expect(chart.getByRole("table").getByRole("row")).toHaveCount(37);
    const after = await db.rentForecastPlan.findUniqueOrThrow({ where: { id: plan.id } }); expect(after.inputSnapshot).toEqual(plan.inputSnapshot); expect(after.updatedAt).toEqual(plan.updatedAt);
    await page.goto(`/reporty?view=deposits&properties=${property.id}&range=custom&from=2020-01&to=2020-03`);
    await expect(page.getByRole("img", { name: "Historie držených kaucí", exact: true })).toBeVisible();
    await expect(page.getByRole("figure", { name: "Kauce podle objektů · aktuální stav", exact: true })).toContainText("123,45");
    await page.goto(`/reporty?view=deposits&properties=`); await expect(page.getByRole("figure", { name: "Kauce podle objektů · aktuální stav", exact: true })).not.toContainText(property.name);
    await context.clearCookies(); await login(R24_ROLE_USERS.externalOwner); expect((await page.goto(`/reporty/valorizace/${plan.id}`))?.status()).toBe(404);
    await page.goto(`/reporty?view=deposits&properties=${property.id}`); await expect(page.getByRole("figure", { name: "Kauce podle objektů · aktuální stav", exact: true })).not.toContainText(property.name);
  } finally { await db.$disconnect(); }
});
