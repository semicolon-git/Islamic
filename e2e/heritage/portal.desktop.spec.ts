import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, loginAs, setLang } from "../helpers";

// A real (tiny) PNG: the server re-encodes it with sharp and strips metadata.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAJ0lEQVQ4jWMQELGiCmIYNUhgNIwERtORyGgWERktRqxGS0irgaxFAIy104GQ2RJOAAAAAElFTkSuQmCC",
  "base64",
);

async function as(page: Page, user: string, path: string) {
  await loginAs(page, user);
  await page.goto(path);
}

test.describe.configure({ mode: "serial" });

test.describe("Portal: heritage items", () => {
  test("register → submit → approve → publish → QR label", async ({ page }) => {
    await as(page, "u_sara", "/portal/items");
    await expect(page.getByRole("heading", { level: 1, name: "Heritage items" })).toBeVisible();
    await expectAccessible(page);
    await page.getByTestId("register-item").click();
    await expect(page.getByRole("heading", { level: 1, name: "Register an item" })).toBeVisible();

    await page.getByLabel("Title (English)").fill("Brass Quran stand (demo)");
    await page.getByLabel("Title (Arabic)").fill("كرسي مصحف نحاسي (تجريبي)");
    await page.getByLabel("Kind", { exact: true }).selectOption("metalwork");
    await page.getByLabel("Venue").selectOption({ label: "Al-Noor Library — Reading Room" });
    await page.getByLabel("Date (English)").fill("19th century (demo)");

    // Rights are required: saving without them is blocked.
    await page.getByTestId("image-input").setInputFiles({ name: "stand.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByTestId("image-row")).toHaveCount(1);
    await page.getByTestId("item-save").click();
    await expect(page.getByText("Every image needs a licence and a credit line.").first()).toBeVisible();
    await page.getByTestId("image-license").selectOption({ label: "Institution's own photo, all rights reserved" });
    await page.getByTestId("image-credit").fill("Photo © Al-Noor Library (demo)");
    await expectAccessible(page);
    await page.getByTestId("item-save").click();

    await expect(page).toHaveURL(/\/portal\/items\/item_/);
    const url = page.url();
    await expect(page.getByTestId("workflow-panel")).toHaveAttribute("data-status", "ai_draft");
    await expect(page.getByTestId("qr-panel")).toContainText("created when the item is published");
    await page.getByTestId("wf-submit").click();
    await expect(page.getByTestId("workflow-panel")).toHaveAttribute("data-status", "student_submitted");

    await as(page, "u_huda", url);
    await page.getByTestId("wf-approve").click();
    await expect(page.getByTestId("workflow-panel")).toHaveAttribute("data-status", "researcher_approved");

    await as(page, "u_khalid", url);
    await page.getByTestId("wf-publish").click();
    await expect(page.getByTestId("workflow-panel")).toHaveAttribute("data-status", "published");
    const code = (await page.getByTestId("item-code").textContent())!.trim();
    expect(code).toMatch(/^MTL-\d+$/);
    await expect(page.getByTestId("item-qr").locator("svg")).toBeVisible();
    await expectAccessible(page);

    await page.getByTestId("print-label").click();
    const label = page.getByTestId("a6-label");
    await expect(label).toBeVisible();
    await expect(label.getByTestId("label-code")).toHaveText(code);
    await expect(label).toContainText("كرسي مصحف نحاسي (تجريبي)");
    await expect(label).toContainText("Brass Quran stand (demo)");
    await expect(label).toContainText("Photo © Al-Noor Library (demo)");
    await expect(label.locator("svg").first()).toBeVisible();
    await expectAccessible(page);

    // Live in the visitor app under its new code (typed forgivingly).
    await page.goto(`/heritage/item/${code.toLowerCase().replace("-", " ")}`);
    await expect(page.getByRole("heading", { level: 1, name: "Brass Quran stand (demo)" })).toBeVisible();
    await expect(page.getByText("Photo © Al-Noor Library (demo)")).toBeVisible();
  });

  test("four eyes: the researcher who approved cannot also publish", async ({ page }) => {
    await loginAs(page, "u_admin");
    const created = await page.request.post("/api/items", {
      data: { title_en: "Test coin", title_ar: "مسكوكة اختبار", kind: "coin", images: [{ src: "https://example.org/coin.png", credit: "Test", license: "CC0 1.0" }] },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()).data;
    for (const decision of ["submit", "approve"]) {
      const r = await page.request.post(`/api/items/${id}/transition`, { data: { decision } });
      expect(r.ok()).toBeTruthy();
    }
    const pub = await page.request.post(`/api/items/${id}/transition`, { data: { decision: "publish" } });
    expect(pub.status()).toBe(409);
    expect((await pub.json()).error.code).toBe("four_eyes");
    // A student can't approve, and returning needs a note.
    await loginAs(page, "u_sara");
    expect((await page.request.post(`/api/items/${id}/transition`, { data: { decision: "approve" } })).status()).toBe(409);
  });

  test("inscription task: student reads, matcher proposes, researcher confirms", async ({ page }) => {
    await as(page, "u_omar", "/portal/items/item_astrolabe");
    const panel = page.getByTestId("inscriptions-panel");
    // With no readings yet, the form is already open; otherwise open it.
    const add = panel.getByTestId("add-inscription");
    if (await add.isVisible()) await add.click();
    await panel.getByLabel("Inscription as written on the object").fill("وهو الذي جعل لكم النجوم لتهتدوا بها");
    await panel.getByTestId("find-verses").click();
    await expect(panel.getByTestId("task-preview")).toHaveAttribute("data-status", "exact");
    const chip = panel.getByTestId("task-preview").getByRole("button", { name: "6:97" });
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await panel.getByTestId("save-inscription").click();
    const row = panel.getByTestId("inscription-row").filter({ hasText: "لتهتدوا" });
    await expect(row).toHaveAttribute("data-status", "suggested");
    await expect(row.getByText("Someone other than the reader confirms.")).toBeVisible();
    await expectAccessible(page);

    // Not visible to visitors until confirmed.
    await page.goto("/heritage/item/AST-7");
    await expect(page.getByTestId("item-inscriptions")).toHaveCount(0);

    await as(page, "u_huda", "/portal/items/item_astrolabe");
    const row2 = page.getByTestId("inscription-row").filter({ hasText: "لتهتدوا" });
    await row2.getByTestId("confirm-inscription").click();
    await expect(row2).toHaveAttribute("data-status", "confirmed");

    await page.goto("/heritage/item/AST-7");
    await expect(page.getByTestId("item-inscriptions").getByTestId("inscription-quotes")).toHaveText("Quotes the Quran · 6:97");
  });

  test("portal items in Arabic", async ({ page }) => {
    await setLang(page, "ar");
    await as(page, "u_huda", "/portal/items");
    await expect(page.getByRole("heading", { level: 1, name: "مقتنيات التراث" })).toBeVisible();
    await page.goto("/portal/items/item_tile");
    await expect(page.getByTestId("workflow-panel")).toContainText("اعتماد");
    await expectAccessible(page);
  });

  test("specialists get a friendly no-access state", async ({ page }) => {
    await as(page, "u_yusuf", "/portal/items");
    await expect(page.getByText("Heritage items are for collection teams")).toBeVisible();
    expect((await page.request.get("/api/items")).status()).toBe(403);
  });
});
