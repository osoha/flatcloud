import { expect, test, type Page } from "@playwright/test";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

const rolePassword = process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD;

function watchBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console.error: ${message.text()}`); });
  page.on("response", (response) => { if (response.status() >= 500) failures.push(`HTTP ${response.status()}: ${response.url()}`); });
  return () => expect(failures, "R24 role nesmí vyvolat page error, console error ani HTTP 5xx.").toEqual([]);
}

async function loginAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(rolePassword);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Portfolio", exact: true })).toBeVisible();
}

test.describe("R24 · agentní role a lifecycle", () => {
  test("novic dostane vedení a vidí pouze jednu přidělenou jednotku", async ({ page }) => {
    const clean = watchBrowserFailures(page);
    await loginAs(page, R24_ROLE_USERS.novice);
    await expect(page.getByText("Dům ve správě", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Moskevská", { exact: true })).toHaveCount(0);
    await page.goto("/metodika");
    await expect(page.getByRole("heading", { name: "Průvodci podle životní situace", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nastěhovávám nového nájemce", exact: true })).toBeVisible();
    clean();
  });

  test("pokročilý uživatel zapíše označený náklad pouze ve svém objektu", async ({ page }) => {
    const clean = watchBrowserFailures(page);
    await loginAs(page, R24_ROLE_USERS.advanced);
    await expect(page.getByText("Moskevská", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Karla Aksamita", { exact: true })).toHaveCount(0);
    await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).click();
    await page.getByRole("link", { name: "Náklady a úvěry", exact: true }).click();
    const costs = page.locator("#naklady");
    await costs.getByText("Přidat náklad", { exact: true }).click();
    await costs.getByLabel("Název *").fill("R24 · diagnostika střešní vpusti");
    await costs.getByLabel("Částka v Kč *").fill("2400");
    await costs.getByLabel("Stav *").selectOption("ACTUAL");
    await costs.getByLabel("Dodavatel").fill("R24_AGENT_QA_2026_09 · syntetický dodavatel");
    await costs.getByLabel("Číslo dokladu").fill("R24-QA-COST-001");
    await costs.getByRole("button", { name: "Uložit náklad", exact: true }).click();
    await expect(page.getByText("Náklad byl přidán do asset finance.", { exact: true })).toBeVisible();
    await expect(page.getByText("R24 · diagnostika střešní vpusti", { exact: true })).toBeVisible();
    clean();
  });

  test("externí vlastník nevidí interní portfolio ani správu uživatelů", async ({ page }) => {
    const clean = watchBrowserFailures(page);
    await loginAs(page, R24_ROLE_USERS.distributionLead);
    const internalHref = await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).first().getAttribute("href");
    expect(internalHref).toBeTruthy();
    await loginAs(page, R24_ROLE_USERS.externalOwner);
    await expect(page.getByText("Dům ve správě", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Moskevská", { exact: true })).toHaveCount(0);
    await page.goto("/uzivatele");
    await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
    clean();
    const forbidden = await page.goto(internalHref!);
    expect(forbidden?.status()).toBe(404);
  });

  test("interní asistentka dohledá data, ale nemůže spravovat role ani Distribuci", async ({ page }) => {
    const clean = watchBrowserFailures(page);
    await loginAs(page, R24_ROLE_USERS.internalAssistant);
    await expect(page.getByText("Karla Aksamita", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Dům ve správě", { exact: true })).toHaveCount(0);
    await page.getByPlaceholder(/Hledat nemovitost/).fill("Karla Aksamita");
    await page.getByPlaceholder(/Hledat nemovitost/).press("Enter");
    await expect(page).toHaveURL(/\/hledat\?q=/);
    await expect(page.getByText("Karla Aksamita", { exact: true }).first()).toBeVisible();
    await page.goto("/distribuce");
    await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
    clean();
  });

  test("technický správce vytvoří označený provozní úkol jen ve svém scope", async ({ page }) => {
    const clean = watchBrowserFailures(page);
    await loginAs(page, R24_ROLE_USERS.technicalManager);
    await page.goto("/ukoly/novy");
    const picker = page.getByLabel("Nemovitost *");
    await expect(picker).toHaveValue("");
    await expect(picker.locator("option")).toHaveCount(2);
    const propertyId = await picker.locator("option").nth(1).getAttribute("value");
    await page.goto(`/ukoly/novy?propertyId=${propertyId}`);
    await expect(page.getByLabel("Nemovitost *")).toHaveValue(propertyId!);
    await page.getByRole("link", { name: "Nový úkol", exact: true }).click();
    await expect(page).toHaveURL(/\/ukoly\/novy$/);
    await expect(picker).toHaveValue("");
    await expect(page.getByLabel("Odpovědný")).toBeDisabled();
    await page.goto("/ukoly/novy?propertyId=foreign-r24-id&leaseId=foreign-lease");
    await expect(page.getByLabel("Nemovitost *")).toHaveValue("");
    await expect(page.getByLabel("Smlouva / nájemník", {exact:true})).toHaveValue("");
    await page.getByLabel("Nemovitost *").selectOption(propertyId!);
    await page.getByLabel("Kategorie *").selectOption("MAINTENANCE");
    await page.getByLabel("Název *").fill("R24 · kontrola zatékání ve společných prostorách");
    await page.getByLabel("Priorita").selectOption("HIGH");
    await page.getByLabel("Popis / zadání").fill("R24_AGENT_QA_2026_09 · syntetický agentní scénář bez externí komunikace.");
    await page.getByRole("button", { name: "Vytvořit úkol", exact: true }).click();
    await expect(page.getByText("Úkol byl vytvořen.", { exact: true })).toBeVisible();
    clean();
  });

  test("správce jednotek vidí externí dům a může otevřít nájemní lifecycle", async ({ page }) => {
    const clean = watchBrowserFailures(page);
    await loginAs(page, R24_ROLE_USERS.unitManager);
    await page.locator("a.property-cell").filter({ hasText: "Dům ve správě" }).first().click();
    await page.getByRole("link", { name: "Jednotky", exact: true }).click();
    const firstUnit = page.locator("tbody tr").first();
    await expect(firstUnit).toContainText("Obsazená");
    await firstUnit.getByRole("link").first().click();
    await expect(page.getByRole("heading", { name: "1.01", exact: true })).toBeVisible();
    await expect(page.getByText("Aktivní smlouva", { exact: true })).toBeVisible();
    clean();
  });

  test("šéf distribuce projde CRM a postprodejní péči", async ({ page }) => {
    const clean = watchBrowserFailures(page);
    await loginAs(page, R24_ROLE_USERS.distributionLead);
    await page.goto("/distribuce");
    await expect(page.getByRole("heading", { name: "Interní distribuce", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "CRM zájemců", exact: true }).click();
    await expect(page.getByRole("heading", { name: "CRM zájemců o jednotky", exact: true })).toBeVisible();
    await page.goto("/distribuce/uvitaci-dopisy");
    await expect(page.getByRole("heading", { name: "Uvítací dopisy novým vlastníkům", exact: true })).toBeVisible();
    await expect(page.getByText("Externí komunikace · ruční kontrola před odesláním", { exact: true })).toBeVisible();
    clean();
  });

  test("asset manager rozliší provozní a asset KPI a otevře roční podklady", async ({ page }) => {
    const clean = watchBrowserFailures(page);
    await loginAs(page, R24_ROLE_USERS.assetManager);
    await page.goto("/reporty");
    await expect(page.getByRole("heading", { name: "Reporty", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "FlatCloud Asset", exact: true }).click();
    await expect(page.getByText("KPI skupiny · potvrzená aktiva", { exact: true })).toBeVisible();
    await page.goto("/reporty/rocni-podklady");
    await expect(page.getByRole("heading", { name: "Roční podklady vlastníka", exact: true })).toBeVisible();
    clean();
  });

  test("grafický audit hlídá overflow, nadpis a jedinou aktivní navigaci", async ({ page }) => {
    const clean = watchBrowserFailures(page);
    await loginAs(page, R24_ROLE_USERS.assetManager);
    for (const route of ["/portfolio", "/reporty", "/distribuce", "/metodika?view=glossary"]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator('.sidebar a[aria-current="page"]')).toHaveCount(1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} nesmí mít globální horizontální overflow`).toBeLessThanOrEqual(1);
    }
    clean();
  });
});
