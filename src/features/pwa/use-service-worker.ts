"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { STORAGE, SW_URL, assetsToWarm, isWarmablePath, swAction } from "./logic";

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Remove every registration and every cache this app created (the client half of the kill switch). */
export async function unregisterAll() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("say-")).map((n) => caches.delete(n)));
  }
}

function postWarm(reg: ServiceWorkerRegistration | null, pages: string[], withAssets: boolean) {
  const target = reg?.active ?? navigator.serviceWorker.controller;
  if (!target) return;
  const assets = withAssets
    ? assetsToWarm(
        [
          ...performance.getEntriesByType("resource").map((e) => e.name),
          ...Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"), (s) => s.src),
          ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"], link[rel="preload"]'), (l) => l.href),
        ],
        location.origin,
      )
    : [];
  target.postMessage({ type: "WARM", pages, assets });
}

/**
 * Registers /sw.js (production; `?sw=1` elsewhere), keeps visited pages warm for offline reading, and exposes
 * a waiting update so the UI can offer "Refresh".
 */
export function useServiceWorker() {
  const pathname = usePathname();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const refreshing = useRef(false);
  const firstPath = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported = "serviceWorker" in navigator;
    const ls = store();
    const params = new URLSearchParams(location.search);
    if (params.get("sw") === "1") ls?.setItem(STORAGE.swOptIn, "1");
    if (params.get("sw") === "0" || params.get("sw") === "off") ls?.removeItem(STORAGE.swOptIn);
    const action = swAction({
      supported,
      nodeEnv: process.env.NODE_ENV,
      search: location.search,
      disabled: process.env.NEXT_PUBLIC_PWA_DISABLED,
      automated: navigator.webdriver === true,
      optedIn: ls?.getItem(STORAGE.swOptIn) === "1",
    });
    if (action === "skip") return;
    if (action === "unregister") {
      unregisterAll().catch(() => {});
      return;
    }

    let cancelled = false;
    const servedByWorker = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (refreshing.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const track = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener("statechange", () => {
          // "installed" with an existing controller = an update is waiting (first installs activate directly).
          if (w.state === "installed" && navigator.serviceWorker.controller && !cancelled) setWaiting(w);
        });
      });
    };

    const register = () =>
      navigator.serviceWorker
        .register(SW_URL, { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          if (cancelled) return;
          regRef.current = reg;
          track(reg);
          return navigator.serviceWorker.ready.then((ready) => {
            if (cancelled) return;
            regRef.current = ready;
            // The first page of a visit was fetched before the worker existed: save it and its assets now.
            postWarm(ready, servedByWorker ? [] : [location.href], true);
          });
        })
        .catch(() => {});

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    const check = () => {
      if (document.visibilityState === "visible") regRef.current?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", check);
    const interval = window.setInterval(check, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("load", register);
      window.clearInterval(interval);
    };
  }, []);

  // Client-side navigations don't fetch HTML, so ask the worker to save the page the visitor is now reading.
  useEffect(() => {
    if (!pathname) return;
    if (firstPath.current === null) {
      firstPath.current = pathname;
      return;
    }
    if (!isWarmablePath(pathname) || !navigator.serviceWorker?.controller) return;
    const t = window.setTimeout(() => postWarm(regRef.current, [location.href], false), 1200);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const applyUpdate = useCallback(() => {
    if (!waiting) return;
    refreshing.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    // If the worker can't take over (e.g. it became redundant), still reload after a moment.
    window.setTimeout(() => window.location.reload(), 3000);
  }, [waiting]);

  const dismissUpdate = useCallback(() => setWaiting(null), []);

  return { updateReady: !!waiting, applyUpdate, dismissUpdate };
}
