/*
 * Signs Around You · آيات حولك — service worker (hand-written, no build step).
 *
 * Strategies (see classifyRequest):
 *   page    navigations              network-first (4 s timeout) → cached copy → /offline.html
 *   data    GET /api/concepts        network-first (4 s timeout) → cached copy
 *   static  /_next/static/*          cache-first (content-hashed, immutable)
 *   shell   icons, fonts, manifest   cache-first, precached on install
 *   image   images, incl. cross-origin CDN (opaque) → stale-while-revalidate, capped
 *   (none)  POST & every other method, /portal/**, /api/events, /api/session, /api/ms/**, other /api/*, RSC
 *           flight requests, /sw.js → not intercepted at all: the browser goes straight to the network.
 *
 * Updating: bump VERSION. The new worker installs and WAITS; the page shows "Update available — Refresh" and
 * posts {type:"SKIP_WAITING"} when the visitor accepts. Old caches are deleted on activate.
 * Kill switch: see src/features/pwa/README.md (replace this file with kill-switch.sw.js).
 *
 * Tests load this file in a Node vm (src/features/pwa/sw.test.ts): keep it dependency-free and keep the
 * helpers as top-level declarations.
 */

const VERSION = "2026-10-02.1";
const CACHE_PREFIX = "say-";
const CACHE_NAMES = {
  shell: `${CACHE_PREFIX}shell-${VERSION}`,
  pages: `${CACHE_PREFIX}pages-${VERSION}`,
  data: `${CACHE_PREFIX}data-${VERSION}`,
  static: `${CACHE_PREFIX}static-${VERSION}`,
  images: `${CACHE_PREFIX}images-${VERSION}`,
};
const OFFLINE_URL = "/offline.html";
/** Precached on install. Only OFFLINE_URL is required; the rest are best-effort. */
const SHELL_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
  "/fonts/hafs.18.woff2",
];
const NETWORK_TIMEOUT_MS = 4000;
/** Entry caps per cache (oldest evicted first). Opaque images can't be measured, so they are capped by count. */
const LIMITS = { pages: 60, data: 40, static: 400, images: 80 };
/** Don't keep non-opaque images bigger than this. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Same-origin paths that must never touch a cache (network-only). */
const NEVER_CACHE = [/^\/portal(\/|$)/, /^\/api\/events(\/|$)/, /^\/api\/session(\/|$)/, /^\/api\/ms(\/|$)/, /^\/sw\.js$/];
/** Pages that are fine online but must not be stored on the device (private conversations). */
const NO_STORE_PAGES = [/^\/talk(\/|$)/];
/** Query parameters that don't change a page (dropped from cache keys so /?source=pwa finds "/"). */
const IGNORED_PARAMS = /^(source|utm_[a-z]+|fbclid|gclid|sw)$/;
const IMAGE_EXT = /\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/i;

/**
 * Decide how a request is handled. Pure; shared by the fetch handler and the unit tests.
 * @param {string|URL} url
 * @param {string} method
 * @param {{origin?: string, mode?: string, destination?: string, rsc?: boolean}} [opts]
 * @returns {"page"|"data"|"static"|"shell"|"image"|"network"}
 */
function classifyRequest(url, method, opts) {
  const o = opts || {};
  let u;
  try {
    u = typeof url === "string" ? new URL(url, o.origin || "http://localhost") : url;
  } catch (e) {
    return "network";
  }
  if ((method || "GET").toUpperCase() !== "GET") return "network";
  if (u.protocol !== "http:" && u.protocol !== "https:") return "network";
  const origin = o.origin || u.origin;
  const isImage = o.destination === "image" || IMAGE_EXT.test(u.pathname);

  if (u.origin !== origin) return isImage ? "image" : "network";

  const p = u.pathname;
  if (NEVER_CACHE.some((r) => r.test(p))) return "network";
  // React Server Component (flight) requests vary by router-state headers: never cache them. When they fail
  // offline, Next falls back to a full navigation, which the "page" strategy then serves.
  if (o.rsc || u.searchParams.has("_rsc")) return "network";
  if (o.mode === "navigate" || o.destination === "document") return NO_STORE_PAGES.some((r) => r.test(p)) ? "network" : "page";
  if (p.startsWith("/_next/static/")) return "static";
  if (p === "/manifest.webmanifest" || p === OFFLINE_URL || p.startsWith("/icons/") || p.startsWith("/fonts/")) return "shell";
  if (p.startsWith("/_next/image") || isImage) return "image";
  if (p === "/api/concepts" || p.startsWith("/api/concepts/")) return "data";
  return "network";
}

/** Cache key for pages and data: no hash, no tracking/source params, params sorted. */
function cacheKey(url, origin) {
  const u = new URL(String(url), origin || "http://localhost");
  u.hash = "";
  const keep = [];
  u.searchParams.forEach((v, k) => {
    if (!IGNORED_PARAMS.test(k)) keep.push([k, v]);
  });
  keep.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  u.search = keep.length ? "?" + keep.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : "";
  return u.href;
}

/** A page response we may keep for offline use. */
function isCacheablePage(res) {
  if (!res || res.status !== 200 || res.type !== "basic" || res.redirected) return false;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return false;
  return !/\bsw-no-store\b/i.test(res.headers.get("x-sw") || "");
}

function isCacheableImage(res) {
  if (!res) return false;
  if (res.type === "opaque") return true;
  if (!res.ok) return false;
  const len = Number(res.headers.get("content-length") || 0);
  return !(len > MAX_IMAGE_BYTES);
}

/** Resolve with the promise, or reject with "timeout" after ms. The original promise keeps running. */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function put(name, key, res, max) {
  const cache = await caches.open(name);
  // Re-insert so the entry moves to the end of keys() (most recently used survives trimming).
  await cache.delete(key);
  await cache.put(key, res);
  if (max) await trimCache(name, max);
}

/** event.waitUntil, tolerant of being called after the event's lifetime ended (then it's best effort). */
function keepAlive(event, promise) {
  const p = Promise.resolve(promise).catch(() => {});
  try {
    event.waitUntil(p);
  } catch (e) {
    /* lifetime already over: the work still runs while the worker is alive */
  }
}

function origin() {
  return self.location.origin;
}

async function offlineResponse() {
  const cached = await caches.match(OFFLINE_URL);
  if (cached) return cached;
  return new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Offline</title><p style='font:16px system-ui;padding:2rem'>You're offline. — أنت غير متصل.</p>",
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/** Navigations: network-first with a timeout, then the saved copy, then the offline page. */
async function pageStrategy(event) {
  const req = event.request;
  const key = cacheKey(req.url, origin());
  const network = fetch(req).then((res) => {
    if (isCacheablePage(res)) keepAlive(event, put(CACHE_NAMES.pages, key, res.clone(), LIMITS.pages));
    return res;
  });
  network.catch(() => {}); // handled below; avoid unhandled rejection noise
  try {
    const res = await withTimeout(network, NETWORK_TIMEOUT_MS);
    if (res.status >= 500) {
      const cached = await caches.match(key, { cacheName: CACHE_NAMES.pages });
      if (cached) return cached;
    }
    return res;
  } catch (e) {
    const cached = await caches.match(key, { cacheName: CACHE_NAMES.pages });
    if (cached) return cached;
    // Slow but not failed: keep waiting for the network rather than claiming we're offline.
    if (e && e.message === "timeout") {
      try {
        return await network;
      } catch (_) {
        /* fall through */
      }
    }
    return offlineResponse();
  }
}

/** JSON data: network-first with a timeout, then the saved copy. */
async function dataStrategy(event) {
  const req = event.request;
  const key = cacheKey(req.url, origin());
  const network = fetch(req).then((res) => {
    if (res.ok && res.type === "basic") keepAlive(event, put(CACHE_NAMES.data, key, res.clone(), LIMITS.data));
    return res;
  });
  network.catch(() => {});
  try {
    return await withTimeout(network, NETWORK_TIMEOUT_MS);
  } catch (e) {
    const cached = await caches.match(key, { cacheName: CACHE_NAMES.data });
    if (cached) return cached;
    return network; // may still resolve after a timeout; rejects if truly offline
  }
}

/** Immutable assets: cache-first. */
async function cacheFirst(event, name, max) {
  const req = event.request;
  const cached = await caches.match(req.url, { cacheName: name });
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") keepAlive(event, put(name, req.url, res.clone(), max));
  return res;
}

/** Images: serve the saved copy at once and refresh it in the background. */
async function imageStrategy(event) {
  const req = event.request;
  const cached = await caches.match(req.url, { cacheName: CACHE_NAMES.images });
  const refresh = fetch(req).then((res) => {
    if (isCacheableImage(res)) return put(CACHE_NAMES.images, req.url, res.clone(), LIMITS.images).then(() => res);
    return res;
  });
  if (cached) {
    keepAlive(event, refresh);
    return cached;
  }
  return refresh;
}

/** Route a fetch event. Returns a Response promise, or null to let the browser handle it untouched. */
function handleFetch(event) {
  const req = event.request;
  const kind = classifyRequest(req.url, req.method, {
    origin: origin(),
    mode: req.mode,
    destination: req.destination,
    rsc: req.headers.get("RSC") === "1" || req.headers.has("Next-Router-State-Tree"),
  });
  let p;
  switch (kind) {
    case "page":
      return pageStrategy(event).catch(() => offlineResponse());
    case "data":
      p = dataStrategy(event);
      break;
    case "static":
      p = cacheFirst(event, CACHE_NAMES.static, LIMITS.static);
      break;
    case "shell":
      p = cacheFirst(event, CACHE_NAMES.shell, 0);
      break;
    case "image":
      p = imageStrategy(event);
      break;
    default:
      return null;
  }
  // A bug in a strategy must never break the site: fall back to a plain network fetch.
  return p.catch(() => fetch(req));
}

async function precache() {
  const cache = await caches.open(CACHE_NAMES.shell);
  await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
  await Promise.all(SHELL_URLS.filter((u) => u !== OFFLINE_URL).map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
}

async function cleanup() {
  const keep = Object.values(CACHE_NAMES);
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX) && !keep.includes(n)).map((n) => caches.delete(n)));
}

/**
 * Save pages and assets the visitor has seen (sent by the page after load and after client-side navigations),
 * so a card read online opens offline later — even if it was reached by an in-app link.
 */
async function warm(pages, assets) {
  const o = origin();
  const jobs = [];
  for (const raw of (pages || []).slice(0, 10)) {
    const u = new URL(raw, o);
    if (u.origin !== o || classifyRequest(u, "GET", { origin: o, mode: "navigate" }) !== "page") continue;
    const key = cacheKey(u.href, o);
    jobs.push(
      (async () => {
        const res = await fetch(u.href, { credentials: "same-origin", headers: { accept: "text/html" } });
        if (isCacheablePage(res)) await put(CACHE_NAMES.pages, key, res, LIMITS.pages);
      })().catch(() => {}),
    );
  }
  for (const raw of (assets || []).slice(0, 200)) {
    const u = new URL(raw, o);
    const kind = classifyRequest(u, "GET", { origin: o });
    const name = kind === "static" ? CACHE_NAMES.static : kind === "shell" ? CACHE_NAMES.shell : kind === "image" && u.origin === o ? CACHE_NAMES.images : null;
    if (!name) continue;
    jobs.push(
      (async () => {
        if (await caches.match(u.href, { cacheName: name })) return;
        const res = await fetch(u.href, { credentials: "same-origin" });
        if (res.ok) await put(name, u.href, res, kind === "static" ? LIMITS.static : kind === "image" ? LIMITS.images : 0);
      })().catch(() => {}),
    );
  }
  await Promise.all(jobs);
}

function handleMessage(event) {
  const data = event.data || {};
  const reply = (msg) => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(msg);
    else if (event.source && event.source.postMessage) event.source.postMessage(msg);
  };
  switch (data.type) {
    case "SKIP_WAITING":
      return self.skipWaiting();
    case "GET_VERSION":
      return reply({ type: "VERSION", version: VERSION });
    case "WARM":
      return warm(data.pages, data.assets).then(() => reply({ type: "WARMED" }));
    default:
      return undefined;
  }
}

self.addEventListener("install", (event) => {
  // No skipWaiting here: an update waits until the page asks (SKIP_WAITING) so a visitor is never switched
  // to new code mid-read. The very first install has no predecessor and activates straight away.
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(cleanup().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  let res = null;
  try {
    res = handleFetch(event);
  } catch (e) {
    res = null;
  }
  if (res) event.respondWith(res);
});

self.addEventListener("message", (event) => {
  const p = handleMessage(event);
  if (p && typeof p.then === "function") keepAlive(event, p);
});
