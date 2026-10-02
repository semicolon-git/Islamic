import { expect, test } from "@playwright/test";
import { expectAccessible, setLang } from "../helpers";

test.describe("Heritage home & items", () => {
  test("home shows the code entry, published objects, art forms and manuscripts", async ({ page }) => {
    await page.goto("/heritage");
    await expect(page.getByRole("heading", { level: 1, name: "Stories held in objects" })).toBeVisible();
    await expect(page.getByLabel("Enter the code on the museum label")).toBeVisible();
    const codes = await page.getByTestId("item-tile").evaluateAll((els) => els.map((e) => e.getAttribute("data-code")).sort());
    expect(codes).toEqual(["AST-7", "LMP-3", "QMS-1"]); // TIL-2 is still awaiting the researcher
    await expect(page.getByTestId("art-tile").first()).toBeVisible();
    await expect(page.getByTestId("manuscripts-section")).toBeVisible();
    await expectAccessible(page);
  });

  test("typing ast7 opens the astrolabe (case, dash and space don't matter)", async ({ page }) => {
    await page.goto("/heritage");
    await page.getByTestId("code-input").fill("ast7");
    await page.getByTestId("code-input").press("Enter");
    await expect(page).toHaveURL(/\/heritage\/item\/AST-7$/);
    await expect(page.getByRole("heading", { level: 1, name: "Planispheric astrolabe" })).toBeVisible();
    await expect(page.getByTestId("generated-label")).toHaveText("Illustrative image (generated)");
    await expect(page.getByText("Generated illustration — not the actual object")).toBeVisible();
    await expect(page.getByTestId("item-institution")).toHaveText("Al-Noor Manuscript Library (demo)");
    await expect(page.getByRole("link", { name: "Ask about this object" })).toHaveAttribute("href", "/ask?item=AST-7");
    await expectAccessible(page);
  });

  test("an unknown code gets a helpful message, not a dead end", async ({ page }) => {
    await page.goto("/heritage");
    await page.getByTestId("code-input").fill("zz-99");
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page.getByTestId("code-error")).toContainText("We couldn't find “ZZ-99”");
    await page.getByTestId("code-input").fill("x");
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page.getByTestId("code-error")).toContainText("3–8 letters or numbers");

    await page.goto("/heritage/item/NOPE-1");
    await expect(page.getByTestId("item-not-found")).toBeVisible();
    await page.getByLabel("Enter the code on the museum label").fill("lmp 3");
    await page.getByRole("button", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/heritage\/item\/LMP-3$/);
  });

  test("the lamp shows its confirmed inscription quoting 24:35", async ({ page }) => {
    await page.goto("/heritage/item/LMP-3");
    const ins = page.getByTestId("item-inscriptions");
    await expect(ins.getByTestId("inscription-quotes")).toHaveText("Quotes the Quran · 24:35");
    await expect(ins.locator("blockquote.quran")).toBeVisible();
    await expect(ins.getByText("Read by Sara Al-Harbi (demo) · confirmed by Dr. Huda Al-Qahtani (demo)")).toBeVisible();
  });

  test("venue code scopes the visit, survives a reload, and can be left", async ({ page }) => {
    await page.goto("/heritage");
    await page.getByTestId("code-input").fill("noor");
    await page.getByTestId("code-input").press("Enter");
    const banner = page.getByTestId("venue-banner");
    await expect(banner).toContainText("You're at Al-Noor Library — Reading Room");
    await expect(page.getByTestId("item-tile")).toHaveCount(3);
    await page.reload();
    await expect(banner).toBeVisible();
    await page.getByTestId("leave-venue").click();
    await expect(banner).toHaveCount(0);
    // A venue link (as printed at the entrance) works too.
    await page.goto("/heritage?venue=NOOR");
    await expect(banner).toBeVisible();
    await expect(page).toHaveURL(/\/heritage$/);
  });

  test("QR scanner opens and, without a usable camera, offers typing the code", async ({ page }) => {
    await page.goto("/heritage");
    await page.getByTestId("scan-button").click();
    const scanner = page.getByTestId("qr-scanner");
    await expect(scanner).toBeVisible();
    await expect(scanner).toHaveAttribute("data-state", /denied|unsupported|error|scanning/);
    await page.getByRole("button", { name: "Type the code instead" }).first().click();
    await expect(page.getByTestId("code-input")).toBeFocused();
  });

  test("Arabic: heritage home and an item page", async ({ page }) => {
    await setLang(page, "ar");
    await page.goto("/heritage");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1, name: "حكايات تحملها المقتنيات" })).toBeVisible();
    await expectAccessible(page);
    await page.goto("/heritage/item/AST-7");
    await expect(page.getByRole("heading", { level: 1, name: "أسطرلاب مسطّح" })).toBeVisible();
    await expect(page.getByTestId("generated-label")).toHaveText("صورة توضيحية (مولَّدة)");
    await expectAccessible(page);
  });
});
