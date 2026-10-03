import { expect, test } from "@playwright/test";
import { accessible, BNF } from "./helpers";

test("the public reader on a phone: published page, line sync, layers, legend, credits and fingerprint", async ({ page }) => {
  await page.goto("/heritage");
  await page.getByTestId("manuscripts-all").click();
  await expect(page).toHaveURL(/\/heritage\/manuscripts$/);
  await expect(page.getByTestId("public-list")).toBeVisible();
  await accessible(page);
  await page.getByTestId("public-ms").first().click();
  await expect(page).toHaveURL(new RegExp(`/heritage/manuscripts/${BNF}$`));

  const reader = page.getByTestId("public-reader");
  await expect(reader).toContainText("Reviewed transcription");
  await expect(reader).not.toContainText("taḥqīq");
  await expect(reader).toContainText("does not mean endorsing");
  await expect(page.getByTestId("sha")).toHaveText(/^[0-9a-f]{64}$/);
  const credits = page.getByTestId("credits");
  await expect(credits).toContainText("S. H."); // students by initials only
  await expect(credits).not.toContainText("Sara Al-Harbi");
  await expect(credits).toContainText("Dr. Huda Al-Qahtani");
  await expect(credits).toContainText("Khalid Al-Otaibi");
  await expect(credits).toContainText("(demo)");
  await expect(credits).toContainText("claude-vision");
  await expect(credits).toContainText(/gallica/i);
  await accessible(page);

  // tap a line: highlighted on the image, its crop appears
  const btn = page.locator("[data-line-btn]").nth(3);
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  const id = await btn.getAttribute("data-line-btn");
  await expect(page.locator(`polygon[data-line="${id}"]`)).toHaveAttribute("fill-opacity", "0.3");

  // tap the image: the line is selected in the text
  const other = page.locator("polygon[data-line]").nth(6);
  const otherId = await other.getAttribute("data-line");
  await other.dispatchEvent("click");
  await expect(page.locator(`[data-line-btn="${otherId}"]`)).toHaveAttribute("aria-pressed", "true");

  // layers
  await page.getByRole("tab", { name: "Exactly as written" }).click();
  await expect(page.getByText("Every letter as the scribe wrote it", { exact: false })).toBeVisible();

  // legend in plain language
  await page.getByTestId("legend-open").click();
  await expect(page.getByTestId("legend")).toContainText("we are not sure");
  await accessible(page);
});

test("Arabic wording, and a good empty state for a manuscript with nothing published", async ({ page, context }) => {
  await page.goto("/heritage");
  await context.addCookies([{ name: "lang", value: "ar", url: page.url() }]);
  await page.goto(`/heritage/manuscripts/${BNF}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("public-reader")).toContainText("تفريغ نصي مُراجَع");
  await expect(page.getByTestId("public-reader")).not.toContainText("تحقيق");
  await expect(page.getByTestId("credits")).toContainText("س. ح.");

  await page.goto("/heritage/manuscripts/umich-isl-22");
  await expect(page.getByTestId("public-empty")).toBeVisible();
  await accessible(page);
});
