import { expect, test } from "@playwright/test";
import { loginAs } from "../helpers";

/** Portal review of a contribution chain: researcher approves, a different institution admin signs off (four eyes). */
test("researcher approves, the same person can't sign off, a different admin does, visitors see 'Reviewed by'", async ({ page, browser }) => {
  // A visitor explores coffee first, so the result is cached with the chain still "sourced".
  const coffee = "/discover?en=" + encodeURIComponent("cup of coffee") + "&ar=" + encodeURIComponent("فنجان قهوة") + "&src=search";
  await page.goto(coffee);
  await expect(page.locator('[data-chain="coffee"] [data-review="sourced"]')).toBeVisible({ timeout: 60_000 });

  // Researcher: approve from the review page.
  await loginAs(page, "u_huda");
  await page.goto("/portal/science");
  await expect(page.locator('[data-chain-row="coffee"] [data-state="pending"]')).toBeVisible();
  await page.goto("/portal/science/coffee");
  await expect(page.getByTestId("chain")).toBeVisible();
  await page.getByTestId("chain-approve").click();
  await expect(page.getByText(/Approved/).first()).toBeVisible();

  // A researcher can't sign off; a platform admin who approved can't sign off their own approval either.
  const self = await page.request.post("/api/science/chains/coffee/review", { data: { decision: "publish" } });
  expect(self.status()).toBe(403);

  // A different person — the institution admin — signs off.
  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await loginAs(ap, "u_noura");
  await ap.goto("/portal/science/coffee");
  await ap.getByTestId("chain-publish").click();
  await expect(ap.getByText(/Signed off/).first()).toBeVisible();
  await admin.close();

  // Visitors now see the institution's name on the chain — on its page, and in the cached discovery result too.
  await page.goto("/science/chain/coffee");
  await expect(page.locator('[data-review="reviewed"]')).toContainText("Reviewed by");
  await page.goto(coffee);
  await expect(page.locator('[data-chain="coffee"] [data-review="reviewed"]')).toBeVisible({ timeout: 60_000 });
});

test("four eyes: the admin who approved cannot also sign off", async ({ page }) => {
  await loginAs(page, "u_admin");
  const a = await page.request.post("/api/science/chains/paper-and-books/review", { data: { decision: "approve" } });
  expect(a.ok()).toBeTruthy();
  const p = await page.request.post("/api/science/chains/paper-and-books/review", { data: { decision: "publish" } });
  expect(p.status()).toBe(409);
  expect((await p.json()).error.code).toBe("four_eyes");
  const r = await page.request.post("/api/science/chains/paper-and-books/review", { data: { decision: "return" } });
  expect(r.status()).toBe(400); // a return needs a note
});
