import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "../helpers";
import { settle } from "../heritage/settle";

/** UX regressions found in the cross-app audit (docs/review/ux-audit.md), on a phone. */

const skipWelcome = (page: Page) => page.addInitScript(() => localStorage.setItem("say.welcomed", "1"));
const lang = (page: Page, l: "en" | "ar") => page.context().addCookies([{ name: "lang", value: l, url: test.info().project.use.baseURL! }]);

async function height(page: Page, loc: ReturnType<Page["locator"]>) {
  const box = await loc.boundingBox();
  expect(box, "element is laid out").not.toBeNull();
  return box!.height;
}

test.beforeEach(async ({ page }) => skipWelcome(page));

test("touch targets: header controls, inscription tabs and heritage item actions are at least 44px", async ({ page }) => {
  await page.goto("/inscription");
  expect(await height(page, page.getByRole("button", { name: "العربية" }))).toBeGreaterThanOrEqual(44);
  expect(await height(page, page.getByRole("link", { name: "Home" }).first())).toBeGreaterThanOrEqual(44);
  for (const tab of await page.getByRole("tab").all()) expect(await height(page, tab)).toBeGreaterThanOrEqual(44);

  await page.goto("/heritage/item/LMP-3");
  // these two once collapsed to 24px (flex-1 inside a column)
  expect(await height(page, page.getByRole("link", { name: "Ask about this object" }))).toBeGreaterThanOrEqual(44);
  expect(await height(page, page.getByRole("link", { name: "Talk to a person" }))).toBeGreaterThanOrEqual(44);
});

test("an unknown concept keeps the app shell and offers next steps", async ({ page }) => {
  await page.goto("/c/does-not-exist");
  await expect(page.getByRole("heading", { level: 1, name: "We couldn't find that page" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Signs Around You" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Choose what you see" })).toHaveAttribute("href", "/snap?pick=1");
  await expect(page).toHaveTitle(/couldn't find/);
  await expectAccessible(page);
});

test("an unmatched URL gets the branded 404 with ways back", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1, name: "We couldn't find that page" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ask a question" })).toHaveAttribute("href", "/ask");
  await expectAccessible(page);
});

test("the (demo) honesty label on a card's approval badge is never cut off", async ({ page }) => {
  await page.goto("/c/moon");
  const badge = page.locator("article header .line-clamp-2", { hasText: "(demo)" }).first();
  await expect(badge).toHaveText(/^Approved card · .*\(demo\)$/);
  await expect(badge).toBeVisible();
  const clipped = await badge.evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  expect(clipped).toBe(false);
});

test("Arabic: generated-image credit is in Arabic and relative times use Arabic-Indic digits", async ({ page }) => {
  await lang(page, "ar");
  await page.goto("/heritage/item/LMP-3");
  await expect(page.getByText("رسم توضيحي مولَّد — وليس صورة القطعة نفسها")).toBeVisible();
  await expect(page.getByText("Generated illustration — not the actual object")).toHaveCount(0);
  await page.goto("/");
  const recent = page.locator("section[aria-labelledby=recent-h]");
  await expect(recent).toBeVisible();
  expect(await recent.innerText()).not.toMatch(/قبل \d/);
});

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });
  for (const path of ["/", "/c/moon", "/ask", "/heritage", "/heritage/item/LMP-3", "/talk"]) {
    test(`axe in dark mode: ${path}`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      await expectAccessible(page);
    });
  }
});
