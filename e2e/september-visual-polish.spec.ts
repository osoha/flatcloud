import { expect, test } from "@playwright/test";

test("formulář úkolu drží záhlaví, pole a výběr souboru pohromadě v obou režimech", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test");
  await page.getByLabel("Heslo", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio/);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/ukoly/novy");
  const pageBody = page.locator(".page.form-page");
  const title = pageBody.locator(":scope > .page-title");
  const form = pageBody.locator(":scope > .edit-form");
  const context = page.locator('select[name="propertyId"]');
  const category = page.locator('select[name="category"]');
  const [titleBox, formBox, contextBox, categoryBox] = await Promise.all([title.boundingBox(), form.boundingBox(), context.boundingBox(), category.boundingBox()]);
  expect(titleBox && formBox && contextBox && categoryBox).toBeTruthy();
  expect(Math.abs(titleBox!.x - formBox!.x)).toBeLessThan(2);
  expect(Math.abs(titleBox!.width - formBox!.width)).toBeLessThan(2);
  expect(Math.abs(contextBox!.y - categoryBox!.y)).toBeLessThan(2);
  const file = page.locator('input[type="file"][name="files"]');
  const fileStyle = await file.evaluate(element => {
    const control = getComputedStyle(element);
    const button = getComputedStyle(element, "::file-selector-button");
    return { width: element.getBoundingClientRect().width, parent: element.parentElement!.getBoundingClientRect().width, radius: button.borderRadius, background: button.backgroundColor, control: control.backgroundColor };
  });
  expect(fileStyle.width).toBeLessThanOrEqual(fileStyle.parent + 1);
  expect(Number.parseFloat(fileStyle.radius)).toBeGreaterThanOrEqual(6);
  expect(fileStyle.background).not.toBe("rgba(0, 0, 0, 0)");

  await page.getByRole("button", { name: "Tmavý režim" }).click();
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(name => name.startsWith("flatberry-display-"));
    if (key) localStorage.setItem(key, JSON.stringify({ theme: "dark", width: "standard" }));
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).not.toHaveAttribute("data-content-width", /standard/);
  expect(await page.evaluate(() => {
    const key = Object.keys(localStorage).find(name => name.startsWith("flatberry-display-"));
    return key ? JSON.parse(localStorage.getItem(key) || "{}").width : undefined;
  })).toBeUndefined();
  await expect(page.getByRole("button", { name: "Široký obsah" })).toHaveCount(0);
  const legend = page.locator(".task-audience legend");
  await expect(legend).toBeVisible();
  expect(await legend.evaluate(element => getComputedStyle(element).color)).toBe("rgb(227, 235, 248)");
  await page.screenshot({ path: testInfo.outputPath("task-dark-layout.png"), fullPage: true });
});
