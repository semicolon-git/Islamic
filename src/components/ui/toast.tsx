"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "./cn";

type Toast = { id: number; tone: "ok" | "bad" | "info"; text: string; action?: { label: string; onClick: () => void } };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), t.action ? 7000 : 3800);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed z-[100] inset-x-0 bottom-[calc(var(--tab-h)+16px)] sm:bottom-6 flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map((t) => (
          <div key={t.id} className={cn("pointer-events-auto animate-rise flex items-center gap-3 rounded-[14px] px-4 py-3 shadow-pop text-sm max-w-md w-full sm:w-auto", "bg-brand text-brand-ink")}>
            {t.tone === "ok" ? <CheckCircle2 className="size-5 text-accent shrink-0" /> : t.tone === "bad" ? <AlertTriangle className="size-5 text-bad shrink-0" /> : <Info className="size-5 shrink-0" />}
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button className="font-semibold underline underline-offset-4" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
