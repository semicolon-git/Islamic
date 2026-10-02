"use client";
import { Share, SquarePlus } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

/** "Share → Add to Home Screen" instructions for iOS, where browsers have no install prompt. */
export function IosInstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const steps = [
    { icon: <Share className="size-5" aria-hidden />, title: t("pwa.ios.step1"), hint: t("pwa.ios.step1Hint") },
    { icon: <SquarePlus className="size-5" aria-hidden />, title: t("pwa.ios.step2"), hint: t("pwa.ios.step2Hint") },
    {
      icon: <img src="/icons/icon-192.png" alt="" width={28} height={28} className="size-7 rounded-[7px]" />,
      title: t("pwa.ios.step3"),
      hint: t("pwa.ios.step3Hint"),
    },
  ];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("pwa.ios.title")}
      description={t("pwa.ios.description")}
      closeLabel={t("action.close")}
      footer={
        <Button onClick={onClose} full className="sm:w-auto">
          {t("pwa.ios.done")}
        </Button>
      }
    >
      <ol className="flex flex-col gap-1" data-testid="pwa-ios-steps">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3.5 rounded-[14px] p-2.5">
            <span className="relative grid size-11 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent">
              {s.icon}
              <span className="absolute -top-1.5 -start-1.5 grid size-5 place-items-center rounded-full bg-brand text-[0.7rem] font-semibold text-brand-ink" aria-hidden>
                {i + 1}
              </span>
            </span>
            <span className="flex min-w-0 flex-col pt-0.5">
              <strong className="font-semibold text-ink">{s.title}</strong>
              <span className="text-sm leading-relaxed text-ink-2">{s.hint}</span>
            </span>
          </li>
        ))}
      </ol>
      {/* A quiet picture of Safari's toolbar with the Share button highlighted, so the step is easy to find. */}
      <div className="mt-3 rounded-[16px] border border-line bg-surface-2 px-4 py-3" aria-hidden>
        <div className="flex items-center justify-between text-ink-3" dir="ltr">
          <span className="text-lg leading-none">‹</span>
          <span className="text-lg leading-none">›</span>
          <span className="grid size-10 place-items-center rounded-full bg-accent text-accent-ink shadow-card ring-4 ring-accent/25">
            <Share className="size-5" />
          </span>
          <span className="size-5 rounded-[5px] border-2 border-current opacity-70" />
          <span className="size-5 rounded-[5px] border-2 border-current opacity-70" />
        </div>
      </div>
    </Sheet>
  );
}
