"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDot, ShieldCheck } from "lucide-react";
import { Button, Callout, Card, Textarea, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { fmtDate } from "@/i18n/core";
import type { Decision } from "@/lib/workflow";
import { loc } from "../l10n";

export interface HistoryStep {
  id: number;
  decision: string;
  note: string | null;
  created_at: string;
  reviewer_name_en: string | null;
  reviewer_name_ar: string | null;
  reviewer_role: string | null;
}

const STAGES = ["ai_draft", "student_submitted", "researcher_approved", "published"] as const;

/** The 4-stage review for an item: stepper, the actions this role may take, and the history. */
export function WorkflowPanel({
  itemId,
  status,
  decisions,
  fourEyesBlocked,
  history,
  demo,
}: {
  itemId: string;
  status: string;
  decisions: Decision[];
  fourEyesBlocked: boolean;
  history: HistoryStep[];
  demo: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reached = status === "returned" ? 0 : status === "archived" ? 4 : STAGES.indexOf(status as (typeof STAGES)[number]);

  const act = async (d: Decision) => {
    setError(null);
    if (d === "return" && !note.trim()) return setError(t("heritage.wf.needNote"));
    setBusy(d);
    try {
      const r = await fetch(`/api/items/${itemId}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: d, note: note.trim() || null }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error?.message);
      setNote("");
      toast({ tone: "ok", text: t("heritage.wf.done", { status: t(`status.${j.data.status}`) }) });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("state.error"));
    } finally {
      setBusy(null);
    }
  };

  const primary = decisions.find((d) => d !== "return" && d !== "archive");
  const secondary = decisions.filter((d) => d !== primary);

  return (
    <Card className="p-5 flex flex-col gap-4" data-testid="workflow-panel" data-status={status}>
      <h2 className="font-semibold text-ink flex items-center gap-2">
        <ShieldCheck className="size-5 text-accent" aria-hidden />
        {t("heritage.wf.title")}
      </h2>
      <ol className="flex flex-col gap-0">
        {STAGES.map((s, i) => {
          const done = i < reached || (i === reached && s === "published");
          const current = i === reached && s !== "published";
          return (
            <li key={s} className="flex items-start gap-3">
              <span className="flex flex-col items-center">
                <span className={cn("size-6 rounded-full grid place-items-center border-2", done ? "bg-accent border-accent text-accent-ink" : current ? "border-accent text-accent bg-accent-soft" : "border-line-strong text-ink-3")} aria-hidden>
                  {done ? <Check className="size-3.5" /> : <CircleDot className="size-3" />}
                </span>
                {i < STAGES.length - 1 && <span className={cn("w-0.5 h-5", i < reached ? "bg-accent" : "bg-line")} aria-hidden />}
              </span>
              <span className={cn("text-sm pt-0.5", current ? "font-semibold text-ink" : done ? "text-ink" : "text-ink-3")} aria-current={current ? "step" : undefined}>
                {t(`status.${s}`)}
              </span>
            </li>
          );
        })}
      </ol>
      {status === "returned" && <Callout tone="warn" title={t("status.returned")}>{history.filter((h) => h.decision === "return").at(-1)?.note}</Callout>}
      {status === "published" && <Callout tone="ok" title={t("heritage.wf.live")} />}

      {decisions.length > 0 ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t("heritage.wf.note")}</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("heritage.wf.notePlaceholder")} rows={2} className="min-h-0" />
          </label>
          {fourEyesBlocked && primary === "publish" && <Callout tone="warn">{t("heritage.wf.fourEyes")}</Callout>}
          <div className="flex flex-wrap gap-2">
            {primary && (
              <Button onClick={() => act(primary)} loading={busy === primary} disabled={!!busy || (primary === "publish" && fourEyesBlocked)} data-testid={`wf-${primary}`}>
                {t(`heritage.wf.${primary}`)}
              </Button>
            )}
            {secondary.map((d) => (
              <Button key={d} variant={d === "return" ? "secondary" : "ghost"} onClick={() => act(d)} loading={busy === d} disabled={!!busy} data-testid={`wf-${d}`}>
                {t(`heritage.wf.${d}`)}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-3">{t("heritage.wf.noActions")}</p>
      )}
      <div aria-live="polite">{error && <Callout tone="bad">{error}</Callout>}</div>

      <details className="group border-t border-line pt-3" open={history.length <= 4}>
        <summary className="cursor-pointer list-none text-sm font-semibold text-ink min-h-8 flex items-center">{t("heritage.wf.history")}</summary>
        {history.length === 0 ? (
          <p className="text-sm text-ink-3 mt-2">{t("heritage.wf.noHistory")}</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2.5">
            {history.map((h) => (
              <li key={h.id} className="text-sm">
                <span className="text-ink">
                  <span className="font-medium">{loc(locale, h.reviewer_name_en, h.reviewer_name_ar)}{demo ? ` (${t("badge.demo")})` : ""}</span>{" "}
                  {t(`heritage.wf.decision.${h.decision}`)}
                </span>
                <span className="block text-xs text-ink-3">{fmtDate(h.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}</span>
                {h.note && <span className="block text-ink-2 mt-0.5">“{h.note}”</span>}
              </li>
            ))}
          </ol>
        )}
      </details>
    </Card>
  );
}
