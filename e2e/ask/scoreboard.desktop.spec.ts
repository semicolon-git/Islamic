import { expect, test } from "@playwright/test";
import { expectAccessible, loginAs } from "../helpers";

test.describe("Portal — safety scoreboard", () => {
  test("renders metrics, the confusion matrix and expandable traces", async ({ page }) => {
    await loginAs(page, "u_huda");
    await page.goto("/portal/eval");
    await expect(page.getByRole("heading", { level: 1, name: "Safety scoreboard" })).toBeVisible();
    for (const id of ["fabricated_hadith", "quote_fidelity", "citation_coverage", "d_recall", "false_refusal", "misquote_catch"])
      await expect(page.locator(`[data-metric=${id}]`)).toBeVisible();
    await expect(page.locator("[data-metric=quote_fidelity]")).toContainText("95% CI");
    await expect(page.getByRole("heading", { name: "Level confusion matrix" })).toBeVisible();
    await expect(page.locator("[data-cell=DD]")).not.toHaveText("0");
    await page.getByRole("tab", { name: /Held-out/ }).click();
    await expect(page.locator("[data-case^='ho-']").first()).toBeVisible();
    await expect(page.locator("[data-case^='r6-q1-en']")).toHaveCount(0);
    await page.getByRole("button", { name: "Show trace" }).first().click();
    await expect(page.getByText("Pipeline validators")).toBeVisible();
    await expectAccessible(page);
  });

  test("“Run evaluation now” runs server-side and records the run", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, "u_noura");
    await page.goto("/portal/eval");
    await page.getByRole("button", { name: "Run evaluation now" }).click();
    await expect(page.getByText(/Evaluation finished: \d+\/\d+ cases pass/)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("eval-meta")).toContainText("stored run", { timeout: 20_000 });
  });

  test("only researchers and admins can see or run it", async ({ page }) => {
    await loginAs(page, "u_sara");
    await page.goto("/portal/eval");
    await expect(page.getByRole("heading", { name: "Researchers and institution admins only" })).toBeVisible();
    const r = await page.request.post("/api/eval/run");
    expect(r.status()).toBe(403);
  });
});
