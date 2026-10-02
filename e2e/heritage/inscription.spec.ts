import { expect, test } from "@playwright/test";
import { expectAccessible, setLang } from "../helpers";

const input = (page: import("@playwright/test").Page) => page.getByTestId("inscription-input");
const result = (page: import("@playwright/test").Page) => page.getByTestId("inscription-result");

test.describe("Read an inscription", () => {
  test("Light Verse opening → exact 24:35 with the verse and its translation", async ({ page }) => {
    await page.goto("/inscription");
    await expect(page.getByRole("heading", { level: 1, name: "Read an inscription" })).toBeVisible();
    await expectAccessible(page);
    await input(page).fill("الله نور السموات والأرض مثل نوره");
    await page.getByRole("button", { name: "Check the text" }).click();
    await expect(result(page)).toHaveAttribute("data-status", "exact");
    await expect(result(page).getByRole("heading", { level: 2 })).toHaveText("This inscription quotes Surah An-Nūr, verse 35");
    await expect(page.getByTestId("match-location")).toHaveAttribute("data-ref", "24:35");
    await expect(page.getByTestId("coverage")).toHaveText("Part of the verse");
    await expect(result(page).locator("blockquote.quran")).toBeVisible();
    await expect(result(page).getByText("Translation of the meaning · Saheeh International")).toBeVisible();
    await expectAccessible(page);
  });

  test("Ayat al-Kursi opening lists both places it occurs", async ({ page }) => {
    await page.goto("/inscription");
    await page.getByRole("button", { name: "Ayat al-Kursi opening" }).click();
    await expect(result(page)).toHaveAttribute("data-status", "exact");
    await expect(page.getByText("These words appear in 2 places in the Quran")).toBeVisible();
    const refs = await page.getByTestId("match-location").evaluateAll((els) => els.map((e) => e.getAttribute("data-ref")).sort());
    expect(refs).toEqual(["2:255", "3:2"]);
  });

  test("a swapped quote is near, shown neutrally with its differences", async ({ page }) => {
    await page.goto("/inscription");
    await input(page).fill("هو الذي جعل القمر ضياء والشمس نورا");
    await page.keyboard.press("Control+Enter");
    await expect(result(page)).toHaveAttribute("data-status", "near");
    await expect(page.getByTestId("near-title")).toHaveAttribute("data-ref", "10:5");
    await expect(page.getByText("The inscription reads")).toBeVisible();
    await expect(page.getByText("The standard text reads")).toBeVisible();
    const marked = page.getByTestId("near-inscription").locator("mark");
    await expect(marked).toHaveCount(2);
    await expect(page.getByTestId("differences").locator("tbody tr")).toHaveCount(2);
    // Never call the inscription "wrong".
    await expect(result(page)).not.toContainText(/wrong|incorrect|error/i);
    await expectAccessible(page);
  });

  test("the Alhambra motto is not identified as a verse, and a person is offered", async ({ page }) => {
    await page.goto("/inscription");
    await input(page).fill("ولا غالب إلا الله");
    await page.getByRole("button", { name: "Check the text" }).click();
    await expect(result(page)).toHaveAttribute("data-status", "none");
    await expect(page.getByText("This isn't a Quranic verse we can identify. We won't guess.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ask a person" })).toHaveAttribute("href", /\/talk/);
    await expect(result(page).locator("blockquote.quran")).toHaveCount(0);
  });

  test("too short, and non-Arabic input, get honest guidance", async ({ page }) => {
    await page.goto("/inscription");
    await input(page).fill("الله أكبر");
    await page.getByRole("button", { name: "Check the text" }).click();
    await expect(result(page)).toHaveAttribute("data-status", "too_short");
    await expect(page.getByText("Too short to identify a verse")).toBeVisible();
    await page.getByRole("button", { name: "Check another text" }).click();
    await input(page).fill("hello world");
    await page.getByRole("button", { name: "Check the text" }).click();
    await expect(page.getByText("Type Arabic letters", { exact: false })).toBeVisible();
  });

  test("the on-screen Arabic keyboard types into the box", async ({ page }) => {
    await page.goto("/inscription");
    await page.getByRole("button", { name: "Arabic keyboard" }).click();
    const kb = page.getByRole("group", { name: "On-screen Arabic keyboard" });
    await expect(kb).toBeVisible();
    for (const ch of ["ق", "ل"]) await kb.getByRole("button", { name: ch, exact: true }).click();
    await kb.getByRole("button", { name: "Space" }).click();
    await kb.getByRole("button", { name: "ه", exact: true }).click();
    await kb.getByRole("button", { name: "Delete a letter" }).click();
    await expect(input(page)).toHaveValue("قل ");
    await expectAccessible(page);
  });

  test("without an AI key the photo tab explains and offers typing", async ({ page }) => {
    await page.goto("/inscription");
    await page.getByRole("tab", { name: "Photo" }).click();
    await expect(page.getByTestId("no-ai")).toBeVisible();
    await page.getByRole("button", { name: "Type it instead" }).click();
    await expect(input(page)).toBeVisible();
  });

  test("works in Arabic", async ({ page }) => {
    await setLang(page, "ar");
    await page.goto("/inscription");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "اقرأ نقشًا" })).toBeVisible();
    await page.getByRole("button", { name: "مطلع آية النور" }).click();
    await expect(result(page).getByRole("heading", { level: 2 })).toHaveText("هذا النقش يقتبس من سورة النور، الآية ٣٥");
    await expectAccessible(page);
  });
});
