import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { pwa } from "@/i18n/messages/pwa";
import { DISMISS_SNOOZE_MS, assetsToWarm, isIOS, isInAppBrowser, isQuietPath, isWarmablePath, parseCount, shouldOfferInstall, swAction } from "./logic";

describe("swAction", () => {
  const base = { supported: true, nodeEnv: "production", search: "" };
  it("registers in production", () => expect(swAction(base)).toBe("register"));
  it("skips in development unless ?sw=1 or opted in", () => {
    expect(swAction({ ...base, nodeEnv: "development" })).toBe("skip");
    expect(swAction({ ...base, nodeEnv: "development", search: "?sw=1" })).toBe("register");
    expect(swAction({ ...base, nodeEnv: "development", optedIn: true })).toBe("register");
  });
  it("is opt-in under automation so other suites' network mocks are never shadowed", () => {
    expect(swAction({ ...base, automated: true })).toBe("skip");
    expect(swAction({ ...base, automated: true, search: "?sw=1" })).toBe("register");
  });
  it("unregisters on ?sw=0|off or when the build disables the PWA (kill switch)", () => {
    expect(swAction({ ...base, search: "?sw=0" })).toBe("unregister");
    expect(swAction({ ...base, search: "?a=1&sw=off" })).toBe("unregister");
    expect(swAction({ ...base, disabled: "1" })).toBe("unregister");
    expect(swAction({ ...base, disabled: "true", optedIn: true })).toBe("unregister");
  });
  it("does nothing without service worker support", () => expect(swAction({ ...base, supported: false, search: "?sw=0" })).toBe("skip"));
});

describe("platform detection", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const ipadOS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  const pixel = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
  it("detects iPhone and iPadOS-as-Mac, not Android or a real Mac", () => {
    expect(isIOS(iphone)).toBe(true);
    expect(isIOS(ipadOS, "MacIntel", 5)).toBe(true);
    expect(isIOS(ipadOS, "MacIntel", 0)).toBe(false);
    expect(isIOS(pixel, "Linux armv8l", 5)).toBe(false);
  });
  it("detects in-app browsers", () => {
    expect(isInAppBrowser(iphone + " Instagram 300.0")).toBe(true);
    expect(isInAppBrowser(iphone + " [FBAN/FBIOS;FBAV/400]")).toBe(true);
    expect(isInAppBrowser(pixel)).toBe(false);
  });
});

describe("shouldOfferInstall", () => {
  const now = 1_800_000_000_000;
  const base = { pathname: "/c/moon", visits: 2, dismissedAt: null, now, standalone: false, installed: false, canPrompt: true, ios: false };
  it("offers from the second visit on, or on the home page", () => {
    expect(shouldOfferInstall(base)).toBe(true);
    expect(shouldOfferInstall({ ...base, visits: 1 })).toBe(false);
    expect(shouldOfferInstall({ ...base, visits: 1, pathname: "/" })).toBe(true);
  });
  it("needs a way to install: a captured prompt or iOS instructions", () => {
    expect(shouldOfferInstall({ ...base, canPrompt: false })).toBe(false);
    expect(shouldOfferInstall({ ...base, canPrompt: false, ios: true })).toBe(true);
    expect(shouldOfferInstall({ ...base, canPrompt: false, ios: true, inApp: true })).toBe(false);
  });
  it("never on the camera, onboarding, conversations or the portal", () => {
    for (const p of ["/snap", "/snap/result", "/welcome", "/talk", "/inscription", "/portal", "/portal/cards"]) expect(shouldOfferInstall({ ...base, pathname: p })).toBe(false);
  });
  it("respects 'Not now' for two weeks, and never once installed", () => {
    expect(shouldOfferInstall({ ...base, dismissedAt: now - 1000 })).toBe(false);
    expect(shouldOfferInstall({ ...base, dismissedAt: now - DISMISS_SNOOZE_MS - 1 })).toBe(true);
    expect(shouldOfferInstall({ ...base, installed: true })).toBe(false);
    expect(shouldOfferInstall({ ...base, standalone: true })).toBe(false);
  });
});

describe("paths & assets", () => {
  it("quiet paths", () => {
    expect(isQuietPath("/snapshot")).toBe(false);
    expect(isQuietPath("/snap")).toBe(true);
  });
  it("warms reading pages only", () => {
    expect(isWarmablePath("/c/moon")).toBe(true);
    expect(isWarmablePath("/heritage/item/ABC-12")).toBe(true);
    expect(isWarmablePath("/portal/cards")).toBe(false);
    expect(isWarmablePath("/talk")).toBe(false);
    expect(isWarmablePath("/api/concepts")).toBe(false);
    expect(isWarmablePath("/icons/og.png")).toBe(false);
  });
  it("picks same-origin static assets only, de-duplicated", () => {
    const o = "https://signs.test";
    expect(
      assetsToWarm([`${o}/_next/static/a.js`, `${o}/_next/static/a.js`, `${o}/fonts/hafs.18.woff2`, `${o}/api/events`, "https://cdn.x/y.js", "::bad::"], o),
    ).toEqual([`${o}/_next/static/a.js`, `${o}/fonts/hafs.18.woff2`]);
  });
  it("parseCount", () => {
    expect(parseCount("3")).toBe(3);
    expect(parseCount(null)).toBe(0);
    expect(parseCount("-2")).toBe(0);
    expect(parseCount("x")).toBe(0);
  });
});

describe("strings", () => {
  it("every key exists in English and Arabic, and Arabic is not a copy of English", () => {
    expect(Object.keys(pwa.ar).sort()).toEqual(Object.keys(pwa.en).sort());
    for (const k of Object.keys(pwa.en)) {
      expect(k.startsWith("pwa.")).toBe(true);
      expect(pwa.ar[k]).not.toBe(pwa.en[k]);
      expect(pwa.ar[k]).toMatch(/[؀-ۿ]/);
    }
  });
  it("public/offline.html embeds exactly the pwa.offlinePage.* strings", () => {
    const page = fs.readFileSync("public/offline.html", "utf8");
    const json = /<script type="application\/json" id="pwa-strings">([\s\S]*?)<\/script>/.exec(page)?.[1];
    const embedded = JSON.parse(json || "{}") as { en: Record<string, string>; ar: Record<string, string> };
    for (const lang of ["en", "ar"] as const) {
      const expected = Object.fromEntries(Object.entries(pwa[lang]).filter(([k]) => k.startsWith("pwa.offlinePage.")));
      expect(embedded[lang]).toEqual(expected);
    }
    // the no-JS fallback text is the English copy
    for (const [k, v] of Object.entries(embedded.en)) {
      expect(page).toContain(`data-k="${k}"`);
      expect(page).toContain(`>${v}<`);
    }
  });
});

describe("manifest & icons", () => {
  const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
  it("has the required fields", () => {
    expect(manifest).toMatchObject({ name: "Signs Around You · آيات حولك", short_name: "Signs", start_url: "/?source=pwa", scope: "/", display: "standalone" });
    expect(manifest.categories).toEqual(expect.arrayContaining(["education", "books"]));
    expect(manifest.shortcuts.map((s: { url: string }) => new URL(s.url, "https://x").pathname)).toEqual(["/snap", "/ask", "/heritage"]);
  });
  it("references only icons that exist, including maskable 192/512", () => {
    const all = [...manifest.icons, ...manifest.shortcuts.flatMap((s: { icons: unknown[] }) => s.icons)] as { src: string; purpose?: string; sizes: string }[];
    for (const i of all) expect(fs.existsSync(`public${i.src}`), i.src).toBe(true);
    const maskable = manifest.icons.filter((i: { purpose?: string }) => i.purpose === "maskable").map((i: { sizes: string }) => i.sizes);
    expect(maskable).toEqual(["192x192", "512x512"]);
  });
  it("ships every file the layout and SW reference", () => {
    for (const f of ["icon.svg", "apple-touch-icon.png", "favicon-32.png", "og.png", "badge-96.png", "icon-192.png", "icon-512.png"]) expect(fs.existsSync(`public/icons/${f}`), f).toBe(true);
  });
});
