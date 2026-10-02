import { expect, test } from "@playwright/test";
import { as, decide, enc, makeSubmittedCard } from "./util";

test("four-eyes: the person who approved a version cannot also publish it", async ({ page, request }) => {
  const id = await makeSubmittedCard(request, "The Sun (four-eyes test)");
  const url = `/portal/cards/${enc(id)}`;
  // the platform admin may act as researcher…
  await as(page, "u_admin", url);
  await decide(page, "approve", "Approving as researcher (demo).", /Approved\. The institution can now publish it\./);
  await page.reload();
  // …but then publishing the same version is refused by the server
  await page.locator("[data-decision=publish]").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("confirm-decision").click();
  await expect(dialog.getByText(/Four-eyes rule/).last()).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(/can't also publish/);
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // same rule through the API
  await request.post("/api/session", { data: { userId: "u_admin", pin: "1448" } });
  const r = await request.post(`/api/cards/${enc(id)}/transition`, { data: { decision: "publish" } });
  expect(r.status()).toBe(409);
  expect((await r.json()).error.code).toBe("four_eyes");

  // a different institution approver can publish it
  await as(page, "u_noura", url);
  await decide(page, "publish", undefined, /Published\. Visitors can see it now\./);
});

test("server refuses workflow actions outside a role, whatever the client sends", async ({ request }) => {
  await request.post("/api/session", { data: { userId: "u_sara", pin: "1448" } });
  const publish = await request.post(`/api/cards/${enc("card:demo-date-palm")}/transition`, { data: { decision: "publish" } });
  expect(publish.status()).toBe(403);
  const approve = await request.post(`/api/cards/${enc("card:demo-date-palm")}/transition`, { data: { decision: "approve" } });
  expect([403, 409]).toContain(approve.status());

  // a return without a note is refused
  await request.post("/api/session", { data: { userId: "u_huda", pin: "1448" } });
  const ret = await request.post(`/api/cards/${enc("card:demo-date-palm")}/transition`, { data: { decision: "return", note: "" } });
  expect(ret.status()).toBe(400);
  expect((await ret.json()).error.code).toBe("note_required");

  // another institution's approver can't publish it
  await request.post("/api/session", { data: { userId: "u_khalid", pin: "1448" } });
  const other = await request.post(`/api/cards/${enc("card:demo-date-palm")}/transition`, { data: { decision: "publish" } });
  expect([403, 404]).toContain(other.status());

  // a specialist can't touch cards at all
  await request.post("/api/session", { data: { userId: "u_yusuf", pin: "1448" } });
  expect((await request.get("/api/cards")).status()).toBe(403);

  // visitors (no session) can't either
  await request.delete("/api/session");
  expect((await request.put(`/api/cards/${enc("card:demo-stars")}`, { data: {} })).status()).toBe(401);
});

test("submitting is blocked until the validation checklist passes", async ({ page, request }) => {
  await as(page, "u_sara", `/portal/cards/${enc("card:demo-stars")}`);
  await expect(page.getByTestId("checklist").locator("[data-check=explanation_bilingual]")).toHaveAttribute("data-ok", "false");
  await page.locator("[data-decision=submit]").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Fix the checklist first")).toBeVisible();
  await expect(dialog.getByTestId("confirm-decision")).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  // and the server agrees
  await request.post("/api/session", { data: { userId: "u_sara", pin: "1448" } });
  const r = await request.post(`/api/cards/${enc("card:demo-stars")}/transition`, { data: { decision: "submit" } });
  expect(r.status()).toBe(422);
});
