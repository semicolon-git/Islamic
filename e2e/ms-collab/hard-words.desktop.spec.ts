import { expect, test, type Page } from "@playwright/test";
import { userPage } from "../manuscripts/helpers";
import { accessible, P4, lineVersions, skipTips } from "./helpers";

test.describe.configure({ mode: "serial" });

const URL4 = `/portal/manuscripts/queue/hard-words?page=${P4}`;

async function current(page: Page) {
  const card = page.getByTestId("hard-card-item");
  await expect(card).toBeVisible();
  return { id: (await card.getAttribute("data-item"))!, line: (await card.getAttribute("data-line"))! };
}

test("two students key a hard word blind; they disagree; the researcher adjudicates and a consensus version is written", async ({ browser }) => {
  const sara = await userPage(browser, "u_sara");
  await skipTips(sara);
  // the API never sends the machine guess or another reading before you submit
  const next = await (await sara.request.get(`/api/ms-collab/hard-words/next?page=${P4}`)).json();
  expect(Object.keys(next.data.item)).not.toContain("token_text");
  expect(Object.keys(next.data.item)).not.toContain("alts");

  await sara.goto(URL4);
  await expect(sara.getByRole("heading", { level: 1, name: "Hard words" })).toBeVisible();
  const word = await current(sara);
  await expect(sara.getByTestId("hard-context")).toContainText("▒▒▒");
  await expect(sara.getByTestId("word-box")).toBeVisible();
  await expect(sara.getByTestId("hw-input")).toBeFocused();
  await accessible(sara);
  await sara.getByTestId("hw-input").fill("فلان");
  await sara.keyboard.press("Enter");
  const r1 = sara.getByTestId("hw-result");
  await expect(r1).toHaveAttribute("data-outcome", "waiting");
  await expect(r1).toContainText("Machine's guess"); // revealed only after submitting

  // the second student gets the same word first (to complete the pair) and still doesn't see the first reading
  const omar = await userPage(browser, "u_omar");
  await skipTips(omar);
  await omar.goto(URL4);
  const w2 = await current(omar);
  expect(w2.id).toBe(word.id);
  await expect(omar.getByText("You're the second reader")).toBeVisible();
  await expect(omar.getByTestId("keying")).not.toContainText("فلان");
  await omar.getByTestId("hw-input").fill("علان");
  await omar.getByTestId("hw-submit").click();
  const r2 = omar.getByTestId("hw-result");
  await expect(r2).toHaveAttribute("data-outcome", "disputed");
  await expect(r2).toContainText("فلان");

  // the researcher decides with one click; the decision is a new `consensus` line version
  const before = (await lineVersions(omar.request, word.line))[0].version;
  const huda = await userPage(browser, "u_huda");
  await skipTips(huda);
  await huda.goto("/portal/manuscripts/queue/hard-words");
  await expect(huda.getByRole("heading", { level: 1, name: "Decide disputed words" })).toBeVisible();
  const dispute = huda.locator(`[data-testid="dispute"][data-item="${word.id}"]`);
  await expect(dispute).toBeVisible();
  await expect(dispute).toContainText("فلان");
  await expect(dispute).toContainText("علان");
  await accessible(huda);
  await dispute.locator("[data-choice]").filter({ hasText: "علان" }).click();
  await expect(dispute).toHaveCount(0);
  const vs = await lineVersions(huda.request, word.line);
  expect(vs[0].version).toBe(before + 1);
  expect(vs[0].kind).toBe("consensus");
  expect(vs[0].plain_text).toContain("علان");

  // students can't adjudicate
  const denied = await sara.request.post(`/api/ms-collab/hard-words/${word.id}/decide`, { data: { text: "فلان" } });
  expect(denied.status()).toBe(403);
});

test("when both readings agree after normalisation, the consensus is written automatically", async ({ browser }) => {
  const sara = await userPage(browser, "u_sara");
  await skipTips(sara);
  await sara.goto(URL4);
  const word = await current(sara);
  await sara.getByTestId("hw-input").fill("بَيْت");
  await sara.keyboard.press("Enter");
  await expect(sara.getByTestId("hw-result")).toHaveAttribute("data-outcome", "waiting");
  // Enter → next word (keyboard-first)
  await sara.keyboard.press("Enter");
  await expect(sara.getByTestId("hw-input")).toBeFocused();

  const omar = await userPage(browser, "u_omar");
  await skipTips(omar);
  await omar.goto(URL4);
  expect((await current(omar)).id).toBe(word.id);
  await omar.getByTestId("hw-input").fill("بيت"); // same letters, no vowel signs
  await omar.keyboard.press("Enter");
  await expect(omar.getByTestId("hw-result")).toHaveAttribute("data-outcome", "agreed");
  const vs = await lineVersions(omar.request, word.line);
  expect(vs[0].kind).toBe("consensus");
  expect(vs[0].plain_text).toContain("بيت");
  expect(vs[0].note).toMatch(/vowel signs differed/);
});

test("skip and \"can't read\" work from the keyboard", async ({ browser }) => {
  const sara = await userPage(browser, "u_sara");
  await skipTips(sara);
  await sara.goto(URL4);
  const a = await current(sara);
  await sara.keyboard.press("Escape");
  await expect(sara.getByTestId("hard-card-item")).not.toHaveAttribute("data-item", a.id);
  await sara.getByTestId("hw-input").focus();
  await sara.keyboard.press("Control+Shift+KeyU");
  await expect(sara.getByTestId("hw-result")).toHaveAttribute("data-outcome", "waiting");
  await expect(sara.getByTestId("hw-result")).toContainText("Can't read (illegible)");
});
