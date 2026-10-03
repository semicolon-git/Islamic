"use client";
import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { Kbd } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { diffChars } from "../../manuscripts/text";

const TIP_KEY = (id: string) => `ms-collab-tip:${id}`;

/** A contextual tip shown the first time a feature is used; dismissed for good (per browser). */
export function FirstTip({ id, title, children, className }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(TIP_KEY(id)) !== "1");
    } catch {
      setShow(false);
    }
  }, [id]);
  if (!show) return null;
  const dismiss = () => {
    try { localStorage.setItem(TIP_KEY(id), "1"); } catch { /* storage unavailable */ }
    setShow(false);
  };
  return (
    <aside className={cn("relative flex gap-3 rounded-[14px] border border-violet/30 bg-violet-soft/70 p-3.5 pe-11 text-sm animate-rise", className)} data-testid={`tip-${id}`} aria-label={title}>
      <Lightbulb className="size-4.5 text-violet shrink-0 mt-0.5" aria-hidden />
      <div className="flex flex-col gap-1 min-w-0">
        <strong className="font-semibold text-ink">{title}</strong>
        <div className="text-ink-2 leading-relaxed">{children}</div>
      </div>
      <button type="button" onClick={dismiss} className="absolute top-2 end-2 size-8 grid place-items-center rounded-full text-ink-3 hover:bg-surface/70 hover:text-ink" aria-label={t("collab.tip.dismiss")} title={t("collab.tip.dismiss")}>
        <X className="size-4" />
      </button>
    </aside>
  );
}

/** Character diff from `from` to `to` (deleted text struck in red, inserted text in green). Never HTML: plain spans. */
export function DiffText({ from, to, className }: { from: string; to: string; className?: string }) {
  const parts = diffChars(from, to);
  return (
    <span dir="rtl" className={cn("ms-text", className)}>
      {parts.map((d, i) =>
        d.op === "equal" ? <span key={i}>{d.text}</span>
          : d.op === "delete" ? <del key={i} className="bg-bad-soft text-bad decoration-bad/70 rounded-[3px]">{d.text}</del>
          : <ins key={i} className="bg-ok-soft text-ok no-underline rounded-[3px]">{d.text}</ins>)}
    </span>
  );
}

export function DiffLegend() {
  const { t } = useI18n();
  return (
    <p className="text-[0.72rem] text-ink-3 flex flex-wrap gap-x-3 gap-y-1">
      <span><del className="bg-bad-soft text-bad px-1 rounded">ab</del> {t("collab.diff.removed")}</span>
      <span><ins className="bg-ok-soft text-ok no-underline px-1 rounded">ab</ins> {t("collab.diff.added")}</span>
    </p>
  );
}

/** Keyboard shortcuts of a screen (same look as the Studio's overlay). */
export function KeysSheet({ open, onClose, rows }: { open: boolean; onClose: () => void; rows: [string[], string][] }) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} side="end" title={t("collab.keys.title")} description={t("collab.keys.desc")} closeLabel={t("action.close")}>
      <dl className="flex flex-col" data-testid="collab-shortcuts">
        {rows.map(([keys, label], i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-0">
            <dt className="text-sm text-ink-2">{label}</dt>
            <dd className="flex gap-1 shrink-0" dir="ltr">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}

/** Siglum medallion (أ / ب / ج), as in the Studio. */
export function Siglum({ s, size = "md" }: { s: string | null; size?: "sm" | "md" | "lg" }) {
  if (!s) return null;
  const cls = size === "sm" ? "size-7 text-lg rounded-[8px]" : size === "lg" ? "size-12 text-[1.7rem] rounded-[14px]" : "size-9 text-xl rounded-[10px]";
  return (
    <span className={cn("shrink-0 bg-sand text-sand-ink grid place-items-center font-ms leading-none", cls)} aria-hidden>
      <span className="inline-block translate-y-[0.14em]">{s}</span>
    </span>
  );
}

/** A short "x of y" progress bar with an accessible label. */
export function Meter({ value, total, label, tone = "accent" }: { value: number; total: number; label: string; tone?: "accent" | "ok" | "violet" }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-2 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", tone === "ok" ? "bg-ok" : tone === "violet" ? "bg-violet" : "bg-accent")} style={{ width: `${pct}%` }} />
    </div>
  );
}
