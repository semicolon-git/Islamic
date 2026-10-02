import { expect, test } from "@playwright/test";
import { expectAccessible } from "../helpers";

test.describe("first visit", () => {
  test("home sends a first-time visitor to the welcome, which is skippable", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");
    await expectAccessible(page);
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "The world is full of signs." })).toBeVisible();
    // Remembered: no second redirect.
    await page.goto("/");
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/$/);
  });

  test("walks through the three steps and lands on home", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByRole("radio", { name: "English" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "What this is" })).toBeInViewport();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your privacy, our promise" })).toBeInViewport();
    await page.getByRole("button", { name: "Start exploring" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Point your camera at something" })).toBeVisible();
  });

  test("language choice in the welcome switches the app to Arabic", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("radio", { name: "العربية" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("button", { name: "تخطٍّ" })).toBeVisible();
  });

  test("?welcome=0 never redirects", async ({ page }) => {
    await page.goto("/?welcome=0");
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/\?welcome=0$/);
    await page.goto("/");
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/$/);
  });
});
