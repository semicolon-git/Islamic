"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, AtSign, CheckCircle2, ClipboardCheck, Globe, GitPullRequestArrow, Inbox, Scale, ScrollText, Sparkles, Type } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { Card } from "@/components/ui/surface";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/components/ui/cn";
import { fmtRelative } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { useEvents } from "@/lib/use-events";
import { api, num } from "../../../manuscripts/components/api";
import type { Progress } from "../../server/points";
import type { QueueData, ReviewQueueItem } from "../../types";
import { FirstTip, Siglum } from "../bits";
import { AssignPanel } from "./assign-panel";
import { TaskCard } from "./task-card";

function PageRow({ p, href, cta, icon }: { p: ReviewQueueItem; href: string; cta: string; icon: React.ReactNode }) {
  const { t, locale } = useI18n();
  const who = p.submitted_by ? (locale === "ar" ? p.submitted_by.name_ar : p.submitted_by.name_en) : null;
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-[var(--radius)] border border-line bg-surface p-3 shadow-card" data-review-page={p.page_id}>
      <span className="w-12 h-16 shrink-0 rounded-[10px] bg-sand overflow-hidden">{p.thumb && <img src={p.thumb} alt="" className="size-full object-cover object-top" loading="lazy" />}</span>
      <span className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold"><Siglum s={p.siglum} size="sm" />{t("collab.pageN", { n: num(p.page_seq, locale) })} · <span className="font-ms font-normal text-base" dir="rtl" lang="ar">{locale === "ar" ? p.ms_title_ar : p.ms_title_en}</span></span>
        <span className="text-xs text-ink-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          {who && <span className="inline-flex items-center gap-1"><Avatar name={who} hue={p.submitted_by!.hue} size={16} />{who}</span>}
          {p.submitted_at && <span>{fmtRelative(p.submitted_at, locale)}</span>}
          <span>{t("collab.review.linesChecked", { n: num(p.lines_changed, locale), total: num(p.lines_total, locale) })}</span>
          {p.open_suggestions > 0 && <Badge tone="violet"><GitPullRequestArrow className="size-3" />{num(p.open_suggestions, locale)}</Badge>}
          {p.open_comments > 0 && <Badge tone="violet"><AtSign className="size-3" />{num(p.open_comments, locale)}</Badge>}
        </span>
      </span>
      <ButtonLink href={href} data-testid="review-open">{icon}{cta}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></ButtonLink>
    </li>
  );
}

function ProgressCard({ progress }: { progress: Progress | null }) {
  const { t, locale } = useI18n();
  if (!progress) return null;
  const rows: [string, number, number][] = [
    ["collab.progress.lines", progress.by_reason.ms_line_accepted.n, progress.by_reason.ms_line_accepted.points],
    ["collab.progress.words", progress.by_reason.ms_keying_accepted.n, progress.by_reason.ms_keying_accepted.points],
    ["collab.progress.suggestions", progress.by_reason.ms_suggestion_accepted.n, progress.by_reason.ms_suggestion_accepted.points],
  ];
  return (
    <Card className="p-5 flex flex-col gap-3" data-testid="my-progress">
      <div className="flex items-center gap-3">
        <span className="size-10 rounded-xl bg-accent-soft text-accent grid place-items-center"><Sparkles className="size-5" aria-hidden /></span>
        <div>
          <h2 className="font-semibold">{t("collab.progress.title")}</h2>
          <p className="text-xs text-ink-3">{t("collab.progress.private")}</p>
        </div>
        <span className="ms-auto text-[1.8rem] leading-none font-semibold tabular">{num(progress.points, locale)}</span>
      </div>
      <dl className="flex flex-col gap-1.5 text-sm">
        {rows.map(([k, n, p]) => (
          <div key={k} className="flex items-center justify-between gap-2">
            <dt className="text-ink-2">{t(k, { n: num(n, locale) })}</dt>
            <dd className="tabular text-ink-3">+{num(p, locale)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-3 border-t border-line pt-2">{t("collab.progress.how", { lines: num(progress.lines_checked, locale), words: num(progress.words_keyed, locale) })}</p>
    </Card>
  );
}

/** "My work": one place to see what to do next, by role. */
export function QueueView({ initial, progress }: { initial: QueueData; progress: Progress | null }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"work" | "assign">("work");
  const role = data.role;
  const assigner = role === "researcher" || role === "institution_admin" || role === "platform_admin";
  const reload = useCallback(async () => {
    try { setData(await api<QueueData>("/api/ms-collab/queue")); } catch { /* keep what we have */ }
  }, []);
  useEffect(() => setData(initial), [initial]);
  useEvents([`user:${data.user_id}`, ...new Set(data.tasks.map((x) => `ms:${x.ms_id}`))], () => void reload());
  const [hero, ...rest] = data.tasks;
  const isStudent = role === "student";

  const aside = (
    <aside className="flex flex-col gap-4" aria-label={t("collab.queue.side")}>
      {isStudent && (
        <Card className="p-5 flex flex-col gap-3 bg-sand border-transparent" data-testid="hard-card">
          <div className="flex items-center gap-3">
            <span className="size-10 rounded-xl bg-surface/70 text-sand-ink grid place-items-center"><Type className="size-5" aria-hidden /></span>
            <h2 className="font-semibold text-sand-ink">{t("collab.hard.cardTitle")}</h2>
          </div>
          <p className="text-sm text-sand-ink/90">{data.hard.to_key ? t("collab.hard.cardBody", { n: num(data.hard.to_key, locale) }) : t("collab.hard.cardNone")}</p>
          {data.hard.to_key > 0 && <ButtonLink href="/portal/manuscripts/queue/hard-words" variant="secondary" className="self-start" data-testid="hard-start">{t("collab.hard.start")}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></ButtonLink>}
        </Card>
      )}
      {(role === "researcher" || role === "platform_admin") && (
        <Card className={cn("p-5 flex flex-col gap-3", data.hard.disputed ? "border-warn/40" : "")} data-testid="disputed-card">
          <div className="flex items-center gap-3">
            <span className="size-10 rounded-xl bg-warn-soft text-warn grid place-items-center"><Scale className="size-5" aria-hidden /></span>
            <h2 className="font-semibold">{t("collab.hard.disputedTitle")}</h2>
            <Badge tone={data.hard.disputed ? "warn" : "neutral"} className="ms-auto tabular">{num(data.hard.disputed, locale)}</Badge>
          </div>
          <p className="text-sm text-ink-2">{data.hard.disputed ? t("collab.hard.disputedBody") : t("collab.hard.disputedNone")}</p>
          <ButtonLink href="/portal/manuscripts/queue/hard-words" variant={data.hard.disputed ? "primary" : "secondary"} className="self-start" data-testid="adjudicate-open">{t("collab.hard.adjudicate")}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></ButtonLink>
        </Card>
      )}
      {data.suggestions.length > 0 && (
        <Card className="p-5 flex flex-col gap-2">
          <h2 className="font-semibold inline-flex items-center gap-2"><GitPullRequestArrow className="size-4 text-violet" />{t("collab.queue.suggestions")}</h2>
          <ul className="flex flex-col -mx-1">
            {data.suggestions.map((s) => (
              <li key={s.id}>
                <Link href={`/portal/manuscripts/${s.ms_id}/pages/${s.page_id}?line=${encodeURIComponent(s.line_id)}`} className="flex flex-col px-2 py-1.5 rounded-[10px] hover:bg-surface-2">
                  <span className="text-sm">{t("collab.queue.suggestionFrom", { name: locale === "ar" ? s.author_ar : s.author_en, n: num(s.line_n, locale) })}</span>
                  {s.reason && <span className="text-xs text-ink-3 line-clamp-1" dir="auto">{s.reason}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="p-5 flex flex-col gap-2">
        <h2 className="font-semibold inline-flex items-center gap-2"><AtSign className="size-4 text-violet" />{t("collab.queue.mentions")}</h2>
        {data.mentions.length === 0 ? <p className="text-sm text-ink-3">{t("collab.queue.noMentions")}</p> : (
          <ul className="flex flex-col -mx-1" data-testid="mentions">
            {data.mentions.map((m) => (
              <li key={m.id}>
                <Link href={`/portal/manuscripts/${m.ms_id}/pages/${m.page_id}${m.line_id ? `?line=${encodeURIComponent(m.line_id)}` : ""}`} className="flex flex-col px-2 py-1.5 rounded-[10px] hover:bg-surface-2">
                  <span className="text-sm line-clamp-2" dir="auto">{m.body}</span>
                  <span className="text-xs text-ink-3">{locale === "ar" ? m.author_ar : m.author_en}{m.line_n ? ` · ${t("collab.lineN", { n: num(m.line_n, locale) })}` : ""} · {fmtRelative(m.created_at, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {isStudent && <ProgressCard progress={progress} />}
    </aside>
  );

  return (
    <div className="flex flex-col gap-6 animate-rise" data-testid="queue">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1.5 max-w-3xl">
          <nav aria-label="breadcrumb"><Link href="/portal/manuscripts" className="text-sm text-ink-2 hover:text-ink">{t("manuscripts.title")}</Link></nav>
          <h1 className="text-[1.75rem] font-semibold tracking-tight flex items-center gap-3">
            <span className="size-10 rounded-[12px] bg-accent-soft text-accent grid place-items-center"><ClipboardCheck className="size-5" /></span>
            {t(isStudent ? "collab.queue.titleStudent" : "collab.queue.title")}
          </h1>
          <p className="text-ink-2">{t(`collab.queue.sub.${isStudent ? "student" : role === "institution_admin" ? "institution" : "researcher"}`)}</p>
        </div>
        {assigner && (
          <Segmented label={t("collab.queue.title")} value={tab} onChange={setTab} options={[{ value: "work", label: t("collab.queue.tabWork") }, { value: "assign", label: t("collab.queue.tabAssign") }]} />
        )}
      </header>

      {tab === "assign" && assigner ? <AssignPanel /> : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
          <div className="flex flex-col gap-6 min-w-0">
            {isStudent && <FirstTip id="my-work" title={t("collab.tip.work.title")}>{t("collab.tip.work.body")}</FirstTip>}

            {(isStudent || data.tasks.length > 0) && (
              <section aria-labelledby="q-tasks" className="flex flex-col gap-3">
                <h2 id="q-tasks" className="text-lg font-semibold">{t("collab.queue.tasks")} <span className="text-ink-3 font-normal tabular">({num(data.tasks.length, locale)})</span></h2>
                {data.tasks.length === 0 ? (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-surface">
                    <EmptyState icon={<Inbox className="size-7" />} title={t("collab.queue.noTasks")} body={t("collab.queue.noTasksBody")}
                      action={<>{data.hard.to_key > 0 && <ButtonLink href="/portal/manuscripts/queue/hard-words">{t("collab.hard.start")}</ButtonLink>}<ButtonLink href="/portal/manuscripts" variant="secondary"><ScrollText className="size-4" />{t("collab.queue.browse")}</ButtonLink></>} />
                  </div>
                ) : (
                  <>
                    <TaskCard task={hero} hero />
                    {rest.map((x) => <TaskCard key={x.id} task={x} />)}
                  </>
                )}
              </section>
            )}

            {(role === "researcher" || role === "platform_admin") && (
              <section aria-labelledby="q-review" className="flex flex-col gap-3">
                <h2 id="q-review" className="text-lg font-semibold">{t("collab.queue.toReview")} <span className="text-ink-3 font-normal tabular">({num(data.reviews.length, locale)})</span></h2>
                {data.reviews.length === 0 ? (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-surface"><EmptyState icon={<CheckCircle2 className="size-7" />} title={t("collab.queue.noReviews")} body={t("collab.queue.noReviewsBody")} /></div>
                ) : (
                  <ul className="flex flex-col gap-2">{data.reviews.map((p) => <PageRow key={p.page_id} p={p} href={`/portal/manuscripts/queue/review/${p.page_id}`} cta={t("collab.queue.review")} icon={<ClipboardCheck className="size-4" />} />)}</ul>
                )}
              </section>
            )}

            {(role === "institution_admin" || role === "platform_admin") && (
              <section aria-labelledby="q-publish" className="flex flex-col gap-3">
                <h2 id="q-publish" className="text-lg font-semibold">{t("collab.queue.toPublish")} <span className="text-ink-3 font-normal tabular">({num(data.publish.length, locale)})</span></h2>
                {data.publish.length === 0 ? (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-surface"><EmptyState icon={<Globe className="size-7" />} title={t("collab.queue.noPublish")} body={t("collab.queue.noPublishBody")} /></div>
                ) : (
                  <ul className="flex flex-col gap-2">{data.publish.map((p) => <PageRow key={p.page_id} p={p} href={`/portal/manuscripts/${p.ms_id}/pages/${p.page_id}`} cta={t("collab.queue.openPublish")} icon={<Globe className="size-4" />} />)}</ul>
                )}
                <Callout tone="neutral">{t("collab.queue.fourEyes")}</Callout>
              </section>
            )}

            {data.done.length > 0 && (
              <section aria-labelledby="q-done" className="flex flex-col gap-2">
                <h2 id="q-done" className="text-sm font-semibold text-ink-3">{t("collab.queue.done")}</h2>
                <ul className="flex flex-col gap-2">{data.done.map((x) => <li key={x.id}><TaskCard task={x} /></li>)}</ul>
              </section>
            )}
          </div>
          {aside}
        </div>
      )}
    </div>
  );
}
