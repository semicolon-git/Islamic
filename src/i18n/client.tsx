"use client";
import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { dirOf, makeT, messages, type Locale } from "./index";

const Ctx = createContext<{ locale: Locale } | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const v = useMemo(() => ({ locale }), [locale]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  const locale = ctx?.locale ?? "en";
  const router = useRouter();
  const t = useMemo(() => makeT(messages, locale), [locale]);
  const setLocale = useCallback(
    (l: Locale) => {
      document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      document.documentElement.dir = dirOf(l);
      router.refresh();
    },
    [router],
  );
  return { locale, dir: dirOf(locale), t, setLocale };
}
