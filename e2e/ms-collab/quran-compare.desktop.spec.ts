import { expect, test } from "@playwright/test";
import { openWorkspace, userPage } from "../manuscripts/helpers";
import { accessible, BNF, P3, api, skipTips } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a Quran quotation found by code is confirmed by a researcher and then shown in the public reader", async ({ browser }) => {
  // before: no quote chip in the public reader (proposals are not shown publicly)
  const visitor = await browser.newPage();
  await visitor.goto(`/heritage/manuscripts/${BNF}`);
  await expect(visitor.getByTestId("public-reader")).toBeVisible();
  await expect(visitor.getByTestId("quote-chip")).toHaveCount(0);

  // a student sees the proposal but can't confirm it
  const sara = await userPage(browser, "u_sara");
  const und = (await api<{ quotes: { id: string; verse_keys: string[]; status: string; line_ids: string[]; diff: { op: string }[] }[]; can_confirm: boolean }>(sara.request, "GET", `/api/ms-collab/pages/${P3}/understanding`)).body.data;
  const q = und.quotes.find((x) => x.verse_keys.includes("43:15"))!;
  expect(q).toBeTruthy();
  expect(q.status).toBe("suggested");
  expect(q.line_ids).toEqual([`${P3}-l26`]);
  expect(und.can_confirm).toBe(false);
  expect((await api(sara.request, "PATCH", `/api/ms-collab/annotations/${q.id}`, { status: "confirmed" })).status).toBe(403);

  // the researcher confirms it in the workspace's "Understand" panel
  const huda = await userPage(browser, "u_huda");
  await skipTips(huda);
  await openWorkspace(huda, BNF, P3);
  await expect(huda.locator(`[data-line-row="${P3}-l26"] [data-testid="row-badges"]`)).toContainText("43:15");
  await huda.getByTestId("open-understand").click();
  const card = huda.getByTestId("understanding-panel").locator('[data-testid="quote-card"]').filter({ hasText: "43:15" });
  await expect(card).toHaveAttribute("data-status", "suggested");
  await expect(card.locator(".quran")).toBeVisible(); // the standard text, from KFGQPC, in the Quran font
  await expect(card).toContainText("Same letters as the standard text");
  await accessible(huda);
  await card.getByTestId("quote-confirm").click();
  await expect(card).toHaveAttribute("data-status", "confirmed");

  // the manuscript text did not change
  const v = await (await huda.request.get(`/api/ms/lines/${P3}-l26/versions`)).json();
  expect(v.data.versions[0].kind).toBe("student");

  // after: the public reader shows it as a tappable chip that opens the verse
  await visitor.reload();
  const chip = visitor.getByTestId("quote-chip");
  await expect(chip).toContainText("43:15");
  await chip.click();
  await expect(visitor.getByTestId("verse-sheet")).toContainText("43:15");
  await expect(visitor.getByTestId("verse-sheet").locator(".quran")).toBeVisible();
});

test("the compare view aligns copies, lists variants in an apparatus and syncs the images; with the honest caveat", async ({ browser }) => {
  const huda = await userPage(browser, "u_huda");
  await skipTips(huda);
  await huda.goto("/portal/manuscripts/umich-isl-22");
  await huda.getByTestId("compare-link").first().click();
  await expect(huda).toHaveURL(/\/portal\/manuscripts\/umich-isl-22\/compare$/);
  await expect(huda.getByRole("heading", { level: 1, name: "Compare copies" })).toBeVisible();
  await expect(huda.getByTestId("gt-caveat")).toBeVisible();
  await expect(huda.locator("[data-passage]")).toHaveCount(3);
  const entries = huda.getByTestId("apparatus").locator("[data-entry]");
  expect(await entries.count()).toBeGreaterThan(0);
  await expect(huda.getByTestId("apparatus")).toContainText(/في \(.\):|سقط من \(.\)|زيادة في \(.\)/);
  expect(await huda.getByTestId("compare-pane").count()).toBeGreaterThanOrEqual(2);
  await entries.first().click();
  await expect(entries.first()).toHaveAttribute("aria-pressed", "true");
  // the selected variant is highlighted on the base image and on a witness image
  await expect(huda.getByTestId("compare-pane").first().locator('polygon[data-focus="1"]').first()).toBeVisible();
  expect(await huda.locator('[data-testid="compare-pane"] polygon[data-focus="1"]').count()).toBeGreaterThanOrEqual(2);
  await accessible(huda);

  // another base copy
  await huda.locator(`a[href="/portal/manuscripts/${BNF}/compare"]`).click();
  await expect(huda).toHaveURL(new RegExp(`/portal/manuscripts/${BNF}/compare$`));
  await expect(huda.getByTestId("compare-text")).toBeVisible();
});

test("server-side role checks", async ({ browser, request }) => {
  // not signed in
  expect((await request.get("/api/ms-collab/queue")).status()).toBe(401);
  expect((await request.post(`/api/ms-collab/pages/${P3}/comments`, { data: { body: "x" } })).status()).toBe(401);
  // a specialist can't comment; a student can't approve a page through review, or decide a suggestion she wrote
  const yusuf = await userPage(browser, "u_yusuf");
  expect((await api(yusuf.request, "POST", `/api/ms-collab/pages/${P3}/comments`, { body: "hello" })).status).toBe(403);
  const sara = await userPage(browser, "u_sara");
  expect((await api(sara.request, "POST", `/api/ms-collab/pages/${P3}/review`, { decision: "approve" })).status).toBe(403);
  expect((await api(sara.request, "GET", `/api/ms-collab/hard-words/adjudicate`)).status).toBe(403);
  // validation
  const huda = await userPage(browser, "u_huda");
  expect((await api(huda.request, "POST", `/api/ms-collab/assign`, { page_ids: [], assignee_id: "u_sara" })).status).toBe(400);
  // the researcher can't key words (students read them blind)
  expect((await api(huda.request, "GET", `/api/ms-collab/hard-words/next`)).status).toBe(403);
});
