/**
 * Test harness: runs a hand-written service worker file (public/sw.js, kill-switch.sw.js) inside a Node vm with
 * an in-memory CacheStorage, a scripted fetch and fake FetchEvents. Used by sw.test.ts only.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

export const ORIGIN = "https://signs.test";

type Handler = (e: unknown) => void;
type FetchImpl = (input: string, init?: unknown) => Promise<Response>;

export class FakeCache {
  map = new Map<string, Response>();
  constructor(private readonly fetchFn: () => FetchImpl) {}
  private key(r: unknown) {
    if (typeof r === "string") return new URL(r, ORIGIN).href;
    return String((r as { url: string }).url);
  }
  async match(r: unknown) {
    const v = this.map.get(this.key(r));
    return v ? v.clone() : undefined;
  }
  async put(r: unknown, res: Response) {
    this.map.set(this.key(r), res);
  }
  async add(r: unknown) {
    const res = await this.fetchFn()(this.key(r));
    if (!res.ok) throw new TypeError(`add failed: ${res.status}`);
    this.map.set(this.key(r), res);
  }
  async keys() {
    return [...this.map.keys()].map((u) => new Request(u));
  }
  async delete(r: unknown) {
    return this.map.delete(this.key(r));
  }
}

export class FakeCaches {
  stores = new Map<string, FakeCache>();
  constructor(private readonly fetchFn: () => FetchImpl) {}
  async open(name: string) {
    let c = this.stores.get(name);
    if (!c) {
      c = new FakeCache(this.fetchFn);
      this.stores.set(name, c);
    }
    return c;
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async has(name: string) {
    return this.stores.has(name);
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
  async match(r: unknown, opts?: { cacheName?: string }) {
    if (opts?.cacheName) return this.stores.get(opts.cacheName)?.match(r);
    for (const c of this.stores.values()) {
      const hit = await c.match(r);
      if (hit) return hit;
    }
    return undefined;
  }
  /** Synchronous view for assertions: cache name → URLs. */
  dump() {
    return Object.fromEntries([...this.stores].map(([n, c]) => [n, [...c.map.keys()]]));
  }
}

/** A Response that reports `type` like a browser would ("basic" for same-origin, "opaque" for no-cors). */
export function res(body: string | null, init: ResponseInit & { type?: string; redirected?: boolean; contentType?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.contentType) headers.set("content-type", init.contentType);
  const r = new Response(init.type === "opaque" ? null : body, { status: init.type === "opaque" ? 200 : init.status ?? 200, headers });
  Object.defineProperty(r, "type", { value: init.type ?? "basic" });
  if (init.type === "opaque") Object.defineProperty(r, "status", { value: 0 });
  if (init.type === "opaque") Object.defineProperty(r, "ok", { value: false });
  if (init.redirected) Object.defineProperty(r, "redirected", { value: true });
  return r;
}

export const html = (body: string, init: Parameters<typeof res>[1] = {}) => res(body, { contentType: "text/html; charset=utf-8", ...init });

export type FakeRequest = { url: string; method: string; mode: string; destination: string; headers: Headers };
export function req(url: string, o: Partial<Omit<FakeRequest, "headers">> & { headers?: Record<string, string> } = {}): FakeRequest {
  return {
    url: new URL(url, ORIGIN).href,
    method: o.method ?? "GET",
    mode: o.mode ?? "cors",
    destination: o.destination ?? "",
    headers: new Headers(o.headers ?? {}),
  };
}

export function loadWorker(file: string) {
  const listeners: Record<string, Handler[]> = {};
  const calls = { skipWaiting: 0, claim: 0, unregister: 0, navigated: [] as string[], fetched: [] as string[] };
  let fetchImpl: FetchImpl = async () => {
    throw new TypeError("Failed to fetch");
  };
  const caches = new FakeCaches(() => (input) => ctx.fetch(input));
  class LocalRequest extends Request {
    constructor(input: string | Request, init?: RequestInit) {
      super(typeof input === "string" ? new URL(input, ORIGIN).href : input, init);
    }
  }
  const clients = [{ url: `${ORIGIN}/c/moon`, navigate: async (u: string) => void calls.navigated.push(u) }];
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: Handler) => (listeners[type] ||= []).push(fn),
    skipWaiting: async () => void calls.skipWaiting++,
    clients: { claim: async () => void calls.claim++, matchAll: async () => clients },
    registration: { unregister: async () => (calls.unregister++, true) },
  };
  const ctx = vm.createContext({
    self,
    caches,
    fetch: (input: unknown, init?: unknown) => {
      const url = typeof input === "string" ? new URL(input, ORIGIN).href : String((input as { url: string }).url);
      calls.fetched.push(url);
      return fetchImpl(url, init ?? input);
    },
    Request: LocalRequest,
    Response,
    Headers,
    URL,
    URLSearchParams,
    Promise,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
    console,
  });
  vm.runInContext(fs.readFileSync(path.resolve(file), "utf8"), ctx, { filename: file });

  function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    const ev = {
      ...extra,
      waitUntil: (p: Promise<unknown>) => void waits.push(Promise.resolve(p)),
      respondWith: (p: Promise<Response>) => {
        response = Promise.resolve(p);
      },
    };
    for (const fn of listeners[type] || []) fn(ev);
    return {
      get intercepted() {
        return response !== undefined;
      },
      response: () => response as Promise<Response>,
      /** Wait for respondWith and every waitUntil (including ones added while settling). */
      settle: async () => {
        if (response) await response.catch(() => undefined);
        let n = -1;
        while (n !== waits.length) {
          n = waits.length;
          await Promise.allSettled(waits);
        }
      },
    };
  }

  return {
    ctx,
    caches,
    calls,
    listeners,
    /** Evaluate an expression inside the worker's global scope (top-level consts and functions). */
    get: <T = unknown>(expr: string) => vm.runInContext(expr, ctx) as T,
    setFetch: (f: FetchImpl) => {
      fetchImpl = f;
    },
    install: () => dispatch("install"),
    activate: () => dispatch("activate"),
    fetch: (r: FakeRequest) => dispatch("fetch", { request: r }),
    message: (data: unknown, ports?: { postMessage: (m: unknown) => void }[]) => dispatch("message", { data, ports }),
  };
}
