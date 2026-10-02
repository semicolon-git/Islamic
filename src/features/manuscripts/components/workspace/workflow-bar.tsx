"use client";
import { useState } from "react";
import { BadgeCheck, Check, CornerDownLeft, Globe, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { availableDecisions, STATUS_ORDER, type Decision } from "@/lib/workflow";
import type { PageDetail } from "../../types";
import { api, ApiError, num } from "../api";

const ICON: Partial<Record<Decision, React.ComponentType<{ className?: string }>>> = { submit: Send, approve: BadgeCheck, publish: Globe, return: CornerDownLeft };

/** Stage stepper (machine draft → student → researcher → institution) and the actions this viewer can take. */
export function WorkflowStepper({ detail }: { detail: PageDetail }) {
  const { t } = useI18n();
  const status = detail.page.status;
  const idx = status === "returned" ? 0 : STATUS_ORDER.indexOf(status);
  return (
    <ol className="flex items-center gap-1" aria-label={t("manuscripts.wf.history")}>
      {STATUS_ORDER.map((s, i) => {
        const done = i < idx || status === "published";
        const cur = i === idx && status !== "published";
        return (
          <li key={s} className="flex items-center gap-1" aria-current={cur ? "step" : undefined}>
            {i > 0 && <span className={cn("h-px w-4 xl:w-6", done || cur ? "bg-accent" : "bg-line-strong")} aria-hidden />}
            <span className={cn("inline-flex items-center gap-1.5 h-7 px-2 rounded-full text-xs font-medium whitespace-nowrap",
              done ? "text-accent" : cur ? "bg-accent-soft text-ink" : "text-ink-3")}>
              <span className={cn("size-4 rounded-full grid place-items-center text-[0.6rem]", done ? "bg-accent text-accent-ink" : cur ? "border-2 border-accent" : "border border-line-strong")}>
                {done && <Check className="size-3" />}
              </span>
              <span className={cn(!cur && "hidden 2xl:inline")}>{t(`manuscripts.step.${s}`)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function WorkflowActions({ detail, onChanged, beforeAction }: { detail: PageDetail; onChanged: () => Promise<void>; beforeAction: () => Promise<boolean> }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decisions = availableDecisions(detail.viewer.role, detail.page.status).filter((d) => d !== "archive");
  const machineOnly = detail.lines.filter((l) => !l.has_human).length;

  if (!decisions.length) {
    const waiting = t(`manuscripts.wf.waiting.${detail.page.status}`);
    return <span className="text-sm text-ink-3 hidden md:inline">{waiting.startsWith("manuscripts.") ? "" : waiting}</span>;
  }

  const confirm = async () => {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/ms/pages/${detail.page.id}/workflow`, { method: "POST", json: { decision: open, note: note.trim() || undefined } });
      toast({ tone: "ok", text: t(`manuscripts.wf.done.${open}`) });
      setOpen(null);
      setNote("");
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("manuscripts.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const start = async (d: Decision) => {
    if (!(await beforeAction())) return;
    setError(null);
    setNote("");
    setOpen(d);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {decisions.map((d) => {
          const Icon = ICON[d] ?? Send;
          return (
            <Button key={d} size="sm" variant={d === "return" ? "secondary" : "primary"} onClick={() => start(d)} data-decision={d}>
              <Icon className="size-4" />{t(`manuscripts.wf.${d}`)}
            </Button>
          );
        })}
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} side="center" title={open ? t(`manuscripts.wf.${open}`) : ""} closeLabel={t("action.close")}
        footer={<><Button variant="ghost" onClick={() => setOpen(null)}>{t("action.cancel")}</Button><Button onClick={confirm} loading={busy} data-testid="wf-confirm" disabled={open === "return" && !note.trim()}>{t("manuscripts.wf.confirm")}</Button></>}>
        <div className="flex flex-col gap-4">
          {open === "submit" && (
            <>
              <p className="text-ink-2">{t("manuscripts.wf.submitDesc")}</p>
              {machineOnly > 0 && <Callout tone="warn">{t("manuscripts.wf.machineOnly", { n: num(machineOnly, locale) })}</Callout>}
            </>
          )}
          {open === "approve" && <p className="text-ink-2">{t("manuscripts.wf.approveDesc")}</p>}
          {open === "return" && <p className="text-ink-2">{t("manuscripts.wf.returnDesc")}</p>}
          {open === "publish" && (
            <>
              <p className="text-ink-2">{t("manuscripts.wf.publishDesc")}</p>
              <div className="rounded-[12px] border border-line p-3 flex flex-col gap-2">
                <span className="text-sm font-semibold inline-flex items-center gap-2"><ShieldCheck className="size-4 text-accent" />{t("manuscripts.wf.publishChecks")}</span>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {["checkRights", "checkLabel", "checkScope", "checkFourEyes"].map((k) => (
                    <li key={k} className="flex items-start gap-2"><Check className="size-4 text-ok mt-0.5 shrink-0" />{t(`manuscripts.wf.${k}`)}</li>
                  ))}
                </ul>
                <p className="text-xs text-ink-3 border-t border-line pt-2" dir="ltr">{detail.manuscript.license} · {detail.manuscript.credit_line}</p>
              </div>
            </>
          )}
          {(open === "return" || open === "approve" || open === "submit") && (
            <Field label={t("manuscripts.wf.note")} htmlFor="wf-note">
              <Textarea id="wf-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("manuscripts.wf.notePlaceholder")} required={open === "return"} />
            </Field>
          )}
          {error && <Callout tone="bad">{error}</Callout>}
        </div>
      </Sheet>
    </>
  );
}
