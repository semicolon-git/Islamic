"use client";
import { Check, CornerUpLeft } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmtRelative } from "@/i18n/core";
import { cn } from "@/components/ui/cn";
import type { Step } from "../stages";

const LABEL: Record<Step["key"], string> = { draft: "cards.wf.draft", submitted: "cards.wf.submitted", approved: "cards.wf.approved", published: "cards.wf.published" };

/** The four stages with who and when. Purely presentational; the order is fixed by the workflow. */
export function WorkflowBar({ steps }: { steps: Step[] }) {
  const { t, locale } = useI18n();
  return (
    <ol aria-label={t("cards.wf.label")} className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="workflow-bar">
      {steps.map((s, i) => {
        const who = locale === "ar" ? s.who_ar : s.who_en;
        return (
          <li
            key={s.key}
            aria-current={s.state === "current" || s.state === "returned" ? "step" : undefined}
            className={cn(
              "relative flex items-start gap-2.5 rounded-[12px] border px-3 py-2.5 min-w-0",
              s.state === "done" && "border-transparent bg-ok-soft",
              s.state === "current" && "border-accent bg-accent-soft",
              s.state === "returned" && "border-warn bg-warn-soft",
              s.state === "upcoming" && "border-line bg-surface",
            )}
            data-state={s.state}
          >
            <span
              className={cn(
                "mt-0.5 size-6 shrink-0 rounded-full grid place-items-center text-xs font-semibold",
                s.state === "done" && "bg-ok text-white",
                s.state === "current" && "bg-accent text-accent-ink",
                s.state === "returned" && "bg-warn text-white",
                s.state === "upcoming" && "bg-surface-2 text-ink-3",
              )}
              aria-hidden
            >
              {s.state === "done" ? <Check className="size-3.5" /> : s.state === "returned" ? <CornerUpLeft className="size-3.5" /> : i + 1}
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-ink truncate">{s.state === "returned" ? t("cards.wf.returned") : t(LABEL[s.key])}</span>
              <span className="text-xs text-ink-2 truncate" suppressHydrationWarning>
                {who && s.at ? t("cards.wf.by", { name: who, when: fmtRelative(s.at, locale) }) : s.state === "upcoming" ? t("cards.wf.pending") : "—"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
