import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { prisma as db } from "../lib/db";

const marker = "R24_AGENT_QA_2026_09";
const oldPassword = "Isolated-old-fixture-2026";
const newPassword = "Isolated-new-fixture-2026";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026";
const base = process.env.E2E_BASE_URL || "http://127.0.0.1:3100";
test.beforeAll(() => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname) || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Password reset fixtures require isolated app and DB");
});
const createdIds: string[] = [];
test.afterEach(async () => {
  // Keep history but remove this suite's temporary users from later active-user pickers.
  await db.user.updateMany({ where: { id: { in: createdIds } }, data: { active: false } });
  createdIds.length = 0;
});
test.afterAll(async () => { await db.$disconnect(); });

async function fixture(role: "OWNER_VIEWER" | "MANAGER" | "SUPER_ADMIN" = "OWNER_VIEWER") {
  const user = await db.user.create({ data: { name: `${marker} password reset`, email: `${randomUUID()}@flatcloud.test`, role, isTestIdentity: true, passwordHash: await bcrypt.hash(oldPassword, 12) } });
  createdIds.push(user.id);
  return user;
}
async function login(request: APIRequestContext, email: string, password: string) {
  const response = await request.post("/api/auth/login", { form: { email, password }, maxRedirects: 0 });
  expect(response.headers().location).toContain("/portfolio");
  return sessionCookie(response);
}
function sessionCookie(response: { headers(): Record<string, string> }) {
  // Production cookies stay Secure. Only isolated HTTP API tests explicitly forward
  // the exact server-issued cookie; browser UI and live authentication are untouched.
  const cookie = response.headers()["set-cookie"]?.match(/(?:^|[,\s])fc_session=([^;]+)/)?.[1];
  expect(Boolean(cookie)).toBe(true);
  return `fc_session=${cookie}`;
}

test("R24 reset: UI, new credentials, unchanged grants, old and legacy sessions revoked, audit contains no secrets", async ({ page, browser }) => {
  const target = await fixture();
  const property = await db.property.findFirstOrThrow({ where: { active: true } });
  await db.userProperty.create({ data: { userId: target.id, propertyId: property.id, permission: "VIEW" } });
  const oldContext = await browser.newContext({ baseURL: base });
  const legacyContext = await browser.newContext({ baseURL: base });
  const freshContext = await browser.newContext({ baseURL: base });
  try {
    const oldCookie = await login(oldContext.request, target.email, oldPassword);
    expect((await oldContext.request.get("/portfolio", { headers: { cookie: oldCookie }, maxRedirects: 0 })).status()).toBe(200);
    const token = await new SignJWT({ userId: target.id }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(new TextEncoder().encode(process.env.SESSION_SECRET || "flatcloud-local-e2e-session-secret-at-least-32-characters"));
    await legacyContext.addCookies([{ name: "fc_session", value: token, url: base }]);
    expect((await legacyContext.request.get("/portfolio", { headers: { cookie: `fc_session=${token}` }, maxRedirects: 0 })).status()).toBe(200);
    await login(page.request, adminEmail, adminPassword);
    await page.goto(`/uzivatele/${target.id}`);
    await page.getByRole("link", { name: "Obnovit heslo uživatele", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Obnovit heslo uživatele" })).toBeVisible();
    await page.getByLabel("Heslo hlavního administrátora", { exact: true }).fill(adminPassword);
    await page.getByLabel("Nové heslo uživatele", { exact: true }).fill(newPassword);
    await page.getByLabel("Potvrzení nového hesla", { exact: true }).fill(newPassword);
    await page.getByLabel("Důvod obnovy", { exact: true }).fill(`${marker} lost test credential`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Obnovit heslo a odhlásit uživatele" }).click();
    await expect(page.getByText("Heslo bylo obnoveno a dosavadní přihlášení uživatele zneplatněna. Role a oprávnění zůstaly zachované.")).toBeVisible();
    for (const cookie of [oldCookie, `fc_session=${token}`]) expect((await oldContext.request.get("/portfolio", { headers: { cookie }, maxRedirects: 0 })).headers().location).toContain("/login");
    expect((await freshContext.request.post("/api/auth/login", { form: { email: target.email, password: oldPassword }, maxRedirects: 0 })).headers().location).toContain("error=1");
    const freshCookie = await login(freshContext.request, target.email, newPassword);
    expect((await freshContext.request.get("/portfolio", { headers: { cookie: freshCookie }, maxRedirects: 0 })).status()).toBe(200);
    const after = await db.user.findUniqueOrThrow({ where: { id: target.id }, include: { memberships: true } });
    expect(after.sessionVersion).toBe(1);
    expect(after.role).toBe("OWNER_VIEWER");
    expect(after.active).toBe(true);
    expect(after.allProperties).toBe(false);
    expect(after.memberships.map(x => [x.propertyId, x.permission])).toEqual([[property.id, "VIEW"]]);
    const audit = await db.auditLog.findMany({ where: { entityId: target.id, action: "USER_PASSWORD_RESET" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toEqual({ reason: `${marker} lost test credential`, sessionsRevoked: true });
    expect(audit[0].userId).toBe((await db.user.findUniqueOrThrow({ where: { email: adminEmail } })).id);
    for (const secret of [oldPassword, newPassword, after.passwordHash, adminPassword]) expect(JSON.stringify(audit)).not.toContain(secret);
  } finally { await oldContext.close(); await legacyContext.close(); await freshContext.close(); }
});

test("R24 reset: role, origin, admin proof, validation and target restrictions fail closed", async ({ request, browser }) => {
  const target = await fixture();
  const path = `/api/users/${target.id}/password-reset`;
  const form = { adminPassword, newPassword, confirmPassword: newPassword, confirmReset: "on", reason: `${marker} denial checks` };
  const headers = { origin: base };
  expect((await request.post(path, { headers, form, maxRedirects: 0 })).status()).toBe(403);
  for (const role of ["OWNER_VIEWER", "MANAGER"] as const) {
    const actor = await fixture(role);
    const context = await browser.newContext({ baseURL: base });
    try { const cookie = await login(context.request, actor.email, oldPassword); expect((await context.request.get("/portfolio", { headers: { cookie }, maxRedirects: 0 })).status()).toBe(200); expect((await context.request.post(path, { headers: { ...headers, cookie }, form, maxRedirects: 0 })).status()).toBe(403); } finally { await context.close(); }
  }
  const adminCookie = await login(request, adminEmail, adminPassword);
  const authenticatedHeaders = { ...headers, cookie: adminCookie };
  for (const origin of [undefined, "https://foreign.invalid", "null"]) expect((await request.post(path, { headers: origin ? { origin, cookie: adminCookie } : { cookie: adminCookie }, form, maxRedirects: 0 })).status()).toBe(403);
  for (const invalid of [{ adminPassword: "wrong" }, { confirmReset: "" }, { reason: "" }, { newPassword: "short" }, { confirmPassword: "different" }, { newPassword: "ě".repeat(37), confirmPassword: "ě".repeat(37) }, { newPassword: oldPassword, confirmPassword: oldPassword }]) {
    const response = await request.post(path, { headers: authenticatedHeaders, form: { ...form, ...invalid }, maxRedirects: 0 });
    expect(response.headers().location).toContain("error=");
  }
  const before = await db.user.findUniqueOrThrow({ where: { id: target.id } });
  expect(before.passwordHash).toBe(target.passwordHash);
  expect(before.sessionVersion).toBe(0);
  expect(await db.auditLog.count({ where: { action: "USER_PASSWORD_RESET", entityId: target.id } })).toBe(0);
  await db.user.update({ where: { id: target.id }, data: { active: false } });
  expect((await request.post(path, { headers: authenticatedHeaders, form, maxRedirects: 0 })).headers().location).toContain("error=");
  const peer = await fixture("SUPER_ADMIN");
  const admin = await db.user.findUniqueOrThrow({ where: { email: adminEmail } });
  for (const id of [peer.id, admin.id]) expect((await request.post(`/api/users/${id}/password-reset`, { headers: authenticatedHeaders, form, maxRedirects: 0 })).headers().location).toContain("error=");
  expect((await request.post(`/api/users/${randomUUID()}/password-reset`, { headers: authenticatedHeaders, form, maxRedirects: 0 })).status()).toBe(404);
});

test("R24 password change keeps initiating session and revokes another session", async ({ browser }) => {
  const target = await fixture();
  const first = await browser.newContext({ baseURL: base });
  const second = await browser.newContext({ baseURL: base });
  try {
    const firstCookie = await login(first.request, target.email, oldPassword);
    const secondCookie = await login(second.request, target.email, oldPassword);
    for (const cookie of [firstCookie, secondCookie]) expect((await first.request.get("/portfolio", { headers: { cookie }, maxRedirects: 0 })).status()).toBe(200);
    const response = await first.request.post("/api/account/password", { headers: { cookie: firstCookie }, form: { currentPassword: oldPassword, newPassword, confirmPassword: newPassword }, maxRedirects: 0 });
    expect(response.headers().location).toContain("changed=1");
    expect((await first.request.get("/portfolio", { headers: { cookie: sessionCookie(response) }, maxRedirects: 0 })).status()).toBe(200);
    expect((await second.request.get("/portfolio", { headers: { cookie: secondCookie }, maxRedirects: 0 })).headers().location).toContain("/login");
  } finally { await first.close(); await second.close(); }
});
