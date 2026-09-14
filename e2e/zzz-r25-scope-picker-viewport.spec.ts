import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { R24_ROLE_PASSWORD, R24_ROLE_USERS } from "../prisma/seed-r24-agent-roles";

test("scope picker fits short/mobile viewports and clears all before searching one property", async ({ page }) => {
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local/CI database required");
  const db = new PrismaClient();
  try {
    const actor = await db.user.findUniqueOrThrow({ where: { email: R24_ROLE_USERS.advanced } });
    const properties = [];
    for (let index = 0; index < 16; index++) {
      const owner = await db.owner.create({ data: { name: `R24_AGENT_QA_2026_09 · Scope owner ${index}` } });
      properties.push(await db.property.create({ data: { name: `R24_AGENT_QA_2026_09 · Scope target ${index}`, city: "Praha", address: "Syntetická 25", ownerId: owner.id, memberships: { create: { userId: actor.id, permission: "VIEW" } } } }));
    }
    await page.goto("/login"); await page.getByLabel("E-mail").fill(actor.email); await page.getByLabel("Heslo").fill(process.env.E2E_ROLE_PASSWORD || R24_ROLE_PASSWORD); await page.getByRole("button", { name: "Přihlásit se" }).click(); await expect(page).toHaveURL(/\/portfolio(?:\?|$)/);
    await page.goto("/reporty?view=forecast&horizon=12&scenario=conservative");
    const trigger = page.locator(".scope-picker-trigger"), dialog = page.getByRole("dialog", { name: "Vybrat zobrazené objekty" });
    for (const viewport of [{ width: 900, height: 500 }, { width: 390, height: 640 }]) {
      await page.setViewportSize(viewport); await trigger.click();
      const bounds = await dialog.boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      const apply = dialog.getByRole("button", { name: "Použít výběr", exact: true }); await expect(apply).toBeInViewport();
      await dialog.locator(".scope-picker-scroll").hover(); await page.mouse.wheel(0, 900);
      await expect(dialog).toBeVisible(); await expect(apply).toBeInViewport();
      await dialog.getByRole("button", { name: "Odznačit vše", exact: true }).click();
      await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(0);
      await dialog.getByLabel("Hledat nemovitost nebo vlastníka").fill(properties[0].name);
      await expect(dialog.getByRole("checkbox")).toHaveCount(1); await dialog.getByRole("checkbox").check();
      await dialog.getByRole("button", { name: "Vybrat vše ve správě", exact: true }).click();
      await dialog.getByLabel("Hledat nemovitost nebo vlastníka").fill("");
      expect(await dialog.getByRole("checkbox", { checked: true }).count()).toBeGreaterThanOrEqual(16);
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    }
    await trigger.click(); await dialog.getByRole("button", { name: "Odznačit vše", exact: true }).click();
    await dialog.getByLabel("Hledat nemovitost nebo vlastníka").fill(properties[0].name); await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Použít výběr", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`properties=${properties[0].id}`));
    const params = new URL(page.url()).searchParams; expect(params.get("properties")).toBe(properties[0].id); expect(params.get("view")).toBe("forecast"); expect(params.get("horizon")).toBe("12"); expect(params.get("scenario")).toBe("conservative");
    await trigger.click(); await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(1);
    await dialog.getByRole("button", { name: "Odznačit vše", exact: true }).click(); await dialog.getByRole("button", { name: "Zrušit změny", exact: true }).click();
    await trigger.click(); await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(1);
  } finally { await db.$disconnect(); }
});
