import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { expectAccessible } from "../helpers";

/**
 * Service worker journeys against the production build. Under automation the worker is opt-in (`?sw=1`, see
 * src/features/pwa/logic.ts) so other suites never run behind it.
 */

async function controlled(page: Page) {
  await page.goto("/?sw=1");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The worker claims the page on first install; a reload makes the HTML itself come through the worker.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

/**
 * Go offline for the page AND its service worker. `setOffline` flips navigator.onLine, but Chromium's emulation
 * doesn't reliably reach a running worker's own fetches, so every request is also aborted at the network.
 */
async function goOffline(context: BrowserContext, offline: boolean) {
  await context.setOffline(offline);
  if (offline) await context.route("**/*", (r) => r.abort("internetdisconnected"));
  else await context.unrouteAll({ behavior: "ignoreErrors" });
}

async function cachedUrls(page: Page) {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(`${n} ${new URL(r.url).pathname}`);
    return out;
  });
}

const swVersion = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const c = navigator.serviceWorker.controller;
        if (!c) return resolve("none");
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data.version);
        c.postMessage({ type: "GET_VERSION" }, [ch.port2]);
      }),
  );

test("manifest is served as a web app manifest and parses", async ({ request }) => {
  const r = await request.get("/manifest.webmanifest");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toMatch(/application\/manifest\+json/);
  const m = await r.json();
  expect(m.name).toBe("Signs Around You · آيات حولك");
  expect(m.start_url).toBe("/?source=pwa");
  expect(m.display).toBe("standalone");
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
});

test("icons, favicon, OG image and offline page exist and are referenced", async ({ request, page }) => {
  for (const f of ["icon.svg", "icon-192.png", "icon-512.png", "maskable-192.png", "maskable-512.png", "apple-touch-icon.png", "favicon-32.png", "badge-96.png", "og.png"]) {
    const r = await request.get(`/icons/${f}`);
    expect(r.status(), f).toBe(200);
    expect(r.headers()["content-type"], f).toMatch(/^image\//);
  }
  expect((await request.get("/offline.html")).status()).toBe(200);
  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-store");

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
  await expect(page.locator('link[rel="icon"][href="/icons/icon.svg"]')).toHaveCount(1);
  await expect(page.locator('head meta[property="og:image"]')).toHaveAttribute("content", /^http:\/\/127\.0\.0\.1:\d+\/icons\/og\.png$/);
  await expect(page.locator('head meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
});

test("the service worker registers and controls the page after reload", async ({ page }) => {
  await controlled(page);
  expect(await swVersion(page)).toMatch(/^\d{4}-\d{2}-\d{2}/);
  const cached = await cachedUrls(page);
  expect(cached.some((c) => c.endsWith(" /offline.html"))).toBe(true);
  expect(cached.some((c) => c.endsWith(" /fonts/hafs.18.woff2"))).toBe(true);
  await expect.poll(async () => (await cachedUrls(page)).some((c) => /pages-.* \/$/.test(c))).toBe(true);
});

test("offline: a visited page renders from cache, an unvisited one shows the offline page", async ({ page, context }) => {
  await controlled(page);
  const heading = (await page.locator("h1").first().textContent())?.trim();
  // Make sure the background write of the page has landed.
  await expect.poll(async () => (await cachedUrls(page)).some((c) => /pages-.* \/$/.test(c))).toBe(true);

  await goOffline(context, true);
  await page.goto("/");
  await expect(page.locator("h1").first()).toHaveText(heading!);
  await expect(page.getByTestId("pwa-offline-pill")).toContainText("You're offline");

  await page.goto("/about-unvisited-page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You're offline");
  await expect(page.getByRole("link", { name: "Go to home" })).toBeVisible();
  await expect(page.locator("#saved-list a").first()).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: "Go to home" }).click();
  await expect(page.locator("h1").first()).toHaveText(heading!);
  await goOffline(context, false);
});

test("offline page follows the language cookie (Arabic, RTL)", async ({ page, context }) => {
  await controlled(page);
  await context.addCookies([{ name: "lang", value: "ar", url: page.url() }]);
  await goOffline(context, true);
  await page.goto("/never-visited");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("أنت غير متصل بالإنترنت");
  await expectAccessible(page);
  await goOffline(context, false);
});

test("a card visited online stays readable offline", async ({ page, context }) => {
  await controlled(page);
  const online = await page.goto("/c/moon");
  const ok = online?.status() === 200;
  const firstLine = ok ? (await page.locator("main").first().innerText()).split("\n").find((l) => l.trim()) ?? "" : "";
  if (ok) await expect.poll(async () => (await cachedUrls(page)).some((c) => c.endsWith(" /c/moon"))).toBe(true);

  await goOffline(context, true);
  await page.goto("/c/moon");
  if (ok) await expect(page.locator("main").first()).toContainText(firstLine.trim());
  // A page that wasn't a 200 online is never stored: the visitor gets the honest offline page instead.
  else await expect(page.getByRole("heading", { level: 1 })).toHaveText("You're offline");
  await goOffline(context, false);
});

test("portal routes are network-only: never cached, never served from cache", async ({ page, context }) => {
  await controlled(page);
  await page.goto("/portal/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  const leaked = (await cachedUrls(page)).filter((c) => / \/(portal|api\/session|api\/events|api\/ms)(\/|$)/.test(c));
  expect(leaked).toEqual([]);

  await goOffline(context, true);
  const failed = await page.goto("/portal/login").then(
    () => false,
    () => true,
  );
  expect(failed).toBe(true);
  await goOffline(context, false);
});

test("a new worker waits, then 'Refresh' activates it", async ({ page }) => {
  await controlled(page);
  // Simulate a deploy: a changed script URL makes the browser install a new worker next to the active one.
  await page.evaluate(() => navigator.serviceWorker.register("/sw.js?rev=next", { scope: "/", updateViaCache: "none" }));
  const toast = page.getByTestId("pwa-update-toast");
  await expect(toast).toContainText("Update available");
  // Nothing switches under the visitor until they ask.
  const state = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { waiting: r?.waiting?.scriptURL ?? "", controller: navigator.serviceWorker.controller?.scriptURL ?? "" };
  });
  expect(state.waiting).toMatch(/rev=next$/);
  expect(state.controller).toMatch(/\/sw\.js$/);
  await expectAccessible(page);

  await Promise.all([page.waitForEvent("load"), toast.getByRole("button", { name: "Refresh" }).click()]);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? "")).toMatch(/rev=next$/);
});

test("escape hatch: ?sw=0 unregisters the worker and clears its caches", async ({ page }) => {
  await controlled(page);
  expect(await page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith("say-")).length)).toBeGreaterThan(0);
  await page.goto("/?sw=0");
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith("say-")).length)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("pwa:sw"))).toBeNull();
});
