"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { Khatam, Logo } from "@/components/ui/khatam";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import type { SessionUser } from "@/lib/auth";
import { PORTAL_NAV } from "./portal-nav";
import { SettingsSheet } from "./settings-sheet";

export function PortalShell({ user, demo, children }: { user: SessionUser; demo: boolean; children: React.ReactNode }) {
  const pathname = usePathname() || "/portal";
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  // Mobile menu: move focus into the drawer and close it with Escape (no keyboard trap, no lost focus).
  useEffect(() => {
    if (!menu) return;
    drawer.current?.querySelector<HTMLElement>("a[href]")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
  const name = locale === "ar" ? user.display_name_ar : user.display_name_en;
  const inst = locale === "ar" ? user.institution_name_ar : user.institution_name_en;
  const items = PORTAL_NAV.filter((n) => !n.roles || n.roles.includes(user.role) || user.role === "platform_admin");
  const isActive = (href: string) => (href === "/portal" ? pathname === "/portal" : pathname.startsWith(href));
  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE" });
    router.push("/portal/login");
    router.refresh();
  };
  const nav = (
    <nav aria-label={t("portal.name")} className="flex flex-col gap-1">
      {items.map((n) => {
        const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[n.icon] ?? Icons.Circle;
        const active = isActive(n.href);
        return (
          <Link key={n.href} href={n.href} onClick={() => setMenu(false)} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 h-10 px-3 rounded-[10px] text-[0.93rem] font-medium transition-colors", active ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
            <Icon className={cn("size-[1.15rem]", active && "text-accent")} />
            {t(n.key)}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="hidden lg:flex flex-col gap-6 border-e border-line bg-surface px-3 py-4 sticky top-0 h-dvh">
        <Link href="/portal" className="px-2"><Logo label={t("portal.name")} /></Link>
        {nav}
        <div className="mt-auto flex flex-col gap-2 px-2">
          <Link href="/" className="text-sm text-ink-3 hover:text-ink inline-flex items-center gap-1.5"><Icons.Smartphone className="size-4" />{t("portal.openApp")}</Link>
        </div>
      </aside>
      <div className="flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] backdrop-blur-md border-b border-line flex items-center gap-2 px-3 lg:px-6">
          <button className="lg:hidden size-11 grid place-items-center rounded-full hover:bg-surface-2" aria-label={t("portal.menu")} onClick={() => setMenu(true)}>
            <Icons.Menu className="size-5" />
          </button>
          <Link href="/portal" aria-label={t("portal.name")} className="lg:hidden inline-flex items-center gap-2 min-h-11 font-semibold text-ink whitespace-nowrap rounded-lg">
            <span className="text-accent"><Khatam size={26} /></span>
            <span className="hidden sm:inline text-[1.05rem] tracking-tight">{t("portal.name")}</span>
          </Link>
          <div className="hidden lg:flex items-center gap-2 text-sm text-ink-2 min-w-0">
            <Icons.Building2 className="size-4 shrink-0" />
            <span className="truncate">{inst ?? t("portal.allInstitutions")}</span>
            {demo && <span className="text-[0.7rem] uppercase tracking-wider text-ink-3 border border-line rounded-full px-2 py-0.5">{t("badge.demo")}</span>}
          </div>
          <div className="ms-auto flex items-center gap-1">
            <button onClick={() => setLocale(locale === "ar" ? "en" : "ar")} lang={locale === "ar" ? "en" : "ar"} className="h-10 pointer-coarse:h-11 px-3 rounded-full text-sm font-medium text-ink-2 hover:bg-surface-2">{t("lang.toggle")}</button>
            <button onClick={() => setSettings(true)} aria-label={t("nav.settings")} className="size-10 grid place-items-center rounded-full text-ink-2 hover:bg-surface-2"><Icons.Settings2 className="size-5" /></button>
            <details className="relative">
              <summary className="list-none cursor-pointer flex items-center gap-2 rounded-full ps-1 pe-3 h-10 hover:bg-surface-2" aria-label={t("portal.account")}>
                <Avatar name={name} hue={user.avatar_hue} size={30} />
                <span className="hidden sm:flex flex-col leading-tight text-start">
                  <span className="text-sm font-medium text-ink">{name}</span>
                  <span className="text-[0.72rem] text-ink-3">{t(`role.${user.role}`)}</span>
                </span>
              </summary>
              <div className="absolute end-0 mt-2 w-64 rounded-[14px] border border-line bg-surface shadow-pop p-2 z-50">
                <div className="px-3 py-2">
                  <div className="font-medium text-ink">{name}</div>
                  <div className="text-sm text-ink-3">{locale === "ar" ? user.title_ar : user.title_en}</div>
                  <div className="mt-1 text-sm text-ink-2 tabular">{t("portal.points", { n: user.points })}</div>
                </div>
                <button onClick={signOut} className="w-full text-start h-10 px-3 rounded-[10px] text-sm hover:bg-surface-2 inline-flex items-center gap-2"><Icons.Repeat2 className="size-4" />{t("portal.switchPersona")}</button>
              </div>
            </details>
          </div>
        </header>
        <main className="flex-1 px-4 lg:px-8 py-6 w-full max-w-[1400px] mx-auto">{children}</main>
      </div>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("portal.menu")}>
          <button className="absolute inset-0 bg-[rgb(8_10_30/0.5)]" aria-label={t("action.close")} onClick={() => setMenu(false)} />
          <div ref={drawer} className="absolute inset-y-0 start-0 w-72 bg-surface p-4 flex flex-col gap-6 animate-rise">
            <Logo label={t("portal.name")} />
            {nav}
          </div>
        </div>
      )}
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
