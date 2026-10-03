import { expect, test } from "@playwright/test";
import { userPage } from "../manuscripts/helpers";
import { accessible, BNF, P1, api, skipTips } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a student completes an assigned task: My work → Continue at the right line → save → submit; the researcher reviews and approves", async ({ browser }) => {
  const sara = await userPage(browser, "u_sara");
  await skipTips(sara);
  const before = (await api<{ points: number }>(sara.request, "GET", "/api/ms-collab/progress")).body.data.points;

  await sara.goto("/portal/manuscripts/queue");
  await expect(sara.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  const card = sara.locator(`[data-testid="task-card"]`).filter({ hasText: "Check and correct the transcription" }).first();
  await expect(card).toContainText("Urgent");
  await expect(card.getByTestId("task-progress")).toContainText("0 of");
  await accessible(sara);

  // one obvious Continue → the workspace, at the first line nobody checked
  await card.getByTestId("task-continue").click();
  await expect(sara).toHaveURL(new RegExp(`/portal/manuscripts/${BNF}/pages/${P1}\\?line=${P1}-l`));
  await expect(sara.getByTestId("workspace")).toBeVisible();
  const lineId = new URL(sara.url()).searchParams.get("line")!;
  const ed = sara.locator(`#ed-${lineId}`);
  await expect(ed).toBeVisible();
  // the collaboration panel under the editor
  await expect(sara.getByTestId("line-collab")).toBeVisible();
  await ed.fill("قال المصنف رحمه الله");
  await ed.press("Control+KeyS");
  await expect(sara.getByTestId("save-state")).toContainText("Saved");

  // progress in My work
  await sara.goto("/portal/manuscripts/queue");
  await expect(sara.locator(`[data-testid="task-card"]`).first().getByTestId("task-progress")).toContainText("1 of");

  // submit the page (Studio workflow), the task is done
  await sara.goto(`/portal/manuscripts/${BNF}/pages/${P1}`);
  await sara.locator('[data-decision="submit"]').click();
  await sara.getByTestId("wf-confirm").click();
  await expect(sara.locator('[data-decision="submit"]')).toHaveCount(0);
  await sara.goto("/portal/manuscripts/queue");
  await expect(sara.getByText("Submitted for review").first()).toBeVisible();

  // the researcher sees it in the review queue and reviews the diff
  const huda = await userPage(browser, "u_huda");
  await skipTips(huda);
  await huda.goto("/portal/manuscripts/queue");
  const row = huda.locator(`[data-review-page="${P1}"]`);
  await expect(row).toBeVisible();
  await accessible(huda);
  await row.getByTestId("review-open").click();
  await expect(huda.getByTestId("review")).toBeVisible();
  const changed = huda.locator(`[data-review-line="${lineId}"]`);
  await expect(changed).toHaveAttribute("data-changed", "1");
  await expect(changed.locator("ins").first()).toBeVisible();
  await accessible(huda);
  // compare against the machine draft (same here: no approved version yet)
  await huda.getByRole("tab", { name: "Machine draft" }).click();
  await expect(huda.locator(`[data-review-line="${lineId}"]`)).toHaveAttribute("data-changed", "1");
  await huda.getByTestId("review-approve").click();
  await huda.getByTestId("review-confirm").click();
  await expect(huda).toHaveURL(/\/portal\/manuscripts\/queue$/);

  // accepted work earns the student points (only accepted work, once)
  const after = (await api<{ points: number }>(sara.request, "GET", "/api/ms-collab/progress")).body.data.points;
  expect(after - before).toBeGreaterThanOrEqual(2); // 2 for a main-text line, 4 for a margin
  expect(after - before).toBeLessThanOrEqual(4);
  const again = (await api<{ points: number }>(sara.request, "GET", "/api/ms-collab/progress")).body.data.points;
  expect(again).toBe(after);
});

test("a researcher assigns a page; the student sees it at once", async ({ browser }) => {
  const huda = await userPage(browser, "u_huda");
  await skipTips(huda);
  await huda.goto("/portal/manuscripts/queue");
  await huda.getByRole("tab", { name: "Assign pages" }).click();
  await expect(huda.getByTestId("assign-panel")).toBeVisible();
  await huda.locator('[data-student="u_omar"]').click();
  await huda.locator('[data-assign-page="bnf-arabe-5341_04"]').click();
  await huda.getByLabel("Task").selectOption("verify");
  await huda.getByTestId("assign-submit").click();
  await expect(huda.getByText(/Assigned 1 pages to Omar Haddad/)).toBeVisible();
  await accessible(huda);

  const omar = await userPage(browser, "u_omar");
  await skipTips(omar);
  await omar.goto("/portal/manuscripts/queue");
  await expect(omar.locator('[data-testid="task-card"]').filter({ hasText: "Verify the selected lines" })).toBeVisible();
  // students can't assign
  const r = await api(omar.request, "POST", "/api/ms-collab/assign", { page_ids: ["bnf-arabe-5341_04"], assignee_id: "u_sara", kind: "transcribe" });
  expect(r.status).toBe(403);
});

test("the dashboard shows the manuscript-work card with one way in", async ({ browser }) => {
  const sara = await userPage(browser, "u_sara");
  await sara.goto("/portal");
  await expect(sara.getByTestId("ms-work-card")).toBeVisible();
  await sara.getByTestId("ms-work-open").click();
  await expect(sara).toHaveURL(/\/portal\/manuscripts\/queue$/);
});
