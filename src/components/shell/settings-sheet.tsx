"use client";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/client";

type Theme = "system" | "light" | "dark";

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const [theme, setTheme] = useState<Theme>("system");
  const [scale, setScale] = useState("1");
  useEffect(() => {
    try {
      setTheme((localStorage.getItem("theme") as Theme) || "system");
      setScale(localStorage.getItem("textScale") || "1");
    } catch {}
  }, []);
  const applyTheme = (v: Theme) => {
    setTheme(v);
    try {
      if (v === "system") {
        localStorage.removeItem("theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("theme", v);
        document.documentElement.dataset.theme = v;
      }
    } catch {}
  };
  const applyScale = (v: string) => {
    setScale(v);
    try {
      localStorage.setItem("textScale", v);
    } catch {}
    document.documentElement.style.setProperty("--text-scale", v);
  };
  return (
    <Sheet open={open} onClose={onClose} title={t("nav.settings")} closeLabel={t("action.close")}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("lang.label")}</span>
          <Segmented label={t("lang.label")} value={locale} onChange={(v) => setLocale(v)} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }]} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("theme.label")}</span>
          <Segmented label={t("theme.label")} value={theme} onChange={applyTheme} options={[{ value: "system", label: t("theme.system") }, { value: "light", label: t("theme.light") }, { value: "dark", label: t("theme.dark") }]} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("text.size")}</span>
          <Segmented label={t("text.size")} value={scale} onChange={applyScale} options={[{ value: "0.9", label: "A−" }, { value: "1", label: "A" }, { value: "1.15", label: "A+" }, { value: "1.3", label: "A++" }]} />
        </div>
        <p className="text-sm text-ink-2">{t("privacy.short")}</p>
      </div>
    </Sheet>
  );
}
