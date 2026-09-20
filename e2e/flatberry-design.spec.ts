import { expect, test, type Page } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test");
  await page.getByLabel("Heslo", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page.getByRole("heading", { name: "Portfolio", exact: true })).toBeVisible();
}
test("Flatberry: logo drží velikost, záložky jednu řadu a ikony viditelnou kresbu", async ({ page }) => {
  await login(page);
  for (const width of [1920, 1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    const bitmap = page.locator(".flatberry-home .flatberry-brand-bitmap");
    const before = await bitmap.evaluate(el => ({ size: getComputedStyle(el).backgroundSize, position: getComputedStyle(el).backgroundPosition, height: el.getBoundingClientRect().height }));
    const collapse = page.getByRole("button", { name: "Sbalit levé menu" });
    const buttonBox = await collapse.boundingBox(), sideBox = await page.locator(".sidebar").boundingBox();
    expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(sideBox!.x + sideBox!.width);
    await collapse.click();
    const expand = page.getByRole("button", { name: "Rozbalit levé menu" });
    await expect(expand).toBeFocused();
    const after = await expand.locator(".flatberry-brand-bitmap").evaluate(el => ({ size: getComputedStyle(el).backgroundSize, position: getComputedStyle(el).backgroundPosition, height: el.getBoundingClientRect().height }));
    expect(after).toEqual(before);
    await expect(page.locator(".sidebar-collapse-toggle")).toBeHidden();
    await expand.click();
    await expect(collapse).toBeFocused();
  }
  const glyph = page.locator(".entity-avatar-glyph").first();
  const ratio = await glyph.evaluate(svg => {
    const ink = (svg as SVGGraphicsElement).getBBox();
    const box = svg.getBoundingClientRect(), tile = svg.parentElement!.getBoundingClientRect();
    return Math.max(ink.width * box.width / 24, ink.height * box.height / 24) / Math.min(tile.width, tile.height);
  });
  expect(ratio).toBeGreaterThanOrEqual(.60); expect(ratio).toBeLessThanOrEqual(.76);
  const titleRatio = await page.locator("h1 .flatberry-heading-icon").evaluate(svg => {
    const h1 = svg.closest("h1")!, style = getComputedStyle(h1), canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!; ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const cap = ctx.measureText("P").actualBoundingBoxAscent;
    return (svg as SVGGraphicsElement).getBBox().height * svg.getBoundingClientRect().height / 24 / cap;
  });
  expect(titleRatio).toBeGreaterThan(.85); expect(titleRatio).toBeLessThan(1.2);
  await page.locator('a.property-cell[href$="/prehled"]').first().click();
  const tabs = page.locator(".property-subnav");
  await expect(tabs).toHaveCSS("flex-wrap", "nowrap");
  await expect(tabs).toHaveCSS("overflow-x", "auto");
  await expect(tabs.locator("a.active")).toHaveCSS("background-color", "rgb(36, 104, 239)");
  await tabs.getByRole("link", { name: "Nastavení", exact: true }).click();
  await expect(page).toHaveURL(/\/nastaveni$/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Flatberry: hvězdička řadí nahoru, barva patří do vzhledu a ukládá se odděleně", async ({ page }) => {
  await login(page);
  await expect(page.locator(".property-highlight-select")).toHaveCount(0);
  const row = page.locator(".property-row:not(.archived-property-row)").last();
  const href = await row.locator("a.property-cell").getAttribute("href");
  const propertyId = href!.split("/")[2];
  const star = row.locator(".favorite-property");
  if (await star.getAttribute("aria-pressed") === "true") { await star.click(); await expect(star).toHaveAttribute("aria-pressed", "false"); }
  await star.click();
  await expect(page.locator(".property-row").first().locator("a.property-cell")).toHaveAttribute("href", href!);
  await page.reload();
  await expect(page.locator(".property-row").first().locator(".favorite-property")).toHaveAttribute("aria-pressed", "true");
  await page.goto(`/nemovitosti/${propertyId}/vzhled`);
  await page.getByLabel("Barva karty v přehledu").selectOption("blue");
  await page.getByLabel("Fotografie / avatar").selectOption("icon");
  await page.getByRole("button", { name: "Uložit vzhled" }).click();
  await expect(page.getByRole("status")).toContainText("Váš vzhled byl uložen");
  await page.goto("/portfolio");
  const changed = page.locator(`.property-row:has(a[href="${href}"])`);
  await expect(changed).toHaveCSS("background-color", "rgb(238, 244, 255)");
  await expect(changed.locator(".favorite-property")).toHaveAttribute("aria-pressed", "true");
  const invalid = await page.request.post(`/api/properties/${propertyId}/appearance`, { headers: { Accept: "application/json" }, multipart: { photoId: "unauthorized-document" } });
  expect(invalid.status()).toBe(400);
  const wrongUnit = await page.request.post(`/api/properties/${propertyId}/appearance`, { headers: { Accept: "application/json" }, multipart: { unitId: "unavailable-unit", color: "blue" } });
  expect(wrongUnit.status()).toBe(404);
  const reset = await page.request.post(`/api/properties/${propertyId}/appearance`, { headers: { Accept: "application/json" }, multipart: { favorite: "false", color: "", photoId: "" } });
  expect(reset.ok()).toBe(true);
});

test("Flatberry: dostupná fotografie se načte a její chyba přejde na velký obecný avatar", async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "Synthetic photo metadata belongs only to the isolated local/CI database.");
  const { prisma } = await import("../lib/db");
  const { readFile } = await import("node:fs/promises");
  await login(page);
  const href = await page.locator('a.property-cell[href$="/prehled"]').first().getAttribute("href");
  const propertyId = href!.split("/")[2];
  const actor = await prisma.user.findUniqueOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test" } });
  const entityKey = `property:${propertyId}`;
  const previous = await prisma.userEntityAppearance.findUnique({ where: { userId_entityKey: { userId: actor.id, entityKey } } });
  const photoBytes = await readFile("public/flatberry-logo.png");
  const asset = await prisma.fileAsset.create({ data: { storageKey: `r31-avatar-test-${Date.now()}.png`, originalName: "R31 isolated photo fixture.png", mimeType: "image/png", sizeBytes: photoBytes.length, sha256: "0".repeat(64), uploadedById: actor.id } });
  const document = await prisma.document.create({ data: { propertyId, fileAssetId: asset.id, category: "PHOTO", title: "R31 isolated avatar fixture", createdById: actor.id } });
  const imageUrl = `**/api/documents/${document.id}/download?variant=thumbnail`;
  try {
    const save = await page.request.post(`/api/properties/${propertyId}/appearance`, { headers: { Accept: "application/json" }, multipart: { photoId: document.id } });
    expect(save.ok()).toBe(true);
    await page.route(imageUrl, route => route.fulfill({ status: 200, contentType: "image/png", body: photoBytes }));
    await page.goto(href!);
    const image = page.locator(".property-header-identity .entity-avatar img");
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(image).toHaveCSS("object-fit", "cover");
    await page.unroute(imageUrl);
    await page.route(imageUrl, route => route.fulfill({ status: 404, body: "Unavailable" }));
    await page.reload();
    await expect(page.locator(".property-header-identity .entity-avatar-glyph")).toBeVisible();
    await expect(image).toHaveCount(0);
  } finally {
    if (previous) await prisma.userEntityAppearance.update({ where: { id: previous.id }, data: { photoId: previous.photoId } });
    else await prisma.userEntityAppearance.deleteMany({ where: { userId: actor.id, entityKey } });
    await prisma.document.delete({ where: { id: document.id } });
    await prisma.fileAsset.delete({ where: { id: asset.id } });
  }
});
