import { expect, test, type Page } from "@playwright/test";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026";
const rolePassword = process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD;

function watchBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console.error: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return () => expect(failures, "R30 UX sweep nesmí vyvolat page error, console error ani HTTP 5xx.").toEqual([]);
}

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
}

async function loginAdmin(page: Page) {
  await login(page, adminEmail, adminPassword);
}

async function assertSurface(page: Page, route: string, label = route) {
  const response = await page.goto(route);
  expect.soft(response?.status(), `${label}: HTTP status`).toBeLessThan(400);
  await expect(page.locator("main")).toBeVisible();
  const metrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    h1: document.querySelectorAll("main h1").length,
    mainWidth: document.querySelector("main")?.getBoundingClientRect().width || 0,
  }));
  expect.soft(metrics.overflow, `${label}: globální horizontální overflow`).toBeLessThanOrEqual(2);
  expect.soft(metrics.h1, `${label}: hlavní nadpis`).toBeGreaterThanOrEqual(1);
  expect.soft(metrics.mainWidth, `${label}: hlavní obsah má nenulovou šířku`).toBeGreaterThan(200);
  await expect.soft(page.locator(".modal-backdrop:visible"), `${label}: bez samovolně otevřeného modalu`).toHaveCount(0);
}

async function firstPropertyId(page: Page) {
  await page.goto("/portfolio");
  const href = await page.locator('a[href^="/nemovitosti/"][href$="/prehled"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  return href!.split("/")[2];
}

test("R30 · senior designer projde hlavní category/workspace obrazovky na desktopu", async ({ page }) => {
  const clean = watchBrowserFailures(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAdmin(page);
  const routes = [
    "/portfolio",
    "/reporty",
    "/reporty?view=asset",
    "/reporty?view=forecast",
    "/reporty?view=occupancy",
    "/reporty?view=collections",
    "/reporty?view=tenancy",
    "/reporty?view=benchmark",
    "/reporty?view=deposits",
    "/reporty?view=contracts",
    "/ukoly",
    "/revize",
    "/portfolio/kvalita",
    "/platby/nesparovane",
    "/reporty/predpisy",
    "/reporty/saldo",
    "/kauce",
    "/najemnici",
    "/smlouvy",
    "/dokumenty",
    "/vlastnici",
    "/distribuce",
    "/metodika?view=guides",
    "/metodika?view=chapters",
    "/metodika?view=glossary",
    "/metodika?view=media",
    "/reporty/akcionarske",
    "/uzivatele",
    "/nastaveni",
  ];
  for (const route of routes) await assertSurface(page, route);
  clean();
});

test("R30 · asset manager projde celý kontext nemovitosti bez globálního overflow", async ({ page }) => {
  const clean = watchBrowserFailures(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAdmin(page);
  const propertyId = await firstPropertyId(page);
  const sections = [
    "prehled",
    "jednotky",
    "najemnici",
    "smlouvy",
    "platby",
    "finance",
    "vyuctovani/podklady",
    "provoz",
    "banka",
    "meridla",
    "technicke-udaje",
    "dokumenty",
    "reporting",
    "nastaveni",
  ];
  for (const section of sections) {
    const route = `/nemovitosti/${propertyId}/${section}`;
    await assertSurface(page, route, `nemovitost/${section}`);
    const tabs = page.locator(section === "reporting" ? ".report-tabs" : ".property-subnav");
    if (section === "reporting") await expect(page).toHaveURL(new RegExp(`/reporty\\?properties=${propertyId}`));
    await expect.soft(tabs, `nemovitost/${section}: context tabs`).toBeVisible();
    await expect.soft(tabs.locator("a.active"), `nemovitost/${section}: právě jedna aktivní záložka`).toHaveCount(1);
    // Approved A keeps readable labels in one horizontally scrollable row at every width.
    await expect.soft(tabs).toHaveCSS("overflow-x", "auto");
    await expect.soft(tabs).toHaveCSS("flex-wrap", "nowrap");
    await tabs.locator("a").last().scrollIntoViewIfNeeded();
    await expect.soft(tabs.locator("a").last()).toBeInViewport();
  }
  clean();
});

test("R30 · mobilní critical path zůstává kompaktní", async ({ page }) => {
  const clean = watchBrowserFailures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAdmin(page);
  const propertyId = await firstPropertyId(page);
  for (const route of [
    "/portfolio",
    "/reporty",
    `/nemovitosti/${propertyId}/prehled`,
    `/nemovitosti/${propertyId}/finance`,
    `/nemovitosti/${propertyId}/platby`,
    `/nemovitosti/${propertyId}/nastaveni`,
  ]) await assertSurface(page, route, `mobile ${route}`);
  clean();
});

test("R30 · externí vlastník má čistý read-only chrome bez interních administračních vstupů", async ({ page }) => {
  const clean = watchBrowserFailures(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, R24_ROLE_USERS.externalOwner, rolePassword);
  await assertSurface(page, "/portfolio", "externí vlastník / portfolio");
  await assertSurface(page, "/reporty", "externí vlastník / reporty");
  await expect(page.locator('.sidebar a[href="/uzivatele"]')).toHaveCount(0);
  await expect(page.locator('.sidebar a[href="/nastaveni"]')).toHaveCount(0);
  await expect(page.locator('.sidebar a[href="/distribuce"]')).toHaveCount(0);
  clean();
});
