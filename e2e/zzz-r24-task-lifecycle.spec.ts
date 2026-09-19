import { expect, test, type Page } from "@playwright/test";
import { PrismaClient, type TaskStatus } from "@prisma/client";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

// Direct DB assertions and fixtures are confined to the isolated test database.
test.beforeAll(() => {
  const host = new URL(process.env.DATABASE_URL!).hostname;
  if (!["localhost", "127.0.0.1", "postgres"].includes(host)) throw new Error("R24 fixtures require an isolated local/CI database.");
});
const db = new PrismaClient();
test.afterAll(async () => { await db.$disconnect(); });

// Chromium treats loopback HTTP as trustworthy for the production Secure session
// cookie; APIRequestContext does not. Exercise writes in that authenticated browser.
async function post(page: Page, path: string, options: { form: Record<string, string> }) {
  const result = await page.evaluate(async ({ path, form }) => {
    const response = await fetch(path, { method: "POST", body: new URLSearchParams(form) });
    return { status: response.status, url: response.url };
  }, { path, form: options.form });
  expect(result.status).toBe(200);
  expect(new URL(result.url).pathname).toBe(path.replace(/\/api/, "").replace(/\/(entries|close|reopen)$/, "").replace("/tasks/", "/ukoly/"));
  return new URL(result.url).searchParams;
}

async function setup(page: Page, status: TaskStatus = "OPEN") {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(R24_ROLE_USERS.technicalManager);
  await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
  const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.technicalManager }, include: { memberships: true } });
  const task = await db.task.create({ data: { title: "R24_AGENT_QA_2026_09 · lifecycle regression", propertyId: actor.memberships[0].propertyId, category: "MAINTENANCE", createdById: actor.id, status, closedAt: status === "OPEN" ? null : new Date(), dueAt: new Date("2026-09-07T12:00:00Z") } });
  return task;
}

for (const status of ["DONE", "CANCELLED"] as const) {
  test(`R24 ${status}: příslib nemění terminální stav; explicitní reopen zachová historii a odmítne retry`, async ({ page }) => {
    const task = await setup(page, status);
    await page.goto(`/ukoly/${task.id}`);
    await expect(page.getByRole("button", { name: "Příslib úhrady", exact: true })).toHaveCount(0);
    expect((await post(page, `/api/tasks/${task.id}/entries`, { form: { kind: "PROMISE", body: "R24 forbidden promise", promiseDate: "2026-09-15", promiseAmount: "1234" } })).get("error")).toContain("Příslib nelze přidat");
    const unchanged = await db.task.findUniqueOrThrow({ where: { id: task.id }, include: { entries: true } });
    expect(unchanged.status).toBe(status);
    expect(unchanged.closedAt).toEqual(task.closedAt);
    expect(unchanged.dueAt).toEqual(task.dueAt);
    expect(unchanged.entries).toHaveLength(0);

    await page.locator("summary").filter({ hasText: "Znovu otevřít případ" }).click();
    await page.getByRole("button", { name: "Znovu otevřít případ", exact: true }).click();
    expect(await page.getByLabel("Důvod znovuotevření *").evaluate((el: HTMLTextAreaElement) => el.validity.valueMissing)).toBe(true);
    await page.getByLabel("Důvod znovuotevření *").fill("R24 · závada se opakovala");
    await page.getByRole("button", { name: "Znovu otevřít případ", exact: true }).click();
    await expect(page.getByText("Případ byl znovu otevřen.", { exact: true })).toBeVisible();
    const reopened = await db.task.findUniqueOrThrow({ where: { id: task.id }, include: { entries: true } });
    expect(reopened.status).toBe("OPEN");
    expect(reopened.closedAt).toBeNull();
    expect(reopened.entries).toHaveLength(1);
    expect(reopened.entries[0].body).toContain("závada se opakovala");
    const replay = { reason: "R24 retry", expectedStatus: status, expectedUpdatedAt: task.updatedAt.toISOString() };
    expect((await post(page, `/api/tasks/${task.id}/reopen`, { form: replay })).get("error")).toContain("mezitím změnil");
    expect(await db.taskEntry.count({ where: { taskId: task.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: task.id, action: "TASK_REOPENED" } })).toBe(1);
  });
}

test("R24 souběh příslibu a uzavření nezanechá znovuotevřený hotový případ", async ({ page }) => {
  const task = await setup(page);
  const [promise, close] = await Promise.all([
    post(page, `/api/tasks/${task.id}/entries`, { form: { kind: "PROMISE", body: "R24 race promise", promiseDate: "2026-09-15", promiseAmount: "100" } }),
    post(page, `/api/tasks/${task.id}/close`, { form: { body: "R24 race close" } }),
  ]);
  expect(close.get("ok"), close.toString()).toBe("Případ byl uzavřen.");
  expect(promise.get("ok") || promise.get("error")).toMatch(/Záznam byl přidán|Příslib nelze přidat/);
  const result = await db.task.findUniqueOrThrow({ where: { id: task.id }, include: { entries: true } });
  expect(result.status).toBe("DONE");
  expect(result.closedAt).not.toBeNull();
  expect(result.entries.filter(entry => entry.body === "R24 race close")).toHaveLength(1);
  // The promise either committed before the close, or was atomically rejected.
  expect(result.entries.filter(entry => entry.kind === "PROMISE").length).toBeLessThanOrEqual(1);
});

test("R24 CAPEX nepřijme příslib ani obecné znovuotevření", async ({ page }) => {
  const task = await setup(page, "DONE");
  const unit = await db.unit.findFirstOrThrow({ where: { propertyId: task.propertyId } });
  const assessment = await db.unitConditionAssessment.create({ data: { unitId: unit.id, rating: "B_GOOD", investmentUrgency: "MONITOR", assessedAt: new Date(), createdById: task.createdById! } });
  const cost = await db.propertyCost.create({ data: { propertyId: task.propertyId, title: "R24 CAPEX fixture", kind: "CAPEX", amountCents: 10000, effectiveAt: new Date() } });
  const budget = await db.propertyBudgetLine.create({ data: { propertyId: task.propertyId, year: 2026, kind: "CAPEX", title: "R24 CAPEX fixture", amountCents: 10000 } });
  await db.unitConditionPlanExecution.create({ data: { taskId: task.id, propertyId: task.propertyId, propertyCostId: cost.id, budgetLineId: budget.id, assessmentId: assessment.id, createdById: task.createdById! } });
  expect((await post(page, `/api/tasks/${task.id}/reopen`, { form: { reason: "R24 CAPEX reopen", expectedStatus: "DONE", expectedUpdatedAt: task.updatedAt.toISOString() } })).get("error")).toContain("Stav CAPEX");
  expect((await post(page, `/api/tasks/${task.id}/entries`, { form: { kind: "PROMISE", body: "R24 CAPEX promise", promiseDate: "2026-09-15", promiseAmount: "100" } })).get("error")).toContain("Příslib nelze přidat");
  const result = await db.task.findUniqueOrThrow({ where: { id: task.id }, include: { entries: true } });
  expect(result.status).toBe("DONE");
  expect(result.closedAt).toEqual(task.closedAt);
  expect(result.entries).toHaveLength(0);
  await page.goto(`/ukoly/${task.id}`);
  await expect(page.getByText("Znovu otevřít případ", { exact: true })).toHaveCount(0);
});
