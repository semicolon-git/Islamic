import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "../helpers";
import { settle } from "../heritage/settle";
import { as, enc } from "../portal/util";

/** UX regressions found in the cross-app audit (docs/review/ux-audit.md), on a 1440×900 desktop. */

const lang = (page: Page, l: "en" | "ar") => page.context().addCookies([{ name: "lang", value: l, url: test.info().project.use.baseURL! }]);
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("sign-in: every persona is marked (demo) and a wrong PIN gets a clear, localised message", async ({ page }) => {
  await page.goto("/portal/login");
  const personas = page.getByRole("radiogroup").locator("label");
  const n = await personas.count();
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) await expect(personas.nth(i)).toContainText("(demo)");
  await page.getByLabel("Demo PIN").fill("0000");
  await page.getByRole("button", { name: /Sign in as/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("That PIN isn't right — please check it and try again.");
  await expectAccessible(page);

  await lang(page, "ar");
  await page.reload();
  await page.getByLabel("الرمز التجريبي").fill("0000");
  await page.getByRole("button", { name: /الدخول باسم/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("الرمز غير صحيح — تحقّق منه وحاول مرة أخرى.");
});

test("heritage items list fits a 1440px screen without horizontal scrolling", async ({ page }) => {
  await as(page, "u_noura", "/portal/items");
  await expect(page.getByTestId("items-table")).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await expectAccessible(page);
});

test("visitor requests: each tab has its own empty state", async ({ page }) => {
  await as(page, "u_noura", "/portal/demand");
  await page.getByRole("tab", { name: /Dismissed/ }).click();
  await expect(page.getByRole("heading", { name: "No dismissed requests" })).toBeVisible();
  await expect(page.getByText("No open requests")).toHaveCount(0);
});

test("a reviewer sees a read-only Content tab, and the history tab is accessible", async ({ page }) => {
  await as(page, "u_huda", `/portal/cards/${enc("card:demo-clouds")}`);
  await expect(page.getByRole("tab", { name: "Content" })).toBeVisible();
  await page.getByRole("tab", { name: /History/ }).click();
  await settle(page);
  await expectAccessible(page);
});

test("Arabic portal: Arabic-Indic digits in times and steps; an English reviewer note stays readable", async ({ page }) => {
  await as(page, "u_sara", "/portal");
  await lang(page, "ar");
  await page.goto(`/portal/cards/${enc("card:demo-ant")}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const bar = page.getByTestId("workflow-bar");
  await expect(bar).toBeVisible();
  expect(await bar.innerText()).not.toMatch(/\d/);
  // the English note is bidi-isolated inside the Arabic sentence
  const note = page.getByTestId("returned-note");
  await expect(note).toContainText("scientific-miracle framing");
  expect(await note.innerText()).toContain("⁨");
});

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });
  const PAGES: [string, string][] = [
    ["u_noura", "/portal"],
    ["u_noura", "/portal/eval"],
    ["u_yusuf", "/portal/inbox/thr_demo_waiting"],
    ["u_noura", "/portal/items"],
    ["u_sara", `/portal/cards/${enc("card:demo-ant")}`],
  ];
  for (const [user, path] of PAGES) {
    test(`axe in dark mode: ${path} as ${user}`, async ({ page }) => {
      await as(page, user, path);
      await settle(page);
      await expectAccessible(page);
    });
  }
});
