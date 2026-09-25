import { test, expect } from "@playwright/test";

test.describe("Public FlatBerry landing", () => {
  test("guest can browse the landing, expand FAQ, and reach legal information", async ({
    page,
  }) => {
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
    await page.screenshot({
      path: "test-results/landing-desktop.png",
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
