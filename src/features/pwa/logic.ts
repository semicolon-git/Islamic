/** Pure helpers for the PWA layer (no DOM access here, so they are unit-testable). */

export const SW_URL = "/sw.js";
export const STORAGE = {
  visits: "pwa:visits",
  sessionCounted: "pwa:counted",
  dismissedAt: "pwa:install-dismissed",
  installed: "pwa:installed",
  swOptIn: "pwa:sw",
} as const;

/** Wait this long after the page is interactive before offering to install (never on first paint). */
export const BANNER_DELAY_MS = 2500;
/** After "Not now", stay quiet for two weeks. */
export const DISMISS_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export type SwAction = "register" | "unregister" | "skip";

/**
 * Should this page load register the service worker?
 * - `?sw=0|off` or a build with NEXT_PUBLIC_PWA_DISABLED=1 → unregister (user/operator escape hatch).
 * - production → register; development → only with `?sw=1` (or a stored opt-in).
 * - under browser automation (navigator.webdriver) the SW is opt-in too, so other suites' network mocks are
 *   never hidden behind a worker; the PWA e2e opts in with `?sw=1`.
 */
export function swAction(o: {
  supported: boolean;
  nodeEnv: string | undefined;
  search: string;
  disabled?: string | undefined;
  automated?: boolean;
  optedIn?: boolean;
}): SwAction {
  if (!o.supported) return "skip";
  const q = new URLSearchParams(o.search).get("sw");
  if (q === "0" || q === "off" || o.disabled === "1" || o.disabled === "true") return "unregister";
  const asked = q === "1" || q === "on" || !!o.optedIn;
  if (o.nodeEnv !== "production") return asked ? "register" : "skip";
  if (o.automated && !asked) return "skip";
  return "register";
}

/** iPhone/iPod/iPad, including iPadOS that reports itself as a Mac. */
export function isIOS(ua: string, platform = "", maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return platform === "MacIntel" && maxTouchPoints > 1;
}

/** In-app browsers (Instagram, Facebook, …) can't add to the home screen. */
export function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|GSA\//i.test(ua);
}

/** Pages where an install banner would get in the way (camera, onboarding, conversations, the portal). */
export function isQuietPath(pathname: string): boolean {
  return /^\/(snap|welcome|talk|inscription|portal)(\/|$)/.test(pathname) || pathname === "/offline";
}

export type BannerInput = {
  pathname: string;
  visits: number;
  dismissedAt: number | null;
  now: number;
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  ios: boolean;
  inApp?: boolean;
};

/**
 * Offer installation only when it can actually work (a captured `beforeinstallprompt`, or iOS where we show
 * "Share → Add to Home Screen"), only from the second visit on or on the home page, never on quiet pages and
 * never again soon after "Not now".
 */
export function shouldOfferInstall(i: BannerInput): boolean {
  if (i.standalone || i.installed || i.inApp) return false;
  if (!i.canPrompt && !i.ios) return false;
  if (isQuietPath(i.pathname)) return false;
  if (i.dismissedAt && i.now - i.dismissedAt < DISMISS_SNOOZE_MS) return false;
  return i.visits >= 2 || i.pathname === "/";
}

/** Same-origin page URLs worth saving for offline reading after a client-side navigation. */
export function isWarmablePath(pathname: string): boolean {
  if (/^\/(portal|api|_next|talk)(\/|$)/.test(pathname)) return false;
  return !/\.[a-z0-9]{2,5}$/i.test(pathname);
}

/** Pick the same-origin static assets a page has loaded so the worker can keep them for offline use. */
export function assetsToWarm(urls: string[], origin: string): string[] {
  const out = new Set<string>();
  for (const raw of urls) {
    let u: URL;
    try {
      u = new URL(raw, origin);
    } catch {
      continue;
    }
    if (u.origin !== origin) continue;
    if (u.pathname.startsWith("/_next/static/") || u.pathname.startsWith("/fonts/") || u.pathname.startsWith("/icons/")) out.add(u.href);
  }
  return [...out].slice(0, 200);
}

export function parseCount(v: string | null): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Inline script rendered with the page so a `beforeinstallprompt` fired before React hydrates is not lost.
 * It also stops Chrome's own mini-infobar: we offer installation ourselves, at a calmer moment.
 */
export const EARLY_CAPTURE_SCRIPT = `try{addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__pwaPrompt=e;dispatchEvent(new Event("pwa:prompt"))})}catch(e){}`;
