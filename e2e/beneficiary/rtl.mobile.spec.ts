import { expect, test } from "@playwright/test";
import { expectAccessible } from "../helpers";

test.beforeEach(async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: "lang", value: "ar", url: baseURL! }]);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("say.welcomed", "1");
    } catch {}
  });
});

test("the card renders right-to-left in Arabic", async ({ page }) => {
  await page.goto("/c/moon");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { level: 1, name: "القمر" })).toBeVisible();
  await expect(page.getByText("شرح (ليس نصًّا قرآنيًّا)")).toBeVisible();
  await expect(page.getByText("تفسير · ابن جرير الطبري (ت ٣١٠هـ)")).toBeVisible();
  await expect(page.getByTestId("count-line")).toContainText("٢٧");
  await expect(page.getByTestId("hadith").first()).toContainText("صحيح — في صحيح البخاري");
  // Logical layout: the title sits on the right edge in RTL.
  const box = await page.getByRole("heading", { level: 1 }).boundingBox();
  const vw = page.viewportSize()!.width;
  expect(box!.x + box!.width).toBeGreaterThan(vw - 40);
  await expectAccessible(page);
});

test("home and art concepts show Arabic labels, never raw ids", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "العالم من حولك مليء بالآيات." })).toBeVisible();
  await expect(page.getByRole("link", { name: "قنديل المسجد" })).toBeVisible();
  await expect(page.getByText("mosque_lamp")).toHaveCount(0);
  await expectAccessible(page);
});

test("no-card screen in Arabic", async ({ page }) => {
  await page.goto("/c/grapes");
  await expect(page.getByRole("heading", { level: 1, name: "لا توجد بطاقة مُراجَعة بعد — ولن نخمّن" })).toBeVisible();
  await expect(page.getByRole("button", { name: "نبّهني عند اعتمادها" })).toBeVisible();
});
