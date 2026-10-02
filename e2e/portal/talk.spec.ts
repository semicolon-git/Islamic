import { expect, test } from "@playwright/test";
import { expectAccessible, loginAs } from "../helpers";

test("visitor talks to a person: consent → message → specialist reply appears live → end", async ({ browser, page }, info) => {
  test.setTimeout(120_000);
  const tag = `${info.project.name}-${Date.now().toString(36)}`;
  const question = `Is the moon worshipped in Islam? (${tag})`;

  // ── visitor (no account)
  await page.goto("/talk?card=card:moon");
  await expect(page.getByRole("heading", { level: 1, name: "Talk to a person" })).toBeVisible();
  await expectAccessible(page);
  await page.getByTestId("talk-start").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("Here is exactly what the specialist team will see");
  await expect(sheet.getByTestId("consent-card")).toBeChecked();
  await expect(sheet).toContainText("The Moon");
  await expect(sheet).toContainText("Never shared: your name, contact details");
  await sheet.getByTestId("talk-question").fill(question);
  await sheet.getByTestId("talk-begin").click();
  await expect(page.getByTestId("messages")).toContainText(question);
  await expect(page.getByTestId("person-banner")).toHaveCount(0);
  // only a hash of the device token is stored: the token itself stays in this browser
  const token = await page.evaluate(() => localStorage.getItem("talk.device"));
  expect(token).toMatch(/^[a-z0-9]{40}$/);

  // ── specialist in a second browser context
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } = info.project.use;
  const ctx2 = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL });
  const sp = await ctx2.newPage();
  await loginAs(sp, "u_yusuf");
  await sp.goto("/portal/inbox");
  await sp.getByTestId("thread-list").getByRole("link").filter({ hasText: tag }).click();
  await expect(sp.getByTestId("thread-pane")).toContainText(question);
  await expect(sp.getByTestId("thread-pane")).toContainText("Shared by the visitor");
  await sp.locator("[data-canned=welcome]").click();
  await expect(sp.getByTestId("reply-box")).toHaveValue(/welcome/i);
  await sp.getByTestId("reply-box").fill(`Hello! Muslims worship Allah alone, not the moon (${tag}).`);
  await sp.getByRole("button", { name: "Send", exact: true }).click();

  // ── the reply reaches the visitor in real time, with the handoff banner
  await expect(page.getByTestId("person-banner")).toContainText("You are now talking with a person", { timeout: 20_000 });
  await expect(page.getByTestId("messages")).toContainText("Muslims worship Allah alone");
  await expectAccessible(page);

  // ── visitor follows up; the specialist sees it live
  await page.getByTestId("talk-input").fill(`Thank you, that helps (${tag}).`);
  await page.getByTestId("talk-input").press("Enter");
  await expect(sp.getByTestId("thread-pane")).toContainText("Thank you, that helps", { timeout: 20_000 });

  // ── visitor ends the conversation
  await page.getByTestId("talk-end").click();
  await page.getByTestId("talk-end-confirm").click();
  await expect(page.getByText("Conversation ended")).toBeVisible();
  await expect(sp.getByTestId("thread-pane")).toContainText("The visitor ended the conversation.", { timeout: 20_000 });
  await ctx2.close();
});

test("the inbox is staff-only and the visitor API needs the device token", async ({ request }) => {
  expect((await request.get("/api/threads")).status()).toBe(401);
  expect((await request.get("/api/threads/thr_demo_waiting", { headers: { "x-device-token": "x".repeat(40) } })).status()).toBe(404);
  await request.post("/api/session", { data: { userId: "u_sara", pin: "1448" } });
  expect((await request.get("/api/threads")).status()).toBe(403);
});
