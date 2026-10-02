import { afterEach, describe, expect, it, vi } from "vitest";
import { ORIGIN, html, loadWorker, req, res } from "./sw-harness";

const SW = "public/sw.js";
const KILL = "src/features/pwa/kill-switch.sw.js";

type Classify = (url: string, method: string, o?: Record<string, unknown>) => string;

function boot() {
  const w = loadWorker(SW);
  const names = w.get<Record<string, string>>("CACHE_NAMES");
  return { w, names };
}

/** Network that serves a few known routes, like the real app. */
function online(w: ReturnType<typeof loadWorker>, extra: Record<string, () => Response> = {}) {
  w.setFetch(async (url) => {
    const u = new URL(url);
    const key = u.pathname + u.search;
    if (extra[key]) return extra[key]();
    if (extra[u.pathname]) return extra[u.pathname]();
    if (u.pathname === "/offline.html") return html("<title>Offline</title>OFFLINE PAGE");
    if (u.pathname.startsWith("/icons/") || u.pathname.startsWith("/fonts/") || u.pathname === "/manifest.webmanifest") return res("asset");
    if (u.pathname.startsWith("/_next/static/")) return res("static:" + u.pathname, { contentType: "application/javascript" });
    if (u.origin !== ORIGIN) return res(null, { type: "opaque" });
    return html(`<title>${u.pathname}</title>page ${u.pathname}`);
  });
}
function offline(w: ReturnType<typeof loadWorker>) {
  w.setFetch(async () => {
    throw new TypeError("Failed to fetch");
  });
}
const nav = (url: string) => req(url, { mode: "navigate", destination: "document", headers: { accept: "text/html" } });

afterEach(() => {
  vi.useRealTimers();
});

describe("classifyRequest", () => {
  const { w } = boot();
  const classify = w.get<Classify>("classifyRequest");
  const o = { origin: ORIGIN };
  it.each([
    ["/", "GET", { mode: "navigate" }, "page"],
    ["/c/moon", "GET", { mode: "navigate" }, "page"],
    ["/card/card:moon?x=1", "GET", { destination: "document" }, "page"],
    ["/about", "POST", { mode: "navigate" }, "network"],
    ["/api/ask", "POST", {}, "network"],
    ["/api/concepts", "POST", {}, "network"],
    ["/portal", "GET", { mode: "navigate" }, "network"],
    ["/portal/manuscripts/ms1/pages/p1", "GET", { mode: "navigate" }, "network"],
    ["/portal/cards", "GET", {}, "network"],
    ["/api/events?scopes=cards", "GET", {}, "network"],
    ["/api/session", "GET", {}, "network"],
    ["/api/ms/ms1/pages", "GET", {}, "network"],
    ["/api/ms", "GET", {}, "network"],
    ["/api/cards/card:moon", "GET", {}, "network"],
    ["/api/concepts", "GET", {}, "data"],
    ["/api/concepts/moon", "GET", {}, "data"],
    ["/_next/static/chunks/app-123.js", "GET", {}, "static"],
    ["/_next/static/media/readex.woff2", "GET", { destination: "font" }, "static"],
    ["/fonts/hafs.18.woff2", "GET", { destination: "font" }, "shell"],
    ["/icons/icon-192.png", "GET", { destination: "image" }, "shell"],
    ["/manifest.webmanifest", "GET", {}, "shell"],
    ["/images/concepts/moon.webp", "GET", { destination: "image" }, "image"],
    ["/_next/image?url=%2Fx.png&w=640", "GET", {}, "image"],
    ["https://d8j0ntlcm91z4.cloudfront.net/u/hf_moon.png", "GET", { destination: "image" }, "image"],
    ["https://cdn.example.com/lib.js", "GET", { destination: "script" }, "network"],
    ["/c/moon?_rsc=abc", "GET", {}, "network"],
    ["/c/moon", "GET", { rsc: true }, "network"],
    ["/talk", "GET", { mode: "navigate" }, "network"],
    ["/sw.js", "GET", {}, "network"],
    ["chrome-extension://abc/x.js", "GET", {}, "network"],
  ])("%s %s %j → %s", (url, method, extra, expected) => {
    expect(classify(url, method, { ...o, ...extra })).toBe(expected);
  });

  it("never classifies portal or realtime paths as cacheable, whatever the request looks like", () => {
    for (const p of ["/portal", "/portal/x.png", "/api/events", "/api/session", "/api/ms/a.png"]) {
      for (const extra of [{ mode: "navigate" }, { destination: "image" }, {}]) expect(classify(p, "GET", { ...o, ...extra })).toBe("network");
    }
  });
});

describe("cacheKey", () => {
  const { w } = boot();
  const cacheKey = w.get<(u: string, o: string) => string>("cacheKey");
  it("drops hash, source and tracking params and sorts the rest", () => {
    expect(cacheKey("/?source=pwa", ORIGIN)).toBe(`${ORIGIN}/`);
    expect(cacheKey("/c/moon?utm_source=x&b=2&a=1#top", ORIGIN)).toBe(`${ORIGIN}/c/moon?a=1&b=2`);
    expect(cacheKey("/snap?source=pwa-shortcut", ORIGIN)).toBe(`${ORIGIN}/snap`);
  });
});

describe("install & activate", () => {
  it("precaches the shell (offline page, icons, Quran font) without skipping the waiting phase", async () => {
    const { w, names } = boot();
    online(w);
    await w.install().settle();
    const shell = w.caches.dump()[names.shell];
    expect(shell).toEqual(expect.arrayContaining([`${ORIGIN}/offline.html`, `${ORIGIN}/fonts/hafs.18.woff2`, `${ORIGIN}/icons/icon-192.png`, `${ORIGIN}/manifest.webmanifest`]));
    expect(w.calls.skipWaiting).toBe(0);
  });

  it("tolerates a missing optional asset but requires the offline page", async () => {
    const { w, names } = boot();
    online(w, { "/fonts/hafs.18.woff2": () => res("nope", { status: 404 }) });
    await w.install().settle();
    expect(w.caches.dump()[names.shell]).toContain(`${ORIGIN}/offline.html`);
    expect(w.caches.dump()[names.shell]).not.toContain(`${ORIGIN}/fonts/hafs.18.woff2`);

    // Without the offline page the install's waitUntil rejects, so the browser discards this worker.
    const b = boot();
    online(b.w, { "/offline.html": () => res("x", { status: 500 }) });
    await expect(b.w.get<() => Promise<void>>("precache")()).rejects.toThrow(/add failed/);
  });

  it("removes old versions of our caches on activate, keeps others, and claims clients", async () => {
    const { w, names } = boot();
    await w.caches.open("say-pages-old");
    await w.caches.open("say-static-2025-01-01");
    await w.caches.open("someone-else");
    await w.caches.open(names.pages);
    await w.activate().settle();
    const left = Object.keys(w.caches.dump());
    expect(left).toContain("someone-else");
    expect(left).toContain(names.pages);
    expect(left).not.toContain("say-pages-old");
    expect(left).not.toContain("say-static-2025-01-01");
    expect(w.calls.claim).toBe(1);
  });
});

describe("navigations", () => {
  it("network-first: a page read online is served from cache offline; an unvisited page gets the offline page", async () => {
    const { w, names } = boot();
    online(w);
    await w.install().settle();
    const first = w.fetch(nav("/c/moon?utm_source=share"));
    expect(first.intercepted).toBe(true);
    expect(await (await first.response()).text()).toContain("page /c/moon");
    await first.settle();
    expect(w.caches.dump()[names.pages]).toEqual([`${ORIGIN}/c/moon`]);

    offline(w);
    const again = w.fetch(nav("/c/moon"));
    expect(await (await again.response()).text()).toContain("page /c/moon");
    const unseen = w.fetch(nav("/c/sun"));
    expect(await (await unseen.response()).text()).toContain("OFFLINE PAGE");
  });

  it("start_url /?source=pwa opens the saved home page offline", async () => {
    const { w } = boot();
    online(w);
    await w.install().settle();
    await w.fetch(nav("/")).settle();
    offline(w);
    expect(await (await w.fetch(nav("/?source=pwa")).response()).text()).toContain("page /");
  });

  it("falls back to the saved copy after 4 s, but waits for the network when nothing is saved", async () => {
    vi.useFakeTimers();
    const { w } = boot();
    online(w);
    await w.fetch(nav("/about")).settle();
    let release: (r: Response) => void = () => {};
    w.setFetch(() => new Promise<Response>((r) => (release = r)));
    const slow = w.fetch(nav("/about"));
    await vi.advanceTimersByTimeAsync(4100);
    expect(await (await slow.response()).text()).toContain("page /about");

    const slowUnseen = w.fetch(nav("/heritage"));
    let settled = false;
    void slowUnseen.response().then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(4100);
    expect(settled).toBe(false);
    release(html("late heritage"));
    await vi.advanceTimersByTimeAsync(10);
    expect(await (await slowUnseen.response()).text()).toBe("late heritage");
  });

  it("serves the saved copy when the server answers 5xx", async () => {
    const { w } = boot();
    online(w);
    await w.fetch(nav("/about")).settle();
    w.setFetch(async () => html("bad gateway", { status: 502 }));
    expect(await (await w.fetch(nav("/about")).response()).text()).toContain("page /about");
  });

  it("does not store redirects, non-HTML or opted-out pages", async () => {
    const { w, names } = boot();
    online(w, {
      "/r": () => html("x", { redirected: true }),
      "/j": () => res("{}", { contentType: "application/json" }),
      "/private": () => html("x", { headers: { "x-sw": "sw-no-store" } }),
      "/missing": () => html("nope", { status: 404 }),
    });
    for (const p of ["/r", "/j", "/private", "/missing"]) await w.fetch(nav(p)).settle();
    expect(w.caches.dump()[names.pages] ?? []).toEqual([]);
  });

  it("leaves portal pages, conversations and RSC requests alone (network-only, nothing cached)", async () => {
    const { w } = boot();
    online(w);
    for (const r of [nav("/portal"), nav("/portal/manuscripts/ms1"), nav("/talk"), req("/c/moon?_rsc=1", { headers: { RSC: "1" } })]) {
      const ev = w.fetch(r);
      expect(ev.intercepted).toBe(false);
    }
    expect(Object.values(w.caches.dump()).flat()).toEqual([]);
  });
});

describe("never cached", () => {
  it("POSTs, /api/events, /api/session and /api/ms are not intercepted", async () => {
    const { w } = boot();
    online(w);
    const cases = [
      req("/api/ask", { method: "POST" }),
      req("/api/concepts", { method: "POST" }),
      req("/api/events?scopes=cards", { headers: { accept: "text/event-stream" } }),
      req("/api/session"),
      req("/api/ms/ms1/pages/p1"),
      req("/api/cards/x"),
    ];
    for (const r of cases) expect(w.fetch(r).intercepted).toBe(false);
    expect(w.calls.fetched).toEqual([]);
  });
});

describe("assets", () => {
  it("/_next/static is cache-first", async () => {
    const { w } = boot();
    online(w);
    const r = req("/_next/static/chunks/main-abc.js", { destination: "script" });
    await w.fetch(r).settle();
    offline(w);
    const hit = w.fetch(r);
    expect(await (await hit.response()).text()).toBe("static:/_next/static/chunks/main-abc.js");
  });

  it("images are stale-while-revalidate, including opaque cross-origin CDN images, with a cap", async () => {
    const { w, names } = boot();
    online(w);
    const cdn = (i: number) => req(`https://d8j0ntlcm91z4.cloudfront.net/u/img-${i}.png`, { destination: "image", mode: "no-cors" });
    await w.fetch(cdn(0)).settle();
    expect(w.caches.dump()[names.images]).toEqual(["https://d8j0ntlcm91z4.cloudfront.net/u/img-0.png"]);
    offline(w);
    const cached = w.fetch(cdn(0));
    expect(cached.intercepted).toBe(true);
    expect(await cached.response()).toBeTruthy();
    await cached.settle(); // background refresh fails quietly

    online(w);
    const limit = w.get<{ images: number }>("LIMITS").images;
    for (let i = 1; i <= limit + 5; i++) await w.fetch(cdn(i)).settle();
    const kept = w.caches.dump()[names.images];
    expect(kept).toHaveLength(limit);
    expect(kept).not.toContain("https://d8j0ntlcm91z4.cloudfront.net/u/img-0.png");
  });

  it("skips images bigger than the size cap", async () => {
    const { w, names } = boot();
    online(w, { "/big.png": () => res("x", { headers: { "content-length": String(10 * 1024 * 1024) }, contentType: "image/png" }) });
    await w.fetch(req("/big.png", { destination: "image" })).settle();
    expect(w.caches.dump()[names.images] ?? []).toEqual([]);
  });

  it("GET /api/concepts is network-first with a cached fallback", async () => {
    const { w } = boot();
    online(w, { "/api/concepts": () => res(JSON.stringify({ ok: true, data: [1] }), { contentType: "application/json" }) });
    await w.fetch(req("/api/concepts")).settle();
    offline(w);
    expect(await (await w.fetch(req("/api/concepts")).response()).json()).toEqual({ ok: true, data: [1] });
  });

  it("a failing strategy falls back to a plain network fetch", async () => {
    const { w } = boot();
    online(w);
    w.caches.open = async () => {
      throw new Error("quota");
    };
    const ev = w.fetch(req("/_next/static/chunks/x.js"));
    expect(await (await ev.response()).text()).toBe("static:/_next/static/chunks/x.js");
  });
});

describe("messages", () => {
  it("SKIP_WAITING activates the waiting worker only when asked", async () => {
    const { w } = boot();
    await w.install().settle();
    expect(w.calls.skipWaiting).toBe(0);
    await w.message({ type: "SKIP_WAITING" }).settle();
    expect(w.calls.skipWaiting).toBe(1);
  });

  it("GET_VERSION replies with the version", async () => {
    const { w } = boot();
    const got: unknown[] = [];
    await w.message({ type: "GET_VERSION" }, [{ postMessage: (m) => got.push(m) }]).settle();
    expect(got).toEqual([{ type: "VERSION", version: w.get("VERSION") }]);
  });

  it("WARM saves visited pages and same-origin assets, but never portal pages or foreign scripts", async () => {
    const { w, names } = boot();
    online(w);
    await w
      .message({
        type: "WARM",
        pages: [`${ORIGIN}/c/moon?source=pwa`, `${ORIGIN}/portal/cards`, "https://evil.test/x", `${ORIGIN}/talk`],
        assets: [`${ORIGIN}/_next/static/css/app.css`, `${ORIGIN}/fonts/hafs.18.woff2`, "https://cdn.example.com/x.js", `${ORIGIN}/api/session`],
      })
      .settle();
    const d = w.caches.dump();
    expect(d[names.pages]).toEqual([`${ORIGIN}/c/moon`]);
    expect(d[names.static]).toEqual([`${ORIGIN}/_next/static/css/app.css`]);
    expect(d[names.shell]).toEqual([`${ORIGIN}/fonts/hafs.18.woff2`]);
    expect(w.calls.fetched.some((u) => u.includes("/portal") || u.includes("evil") || u.includes("cdn.example") || u.includes("/api/session") || u.includes("/talk"))).toBe(false);
  });
});

describe("kill switch", () => {
  it("takes over at once, deletes our caches, unregisters and reloads open tabs", async () => {
    const w = loadWorker(KILL);
    await w.caches.open("say-pages-2026-10-02.1");
    await w.caches.open("say-images-2026-10-02.1");
    await w.caches.open("someone-else");
    w.install();
    expect(w.calls.skipWaiting).toBe(1);
    await w.activate().settle();
    expect(Object.keys(w.caches.dump())).toEqual(["someone-else"]);
    expect(w.calls.unregister).toBe(1);
    expect(w.calls.navigated).toEqual([`${ORIGIN}/c/moon`]);
    expect(w.listeners.fetch).toBeUndefined();
  });
});
