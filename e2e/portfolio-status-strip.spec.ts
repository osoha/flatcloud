import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";

test.beforeAll(() => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Isolated DB required");
});
test.afterAll(() => prisma.$disconnect());

test("portfolio status collapses persistently and attention uses wide and mobile layouts", async ({ page }, testInfo) => {
  const email = process.env.E2E_ADMIN_EMAIL || "e2e.admin@flatcloud.test";
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.task.createMany({ data: Array.from({ length: 4 }, (_, i) => ({ title: `Portfolio strip ${randomUUID()} ${i}`, category: "GENERAL" as const, priority: "URGENT" as const, createdById: user.id, assigneeId: user.id })) });
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Heslo", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD || "FlatCloud-E2E-Only-Password-2026");
  await page.getByRole("button", { name: "Přihlásit se", exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio/);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const strip = page.getByRole("region", { name: "Stav portfolia", exact: true });
  const metrics = strip.locator("dl");
  await expect(metrics.locator("dd")).toHaveCount(7);
  const attention = page.locator(".portfolio-attention-card");
  const sb = (await strip.boundingBox())!, ab = (await attention.boundingBox())!;
  expect(sb.y + sb.height).toBeLessThanOrEqual(ab.y);
  expect(Math.abs(sb.width - ab.width)).toBeLessThan(2);
  const list = attention.locator(".portfolio-attention-list");
  await expect(list).toHaveClass(/is-multicolumn/);
  expect(await list.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(2);
  await strip.getByRole("button", { name: "Sbalit", exact: true }).click();
  await expect(metrics).toBeHidden();
  expect((await strip.boundingBox())!.height).toBeLessThan(sb.height);
  await page.reload();
  await expect(strip.getByRole("button", { name: "Rozbalit", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(metrics).toBeHidden();
  await strip.getByRole("button", { name: "Rozbalit", exact: true }).press("Enter");
  await expect(metrics).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("portfolio-wide.png"), fullPage: true });
  await page.getByRole("button", { name: "Tmavý režim", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: testInfo.outputPath("portfolio-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await list.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("portfolio-mobile.png"), fullPage: true });
});
