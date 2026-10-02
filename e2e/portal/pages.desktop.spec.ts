import { expect, test } from "@playwright/test";
import { expectAccessible } from "../helpers";
import { as, enc } from "./util";

const NEXT_TASK: [string, RegExp][] = [
  ["u_sara", /Fix (a|\d+) returned cards?|Continue your draft/],
  ["u_huda", /Review a submission|Review \d+ submissions/],
  ["u_noura", /Publish an approved card|Publish \d+ approved cards/],
  ["u_yusuf", /Answer a waiting visitor|Answer \d+ waiting visitors/],
];

for (const [user, re] of NEXT_TASK) {
  test(`dashboard shows the right next task for ${user}`, async ({ page }) => {
    await as(page, user, "/portal");
    await expect(page.getByRole("heading", { level: 2 }).filter({ hasText: re })).toBeVisible();
    await expect(page.getByTestId("next-task")).toBeVisible();
    await expectAccessible(page);
  });
}

test("student's next task opens the returned card with the reviewer's note", async ({ page }) => {
  await as(page, "u_sara", "/portal");
  await page.getByTestId("next-task").click();
  // One returned card opens directly; several open the filtered list first.
  await page.waitForURL(/stage=returned|card%3A/);
  if (/stage=returned/.test(page.url())) await page.getByRole("link", { name: "The Ant" }).click();
  await expect(page).toHaveURL(/card%3Ademo-ant/);
  await expect(page.getByTestId("returned-note")).toContainText("scientific-miracle framing");
  // the lint flags the same sentence the reviewer did
  await expect(page.getByTestId("lint-warning").first()).toBeVisible();
});

const PAGES: [string, string][] = [
  ["u_huda", "/portal/cards"],
  ["u_huda", `/portal/cards/${enc("card:moon")}`],
  ["u_sara", `/portal/cards/${enc("card:demo-ant")}`],
  ["u_sara", "/portal/cards/new?concept=sun"],
  ["u_noura", "/portal/demand"],
  ["u_yusuf", "/portal/inbox/thr_demo_waiting"],
  ["u_huda", "/portal/people"],
  ["u_sara", "/portal/people"],
];

for (const [user, path] of PAGES) {
  test(`axe: ${path} as ${user}`, async ({ page }) => {
    await as(page, user, path);
    await page.waitForTimeout(600);
    await expectAccessible(page);
  });
}

test("cards list filters by stage and search", async ({ page }) => {
  await as(page, "u_huda", "/portal/cards");
  await page.getByRole("tab", { name: /Returned/ }).click();
  await expect(page).toHaveURL(/stage=returned/);
  await expect(page.getByRole("link", { name: "The Ant" })).toBeVisible();
  await page.getByRole("tab", { name: /^All/ }).click();
  await page.getByRole("searchbox", { name: "Search cards" }).fill("pomegranate");
  await expect(page.getByRole("link", { name: "The Pomegranate" })).toBeVisible();
  await expect(page.getByRole("link", { name: "The Moon" })).toHaveCount(0);
});

test("people page shows students as initials by default", async ({ page }) => {
  await as(page, "u_huda", "/portal/people");
  const names = page.getByTestId("leaderboard").getByTestId("person-name");
  await expect(names.filter({ hasText: "O. H." })).toHaveCount(1);
  await expect(names.filter({ hasText: "Omar Haddad" })).toHaveCount(0);
  await page.getByTestId("show-names").check();
  await expect(names.filter({ hasText: "Omar Haddad" })).toHaveCount(1);
});

test("Arabic portal renders right-to-left", async ({ page, context }) => {
  await as(page, "u_huda", "/portal");
  await context.addCookies([{ name: "lang", value: "ar", url: page.url() }]);
  await page.goto(`/portal/cards/${enc("card:demo-clouds")}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("button", { name: "اعتماد" })).toBeVisible();
  await expectAccessible(page);
});
