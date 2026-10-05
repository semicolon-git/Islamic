import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Sign in to the portal as a demo persona (PIN 1448). */
export async function loginAs(page: Page, userId: string) {
  const res = await page.request.post("/api/session", { data: { userId, pin: "1448" } });
  expect(res.ok()).toBeTruthy();
}

export async function setLang(page: Page, lang: "en" | "ar") {
  await page.context().addCookies([{ name: "lang", value: lang, url: page.url().startsWith("http") ? page.url() : "http://127.0.0.1:3100" }]);
}

/** Fail on serious/critical accessibility violations. */
export async function expectAccessible(page: Page, opts: { exclude?: string[] } = {}) {
  // Let entrance fades (rise/pop) finish first: axe measures contrast on half-transparent text mid-animation,
  // which made these checks flaky on a loaded machine. Infinite loaders (shimmer) are ignored.
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === Infinity || a.playState !== "running"), null, { timeout: 5000 })
    .catch(() => {});
  let b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
  for (const s of opts.exclude ?? []) b = b.exclude(s);
  const r = await b.analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}
