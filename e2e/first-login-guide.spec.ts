import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { guideOriginMatches } from "../lib/guide-origin";
import { prisma } from "../lib/db";
import { hashInvitationToken } from "../lib/invitations";
import { guideTransition, guideSteps, normalizeGuideState, type GuideState } from "../lib/first-login-guide";

const password = "Guide-E2E-Only-Password-2026";
test.setTimeout(90_000);
const createdEmails: string[] = [];
test.afterEach(async () => {
  // Keep this suite isolated from reporting/team selectors in subsequent tests.
  if (createdEmails.length) await prisma.user.updateMany({ where: { email: { in: createdEmails.splice(0) } }, data: { active: false } });
});
test.beforeAll(() => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Isolated DB required");
});
test.afterAll(async () => prisma.$disconnect());
async function fixture(status = "pending", role: "OWNER_VIEWER" | "MANAGER" = "OWNER_VIEWER") {
  const email = `guide-${randomUUID()}@example.invalid`;
  createdEmails.push(email);
  return prisma.user.create({ data: { name: "První přihlášení", email, passwordHash: await bcrypt.hash(password, 4), role, isTestIdentity: true, onboardingStatus: status } });
}
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Heslo", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio/);
}
async function state(page: Page) {
  return page.evaluate(async () => (await (await fetch("/api/account/guide")).json()).state as GuideState);
}
async function post(page: Page, body: Record<string, unknown>) {
  return page.evaluate(async body => {
    const response = await fetch("/api/account/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, body);
}

test("průvodce: přechody, role a neznámá verze", () => {
  const previousAppUrl = process.env.APP_URL, previousRenderUrl = process.env.RENDER_EXTERNAL_URL;
  try {
    delete process.env.APP_URL;
    process.env.RENDER_EXTERNAL_URL = "https://guide-sandbox.onrender.com";
    const proxied = (origin: string) => new Request("http://localhost:10000/api/account/guide", { headers: { origin } });
    expect(guideOriginMatches(proxied("https://guide-sandbox.onrender.com"))).toBe(true);
    expect(guideOriginMatches(proxied("https://foreign.example.invalid"))).toBe(false);
    process.env.APP_URL = "https://app.example.invalid/";
    expect(guideOriginMatches(proxied("https://app.example.invalid"))).toBe(true);
    expect(guideOriginMatches(proxied("https://guide-sandbox.onrender.com"))).toBe(false);
  } finally {
    if (previousAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousAppUrl;
    if (previousRenderUrl === undefined) delete process.env.RENDER_EXTERNAL_URL; else process.env.RENDER_EXTERNAL_URL = previousRenderUrl;
  }
  const initial: GuideState = { status: "pending", step: "welcome", revision: 0, version: 1 };
  expect(guideTransition(initial, "back")).toBeNull();
  expect(guideTransition({ ...initial, status: "completed" }, "next")).toBeNull();
  expect(guideTransition({ ...initial, status: "active", step: "help" }, "next")?.status).toBe("completed");
  expect(guideTransition({ ...initial, status: "paused", step: "tasks" }, "resume")?.step).toBe("tasks");
  expect(normalizeGuideState({ onboardingStatus: "completed", onboardingStep: "unknown", onboardingVersion: 99, onboardingRevision: 4 })).toMatchObject({ status: "available", step: "welcome" });
  expect(guideSteps({ hasProperties: false, canAddProperty: false, canAddTask: false })[4].target).toBe('[data-guide="tasks"]');
  expect(guideSteps({ hasProperties: true, canAddProperty: true, canAddTask: true })[1].body).not.toContain("první dům");
});

test("potvrzená registrace otevře portfolio s prvním krokem bez vytvoření domu", async ({ page }) => {
  const token = randomBytes(32).toString("base64url");
  const email = `registration-guide-${randomUUID()}@example.invalid`;
  createdEmails.push(email);
  await prisma.registrationRequest.create({ data: { email, name: "Nový vlastník", passwordHash: await bcrypt.hash(password, 4), tokenHash: hashInvitationToken(token), expiresAt: new Date(Date.now() + 60_000) } });
  await page.goto(`/registrace/potvrdit/${token}`);
  await page.getByRole("button", { name: "Potvrdit registraci" }).click();
  await expect(page).toHaveURL(/\/portfolio/);
  await expect(page.getByRole("dialog", { name: "Vítejte ve FlatBerry" })).toBeVisible();
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { personalOwner: true } });
  expect(user.onboardingStatus).toBe("pending");
  expect(await prisma.property.count({ where: { ownerId: user.personalOwner!.id } })).toBe(0);
  await page.getByRole("button", { name: "Pojďme na to" }).click();
  await expect(page.getByRole("dialog", { name: "Začněte první nemovitostí" })).toBeVisible();
  await expect(page.getByTestId("guide-spotlight")).toBeVisible();
  // The actual highlighted control remains operable; browsing away doesn't lose progress.
  await page.locator('[data-guide="add-property"]').click();
  await expect(page).toHaveURL(/\/nemovitosti\/nova/);
  await expect(page.getByTestId("first-login-guide")).toHaveCount(0);
  expect((await state(page)).step).toBe("properties");
});

test("odložení, reload, jiné zařízení, zpět a dokončení bez opakování", async ({ browser }, info) => {
  const user = await fixture();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(page, user.email);
  await expect(page.getByRole("dialog", { name: "Vítejte ve FlatBerry" })).toBeVisible();
  await expect.poll(() => page.locator(".guide-character").evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("guide-desktop-light.png") });
  await page.getByRole("button", { name: "Pojďme na to" }).click();
  await expect(page.locator("#guide-title")).toContainText("první nemovitostí");
  await page.getByRole("button", { name: "Později", exact: true }).click();
  await page.reload();
  await expect(page.getByTestId("first-login-guide")).toHaveCount(0);
  expect((await state(page)).status).toBe("paused");
  const other = await browser.newPage();
  await login(other, user.email);
  await other.getByRole("button", { name: "Pokračovat v prohlídce" }).click();
  await expect(other.locator("#guide-title")).toContainText("první nemovitostí");
  await other.getByRole("button", { name: "Zpět", exact: true }).click();
  await expect(other.locator("#guide-title")).toHaveText("Vítejte ve FlatBerry");
  await other.getByRole("button", { name: "Pojďme na to" }).click();
  for (const heading of ["Smlouvy a nájemníci pohromadě", "Mějte přehled o penězích", "Úkoly a týmová komunikace", "Upozornění podle vašich potřeb", "Když si nebudete jistí, jsem nablízku"]) {
    await other.getByRole("button", { name: "Další", exact: true }).click();
    await expect(other.locator("#guide-title")).toHaveText(heading);
    await expect(other.getByTestId("guide-spotlight")).toBeVisible();
  }
  await other.getByRole("button", { name: "Dokončit prohlídku" }).click();
  await expect(other.getByTestId("first-login-guide")).toHaveCount(0);
  await other.goto("/portfolio");
  await expect(other.getByTestId("first-login-guide")).toHaveCount(0);
  expect((await state(other)).status).toBe("completed");
  await page.close(); await other.close();
});

test("ukončení, ruční restart, mobil, tmavý režim, klávesnice a omezený pohyb", async ({ page }, info) => {
  const user = await fixture("available", "MANAGER");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page, user.email);
  await expect(page.getByTestId("first-login-guide")).toHaveCount(0);
  await page.goto("/ucet");
  await page.getByRole("button", { name: "Tmavý režim", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Průvodce aplikací", exact: true }).click();
  await expect(page.locator("#guide-title")).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bubble = page.locator(".guide-bubble");
  expect(await bubble.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(24, 39, 64)");
  const b = await bubble.boundingBox();
  expect(b!.x).toBeGreaterThanOrEqual(0); expect(b!.x + b!.width).toBeLessThanOrEqual(390); expect(b!.y).toBeGreaterThanOrEqual(0); expect(b!.y + b!.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("guide-mobile-dark.png") });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Odložit průvodce" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("first-login-guide")).toHaveCount(0);
  await page.getByRole("button", { name: "Pokračovat v prohlídce" }).click();
  await page.getByRole("button", { name: "Ukončit průvodce", exact: true }).click();
  await page.reload();
  expect((await state(page)).status).toBe("dismissed");
  await expect(page.getByTestId("first-login-guide")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pokračovat v prohlídce" })).toHaveCount(0);
});

test("chybějící cíl a chyba uložení průvodce nezablokují aplikaci", async ({ page }) => {
  const user = await fixture(); await login(page, user.email);
  await expect(page.locator("#guide-title")).toBeVisible();
  await page.locator('[data-guide="portfolio"]').evaluate(el => el.remove());
  await page.locator(".page-title").evaluate(el => el.remove());
  await expect(page.getByText("Tento prvek teď není dostupný.", { exact: false })).toBeVisible();
  await page.route("**/api/account/guide", route => route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Spojení se nezdařilo." }) }) : route.continue());
  await page.getByRole("button", { name: "Později", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Spojení se nezdařilo.");
  await page.getByRole("button", { name: "Zavřít bez uložení" }).click();
  await expect(page.getByTestId("first-login-guide")).toHaveCount(0);
});

test("API průvodce vyžaduje přihlášení a neumožní přepsat cizí ani novější postup", async ({ page, request }) => {
  expect((await request.get("/api/account/guide")).status()).toBe(401);
  const actor = await fixture(), other = await fixture();
  await login(page, actor.email);
  const current = await state(page);
  expect((await page.request.post("/api/account/guide", { headers: { Origin: "https://foreign.example.invalid" }, data: { action: "start", version: 1, revision: current.revision } })).status()).toBe(403);
  expect((await post(page, { action: "start", version: 1, revision: current.revision, userId: other.id })).status).toBe(200);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).onboardingRevision).toBe(0);
  expect((await post(page, { action: "next", version: 1, revision: current.revision })).status).toBe(409);
  expect((await post(page, { action: "next", version: 99, revision: current.revision + 1 })).status).toBe(400);
  expect((await post(page, { action: "hacked", version: 1, revision: 1 })).status).toBe(400);
});

test("bublina a cíl zůstávají oddělené na mobilu i desktopu v obou režimech", async ({ page }, info) => {
  const user = await fixture(); await login(page, user.email);
  for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await expect(page.locator(".guide-character")).toBeVisible();
      await expect.poll(() => page.locator(".guide-character").evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect.poll(async () => {
        const bubble = await page.locator(".guide-bubble").boundingBox(), spot = await page.getByTestId("guide-spotlight").boundingBox();
        const header = await page.locator(".topbar").boundingBox();
        return Boolean(bubble && spot && header && spot.y >= header.y + header.height && spot.y + spot.height < bubble.y);
      }).toBe(true);
      await page.screenshot({ path: info.outputPath(`guide-${size.width}-${theme}.png`) });
    }
  }
});
