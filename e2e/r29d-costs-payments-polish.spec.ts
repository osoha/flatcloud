import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026";

function watchBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console.error: ${message.text()}`));
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failures.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return () => expect(failures, "Prohlížeč nesmí hlásit page error, console error ani HTTP 5xx.").toEqual([]);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Heslo").fill(adminPassword);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
}

async function firstPropertyId(page: Page) {
  const href = await page.locator('a[href^="/nemovitosti/"][href$="/prehled"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  return href!.split("/")[2];
}

async function expectNoDocumentOverflow(page: Page, tolerance = 2) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(Math.max(metrics.innerWidth, metrics.clientWidth) + tolerance);
}

test("R29D desktop finance a platby mají kompaktní hierarchii bez zbytečného horizontálního scrollu", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const propertyId = await firstPropertyId(page);

  await page.goto(`/nemovitosti/${propertyId}/finance`);
  await expect(page.locator(".asset-finance-scope")).toBeVisible();
  await expect(page.locator(".asset-finance-kpis .stat")).toHaveCount(8);
  const financeChrome = await page.locator(".asset-finance-scope").evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return { height: box.height, boxShadow: style.boxShadow, backgroundColor: style.backgroundColor, fontSize: style.fontSize };
  });
  expect(financeChrome.height).toBeLessThan(60);
  expect(financeChrome.boxShadow).toBe("none");
  expect(financeChrome.backgroundColor).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(parseFloat(financeChrome.fontSize)).toBeLessThanOrEqual(11);
  await expectNoDocumentOverflow(page);

  await page.goto(`/nemovitosti/${propertyId}/platby`);
  await expect(page.locator("#ke-sparovani")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vyřešené platby", exact: true })).toBeVisible();
  await expectNoDocumentOverflow(page);

  await page.goto(`/nemovitosti/${propertyId}/nastaveni`);
  const securityHeading = page.getByRole("heading", { name: "Bezpečnost dat", exact: true });
  await expect(securityHeading).toBeVisible();
  const disclaimer = securityHeading.locator("xpath=..");
  const settingsGrid = disclaimer.locator("xpath=..");
  const firstCard = settingsGrid.locator(":scope > .card").first();
  const disclaimerLayout = await disclaimer.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return { height: box.height, width: box.width, boxShadow: style.boxShadow, backgroundColor: style.backgroundColor };
  });
  const firstCardWidth = await firstCard.evaluate((element) => element.getBoundingClientRect().width);
  expect(disclaimerLayout.height).toBeLessThan(90);
  expect(disclaimerLayout.boxShadow).toBe("none");
  expect(disclaimerLayout.backgroundColor).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(Math.abs(firstCardWidth - disclaimerLayout.width)).toBeLessThanOrEqual(3);
  await expectNoDocumentOverflow(page);
  assertNoBrowserFailures();
});

test("R29D finance, platby a disclaimer zůstávají bezpečné na mobilním viewportu", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const propertyId = await firstPropertyId(page);

  await page.goto(`/nemovitosti/${propertyId}/finance`);
  await expect(page.locator(".asset-finance-scope")).toBeVisible();
  const kpiColumns = await page.locator(".asset-finance-kpis").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(kpiColumns).toBe(2);
  await expectNoDocumentOverflow(page);

  await page.goto(`/nemovitosti/${propertyId}/platby`);
  await expect(page.locator("#ke-sparovani")).toBeVisible();
  await expectNoDocumentOverflow(page);

  await page.goto(`/nemovitosti/${propertyId}/nastaveni`);
  const securityHeading = page.getByRole("heading", { name: "Bezpečnost dat", exact: true });
  await expect(securityHeading).toBeVisible();
  const disclaimerHeight = await securityHeading.locator("xpath=..").evaluate((element) => element.getBoundingClientRect().height);
  expect(disclaimerHeight).toBeLessThan(120);
  await expectNoDocumentOverflow(page);
  assertNoBrowserFailures();
});
