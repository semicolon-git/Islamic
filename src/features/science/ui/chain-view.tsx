import Link from "next/link";
import { BadgeCheck, ChevronRight, ExternalLink, FlaskConical, Info, ShieldCheck } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { Locale } from "@/i18n/core";
import type { Chain, ChainReview, ChainRole } from "../chains";

/**
 * A contribution chain as a timeline: who came before, what Muslim scholars documented, how it travelled, who came after,
 * and today's object — with sources on every step, what we do not claim, and the popular claims we checked.
 * Hook-free so the server page and the client discovery screen can both render it (they pass `t` and `locale`).
 */

type T = (key: string, vars?: Record<string, string | number>) => string;
const L = (locale: Locale, en?: string | null, ar?: string | null) => (locale === "ar" ? ar || en || "" : en || ar || "");

const ROLE_DOT: Record<ChainRole, string> = {
  before: "bg-ink-3",
  muslim: "bg-accent ring-4 ring-accent-soft",
  transmission: "bg-[#6d5dfc]",
  after: "bg-[#c48a1a]",
  today: "bg-ink",
};

export function ReviewBadge({ review, t, locale }: { review: ChainReview; t: T; locale: Locale }) {
  if (review.status === "reviewed")
    return (
      <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-ok-soft text-ink px-3 py-1 text-xs font-semibold" data-review="reviewed">
        <BadgeCheck className="size-4 text-ok" aria-hidden />{t("chain.review.reviewed", { by: L(locale, review.by_en, review.by_ar) })}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#fdf3d6] text-[#7a5600] dark:bg-[#3a2f12] dark:text-[#f3d27a] px-3 py-1 text-xs font-semibold" data-review="sourced">
      <ShieldCheck className="size-4" aria-hidden />{t("chain.review.sourced")}
    </span>
  );
}

export function ChainView({ chain, t, locale, compact = false, href }: { chain: Omit<Chain, "objects" | "objects_ar"> & { review?: ChainReview }; t: T; locale: Locale; compact?: boolean; href?: string }) {
  const review = chain.review ?? { status: "sourced" as const };
  const myths = chain.myths ?? [];
  return (
    <article className="flex flex-col gap-4" data-testid="chain" data-chain={chain.id}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-ink">
            <FlaskConical className="size-3.5 text-accent" aria-hidden />{L(locale, chain.science_en, chain.science_ar)}
          </span>
          <span className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-2" data-claim={chain.claim}>{t(`chain.claim.${chain.claim}`)}</span>
        </div>
        {compact ? (
          <h3 className="text-lg font-semibold text-ink leading-snug">{L(locale, chain.title_en, chain.title_ar)}</h3>
        ) : (
          <h1 className="text-[2rem] leading-tight font-semibold text-ink">{L(locale, chain.title_en, chain.title_ar)}</h1>
        )}
        <ReviewBadge review={review} t={t} locale={locale} />
      </header>

      <p className="leading-relaxed text-ink text-[1.02rem]" data-testid="chain-answer">{L(locale, chain.answer_en, chain.answer_ar)}</p>

      <section className="flex flex-col gap-2" aria-label={t("chain.timeline")}>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-3">{t("chain.timeline")}</h4>
        <ol className="relative flex flex-col gap-4 ps-6 before:absolute before:inset-y-2 before:start-[7px] before:w-0.5 before:bg-line" data-testid="chain-steps">
          {chain.steps.map((s, i) => (
            <li key={i} className="relative flex flex-col gap-1" data-role={s.role}>
              <span className={cn("absolute -start-6 top-1.5 size-4 rounded-full border-2 border-surface", ROLE_DOT[s.role])} aria-hidden />
              <span className={cn("text-[0.7rem] font-semibold uppercase tracking-wider", s.role === "muslim" ? "text-accent" : "text-ink-3")}>{t(`chain.role.${s.role}`)}</span>
              <span className="font-semibold text-ink leading-snug">
                {s.scientist ? (
                  <Link href={`/science/scientist/${s.scientist}`} className="underline decoration-line-strong underline-offset-4 hover:text-accent">{L(locale, s.who_en, s.who_ar)}</Link>
                ) : (
                  L(locale, s.who_en, s.who_ar)
                )}
                <span className="font-normal text-ink-3 text-sm"> · {s.date_text}{L(locale, s.place_en, s.place_ar) ? ` · ${L(locale, s.place_en, s.place_ar)}` : ""}</span>
              </span>
              <span className="text-ink-2 leading-relaxed">{L(locale, s.what_en, s.what_ar)}</span>
              {s.sources.length > 0 && (
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
                  {s.sources.map((src, k) => (
                    <a key={k} href={src.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink underline-offset-2 hover:underline" dir="auto">
                      <ExternalLink className="size-3" aria-hidden />{src.citation}
                    </a>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <aside className="flex gap-3 rounded-[14px] bg-surface-2 px-4 py-3 text-sm text-ink-2" data-testid="chain-not-claimed">
        <Info className="size-5 shrink-0 text-ink-3" aria-hidden />
        <span><b className="text-ink">{t("chain.notClaimed")}</b> {L(locale, chain.not_claimed_en, chain.not_claimed_ar)}</span>
      </aside>

      {myths.length > 0 && (
        <details className="group rounded-[14px] border border-line px-4 py-2" open={!compact}>
          <summary className="cursor-pointer list-none min-h-11 flex items-center gap-2 text-sm font-semibold text-ink">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90" aria-hidden />
            {t("chain.myths", { n: myths.length })}
          </summary>
          <ul className="flex flex-col gap-3 pb-2" data-testid="chain-myths">
            {myths.map((m, i) => (
              <li key={i} className="flex flex-col gap-1 text-sm">
                <span className="text-ink-3"><s className="decoration-[#c0392b]/60">{L(locale, m.claim_en, m.claim_ar)}</s></span>
                <span className="text-ink-2 leading-relaxed">{L(locale, m.correction_en, m.correction_ar)}</span>
                {m.sources.map((src, k) => (
                  <a key={k} href={src.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink" dir="auto"><ExternalLink className="size-3" aria-hidden />{src.citation}</a>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}

      {compact && href && (
        <Link href={href} className="self-start inline-flex items-center gap-1 min-h-11 text-sm font-semibold text-accent">
          {t("chain.open")}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      )}
    </article>
  );
}
