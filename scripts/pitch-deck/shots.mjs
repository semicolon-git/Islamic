/**
 * Takes the real-app screenshots used in the pitch deck (Arabic, dark theme). Read-only: it never approves or edits.
 *
 *   APP_URL=http://localhost:3400 OUT_DIR=out/deck/shots node scripts/pitch-deck/shots.mjs [name …]
 *
 * Phone shots are 390×844 at 2×; desktop (portal) shots are 1440×900 at 1.5×, signed in as a demo persona.
 */
import fs from "node:fs";
import path from "node:path";

const pw = await import("playwright-core").catch(() => import("@playwright/test"));
const APP = (process.env.APP_URL ?? "http://localhost:3400").replace(/\/$/, "");
const OUT = path.resolve(process.env.OUT_DIR ?? "out/deck/shots");
const CHROME = process.env.CHROME ?? (fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);
const PIN = process.env.PIN ?? "1448";
const THEME = process.env.THEME ?? "dark";
const INIT = `try {
  localStorage.setItem("say.welcomed", "1"); localStorage.setItem("theme", ${JSON.stringify(THEME)});
  for (const t of ["my-work","hard-words","adjudicate","review","suggest","comments","quran","assign","compare"]) localStorage.setItem("ms-collab-tip:" + t, "1");
} catch {}`;
const enc = encodeURIComponent;

/** name → { url, persona? (desktop), prep?(page) }. Phone unless `desk`. */
const SHOTS = {
  "m-home": { url: "/?welcome=0" },
  "m-moon": { url: "/c/moon" },
  "m-discover": { url: `/discover?en=Pomegranate&ar=${enc("الرمان")}&src=search`, wait: "[data-testid=discover-summary]" },
  "m-wontguess": { url: `/discover?en=Car&ar=${enc("سيارة")}&src=search`, wait: "[data-testid=discover-panel]" },
  "m-sky": { url: "/sky" },
  "m-star": { url: "/sky/star/vega" },
  "m-astrolabe": { url: "/science/instrument/astrolabe" },
  "m-manuscript": { url: "/heritage/manuscripts" },
  "d-portal": { desk: true, persona: "u_noura", url: "/portal" },
  "d-portal-student": { desk: true, persona: "u_sara", url: "/portal" },
  "d-library": { desk: true, persona: "u_huda", url: "/portal/library" },
  "d-workspace": {
    desk: true, persona: "u_huda", url: "/portal/manuscripts/umich-isl-22/pages/umich-isl-22_02", wait: "[data-testid=workspace]",
    async prep(page) { await page.locator('polygon[data-line="umich-isl-22_02-l9"]').click().catch(() => {}); await page.waitForTimeout(900); },
  },
  "d-compare": { desk: true, persona: "u_huda", url: "/portal/manuscripts/umich-isl-22/compare", wait: "[data-testid=apparatus]" },
  "d-queue": { desk: true, persona: "u_huda", url: "/portal/manuscripts/queue" },
  "d-hardwords": { desk: true, persona: "u_sara", url: "/portal/manuscripts/queue/hard-words" },
  "d-cards": { desk: true, persona: "u_huda", url: "/portal/cards" },
  "d-demand": { desk: true, persona: "u_noura", url: "/portal/demand" },
  "d-eval": { desk: true, persona: "u_noura", url: "/portal/eval" },
  "d-people": { desk: true, persona: "u_noura", url: "/portal/people" },
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
fs.mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ executablePath: CHROME });
for (const name of names) {
  const s = SHOTS[name];
  const ctx = await browser.newContext(
    s.desk
      ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: "ar-SA", colorScheme: THEME }
      : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ar-SA", colorScheme: THEME },
  );
  await ctx.addInitScript(INIT);
  await ctx.addCookies([{ name: "lang", value: "ar", url: APP }]);
  if (s.persona) {
    const r = await ctx.request.post(APP + "/api/session", { data: { userId: s.persona, pin: PIN } });
    if (!r.ok()) throw new Error(`login ${s.persona}: ${r.status()}`);
  }
  const page = await ctx.newPage();
  try {
    await page.goto(APP + s.url, { waitUntil: "networkidle", timeout: 120_000 });
    if (s.wait) await page.locator(s.wait).first().waitFor({ timeout: 120_000 });
    await page.evaluate(() => document.fonts.ready);
    if (s.prep) await s.prep(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, name + ".png") });
    console.log("shot", name);
  } catch (e) {
    console.log("FAILED", name, e.message.split("\n")[0]);
  }
  await ctx.close();
}
await browser.close();
