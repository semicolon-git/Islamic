import { expect, test } from "@playwright/test";
import { expectAccessible } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("say.welcomed", "1");
    } catch {}
  });
});

test("concept without a card → notify me → request stored for this device", async ({ page }) => {
  await page.goto("/c/sun");
  await expect(page.getByRole("heading", { level: 1, name: "No reviewed card yet — we won't guess" })).toBeVisible();
  await expect(page.getByText(/Every card about “Sun” must be checked/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ask a question instead" })).toHaveAttribute("href", "/ask?concept=sun");
  await expect(page.getByRole("link", { name: "Talk to a person" })).toHaveAttribute("href", "/talk?concept=sun");
  await expectAccessible(page);

  const posted = page.waitForResponse((r) => r.url().endsWith("/api/requests") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Notify me when it's approved" }).click();
  expect((await posted).status()).toBe(201);
  await expect(page.getByTestId("requested")).toContainText("We'll let you know");
  await expect(page.getByText("Watching for approval live")).toBeVisible();

  // Stored server-side against the hashed device token (no account).
  const token = await page.evaluate(() => localStorage.getItem("say.device_token"));
  expect(token).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  const list = await (await page.request.get("/api/requests", { headers: { "x-device-token": token! } })).json();
  expect(list.data.map((r: { concept_id: string }) => r.concept_id)).toContain("sun");

  // Survives reload.
  await page.reload();
  await expect(page.getByTestId("requested")).toBeVisible();
});

test("requests API: dedupes per device and concept, validates, rate-limits", async ({ request }) => {
  const token = "e2e_device_token_ratelimit_1";
  const a = await request.post("/api/requests", { data: { concept_id: "stars", device_token: token } });
  expect(a.status()).toBe(201);
  const b = await request.post("/api/requests", { data: { concept_id: "stars", device_token: token } });
  expect(b.status()).toBe(200);
  expect((await b.json()).data.created).toBe(false);

  expect((await request.post("/api/requests", { data: { concept_id: "nope", device_token: token } })).status()).toBe(404);
  expect((await request.post("/api/requests", { data: { concept_id: "stars", device_token: "x" } })).status()).toBe(400);
  expect((await request.post("/api/requests", { data: { device_token: token } })).status()).toBe(400);

  let last = 0;
  for (let i = 0; i < 20; i++) {
    last = (await request.post("/api/requests", { data: { topic: `topic number ${i}`, device_token: token } })).status();
    if (last === 429) break;
  }
  expect(last).toBe(429);
  expect((await request.get("/api/requests")).status()).toBe(400);
});
