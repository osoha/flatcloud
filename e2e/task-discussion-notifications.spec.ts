import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";
import { collectTaskNotifications, processTaskNotifications } from "../lib/task-notifications";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";
import { notificationDefaults, parseMentions, updateMentionRanges } from "../lib/task-discussion-shared";

test.beforeAll(() => {
  process.env.APP_URL ||= "http://127.0.0.1:3100";
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Isolated DB required");
});
test.afterAll(async () => prisma.$disconnect());
async function login(page: Page, email: string) {
  await page.goto("/login"); await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Heslo", { exact: true }).fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click(); await expect(page).toHaveURL(/\/portfolio/);
}
// Use Chromium's secure loopback session, just like the application's fetch.
async function post(page: Page, path: string, form: Record<string, string>) {
  return page.evaluate(async ({ path, form }) => {
    const response = await fetch(path, { method: "POST", body: new URLSearchParams(form) });
    return { status: response.status, url: response.url };
  }, { path, form });
}
async function fixture() {
  const [author, member, outsider] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.internalAssistant } }),
    prisma.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.novice } }),
    prisma.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.externalOwner } }),
  ]);
  const task = await prisma.task.create({ data: { title: `Diskuse ${randomUUID()}`, category: "GENERAL", createdById: author.id, members: { create: { userId: member.id, role: "WATCHER" } } } });
  return { author, member, outsider, task };
}

test("zmínky zachovají identitu při úpravě textu", () => {
  const body = "Ahoj @Jana Nová", mention = { userId: "known", label: "Jana Nová", start: 5, end: body.length };
  expect(updateMentionRanges(body, `Dobrý den ${body}`, [mention])[0].start).toBe(15);
  expect(updateMentionRanges(body, "Ahoj @Jana Jiná", [mention])).toEqual([]);
  expect(() => parseMentions([{ ...mention, userId: "known", start: -1 }], body)).toThrow();
});

test("@našeptávač, tiché reakce a oprávnění v obou režimech", async ({ browser }, testInfo) => {
  const f = await fixture();
  const page = await browser.newPage(); await login(page, f.author.email);
  await page.goto(`/ukoly/${f.task.id}`);
  await page.getByLabel("Nový komentář", { exact: true }).fill("Prosím @");
  await expect(page.getByRole("listbox", { name: "Účastníci k označení" })).toBeVisible();
  await expect(page.getByRole("option", { name: new RegExp(f.outsider.email) })).toHaveCount(0);
  await page.getByRole("option", { name: new RegExp(f.member.email) }).click();
  await expect(page.locator('input[name="mentions"]')).toHaveValue(new RegExp(f.member.id));
  await page.getByRole("button", { name: "Odeslat", exact: true }).click();
  const entry = await prisma.taskEntry.findFirstOrThrow({ where: { taskId: f.task.id }, orderBy: { createdAt: "desc" } });
  const article = page.locator(`[id="zaznam-${entry.id}"]`);
  await expect(article.locator(".task-mention")).toHaveText(`@${f.member.name}`);
  const before = await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } });
  const mailCount = await prisma.taskNotification.count({ where: { taskId: f.task.id } });
  await article.getByRole("button", { name: "Přidat reakci", exact: true }).click();
  await article.getByRole("button", { name: "Líbí se", exact: true }).click();
  await expect(article.getByLabel("Líbí se: 1", { exact: true })).toBeVisible();
  await article.getByLabel("Líbí se: 1", { exact: true }).click();
  await expect(article.locator(".reaction-people")).toContainText(f.author.name);
  await article.getByRole("button", { name: "Odebrat mou reakci", exact: true }).click();
  await expect(article.getByText("👍 1", { exact: true })).toHaveCount(0);
  expect((await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } })).updatedAt).toEqual(before.updatedAt);
  expect(await prisma.taskNotification.count({ where: { taskId: f.task.id } })).toBe(mailCount);
  const memberPage = await browser.newPage(); await login(memberPage, f.member.email);
  const reactionPath = `/api/tasks/${f.task.id}/entries/${entry.id}/reaction`;
  expect((await post(memberPage, reactionPath, { reaction: "LOVE" })).status).toBe(200);
  const outsiderPage = await browser.newPage(); await login(outsiderPage, f.outsider.email);
  expect((await post(outsiderPage, reactionPath, { reaction: "LIKE" })).status).toBe(404);
  await page.getByRole("button", { name: "Tmavý režim", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const remove = page.getByRole("button", { name: "Odebrat", exact: true });
  expect(await remove.evaluate(el => parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: testInfo.outputPath("task-discussion-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("task-discussion-mobile.png"), fullPage: true });
  await page.close(); await memberPage.close(); await outsiderPage.close();
});

test("podvržená zmínka se neuloží a preference lze vypnout", async ({ page }) => {
  const f = await fixture(); await login(page, f.author.email);
  const body = `@${f.outsider.name}`;
  const rejected = await post(page, `/api/tasks/${f.task.id}/entries`, { body, kind: "COMMENT", visibility: "INTERNAL", mentions: JSON.stringify([{ userId: f.outsider.id, label: f.outsider.name, start: 0, end: body.length }]) });
  expect(new URL(rejected.url).pathname).toBe(`/ukoly/${f.task.id}`);
  expect(new URL(rejected.url).searchParams.has("error")).toBe(true);
  expect(await prisma.taskEntry.count({ where: { taskId: f.task.id } })).toBe(0);
  await page.goto("/ucet#upozorneni");
  await page.getByLabel("E-mailová upozornění z úkolů a diskusí", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Uložit upozornění", exact: true }).click();
  expect((await prisma.taskNotificationPreference.findUniqueOrThrow({ where: { userId: f.author.id } })).emailEnabled).toBe(false);
  await prisma.taskNotificationPreference.delete({ where: { userId: f.author.id } });
});

test("fronta respektuje preference, odebraný přístup, SMTP selhání a opakované zpracování", async () => {
  const f = await fixture();
  const entry = await prisma.taskEntry.create({ data: { taskId: f.task.id, authorId: f.author.id, body: "Kontrola", visibility: "INTERNAL" } });
  const queue = async () => prisma.taskNotification.create({ data: { dedupeKey: randomUUID(), taskId: f.task.id, entryId: entry.id, userId: f.member.id, kind: "MENTION" } });
  let delivered = 0;
  const transport = async () => { delivered++; return { sent: true }; };
  await prisma.taskNotificationPreference.upsert({ where: { userId: f.member.id }, create: { userId: f.member.id, ...notificationDefaults, emailEnabled: false }, update: { emailEnabled: false } });
  await queue(); await processTaskNotifications({ taskId: f.task.id, transport }); expect(delivered).toBe(0);
  await prisma.taskNotificationPreference.update({ where: { userId: f.member.id }, data: { emailEnabled: true } });
  const sent = await queue();
  await Promise.all([processTaskNotifications({ taskId: f.task.id, transport }), processTaskNotifications({ taskId: f.task.id, transport })]);
  expect(delivered).toBe(1); expect((await prisma.taskNotification.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("SENT");
  await processTaskNotifications({ taskId: f.task.id, transport }); expect(delivered).toBe(1);
  const failure = await queue(); await processTaskNotifications({ taskId: f.task.id, transport: async () => ({ sent: false, reason: "Test SMTP unavailable" }) });
  expect((await prisma.taskNotification.findUniqueOrThrow({ where: { id: failure.id } })).status).toBe("RETRY");
  await prisma.taskMember.delete({ where: { taskId_userId: { taskId: f.task.id, userId: f.member.id } } });
  await processTaskNotifications({ taskId: f.task.id, now: new Date(Date.now() + 7200000), transport }); expect(delivered).toBe(1);
  expect((await prisma.taskNotification.findUniqueOrThrow({ where: { id: failure.id } })).status).toBe("SKIPPED");
  await prisma.taskNotificationPreference.delete({ where: { userId: f.member.id } });
});

test("plánovač upozorní na nové přiřazení pouze jednou", async () => {
  const f = await fixture();
  await prisma.task.update({ where: { id: f.task.id }, data: { assigneeId: f.member.id } });
  await collectTaskNotifications(); await collectTaskNotifications();
  expect(await prisma.taskNotification.count({ where: { taskId: f.task.id, kind: "ASSIGNMENT" } })).toBe(1);
});

test("čtenář domu nemůže reagovat na interní záznam ani dostat jeho obsah e-mailem", async ({ page }) => {
  const f = await fixture();
  const owner = await prisma.owner.create({ data: { name: `Diskuse ${randomUUID()}` } });
  const property = await prisma.property.create({ data: { name: "Interní diskuse", address: "Test 1", city: "Praha", ownerId: owner.id, memberships: { create: { userId: f.outsider.id, permission: "VIEW" } } } });
  const task = await prisma.task.create({ data: { title: "Pouze interní", propertyId: property.id, createdById: f.author.id } });
  const entry = await prisma.taskEntry.create({ data: { taskId: task.id, body: "Interní informace", visibility: "INTERNAL" } });
  await login(page, f.outsider.email);
  expect((await post(page, `/api/tasks/${task.id}/entries/${entry.id}/reaction`, { reaction: "LIKE" })).status).toBe(404);
  await prisma.taskEntry.update({ where: { id: entry.id }, data: { visibility: "OWNER_VISIBLE" } });
  expect((await post(page, `/api/tasks/${task.id}/entries/${entry.id}/reaction`, { reaction: "LIKE" })).status).toBe(200);
});

test("termín má jeden e-mail předem a jeden po termínu; zrušený termín se neodesílá", async () => {
  const f = await fixture();
  const now = new Date(); now.setUTCHours(12, 0, 0, 0);
  const due = new Date(now.getTime() + 86400000);
  await prisma.task.update({ where: { id: f.task.id }, data: { assigneeId: f.member.id, dueAt: due } });
  await collectTaskNotifications(now); await collectTaskNotifications(now);
  expect(await prisma.taskNotification.count({ where: { taskId: f.task.id, kind: "DUE_SOON" } })).toBe(1);
  await collectTaskNotifications(new Date(due.getTime() + 86400000));
  expect(await prisma.taskNotification.count({ where: { taskId: f.task.id, kind: "OVERDUE" } })).toBe(1);
  await prisma.task.update({ where: { id: f.task.id }, data: { status: "DONE", dueAt: null } });
  await prisma.taskNotification.deleteMany({ where: { taskId: f.task.id, kind: "ASSIGNMENT" } });
  let sent = 0; await processTaskNotifications({ taskId: f.task.id, transport: async () => { sent++; return { sent: true }; } });
  expect(sent).toBe(0);
});

test("skupinové zmínky se deduplikují, editor skrývá příslib a FC našeptávání", async ({ page }, testInfo) => {
  const f = await fixture(); await login(page, f.author.email);
  await prisma.taskEntry.create({ data: { taskId: f.task.id, kind: "SYSTEM", body: "Systémový záznam" } });
  await page.goto(`/ukoly/${f.task.id}`);
  await expect(page.getByRole("group", { name: "Typ záznamu" })).toHaveCount(0);
  const editor = page.getByLabel("Nový komentář", { exact: true });
  await editor.fill("@");
  await expect(page.getByRole("option", { name: /@all / })).toBeVisible();
  await expect(page.getByRole("option", { name: /^@flatcloud/ })).toHaveCount(0);
  await editor.fill("@all @board Prosím o potvrzení.");
  await expect(page.locator(".composer-actions")).toContainText("Adresně upozornit: 1 osobu");
  await page.getByRole("button", { name: "Odeslat", exact: true }).click();
  await expect(page.getByText("Záznam byl přidán do vlákna.", { exact: true })).toBeVisible();
  const entry = await prisma.taskEntry.findFirstOrThrow({ where: { taskId: f.task.id, kind: "COMMENT" } });
  expect(await prisma.taskNotification.count({ where: { entryId: entry.id, userId: f.member.id, kind: "MENTION" } })).toBe(1);
  expect(await prisma.taskNotification.count({ where: { entryId: entry.id, userId: { in: [f.author.id, f.outsider.id] } } })).toBe(0);
  await expect(page.locator(`#zaznam-${entry.id} .task-mention`)).toHaveText(["@all", "@board"]);
  await page.getByRole("switch", { name: "Jen komentáře" }).check();
  await expect(page.getByText("Systémový záznam", { exact: true })).toBeHidden();
  await page.getByRole("switch", { name: "Jen komentáře" }).uncheck();
  await expect(page.getByText("Systémový záznam", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1366, height: 768 });
  const icon = page.locator(`#zaznam-${entry.id} .reaction-picker-toggle svg`);
  expect((await icon.boundingBox())!.width).toBeGreaterThanOrEqual(22);
  expect(await page.locator(`#zaznam-${entry.id} .discussion-content>p`).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15);
  await page.screenshot({ path: testInfo.outputPath("task-polish-desktop-light.png"), fullPage: true });
  await page.getByRole("button", { name: "Tmavý režim", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("task-polish-desktop-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("task-polish-mobile.png"), fullPage: true });
  const rejected = await post(page, `/api/tasks/${f.task.id}/entries`, { kind: "PROMISE", body: "Nevhodný příslib", promiseDate: "2026-10-01" });
  expect(new URL(rejected.url).searchParams.get("error")).toContain("Příslib nelze přidat");
});

test("@flatcloud respektuje členství, interní viditelnost a ztrátu přístupu před odesláním", async ({ page }) => {
  const f = await fixture();
  const owner = await prisma.owner.create({ data: { name: `FC ${randomUUID()}` } });
  const property = await prisma.property.create({ data: { name: "FC test", address: "Test 1", city: "Praha", ownerId: owner.id, memberships: { create: { userId: f.author.id, permission: "EDIT" } } } });
  const createPerson = (name: string, flatcloudMember: boolean, permission?: "EDIT" | "VIEW") => prisma.user.create({ data: { name, email: `${randomUUID()}@flatcloud.test`, passwordHash: f.author.passwordHash, role: "OWNER_VIEWER", isTestIdentity: false, flatcloudMember, ...(permission ? { memberships: { create: { propertyId: property.id, permission } } } : {}) } });
  const [fcEditor, fcReader, fcNoAccess, externalEditor] = await Promise.all([createPerson("FC editor", true, "EDIT"), createPerson("FC reader", true, "VIEW"), createPerson("FC bez přístupu", true), createPerson("Externí editor", false, "EDIT")]);
  const task = await prisma.task.create({ data: { title: "FC scope", category: "MAINTENANCE", propertyId: property.id, createdById: f.author.id } });
  await login(page, f.author.email);
  const result = await post(page, `/api/tasks/${task.id}/entries`, { body: "@flatcloud Kontrola", kind: "COMMENT", visibility: "INTERNAL" });
  expect(new URL(result.url).searchParams.has("error")).toBe(false);
  const entry = await prisma.taskEntry.findFirstOrThrow({ where: { taskId: task.id } });
  const notifications = await prisma.taskNotification.findMany({ where: { entryId: entry.id } });
  expect(notifications.some(n => n.userId === fcEditor.id)).toBe(true);
  for (const person of [fcReader, fcNoAccess, externalEditor]) expect(notifications.some(n => n.userId === person.id)).toBe(false);
  expect(await prisma.taskMember.count({ where: { taskId: task.id, userId: fcEditor.id } })).toBe(0);
  // Use a fake transport only; no test sends an actual email.
  await prisma.taskNotification.updateMany({ where: { entryId: entry.id, userId: fcEditor.id }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(0) } });
  await prisma.user.update({ where: { id: fcEditor.id }, data: { flatcloudMember: false } });
  const delivered: string[] = [];
  await processTaskNotifications({ taskId: task.id, transport: async mail => { delivered.push(mail.to); return { sent: true }; } });
  expect(delivered).not.toContain(fcEditor.email);
  expect((await prisma.taskNotification.findFirstOrThrow({ where: { entryId: entry.id, userId: fcEditor.id } })).status).toBe("SKIPPED");
});
