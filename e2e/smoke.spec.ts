import { expect, test } from "@playwright/test";
import { expectAccessible, loginAs } from "./helpers";

test("home renders in English and Arabic", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await context.addCookies([{ name: "lang", value: "ar", url: page.url() }]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("portal requires sign-in and accepts a persona", async ({ page }) => {
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/portal\/login/);
  await expectAccessible(page);
  await loginAs(page, "u_huda");
  await page.goto("/portal");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("health endpoint reports a seeded database", async ({ request }) => {
  const r = await request.get("/api/health");
  const j = await r.json();
  expect(j.ok).toBe(true);
  expect(j.data.ayat).toBe(6236);
});
