"use client";
import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, Flame, ScrollText } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { fmtDate } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { num } from "../../../manuscripts/components/api";
import type { TaskDTO } from "../../types";
import { Meter, Siglum } from "../bits";

export function DueChip({ due, locale }: { due: string | null; locale: "en" | "ar" }) {
  const { t } = useI18n();
  if (!due) return null;
  const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000);
  const tone = days < 0 ? "bad" : days <= 2 ? "warn" : "neutral";
  return (
    <Badge tone={tone}>
      <CalendarClock className="size-3" aria-hidden />
      {days < 0 ? t("collab.task.overdue", { date: fmtDate(due, locale) }) : days === 0 ? t("collab.task.dueToday") : t("collab.task.due", { date: fmtDate(due, locale) })}
    </Badge>
  );
}

export function PriorityChip({ p }: { p: TaskDTO["priority"] }) {
  const { t } = useI18n();
  if (p === "normal") return null;
  return <Badge tone={p === "high" ? "bad" : "neutral"}>{p === "high" && <Flame className="size-3" aria-hidden />}{t(`collab.task.priority.${p}`)}</Badge>;
}

/** One assignment: what to do, due/priority, progress, and one obvious "Continue". */
export function TaskCard({ task, hero = false }: { task: TaskDTO; hero?: boolean }) {
  const { t, locale } = useI18n();
  const title = locale === "ar" ? task.ms_title_ar : task.ms_title_en;
  const page = task.page_label ?? t("collab.pageN", { n: num(task.page_seq, locale) });
  const left = task.total - task.touched;
  return (
    <article className={cn("flex gap-4 rounded-[var(--radius-lg)] border bg-surface shadow-card", hero ? "p-5 lg:p-6 border-accent/40" : "p-4 border-line")} data-testid="task-card" data-task={task.id}>
      <Link href={task.continue_href} tabIndex={-1} aria-hidden className={cn("shrink-0 rounded-[12px] bg-sand overflow-hidden grid place-items-center", hero ? "w-24 h-32 sm:w-28 sm:h-36" : "w-16 h-20")}>
        {task.thumb ? <img src={task.thumb} alt="" className="size-full object-cover object-top" loading="lazy" /> : <ScrollText className="size-6 text-sand-ink/60" />}
      </Link>
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Siglum s={task.siglum} size="sm" />
          <span className={cn("font-semibold text-ink", hero ? "text-lg" : "")}>{t(`collab.task.kind.${task.kind}`)}</span>
          <PriorityChip p={task.priority} />
          <DueChip due={task.due_at} locale={locale} />
        </div>
        <p className="text-sm text-ink-2 min-w-0"><span className="font-ms text-base" dir="rtl" lang="ar">{title}</span> · {page}</p>
        {task.note && <p className="text-sm text-ink-2 bg-surface-2 rounded-[10px] px-3 py-1.5" dir="auto">“{task.note}”{task.created_by && <span className="text-ink-3"> — {locale === "ar" ? task.created_by.name_ar : task.created_by.name_en}</span>}</p>}
        <div className="flex flex-col gap-1">
          <Meter value={task.touched} total={task.total} label={t("collab.task.progressLabel")} tone={task.submitted ? "ok" : "accent"} />
          <span className="text-xs text-ink-3 tabular" data-testid="task-progress">{t("collab.task.progress", { done: num(task.touched, locale), total: num(task.total, locale) })}{!task.submitted && left > 0 ? ` · ${t("collab.task.left", { n: num(left, locale) })}` : ""}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {task.status === "done" || task.submitted ? (
            <Badge tone="ok"><CheckCircle2 className="size-3" />{task.submitted ? t("collab.task.submitted") : t("collab.task.done")}</Badge>
          ) : (
            <ButtonLink href={task.continue_href} size={hero ? "lg" : "md"} data-testid="task-continue">
              {task.kind === "double_key" ? t("collab.task.startHard") : task.touched === 0 ? t("collab.task.start") : task.continue_n ? t("collab.task.continueLine", { n: num(task.continue_n, locale) }) : t("collab.task.continue")}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </ButtonLink>
          )}
          {!task.submitted && task.touched > 0 && task.touched >= task.total && task.kind !== "double_key" && <span className="text-sm text-ok">{t("collab.task.readyToSubmit")}</span>}
        </div>
      </div>
    </article>
  );
}
