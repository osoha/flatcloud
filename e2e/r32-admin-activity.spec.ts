import { expect, test, type Page } from "@playwright/test";
import { filterAndSortActivity, isUserOnline, parseActivityView, ONLINE_WINDOW_MS } from "../lib/user-activity-policy";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026";
async function login(page: Page, email = adminEmail, password = adminPassword) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Heslo", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
}
async function apiHeaders(page: Page) {
  return { Cookie: (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join("; ") };
}

test("R32A: online expiruje, deaktivovaný a budoucí čas nejsou online; filtry nezaměňují chybějící historii", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  expect(isUserOnline(true, new Date(now.getTime() - ONLINE_WINDOW_MS + 1), now)).toBe(true);
  expect(isUserOnline(true, new Date(now.getTime() - ONLINE_WINDOW_MS), now)).toBe(false);
  expect(isUserOnline(false, now, now)).toBe(false);
  expect(isUserOnline(true, new Date(now.getTime() + 1), now)).toBe(false);
  expect(isUserOnline(true, null, now)).toBe(false);
  expect(parseActivityView("injected")).toBe("name");
  const rows = [
    { id: "old", name: "Adam", active: true, online: false, lastActivityAt: new Date("2026-08-01") },
    { id: "new", name: "Boris", active: true, online: false, lastActivityAt: null },
    { id: "live", name: "Zuzana", active: true, online: true, lastActivityAt: now },
  ];
  expect(filterAndSortActivity(rows, "online", now).map(r => r.id)).toEqual(["live", "old", "new"]);
  expect(filterAndSortActivity(rows, "inactive", now).map(r => r.id)).toEqual(["old"]);
  expect(filterAndSortActivity(rows, "unseen", now).map(r => r.id)).toEqual(["new"]);
});

test("R32A: super-admin vidí tři provozní údaje, online kroužek a filtrování skutečných účtů", async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "Synthetic activity fixtures belong only to isolated CI.");
  const { prisma } = await import("../lib/db");
  const suffix = Date.now();
  const created = [] as string[];
  try {
    for (const [key, name, seen, active] of [
      ["old", "R32 Starý účet", new Date(Date.now() - 45 * 86_400_000), true],
      ["unseen", "R32 Bez aktivity", null, true],
      ["live", "R32 Online účet", new Date(), true],
      ["disabled", "R32 Deaktivovaný", new Date(), false],
    ] as const) {
      const user = await prisma.user.create({ data: { name, email: `r32-${key}-${suffix}@flatcloud.test`, passwordHash: "not-a-login-fixture", active, isTestIdentity: true, ...(seen ? { activity: { create: { lastSeenAt: seen } } } : {}) } });
      created.push(user.id);
    }
    await login(page);
    await expect.poll(async () => (await prisma.userActivity.count({ where: { user: { email: adminEmail } } })) > 0).toBe(true);
    await page.goto("/uzivatele?activity=online");
    const panel = page.getByRole("region", { name: "Provoz aplikace" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link")).toHaveCount(3);
    await expect(panel.getByRole("link", { name: /Uživatelé online/ })).toHaveAttribute("href", "/uzivatele?activity=online");
    const live = page.locator("#seznam-uzivatelu tr").filter({ hasText: "R32 Online účet" });
    await expect(live.locator(".user-online")).toHaveCSS("outline-width", "3px");
    await expect(live.getByText("Online", { exact: true })).toBeVisible();
    await expect(page.locator("#seznam-uzivatelu tr").filter({ hasText: "R32 Deaktivovaný" }).locator(".user-online")).toHaveCount(0);
    const data = await page.request.get("/api/admin/operations", { headers: await apiHeaders(page) });
    expect(data.status()).toBe(200); expect((await data.json()).online).toBeGreaterThanOrEqual(2);
    await page.getByLabel("Aktivita uživatelů").selectOption("inactive");
    await page.getByRole("button", { name: "Zobrazit účty" }).click();
    await expect(page).toHaveURL(/activity=inactive/);
    await expect(page.locator("#seznam-uzivatelu")).toContainText("R32 Starý účet");
    await expect(page.locator("#seznam-uzivatelu")).not.toContainText("R32 Bez aktivity");
    await page.getByLabel("Aktivita uživatelů").selectOption("unseen");
    await page.getByRole("button", { name: "Zobrazit účty" }).click();
    await expect(page).toHaveURL(/activity=unseen/);
    await expect(page.locator("#seznam-uzivatelu")).toContainText("R32 Bez aktivity");
    await expect(page.locator("#seznam-uzivatelu")).not.toContainText("R32 Starý účet");
    await page.goto(`/uzivatele/${created[2]}`);
    await expect(page.locator(".avatar.user-online")).toBeVisible();
    await expect(page.getByTestId("user-access-form")).toBeVisible();
    await page.getByRole("button", { name: "Sbalit levé menu", exact: true }).click();
    await expect(page.getByRole("region", { name: "Provoz aplikace" })).toBeHidden();
  } finally { await prisma.user.deleteMany({ where: { id: { in: created } } }); }
});

test("R32A: osobní heartbeat nelze přesměrovat na cizí účet a provozní údaje jsou jen pro super-admina", async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "Role fixture and DB checks belong only to isolated CI.");
  const { prisma } = await import("../lib/db");
  expect((await page.request.post("/api/account/activity")).status()).toBe(401);
  expect((await page.request.get("/api/admin/operations")).status()).toBe(401);
  await login(page, R24_ROLE_USERS.externalOwner, process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD);
  await expect(page.getByRole("region", { name: "Provoz aplikace" })).toHaveCount(0);
  expect((await page.request.get("/api/admin/operations", { headers: await apiHeaders(page) })).status()).toBe(403);
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail }, include: { activity: true } });
  const before = admin.activity?.lastSeenAt.toISOString();
  const response = await page.request.post("/api/account/activity", { headers: await apiHeaders(page), data: { userId: admin.id, lastSeenAt: "2099-01-01" } });
  expect(response.status()).toBe(204);
  expect((await prisma.userActivity.findUnique({ where: { userId: admin.id } }))?.lastSeenAt.toISOString()).toBe(before);
  const own = await prisma.userActivity.findFirst({ where: { user: { email: R24_ROLE_USERS.externalOwner } } });
  expect(own).not.toBeNull(); expect(Date.now() - own!.lastSeenAt.getTime()).toBeLessThan(ONLINE_WINDOW_MS);
  await page.goto("/uzivatele");
  await expect(page).toHaveURL(/\/portfolio/);
});
