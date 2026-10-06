import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { expectAccessible, loginAs } from "../helpers";

const PDF = path.join(__dirname, "../fixtures/sample-english-text.pdf");

test("upload a PDF → read from its text layer → four-eyes approval → searchable", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await loginAs(page, "u_huda");
  await page.goto("/portal/library");
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await expect(page.locator('[data-book="tafsir-muyassar"]')).toBeVisible();
  await expectAccessible(page);

  await page.locator("#lib-file").setInputFiles(PDF);
  await page.locator("#lib-ten").fill("Notes on Gardens (test)");
  await page.locator("#lib-tar").fill("ملاحظات في البساتين");
  await page.locator("#lib-lic").fill("Written for this test");
  await page.locator('input[name="rights"]').check();
  await page.getByRole("button", { name: "Upload and read" }).click();
  const row = page.getByTestId("uploaded-books").locator("[data-book]").first();
  await expect(row).toContainText("Notes on Gardens", { timeout: 15_000 });
  await expect(row).toContainText("Waiting for approval", { timeout: 60_000 });
  const id = await row.getAttribute("data-book");
  await row.click();
  await expect(page.getByTestId("book-title")).toHaveText("Notes on Gardens (test)");
  await expect(page.getByText("Text layer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve for public answers" })).toHaveCount(0); // a researcher can't approve
  await expect(page.getByText("An institution admin reviews and approves it")).toBeVisible();

  const admin = await browser.newPage();
  await loginAs(admin, "u_noura");
  await admin.goto(`/portal/library/${id}`);
  await admin.getByRole("button", { name: "Approve for public answers" }).click();
  await expect(admin.getByText("Approved for answers")).toBeVisible();
  await admin.locator("#book-q").fill("olive");
  await admin.locator('form[role="search"] button').click();
  await expect(admin.getByTestId("passages").locator("li")).toHaveCount(1);
  await expect(admin.getByTestId("passages")).toContainText("lamps");
  const file = await admin.request.get(`/api/library/books/${id}/file`);
  expect(file.headers()["content-type"]).toBe("application/pdf");
  await admin.close();
});

test("the uploader can't approve their own book (four-eyes)", async ({ page }) => {
  await loginAs(page, "u_khalid");
  const fd = { file: { name: "a.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(PDF) }, title_en: "Own book", licence_note: "test", rights: "yes" };
  const up = await page.request.post("/api/library/books", { multipart: fd });
  expect(up.status()).toBe(201);
  const id = (await up.json()).data.id;
  await expect.poll(async () => (await (await page.request.get(`/api/library/books/${id}`)).json()).data.book.status, { timeout: 60_000 }).toBe("draft");
  const r = await page.request.post(`/api/library/books/${id}`, { data: { action: "approve" } });
  expect(r.status()).toBe(403);
  expect((await r.json()).error.code).toBe("four_eyes");
  expect((await page.request.post(`/api/library/books/${id}`, { data: { action: "delete" } })).ok()).toBeTruthy();
});

test("uploads are checked: role, file type, rights", async ({ page }) => {
  await loginAs(page, "u_sara");
  expect((await page.request.post("/api/library/books", { multipart: { file: { name: "a.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }, title_en: "x", licence_note: "xyz", rights: "yes" } })).status()).toBe(403);
  await loginAs(page, "u_huda");
  const notPdf = await page.request.post("/api/library/books", { multipart: { file: { name: "a.pdf", mimeType: "application/pdf", buffer: Buffer.from("hello") }, title_en: "x", licence_note: "xyz", rights: "yes" } });
  expect(notPdf.status()).toBe(415);
  const noRights = await page.request.post("/api/library/books", { multipart: { file: { name: "a.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }, title_en: "x", licence_note: "xyz" } });
  expect(noRights.status()).toBe(400);
});

test("built-in books: verbatim tafsir by verse, hadith collections with grades", async ({ page, request }) => {
  const t = await (await request.get("/api/library/tafsir?verse=2:255")).json();
  expect(t.data[0].book_id).toBe("tafsir-muyassar");
  expect(t.data[0].text.length).toBeGreaterThan(50);
  expect((await request.get("/api/library/tafsir?verse=abc")).status()).toBe(400);
  await loginAs(page, "u_huda");
  await page.goto("/portal/library/hadith-nawawi");
  await expect(page.getByTestId("passages").locator("li")).toHaveCount(30);
  await page.goto("/portal/library/tafsir-muyassar");
  await page.locator("#book-q").fill("الرمان");
  await page.locator('form[role="search"] button').click();
  await expect(page.getByTestId("passages").locator("li").first()).toBeVisible();
});

test("visitors' discoveries reach the demand board and become draft cards", async ({ page }) => {
  await page.request.post("/api/discover", { data: { label_ar: "زيتون", label_en: "olive tree", source: "search", search_terms_ar: ["الزيتون", "زيتون"] } });
  await loginAs(page, "u_huda");
  await page.goto("/portal/demand");
  const row = page.locator('[data-discovery="en:olive tree"]');
  await expect(row).toBeVisible();
  await row.getByTestId("discovery-draft").click();
  await expect(page).toHaveURL(/\/portal\/cards\/answer/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("olive tree");
});
