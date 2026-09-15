import { expect, test } from "@playwright/test";
import { geocodeCzechAddress, geocodeMatchQuality } from "../lib/reporting/annual-map";

test("R24 geokód rozlišuje textovou shodu a odmítá neplatné body", async () => {
  expect(geocodeMatchQuality("Javorová 10, 602 00 Brno", "Javorová 10, Brno, 60200, Česko")).toContain("Textová shoda");
  expect(geocodeMatchQuality("Javorová 10, 602 00 Brno", "Javorová, jiná obec, 66400")).toContain("Nízká");
  for (const rows of [[], [{ lat: "0", lon: "0" }], [{ lat: "invalid", lon: "16" }], [{ lat: "49", lon: "999" }]]) {
    const fetcher = (async () => Response.json(rows)) as typeof fetch;
    expect(await geocodeCzechAddress("R24 TEST", fetcher)).toBeNull();
  }
  const fetcher = (async () => Response.json([{ lat: "49.195", lon: "16.607", display_name: "Javorová 10, Brno, 60200" }])) as typeof fetch;
  expect(await geocodeCzechAddress("Javorová 10, 602 00 Brno", fetcher)).toMatchObject({ latitude: 49.195, longitude: 16.607, quality: expect.stringContaining("vyžaduje kontrolu") });
  await expect(geocodeCzechAddress("R24 TEST", (async () => new Response("unavailable", { status: 503 })) as typeof fetch)).rejects.toThrow("nedostupná");
});

test("R24 návrh bodu nezapisuje mapu a změna vyžaduje potvrzení", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Heslo").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
  await page.goto("/reporty/kvartalni");
  await page.getByText("Nová reportovací skupina", { exact: true }).click();
  await page.getByLabel("Název").fill("R24_AGENT_QA_2026_09 · geocode review");
  await page.getByLabel("Aktivní skupina").check();
  await page.getByRole("button", { name: "Vytvořit skupinu", exact: true }).click();
  await expect(page).toHaveURL(/\/reporty\/kvartalni\/.+$/);
  const groupId = new URL(page.url()).pathname.split("/")[3];
  await page.getByLabel("Nemovitost").selectOption({ index: 1 });
  await page.getByLabel("Platnost od").fill("2020-01-01");
  await page.getByRole("button", { name: "Přidat interval", exact: true }).click();
  await expect(page.getByText("Interval nemovitosti byl přidán.", { exact: true })).toBeVisible();
  await page.goto(`/reporty/vyrocni/${groupId}`);
  await page.getByLabel("Rok").fill("2026");
  await page.getByRole("button", { name: "Založit výroční report", exact: true }).click();
  await expect(page.getByText("Výroční report byl založen.", { exact: true })).toBeVisible();
  await page.goto(`${new URL(page.url()).pathname}?section=map`);
  const propertyId = await page.locator('input[name="property.0.propertyId"]').inputValue();
  await page.route("**/annual-reports/*/map", async route => {
    if (route.request().postData()?.includes("geocode")) await route.fulfill({ json: { proposals: [{ propertyId, index: 0, address: "R24 TEST", displayName: "Neshodná testovací adresa", latitude: 49.195, longitude: 16.607, quality: "Nízká shoda · TEST" }] } });
    else await route.continue();
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(page.getByLabel("Zeměpisná šířka")).toHaveValue("");
    await page.getByRole("button", { name: "Doplnit chybějící polohy z adres" }).click();
    await expect(page.getByText(/Nízká shoda · TEST/)).toBeVisible();
    await page.getByRole("button", { name: "Použít návrh do formuláře" }).click();
    await expect(page.getByLabel("Zeměpisná šířka")).toHaveValue("49.195");
    if (!attempt) await page.reload();
  }
  await page.getByRole("button", { name: "Uložit mapu", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Změnu polohy potvrďte" })).toBeVisible();
  await expect(page.getByLabel("Zeměpisná šířka")).toHaveValue("");
  await page.getByLabel("Zeměpisná šířka").fill("49.195");
  await page.getByLabel("Zeměpisná délka").fill("16.607");
  await page.getByLabel("Zkontroloval/a jsem polohu změněných bodů").check();
  await page.getByRole("button", { name: "Uložit mapu", exact: true }).click();
  await expect(page.getByText("Mapa portfolia byla uložena.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Zeměpisná šířka")).toHaveValue("49.195");
});
