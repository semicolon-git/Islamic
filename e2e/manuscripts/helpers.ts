import { expect, type Browser, type Page } from "@playwright/test";
import { loginAs } from "../helpers";

export const MS = "umich-isl-22";
export const pageUrl = (ms: string, page: string) => `/portal/manuscripts/${ms}/pages/${page}`;
export const lineId = (page: string, n: number) => `${page}-l${n}`;

/** A fresh browser context signed in as a persona (separate cookies = a second user). */
export async function userPage(browser: Browser, userId: string, lang: "en" | "ar" = "en"): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/portal/login");
  await ctx.addCookies([{ name: "lang", value: lang, url: page.url() }]);
  await loginAs(page, userId);
  return page;
}

export async function openWorkspace(page: Page, ms: string, pg: string) {
  await page.goto(pageUrl(ms, pg));
  await expect(page.getByTestId("workspace")).toBeVisible();
  await expect(page.locator("[data-line-row]").first()).toBeVisible();
}

/** Click a line row in the text pane (selects it and opens the editor). */
export async function selectRow(page: Page, id: string) {
  await page.locator(`[data-line-row="${id}"] button`).first().click();
  await expect(page.locator(`[data-line-row="${id}"][aria-current="true"]`)).toBeVisible();
}

export const editor = (page: Page, id: string) => page.locator(`#ed-${id}`);

/** Replace the editor text by typing-equivalent input, then select [a, b). */
export async function setText(page: Page, id: string, text: string) {
  const ta = editor(page, id);
  await ta.fill(text);
  await expect(ta).toHaveValue(text);
}

export async function selectRange(page: Page, id: string, a: number, b: number) {
  await editor(page, id).evaluate((el, [x, y]) => {
    const t = el as HTMLTextAreaElement;
    t.focus();
    t.setSelectionRange(x, y);
    t.dispatchEvent(new Event("select", { bubbles: true }));
  }, [a, b] as const);
}

export async function versions(page: Page, id: string) {
  const r = await page.request.get(`/api/ms/lines/${id}/versions`);
  expect(r.ok()).toBeTruthy();
  return (await r.json()).data.versions as { version: number; kind: string; tokens: { t: string; v?: string; expan?: string }[]; plain_text: string }[];
}
