import { expect, test } from "@playwright/test";
import { as, decide, enc, pointsOf, randomToken, waitSaved } from "./util";

test.describe.configure({ mode: "serial" });

test("full card lifecycle: student → researcher returns → fix → approve → admin publishes → public", async ({ page, request }) => {
  test.setTimeout(180_000);

  // a visitor asked for this concept earlier; publishing should fulfil it
  const req = await request.post("/api/demand", { data: { device_token: randomToken(), concept_id: "olive" } });
  expect(req.status()).toBe(201);

  // ── Sara (student) creates a concept card from the "olive" concept
  await as(page, "u_sara", "/portal/cards/new?concept=olive");
  await expect(page.locator("#title_en")).toHaveValue(/Olive/);
  await page.locator("#title_en").fill("The Olive Tree");
  await page.locator("#title_ar").fill("شجرة الزيتون");
  await page.getByRole("button", { name: /Create and open the editor/ }).click();
  await expect(page).toHaveURL(/\/portal\/cards\/card%3Athe-olive-tree-/);
  const cardUrl = page.url();
  const cardId = decodeURIComponent(cardUrl.split("/portal/cards/")[1]);

  // verse picker: by key, preview from the DB
  await page.getByTestId("verse-search").fill("95:1");
  await page.getByTestId("verse-search").press("Enter");
  await page.getByRole("button", { name: "Add 95:1" }).click();
  await expect(page.getByTestId("selected-verses")).toContainText("95:1");
  await expect(page.getByTestId("card-preview").locator("blockquote.quran")).toBeVisible();

  // explanation with a deliberate lint problem first
  await page.locator("#f-exp-en").fill("The Quran swears by the fig and the olive (95:1). Modern science confirms this.");
  await expect(page.getByTestId("lint-warning").first()).toContainText(/scientific miracle/i);
  await page.locator("#f-exp-en").fill("The Quran swears by the fig and the olive (95:1), two trees long valued in the lands where it was revealed.");
  await page.locator("#f-exp-ar").fill("يُقسم القرآن بالتين والزيتون (التين ١)، وهما شجرتان عُرفت قيمتهما في البلاد التي نزل فيها.");
  await expect(page.getByTestId("lint-warning")).toHaveCount(0);
  await waitSaved(page);
  await expect(page.getByTestId("checklist")).toContainText("All checks pass.");

  // autosave survives a reload
  await page.reload();
  await expect(page.locator("#f-exp-en")).toHaveValue(/two trees long valued/);

  await decide(page, "submit", undefined, /Submitted for review\./);

  // ── Dr. Huda (researcher) returns it with a note
  await as(page, "u_huda", cardUrl);
  await expect(page.locator("[data-decision=approve]")).toBeVisible();
  await decide(page, "return", "Please add 80:29, where the olive is named among Allah's gifts.", /Returned to the author/);

  // ── Sara fixes it and resubmits
  await as(page, "u_sara", cardUrl);
  await expect(page.getByTestId("returned-note")).toContainText("Please add 80:29");
  await page.getByTestId("verse-search").fill("80:29");
  await page.getByTestId("verse-search").press("Enter");
  await page.getByRole("button", { name: "Add 80:29" }).click();
  await page.locator("#f-exp-en").fill("The Quran swears by the fig and the olive (95:1), and names the olive among the gifts that grow from the earth (80:29).");
  await page.locator("#f-exp-ar").fill("يُقسم القرآن بالتين والزيتون (التين ١)، ويذكر الزيتون بين النعم التي تنبتها الأرض (عبس ٢٩).");
  await waitSaved(page);
  await decide(page, "submit", undefined, /Submitted for review\./);

  // ── Huda approves; Sara earns +15 learning points
  const before = await pointsOf(request, "u_sara");
  await as(page, "u_huda", cardUrl);
  await decide(page, "approve", "Verse keys checked.", /Approved\. The institution can now publish it\./);
  expect(await pointsOf(request, "u_sara")).toBe(before + 15);

  // ── Noura (institution approver) publishes
  await as(page, "u_noura", cardUrl);
  await expect(page.getByTestId("workflow-bar").locator("[data-state=current]")).toContainText("Researcher approved");
  await decide(page, "publish", undefined, /Published\. Visitors can see it now\./);
  await page.reload();
  await expect(page.getByTestId("workflow-bar").locator("li").last()).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("workflow-bar")).toContainText("Dr. Noura Al-Saleh");

  // history: readable diff between versions
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByTestId("diff")).toBeVisible();
  await expect(page.getByTestId("review-timeline")).toContainText("returned");

  // the visitor request for "olive" is now fulfilled
  await request.post("/api/session", { data: { userId: "u_huda", pin: "1448" } });
  const board = await (await request.get("/api/demand")).json();
  const olive = board.data.groups.find((g: { concept_id: string }) => g.concept_id === "olive");
  expect(olive.status).toBe("fulfilled");
  expect(olive.card.id).toBe(cardId);

  // ── the public concept page shows the published card (published_version only)
  const pub = await page.request.get("/c/olive");
  if (pub.status() === 404) {
    // /c/[conceptId] belongs to the beneficiary builder; until it is merged, check the published list instead
    test.info().annotations.push({ type: "note", description: "/c/olive route not present in this worktree; verified via /api/cards?published=1" });
    const list = await (await request.get("/api/cards?published=1&q=olive")).json();
    expect(list.data.items.map((c: { id: string }) => c.id)).toContain(cardId);
  } else {
    await page.goto("/c/olive");
    await expect(page.getByText("The Olive Tree").first()).toBeVisible();
  }
});

test("editing a published card never changes what visitors see until republished", async ({ page, request }) => {
  await as(page, "u_huda", `/portal/cards/${enc("card:moon")}`);
  const title = page.locator("#f-title-en");
  await title.fill("The Moon (revised)");
  await waitSaved(page);
  await page.reload();
  await expect(page.getByText("Revising the live card")).toBeVisible();
  // the live card still carries the published title
  await request.post("/api/session", { data: { userId: "u_huda", pin: "1448" } });
  const list = await (await request.get("/api/cards?published=1&q=moon")).json();
  const moon = list.data.items.find((c: { id: string }) => c.id === "card:moon");
  expect(moon.title_en).toBe("The Moon");
  // put it back so the demo stays tidy
  await title.fill("The Moon");
  await waitSaved(page);
});
