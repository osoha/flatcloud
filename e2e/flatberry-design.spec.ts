import { expect, test, type Page } from "@playwright/test";
async function apiHeaders(page: Page) {
  // Browser accepts Secure cookies on loopback; APIRequestContext needs them explicitly on HTTP CI.
  return { Accept: "application/json", Cookie: (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join("; ") };
}
async function login(page: Page, address = process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test") {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(address);
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
  // FB01: smaller 68% SVG frame gives approximately 58% visible building ink.
  expect(ratio).toBeGreaterThanOrEqual(.54); expect(ratio).toBeLessThanOrEqual(.64);
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
  await expect(page.locator(".property-subnav a.active")).toBeInViewport();
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
  await page.getByLabel("Avatar objektu / jednotky").selectOption("icon");
  await page.getByRole("button", { name: "Uložit kartu" }).click();
  await expect(page.getByRole("status")).toContainText("Úprava karty byla uložena");
  await page.goto("/portfolio");
  const changed = page.locator(`.property-row:has(a[href="${href}"])`);
  await expect(changed).toHaveCSS("background-color", "rgb(238, 244, 255)");
  await expect(changed.locator(".favorite-property")).toHaveAttribute("aria-pressed", "true");
  const invalid = await page.request.post(`/api/properties/${propertyId}/appearance`, { headers: await apiHeaders(page), multipart: { photoId: "unauthorized-document" } });
  expect(invalid.status()).toBe(400);
  const wrongUnit = await page.request.post(`/api/properties/${propertyId}/appearance`, { headers: await apiHeaders(page), multipart: { unitId: "unavailable-unit", color: "blue" } });
  expect(wrongUnit.status()).toBe(404);
  const reset = await page.request.post(`/api/properties/${propertyId}/appearance`, { headers: await apiHeaders(page), multipart: { favorite: "false", color: "", photoId: "" } });
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
  const previous = await prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { avatarPhotoId: true, avatarData: true, avatarMimeType: true } });
  const photoBytes = await readFile("public/flatberry-logo.png");
  const asset = await prisma.fileAsset.create({ data: { storageKey: `r31-avatar-test-${Date.now()}.png`, originalName: "R31 isolated photo fixture.png", mimeType: "image/png", sizeBytes: photoBytes.length, sha256: "0".repeat(64), uploadedById: actor.id } });
  const document = await prisma.document.create({ data: { propertyId, fileAssetId: asset.id, category: "PHOTO", title: "R31 isolated avatar fixture", createdById: actor.id } });
  const imageUrl = `**/api/documents/${document.id}/download?variant=thumbnail`;
  try {
    const save = await page.request.post(`/api/properties/${propertyId}/appearance`, { headers: await apiHeaders(page), multipart: { photoId: document.id } });
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
    await prisma.property.update({ where: { id: propertyId }, data: previous });
    await prisma.document.delete({ where: { id: document.id } });
    await prisma.fileAsset.delete({ where: { id: asset.id } });
  }
});

test("Sdílený avatar domu vidí správce i uživatel s přístupem; osobní barva zůstává oddělená", async ({ page, browser }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "Synthetic users belong only to the isolated local/CI database.");
  const { prisma } = await import("../lib/db");
  const { readFile } = await import("node:fs/promises");
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test" } });
  const property = await prisma.property.findFirstOrThrow({ where: { active: true } });
  const previous = { avatarPhotoId: property.avatarPhotoId, avatarData: property.avatarData, avatarMimeType: property.avatarMimeType };
  const suffix = Date.now();
  const manager = await prisma.user.create({ data: { email: `avatar-manager-${suffix}@example.test`, name: "Správce avataru", passwordHash: admin.passwordHash, role: "PROPERTY_MANAGER", memberships: { create: { propertyId: property.id, permission: "EDIT" } } } });
  const viewer = await prisma.user.create({ data: { email: `avatar-viewer-${suffix}@example.test`, name: "Čtenář avataru", passwordHash: admin.passwordHash, role: "OWNER_VIEWER", allProperties: true, memberships: { create: { propertyId: property.id, permission: "VIEW" } } } });
  const viewerContext = await browser.newContext();
  try {
    await login(page, manager.email);
    const bytes = await readFile("public/flatberry-logo.png");
    const saved = await page.request.post(`/api/properties/${property.id}/appearance`, { headers: await apiHeaders(page), multipart: { photoId: "upload", avatar: { name: "house.png", mimeType: "image/png", buffer: bytes }, color: "blue" } });
    expect(saved.ok()).toBe(true);
    await expect(page.getByRole("link", { name: "Nespárované" })).toBeVisible();
    await page.goto("/platby/nesparovane");
    await expect(page.getByRole("heading", { name: "Platby k řešení" })).toBeVisible();
    await expect(page.getByText("Bankovní notifikace k ručnímu řešení")).toHaveCount(0);
    const viewerPage = await viewerContext.newPage();
    await login(viewerPage, viewer.email);
    await viewerPage.goto(`/nemovitosti/${property.id}/prehled`);
    await expect(viewerPage.locator(".property-header-identity .entity-avatar img")).toBeVisible();
    const forbidden = await viewerPage.request.post(`/api/properties/${property.id}/appearance`, { headers: await apiHeaders(viewerPage), multipart: { photoId: "icon" } });
    expect(forbidden.status()).toBe(400);
    await viewerPage.goto(`/nemovitosti/${property.id}/vzhled`);
    await expect(viewerPage.getByLabel("Avatar objektu / jednotky")).toHaveCount(0);
    await page.goto(`/nemovitosti/${property.id}/vzhled`);
    await expect(page.getByLabel("Barva karty v přehledu")).toHaveValue("blue");
    await expect(viewerPage.getByLabel("Barva karty v přehledu")).toHaveValue("");
  } finally {
    await viewerContext.close();
    await prisma.property.update({ where: { id: property.id }, data: previous });
    await prisma.user.delete({ where: { id: manager.id } });
    await prisma.user.delete({ where: { id: viewer.id } });
  }
});

test("PDF větší než 10 MB projde proxy celý do dokumentové trasy", async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "Only the isolated CI instance has deliberately disabled file storage.");
  await login(page);
  const content = Buffer.alloc(11_500_000, 0x20);
  content.write("%PDF-1.7", 0, "ascii");
  const response = await page.request.post("/api/documents/upload", { headers: await apiHeaders(page), multipart: { files: { name: "contract.pdf", mimeType: "application/pdf", buffer: content }, propertyId: "test", returnTo: "/dokumenty" }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(decodeURIComponent(response.headers()["location"] || "")).toContain("Úložiště souborů není nakonfigurováno");
});
