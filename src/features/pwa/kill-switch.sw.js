/*
 * KILL SWITCH for the Signs Around You service worker.
 *
 * If a shipped public/sw.js misbehaves, copy THIS file over public/sw.js and deploy. Browsers re-check /sw.js on
 * every navigation (it is served with `Cache-Control: no-store`, see next.config.ts), find this version, install
 * it, and it immediately: takes over, deletes every cache this app created, unregisters itself and reloads the
 * open tabs so they come back straight from the network. After that the site runs with no service worker at all.
 *
 * To turn the PWA back on later, restore the real sw.js with a NEW `VERSION`.
 * Tested in src/features/pwa/sw.test.ts.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n.startsWith("say-")).map((n) => caches.delete(n)));
      } catch {
        /* keep going: unregistering matters more than cleaning */
      }
      await self.registration.unregister();
      const tabs = await self.clients.matchAll({ type: "window" });
      await Promise.all(tabs.map((c) => (c.navigate ? c.navigate(c.url).catch(() => null) : null)));
    })(),
  );
});

// Never intercept anything.
