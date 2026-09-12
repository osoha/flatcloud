import { expect, test } from "@playwright/test";

for (const width of [390, 640]) {
  test(`R24 výběr vztahu a reportová navigace při šířce ${width}px`, async ({ page }) => {
    if (!["localhost", "127.0.0.1"].includes(new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3100").hostname)) throw new Error("R24 responsive gate requires isolated app");
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test");
    await page.getByLabel("Heslo").fill(process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
    await page.getByRole("button", { name: "Přihlásit se" }).click();
    await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
    await page.goto("/platby/nova");
    const search = page.getByLabel("Vyhledat nájemní vztah");
    const select = page.getByLabel("Nájemní vztah / byt *");
    const label = await select.locator("option").nth(1).textContent();
    await search.fill(label!);
    await expect(select.locator("option")).toHaveCount(2);
    await search.press("Tab");
    await expect(select).toBeFocused();
    await select.press("ArrowDown");
    await select.press("Tab");
    await expect(select).not.toHaveValue("");
    const box = await select.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    // Read-only navigation; the payment form is never submitted.
    for (const route of ["/reporty/akcionarske", "/reporty/kvartalni", "/reporty/vyrocni", "/reporty/rocni-checklist", "/reporty/predpisy", "/reporty/saldo"]) {
      await page.goto(route);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.locator('.sidebar a[aria-current="page"]')).toHaveCount(1);
      const active = page.locator('.sidebar a[aria-current="page"]');
      await expect(active).toHaveText(route === "/reporty/predpisy" ? "Předpisy" : route === "/reporty/saldo" ? "Dlužníci" : "Akcionářské reporty");
    }
  });
}
