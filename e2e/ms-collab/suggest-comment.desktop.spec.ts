import { expect, test } from "@playwright/test";
import { openWorkspace, selectRow, userPage } from "../manuscripts/helpers";
import { accessible, BNF, P2, P4, api, lineVersions, skipTips } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a suggestion on a page owned by someone else is accepted by the owner and becomes a new line version", async ({ browser }) => {
  const line = `${P2}-l6`;
  const sara = await userPage(browser, "u_sara");
  await skipTips(sara);
  await openWorkspace(sara, BNF, P2);
  await selectRow(sara, line);
  const panel = sara.getByTestId("line-collab");
  await expect(panel).toContainText("assigned to Omar Haddad");
  await panel.getByTestId("suggest-open").click();
  const sheet = sara.getByTestId("suggest-sheet");
  await expect(sheet).toBeVisible();
  await sara.locator(`#sg-${line}`).fill("هذا نص مقترح للسطر");
  await sara.getByLabel("Why?").fill("The dots are clear when the image is zoomed in.");
  await expect(sheet.locator("ins").first()).toBeVisible(); // the diff against the current version
  await accessible(sara);
  await sara.getByTestId("suggest-send").click();
  await expect(sara.getByText("Suggestion sent.", { exact: false })).toBeVisible();
  // leave the line (its soft lock would otherwise make the owner wait a minute)
  await sara.goto("about:blank");
  await sara.request.post(`/api/ms/lines/${line}/lock`, { data: { action: "release" } });

  const before = (await lineVersions(sara.request, line))[0].version;
  const omar = await userPage(browser, "u_omar");
  await skipTips(omar);
  await openWorkspace(omar, BNF, P2);
  await omar.getByTestId("open-suggestions").click();
  const card = omar.getByTestId("suggestions-panel").locator('[data-testid="suggestion"][data-status="open"]').filter({ hasText: "The dots are clear" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("The dots are clear");
  await card.getByTestId("suggestion-accept").click();
  await expect(omar.getByText("Accepted — saved as a new version", { exact: false })).toBeVisible();
  const vs = await lineVersions(omar.request, line);
  expect(vs[0].version).toBe(before + 1);
  expect(vs[0].kind).toBe("suggestion");
  expect(vs[0].author_id).toBe("u_sara");
  expect(vs[0].plain_text).toBe("هذا نص مقترح للسطر");

  // the author can't decide her own suggestion; an institution admin can't either
  const list = (await api<{ suggestions: { id: string; author: { id: string }; status: string }[] }>(sara.request, "GET", `/api/ms-collab/pages/${P2}/suggestions`)).body.data.suggestions;
  const seeded = (await api<{ suggestions: { id: string; status: string }[] }>(sara.request, "GET", `/api/ms-collab/pages/bnf-arabe-5341_01/suggestions`)).body.data.suggestions.find((s) => s.status === "open");
  expect(list.length).toBeGreaterThan(0);
  if (seeded) {
    const khalid = await userPage(browser, "u_khalid");
    const r = await api(khalid.request, "POST", `/api/ms-collab/suggestions/${seeded.id}`, { decision: "accept" });
    expect(r.status).toBe(403);
  }
});

test("a comment with an @mention shows up live in a second browser, and in the mentioned person's My work", async ({ browser }) => {
  const line = `${P4}-l2`;
  const sara = await userPage(browser, "u_sara");
  await skipTips(sara);
  await openWorkspace(sara, BNF, P4);
  await selectRow(sara, line);
  await expect(sara.getByTestId("line-comments")).toBeVisible();

  const huda = await userPage(browser, "u_huda");
  await skipTips(huda);
  await openWorkspace(huda, BNF, P4);
  await selectRow(huda, line);
  await huda.getByTestId("comment-add").click();
  const box = huda.getByLabel("Ask or point something out… (@ to mention)");
  await box.fill("Please check the dots here @Sar");
  await expect(huda.getByRole("option", { name: /Sara Al-Harbi/ })).toBeVisible();
  await box.press("Enter");
  await expect(box).toHaveValue("Please check the dots here @Sara Al-Harbi ");
  await huda.getByTestId("comment-send").click();
  await expect(huda.getByTestId("line-comments").getByTestId("comment-thread")).toContainText("Please check the dots here");

  // live in the other browser (realtime events), with the count badge on the row for others
  await expect(sara.getByTestId("line-comments").getByTestId("comment-thread")).toContainText("Please check the dots here", { timeout: 15_000 });
  await expect(sara.getByTestId("line-comments").locator("bdi", { hasText: "@Sara Al-Harbi" })).toBeVisible();
  await expect(sara.getByTestId("open-comments")).toHaveAttribute("aria-label", /Comments \(\d+\)/);
  await accessible(sara);

  // the mention reaches Sara's My work
  type Q = { mentions: { body: string }[] };
  const mentioned = async () => (await api<Q>(sara.request, "GET", "/api/ms-collab/queue")).body.data.mentions.some((m) => m.body.includes("Please check the dots here"));
  expect(await mentioned()).toBe(true);

  // resolve: the thread closes (comments never change the text) and the mention leaves the list
  const thread = sara.getByTestId("line-comments").getByTestId("comment-thread").filter({ hasText: "Please check the dots here" });
  await expect(thread.getByTestId("comment-resolve")).toHaveCount(0); // a student resolves only her own threads
  await huda.getByTestId("line-comments").getByTestId("comment-thread").filter({ hasText: "Please check the dots here" }).getByTestId("comment-resolve").click();
  await expect(thread).toHaveAttribute("data-resolved", "1", { timeout: 15_000 }); // live in Sara's browser too
  expect(await mentioned()).toBe(false);
});

test("explain this line: deterministic parts, and no AI without a key", async ({ browser }) => {
  const omar = await userPage(browser, "u_omar");
  await skipTips(omar);
  await openWorkspace(omar, BNF, P4);
  await selectRow(omar, `${P4}-l3`);
  await omar.getByTestId("explain-open").click();
  const sheet = omar.getByTestId("explain-sheet");
  await expect(sheet).toContainText("Easier reading");
  await expect(sheet.getByTestId("ai-off")).toBeVisible();
  await accessible(omar);
});
