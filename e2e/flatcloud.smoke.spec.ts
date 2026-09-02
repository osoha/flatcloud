import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026";

function watchBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console.error: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      failures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return () => expect(failures, "Prohlížeč nesmí hlásit page error, console error ani HTTP 5xx.").toEqual([]);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Heslo").fill(adminPassword);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Portfolio", exact: true })).toBeVisible();
}

test("health endpoint potvrzuje dostupnou aplikaci a databázi", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ status: "ok" });
});

test("chráněná stránka přesměruje nepřihlášeného uživatele", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Přihlášení" })).toBeVisible();
});

test("neplatné přihlášení zobrazí bezpečnou chybu", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("nobody@flatcloud.test");
  await page.getByLabel("Heslo").fill("incorrect-password");
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page.getByText("Neplatný e-mail nebo heslo.")).toBeVisible();
  assertNoBrowserFailures();
});

test("administrátor se přihlásí a vidí deterministické portfolio", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await expect(page.getByText("Moskevská", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Karla Aksamita", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Dům ve správě", { exact: true }).first()).toBeVisible();
  assertNoBrowserFailures();
});

test("kritické registry a administrace se otevřou bez browser chyb", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  const routes = [
    ["/najemnici", "Nájemníci"],
    ["/smlouvy", "Smlouvy"],
    ["/ukoly", "Úkoly a případy"],
    ["/reporty", "Reporty"],
    ["/nastaveni", "Administrace aplikace"],
  ] as const;
  for (const [url, heading] of routes) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  assertNoBrowserFailures();
});

test("uživatel projde z portfolia do nemovitosti a jednotky", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).click();
  await expect(page.getByRole("heading", { name: "Moskevská", exact: true })).toBeVisible();
  await expect(page.getByText(/ID nemovitosti: P\d{4}/)).toBeVisible();
  await page.getByRole("link", { name: "Jednotky", exact: true }).click();
  await page.getByRole("link", { name: /1\.01/ }).first().click();
  await expect(page.getByRole("heading", { name: "1.01", exact: true })).toBeVisible();
  assertNoBrowserFailures();
});

test("nájemník a jeho smlouva jsou dostupné z registrů", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.goto("/najemnici");
  await page.getByRole("link", { name: "Jan Novák", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Jan Novák", exact: true })).toBeVisible();
  await page.goto("/smlouvy");
  await page.getByRole("link", { name: /Jan Novák/ }).first().click();
  await expect(page.getByText("Jan Novák", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading").first()).toBeVisible();
  assertNoBrowserFailures();
});

test("nová smlouva navrhne stabilní VS a stejné pořadí v čísle smlouvy", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).click();
  const propertyIdentity = await page.getByText(/ID nemovitosti: P\d{4}/).textContent();
  const propertyCode = propertyIdentity?.match(/P(\d{4})/)?.[1];
  expect(propertyCode).toBeTruthy();

  await page.getByRole("link", { name: "Jednotky", exact: true }).click();
  await page.getByRole("link", { name: /1\.01/ }).first().click();
  const unitIdentity = await page.getByText(/ID jednotky: P\d{4}-U\d{3}/).textContent();
  const unitCode = unitIdentity?.match(/-U(\d{3})/)?.[1];
  expect(unitCode).toBeTruthy();

  await page.getByRole("link", { name: "Nová smlouva", exact: true }).click();
  const variableSymbolInput = page.getByLabel("Variabilní symbol *");
  const contractNumberInput = page.getByLabel("Číslo smlouvy");
  const variableSymbol = await variableSymbolInput.inputValue();
  const contractNumber = await contractNumberInput.inputValue();
  expect(variableSymbol).toMatch(new RegExp(`^${propertyCode}${unitCode}\\d{2}$`));
  const sequence = variableSymbol.slice(-2);
  expect(contractNumber).toBe(`NS-P${propertyCode}-U${unitCode}-${sequence}`);

  await variableSymbolInput.fill("987654321");
  await contractNumberInput.fill("VLASTNI-CISLO");
  await expect(variableSymbolInput).toHaveValue("987654321");
  await expect(contractNumberInput).toHaveValue("VLASTNI-CISLO");
  assertNoBrowserFailures();
});

test("administrátor vytvoří úkol přes skutečný formulář", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  const taskTitle = "V23-A automatický smoke úkol";
  await login(page);
  await page.goto("/ukoly/novy");
  await page.getByLabel("Nemovitost *").selectOption({ label: "Moskevská" });
  await page.getByLabel("Kategorie *").selectOption("GENERAL");
  await page.getByLabel("Název *").fill(taskTitle);
  await page.getByLabel("Popis / zadání").fill("Deterministický zápis vytvořený browser-smoke testem V23-A.");
  await page.getByRole("button", { name: "Vytvořit úkol" }).click();
  await expect(page).toHaveURL(/\/ukoly\/[0-9a-f-]+(?:\?|$)/);
  await expect(page.getByRole("heading", { name: taskTitle, exact: true })).toBeVisible();
  await expect(page.getByText("Úkol byl vytvořen.")).toBeVisible();
  assertNoBrowserFailures();
});

test("odhlášení ukončí relaci a znovu ochrání portfolio", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.getByRole("button", { name: "Odhlásit" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  assertNoBrowserFailures();
});
