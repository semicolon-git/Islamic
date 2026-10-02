"use client";
import { useId, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Textarea, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import type { LintField, LintWarning } from "../lint";

export function SectionCard({ id, title, tag, hint, children, className }: { id: string; title: string; tag?: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn("bg-surface rounded-[var(--radius)] border border-line shadow-card p-4 sm:p-5 flex flex-col gap-4 scroll-mt-24", className)}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 id={`${id}-h`} className="text-base font-semibold text-ink">{title}</h2>
          {tag}
        </div>
        {hint && <p className="text-sm text-ink-2">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function LintList({ warnings, className }: { warnings: LintWarning[]; className?: string }) {
  const { t } = useI18n();
  if (!warnings.length) return null;
  return (
    <ul className={cn("flex flex-col gap-1.5", className)} aria-live="polite">
      {warnings.map((w, i) => (
        <li key={`${w.rule}-${w.match}-${i}`} className="flex gap-2 rounded-[10px] bg-warn-soft px-3 py-2 text-sm text-ink" data-testid="lint-warning">
          <AlertTriangle className="size-4 text-warn shrink-0 mt-0.5" aria-hidden />
          <span>
            <span className="mono text-xs text-warn me-1.5">{w.ref}</span>
            <bdi className="font-medium">“{w.match}”</bdi> — {t(`cards.lint.${w.rule}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** EN + AR textareas side by side (stacked on phones), each with its live lint warnings. */
export function BilingualText({
  idBase,
  value,
  onChange,
  lint,
  field,
  disabled,
  rows = 6,
  required,
}: {
  idBase: string;
  value: { en: string; ar: string };
  onChange: (v: { en: string; ar: string }) => void;
  lint?: LintWarning[];
  field?: LintField;
  disabled?: boolean;
  rows?: number;
  required?: boolean;
}) {
  const { t } = useI18n();
  const w = (lang: "en" | "ar") => (lint ?? []).filter((x) => x.lang === lang && (!field || x.field === field));
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {(["en", "ar"] as const).map((lang) => (
        <div key={lang} className="flex flex-col gap-1.5">
          <label htmlFor={`${idBase}-${lang}`} className="text-sm font-medium text-ink flex items-center gap-2">
            {t(`cards.exp.${lang}`)}
            {required && !value[lang].trim() && <Badge tone="warn">{t("cards.sec.required")}</Badge>}
          </label>
          <Textarea
            id={`${idBase}-${lang}`}
            dir={lang === "ar" ? "rtl" : "ltr"}
            lang={lang}
            rows={rows}
            value={value[lang]}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
            className={cn(lang === "ar" && "leading-[1.9] text-[1.02rem]", w(lang).length > 0 && "border-warn")}
            aria-invalid={w(lang).length > 0 || undefined}
          />
          <LintList warnings={w(lang)} />
        </div>
      ))}
    </div>
  );
}

/** Small tag input (Enter or comma adds; × removes). */
export function TagInput({ label, hint, values, onChange, disabled, placeholder }: { label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; disabled?: boolean; placeholder?: string }) {
  const { t } = useI18n();
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      {hint && <p className="text-sm text-ink-3 -mt-1">{hint}</p>}
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-surface-2 ps-3 pe-1 h-9 text-sm" dir="auto">
            {v}
            {!disabled && (
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={t("cards.match.remove", { p: v })} className="size-7 grid place-items-center rounded-full hover:bg-surface-3">
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            id={id}
            value={draft}
            dir="auto"
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" onClick={add} className="h-11 px-3 rounded-[12px] border border-line-strong text-ink-2 hover:bg-surface-2 inline-flex items-center gap-1 text-sm shrink-0">
            <Plus className="size-4" aria-hidden />
            {t("cards.match.add")}
          </button>
        </div>
      )}
    </div>
  );
}
