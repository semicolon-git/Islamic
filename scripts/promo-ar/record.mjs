/**
 * Records the screen shots for the Arabic promo film: the real app, in Arabic, driven by script.
 *
 *   APP_URL=https://… node scripts/promo-ar/record.mjs [shot …]     → out/promo-ar/<shot>.mp4
 *
 * Each shot is its own clip (phone shots 780×1688 at 2× density, desktop shots 1920×1080) so the edit can fit it to the
 * narration. Taps, highlight rings and their Arabic labels are drawn in the page by a small overlay; nothing in the app
 * is mocked. Shots only read — they never approve, publish or change content — so they are safe to run on a live site.
 * The camera shot uses Chromium's fake camera fed by FAKE_CAMERA (a .y4m/.mjpeg file), so the viewfinder shows a real photo.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const pw = await import("playwright-core").catch(() => import("@playwright/test"));
const { chromium } = pw;

const APP = (process.env.APP_URL ?? "http://localhost:3400").replace(/\/$/, "");
const OUT = path.resolve(process.env.OUT_DIR ?? "out/promo-ar");
const CHROME = process.env.CHROME ?? (fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);
const FAKE_CAMERA = process.env.FAKE_CAMERA ?? "out/promo-ar/camera.y4m";
const PERSONA = process.env.PERSONA ?? "u_huda";
const PIN = process.env.PIN ?? "1448";

const POMEGRANATE = "/discover?en=Pomegranate&ar=" + encodeURIComponent("الرمان") + "&src=search";
const CAR = "/discover?en=Car&ar=" + encodeURIComponent("سيارة") + "&src=search";

// ───────────────────────── overlay drawn inside the app page (tap ripple, cursor, ring + Arabic label)
const OVERLAY = `(() => {
  const css = \`#__ov{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:"IBM Plex Sans Arabic","Readex Pro Variable",system-ui,sans-serif}
  #__ov .tap{position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.30);border:3px solid #36dcb8;box-shadow:0 0 18px rgba(54,220,184,.6);animation:__tap .75s ease-out forwards}
  @keyframes __tap{0%{transform:scale(.45);opacity:1}100%{transform:scale(1.9);opacity:0}}
  #__ov .ring{position:absolute;border-radius:16px;border:3px solid #36dcb8;box-shadow:0 0 0 6px rgba(54,220,184,.18),0 0 30px rgba(54,220,184,.45);opacity:0;transition:opacity .45s cubic-bezier(.2,.8,.2,1)}
  #__ov .ring.on{opacity:1}
  #__ov .tag{position:absolute;background:#36dcb8;color:#052a22;font-weight:600;font-size:15px;line-height:1.35;padding:7px 12px;border-radius:10px;direction:rtl;white-space:nowrap;opacity:0;transform:translateY(6px);transition:opacity .4s,transform .4s;box-shadow:0 6px 18px rgba(0,0,0,.18)}
  #__ov .tag.on{opacity:1;transform:none}
  #__ov .cur{position:absolute;left:0;top:0;width:30px;height:30px;opacity:0;transition-property:transform,opacity;transition-timing-function:cubic-bezier(.45,.05,.25,1);filter:drop-shadow(0 3px 8px rgba(0,0,0,.4))}
  #__ov .cur.on{opacity:1}\`;
  const mount = () => {
    if (document.getElementById("__ov")) return;
    const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
    const o = document.createElement("div"); o.id = "__ov";
    o.innerHTML = '<div class="ring"></div><div class="tag"></div><div class="cur"><svg viewBox="0 0 32 32" width="30" height="30"><path d="M6 3 L6 26 L12.5 20 L17 29.5 L21 27.6 L16.6 18.4 L25 18 Z" fill="#fff" stroke="#0b0e29" stroke-width="1.8" stroke-linejoin="round"/></svg></div>';
    document.body.appendChild(o);
  };
  window.__ov = {
    mount,
    tap(x, y) { mount(); const t = document.createElement("div"); t.className = "tap"; t.style.left = x + "px"; t.style.top = y + "px"; document.getElementById("__ov").appendChild(t); setTimeout(() => t.remove(), 800); },
    cursor(x, y, ms) { mount(); const c = document.querySelector("#__ov .cur"); c.classList.add("on"); c.style.transitionDuration = ms + "ms"; c.style.transform = "translate(" + (x - 6) + "px," + (y - 3) + "px)"; },
    ring(b, label) {
      mount(); const pad = 7, r = document.querySelector("#__ov .ring"), t = document.querySelector("#__ov .tag");
      Object.assign(r.style, { left: b.x - pad + "px", top: b.y - pad + "px", width: b.width + pad * 2 + "px", height: b.height + pad * 2 + "px" });
      r.classList.add("on");
      if (!label) return t.classList.remove("on");
      t.textContent = label;
      t.style.right = Math.max(8, innerWidth - (b.x + b.width) - pad) + "px"; t.style.left = "auto";
      const above = b.y - pad - 44;
      t.style.top = (above > 6 ? above : Math.min(innerHeight - 50, b.y + b.height + pad + 8)) + "px";
      t.classList.add("on");
    },
    unring() { document.querySelector("#__ov .ring")?.classList.remove("on"); document.querySelector("#__ov .tag")?.classList.remove("on"); },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();`;

const INIT = `try {
  localStorage.setItem("say.welcomed", "1");
  for (const t of ["my-work","hard-words","adjudicate","review","suggest","comments","quran","assign","compare"]) localStorage.setItem("ms-collab-tip:" + t, "1");
} catch {}`;

// ───────────────────────── helpers bound to the current page
let page;
let desk = false;
let cursorPos = { x: 960, y: 1300 };
const wait = (ms) => page.waitForTimeout(ms);

async function goto(p) {
  await page.goto(APP + p, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.addStyleTag({ content: "[data-testid=pwa-install-banner],nextjs-portal{display:none!important}" }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  if (desk) await page.evaluate(([x, y]) => window.__ov?.cursor(x, y, 0), [cursorPos.x, cursorPos.y]);
}

async function box(loc) {
  await loc.waitFor({ state: "visible", timeout: 30_000 });
  return loc.boundingBox();
}

/** Smoothly bring an element to the given fraction of the viewport height. */
async function scrollTo(loc, at = 0.35, settle = 1100) {
  await loc.waitFor({ state: "attached", timeout: 30_000 });
  await loc.evaluate((el, f) => {
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - innerHeight * f, behavior: "smooth" });
  }, at);
  await wait(settle);
}

async function scrollBy(dy, settle = 1300) {
  await page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy);
  await wait(settle);
}

async function point(loc, ms = 800) {
  if (!desk) return;
  const b = await box(loc);
  cursorPos = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.evaluate(([x, y, m]) => window.__ov.cursor(x, y, m), [cursorPos.x, cursorPos.y, ms]);
  await wait(ms + 120);
}

async function tap(loc, { hold = 450 } = {}) {
  const b0 = await box(loc);
  if (b0.y < 60 || b0.y + b0.height > page.viewportSize().height - 70) await scrollTo(loc, 0.45, 900);
  await point(loc);
  const b = await box(loc);
  await page.evaluate(([x, y]) => window.__ov.tap(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
  await wait(hold);
  await loc.click();
}

async function ring(loc, label, hold = 2200) {
  const b = await box(loc);
  await page.evaluate(([bb, l]) => window.__ov.ring(bb, l), [b, label]);
  await wait(hold);
  await page.evaluate(() => window.__ov.unring());
  await wait(300);
}

const T = (s) => page.getByText(s, { exact: false });

// ───────────────────────── shots
const SHOTS = {
  /** Home in Arabic → camera → photo of a pomegranate → what the sources say: Mushaf text, al-Muyassar, graded hadith. */
  async snap() {
    await goto("/?welcome=0");
    await wait(2200);
    await scrollBy(420, 1500);
    await wait(700);
    await scrollBy(-420, 1200);
    await tap(page.getByRole("link", { name: "وجّه الكاميرا نحو شيء ما" }).first());
    await page.waitForURL(/\/snap/);
    await wait(3200);
    await tap(page.getByRole("button", { name: "التقط صورة" }));
    const result = page.getByTestId("snap-result");
    let matched = await result.waitFor({ timeout: 40_000 }).then(() => true).catch(() => false);
    if (matched) {
      await wait(1400);
      const chip = result.locator("a[href^='/c/']").first();
      matched = await chip.isVisible().catch(() => false);
      if (matched) {
        await ring(chip, "يبدو أنه: الرمان", 1800);
        await tap(chip);
        await page.waitForURL(/\/c\//, { timeout: 20_000 }).catch(() => {});
      }
    }
    if (!matched || !/\/c\/pomegranate/.test(page.url())) await goto("/c/pomegranate");
    await wait(1600);
    await tap(page.locator(`a[href^="/discover"]`).first());
    await page.getByTestId("discover-summary").waitFor({ timeout: 90_000 });
    await wait(1800);
    await ring(page.getByTestId("discover-summary"), "ملخّص يحيل إلى كل مصدر", 2000);
    const verse = page.locator("blockquote").first();
    await scrollTo(verse, 0.28);
    await ring(verse, "نص المصحف كما طبعه مجمع الملك فهد", 2600);
    const tafsir = page.getByText("التفسير الميسر").first();
    await scrollTo(tafsir, 0.55, 900);
    await tap(tafsir);
    await wait(1500);
    await scrollBy(220, 1100);
    await wait(1600);
    const hadithHead = page.getByText(/ابن ماجه|البخاري|مسلم/).first();
    await scrollTo(hadithHead, 0.3);
    const hadithCard = hadithHead.locator("xpath=ancestor::*[self::article or self::li or self::div][2]");
    await ring((await hadithCard.count()) ? hadithCard : hadithHead, "الحديث برقمه ودرجته", 2800);
    await wait(600);
  },

  /** The three honest badges: an approved card, sources not yet reviewed, and “we won't guess”. */
  async badges() {
    await goto("/c/moon");
    await wait(1800);
    const approved = page.getByText(/اعتمدتها|بطاقة معتمدة/).first();
    await scrollTo(approved, 0.4, 900);
    await ring(approved, "بطاقة اعتمدتها مؤسسة علمية", 2600);
    await goto(POMEGRANATE);
    await page.getByTestId("discover-summary").waitFor({ timeout: 90_000 });
    await wait(1200);
    await ring(page.getByText("مصادر موثقة · لم يراجعها العلماء بعد").first(), "مصادر موثقة لم تُراجَع بعد", 2600);
    await goto(CAR);
    await page.getByTestId("discover-panel").waitFor({ timeout: 90_000 });
    await wait(1200);
    await ring(page.getByTestId("discover-panel"), "لن نخمّن", 3000);
  },

  /** Sky mode: tonight's sky and Hijri date, then Vega — al-nasr al-wāqiʿ — and its Arabic name's source. */
  async sky() {
    await goto("/sky");
    await wait(2000);
    await ring(page.getByText(/أم القرى/).first().locator("xpath=ancestor::section[1]"), "التاريخ الهجري وطور القمر الليلة", 2400);
    await goto("/sky/star/vega");
    await wait(1600);
    await ring(page.locator("h1").first(), "النسر الواقع", 2200);
    const src = page.getByText(/الصوفي/).first();
    await scrollTo(src, 0.35);
    await ring(src.locator("xpath=ancestor::*[self::section or self::div][1]"), "عبد الرحمن الصوفي · كتاب صور الكواكب الثابتة", 3000);
  },

  /** The astrolabe: what scholars in Muslim civilisation added, and museums that hold one. */
  async astrolabe() {
    await goto("/science/instrument/astrolabe");
    await wait(1800);
    const added = page.getByRole("heading", { name: "ما أضافه علماء الحضارة الإسلامية" });
    await scrollTo(added, 0.18);
    await ring(added.locator("xpath=.."), "ما أضافه علماء المسلمين", 2800);
    const where = page.getByRole("heading", { name: "أين ترى واحدة" });
    await scrollTo(where, 0.2, 1300);
    const first = page.getByTestId("holdings").locator("li, article").first();
    await ring((await first.count()) ? first : where, "قطع متحفية موثّقة", 2800);
    await scrollBy(380, 1600);
  },

  /** Institution portal (desktop): the library, a manuscript read line by line, copies compared, the review queue. */
  async portal() {
    await goto("/portal");
    await wait(2000);
    await goto("/portal/library");
    await wait(1600);
    await ring(page.locator("main section, main ul").first(), "كتب التفسير والحديث، والكتب المرفوعة بعد اعتمادها", 2600);
    await goto("/portal/manuscripts/umich-isl-22/pages/umich-isl-22_02");
    await page.getByTestId("workspace").waitFor({ timeout: 30_000 });
    await wait(1600);
    const l9 = "umich-isl-22_02-l9";
    await tap(page.locator(`polygon[data-line="${l9}"]`));
    await wait(1000);
    await ring(page.locator(`[data-line-row="${l9}"]`), "الصورة والنص متزامنان سطرًا سطرًا", 2600);
    await goto("/portal/manuscripts/umich-isl-22/compare");
    await page.getByTestId("apparatus").waitFor({ timeout: 30_000 });
    await wait(1400);
    await ring(page.getByTestId("apparatus"), "مقابلة النسخ كلمةً كلمة", 2600);
    await goto("/portal/cards");
    await wait(2200);
  },
};

// ───────────────────────── capture + encode
async function record(browser, name) {
  desk = name === "portal";
  const ctx = await browser.newContext(
    desk
      ? { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, locale: "ar-SA" }
      : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ar-SA", permissions: ["camera"] },
  );
  await ctx.addInitScript(INIT);
  await ctx.addInitScript(OVERLAY);
  await ctx.addCookies([{ name: "lang", value: "ar", url: APP }]);
  if (desk) {
    const r = await ctx.request.post(APP + "/api/session", { data: { userId: PERSONA, pin: PIN } });
    if (!r.ok()) throw new Error(`login ${PERSONA}: ${r.status()}`);
  }
  page = await ctx.newPage();
  // warm up (caches discoveries, fonts, images) before the camera rolls
  if (name === "snap" || name === "badges") for (const p of [POMEGRANATE, CAR]) {
    await page.goto(APP + p);
    await page.locator("[data-testid=discover-summary],[data-testid=discover-panel]").first().waitFor({ timeout: 120_000 }).catch(() => {});
  }
  await page.goto(APP + "/?welcome=0");
  await wait(800);

  const dir = path.join(OUT, name + "-frames");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const file = path.join(dir, `f${String(frames.length + 1).padStart(6, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, ts: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  const [w, h] = desk ? [1920, 1080] : [780, 1688];
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: w, maxHeight: h, everyNthFrame: 1 });
  const t0 = Date.now();
  try {
    await SHOTS[name]();
  } finally {
    await wait(400);
    await cdp.send("Page.stopScreencast").catch(() => {});
    await ctx.close();
  }
  console.log(`${name}: ${frames.length} frames, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const dur = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - frames[i].ts) : 0.5;
    lines.push(`file '${frames[i].file}'`, `duration ${dur.toFixed(4)}`);
  }
  lines.push(`file '${frames.at(-1).file}'`);
  const list = path.join(OUT, name + "-frames.txt");
  fs.writeFileSync(list, lines.join("\n"));
  const mp4 = path.join(OUT, name + ".mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", `fps=30,scale=${w}:${h}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-movflags", "+faststart", mp4], { stdio: "inherit" });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`wrote ${mp4}`);
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--hide-scrollbars", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${path.resolve(FAKE_CAMERA)}`],
});
try {
  for (const name of want) await record(browser, name);
} finally {
  await browser.close();
}
