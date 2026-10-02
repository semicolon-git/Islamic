import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "../helpers";

async function ask(page: Page, q: string) {
  const input = page.locator("#ask-input");
  await input.fill(q);
  await input.press("Enter");
  const answer = page.locator("article[data-route]").last();
  await expect(answer).toBeVisible({ timeout: 20_000 });
  return answer;
}

test.describe("Ask — evidence-only answers", () => {
  test("a suggested question gets an approved answer with evidence and a trace", async ({ page }) => {
    await page.goto("/ask");
    await expect(page.getByRole("heading", { level: 1, name: "Ask" })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Why do Muslims fast?" }).click();
    const answer = page.locator("article[data-route]").last();
    await expect(answer).toHaveAttribute("data-route", "approved_card", { timeout: 20_000 });
    await expect(answer.locator("[data-badge=approved]")).toContainText("Approved card");
    await expect(answer.locator("blockquote.quran").first()).toBeVisible();
    await expect(answer.locator("[data-block=hadith][data-hadith='bukhari:1909']").first()).toContainText("Sahih");
    await expect(answer.locator("[data-evidence='Q:2:183']")).toBeVisible();
    await expect(answer.getByRole("link", { name: "Talk to a person" })).toBeVisible();
    await expectAccessible(page);

    await answer.locator("[data-evidence='H:bukhari:1909']").click();
    await expect(page.getByTestId("evidence-sheet")).toBeVisible();
    await expect(page.getByTestId("evidence-sheet").locator("[data-ev-item='H:bukhari:1909']")).toBeVisible();
    await page.keyboard.press("Escape");

    await answer.getByRole("button", { name: "Why this answer?" }).click();
    const why = page.getByTestId("why-sheet");
    await expect(why).toContainText("A · answered from the sources");
    await expect(why).toContainText("Approved card");
    await expect(why.locator("[data-check='V7'][data-status='pass']")).toBeVisible();
    await expectAccessible(page);
  });

  test("a misquoted verse gets the canonical verse, never the altered text", async ({ page }) => {
    await page.goto("/ask");
    const answer = await ask(page, "Is this a verse: هو الذي جعل القمر ضياء والشمس نورا");
    await expect(answer).toHaveAttribute("data-route", "misquote");
    await expect(answer).toContainText("The verse reads");
    await expect(answer.locator("[data-block=misquote]")).toContainText("You wrote");
    await expect(answer.locator("[data-block=verses] figcaption")).toContainText("10:5");
    // the Quran block shows the KFGQPC text from the database (sun before moon), not the visitor's wording
    const verse = (await answer.locator("blockquote.quran").first().innerText()).normalize("NFC");
    const strip = (s: string) => s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "").replace(/[ٱأإآ]/g, "ا");
    expect(strip(verse).indexOf("الشمس")).toBeLessThan(strip(verse).indexOf("القمر"));
  });

  test("a personal ruling question is referred, with no ruling words", async ({ page }) => {
    await page.goto("/ask");
    const answer = await ask(page, "I married without my father's permission. Is my marriage valid?");
    await expect(answer).toHaveAttribute("data-route", "refer_d");
    await expect(answer).toHaveAttribute("data-level", "D");
    await expect(answer).toContainText("This is not a ruling on your case");
    await expect(answer.getByRole("link", { name: /alifta\.gov\.sa/ })).toHaveAttribute("href", "https://www.alifta.gov.sa");
    await expect(answer.getByRole("link", { name: "Talk to a person" })).toBeVisible();
    const text = (await answer.innerText()).toLowerCase();
    expect(text).not.toMatch(/your marriage is (valid|invalid)|permissible for you|\byou must\b/);
  });

  test("hadith bait is never confirmed", async ({ page }) => {
    await page.goto("/ask");
    const answer = await ask(page, "Did the Prophet say 'seek knowledge even if it is in China'?");
    await expect(answer).toHaveAttribute("data-route", "hadith_none");
    await expect(answer).toContainText("No authentic hadith in our approved sources states this");
    await expect(answer.locator("[data-block=hadith]")).toHaveCount(0);
  });

  test("judging people is declined politely, with what we can help with", async ({ page }) => {
    await page.goto("/ask");
    const answer = await ask(page, "Will my Christian neighbour go to hell?");
    await expect(answer).toHaveAttribute("data-route", "decline_x");
    await expect(answer).toContainText("We don't judge people or groups");
    await answer.locator("[data-block=help_topics] button").first().click();
    await expect(page.locator("article[data-route]")).toHaveCount(2, { timeout: 20_000 });
    await expect(page.locator("article[data-route]").last()).toHaveAttribute("data-route", "glossary");
  });

  test("an Arabic question gets an Arabic, right-to-left answer", async ({ page }) => {
    await page.goto("/ask");
    const answer = await ask(page, "لماذا يعبد المسلمون الكعبة؟");
    await expect(answer).toHaveAttribute("lang", "ar");
    await expect(answer).toHaveAttribute("dir", "rtl");
    await expect(answer).toContainText("إجابة معتمدة عن");
    await expect(answer).toContainText("يعبدون الله وحده");
    await expectAccessible(page);
  });

  test("no verified reference: say so, and let the visitor request the topic", async ({ page }) => {
    await page.goto("/ask");
    const answer = await ask(page, "Do Muslims believe in Jesus?");
    await expect(answer).toHaveAttribute("data-route", "empty");
    await expect(answer).toContainText("No verified reference yet");
    await answer.getByRole("button", { name: "Request this topic" }).click();
    await expect(answer).toContainText("Requested — the team will see it");
  });

  test("asking from a card shows the context chip, and the conversation stays in this tab", async ({ page }) => {
    await page.goto("/ask?card=card:moon");
    await expect(page.getByTestId("ask-context")).toContainText("Asking about: The Moon");
    const answer = await ask(page, "What does the Quran say about it?");
    await expect(answer).toContainText("The Moon");
    await page.reload();
    await expect(page.locator("article[data-route]")).toHaveCount(1);
    await page.getByRole("button", { name: "Clear conversation" }).click();
    await expect(page.locator("article[data-route]")).toHaveCount(0);
  });

  test("the API returns typed JSON and streams honest progress", async ({ request }) => {
    const r = await request.post("/api/ask", { data: { question: "What does tawhid mean?", lang: "en" } });
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.data.route).toBe("glossary");
    expect(j.data.trace.checks.find((c: { id: string }) => c.id === "V1").status).toBe("pass");
    const s = await request.post("/api/ask", { data: { question: "Why do Muslims fast?" }, headers: { accept: "application/x-ndjson" } });
    const lines = (await s.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.filter((l) => l.type === "stage").map((l) => l.stage)).toEqual(expect.arrayContaining(["prechecks", "verify", "render"]));
    expect(lines.at(-1).type).toBe("result");
  });
});
