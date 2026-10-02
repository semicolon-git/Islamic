"use client";
import { Delete, Space } from "lucide-react";
import { cn } from "@/components/ui/cn";

/** Standard Arabic (PC) layout rows, plus the hamza-on-alef forms that visitors look for. */
const ROWS: string[][] = [
  ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج"],
  ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"],
  ["ئ", "ء", "ؤ", "ر", "ى", "ة", "و", "ز", "ظ", "د", "ذ"],
];
const EXTRA = ["أ", "إ", "آ"];

/**
 * Compact on-screen Arabic keyboard for visitors without an Arabic layout.
 * Keys are buttons (keyboard and screen-reader operable); text is inserted at the caret by the parent.
 */
export function ArabicKeyboard({
  onKey,
  onBackspace,
  label,
  spaceLabel,
  deleteLabel,
  className,
}: {
  onKey: (ch: string) => void;
  onBackspace: () => void;
  label: string;
  spaceLabel: string;
  deleteLabel: string;
  className?: string;
}) {
  const key =
    "h-11 min-w-0 flex-1 rounded-[10px] bg-surface border border-line text-ink text-[1.3rem] leading-none font-[family-name:var(--font-arabic)] shadow-[0_1px_0_var(--line-strong)] active:translate-y-px active:bg-surface-2 hover:bg-surface-2 transition-colors";
  // Prevent the textarea from losing focus (and the mobile OS keyboard from popping up) when tapping keys.
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div role="group" aria-label={label} dir="rtl" lang="ar" className={cn("rounded-[16px] bg-surface-2 p-1.5 sm:p-2 flex flex-col gap-1.5 select-none", className)}>
      {ROWS.map((row, i) => (
        <div key={i} className="flex gap-1 sm:gap-1.5">
          {row.map((ch) => (
            <button key={ch} type="button" className={key} onMouseDown={keep} onClick={() => onKey(ch)} aria-label={ch}>
              {ch}
            </button>
          ))}
        </div>
      ))}
      <div className="flex gap-1 sm:gap-1.5">
        {EXTRA.map((ch) => (
          <button key={ch} type="button" className={cn(key, "flex-none w-[13%]")} onMouseDown={keep} onClick={() => onKey(ch)} aria-label={ch}>
            {ch}
          </button>
        ))}
        <button type="button" className={cn(key, "flex-[4] text-sm text-ink-2 inline-flex items-center justify-center gap-1.5")} onMouseDown={keep} onClick={() => onKey(" ")}>
          <Space className="size-4" aria-hidden />
          {spaceLabel}
        </button>
        <button type="button" className={cn(key, "flex-[1.4] inline-flex items-center justify-center text-ink-2")} onMouseDown={keep} onClick={onBackspace} aria-label={deleteLabel} title={deleteLabel}>
          <Delete className="size-5 rtl:-scale-x-100" aria-hidden />
        </button>
      </div>
    </div>
  );
}
