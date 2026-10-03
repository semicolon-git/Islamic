"use client";
import { cn } from "./cn";
import { useI18n } from "@/i18n/client";
import { fmtNumber } from "@/i18n/core";

/** Segmented control / tabs (roving with arrow keys). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; count?: number }[];
  className?: string;
  size?: "sm" | "md";
  label: string;
}) {
  const { locale } = useI18n();
  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex rounded-[12px] bg-surface-2 p-1 gap-1", className)}
      onKeyDown={(e) => {
        const i = options.findIndex((o) => o.value === value);
        const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
        const next = e.key === (rtl ? "ArrowLeft" : "ArrowRight") ? i + 1 : e.key === (rtl ? "ArrowRight" : "ArrowLeft") ? i - 1 : null;
        if (next === null) return;
        e.preventDefault();
        const o = options[(next + options.length) % options.length];
        onChange(o.value);
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[9px] font-medium transition-colors inline-flex items-center gap-1.5",
            // Touch screens get a 44px target (SPEC §7.8); mouse users keep the compact size.
            size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-3.5 text-sm pointer-coarse:h-11",
            o.value === value ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular text-xs text-ink-3">{fmtNumber(o.count, locale)}</span>}
        </button>
      ))}
    </div>
  );
}
