import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

const db = new PrismaClient();
const marker = "R24_AGENT_QA_2026_09 · R25-B";
test.beforeAll(() => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local/CI database required");
});
test.afterAll(async () => { await db.$disconnect(); });
async function setup(page: Page) {
  const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.advanced } });
  const owner = await db.owner.create({ data: { name: marker } });
  const property = await db.property.create({ data: { name: marker, address: "Syntetická 25", city: "Praha", ownerId: owner.id, memberships: { create: { userId: actor.id, permission: "EDIT" } } } });
  const line = await db.propertyBudgetLine.create({ data: { propertyId: property.id, title: `${marker} limit`, year: 2097, kind: "OPEX", category: "REPAIRS", amountCents: 10001, note: `${marker} původní podklad` } });
  await page.goto("/login"); await page.getByLabel("E-mail").fill(R24_ROLE_USERS.advanced);
  await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit se" }).click(); await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
  const path = `/nemovitosti/${property.id}/rozpocet/${line.id}`;
  const endpoint = `/api/properties/${property.id}/budgets/${line.id}`;
  const form = { requestId: randomUUID(), expectedUpdatedAt: line.updatedAt.toISOString(), amount: "150.02", reason: `${marker} doložená revize`, confirmed: "on" };
  return { actor, property, line, path, endpoint, form };
}
async function post(page: Page, endpoint: string, form: Record<string, string>) {
  // Match the real browser session: APIRequestContext does not send the
  // production Secure cookie over loopback HTTP, while Chromium does.
  const response = await page.evaluate(async ({ endpoint, form }) => {
    const result = await fetch(endpoint, { method: "POST", body: new URLSearchParams(form) });
    return { status: result.status, url: result.url };
  }, { endpoint, form });
  expect([200, 404]).toContain(response.status);
  expect(new URL(response.url).pathname).toBe(endpoint.replace("/api/properties/", "/nemovitosti/").replace("/budgets/", "/rozpocet/"));
  return new URL(response.url).searchParams;
}

test("R25-B revision UI preserves source and initial limit, updates comparison and retains archived history", async ({ page }) => {
  const { property, line, actor, path } = await setup(page);
  const cost = await db.propertyCost.create({ data: { propertyId: property.id, title: marker, amountCents: 1234, kind: "OPEX", category: "REPAIRS", status: "ACTUAL", effectiveAt: new Date("2097-04-01T12:00:00Z") } });
  await page.goto(`/nemovitosti/${property.id}/finance?financeYear=2097`);
  await page.getByRole("link", { name: line.title, exact: true }).click(); await expect(page).toHaveURL(path);
  await page.getByText("Změnit limit rozpočtu", { exact: true }).click();
  await page.getByLabel("Nový limit v Kč *", { exact: true }).fill("150.02");
  await page.getByLabel("Důvod změny / podklad *", { exact: true }).fill(`${marker} nové schválené podklady`);
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Zaznamenat revizi limitu" }).click();
  await expect(page).toHaveURL(/ok=/);
  const limits = page.getByRole("region", { name: "Limit rozpočtu", exact: true });
  await expect(limits).toContainText("100,01"); await expect(limits).toContainText("150,02"); await expect(limits).toContainText(line.note!);
  const history = page.getByRole("region", { name: "Historie revizí rozpočtu", exact: true });
  await expect(history).toContainText(`${marker} nové schválené podklady`); await expect(history).toContainText(actor.name);
  const current = await db.propertyBudgetLine.findUniqueOrThrow({ where: { id: line.id } });
  expect(current).toMatchObject({ title: line.title, note: line.note, year: line.year, category: line.category, kind: line.kind, createdAt: line.createdAt, amountCents: 15002 });
  expect(await db.propertyCost.findUniqueOrThrow({ where: { id: cost.id } })).toEqual(cost);
  await page.getByRole("link", { name: "Zpět na finance", exact: true }).click(); await expect(page).toHaveURL(/financeYear=2097/);
  await expect(page.getByTestId("budget-comparison")).toContainText("137,68");
  await db.property.update({ where: { id: property.id }, data: { active: false } });
  await page.goto(path); await expect(history).toContainText(`${marker} nové schválené podklady`);
});

test("R25-B concurrent revisions have one winner; retries never overwrite a later revision", async ({ page }) => {
  const { line, endpoint, form } = await setup(page);
  const forms = [form, { ...form, requestId: randomUUID(), amount: "180.03" }];
  const results = await Promise.all(forms.map(f => post(page, endpoint, f)));
  expect(results.filter(r => r.has("ok"))).toHaveLength(1);
  expect(results.filter(r => r.get("error")?.includes("mezitím změnil"))).toHaveLength(1);
  const winner = forms[results.findIndex(r => r.has("ok"))];
  const current = await db.propertyBudgetLine.findUniqueOrThrow({ where: { id: line.id } });
  expect((await post(page, endpoint, { ...winner, requestId: randomUUID(), expectedUpdatedAt: current.updatedAt.toISOString(), amount: "90,04" })).has("ok")).toBe(true);
  expect((await post(page, endpoint, winner)).has("ok")).toBe(true);
  expect((await post(page, endpoint, { ...winner, amount: "999" })).get("error")).toContain("již byl použit");
  const [final, events] = await Promise.all([
    db.propertyBudgetLine.findUniqueOrThrow({ where: { id: line.id } }),
    db.auditLog.findMany({ where: { entityId: line.id, action: "PROPERTY_BUDGET_LIMIT_REVISED" }, orderBy: { createdAt: "asc" } }),
  ]);
  expect(final.amountCents).toBe(9004); expect(events).toHaveLength(2);
  expect(events[0].details).toMatchObject({ before: { amountCents: 10001, note: line.note }, after: { amountCents: current.amountCents } });
  expect(events[1].details).toMatchObject({ before: { amountCents: current.amountCents }, after: { amountCents: 9004 } });
});

test("R25-B rejects invalid input without audit; VIEW reads but cannot revise, foreign and unit-only scopes are denied", async ({ page }) => {
  const { property, actor, line, endpoint, form, path } = await setup(page);
  for (const change of [{ reason: " " }, { confirmed: "" }, { amount: "1.001" }, { amount: "0" }, { amount: "-1" }, { amount: "21474836.48" }, { amount: "100.01" }]) {
    expect((await post(page, endpoint, { ...form, ...change })).has("error")).toBe(true);
  }
  expect(await db.auditLog.count({ where: { entityId: line.id } })).toBe(0);
  expect((await post(page, endpoint, form)).has("ok")).toBe(true);
  await db.userProperty.update({ where: { userId_propertyId: { userId: actor.id, propertyId: property.id } }, data: { permission: "VIEW" } });
  await page.goto(path); await expect(page.getByRole("region", { name: "Historie revizí rozpočtu" })).toContainText(form.reason);
  await expect(page.getByTestId("budget-revision")).toHaveCount(0);
  expect((await post(page, endpoint, { ...form, requestId: randomUUID() })).get("error")).toContain("oprávnění");
  const foreign = await db.property.create({ data: { name: marker, address: "Cizí 25", city: "Praha", ownerId: property.ownerId } });
  const foreignLine = await db.propertyBudgetLine.create({ data: { propertyId: foreign.id, title: marker, kind: "OPEX", year: 2097, amountCents: 1 } });
  await db.userProperty.update({ where: { userId_propertyId: { userId: actor.id, propertyId: property.id } }, data: { permission: "EDIT" } });
  expect((await post(page, `/api/properties/${property.id}/budgets/${foreignLine.id}`, { ...form, requestId: randomUUID() })).get("error")).toContain("nebyla nalezena");
  expect((await page.goto(`/nemovitosti/${property.id}/rozpocet/${foreignLine.id}`))?.status()).toBe(404);
  expect((await page.goto(`/nemovitosti/${foreign.id}/rozpocet/${foreignLine.id}`))?.status()).toBe(404);
  const unit = await db.unit.create({ data: { propertyId: foreign.id, label: marker, userAccesses: { create: { userId: actor.id, permission: "EDIT" } } } });
  expect(unit.propertyId).toBe(foreign.id);
  expect((await page.goto(`/nemovitosti/${foreign.id}/rozpocet/${foreignLine.id}`))?.status()).toBe(404);
  expect((await post(page, `/api/properties/${foreign.id}/budgets/${foreignLine.id}`, { ...form, requestId: randomUUID() })).get("error")).toContain("oprávnění");
  expect((await db.propertyBudgetLine.findUniqueOrThrow({ where: { id: line.id } })).amountCents).toBe(15002);
});

test("R25-B controlled CAPEX budget cannot be revised through the general editor", async ({ page }) => {
  const { property, actor, line, endpoint, form, path } = await setup(page);
  const unit = await db.unit.create({ data: { propertyId: property.id, label: marker } });
  const assessment = await db.unitConditionAssessment.create({ data: { unitId: unit.id, rating: "B_GOOD", investmentUrgency: "MONITOR", assessedAt: new Date(), createdById: actor.id } });
  const task = await db.task.create({ data: { propertyId: property.id, title: marker, createdById: actor.id } });
  const cost = await db.propertyCost.create({ data: { propertyId: property.id, title: marker, kind: "CAPEX", amountCents: 10001, effectiveAt: new Date() } });
  await db.unitConditionPlanExecution.create({ data: { taskId: task.id, propertyId: property.id, propertyCostId: cost.id, budgetLineId: line.id, assessmentId: assessment.id, createdById: actor.id } });
  await page.goto(path); await expect(page.getByTestId("budget-revision")).toHaveCount(0);
  expect((await post(page, endpoint, form)).get("error")).toContain("Kvalita a CAPEX");
  expect((await db.propertyBudgetLine.findUniqueOrThrow({ where: { id: line.id } })).amountCents).toBe(10001);
  expect(await db.auditLog.count({ where: { entityId: line.id } })).toBe(0);
});
