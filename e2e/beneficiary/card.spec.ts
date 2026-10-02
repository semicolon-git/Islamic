import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "../helpers";

async function skipWelcome(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("say.welcomed", "1");
    } catch {}
  });
}

test.beforeEach(async ({ page }) => skipWelcome(page));

test("home shows the three tracks, approved marks and recent cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The world is full of signs.");
  for (const tr of ["nature", "art", "heritage"]) await expect(page.getByTestId(`track-${tr}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Moon · Approved card" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recently approved" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Do Muslims worship the Kaaba\?/ })).toBeVisible();
  await expectAccessible(page);
});

test("home → concept → card → provenance sheet", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Moon · Approved card" }).click();
  await expect(page).toHaveURL(/\/c\/moon$/);
  await expect(page.getByRole("heading", { level: 1, name: "The Moon" })).toBeVisible();

  // Quran text inserted verbatim from the DB, with the labelled translation.
  await expect(page.locator("blockquote.quran").first()).toContainText("وَٱلۡقَمَرَ نُورٗا");
  await expect(page.getByText("Translation of the meaning · Saheeh International").first()).toBeVisible();
  await expect(page.getByTestId("count-line")).toContainText("occurs 27 times in 26 verses");
  await expect(page.getByTestId("count-line")).toContainText("Quranic Arabic Corpus lemma count");
  await expect(page.getByText("Commentary · al-Tabari (d. 310 AH)")).toBeVisible();
  await expect(page.getByText("Explanation (not Quran text)")).toBeVisible();
  const hadith = page.getByTestId("hadith").first();
  await expect(hadith).toContainText("Sahih al-Bukhari");
  await expect(hadith).toContainText("#1042");
  await expect(hadith).toContainText("Sahih — in Sahih al-Bukhari");
  await expect(hadith).toContainText("Number checked in a dataset mirror");
  await expect(page.getByText(/Approved card · College of Sharia — Demo University \(demo\)/).first()).toBeVisible();
  await expect(page.getByText("Demo content — pending review by a qualified scholar.")).toBeVisible();
  await expectAccessible(page);

  // How we count
  await page.getByText("How we count").click();
  await expect(page.getByText("We don't attach any meaning or significance to it.", { exact: false })).toBeVisible();

  // Provenance
  await page.getByRole("button", { name: "Why trust this?" }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Why trust this card?" })).toBeVisible();
  await expect(sheet.getByText("Sara Al-Harbi")).toBeVisible();
  await expect(sheet.getByText("Dr. Huda Al-Qahtani")).toBeVisible();
  await expect(sheet.getByText("Dr. Noura Al-Saleh")).toBeVisible();
  await expect(sheet.getByText("demo").first()).toBeVisible();
  await expect(sheet.getByText("Approved by two different people (four-eyes rule)")).toBeVisible();
  await expect(sheet.getByText(/Quran text inserted word for word/)).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();

  // Next steps link to Ask / Talk with the card id.
  await expect(page.getByRole("link", { name: "Ask about this" })).toHaveAttribute("href", "/ask?card=card%3Amoon");
  await expect(page.getByRole("link", { name: "Talk to a person" })).toHaveAttribute("href", "/talk?card=card%3Amoon");
});

test("save as image downloads a share card", async ({ page }) => {
  await page.goto("/c/moon");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save image" }).click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/\.png$/);
});

test("answer cards render at /card/<id>; unknown ids get a friendly state", async ({ page }) => {
  await page.goto("/card/answer:kaaba");
  await expect(page.getByRole("heading", { level: 1, name: "Do Muslims worship the Kaaba?" })).toBeVisible();
  await expect(page.locator("blockquote.quran").first()).toBeVisible();
  // Glossary chip opens the approved rule.
  await page.getByRole("button", { name: /Ibadah|Worship/i }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Approved meaning from the platform glossary");
  await page.keyboard.press("Escape");

  await page.goto("/card/answer:does-not-exist");
  await expect(page.getByRole("heading", { level: 1, name: "This card isn't available" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
});

test("about page explains sources, privacy and institutions", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1, name: "How Signs Around You works" })).toBeVisible();
  await expect(page.getByText("Quran text — King Fahd Complex (KFGQPC), Hafs v18")).toBeVisible();
  await expect(page.getByText("Translation — Saheeh International")).toBeVisible();
  await expect(page.getByText("Hadith — Sahih al-Bukhari & Sahih Muslim")).toBeVisible();
  await expect(page.getByText("Al-Noor Manuscript Library")).toBeVisible();
  await expectAccessible(page);
});

test("concepts API lists tracks with card status", async ({ request }) => {
  const r = await (await request.get("/api/concepts?track=nature")).json();
  expect(r.ok).toBe(true);
  const moon = r.data.find((c: { id: string }) => c.id === "moon");
  expect(moon).toMatchObject({ track: "nature", has_card: true, card_id: "card:moon" });
  expect(r.data.every((c: { track: string }) => c.track === "nature")).toBe(true);
  expect((await request.get("/api/concepts?track=space")).status()).toBe(400);
});
