import { test, expect } from "@playwright/test";

test.describe("Public FlatBerry landing", () => {
  test("guest can browse the landing, expand FAQ, and reach legal information", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Profesionální správa.",
    );
    await expect(page.locator('header img[alt="Flatberry"]')).toHaveAttribute(
      "src",
      "/landing/logo.webp",
    );
    await expect(page.locator('footer img[alt="Flatberry"]')).toHaveAttribute(
      "src",
      "/landing/logo.webp",
    );
    await expect(page.locator("main section").first()).not.toContainText(
      "Testeři nyní",
    );
    await expect(page.getByRole("button", { name: /Blog/ })).toBeDisabled();
    const question = page
      .locator("#faq details")
      .filter({ hasText: "Musím něco instalovat?" });
    await expect(question.locator("p")).toBeVisible();
    await question.locator("summary").click();
    await expect(question.locator("p")).toBeHidden();
    await question.locator("summary").click();
    await expect(question.locator("p")).toBeVisible();
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    const cta = page
      .getByRole("link", { name: "Vyzkoušet zdarma", exact: true })
      .first();
    await expect(cta).toHaveAttribute(
      "href",
      /^(\/registrace|mailto:info@flatcloud\.cz\?subject=)/,
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
      "text-align",
      "center",
    );
    await expect(
      page.getByRole("heading", {
        name: "Méně dohledávání. Více přehledu.",
        exact: true,
      }),
    ).toHaveCSS("text-align", "center");
    for (const img of await page.locator("img").all()) {
      await img.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          img.evaluate(
            (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: "test-results/landing-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    const compact = await page.locator("#pro-koho").boundingBox();
    expect(compact?.width).toBeLessThanOrEqual(1280);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/landing-wide.png",
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Ochrana osobních údajů", exact: true })
      .click();
    await expect(page).toHaveURL(/\/pravni-informace#osobni-udaje$/);
    await expect(
      page.getByRole("heading", {
        name: "Ochrana osobních údajů",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Kdo je správcem a kdo zpracovatelem",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("article")).toContainText("nájemníků");
    await expect(page.locator("article")).toContainText("fc_session");
  });
  test("mobile navigation and layout stay within the viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByText("Menu", { exact: true }).click();
    await page
      .getByRole("navigation", { name: "Mobilní navigace" })
      .getByRole("link", { name: "Funkce", exact: true })
      .click();
    await expect(page).toHaveURL(/#funkce$/);
    await page.getByText("Menu", { exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const images = page.locator("img");
    for (const img of await images.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect(img).toBeVisible();
      await expect
        .poll(() =>
          img.evaluate(
            (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    await page.screenshot({
      path: "test-results/landing-mobile.png",
      fullPage: true,
    });
  });
});
