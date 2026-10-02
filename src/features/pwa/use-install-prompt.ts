"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BANNER_DELAY_MS, STORAGE, isIOS, isInAppBrowser, parseCount, shouldOfferInstall } from "./logic";

/** Chrome/Edge/Samsung's install event (not in lib.dom yet). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

declare global {
  interface Window {
    __pwaPrompt?: BeforeInstallPromptEvent | null;
  }
}

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function standalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function useInstallPrompt() {
  const pathname = usePathname() || "/";
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [env, setEnv] = useState<{ ios: boolean; inApp: boolean; standalone: boolean; visits: number; dismissedAt: number | null; installed: boolean } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = ls();
    let visits = parseCount(s?.getItem(STORAGE.visits) ?? null);
    try {
      if (!sessionStorage.getItem(STORAGE.sessionCounted)) {
        visits += 1;
        s?.setItem(STORAGE.visits, String(visits));
        sessionStorage.setItem(STORAGE.sessionCounted, "1");
      }
    } catch {
      /* storage blocked: treat as a first visit */
    }
    const dismissed = Number(s?.getItem(STORAGE.dismissedAt) || 0) || null;
    setEnv({
      ios: isIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
      inApp: isInAppBrowser(navigator.userAgent),
      standalone: standalone(),
      visits,
      dismissedAt: dismissed,
      installed: s?.getItem(STORAGE.installed) === "1",
    });

    const pick = () => setPrompt(window.__pwaPrompt ?? null);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__pwaPrompt = e as BeforeInstallPromptEvent;
      pick();
    };
    const onInstalled = () => {
      s?.setItem(STORAGE.installed, "1");
      window.__pwaPrompt = null;
      setPrompt(null);
      setEnv((v) => (v ? { ...v, installed: true } : v));
    };
    pick();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("pwa:prompt", pick);
    window.addEventListener("appinstalled", onInstalled);
    const t = window.setTimeout(() => setReady(true), BANNER_DELAY_MS);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("pwa:prompt", pick);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(t);
    };
  }, []);

  const offer =
    ready &&
    !!env &&
    shouldOfferInstall({
      pathname,
      visits: env.visits,
      dismissedAt: env.dismissedAt,
      now: Date.now(),
      standalone: env.standalone,
      installed: env.installed,
      canPrompt: !!prompt,
      ios: env.ios,
      inApp: env.inApp,
    });

  const dismiss = useCallback(() => {
    const now = Date.now();
    ls()?.setItem(STORAGE.dismissedAt, String(now));
    setEnv((v) => (v ? { ...v, dismissedAt: now } : v));
  }, []);

  /** Show the browser's install dialog. Resolves to the outcome, or "ios" when the caller should show instructions. */
  const install = useCallback(async (): Promise<"accepted" | "dismissed" | "ios" | "unavailable"> => {
    if (!prompt) return env?.ios ? "ios" : "unavailable";
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      window.__pwaPrompt = null;
      setPrompt(null); // a prompt can only be used once
      if (choice.outcome === "dismissed") dismiss();
      return choice.outcome;
    } catch {
      setPrompt(null);
      return "unavailable";
    }
  }, [prompt, env?.ios, dismiss]);

  return { offer, ios: !!env?.ios && !prompt, install, dismiss };
}
