import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

const db = new PrismaClient();
const marker = "R24_AGENT_QA_2026_09 · R25-C";
test.beforeAll(() => { if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local/CI database required"); });
test.afterAll(async () => { await db.$disconnect(); });
async function setup(page: Page) {
  const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.advanced } });
  const owner = await db.owner.create({ data: { name: marker } });
  const property = await db.property.create({ data: { name: marker, address: "Syntetická 25", city: "Praha", ownerId: owner.id, memberships: { create: { userId: actor.id, permission: "EDIT" } } } });
  const unit = await db.unit.create({ data: { propertyId: property.id, label: marker } });
  const line = await db.propertyBudgetLine.create({ data: { propertyId: property.id, title: `${marker} limit A`, year: 2097, kind: "OPEX", category: "MAINTENANCE", amountCents: 200000 } });
  const cost = await db.propertyCost.create({ data: { propertyId: property.id, title: `${marker} práce`, kind: "OPEX", category: "MAINTENANCE", amountCents: 123456, effectiveAt: new Date("2097-04-01T12:00:00Z"), allocations: { create: { unitId: unit.id, shareBasisPoints: 10000, amountCents: 123456 } } } });
  const asset = await db.fileAsset.create({ data: { storageKey: `r25-c-${cost.id}`, originalName: "synthetic.pdf", mimeType: "application/pdf", sizeBytes: 4, sha256: "metadata-only", uploadedById: actor.id } });
  const doc = await db.document.create({ data: { propertyId: property.id, propertyCostId: cost.id, createdById: actor.id, fileAssetId: asset.id, title: `${marker} účetní podklad`, category: "INVOICE" } });
  await page.goto("/login"); await page.getByLabel("E-mail").fill(R24_ROLE_USERS.advanced);
  await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit se" }).click(); await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
  return { actor, property, unit, line, cost, doc, path: `/nemovitosti/${property.id}/naklady/${cost.id}`, budgetPath: `/nemovitosti/${property.id}/rozpocet/${line.id}`, endpoint: `/api/properties/${property.id}/costs/${cost.id}/budget` };
}
async function post(page: Page, endpoint: string, form: Record<string, string>) {
  // Use the authenticated Chromium session, including its Secure loopback cookie.
  const result = await page.evaluate(async ({ endpoint, form }) => {
    const response = await fetch(endpoint, { method: "POST", body: new URLSearchParams(form) });
    return { status: response.status, url: response.url };
  }, { endpoint, form });
  expect([200, 404]).toContain(result.status); expect(new URL(result.url).pathname).not.toBe("/login");
  return new URL(result.url).searchParams;
}
const linkForm = (cost: { updatedAt: Date }, id: string) => ({ expectedUpdatedAt: cost.updatedAt.toISOString(), budgetLineId: id, reason: `${marker} doložené přiřazení`, confirmed: "on" });

test("R25-C UI links one cost through plan/commitment/actual with evidence and year isolation", async ({ page }) => {
  const { property, line, cost, doc, path, budgetPath } = await setup(page);
  await db.propertyCost.create({ data: { propertyId: property.id, title: `${marker} nepřiřazený`, kind: "OPEX", category: "MAINTENANCE", status: "ACTUAL", amountCents: 100, effectiveAt: cost.effectiveAt } });
  await page.goto(path); await page.getByText("Změnit přiřazení k rozpočtu", { exact: true }).click();
  const editor = page.getByTestId("cost-budget-link");
  await editor.getByLabel("Rozpočtová položka", { exact: true }).selectOption(line.id);
  await editor.getByLabel("Důvod změny přiřazení *", { exact: true }).fill(`${marker} schválený podklad`);
  await editor.getByRole("checkbox").check(); await editor.getByRole("button", { name: "Uložit přiřazení k rozpočtu" }).click();
  await expect(page.getByRole("status")).toContainText("Vazba na rozpočet byla zaznamenána");
  const linked = await db.propertyCost.findUniqueOrThrow({ where: { id: cost.id } });
  expect(linked).toEqual({ ...cost, budgetLineId: line.id, updatedAt: linked.updatedAt });
  await page.goto(budgetPath);
  const evidence = page.getByTestId("budget-cost-evidence");
  await expect(evidence.locator("tbody tr")).toHaveCount(1); await expect(evidence).toContainText("Faktura dostupná");
  await expect(evidence.locator(".summary-list")).toContainText("2 000,00 Kč");
  for (const [status, amount, remaining] of [["COMMITTED", "1234.56", "765,44"], ["ACTUAL", "1500.01", "499,99"]]) {
    await page.goto(path); await page.getByText("Upravit náklad a stav", { exact: true }).click();
    const costEditor = page.getByTestId("cost-edit");
    await costEditor.getByLabel("Stav *", { exact: true }).selectOption(status);
    await costEditor.getByLabel("Částka v Kč *", { exact: true }).fill(amount);
    await costEditor.getByLabel("Důvod změny *", { exact: true }).fill(`${marker} ${status}`);
    await costEditor.getByRole("button", { name: "Uložit změnu nákladu" }).click();
    await expect(page.getByRole("status")).toContainText("Náklad byl aktualizován");
    await page.goto(budgetPath); await expect(evidence.locator("tbody tr")).toHaveCount(1);
    await expect(evidence.locator(".summary-list")).toContainText(remaining);
  }
  const actual = await db.propertyCost.findUniqueOrThrow({ where: { id: cost.id }, include: { documents: true, allocations: true } });
  expect(actual.budgetLineId).toBe(line.id); expect(actual.documents[0].id).toBe(doc.id); expect(actual.allocations[0].amountCents).toBe(150001);
  await page.goto(`/nemovitosti/${property.id}/finance?financeYear=2097`); await expect(page.getByTestId("budget-comparison")).toContainText("1 501,01");
  await page.goto(path); await page.getByText("Upravit náklad a stav", { exact: true }).click();
  await page.getByTestId("cost-edit").getByLabel("Datum plánu / vzniku *", { exact: true }).fill("2098-04-01");
  await page.getByTestId("cost-edit").getByLabel("Důvod změny *", { exact: true }).fill(`${marker} přesun do dalšího roku`);
  await page.getByTestId("cost-edit").getByRole("button", { name: "Uložit změnu nákladu" }).click();
  await expect(page.getByRole("status")).toContainText("Náklad byl aktualizován");
  await page.goto(budgetPath); await expect(evidence).toContainText("Mimo rok rozpočtu"); await expect(evidence.locator(".summary-list")).toContainText("2 000,00");
});

test("R25-C reassignment and unlink retain both budget histories, evidence and VIEW boundaries", async ({ page }) => {
  const { actor, property, line, cost, doc, path, budgetPath, endpoint } = await setup(page);
  const second = await db.propertyBudgetLine.create({ data: { propertyId: property.id, title: `${marker} limit B`, year: line.year, kind: line.kind, category: line.category, amountCents: 300000 } });
  for (const invalid of [{ reason: " " }, { confirmed: "" }]) expect((await post(page, endpoint, { ...linkForm(cost, line.id), ...invalid })).has("error")).toBe(true);
  for (const target of [line.id, second.id, ""]) {
    const current = await db.propertyCost.findUniqueOrThrow({ where: { id: cost.id } });
    const result = await post(page, endpoint, linkForm(current, target)); expect(result.has("ok"), result.toString()).toBe(true);
  }
  const current = await db.propertyCost.findUniqueOrThrow({ where: { id: cost.id } });
  expect(current).toEqual({ ...cost, updatedAt: current.updatedAt });
  expect(await db.document.findUniqueOrThrow({ where: { id: doc.id } })).toEqual(doc);
  expect(await db.auditLog.count({ where: { entityId: cost.id, action: "PROPERTY_COST_BUDGET_LINK_CHANGED" } })).toBe(3);
  for (const id of [line.id, second.id]) {
    await page.goto(`/nemovitosti/${property.id}/rozpocet/${id}`);
    await expect(page.getByTestId("budget-cost-evidence").locator("tbody tr")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Historie vazeb na náklady", exact: true }).locator("article")).toHaveCount(2);
  }
  await db.userProperty.update({ where: { userId_propertyId: { userId: actor.id, propertyId: property.id } }, data: { permission: "VIEW" } });
  await page.goto(path); await expect(page.getByTestId("cost-budget-link")).toHaveCount(0);
  expect((await post(page, endpoint, linkForm(current, line.id))).get("error")).toContain("oprávnění");
  await page.goto(budgetPath); await expect(page.getByRole("region", { name: "Historie vazeb na náklady", exact: true })).toContainText(cost.title);
});

test("R25-C foreign/category mismatch and concurrent linking cannot corrupt scope or silently change classification", async ({ page }) => {
  const { actor, property, line, cost, endpoint } = await setup(page);
  const foreign = await db.property.create({ data: { name: marker, address: "Cizí 25", city: "Praha", ownerId: property.ownerId } });
  const foreignLine = await db.propertyBudgetLine.create({ data: { propertyId: foreign.id, title: marker, year: line.year, kind: line.kind, category: line.category, amountCents: 1 } });
  const wrong = await db.propertyBudgetLine.create({ data: { propertyId: property.id, title: marker, year: line.year, kind: "CAPEX", amountCents: 1 } });
  expect((await post(page, endpoint, linkForm(cost, foreignLine.id))).get("error")).toContain("nepatří");
  expect((await post(page, endpoint, linkForm(cost, wrong.id))).get("error")).toContain("stejný typ a kategorii");
  expect(await db.auditLog.count({ where: { entityId: cost.id } })).toBe(0);
  const second = await db.propertyBudgetLine.create({ data: { propertyId: property.id, title: `${marker} druhý`, year: line.year, kind: line.kind, category: line.category, amountCents: 300000 } });
  const results = await Promise.all([line.id, second.id].map(id => post(page, endpoint, linkForm(cost, id))));
  expect(results.filter(r => r.has("ok")), results.map(r => r.toString()).join("\n")).toHaveLength(1);
  expect(results.filter(r => r.get("error")?.includes("mezitím změnil"))).toHaveLength(1);
  const current = await db.propertyCost.findUniqueOrThrow({ where: { id: cost.id } });
  const rejected = await post(page, endpoint.replace(/\/budget$/, ""), { expectedUpdatedAt: current.updatedAt.toISOString(), title: cost.title, kind: "CAPEX", category: "CONSTRUCTION", status: "ACTUAL", amount: "1234.56", effectiveAt: "2097-04-01", reason: marker });
  expect(rejected.get("error")).toContain("odpovídat přiřazenému rozpočtu");
  expect(await db.propertyCost.findUniqueOrThrow({ where: { id: cost.id } })).toEqual(current);
  await db.unit.create({ data: { propertyId: foreign.id, label: marker, userAccesses: { create: { userId: actor.id, permission: "EDIT" } } } });
  expect((await page.goto(`/nemovitosti/${foreign.id}/rozpocet/${foreignLine.id}`))?.status()).toBe(404);
  expect((await post(page, `/api/properties/${foreign.id}/costs/${cost.id}/budget`, linkForm(current, foreignLine.id))).get("error")).toContain("oprávnění");
});

test("R25-C existing controlled CAPEX association is visible once and cannot be relinked", async ({ page }) => {
  const { actor, property, unit, cost, line, endpoint, budgetPath } = await setup(page);
  const assessment = await db.unitConditionAssessment.create({ data: { unitId: unit.id, rating: "B_GOOD", investmentUrgency: "MONITOR", assessedAt: new Date(), createdById: actor.id } });
  const task = await db.task.create({ data: { propertyId: property.id, title: marker, createdById: actor.id } });
  await db.unitConditionPlanExecution.create({ data: { propertyId: property.id, assessmentId: assessment.id, taskId: task.id, propertyCostId: cost.id, budgetLineId: line.id, createdById: actor.id } });
  await page.goto(budgetPath); const evidence = page.getByTestId("budget-cost-evidence");
  await expect(evidence.locator("tbody tr")).toHaveCount(1); await expect(evidence.getByRole("link", { name: "Otevřít úkol" })).toHaveAttribute("href", `/ukoly/${task.id}`);
  expect((await post(page, endpoint, linkForm(cost, ""))).get("error")).toContain("řízené CAPEX");
  const otherCost = await db.propertyCost.create({ data: { propertyId: property.id, title: marker, kind: cost.kind, category: cost.category, amountCents: 1, effectiveAt: cost.effectiveAt } });
  expect((await post(page, `/api/properties/${property.id}/costs/${otherCost.id}/budget`, linkForm(otherCost, line.id))).get("error")).toContain("jinému nákladu");
  expect((await db.propertyCost.findUniqueOrThrow({ where: { id: cost.id } })).budgetLineId).toBeNull();
});
