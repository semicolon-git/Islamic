import { expect, test } from "@playwright/test";
import { expectAccessible, setLang } from "../helpers";

test("Muslim science: instruments, honest origin, museums, stars → Sky", async ({ page }) => {
  await page.goto("/science");
  await expect(page.getByRole("heading", { level: 1, name: "From Muslim science" })).toBeVisible();
  await expect(page.locator("[data-scientist]")).toHaveCount(25);
  await expectAccessible(page);
  await page.locator('[data-instrument="astrolabe"]').click();
  await expect(page).toHaveURL(/\/science\/instrument\/astrolabe$/);
  await expect(page.getByTestId("instrument-origin")).toContainText(/Hellenistic|Greek/);
  await expect(page.getByTestId("holdings").locator("li")).toHaveCount(6);
  await page.getByText(/^Show all \d+/).click();
  await expect(page.getByRole("link", { name: "Museum page" }).nth(6)).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "Vega" }).click();
  await expect(page).toHaveURL(/\/sky\/star\/vega$/);
});

test("a concept page shows its Muslim-science link and Sky mode", async ({ page }) => {
  await page.goto("/c/stars");
  await expect(page.getByTestId("concept-science")).toContainText("al-Sufi");
  await expect(page.getByTestId("concept-sky")).toBeVisible();
  await page.goto("/?welcome=0");
  await expect(page.getByTestId("home-science")).toBeVisible();
});

test("scholar page in Arabic", async ({ page }) => {
  await page.goto("/");
  await setLang(page, "ar");
  await page.goto("/science/scientist/al-sufi");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("الصوفي");
  await expect(page.getByText("المصادر")).toBeVisible();
  await expectAccessible(page);
});

test("unknown entries 404", async ({ page }) => {
  expect((await page.goto("/science/instrument/nope"))?.status()).toBe(404);
  expect((await page.goto("/science/planet/mars"))?.status()).toBe(404);
});
