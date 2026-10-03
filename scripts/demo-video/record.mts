/**
 * Records the platform demo video: real screens of the running app, driven by script, on an animated stage.
 *
 *   1. Seed a fresh demo database and start the app (production build):
 *        DATA_DIR=.data/demo-video npx tsx scripts/seed.ts --reset
 *        DATA_DIR=.data/demo-video INSECURE_COOKIES=1 npx next start -p 3400
 *   2. npx tsx scripts/demo-video/record.mts          → out/demo/signs-around-you-demo.mp4
 *
 * Capture: Chrome's screencast (lossless-ish JPEG frames with timestamps) on a 1920×1080 stage page; ffmpeg turns the
 * variable-rate frames into a constant 30 fps H.264 file. The app runs in iframes (phone 390×856, desktop 1500×800)
 * so it renders at 1:1 — crisp text — while the stage adds captions, a cursor, click ripples and highlight rings.
 * Silent by design (judges include scholars; add a voiceover from scripts/demo-video/voiceover.md if wanted).
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { chromium, type Frame, type Locator, type Page } from "@playwright/test";

const ROOT = process.cwd();
const APP = process.env.APP_URL ?? "http://localhost:3400";
const STAGE_PORT = Number(process.env.STAGE_PORT ?? 3401);
const OUT_DIR = path.join(ROOT, "out/demo");
const FRAMES = path.join(OUT_DIR, "frames");
const OUT = path.join(OUT_DIR, "signs-around-you-demo.mp4");
const CHROME = process.env.CHROME_PATH ?? (fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);

// ───────────────────────── stage server (stage.html + fonts)
const FONTS: Record<string, string> = {
  "readex-latin.woff2": "node_modules/@fontsource-variable/readex-pro/files/readex-pro-latin-wght-normal.woff2",
  "readex-arabic.woff2": "node_modules/@fontsource-variable/readex-pro/files/readex-pro-arabic-wght-normal.woff2",
  "plex-ar-400.woff2": "node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2",
  "plex-ar-600.woff2": "node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2",
  "amiri-400.woff2": "node_modules/@fontsource/amiri/files/amiri-arabic-400-normal.woff2",
  "hafs.woff2": "public/fonts/hafs.18.woff2",
};
const server = http.createServer((req, res) => {
  const u = (req.url ?? "/").split("?")[0];
  if (u === "/" || u === "/stage.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(ROOT, "scripts/demo-video/stage.html")));
  }
  const f = u.startsWith("/fonts/") ? FONTS[u.slice(7)] : null;
  if (f && fs.existsSync(path.join(ROOT, f))) {
    res.writeHead(200, { "content-type": "font/woff2" });
    return res.end(fs.readFileSync(path.join(ROOT, f)));
  }
  res.writeHead(404).end();
});

// ───────────────────────── helpers
let page: Page;
const wait = (ms: number) => page.waitForTimeout(ms);
const S = <T = unknown>(fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as { S: Record<string, (...x: unknown[]) => unknown> }).S[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const frame = (name: "phone" | "desk"): Frame => page.frame({ name })!;

async function load(which: "phone" | "desk", p: string) {
  await S("load", which, APP + p);
  const f = frame(which);
  await f.waitForLoadState("domcontentloaded");
  await f.addStyleTag({ content: "[data-testid=pwa-install-banner]{display:none!important} nextjs-portal{display:none!important}" }).catch(() => {});
  if (which === "desk") await S("url", "signs-around-you.app" + p.split("?")[0]);
  return f;
}

async function login(user: string) {
  const r = await page.request.post(APP + "/api/session", { data: { userId: user, pin: "1448" } });
  if (!r.ok()) throw new Error(`login ${user}: ${r.status()}`);
}

async function center(loc: Locator) {
  await loc.waitFor({ state: "visible", timeout: 20_000 });
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
}

/** Glide the cursor to an element. */
async function point(loc: Locator, ms = 750) {
  const { x, y } = await center(loc);
  await S("cursor", x, y, ms);
  await wait(ms + 120);
}

/** Glide, ripple, click. */
async function tap(loc: Locator, ms = 750) {
  await point(loc, ms);
  await S("click");
  await loc.click();
  await wait(350);
}

async function type(loc: Locator, text: string, delay = 55) {
  await tap(loc, 600);
  await loc.pressSequentially(text, { delay });
}

async function ring(loc: Locator, label?: string, hold = 1600) {
  const { b } = await center(loc);
  await S("ring", b, label);
  await wait(hold);
  await S("unring");
  await wait(250);
}

/** Smoothly scroll an element into the middle of its frame. */
async function scrollTo(loc: Locator, settle = 900) {
  await loc.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await wait(settle);
}

async function scrollBy(f: Frame, dy: number, settle = 1000) {
  await f.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy);
  await wait(settle);
}

async function chapter(i: number, mode: "phone" | "desk" | "split", cap: { chap: string; en: string; ar?: string; sub?: string; bullets?: string[] }) {
  await S("mode", mode);
  await S("progress", i);
  await S("caption", cap);
}

// ───────────────────────── the film
async function film() {
  // 0 · Title
  await S("mode", "title");
  await wait(6200);

  // 1 · Discover
  await chapter(0, "phone", {
    chap: "01 · Discover",
    en: "Point at the world.<br>Get only approved knowledge.",
    ar: "وجّه هاتفك نحو العالم… واحصل على محتوى معتمد فقط",
    bullets: ["Quran text inserted word for word from the King Fahd Complex", "A labelled translation, never the Quran itself", "Every card reviewed by an institution"],
  });
  let ph = await load("phone", "/");
  await wait(2200);
  await scrollBy(ph, 560, 1400);
  await tap(ph.getByRole("link", { name: "Moon · Approved card" }).first());
  await ph.getByRole("heading", { level: 1, name: "The Moon" }).waitFor();
  await wait(1200);
  await scrollTo(ph.locator("blockquote.quran").first(), 1200);
  await ring(ph.locator("blockquote.quran").first(), "Quran · verbatim, KFGQPC", 2200);
  await scrollTo(ph.getByTestId("count-line"), 1000);
  await ring(ph.getByTestId("count-line"), "Counted by code, rule shown", 2000);
  await scrollTo(ph.getByTestId("hadith").first(), 1000);
  await ring(ph.getByTestId("hadith").first(), "Hadith: collection, number, grade", 2000);
  await tap(ph.getByRole("button", { name: "Why trust this?" }).first());
  await wait(2800);
  await ph.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await wait(500);

  // 2 · Snap or choose
  await chapter(1, "phone", {
    chap: "02 · Snap",
    en: "Snap it — or simply choose.",
    ar: "صوّر ما تراه… أو اختره بنفسك",
    sub: "Recognition only suggests; the visitor confirms. Photos are never stored.",
  });
  ph = await load("phone", "/snap?pick=1");
  await wait(1200);
  const search = ph.getByRole("dialog").getByRole("searchbox", { name: "Search" });
  await type(search, "lamp", 110);
  await wait(700);
  await tap(ph.getByRole("dialog").getByRole("link", { name: "Mosque lamp" }).first());
  await ph.getByRole("heading", { level: 1 }).first().waitFor();
  await wait(1600);
  await scrollBy(ph, 520, 1600);

  // 3 · Ask
  await chapter(2, "phone", {
    chap: "03 · Ask",
    en: "Answers only from approved evidence.",
    ar: "إجابات من مصادر معتمدة فقط — وإلا فلا",
    bullets: ["Levels A–D, shown on every answer", "Personal rulings → referred to scholars", "Misquoted verses caught and corrected"],
  });
  ph = await load("phone", "/ask");
  await wait(900);
  const input = ph.locator("#ask-input");
  await type(input, "Do Muslims worship the Kaaba?");
  await input.press("Enter");
  let answer = ph.locator("article[data-route]").last();
  await answer.waitFor({ timeout: 20_000 });
  await wait(1500);
  await ring(answer.locator("[data-badge]").first(), "Approved card · Level A", 1800);
  await scrollTo(answer.locator("blockquote.quran").first(), 1200);
  await wait(1200);
  await tap(answer.getByRole("button", { name: "Why this answer?" }));
  await wait(2600);
  await page.keyboard.press("Escape");
  await wait(500);
  await type(input, "Can I take a bank loan for my house?");
  await input.press("Enter");
  await ph.locator("article[data-route='refer_d']").last().waitFor({ timeout: 20_000 });
  await wait(600);
  answer = ph.locator("article[data-route='refer_d']").last();
  await scrollTo(answer, 900);
  await ring(answer, "Level D — referred, no ruling given", 2400);
  await type(input, "Is this a verse: هو الذي جعل القمر ضياء والشمس نورا", 45);
  await input.press("Enter");
  answer = ph.locator("article[data-route='misquote']").last();
  await answer.waitFor({ timeout: 20_000 });
  await scrollTo(answer, 900);
  await ring(answer.locator("[data-block=misquote]").first(), "Misquote caught — the verse as revealed (10:5)", 2600);

  // 4 · Inscriptions
  await chapter(3, "phone", {
    chap: "04 · Art & heritage",
    en: "Read the calligraphy on the wall.",
    ar: "اقرأ الخط على الجدار… وتعرّف على الآية",
    sub: "Typed or photographed Arabic is matched letter by letter against the Quran: exact, near (with the differences), or “not a verse we can identify”.",
  });
  ph = await load("phone", "/inscription");
  await wait(900);
  await type(ph.getByTestId("inscription-input"), "الله نور السموات والأرض مثل نوره", 70);
  await tap(ph.getByRole("button", { name: "Check the text" }));
  await ph.getByTestId("inscription-result").waitFor();
  await wait(800);
  await ring(ph.getByTestId("inscription-result").getByRole("heading", { level: 2 }), "Exact match · An-Nūr 24:35", 2400);
  await scrollTo(ph.getByTestId("inscription-result").locator("blockquote.quran"), 1200);
  await wait(1400);

  // 5 · Live demand (visitor ↔ institution)
  await login("u_noura");
  await chapter(4, "split", {
    chap: "05 · Live",
    en: "A visitor's curiosity reaches the institution — live.",
    ar: "فضول الزائر يصل إلى المؤسسة لحظيًا",
  });
  const dk = await load("desk", "/portal/demand");
  ph = await load("phone", "/c/grapes");
  await wait(1800);
  const grapes = dk.locator("[data-key='concept:grapes']");
  const before = (await grapes.getByTestId("demand-count").innerText().catch(() => "0")).trim();
  await tap(ph.getByRole("button", { name: /Notify me when it/ }));
  await dk.locator("[data-key='concept:grapes'] [data-testid=demand-count]").filter({ hasNotText: new RegExp(`^${before}$`) }).waitFor({ timeout: 20_000 }).catch(() => {});
  await wait(400);
  await ring(grapes, "Request counted on the demand board", 2600);

  // 6 · Review workflow
  await login("u_huda");
  await chapter(5, "desk", {
    chap: "06 · Review",
    en: "Student drafts. Researcher reviews. Institution publishes.",
    ar: "طالب يُعدّ… وباحث يراجع… ومؤسسة تعتمد",
  });
  let d = await load("desk", "/portal");
  await wait(1200);
  await ring(d.getByTestId("next-task"), "Your one next task", 2000);
  d = await load("desk", "/portal/cards/" + encodeURIComponent("card:demo-clouds"));
  await wait(1500);
  const checklist = d.getByTestId("checklist");
  if (await checklist.isVisible().catch(() => false)) await ring(checklist, "Validation checklist", 1800);
  const preview = d.getByTestId("card-preview");
  if (await preview.isVisible().catch(() => false)) await ring(preview, "Live preview of the visitor card", 1800);
  await tap(d.locator('[data-decision="approve"]'));
  const dialog = d.getByRole("dialog");
  await dialog.waitFor();
  const note = dialog.getByTestId("decision-note");
  if (await note.isVisible().catch(() => false)) await type(note, "Verse keys and hadith number checked.", 35);
  await tap(dialog.getByTestId("confirm-decision"));
  await wait(2200);

  // 7 · Manuscript Studio
  await login("u_sara");
  await chapter(6, "desk", {
    chap: "07 · Manuscript Studio",
    en: "Old manuscripts, read together — never “corrected”.",
    ar: "نقرأ المخطوطات معًا… دون أن نغيّر حرفًا",
  });
  d = await load("desk", "/portal/manuscripts");
  await wait(2200);
  d = await load("desk", "/portal/manuscripts/umich-isl-22/pages/umich-isl-22_02");
  await d.getByTestId("workspace").waitFor();
  await wait(1800);
  const l9 = "umich-isl-22_02-l9";
  await tap(d.locator(`polygon[data-line="${l9}"]`));
  await wait(1200);
  await ring(d.locator(`[data-line-row="${l9}"]`), "Image and text stay in sync", 2000);
  const l4 = "umich-isl-22_02-l4";
  await tap(d.locator(`[data-line-row="${l4}"] button`).first());
  const ed = d.locator(`#ed-${l4}`);
  await ed.waitFor();
  await wait(900);
  // mark the first word as unclear: the diplomatic text never changes, the uncertainty is recorded
  const firstWord = await ed.evaluate((el) => {
    const v = (el as HTMLTextAreaElement).value;
    const i = v.indexOf(" ");
    return i > 1 ? i : Math.min(5, v.length);
  });
  await ed.evaluate((el, n) => { const t = el as HTMLTextAreaElement; t.focus(); t.setSelectionRange(0, n); t.dispatchEvent(new Event("select", { bubbles: true })); }, firstWord);
  await wait(500);
  await page.keyboard.press("Control+Shift+KeyU");
  await wait(900);
  await ring(ed, "Uncertain word marked — the letters stay as written", 2400);

  await chapter(7, "desk", {
    chap: "08 · Read together",
    en: "Hard words are read twice, blind.",
    ar: "يقرؤها طالبان… دون أن يرى أحدهما قراءة الآخر",
  });
  d = await load("desk", "/portal/manuscripts/queue/hard-words?page=bnf-arabe-5341_04");
  const card = d.getByTestId("hard-card-item");
  await card.waitFor({ timeout: 20_000 });
  await wait(1200);
  await ring(d.getByTestId("word-box"), "The word on the page", 1800);
  await ring(d.getByTestId("hard-context"), "Masked: no machine guess, no other reading", 2000);
  // type what the machine read (a student who agrees with the draft) — taken from the line's current tokens
  const reading = await guessReading(d);
  await type(d.getByTestId("hw-input"), reading, 140);
  await page.keyboard.press("Enter");
  await d.getByTestId("hw-result").waitFor();
  await wait(2600);

  await login("u_huda");
  d = await load("desk", "/portal/manuscripts/queue/hard-words");
  const dispute = d.locator('[data-testid="dispute"]').first();
  if (await dispute.isVisible({ timeout: 8000 }).catch(() => false)) {
    await wait(1000);
    await ring(dispute, "Two readings disagree — a researcher decides", 2400);
    await tap(dispute.locator("[data-choice]").first());
    await wait(1600);
  }

  // understanding: a Quran quotation inside the manuscript, found by code and confirmed by a person
  await S("caption", { chap: "08 · Understand", en: "Quran quotations found by code, confirmed by a person.", ar: "اقتباسات قرآنية يكتشفها النظام ويؤكدها باحث" });
  d = await load("desk", "/portal/manuscripts/bnf-arabe-5341/pages/bnf-arabe-5341_03");
  await d.getByTestId("workspace").waitFor();
  await wait(1200);
  await tap(d.getByTestId("open-understand"));
  const quote = d.getByTestId("understanding-panel").locator('[data-testid="quote-card"]').filter({ hasText: "43:15" });
  await quote.waitFor();
  await wait(800);
  await ring(quote, "Quran quotation found: Az-Zukhruf 43:15", 2400);
  await tap(quote.getByTestId("quote-confirm"));
  await wait(1600);

  // compare copies
  await S("caption", { chap: "08 · Compare", en: "Copies of one work, compared word by word.", ar: "مقابلة نسخ العمل الواحد كلمةً كلمة" });
  d = await load("desk", "/portal/manuscripts/umich-isl-22/compare");
  await d.getByTestId("apparatus").waitFor();
  await wait(1500);
  await tap(d.getByTestId("apparatus").locator("[data-entry]").first());
  await wait(1200);
  await ring(d.getByTestId("apparatus"), "Variants between copies — «في (ب)…»", 2400);

  // 8 · Public reader
  await chapter(8, "phone", {
    chap: "09 · Published",
    en: "Published with four-eyes approval — for everyone.",
    ar: "يُنشر بعد اعتماد شخصين مختلفين… ليقرأه الجميع",
    bullets: ["Exactly as written, or the reading — side by side with the page", "Confirmed Quran quotations open the verse", "Contributors credited; students by initials"],
  });
  ph = await load("phone", "/heritage/manuscripts/bnf-arabe-5341");
  await ph.getByTestId("public-reader").waitFor();
  await wait(1600);
  await tap(ph.locator("[data-line-btn]").nth(4));
  await wait(1800);
  const chip = ph.getByTestId("quote-chip").first();
  if (await chip.isVisible({ timeout: 4000 }).catch(() => false)) {
    await scrollTo(chip, 1000);
    await tap(chip);
    await wait(2600);
    await page.keyboard.press("Escape");
    await ph.locator("body").press("Escape").catch(() => {});
    await wait(500);
  }

  // Arabic, dark
  await S("caption", { chap: "Arabic · English · light · dark", en: "Made for Arabic, right to left.", ar: "عربيّ أولًا… من اليمين إلى اليسار", sub: "Every screen in both languages, light and dark, accessible to screen readers." });
  await page.context().addCookies([{ name: "lang", value: "ar", url: APP }]);
  ph = await load("phone", "/");
  await ph.evaluate(() => { try { localStorage.setItem("theme", "dark"); } catch { /* */ } });
  ph = await load("phone", "/");
  await wait(2200);
  await scrollBy(ph, 560, 1600);
  await wait(800);
  await S("hideCursor");

  // Outro
  await S("mode", "outro");
  await wait(8000);
}

/** The letters the machine read for the masked word (from the line's tokens), so the demo types a sensible reading. */
async function guessReading(d: Frame): Promise<string> {
  try {
    const lineId = await d.getByTestId("hard-card-item").getAttribute("data-line");
    const ctx = (await d.getByTestId("hard-context").innerText()).split(/▒+/)[0].replace(/\s+/g, " ").trim();
    const r = await page.request.get(`${APP}/api/ms/lines/${lineId}`);
    const j = await r.json();
    const toks = (j.data?.version?.tokens ?? []) as { t: string; v?: string }[];
    let text = "";
    for (const t of toks) {
      if (t.t === "unclear" && text.replace(/\s+/g, " ").trim().endsWith(ctx.slice(-6))) return t.v ?? "";
      if (t.v) text += t.v;
    }
    return toks.find((t) => t.t === "unclear")?.v ?? "قال";
  } catch {
    return "قال";
  }
}

// ───────────────────────── run + encode
async function main() {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  await new Promise<void>((r) => server.listen(STAGE_PORT, r));
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--hide-scrollbars"] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("say.welcomed", "1");
      for (const t of ["my-work", "hard-words", "adjudicate", "review", "suggest", "comments", "quran", "assign", "compare"]) localStorage.setItem(`ms-collab-tip:${t}`, "1");
    } catch { /* stage origin */ }
  });
  await ctx.addCookies([{ name: "lang", value: "en", url: APP }]);
  page = await ctx.newPage();
  await page.goto(`http://localhost:${STAGE_PORT}/`);
  await page.evaluate(() => document.fonts.ready);
  await wait(600);

  const cdp = await ctx.newCDPSession(page);
  const frames: { file: string; ts: number }[] = [];
  let n = 0;
  cdp.on("Page.screencastFrame", async (f: { data: string; sessionId: number; metadata: { timestamp: number } }) => {
    const file = path.join(FRAMES, `f${String(++n).padStart(6, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, ts: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = Date.now();
  try {
    await film();
  } finally {
    await wait(300);
    await cdp.send("Page.stopScreencast").catch(() => {});
    await browser.close();
    server.close();
  }
  console.log(`captured ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  // concat list with real durations → constant 30 fps H.264
  const lines: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const dur = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - frames[i].ts) : 1;
    lines.push(`file '${frames[i].file}'`, `duration ${dur.toFixed(4)}`);
  }
  lines.push(`file '${frames.at(-1)!.file}'`);
  const list = path.join(OUT_DIR, "frames.txt");
  fs.writeFileSync(list, lines.join("\n"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", "fps=30,format=yuv420p,fade=t=in:st=0:d=0.8", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", OUT], { stdio: "inherit" });
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
