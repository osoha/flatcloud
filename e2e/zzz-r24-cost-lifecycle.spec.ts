import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";
import { calculateBudgetSummary } from "../lib/asset-finance";

const db = new PrismaClient();
test.beforeAll(() => { if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("R24 requires local/CI DB"); });
test.afterAll(async () => { await db.$disconnect(); });
async function post(page: Page, path: string, options: { form: Record<string, string> }) {
  const result = await page.evaluate(async ({ path, form }) => {
    const response = await fetch(path, { method: "POST", body: new URLSearchParams(form) });
    return { status: response.status, url: response.url };
  }, { path, form: options.form });
  expect([200, 404]).toContain(result.status);
  expect(new URL(result.url).pathname).not.toBe("/login");
  return new URL(result.url).searchParams;
}

async function setup(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(R24_ROLE_USERS.advanced);
  await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
  const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.advanced }, include: { memberships: true } });
  const propertyId = actor.memberships[0].propertyId;
  const units = await db.unit.findMany({ where: { propertyId }, take: 3, orderBy: { id: "asc" } });
  expect(units).toHaveLength(3);
  const cost = await db.propertyCost.create({ data: { propertyId, title: "R24_AGENT_QA_2026_09 · cost lifecycle", kind: "OPEX", status: "PLANNED", amountCents: 100000, effectiveAt: new Date("2026-09-08T12:00:00Z"), allocations: { create: units.map((unit, index) => ({ unitId: unit.id, shareBasisPoints: index === 2 ? 3334 : 3333, amountCents: index === 2 ? 33340 : 33330 })) } }, include: { allocations: true } });
  const asset = await db.fileAsset.create({ data: { storageKey: `r24-fixture-${cost.id}`, originalName: "test.txt", mimeType: "text/plain", sizeBytes: 4, sha256: "test-metadata-only", uploadedById: actor.id } });
  const doc = await db.document.create({ data: { propertyId, propertyCostId: cost.id, createdById: actor.id, title: "R24 TEST invoice metadata", category: "INVOICE", fileAssetId: asset.id } });
  return { cost, doc, propertyId, actor };
}
function form(cost: { updatedAt: Date; amountCents: number }) { return { expectedUpdatedAt: cost.updatedAt.toISOString(), title: "R24_AGENT_QA_2026_09 · cost lifecycle", amount: String(cost.amountCents / 100), kind: "OPEX", status: "ACTUAL", category: "MAINTENANCE", effectiveAt: "2026-09-08", reason: "R24 test correction", vendor: "R24 vendor", documentNumber: "R24-TEST-02" }; }

test("R24 náklad projde plánem, závazkem a skutečností na jednom ID a zachová doklady i podíly", async ({ page }) => {
  const { cost, doc, propertyId } = await setup(page);
  const url = `/nemovitosti/${propertyId}/naklady/${cost.id}`;
  for (const [status, amount] of [["COMMITTED", "1234.56"], ["ACTUAL", "1500.01"]]) {
    await page.goto(url);
    await page.getByText("Upravit náklad a stav", { exact: true }).click();
    const editor = page.getByTestId("cost-edit");
    await editor.getByLabel("Stav *", { exact: true }).selectOption(status);
    await editor.getByLabel("Částka v Kč *", { exact: true }).fill(amount);
    await editor.getByLabel("Důvod změny *", { exact: true }).fill(`R24 · ${status}`);
    await editor.getByRole("button", { name: "Uložit změnu nákladu" }).click();
    await expect(page.getByRole("status")).toContainText("Náklad byl aktualizován.");
    await expect(page.locator(".summary-list")).toContainText(status === "COMMITTED" ? "1 234,56 Kč" : "1 500,01 Kč");
    await expect(page.getByTestId("cost-allocation").locator("tfoot")).toContainText(status === "COMMITTED" ? "1 234,56 Kč" : "1 500,01 Kč");
    const visibleAmounts = await page.getByTestId("cost-allocation").locator("tbody tr td:last-child").allTextContents();
    expect(visibleAmounts).toHaveLength(3);
    const visibleCents = visibleAmounts.map(value => {
      const decimal = value.replace(/\s/g, "").replace("Kč", "");
      expect(decimal).toMatch(/^\d+,\d{2}$/);
      return Math.round(Number(decimal.replace(",", ".")) * 100);
    });
    expect(visibleCents.reduce((sum, value) => sum + value, 0)).toBe(Math.round(Number(amount) * 100));
    const updated = await db.propertyCost.findUniqueOrThrow({ where: { id: cost.id }, include: { allocations: true, documents: true } });
    expect(updated.status).toBe(status);
    expect(updated.amountCents).toBe(Math.round(Number(amount) * 100));
    expect(updated.allocations.reduce((sum, row) => sum + row.amountCents, 0)).toBe(updated.amountCents);
    expect(updated.allocations.map(row => row.id).sort()).toEqual(cost.allocations.map(row => row.id).sort());
    expect(updated.documents.map(row => row.id)).toContain(doc.id);
    expect(updated.annualReviewStatus).toBe("DRAFT");
    const totals = calculateBudgetSummary([], [updated], 2026);
    expect(totals.committedCents).toBe(status === "COMMITTED" ? updated.amountCents : 0);
    expect(totals.actualCents).toBe(status === "ACTUAL" ? updated.amountCents : 0);
  }
  await expect(page.getByRole("heading", { name: "Historie změn nákladu", exact: true })).toBeVisible();
  expect(await db.auditLog.count({ where: { entityId: cost.id, action: "PROPERTY_COST_UPDATED" } })).toBe(2);
});

test("R24 souběžné opravy stejné verze nákladu neprovedou ztracený přepis", async ({ page }) => {
  const { cost, propertyId } = await setup(page);
  const responses = await Promise.all(["1250", "1750"].map(amount => post(page, `/api/properties/${propertyId}/costs/${cost.id}`, { form: { ...form(cost), amount } })));
  expect(responses.filter(response => response.has("ok"))).toHaveLength(1);
  expect(responses.find(response => response.has("error"))?.get("error")).toContain("mezitím změnil");
  expect(await db.auditLog.count({ where: { entityId: cost.id, action: "PROPERTY_COST_UPDATED" } })).toBe(1);
  const updated = await db.propertyCost.findUniqueOrThrow({ where: { id: cost.id }, include: { allocations: true } });
  expect([125000, 175000]).toContain(updated.amountCents);
  expect(updated.allocations.reduce((sum, row) => sum + row.amountCents, 0)).toBe(updated.amountCents);
});

test("R24 náklad odmítne cizí scope a zápornou částku bez změny dat", async ({ page }) => {
  const { cost, propertyId } = await setup(page);
  const foreign = await db.property.findFirstOrThrow({ where: { id: { not: propertyId } } });
  await post(page, `/api/properties/${foreign.id}/costs/${cost.id}`, { form: form(cost) });
  expect((await post(page, `/api/properties/${propertyId}/costs/${cost.id}`, { form: { ...form(cost), amount: "-1" } })).get("error")).toContain("Částka nákladu");
  const updated = await db.propertyCost.findUniqueOrThrow({ where: { id: cost.id } });
  expect(updated.updatedAt).toEqual(cost.updatedAt);
  expect(updated.amountCents).toBe(cost.amountCents);
  expect(await db.auditLog.count({ where: { entityId: cost.id, action: "PROPERTY_COST_UPDATED" } })).toBe(0);
});
