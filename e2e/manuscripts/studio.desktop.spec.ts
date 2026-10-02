import path from "node:path";
import { expect, test } from "@playwright/test";
import { expectAccessible, loginAs } from "../helpers";
import { MS, editor, lineId, openWorkspace, pageUrl, selectRange, selectRow, setText, userPage, versions } from "./helpers";

test.describe.configure({ mode: "serial" });

test("library → manuscript → page; select a line from the text and from the image", async ({ page }) => {
  await loginAs(page, "u_sara");
  await page.goto("/portal/manuscripts");
  await expect(page.getByRole("heading", { level: 1, name: "Manuscript Studio" })).toBeVisible();
  await expect(page.getByText("3 copies of the same work")).toBeVisible();
  await expectAccessible(page);

  await page.locator(`a[href="/portal/manuscripts/${MS}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/portal/manuscripts/${MS}$`));
  await expect(page.getByRole("heading", { name: /^Pages/ })).toBeVisible();
  await expect(page.getByText("Public Domain (HathiTrust", { exact: false })).toBeVisible();
  await expectAccessible(page);

  await page.locator(`a[href="${pageUrl(MS, "umich-isl-22_02")}"]`).click();
  await expect(page.getByTestId("workspace")).toBeVisible();

  // via the text
  const id3 = lineId("umich-isl-22_02", 3);
  await selectRow(page, id3);
  await expect(page.locator(`polygon[data-line="${id3}"]`)).toHaveAttribute("fill-opacity", "0.17");
  await expect(editor(page, id3)).toBeFocused();

  // via the image polygon
  const id9 = lineId("umich-isl-22_02", 9);
  await page.keyboard.press("Escape"); // leave the editor
  await page.locator(`polygon[data-line="${id9}"]`).click();
  await expect(page.locator(`[data-line-row="${id9}"][aria-current="true"]`)).toBeVisible();
  await expect(page.locator(`polygon[data-line="${id9}"]`)).toHaveAttribute("fill-opacity", "0.17");
  await expectAccessible(page);
});

test("edit a line with an unclear mark and an abbreviation; saving adds a version", async ({ page }) => {
  await loginAs(page, "u_sara");
  const pg = "umich-isl-22_01";
  const id = lineId(pg, 3);
  await openWorkspace(page, MS, pg);
  await selectRow(page, id);
  const before = (await versions(page, id)).length;

  await setText(page, id, "قال وة بالنهروان");
  // unclear on «بالنهروان» (Ctrl+Shift+U uses the physical key)
  await selectRange(page, id, 7, 16);
  await page.keyboard.press("Control+Shift+KeyU");
  // abbreviation «ة» → قرية, suggested for the lexicon genre and confirmed by a person
  await selectRange(page, id, 5, 6);
  await page.keyboard.press("Control+Shift+KeyE");
  await expect(page.getByRole("button", { name: /قرية/ })).toBeVisible();
  await page.getByRole("button", { name: "Confirm expansion" }).click();
  await expect(page.getByTestId("reading-layer")).toContainText("وقرية");
  await expect(editor(page, id)).toHaveValue("قال وة بالنهروان"); // the diplomatic text is unchanged

  await editor(page, id).focus();
  await page.keyboard.press("Control+KeyS");
  await expect(page.getByTestId("save-state")).toContainText(`Saved · version ${before + 1}`);

  const vs = await versions(page, id);
  expect(vs.length).toBe(before + 1);
  expect(vs[0].kind).toBe("student");
  expect(vs[0].plain_text).toBe("قال وة بالنهروان");
  expect(vs[0].tokens).toEqual([
    { t: "text", v: "قال و" },
    { t: "abbr", v: "ة", expan: "قرية" },
    { t: "text", v: " " },
    { t: "unclear", v: "بالنهروان" },
  ]);

  // history shows every version
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByTestId("history").locator("[data-version]")).toHaveCount(before + 1);
});

test("clicking an uncertain word shows its alternatives; accepting one makes it certain text", async ({ page }) => {
  await loginAs(page, "u_omar");
  const pg = "umich-isl-22_03";
  const id = lineId(pg, 5);
  await openWorkspace(page, MS, pg);
  await page.locator(`[data-line-row="${id}"] [data-kind="unclear"]`).first().click();
  await expect(page.locator(`[data-line-row="${id}"][aria-current="true"]`)).toBeVisible();
  const alt = page.getByRole("button", { name: "Accept «حُفَاءَةُ»" });
  await expect(alt).toBeVisible();
  await alt.click();
  await expect(editor(page, id)).toHaveValue(/حُفَاءَةُ/);
  await page.keyboard.press("Control+KeyS");
  await expect(page.getByTestId("save-state")).toContainText("Saved");
  const vs = await versions(page, id);
  expect(vs[0].tokens.some((k) => k.t === "unclear" && k.v === "جُفَاءَةُ")).toBe(false);
});

test("a 409 conflict opens the merge dialog with both versions", async ({ browser }) => {
  const pg = "umich-isl-22_01";
  const id = lineId(pg, 8);
  const a = await userPage(browser, "u_sara");
  const b = await userPage(browser, "u_omar");
  // A's lock calls never reach the server: this simulates A's lock having expired while A kept typing.
  await a.route("**/api/ms/lines/*/lock", (r) => r.fulfill({ json: { ok: true, data: {} } }));
  await openWorkspace(a, MS, pg);
  await selectRow(a, id);
  await setText(a, id, "نص سارة");

  await openWorkspace(b, MS, pg);
  await selectRow(b, id);
  await setText(b, id, "نص عمر");
  await b.keyboard.press("Control+KeyS");
  await expect(b.getByTestId("save-state")).toContainText("Saved");
  await b.keyboard.press("Escape");

  await editor(a, id).focus();
  await a.keyboard.press("Control+KeyS");
  const dialog = a.getByTestId("merge-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("نص عمر");
  await expect(dialog).toContainText("نص سارة");
  await a.getByRole("button", { name: "Save mine on top" }).click();
  await expect(a.getByTestId("save-state")).toContainText("Saved");
  const vs = await versions(a, id);
  expect(vs[0].plain_text).toBe("نص سارة");
  expect(vs[1].plain_text).toBe("نص عمر");
  await a.context().close();
  await b.context().close();
});

test("the second user sees who is editing a line", async ({ browser }) => {
  const pg = "umich-isl-22_01";
  const id = lineId(pg, 10);
  const a = await userPage(browser, "u_sara");
  const b = await userPage(browser, "u_huda");
  await openWorkspace(b, MS, pg);
  await openWorkspace(a, MS, pg);
  await selectRow(a, id);
  await expect(editor(a, id)).toBeVisible();
  // live via the page event stream
  await expect(b.locator(`[data-line-row="${id}"] [data-testid="row-lock"]`)).toBeVisible({ timeout: 15_000 });
  await expect(b.locator(`polygon[data-line="${id}"]`)).toHaveAttribute("stroke-dasharray", "6 4");
  await selectRow(b, id);
  await expect(b.getByTestId("lock-notice")).toContainText("Sara Al-Harbi");
  await expect(editor(b, id)).toHaveAttribute("readonly", "");
  await a.context().close();
  await b.context().close();
});

test("upload a page, detect lines automatically, then draw a line by hand", async ({ page }) => {
  await loginAs(page, "u_huda");
  await page.goto("/portal/manuscripts/bnf-arabe-5341");
  await page.getByRole("button", { name: "Upload pages" }).click();
  await page.locator("#up-files").setInputFiles(path.join(process.cwd(), "data/manuscripts/bnf-arabe-5341/pages/bnf-arabe-5341_02.jpg"));
  await expect(page.getByText("1 image(s) selected")).toBeVisible();
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page).toHaveURL(/\/pages\/pg_/, { timeout: 30_000 });
  await expect(page.getByTestId("workspace")).toBeVisible();
  const rows = page.locator("[data-line-row]");
  await expect(rows.first()).toBeVisible();
  const detected = await rows.count();
  expect(detected).toBeGreaterThan(15);

  await page.getByRole("button", { name: "Edit layout" }).click();
  await page.getByRole("button", { name: "Draw a line" }).click();
  const box = (await page.getByTestId("image-pane").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.85);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.88, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByText("Line added")).toBeVisible();
  await expect(rows).toHaveCount(detected + 1);
});

test("page workflow: submit, approve, publish with four eyes", async ({ browser, request }) => {
  const pg = "sbb-or-fol-215_02";
  const ms = "sbb-or-fol-215";
  const id = lineId(pg, 2);
  const sara = await userPage(browser, "u_sara");
  await openWorkspace(sara, ms, pg);
  await selectRow(sara, id);
  await setText(sara, id, "وبؤبؤ الوزير");
  await sara.keyboard.press("Control+KeyS");
  await expect(sara.getByTestId("save-state")).toContainText("Saved");
  await sara.locator('[data-decision="submit"]').click();
  await sara.getByTestId("wf-confirm").click();
  await expect(sara.locator(`[aria-current="step"]`)).toContainText("Student");
  await expect(sara.locator(`[data-decision="submit"]`)).toHaveCount(0);
  await sara.context().close();

  const huda = await userPage(browser, "u_huda");
  await openWorkspace(huda, ms, pg);
  await huda.locator('[data-decision="approve"]').click();
  await huda.getByTestId("wf-confirm").click();
  await expect(huda.locator(`[aria-current="step"]`)).toContainText("Researcher");
  await expect(huda.locator('[data-decision="publish"]')).toHaveCount(0); // a researcher can't publish
  await huda.context().close();

  const khalid = await userPage(browser, "u_khalid");
  await openWorkspace(khalid, ms, pg);
  await khalid.locator('[data-decision="publish"]').click();
  await khalid.getByTestId("wf-confirm").click();
  await expect(khalid.getByTestId("published-banner")).toContainText("Published version 1");
  await khalid.context().close();

  // Four eyes in code: the same person cannot approve and publish.
  const login = await request.post("/api/session", { data: { userId: "u_admin", pin: "1448" } });
  expect(login.ok()).toBeTruthy();
  const p2 = "sbb-or-fol-215_03";
  const save = await request.put(`/api/ms/lines/${lineId(p2, 2)}`, { data: { base_version: 1, tokens: [{ t: "text", v: "x" }] } });
  expect(save.ok()).toBeTruthy();
  const sub = await request.post(`/api/ms/pages/${p2}/workflow`, { data: { decision: "submit" } });
  expect(sub.ok()).toBeTruthy();
  const appr = await request.post(`/api/ms/pages/${p2}/workflow`, { data: { decision: "approve" } });
  expect(appr.status()).toBe(409); // the submitter cannot approve
  expect((await appr.json()).error.code).toBe("four_eyes");
});

test("TEI export is well-formed and carries the licence", async ({ page }) => {
  await loginAs(page, "u_sara");
  await page.goto("/portal/manuscripts");
  const r = await page.request.get(`/api/ms/pages/umich-isl-22_01/export?format=tei`);
  expect(r.ok()).toBeTruthy();
  const xml = await r.text();
  expect(xml).toContain("<TEI xmlns=\"http://www.tei-c.org/ns/1.0\"");
  expect(xml).toContain("HathiTrust");
  const errors = await page.evaluate((s) => {
    const doc = new DOMParser().parseFromString(s, "application/xml");
    return doc.getElementsByTagName("parsererror").length;
  }, xml);
  expect(errors).toBe(0);
  const ms = await page.request.get(`/api/ms/manuscripts/umich-isl-22/export?format=jsonl`);
  expect(ms.ok()).toBeTruthy();
});

test("Arabic UI: right-to-left workspace with the editor and evaluation panel", async ({ page, context }) => {
  await page.goto("/portal/login");
  await context.addCookies([{ name: "lang", value: "ar", url: page.url() }]);
  await loginAs(page, "u_huda");
  await page.goto("/portal/manuscripts");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "استوديو المخطوطات" })).toBeVisible();
  await openWorkspace(page, "sbb-or-fol-215", "sbb-or-fol-215_01");
  await selectRow(page, lineId("sbb-or-fol-215_01", 4));
  await expect(page.getByText("كما في المخطوط").first()).toBeVisible();
  await expectAccessible(page);
  await page.getByTestId("open-eval").click();
  await expect(page.getByTestId("eval")).toContainText("النص المرجعي لهذه النسخة غير موثوق");
  await expectAccessible(page);
});
