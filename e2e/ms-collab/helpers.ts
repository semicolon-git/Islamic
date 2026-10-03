import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { expectAccessible } from "../helpers";

export const BNF = "bnf-arabe-5341";
export const P1 = "bnf-arabe-5341_01"; // assigned to Sara (seed)
export const P2 = "bnf-arabe-5341_02"; // assigned to Omar (seed)
export const P3 = "bnf-arabe-5341_03"; // published (seed)
export const P4 = "bnf-arabe-5341_04"; // hard-words practice page

/** Mark every first-use tip as seen, so tests see the screens as a returning user (tips are tested separately). */
export async function skipTips(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const t of ["my-work", "hard-words", "adjudicate", "review", "suggest", "comments", "quran", "assign", "compare"]) localStorage.setItem(`ms-collab-tip:${t}`, "1");
    } catch { /* ignore */ }
  });
}

export async function api<T = unknown>(req: APIRequestContext, method: "GET" | "POST" | "PATCH", url: string, data?: unknown): Promise<{ status: number; body: { ok: boolean; data: T; error?: { code: string; message: string } } }> {
  const r = await req.fetch(url, { method, data: data === undefined ? undefined : data });
  return { status: r.status(), body: await r.json() };
}

export async function lineVersions(req: APIRequestContext, lineId: string) {
  const r = await req.get(`/api/ms/lines/${lineId}/versions`);
  expect(r.ok()).toBeTruthy();
  return (await r.json()).data.versions as { version: number; kind: string; author_id: string | null; plain_text: string; note: string | null }[];
}

/** Axe scan after entrance animations (animate-rise / animate-pop) have finished, so contrast is measured at full opacity. */
export async function accessible(page: Page) {
  await page.waitForTimeout(450);
  await expectAccessible(page);
}
