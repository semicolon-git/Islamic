import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "../helpers";

// Returning visitors: first-time visitors see the welcome screen, where nothing else (install banner) interrupts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("say.welcomed", "1");
    } catch {}
  });
});

/** Fire a synthetic `beforeinstallprompt`, recording whether the app calls prompt(). */
async function firePrompt(page: Page, outcome: "accepted" | "dismissed" = "accepted") {
  await page.evaluate((outcome) => {
    const w = window as unknown as { __prompted: number };
    w.__prompted = 0;
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
    e.prompt = async () => {
      w.__prompted++;
    };
    e.userChoice = Promise.resolve({ outcome, platform: "web" });
    window.dispatchEvent(e);
  }, outcome);
}

const banner = (page: Page) => page.getByTestId("pwa-install-banner");

test("install banner: waits a moment, then installs via the captured prompt", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");
  await firePrompt(page, "accepted");
  // Not on first paint.
  await expect(banner(page)).toHaveCount(0);
  await expect(banner(page)).toBeVisible({ timeout: 6000 });
  await expect(banner(page).getByRole("heading")).toHaveText("Keep Signs Around You on your phone");
  await expectAccessible(page);
  await banner(page).getByRole("button", { name: "Install" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
  await expect(banner(page)).toHaveCount(0);
});

test("install banner: 'Not now' snoozes it across reloads", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");
  await firePrompt(page);
  await banner(page).getByRole("button", { name: "Not now" }).click();
  await expect(banner(page)).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState("load");
  await firePrompt(page);
  await page.waitForTimeout(3500);
  await expect(banner(page)).toHaveCount(0);
});

test("install banner: only from the second visit off the home page, never on /snap", async ({ page }) => {
  await page.goto("/about");
  await page.waitForLoadState("load");
  await firePrompt(page);
  await page.waitForTimeout(3500);
  await expect(banner(page)).toHaveCount(0);

  // A later visit (new session) on the same page qualifies.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.waitForLoadState("load");
  await firePrompt(page);
  await expect(banner(page)).toBeVisible({ timeout: 6000 });

  await page.goto("/snap");
  await page.waitForLoadState("load");
  await firePrompt(page);
  await page.waitForTimeout(3500);
  await expect(banner(page)).toHaveCount(0);
});

test("install banner is translated in Arabic", async ({ page, context }) => {
  await page.goto("/");
  await context.addCookies([{ name: "lang", value: "ar", url: page.url() }]);
  await page.reload();
  await page.waitForLoadState("load");
  await firePrompt(page);
  await expect(banner(page)).toBeVisible({ timeout: 6000 });
  await expect(banner(page).getByRole("button", { name: "تثبيت" })).toBeVisible();
  await expectAccessible(page);
});

test.describe("iOS Safari", () => {
  test.use({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });

  test("offers Share → Add to Home Screen instructions", async ({ page }) => {
    await page.goto("/");
    await expect(banner(page)).toBeVisible({ timeout: 6000 });
    await banner(page).getByRole("button", { name: "Show me how" }).click();
    const sheet = page.getByRole("dialog").filter({ hasText: "Add to your Home Screen" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("pwa-ios-steps").locator("li")).toHaveCount(3);
    await expect(sheet).toContainText("Add to Home Screen");
    await expectAccessible(page);
    await sheet.getByRole("button", { name: "Got it" }).click();
    await expect(sheet).toBeHidden();
    await expect(banner(page)).toHaveCount(0);
  });
});
