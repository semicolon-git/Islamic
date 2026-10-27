import { expect, test } from "@playwright/test";
import { expectAccessible } from "../helpers";

/** Contribution chains on the visitor side: a TV links to the history of optics, never to a forced verse. */
test("a TV gets its contribution chain, with sources, what we don't claim, and no 'we won't guess' badge", async ({ page }) => {
  await page.goto("/discover?en=Television&ar=" + encodeURIComponent("تلفاز") + "&src=search");
  const chains = page.getByTestId("discover-chains");
  await expect(chains).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("no-scripture")).toContainText("don't mention");
  await expect(page.locator("[data-tier]")).toHaveCount(0);
  const chain = chains.locator('[data-chain="light-and-image"]');
  await expect(chain.getByTestId("chain-answer")).toContainText("Ibn al-Haytham");
  await expect(chain.locator('[data-review="sourced"]')).toBeVisible();
  await expect(chain.getByTestId("chain-not-claimed")).toContainText("do not claim");
  // Steps run from before → Muslim scholars → … → today; Muslim steps link their scholar pages.
  await expect(chain.locator('[data-role="before"]').first()).toBeVisible();
  await expect(chain.locator('[data-role="today"]')).toHaveCount(1);
  await expect(chain.locator('[data-role="muslim"] a[href="/science/scientist/ibn-al-haytham"]')).toBeVisible();
  await expectAccessible(page);
  await chain.getByRole("link", { name: /full story/ }).click();
  await expect(page).toHaveURL(/\/science\/chain\/light-and-image$/);
  await expect(page.getByTestId("chain-myths")).toContainText("invented the camera");
});

test("the head noun decides: a television tower gets no chain, a clock tower does", async ({ page }) => {
  await page.goto("/discover?en=" + encodeURIComponent("television tower") + "&ar=" + encodeURIComponent("برج التلفاز") + "&src=search");
  await expect(page.locator("[data-tier]")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("discover-chains")).toHaveCount(0);
  await page.goto("/discover?en=" + encodeURIComponent("wall clock") + "&ar=" + encodeURIComponent("ساعة حائط") + "&src=search");
  await expect(page.getByTestId("discover-chains").locator('[data-chain="clocks-and-timekeeping"]')).toBeVisible({ timeout: 60_000 });
});

test("science index lists the chains, and a scholar page links back to them", async ({ page }) => {
  await page.goto("/science");
  await expect(page.getByTestId("science-chains").locator("[data-chain-link]")).toHaveCount(12);
  await page.goto("/science/scientist/al-zahrawi");
  await expect(page.getByRole("link", { name: /Surgery/ })).toBeVisible();
});
