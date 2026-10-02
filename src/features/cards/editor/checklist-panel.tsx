"use client";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmtNumber } from "@/i18n/core";
import { cn } from "@/components/ui/cn";
import type { CheckItem } from "../validate";
import type { LintWarning } from "../lint";

const SECTION_OF: Record<string, string> = {
  titles: "sec-basics",
  evidence: "sec-verses",
  verse_keys_exist: "sec-verses",
  hadith_exist: "sec-hadith",
  no_duplicates: "sec-verses",
  tafsir_labelled: "sec-tafsir",
  explanation_bilingual: "sec-explanation",
  notes_bilingual: "sec-civ",
  disagreement_required: "sec-disagreement",
  match_phrases: "sec-extras",
  lint: "sec-explanation",
};

export function ChecklistPanel({
  items,
  pending,
  lint,
  ack,
  onAck,
  disabled,
  title,
}: {
  items: CheckItem[];
  pending: boolean;
  lint: LintWarning[];
  ack: boolean;
  onAck: (v: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  const { t, locale } = useI18n();
  const failing = items.filter((i) => !i.ok).length;
  const pendingIds = new Set(pending ? ["verse_keys_exist", "hadith_exist"] : []);
  return (
    <section aria-labelledby="checklist-h" className="bg-surface rounded-[var(--radius)] border border-line shadow-card p-4 flex flex-col gap-3" data-testid="checklist">
      <div className="flex items-center justify-between gap-2">
        <h2 id="checklist-h" className="font-semibold text-ink">{title ?? t("cards.check.title")}</h2>
        <span className={cn("text-xs font-medium rounded-full px-2 py-0.5", failing ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")} aria-live="polite">
          {failing ? t("cards.check.remaining", { n: fmtNumber(failing, locale) }) : t("cards.check.allGood")}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((it) => {
          const busy = pendingIds.has(it.id);
          const Icon = busy ? Loader2 : it.ok ? CheckCircle2 : it.id === "lint" && !lint.length ? Circle : XCircle;
          return (
            <li key={it.id} data-check={it.id} data-ok={it.ok}>
              <a href={`#${SECTION_OF[it.id] ?? "sec-basics"}`} className="flex items-start gap-2 rounded-[8px] px-1.5 py-1 text-sm hover:bg-surface-2">
                <Icon className={cn("size-4 mt-0.5 shrink-0", busy ? "animate-spin text-ink-3" : it.ok ? "text-ok" : "text-bad")} aria-hidden />
                <span className={cn(it.ok ? "text-ink-2" : "text-ink")}>
                  {t(`cards.check.${it.id}`)}
                  {!it.ok && it.detail.length > 0 && it.id !== "lint" && <span className="mono text-xs text-bad ms-1.5" dir="ltr">{it.detail.join(", ")}</span>}
                  <span className="sr-only">{it.ok ? " ✓" : " ✗"}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {lint.length > 0 && (
        <label className="flex items-start gap-2.5 rounded-[10px] bg-warn-soft p-3 text-sm cursor-pointer">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--warn)]" checked={ack} disabled={disabled} onChange={(e) => onAck(e.target.checked)} data-testid="lint-ack" />
          <span>{t("cards.lint.ack")}</span>
        </label>
      )}
    </section>
  );
}
