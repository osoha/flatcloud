import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test");
  await page.getByLabel("Heslo", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio/);
}

test("statistiky: denní snímek je neměnný, odděluje test účty a nepočítá neaktivní jednotky", async () => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "Database fixtures only in isolated CI.");
  const { prisma } = await import("../lib/db");
  const { loadSystemCounts, captureSystemDailySnapshot } = await import("../lib/admin-operations");
  const now = new Date();
  const before = await loadSystemCounts(now);
  const owner = await prisma.owner.create({ data: { name: "Statistics fixture" } });
  const user = await prisma.user.create({ data: { name: "Statistics test identity", email: `system-${Date.now()}@example.invalid`, passwordHash: "not-a-login", isTestIdentity: true, activity: { create: { lastSeenAt: now } } } });
  const property = await prisma.property.create({ data: { name: "Statistics fixture", address: "Test 1", city: "Plzeň", ownerId: owner.id, units: { create: [{ label: "active" }, { label: "inactive", operationalStatus: "INACTIVE" }] } } });
  const day = new Date("2001-01-02T00:00:00Z");
  try {
    const counts = await loadSystemCounts(now);
    expect(counts.users).toBe(before.users);
    expect(counts.activeUsers).toBe(before.activeUsers);
    expect(counts.testUsers).toBe(before.testUsers + 1);
    expect(counts.properties).toBe(before.properties + 1);
    expect(counts.units).toBe(before.units + 1);
    const [a, b] = await Promise.all([captureSystemDailySnapshot(day, counts), captureSystemDailySnapshot(day, counts)]);
    expect(a.day).toEqual(b.day);
    const repeated = await captureSystemDailySnapshot(day, { ...counts, users: 99999 });
    expect(repeated.users).toBe(counts.users);
    expect(await prisma.systemDailySnapshot.count({ where: { day } })).toBe(1);
    await prisma.property.update({ where: { id: property.id }, data: { active: false } });
    expect((await loadSystemCounts(now)).units).toBe(before.units);
  } finally {
    await prisma.systemDailySnapshot.deleteMany({ where: { day } });
    await prisma.property.delete({ where: { id: property.id } });
    await prisma.owner.delete({ where: { id: owner.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("pravý panel: fokus, mobil, tmavý režim, nedostupná data a oznámení pod úkoly", async ({ page }, testInfo) => {
  await login(page);
  await expect(page.locator(".sidebar .admin-operations-panel")).toHaveCount(0);
  await expect(page.locator('.sidebar a[href="/oznameni"]')).toHaveCount(0);
  await page.goto("/ukoly");
  await page.getByRole("navigation", { name: "Úkoly a oznámení" }).getByRole("link", { name: /Oznámení/ }).click();
  await expect(page).toHaveURL(/\/ukoly\/oznameni/);
  await expect(page.locator('.sidebar a[aria-label="Úkoly"]')).toHaveAttribute("aria-current", "page");
  await page.goto("/oznameni?view=hidden");
  await expect(page).toHaveURL(/\/ukoly\/oznameni\?view=hidden/);
  const trigger = page.getByRole("button", { name: "Přehled systému", exact: true });
  const panel = page.getByRole("dialog", { name: "Přehled systému" });
  const before = await page.locator("main").boundingBox();
  await trigger.click();
  await expect(panel.getByText("Aktivní uživatelé za 30 dní", { exact: true })).toBeVisible();
  const after = await page.locator("main").boundingBox();
  expect(after?.x).toBe(before?.x);
  await expect(panel.getByRole("button", { name: "Zavřít přehled systému" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("system-panel-light.png") });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await trigger.click();
  await expect(panel).toHaveCSS("background-color", "rgb(25, 37, 54)");
  await page.screenshot({ path: testInfo.outputPath("system-panel-dark.png") });
  await page.route("**/api/admin/operations", route => route.fulfill({ status: 503, json: { error: "test" } }));
  await panel.getByRole("button", { name: "Obnovit statistiky" }).click();
  await expect(panel.getByRole("status")).toContainText("poslední známý stav");
  await page.keyboard.press("Escape");
  await page.unroute("**/api/admin/operations");
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(Math.round(box!.x + box!.width)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath("system-panel-mobile.png") });
  await page.mouse.click(10, 420);
  await expect(panel).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/uzivatele");
  await trigger.click();
  await panel.getByRole("link", { name: /^Uživatelé/ }).click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/uzivatele#seznam-uzivatelu$/);
});
