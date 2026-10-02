import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, BadgeCheck, CheckCircle2, ClipboardCheck, CornerUpLeft, FilePlus2, Inbox, MessageCircleHeart, MessagesSquare, PencilLine,
  ScrollText, BookOpenCheck, Users, Sparkles,
} from "lucide-react";
import { getUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { fmtNumber, fmtRelative, type Locale } from "@/i18n/core";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { Badge } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { getDashboard, type Queue } from "@/features/portal/server";
import { ActivityFeed } from "@/features/portal/activity-feed";
import type { TaskKind } from "@/features/portal/logic";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal" };

const TASK_ICON: Record<TaskKind, React.ElementType> = {
  fix_returned: CornerUpLeft,
  continue_draft: PencilLine,
  review: ClipboardCheck,
  publish: BadgeCheck,
  answer: MessageCircleHeart,
  demand: Inbox,
  start_card: FilePlus2,
  inbox_clear: MessagesSquare,
  all_clear: CheckCircle2,
};

export default async function PortalHome() {
  const user = await getUser();
  if (!user) redirect("/portal/login");
  const { t, locale } = await getI18n();
  const d = await getDashboard(user);
  const name = locale === "ar" ? user.display_name_ar : user.display_name_en;
  const inst = (locale === "ar" ? user.institution_name_ar : user.institution_name_en) ?? t("portal.allInstitutions");
  const n = d.next.count;
  const k = `portal.dash.next.${d.next.kind}`;
  const has = (key: string) => t(key) !== key;
  const title = n === 1 && has(`${k}.title1`) ? t(`${k}.title1`) : t(`${k}.title`, { n: fmtNumber(n, locale) });
  const body = n === 1 && has(`${k}.body1`) ? t(`${k}.body1`) : t(`${k}.body`, { n: fmtNumber(n, locale) });
  const Icon = TASK_ICON[d.next.kind];
  const canInbox = ["specialist", "researcher", "platform_admin"].includes(user.role);
  const canDemand = ["researcher", "institution_admin", "platform_admin"].includes(user.role);
  const urgent = n > 0;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-[1.7rem] font-semibold">{t("portal.dash.hello", { name })}</h1>
          <p className="text-ink-2 mt-0.5">
            {t("portal.dash.sub", { role: t(`role.${user.role}`), institution: inst })}
            {env.demoMode && user.is_demo && <span className="ms-2 text-xs text-ink-3">({t("badge.demo")})</span>}
          </p>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section aria-labelledby="next-task" className={cn("relative overflow-hidden rounded-[var(--radius-lg)] border p-6 lg:p-7 flex flex-col gap-4 shadow-card", urgent ? "bg-brand text-brand-ink border-transparent" : "bg-surface border-line")}>
          {urgent && <div className="absolute inset-0 khatam-bg opacity-[0.08] pointer-events-none" aria-hidden />}
          <p id="next-task" className={cn("relative text-xs font-semibold uppercase tracking-[0.12em]", urgent ? "text-brand-ink/80" : "text-ink-3")}>{t("portal.dash.nextTask")}</p>
          <div className="relative flex items-start gap-4">
            <span className={cn("size-12 shrink-0 rounded-2xl grid place-items-center", urgent ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent")}>
              <Icon className="size-6" aria-hidden />
            </span>
            <div className="flex flex-col gap-1.5 min-w-0">
              <h2 className="text-xl lg:text-2xl font-semibold">{title}</h2>
              <p className={cn("max-w-[60ch]", urgent ? "text-brand-ink/85" : "text-ink-2")}>{body}</p>
            </div>
          </div>
          <div className="relative flex flex-wrap items-center gap-3 mt-1">
            <ButtonLink href={d.next.href} size="lg" variant="primary" data-testid="next-task">
              {t(`${k}.cta`)}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </ButtonLink>
            {d.topRequest && canDemand && d.next.kind !== "demand" && (
              <Link href="/portal/demand" className={cn("text-sm underline underline-offset-4", urgent ? "text-brand-ink/85 hover:text-brand-ink" : "text-ink-2 hover:text-ink")}>
                {t("portal.dash.topRequestBody", { n: fmtNumber(d.topRequest.open, locale), label: (locale === "ar" ? d.topRequest.label_ar : d.topRequest.label_en) ?? "" })}
              </Link>
            )}
          </div>
        </section>

        <section aria-labelledby="stats" className="flex flex-col gap-3">
          <h2 id="stats" className="sr-only">{t("portal.dash.stats")}</h2>
          <div className="grid grid-cols-2 gap-3 h-full">
            <Stat href="/portal/cards?stage=published" icon={BookOpenCheck} label={t("portal.dash.stat.published")} value={fmtNumber(d.stats.published, locale)} />
            <Stat href={canDemand ? "/portal/demand" : undefined} icon={Inbox} label={t("portal.dash.stat.requests")} value={fmtNumber(d.stats.requests, locale)} hint={t("portal.dash.stat.requestsWeek", { n: fmtNumber(d.stats.requestsWeek, locale) })} />
            <Stat href={canInbox ? "/portal/inbox" : undefined} icon={MessagesSquare} label={t("portal.dash.stat.conversations")} value={fmtNumber(d.stats.conversations, locale)} hint={t("portal.dash.stat.waiting", { n: fmtNumber(d.stats.waiting, locale) })} warn={d.stats.waiting > 0} />
            <Stat href={["researcher", "institution_admin", "platform_admin", "student"].includes(user.role) ? "/portal/people" : undefined} icon={Sparkles} label={t("portal.dash.stat.points")} value={fmtNumber(d.stats.points, locale)} hint={t("portal.dash.stat.pointsHint")} />
          </div>
        </section>
      </div>

      {d.queues.length > 0 && (
        <section aria-labelledby="queues" className="flex flex-col gap-3">
          <h2 id="queues" className="text-lg font-semibold">{t("portal.dash.queues")}</h2>
          <div className={cn("grid gap-4 md:grid-cols-2", d.queues.length >= 3 && "xl:grid-cols-3", d.queues.length >= 4 && "2xl:grid-cols-4")}>
            {d.queues.map((q) => (
              <QueueCard key={q.key} q={q} locale={locale} t={t} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] items-start">
        <Card className="p-5">
          <ActivityFeed initial={d.activity} canInbox={canInbox} />
        </Card>
        <div className="flex flex-col gap-5">
          <Card className="p-5 flex flex-col gap-3 bg-sand border-transparent">
            <div className="flex items-center gap-3">
              <span className="size-10 rounded-xl bg-surface/70 grid place-items-center text-sand-ink"><ScrollText className="size-5" aria-hidden /></span>
              <h2 className="text-lg font-semibold text-sand-ink">{t("portal.dash.studio")}</h2>
            </div>
            <p className="text-sm text-sand-ink/90">{t("portal.dash.studioBody")}</p>
            {d.manuscripts && (
              <p className="text-sm font-medium text-sand-ink tabular">
                {t("portal.dash.studioCounts", { a: fmtNumber(d.manuscripts.toTranscribe, locale), b: fmtNumber(d.manuscripts.toReview, locale), c: fmtNumber(d.manuscripts.toApprove, locale) })}
              </p>
            )}
            <div>
              <ButtonLink href="/portal/manuscripts" variant="secondary">{t("portal.dash.studioOpen")}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></ButtonLink>
            </div>
          </Card>
          {d.topRequest && (
            <Card className="p-5 flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{t("portal.dash.topRequest")}</p>
              <p className="text-ink">{t("portal.dash.topRequestBody", { n: fmtNumber(d.topRequest.open, locale), label: (locale === "ar" ? d.topRequest.label_ar : d.topRequest.label_en) ?? "" })}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {user.role !== "specialist" && d.topRequest.concept_id && (
                  <ButtonLink href={`/portal/cards/new?concept=${encodeURIComponent(d.topRequest.concept_id)}`} size="sm" variant="soft">
                    <FilePlus2 className="size-4" aria-hidden />{t("demand.create")}
                  </ButtonLink>
                )}
                {canDemand && <ButtonLink href="/portal/demand" size="sm" variant="ghost">{t("portal.dash.queue.all")}</ButtonLink>}
              </div>
            </Card>
          )}
          {["researcher", "institution_admin", "platform_admin"].includes(user.role) && (
            <Link href="/portal/people" className="text-sm text-ink-2 hover:text-ink inline-flex items-center gap-2 px-1">
              <Users className="size-4" aria-hidden />{t("portal.people.title")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, href, warn }: { icon: React.ElementType; label: string; value: string; hint?: string; href?: string; warn?: boolean }) {
  const inner = (
    <>
      <span className="flex items-center gap-2 text-sm text-ink-2"><Icon className="size-4" aria-hidden />{label}</span>
      <span className="text-[1.9rem] leading-none font-semibold tabular text-ink mt-1">{value}</span>
      {hint && <span className={cn("text-xs", warn ? "text-warn font-medium" : "text-ink-3")}>{hint}</span>}
    </>
  );
  const cls = "bg-surface rounded-[var(--radius)] border border-line shadow-card p-4 flex flex-col gap-1.5 min-h-[112px]";
  return href ? <Link href={href} className={cn(cls, "hover:border-line-strong transition-colors")}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

function QueueCard({ q, locale, t }: { q: Queue; locale: Locale; t: (k: string, v?: Record<string, string | number>) => string }) {
  return (
    <Card className="p-4 flex flex-col gap-3" data-testid={`queue-${q.key}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-ink">{t(`portal.dash.queue.${q.key}`)}</h3>
        <Badge tone={q.count ? (q.key === "returned" || q.key === "waiting" ? "warn" : "violet") : "neutral"} className="tabular">{fmtNumber(q.count, locale)}</Badge>
      </div>
      {q.items.length === 0 ? (
        <p className="text-sm text-ink-3">{t("portal.dash.queue.empty")}</p>
      ) : (
        <ul className="flex flex-col -mx-1">
          {q.items.map((it) => (
            <li key={it.id}>
              <Link href={it.href} className="flex flex-col px-2 py-1.5 rounded-[10px] hover:bg-surface-2">
                <span className="text-[0.92rem] text-ink truncate" dir="auto">{(locale === "ar" ? it.title_ar : it.title_en) || it.title_en || it.title_ar || "—"}</span>
                <span className="text-xs text-ink-3 truncate">
                  {[(locale === "ar" ? it.who_ar : it.who_en) ?? null, fmtRelative(it.at, locale)].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {q.count > q.items.length && (
        <Link href={q.href} className="text-sm font-medium text-accent hover:underline underline-offset-4 mt-auto">{t("portal.dash.queue.all")}</Link>
      )}
    </Card>
  );
}
