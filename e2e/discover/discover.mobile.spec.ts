import { expect, test } from "@playwright/test";
import { expectAccessible, setLang } from "../helpers";

/** Open-world discovery without an API key: passages that contain the word itself, never a summary. */

test("Explore search → discovery: verses that contain the word, tafsir, honest labels", async ({ page }) => {
  await page.goto("/?welcome=0");
  await page.locator("#explore-q").fill("فضة"); // silver: no concept card
  await page.getByTestId("explore-search").getByRole("button").click();
  await expect(page).toHaveURL(/\/discover\?q=/);
  await expect(page.locator("[data-tier]")).toHaveAttribute("data-tier", "sources", { timeout: 30_000 });
  await expect(page.locator('[data-verse="3:14"]')).toBeVisible();
  await expect(page.locator('[data-verse="9:34"]')).toBeVisible();
  await expect(page.getByTestId("discover-summary")).toHaveCount(0); // no AI → no prose
  await expect(page.getByText("AI is off on this server")).toBeVisible();
  // Verbatim tafsir, fetched by reference
  await page.locator('[data-verse="3:14"] summary').click();
  await expect(page.locator('[data-verse="3:14"]').getByText("al-Tafsir al-Muyassar").first()).toBeVisible();
  await page.getByTestId("discover-how").locator("summary").click();
  await expect(page.getByTestId("discover-how")).toContainText("candidates");
  await expectAccessible(page);
});

test("nothing found is said plainly; visitors can ask scholars to cover it", async ({ page }) => {
  await page.goto("/discover?q=%D9%82%D9%87%D9%88%D8%A9"); // قهوة
  await expect(page.locator("[data-tier]")).toHaveAttribute("data-tier", "none", { timeout: 30_000 });
  await expect(page.getByTestId("discover-panel")).toContainText("We found no verse or authentic hadith");
  await page.getByRole("button", { name: "Ask scholars to review this" }).click();
  await expect(page.getByRole("button", { name: /Requested/ })).toBeDisabled();
  await expectAccessible(page);
});

test("Explore search routes questions to Ask and covered subjects to their card", async ({ page }) => {
  await page.goto("/?welcome=0");
  await page.locator("#explore-q").fill("Why is the moon mentioned?");
  await page.getByTestId("explore-search").getByRole("button").click();
  await expect(page).toHaveURL(/\/ask\?q=/);
  await page.goto("/?welcome=0");
  await page.locator("#explore-q").fill("camel");
  await page.getByTestId("explore-search").getByRole("button").click();
  await expect(page).toHaveURL(/\/c\/camel$/);
});

test("Arabic discovery is right-to-left", async ({ page }) => {
  await page.goto("/");
  await setLang(page, "ar");
  await page.goto("/discover?q=%D9%86%D8%AD%D9%84"); // نحل
  await expect(page.locator("[data-tier]")).toHaveAttribute("data-tier", "sources", { timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "من القرآن الكريم" })).toBeVisible();
  await expect(page.locator('[data-verse="16:68"]')).toBeVisible();
});

test("discover API: validation, people are never searched", async ({ request }) => {
  expect((await request.post("/api/discover", { data: {} })).status()).toBe(400);
  const r = await request.post("/api/discover", { data: { label_en: "a person", label_ar: "شخص", category: "person", source: "snap" } });
  const d = (await r.json()).data;
  expect(d.status).toBe("sensitive");
  expect(d.verses).toEqual([]);
});

test("a concept without a card links to discovery; Snap offers Sky mode", async ({ page }) => {
  await page.goto("/snap");
  await expect(page.getByTestId("snap-sky")).toBeVisible();
  await page.getByTestId("snap-sky").click();
  await expect(page).toHaveURL(/\/sky$/);
  const r = await page.request.get("/api/concepts");
  const concepts = ((await r.json()).data ?? []) as { id: string; has_card: boolean }[];
  const without = concepts.find((c) => !c.has_card);
  test.skip(!without, "every concept has a card in this seed");
  await page.goto(`/c/${without!.id}`);
  await expect(page.getByTestId("nocard-discover")).toBeVisible();
  await page.getByTestId("nocard-discover").click();
  await expect(page).toHaveURL(/\/discover\?/);
});
