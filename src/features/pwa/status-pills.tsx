"use client";
import { useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";

/** Small pill under the header while offline; says "Back online" briefly when the connection returns. */
export function OfflinePill() {
  const { t } = useI18n();
  const [state, setState] = useState<"online" | "offline" | "back">("online");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const update = () => {
      window.clearTimeout(timer.current);
      if (!navigator.onLine) return setState("offline");
      setState((s) => (s === "offline" ? "back" : "online"));
      timer.current = window.setTimeout(() => setState("online"), 2500);
    };
    if (!navigator.onLine) setState("offline");
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] z-[95] flex justify-center px-4">
      {state !== "online" && (
        <span
          data-testid="pwa-offline-pill"
          className={cn(
            "animate-pop inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.82rem] font-medium shadow-pop",
            state === "offline" ? "bg-brand text-brand-ink" : "bg-ok-soft text-ok",
          )}
        >
          {state === "offline" ? <CloudOff className="size-4 shrink-0" aria-hidden /> : <Wifi className="size-4 shrink-0" aria-hidden />}
          {state === "offline" ? t("pwa.offline.pill") : t("pwa.online.pill")}
        </span>
      )}
    </div>
  );
}

/** "Update available — Refresh": stays until the visitor chooses (it never auto-reloads under them). */
export function UpdateToast({ onRefresh, onLater }: { onRefresh: () => void; onLater: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pwa-update-toast"
      className="fixed z-[96] inset-x-3 bottom-[calc(var(--tab-h)+env(safe-area-inset-bottom)+12px)] sm:inset-x-auto sm:start-1/2 sm:-translate-x-1/2 rtl:sm:translate-x-1/2 sm:bottom-6 animate-rise"
    >
      <div className="flex items-center gap-3 rounded-[16px] bg-brand py-2 ps-4 pe-2 text-brand-ink shadow-pop sm:min-w-[380px]">
        <RefreshCw className={cn("size-5 shrink-0 text-[#36dcb8]", busy && "animate-spin")} aria-hidden />
        <span className="min-w-0 flex-1 text-sm">
          <strong className="font-semibold">{t("pwa.update.title")}</strong>
          <span className="opacity-80"> · {t("pwa.update.body")}</span>
        </span>
        <button type="button" onClick={onLater} className="h-11 rounded-[12px] px-3 text-sm font-medium opacity-80 hover:bg-white/10 hover:opacity-100">
          {t("pwa.update.later")}
        </button>
        <Button
          size="md"
          onClick={() => {
            setBusy(true);
            onRefresh();
          }}
          loading={busy}
        >
          {t("pwa.update.action")}
        </Button>
      </div>
    </div>
  );
}
