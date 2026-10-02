import { expect, test } from "@playwright/test";

// 8×8 PNG (a plain colour square) used as the visitor's "photo".
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGPUqDjBgA0wYRUdtBIAHOcBeDC+JtEAAAAASUVORK5CYII=",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("say.welcomed", "1");
    } catch {}
  });
});

test("snap without a key → photo → manual picker (with the photo) → card", async ({ page }) => {
  await page.goto("/snap");
  await expect(page.getByRole("heading", { level: 1, name: "What are you looking at?" })).toBeVisible();
  // Headless has no camera: a calm fallback, never a dead end.
  await expect(page.getByTestId("camera-blocked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use a photo" }).first()).toBeVisible();

  const snapReq = page.waitForResponse((r) => r.url().endsWith("/api/snap") && r.request().method() === "POST");
  await page.getByTestId("snap-file").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
  const res = await snapReq;
  // Sent as multipart (the client re-encodes to a clean JPEG first).
  expect(res.request().headers()["content-type"]).toContain("multipart/form-data");
  expect((await res.json()).data).toMatchObject({ mode: "manual", reason: "no_key" });

  const picker = page.getByRole("dialog");
  await expect(picker.getByRole("heading", { name: "Choose what you see" })).toBeVisible();
  await expect(picker.getByTestId("picker-photo")).toContainText("Automatic recognition isn't switched on here");
  await picker.getByRole("searchbox", { name: "Search" }).fill("moon");
  await picker.getByRole("link", { name: /^Moon/ }).click();
  await expect(page).toHaveURL(/\/c\/moon$/);
  await expect(page.getByRole("heading", { level: 1, name: "The Moon" })).toBeVisible();
});

test("a sample photo maps directly to its concept", async ({ page }) => {
  await page.goto("/snap");
  await page.getByRole("button", { name: "Sample: Moon" }).click();
  await expect(page).toHaveURL(/\/c\/moon$/);
  await expect(page.getByRole("heading", { level: 1, name: "The Moon" })).toBeVisible();
});

test("“Choose what you see” searches in Arabic and English", async ({ page }) => {
  await page.goto("/snap?pick=1");
  const picker = page.getByRole("dialog");
  await expect(picker).toBeVisible();
  const search = picker.getByRole("searchbox", { name: "Search" });
  await search.fill("قمر");
  await expect(picker.getByRole("link")).toHaveCount(1);
  await expect(picker.getByRole("link", { name: /^Moon/ })).toBeVisible();
  await search.fill("lamp");
  await expect(picker.getByRole("link", { name: "Mosque lamp" })).toBeVisible();
  await search.fill("zzzz");
  await expect(picker.getByText("Nothing called “zzzz” yet")).toBeVisible();
  await expect(picker.getByRole("link", { name: "Ask a question instead" })).toHaveAttribute("href", "/ask?q=zzzz");
  await search.fill("");
  await picker.getByRole("button", { name: "Heritage" }).click();
  await expect(picker.getByRole("link", { name: "Astrolabe" })).toBeVisible();
  await expect(picker.getByRole("link", { name: /^Moon/ })).toHaveCount(0);
});

test("snap API rejects non-images and answers manual without a key", async ({ request }) => {
  const bad = await request.post("/api/snap", { data: { image: "not-a-data-url" } });
  expect(bad.status()).toBe(400);
  const ok = await request.post("/api/snap", { data: { image: `data:image/png;base64,${PNG.toString("base64")}` } });
  expect((await ok.json()).data).toEqual({ mode: "manual", reason: "no_key" });
});
