"use client";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

/** Non-modal, dismissible card that sits above the tab bar (mobile) or in the corner (desktop). */
export function InstallBanner({ ios, onInstall, onDismiss }: { ios: boolean; onInstall: () => void; onDismiss: () => void }) {
  const { t } = useI18n();
  return (
    <section
      role="region"
      aria-label={t("pwa.install.label")}
      data-testid="pwa-install-banner"
      className="fixed z-[90] inset-x-3 bottom-[calc(var(--tab-h)+env(safe-area-inset-bottom)+12px)] sm:inset-x-auto sm:end-6 sm:bottom-6 sm:w-[380px] animate-rise"
    >
      <div className="relative flex gap-3.5 rounded-[18px] border border-line bg-surface p-4 shadow-pop">
        <img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-[12px] shadow-card" />
        <div className="min-w-0 flex-1 pe-8">
          <h2 className="font-semibold leading-snug text-ink">{t("pwa.install.title")}</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{t("pwa.install.body")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="md" onClick={onInstall}>
              {ios ? t("pwa.install.howTo") : t("pwa.install.action")}
            </Button>
            <Button size="md" variant="ghost" onClick={onDismiss}>
              {t("pwa.install.later")}
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("pwa.install.close")}
          className="absolute end-1.5 top-1.5 grid size-11 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-[1.1rem]" aria-hidden />
        </button>
      </div>
    </section>
  );
}
