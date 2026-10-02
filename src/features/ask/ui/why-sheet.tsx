"use client";
import { CircleCheck, CircleX, CircleMinus, CircleAlert } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/components/ui/cn";
import type { AskResult, Check } from "../types";
import type { T } from "./blocks";

const STATUS: Record<Check["status"], { icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  pass: { icon: CircleCheck, cls: "text-ok" },
  fail: { icon: CircleX, cls: "text-bad" },
  warn: { icon: CircleAlert, cls: "text-warn" },
  skip: { icon: CircleMinus, cls: "text-ink-3" },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,9rem)_1fr] gap-3 py-2.5 border-b border-line last:border-0">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="text-sm text-ink min-w-0">{children}</dd>
    </div>
  );
}

/** "Why this answer?" — the trace, in plain language: level, route, evidence, checks, timing. */
export function WhySheet({ open, onClose, r, t }: { open: boolean; onClose: () => void; r: AskResult; t: T }) {
  const tr = r.trace;
  const aiText = tr.ai.error ? t("ask.why.ai.fallback") : tr.ai.calls ? t("ask.why.ai.on", { calls: tr.ai.calls }) : t("ask.why.ai.off");
  return (
    <Sheet open={open} onClose={onClose} title={t("ask.why.title")} description={t("ask.why.desc")} closeLabel={t("action.close")}>
      <div lang={r.lang} dir={r.lang === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-4" data-testid="why-sheet">
        <dl className="flex flex-col">
          <Row label={t("ask.why.level")}>
            <span className="inline-flex items-center gap-2">
              <span className={cn("grid place-items-center size-7 rounded-full text-sm font-bold", tr.level === "D" || tr.level === "X" ? "bg-warn-soft text-warn" : tr.level === "C" ? "bg-violet-soft text-violet" : "bg-ok-soft text-ok")}>{tr.level}</span>
              <span>{t(`ask.level.${tr.level}`)}</span>
            </span>
          </Row>
          <Row label={t("ask.why.route")}>{t(`ask.route.${tr.route}`)}</Row>
          <Row label={t("ask.why.ai")}>{aiText}</Row>
          <Row label={t("ask.why.latency")}>
            <span className="tabular">{t("ask.why.ms", { ms: tr.latency_ms })}</span>
          </Row>
          {tr.floors.length > 0 && (
            <Row label={t("ask.why.floors")}>
              <span className="flex flex-wrap gap-1.5">
                {tr.floors.map((f) => (
                  <code key={f} className="mono text-xs rounded-md bg-warn-soft text-warn px-1.5 py-0.5" dir="ltr">{f}</code>
                ))}
              </span>
            </Row>
          )}
          <Row label={t("ask.why.evidence")}>
            {tr.evidence_ids.length ? (
              <span className="flex flex-wrap gap-1.5" dir="ltr">
                {tr.evidence_ids.map((e) => (
                  <code key={e} className="mono text-xs rounded-md bg-surface-2 px-1.5 py-0.5">{e}</code>
                ))}
              </span>
            ) : (
              t("ask.why.none")
            )}
          </Row>
          {tr.retrieval.length > 0 && (
            <Row label={t("ask.why.retrieval")}>
              <ul className="flex flex-col gap-1.5" dir="ltr">
                {tr.retrieval.slice(0, 3).map((h) => (
                  <li key={h.id} className="flex items-center gap-2">
                    <code className="mono text-xs truncate">{h.id}</code>
                    <span className="h-1.5 flex-1 min-w-12 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
                      <span className="block h-full bg-accent" style={{ width: `${Math.round(h.coverage * 100)}%` }} />
                    </span>
                    <span className="mono text-xs text-ink-3 tabular">{h.coverage.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </Row>
          )}
          <Row label={t("ask.why.id")}>
            <code className="mono text-xs" dir="ltr">{r.id}</code>
          </Row>
        </dl>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">{t("ask.why.checks")}</h3>
          <ul className="flex flex-col gap-1">
            {tr.checks.map((c) => {
              const s = STATUS[c.status];
              const Icon = s.icon;
              return (
                <li key={c.id} className="flex items-start gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-surface-2" data-check={c.id} data-status={c.status}>
                  <Icon className={cn("size-4 mt-0.5 shrink-0", s.cls)} aria-hidden />
                  <span className="mono text-xs text-ink-3 w-8 shrink-0 mt-0.5" dir="ltr">{c.id}</span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm text-ink">
                      {t(`ask.check.${c.id}`)} · <span className={s.cls}>{t(`ask.check.${c.status}`)}</span>
                    </span>
                    {c.detail && c.status !== "pass" && <span className="text-xs text-ink-3 break-words" dir="auto">{c.detail}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}
