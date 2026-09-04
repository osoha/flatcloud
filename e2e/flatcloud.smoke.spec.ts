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
  await expect(page.getByText("Rozpracováno", { exact: true })).toHaveCount(0);
  assertNoBrowserFailures();
});

test("globální správce vidí provozní rozsah napříč vlastníky", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await expect(page.getByText("Provozní cockpit · napříč vlastníky", { exact: true })).toBeVisible();
  const picker = page.locator(".scope-picker-trigger");
  await expect(picker).toContainText("Rozsah správy");
  await expect(picker).toContainText("Vše ve správě");
  await picker.click();
  const dialog = page.getByRole("dialog", { name: "Vybrat zobrazené objekty" });
  await expect(dialog.getByRole("button", { name: "Vybrat vše ve správě", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /FlatCloud Group/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Externí správa/ })).toBeVisible();
  await expect(dialog.locator(".scope-owner-preset").first()).toBeVisible();
  await page.getByRole("button", { name: "Zrušit změny", exact: true }).click();
  await expect(page.getByText("FlatCloud · 100 %", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Externí · 0 %", { exact: true }).first()).toBeVisible();
  await page.goto("/vlastnici");
  await expect(page.locator(".owner-affiliation-flatcloud_parent")).toHaveText(
    "FlatCloud a.s. – mateřská společnost",
  );
  await page.goto("/reporty");
  await expect(page.locator(".operational-scope-note")).toContainText("Nejde o konsolidované finanční KPI skupiny FlatCloud");
  await page.getByRole("link", { name: "FlatCloud Asset", exact: true }).click();
  await expect(page).toHaveURL(/view=asset/);
  await expect(page.getByText("KPI skupiny · potvrzená aktiva", { exact: true })).toBeVisible();
  const assetTable = page.getByRole("table").filter({ hasText: "Konsolidační podíl" });
  await expect(assetTable.getByRole("row")).toHaveCount(3);
  await expect(assetTable).toContainText("Moskevská");
  await expect(assetTable).toContainText("Karla Aksamita");
  await expect(assetTable).not.toContainText("Dům ve správě");
  await expect(page.getByText(/Indikativní LIVE run-rate:/)).toBeVisible();
  const assetCockpit = page.locator(".contract-cockpit");
  for (const label of ["NOI · run-rate", "Cashflow po dluhové službě", "Yield", "ROE", "LTV", "DSCR"]) await expect(assetCockpit.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText("Ocenění není úplné", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("table").filter({ hasText: "OPEX TTM" })).not.toContainText("Dům ve správě");
  assertNoBrowserFailures();
});

test("report kaucí používá české a významově přesné stavy", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.goto("/reporty?view=deposits");
  await expect(page.getByRole("heading", { name: "Kauce", exact: true })).toBeVisible();
  await expect(page.getByText(/ACTIVE|FUTURE|ENDED|NOT_CONFIGURED|UNPAID|PARTIAL|FUNDED|TO_SETTLE|SETTLED/, { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Aktivní|Budoucí|Ukončená/).first()).toBeVisible();
  const depositCards = page.locator(".deposit-kpis .stat");
  await expect(depositCards).toHaveCount(4);
  const cardBoxes = await depositCards.evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect()));
  expect(new Set(cardBoxes.map((box) => Math.round(box.y))).size).toBe(1);
  expect(new Set(cardBoxes.map((box) => Math.round(box.height))).size).toBe(1);
  const layers = await page.evaluate(() => ({
    header: Number(getComputedStyle(document.querySelector(".topbar")!).zIndex),
    scope: Number(getComputedStyle(document.querySelector(".scope-picker")!).zIndex),
  }));
  expect(layers.scope).toBeLessThan(layers.header);
  assertNoBrowserFailures();
});

test("reporty zobrazí historii obsazenosti a přepnou období grafů", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.goto("/reporty?view=occupancy");
  await expect(page.getByRole("img", { name: "Historický vývoj obsazenosti" })).toBeVisible();
  await expect(page.locator(".occupancy-point")).toHaveCount(12);
  await expect(page.getByRole("button", { name: "Linie", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Sloupce", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sloupce", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: "Historický vývoj obsazenosti" })).toHaveAttribute("data-chart-mode", "bar");
  await page.locator(".chart-checkpoint").first().hover();
  await expect(page.locator(".chart-tooltip")).toContainText(/Obsazenost|Bez průkazných dat/);
  await page.getByRole("link", { name: "YTD", exact: true }).click();
  await expect(page).toHaveURL(/view=occupancy&range=ytd/);
  await expect(page.getByRole("link", { name: "YTD", exact: true })).toHaveClass(/active/);
  const currentYear = new Date().getUTCFullYear();
  await page.getByLabel("Období od").fill(`${currentYear}-01`);
  await page.getByLabel("Období do").fill(`${currentYear}-02`);
  await page.getByRole("button", { name: "Použít", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`range=custom&from=${currentYear}-01&to=${currentYear}-02`));
  await expect(page.locator(".occupancy-point")).toHaveCount(2);
  await page.getByRole("link", { name: "Inkaso", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`view=collections.*range=custom.*from=${currentYear}-01.*to=${currentYear}-02`));
  await expect(page.getByRole("img", { name: "Vývoj předpisů a úhrad" })).toBeVisible();
  await page.getByRole("button", { name: "Linie", exact: true }).click();
  await expect(page.locator(".chart-line")).toHaveCount(2);
  await page.locator(".chart-checkpoint").first().hover();
  await expect(page.locator(".chart-tooltip")).toContainText("Předpis:");
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

test("metodika je dohledatelná globálně a umí filtrovat životní situace", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.getByRole("link", { name: "Metodika", exact: true }).click();
  await expect(page).toHaveURL(/\/metodika(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Metodika správy", exact: true })).toBeVisible();
  await page.getByLabel("Hledat v metodice").fill("valorizace");
  await page.getByRole("button", { name: "Hledat", exact: true }).click();
  await expect(page).toHaveURL(/\/metodika\?q=valorizace/);
  await expect(page.getByRole("heading", { name: "Valorizace a plán nájemného", exact: true })).toBeVisible();
  assertNoBrowserFailures();
});

test("MF benchmark se otevře jako read-only LIVE report", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.goto("/reporty?view=benchmark");
  await expect(page.getByRole("heading", { name: "Reporty", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "MF benchmark", exact: true })).toBeVisible();
  await expect(page.getByText("Datové období MF", { exact: true })).toBeVisible();
  await expect(page.getByText(/Srovnání je pouze ke čtení/)).toBeVisible();
  const property = page.locator("tr.mf-property-toggle").first();
  await expect(property).toBeVisible();
  await property.click();
  await expect(property).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("tr.mf-unit-drilldown-row").first()).toBeVisible();
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

test("přehled nemovitosti ukazuje stav založení a další doporučený krok", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).click();
  const checklist = page.locator(".onboarding-checklist");
  await expect(checklist).toBeVisible();
  await expect(checklist).toContainText("Připravenost objektu");
  await expect(checklist).toContainText("Jednotky");
  await expect(checklist).toContainText("Nájemní smlouvy");
  await expect(checklist).toContainText("Předpisy");
  assertNoBrowserFailures();
});

test("asset finance odděluje náklady a úvěry od nájemních financí", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).click();
  await page.getByRole("link", { name: "Náklady a úvěry", exact: true }).click();
  await expect(page.getByText("Finance objektu, ne nájemní smlouvy.", { exact: true })).toBeVisible();
  await expect(page.getByText("Servis výtahu", { exact: true })).toBeVisible();
  await expect(page.getByText("Revitalizace fasády", { exact: true })).toBeVisible();
  await expect(page.getByText("Investiční úvěr 2024", { exact: true })).toBeVisible();
  await expect(page.getByText("Česká spořitelna", { exact: true })).toBeVisible();
  await expect(page.getByText("Měsíční dluhová služba", { exact: true })).toBeVisible();
  const createCost = page.locator("#naklady details");
  await createCost.getByText("Přidat náklad", { exact: true }).click();
  await createCost.getByLabel("Název *").fill("Kontrolní servis střechy");
  await createCost.getByLabel("Částka v Kč *").fill("12500");
  await createCost.getByLabel("Stav *").selectOption("ACTUAL");
  await createCost.getByRole("button", { name: "Uložit náklad", exact: true }).click();
  await expect(page.getByText("Náklad byl přidán do asset finance.", { exact: true })).toBeVisible();
  await expect(page.getByText("Kontrolní servis střechy", { exact: true })).toBeVisible();
  assertNoBrowserFailures();
});

test("správce porovná rozpočet a zapíše nový stav úvěru", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).click();
  await page.getByRole("link", { name: "Náklady a úvěry", exact: true }).click();
  await expect(page.getByText("Schválený rozpočet 2026", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Servis a údržba", { exact: true })).toBeVisible();

  const budget = page.locator("#rozpocet");
  await budget.getByText("Přidat do rozpočtu", { exact: true }).click();
  await budget.getByLabel("Název položky *").fill("Rezerva na havárie");
  await budget.getByLabel("Částka v Kč *").fill("45000");
  await budget.getByRole("button", { name: "Uložit rozpočtovou položku", exact: true }).click();
  await expect(page.getByText("Rozpočtová položka byla přidána.", { exact: true })).toBeVisible();
  await expect(page.getByText("Rezerva na havárie", { exact: true })).toBeVisible();

  const loanHistory = page.locator('div.card[id^="uver-"]').filter({ hasText: "Investiční úvěr 2024" });
  await expect(loanHistory).toContainText("Starší záznamy se nepřepisují.");
  await loanHistory.getByText("Zapsat nový stav", { exact: true }).click();
  await loanHistory.getByLabel("Zbývající jistina v Kč *").fill("9100000");
  await loanHistory.getByLabel("Roční úrok v % *").fill("4.75");
  await loanHistory.getByLabel("Poznámka ke změně").fill("Mimořádná splátka");
  await loanHistory.getByRole("button", { name: "Uložit stav do historie", exact: true }).click();
  await expect(page.getByText("Nový stav úvěru byl uložen do historie.", { exact: true })).toBeVisible();
  await expect(page.locator('div.card[id^="uver-"]').filter({ hasText: "Investiční úvěr 2024" })).toContainText("Mimořádná splátka");
  assertNoBrowserFailures();
});

test("správce přiřadí náklad jednotce a dohledá účetní podklad", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).click();
  await page.getByRole("link", { name: "Náklady a úvěry", exact: true }).click();
  const costs = page.locator("#naklady");
  await costs.getByText("Přidat náklad", { exact: true }).click();
  await costs.getByLabel("Název *").fill("Výměna baterie v bytě");
  await costs.getByLabel("Částka v Kč *").fill("3200");
  await costs.getByLabel("Stav *").selectOption("ACTUAL");
  await costs.getByLabel("Rozsah nákladu").selectOption({ label: "Jednotka 1.01" });
  await costs.getByLabel("Dodavatel").fill("Instalatérství Demo");
  await costs.getByLabel("Číslo dokladu").fill("FV-2026-UNIT-01");
  await costs.getByRole("button", { name: "Uložit náklad", exact: true }).click();
  await expect(page.getByText("Náklad byl přidán do asset finance.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Výměna baterie v bytě", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Výměna baterie v bytě", exact: true })).toBeVisible();
  await expect(page.getByText("Účetní kontext", { exact: true })).toBeVisible();
  await expect(page.getByText("Jednotka 1.01", { exact: true })).toBeVisible();
  await expect(page.getByText("FV-2026-UNIT-01", { exact: true })).toBeVisible();
  await expect(page.getByText("Účetní podklady", { exact: true })).toBeVisible();
  assertNoBrowserFailures();
});

test("správce rozdělí společný náklad mezi více jednotek", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).click();
  await page.getByRole("link", { name: "Náklady a úvěry", exact: true }).click();
  await page.getByRole("link", { name: "Servis výtahu", exact: true }).click();
  const allocation = page.getByTestId("cost-allocation");
  await expect(allocation.getByRole("heading", { name: "Rozdělení nákladu na jednotky", exact: true })).toBeVisible();
  await allocation.getByLabel("Jednotka 1.01 (%)", { exact: true }).fill("60");
  await allocation.getByLabel("Jednotka 2.02 (%)", { exact: true }).fill("40");
  await allocation.getByRole("button", { name: "Uložit vlastní rozdělení", exact: true }).click();
  await expect(page.getByText("Náklad byl rozdělen mezi 2 jednotky.", { exact: true })).toBeVisible();
  const firstUnit = allocation.getByRole("row").filter({ hasText: "1.01" });
  const secondUnit = allocation.getByRole("row").filter({ hasText: "2.02" });
  await expect(firstUnit).toContainText("60 %");
  await expect(firstUnit).toContainText("11 100 Kč");
  await expect(secondUnit).toContainText("40 %");
  await expect(secondUnit).toContainText("7 400 Kč");
  await allocation.getByRole("button", { name: "Rozdělit rovnoměrně", exact: true }).click();
  await expect(page.getByText("Náklad byl rozdělen mezi 5 jednotek.", { exact: true })).toBeVisible();
  await expect(allocation.getByText("20 %", { exact: true })).toHaveCount(5);
  assertNoBrowserFailures();
});

test("správce zapíše nové ocenění pro asset KPI", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).click();
  await page.getByRole("link", { name: "Náklady a úvěry", exact: true }).click();
  const valuations = page.locator("#oceneni");
  await expect(valuations).toContainText("25 000 000 Kč");
  await valuations.getByText("Zapsat ocenění", { exact: true }).click();
  await valuations.getByLabel("Tržní hodnota v Kč *").fill("26000000");
  await valuations.getByLabel("Zdroj *").selectOption("EXTERNAL");
  await valuations.getByLabel("Poznámka / podklad").fill("Aktualizovaný externí posudek");
  await valuations.getByRole("button", { name: "Uložit ocenění do historie", exact: true }).click();
  await expect(page.getByText("Nové ocenění bylo uloženo do historie.", { exact: true })).toBeVisible();
  await expect(valuations).toContainText("26 000 000 Kč");
  await expect(valuations).toContainText("Externí posudek");
  await expect(valuations).toContainText("Aktualizovaný externí posudek");
  assertNoBrowserFailures();
});

test("hlavička nemovitosti drží strukturu na desktopu i mobilu", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).click();

  const header = page.getByTestId("property-header");
  const identity = page.getByTestId("property-header-identity");
  const summary = page.getByTestId("property-header-summary");
  const side = header.locator(".property-header-side");
  const assertInsideWithoutOverlap = async () => {
    const [headerBox, identityBox, summaryBox, sideBox] = await Promise.all([
      header.boundingBox(), identity.boundingBox(), summary.boundingBox(), side.boundingBox(),
    ]);
    for (const box of [headerBox, identityBox, summaryBox, sideBox]) expect(box).not.toBeNull();
    expect(identityBox!.x).toBeGreaterThanOrEqual(headerBox!.x);
    expect(summaryBox!.x + summaryBox!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width + 1);
    expect(sideBox!.x + sideBox!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width + 1);
    const overlaps = (a: NonNullable<typeof identityBox>, b: NonNullable<typeof identityBox>) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    expect(overlaps(identityBox!, summaryBox!)).toBeFalsy();
    expect(overlaps(summaryBox!, sideBox!)).toBeFalsy();
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(header).toBeVisible();
  await expect(header.getByText(/ID nemovitosti: P\d{4}/)).toBeVisible();
  await assertInsideWithoutOverlap();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(header).toBeVisible();
  await expect(header.getByRole("heading", { name: "Moskevská", exact: true })).toBeVisible();
  await assertInsideWithoutOverlap();
  expect(await header.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
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

test("detail smlouvy má čitelný finanční cockpit a životní akce", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.goto("/smlouvy");
  await page.getByRole("link", { name: /Jan Novák/ }).first().click();
  const cockpit = page.locator(".contract-cockpit");
  await expect(cockpit).toBeVisible();
  await expect(cockpit.getByRole("heading", { name: /Finance ·/ })).toBeVisible();
  await expect(cockpit).toContainText("Nájemné");
  await expect(cockpit).toContainText("Zálohy na služby");
  await expect(cockpit).toContainText("Celkem měsíčně");
  await expect(cockpit).toContainText("Aktuální úhrada");
  const actions = page.locator(".lease-action-bar");
  await expect(actions.getByRole("link", { name: "Předpisy", exact: true })).toBeVisible();
  await expect(actions.getByRole("link", { name: "Ukončit vztah", exact: true })).toBeVisible();
  assertNoBrowserFailures();
});

test("správce přidá dalšího smluvního partnera a vztah zůstane čitelný", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  await login(page);
  await page.goto("/smlouvy");
  const leaseLink = page.getByRole("link", { name: /Jan Novák/ }).first();
  const leaseUrl = await leaseLink.getAttribute("href");
  expect(leaseUrl).toMatch(/^\/smlouvy\//);
  await leaseLink.click();
  await expect(page).toHaveURL(new RegExp(`${leaseUrl}$`));
  await page.getByRole("link", { name: "Upravit smlouvu", exact: true }).click();
  const partyPicker = page.getByRole("group", { name: "Další smluvní partneři" });
  await expect(partyPicker).toBeVisible();
  const secondParty = partyPicker.locator("label").filter({ hasText: "Petra Malá" }).first();
  await secondParty.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await page.goto(leaseUrl!);
  const parties = page.locator(".lease-party-summary");
  await expect(parties.getByRole("link", { name: /Jan Novák/ })).toBeVisible();
  await expect(parties.getByRole("link", { name: "Petra Malá", exact: true })).toBeVisible();
  assertNoBrowserFailures();
});

test("nájemné a služby jsou shodné v reportu, smlouvách, nájemníkovi a jednotce", async ({ page }) => {
  const assertNoBrowserFailures = watchBrowserFailures(page);
  const rent = /11\s*500\s*Kč/;
  const services = /2\s*500\s*Kč/;
  const recurringTotal = /14\s*000\s*Kč/;
  await login(page);

  await page.goto("/reporty?view=tenancy");
  const tenancyRow = page.getByRole("row").filter({ hasText: "Jan Novák" }).filter({ hasText: "Moskevská" }).first();
  await expect(tenancyRow).toBeVisible();
  await expect(tenancyRow).toContainText(rent);
  await expect(tenancyRow).toContainText(services);

  await page.goto("/smlouvy");
  const contractRow = page.getByRole("row").filter({ hasText: "Jan Novák" }).filter({ hasText: "Moskevská" }).first();
  await expect(contractRow).toBeVisible();
  await expect(contractRow).toContainText(rent);
  await expect(contractRow).toContainText(services);

  await page.goto("/najemnici");
  const tenantRegistryRow = page.getByRole("row").filter({ hasText: "Jan Novák" }).filter({ hasText: "Moskevská" }).first();
  await tenantRegistryRow.getByRole("link", { name: "Jan Novák", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jan Novák", exact: true })).toBeVisible();
  const tenantLeaseRow = page.getByRole("row").filter({ hasText: "Moskevská" }).first();
  await expect(tenantLeaseRow).toContainText(rent);

  await page.goto("/portfolio");
  await page.locator("a.property-cell").filter({ hasText: "Moskevská" }).click();
  await page.getByRole("link", { name: "Jednotky", exact: true }).click();
  await page.getByRole("link", { name: /1\.01/ }).first().click();
  const currentChargeCard = page.getByText("Aktuální předpis", { exact: true }).locator("..");
  await expect(currentChargeCard).toContainText(recurringTotal);
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
