import type { Page } from "@playwright/test";

/** Wait for entrance animations (fade/rise) to finish so axe measures final colours, not mid-fade ones. */
export async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity) // skip spinners/shimmers
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}
