import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAs } from "../helpers";

export const enc = (id: string) => encodeURIComponent(id);

/** Switch the signed-in persona and open a page. */
export async function as(page: Page, user: string, path: string) {
  await loginAs(page, user);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
}

/** Click a workflow action, optionally type a note, confirm, and wait for the success toast. */
export async function decide(page: Page, decision: string, note?: string, expectText?: RegExp) {
  await page.locator(`[data-decision="${decision}"]`).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (note) await dialog.getByTestId("decision-note").fill(note);
  await dialog.getByTestId("confirm-decision").click();
  if (expectText) await expect(page.getByText(expectText).first()).toBeVisible({ timeout: 15_000 });
}

export async function pointsOf(request: APIRequestContext, user: string) {
  await request.post("/api/session", { data: { userId: user, pin: "1448" } });
  const j = await (await request.get("/api/session")).json();
  return j.data.user.points as number;
}

/** Create a complete card as a student through the API and submit it (keeps tests independent of each other). */
export async function makeSubmittedCard(request: APIRequestContext, title: string) {
  await request.post("/api/session", { data: { userId: "u_omar", pin: "1448" } });
  const created = await (await request.post("/api/cards", { data: { kind: "concept", concept_id: "sun", title_en: title, title_ar: "الشمس" } })).json();
  const id = created.data.id as string;
  const save = await request.put(`/api/cards/${enc(id)}`, {
    data: {
      base_version: 1,
      meta: { title_en: title, title_ar: "الشمس", level: "A", certainty: "established", concept_id: "sun", match_phrases: [] },
      content: {
        verses: [{ key: "91:1", role: "primary" }],
        explanation: { en: "The Quran swears by the sun and its brightness (91:1).", ar: "يُقسم القرآن بالشمس وضحاها (الشمس ١)." },
      },
    },
  });
  expect(save.ok()).toBeTruthy();
  const sub = await request.post(`/api/cards/${enc(id)}/transition`, { data: { decision: "submit" } });
  expect(sub.ok()).toBeTruthy();
  return id;
}

export const randomToken = () => Array.from({ length: 40 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
