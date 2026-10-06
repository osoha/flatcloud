import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma as db } from "../lib/db";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

test.beforeAll(() => {
  if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL).hostname)) {
    throw new Error("Owner-link fixtures require an isolated database");
  }
});
test.afterAll(() => db.$disconnect());

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("only a superadmin can link one active user to one owner with an audit record", async ({ browser }) => {
  const tag = randomUUID();
  const user = await db.user.create({ data: { name: "Testovací vlastník", email: `owner-link-${tag}@flatcloud.test`, passwordHash: "unused", role: "OWNER_VIEWER", isTestIdentity: true } });
  const owner = await db.owner.create({ data: { name: `Testovací vlastník ${tag}`, type: "PERSON" } });
  const otherOwner = await db.owner.create({ data: { name: `Jiný vlastník ${tag}`, type: "PERSON" } });
  const denied = await browser.newPage();
  const admin = await browser.newPage();
  try {
    await login(denied, R24_ROLE_USERS.externalOwner, R24_ROLE_PASSWORD);
    const unauthorized = await denied.request.post(`/api/owners/${owner.id}/user-link`, { form: { userEmail: user.email, confirmOwnerLink: "on" } });
    expect(unauthorized.ok()).toBeTruthy();
    expect((await db.owner.findUniqueOrThrow({ where: { id: owner.id } })).userId).toBeNull();

    await login(admin, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
    await admin.request.post(`/api/owners/${owner.id}/user-link`, { form: { userEmail: user.email } });
    expect((await db.owner.findUniqueOrThrow({ where: { id: owner.id } })).userId).toBeNull();
    await admin.goto(`/vlastnici/${owner.id}`);
    await expect(admin.getByRole("heading", { name: "Uživatelský účet vlastníka" })).toBeVisible();
    await admin.getByLabel("E-mail existujícího uživatele").fill(user.email);
    await admin.getByLabel("Potvrzuji propojení a přístup k údajům tohoto vlastníka.").check();
    await admin.getByRole("button", { name: "Propojit uživatele" }).click();
    await expect(admin.getByText("Uživatel byl propojen s vlastníkem.")).toBeVisible();
    expect((await db.owner.findUniqueOrThrow({ where: { id: owner.id } })).userId).toBe(user.id);
    expect(await db.auditLog.count({ where: { entityId: owner.id, action: "OWNER_USER_LINKED", userId: { not: null } } })).toBe(1);

    await admin.request.post(`/api/owners/${otherOwner.id}/user-link`, { form: { userEmail: user.email, confirmOwnerLink: "on" } });
    expect((await db.owner.findUniqueOrThrow({ where: { id: otherOwner.id } })).userId).toBeNull();
    expect(await db.auditLog.count({ where: { entityId: otherOwner.id, action: "OWNER_USER_LINKED" } })).toBe(0);
  } finally {
    await denied.close(); await admin.close();
    await db.auditLog.deleteMany({ where: { entityId: { in: [owner.id, otherOwner.id] }, action: "OWNER_USER_LINKED" } });
    await db.owner.deleteMany({ where: { id: { in: [owner.id, otherOwner.id] } } });
    await db.user.delete({ where: { id: user.id } });
  }
});
