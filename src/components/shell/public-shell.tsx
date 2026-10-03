"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Compass, Camera, MessageCircleQuestion, Landmark, Settings2 } from "lucide-react";
import { Logo } from "@/components/ui/khatam";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { SettingsSheet } from "./settings-sheet";

const TABS = [
  { href: "/", key: "nav.discover", icon: Compass, match: (p: string) => p === "/" || p.startsWith("/c/") || p.startsWith("/card/") },
  { href: "/snap", key: "nav.snap", icon: Camera, match: (p: string) => p.startsWith("/snap") || p.startsWith("/inscription") },
  { href: "/ask", key: "nav.ask", icon: MessageCircleQuestion, match: (p: string) => p.startsWith("/ask") || p.startsWith("/talk") },
  { href: "/heritage", key: "nav.heritage", icon: Landmark, match: (p: string) => p.startsWith("/heritage") },
];

export function PublicShell({ children, demo }: { children: React.ReactNode; demo: boolean }) {
  const pathname = usePathname() || "/";
  const { t, locale, setLocale } = useI18n();
  const [settings, setSettings] = useState(false);
  const immersive = pathname.startsWith("/snap") || pathname.startsWith("/welcome");
  return (
    <div className="min-h-dvh flex flex-col">
      {!immersive && (
        <header className="sticky top-0 z-40 safe-top bg-[color-mix(in_oklab,var(--bg)_85%,transparent)] backdrop-blur-md border-b border-line/60">
          <div className="mx-auto w-full max-w-3xl h-14 px-4 flex items-center gap-2">
            <Link href="/" className="me-auto rounded-lg inline-flex items-center min-h-11" aria-label={t("nav.home")}>
              <Logo label={t("app.name")} />
            </Link>
            {demo && <span className="hidden sm:inline text-[0.7rem] uppercase tracking-wider text-ink-3 border border-line rounded-full px-2 py-0.5">{t("badge.demo")}</span>}
            <button onClick={() => setLocale(locale === "ar" ? "en" : "ar")} className="h-11 px-3 rounded-full text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink" lang={locale === "ar" ? "en" : "ar"}>
              {t("lang.toggle")}
            </button>
            <button onClick={() => setSettings(true)} aria-label={t("nav.settings")} className="size-11 grid place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink">
              <Settings2 className="size-5" />
            </button>
          </div>
        </header>
      )}
      <main className={cn("flex-1 w-full", !immersive && "mx-auto max-w-3xl px-4 pt-4 safe-bottom")}>{children}</main>
      {!immersive && (
        <nav aria-label={t("app.name")} className="fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md border-t border-line pb-[env(safe-area-inset-bottom)]">
          <ul className="mx-auto max-w-3xl grid grid-cols-4 h-[var(--tab-h)]">
            {TABS.map((tab) => {
              const active = tab.match(pathname);
              const Icon = tab.icon;
              return (
                <li key={tab.href} className="contents">
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex flex-col items-center justify-center gap-0.5 text-[0.72rem] font-medium transition-colors", active ? "text-accent" : "text-ink-3 hover:text-ink")}
                  >
                    <span className={cn("grid place-items-center h-7 w-12 rounded-full transition-colors", active && "bg-accent-soft")}>
                      <Icon className="size-[1.3rem]" strokeWidth={active ? 2.3 : 1.8} />
                    </span>
                    {t(tab.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
