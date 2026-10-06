"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, BadgeCheck, BellRing, BookA, BookOpen, ChevronDown, ChevronRight, CircleHelp, FlaskConical, Library, Loader2, MessageCircleQuestion,
  ScrollText, ShieldAlert, ShieldCheck, Sparkles, UserX, UsersRound,
} from "lucide-react";
import { cn } from "@/components/ui/cn";
import { VerseBlock } from "@/components/ui/quran";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { fmtDate } from "@/i18n/core";
import { getDeviceToken } from "@/features/beneficiary/device";
import { conceptHref } from "@/features/beneficiary/labels";
import type { DiscoverStage, DiscoveryBook, DiscoveryHadith, DiscoveryResult, DiscoveryVerse } from "../types";

type Input = {
  label_en: string;
  label_ar: string;
  category: string | null;
  search_terms_en: string[];
  search_terms_ar: string[];
  sensitive: boolean;
  source: "snap" | "search";
};

const STAGES: DiscoverStage[] = ["search", "check", "verify", "compose"];

export function DiscoverScreen({ input }: { input: Input }) {
  const { t, locale } = useI18n();
  const [stage, setStage] = useState<DiscoverStage | null>("search");
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setResult(null);
    setStage("search");
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ ...input, category: input.category || undefined, search_terms_en: input.search_terms_en.length ? input.search_terms_en : undefined, search_terms_ar: input.search_terms_ar.length ? input.search_terms_ar : undefined }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? t("discover.error"));
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "stage") setStage(msg.stage);
          else if (msg.type === "result") setResult(msg.data);
          else if (msg.type === "error") throw new Error(msg.error?.message ?? t("discover.error"));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("discover.error"));
    } finally {
      setStage(null);
    }
  }, [input, t]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    run();
  }, [run]);

  const label = result ? (locale === "ar" ? result.label_ar || result.label_en : result.label_en || result.label_ar) : locale === "ar" ? input.label_ar || input.label_en : input.label_en || input.label_ar;

  return (
    <div className="flex flex-col gap-6 pb-12" data-testid="discover">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink-3">{t("discover.title")}</p>
        <h1 className="text-[2rem] leading-tight font-semibold text-ink first-letter:uppercase" data-testid="discover-label">{label}</h1>
        {result && <TierBadge result={result} />}
      </header>

      {stage && !result && <Progress stage={stage} />}
      {error && (
        <div className="rounded-[18px] border border-line bg-surface p-5 flex flex-col gap-3" role="alert">
          <p className="font-medium text-ink inline-flex items-center gap-2"><AlertTriangle className="size-5 text-warn" aria-hidden />{error}</p>
          <button type="button" onClick={run} className="self-start h-11 px-4 rounded-[12px] border border-line-strong font-medium hover:bg-surface-2">{t("discover.retry")}</button>
        </div>
      )}
      {result && <Result result={result} label={label} />}
    </div>
  );
}

function TierBadge({ result }: { result: DiscoveryResult }) {
  const { t } = useI18n();
  if (result.status === "sensitive")
    return <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-warn-soft text-warn px-3 py-1 text-sm font-medium" data-tier="sensitive"><ShieldAlert className="size-4" aria-hidden />{t("discover.tier.sensitive")}</span>;
  if (result.tier === "sources")
    return (
      <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#fdf3d6] text-[#7a5600] dark:bg-[#3a2f12] dark:text-[#f3d27a] px-3 py-1 text-sm font-medium" data-tier="sources">
        <ShieldCheck className="size-4" aria-hidden />{t("discover.tier.sources")}
      </span>
    );
  return <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-surface-2 text-ink-2 px-3 py-1 text-sm font-medium" data-tier="none"><CircleHelp className="size-4" aria-hidden />{t("discover.tier.none")}</span>;
}

function Progress({ stage }: { stage: DiscoverStage }) {
  const { t } = useI18n();
  const idx = Math.max(0, STAGES.indexOf(stage));
  return (
    <div className="rounded-[20px] border border-line bg-surface p-5 flex flex-col gap-3" role="status" aria-live="polite" data-testid="discover-progress">
      {STAGES.map((s, i) => (
        <div key={s} className={cn("flex items-center gap-3 text-sm", i > idx ? "text-ink-3" : "text-ink")}>
          {i < idx ? <BadgeCheck className="size-5 text-ok" aria-hidden /> : i === idx ? <Loader2 className="size-5 animate-spin text-accent" aria-hidden /> : <span className="size-5 rounded-full border border-line-strong" aria-hidden />}
          {t(`discover.stage.${s}`)}
        </div>
      ))}
    </div>
  );
}

function Result({ result, label }: { result: DiscoveryResult; label: string }) {
  const { t, locale } = useI18n();
  const lang = locale;

  if (result.category === "person")
    return (
      <Panel tone="neutral" icon={<UserX className="size-5" aria-hidden />} title={t("discover.person")}>
        <p>{t("discover.personBody")}</p>
        <Actions result={result} label={label} />
      </Panel>
    );

  return (
    <div className="flex flex-col gap-6">
      {result.card && (
        <Link href={result.card.concept_id ? conceptHref(result.card.concept_id) : `/card/${encodeURIComponent(result.card.id)}`} className="flex items-center gap-3 rounded-[18px] bg-ok-soft px-4 py-3 text-ink hover:brightness-95" data-testid="discover-card">
          <BadgeCheck className="size-6 text-ok shrink-0" aria-hidden />
          <span className="flex-1 flex flex-col">
            <span className="font-semibold">{t("discover.card")}</span>
            <span className="text-sm text-ink-2">{locale === "ar" ? result.card.title_ar : result.card.title_en}</span>
          </span>
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
        </Link>
      )}

      {result.tier === "sources" && <p className="text-sm text-ink-2 leading-relaxed">{t("discover.tier.sourcesBody")}</p>}
      {!result.ai && result.tier === "sources" && <p className="text-sm text-ink-3">{t("discover.withoutAi")}</p>}
      {result.status === "sensitive" && <Panel tone="warn" icon={<ShieldAlert className="size-5" aria-hidden />} title={t("discover.tier.sensitive")}><p>{t("discover.sensitiveBody")}</p></Panel>}

      {result.tier === "none" ? (
        <Panel tone="neutral" icon={<CircleHelp className="size-5" aria-hidden />} title={t("discover.empty", { label })}>
          <p>{t("discover.emptyBody")}</p>
        </Panel>
      ) : (
        result.no_direct_mention && <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-sm text-ink-2" data-testid="no-direct">{t("discover.noDirect", { label })}</p>
      )}

      {result.summary && (
        <section className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-4" data-testid="discover-summary">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-3 inline-flex items-center gap-1.5"><Sparkles className="size-3.5" aria-hidden />{t("discover.summary")}</h2>
          <p className="leading-relaxed text-ink" dir={lang === "ar" ? "rtl" : "ltr"}><Cited text={lang === "ar" ? result.summary.ar : result.summary.en} /></p>
          <p className="text-xs text-ink-3">{t("discover.summaryNote")}</p>
        </section>
      )}

      {result.verses.length > 0 && (
        <Section title={t("discover.quran")} icon={<BookOpen className="size-4" aria-hidden />} testid="discover-quran">
          {result.verses.map((v) => <VerseItem key={v.id} v={v} />)}
        </Section>
      )}

      {result.hadith.length > 0 && (
        <Section title={t("discover.sunnah")} icon={<ScrollText className="size-4" aria-hidden />} testid="discover-sunnah">
          {result.hadith.map((h) => <HadithItem key={h.id} h={h} />)}
        </Section>
      )}

      {result.books.length > 0 && (
        <Section title={t("discover.library")} icon={<Library className="size-4" aria-hidden />} testid="discover-library">
          {result.books.map((b) => <BookItem key={b.id} b={b} />)}
        </Section>
      )}

      {result.science.length > 0 && (
        <Section title={t("discover.science")} icon={<FlaskConical className="size-4" aria-hidden />} testid="discover-science">
          <ul className="grid gap-2 sm:grid-cols-2">
            {result.science.map((s) => (
              <li key={`${s.kind}:${s.id}`}>
                <Link href={s.href} className="flex h-full flex-col gap-1 rounded-[16px] border border-line bg-surface p-4 hover:border-line-strong">
                  <span className="font-semibold text-ink">{locale === "ar" ? s.name_ar : s.name_en}</span>
                  <span className="text-sm text-ink-2">{locale === "ar" ? s.note.ar : s.note.en}</span>
                  <span className="mt-auto pt-1 text-sm font-medium text-accent inline-flex items-center gap-1">{t("action.learnMore")}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Actions result={result} label={label} />
      <HowChecked result={result} />
    </div>
  );
}

/** Summary text with [Q:6:99]-style citations rendered as small jump links. */
function Cited({ text }: { text: string }) {
  const parts = text.split(/(\[[QHLB]:[^\]]+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\[([QHLB]:[^\]]+)\]$/.exec(p);
        if (!m) return <span key={i}>{p}</span>;
        const id = m[1];
        const short = id.startsWith("Q:") ? id.slice(2) : id.split(":").slice(-1)[0];
        return (
          <a key={i} href={`#${cssId(id)}`} className="mx-0.5 inline-flex items-center rounded-full bg-surface-2 px-1.5 text-[0.75rem] font-medium text-ink-2 hover:bg-surface-3 align-[1px]" dir="ltr">
            {short}
          </a>
        );
      })}
    </>
  );
}

const cssId = (id: string) => `src-${id.replace(/[^a-zA-Z0-9]+/g, "-")}`;

function RelationChip({ relation, reason }: { relation: "direct" | "thematic"; reason: string }) {
  const { t } = useI18n();
  return (
    <p className="flex items-start gap-2 text-sm text-ink-2">
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", relation === "direct" ? "bg-accent-soft text-ink" : "bg-surface-2 text-ink-2")}>{t(`discover.relation.${relation}`)}</span>
      <span>{reason}</span>
    </p>
  );
}

function VerseItem({ v }: { v: DiscoveryVerse }) {
  const { t, locale } = useI18n();
  const [more, setMore] = useState<null | "loading" | { book_id: string; title_en: string; title_ar: string; range: string; text: string }[]>(null);
  const loadMore = async () => {
    if (Array.isArray(more)) return setMore(null);
    setMore("loading");
    const r = await fetch(`/api/library/tafsir?verse=${encodeURIComponent(v.verse.key)}&max=1200`).then((x) => x.json()).catch(() => null);
    setMore(r?.ok ? (r.data as { book_id: string; title_en: string; title_ar: string; range: string; text: string }[]).filter((x) => x.book_id !== v.tafsir?.book_id) : []);
  };
  return (
    <article id={cssId(v.id)} className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface-2/40 p-4 scroll-mt-20" data-verse={v.verse.key}>
      <RelationChip relation={v.relation} reason={locale === "ar" ? v.reason.ar : v.reason.en} />
      <VerseBlock verses={[v.verse]} locale={locale} showTranslation={locale === "en"} translationLabel={t("quran.translation")} />
      {v.tafsir && (
        <details className="group rounded-[14px] bg-sand text-sand-ink">
          <summary className="cursor-pointer list-none flex items-center gap-2 px-4 py-3 min-h-11 text-sm font-semibold">
            <BookA className="size-4" aria-hidden />
            {t("discover.tafsir")} · <bdi>{locale === "ar" ? v.tafsir.title_ar : v.tafsir.title_en}</bdi>
            <ChevronDown className="ms-auto size-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="px-4 pb-4 flex flex-col gap-3">
            <p lang="ar" dir="rtl" className="ms-text text-[1.08rem] leading-[2]">{v.tafsir.text}</p>
            <p className="text-xs"><bdi>{locale === "ar" ? v.tafsir.author_ar : v.tafsir.author_en}</bdi> · <span className="mono" dir="ltr">{v.tafsir.range}</span></p>
            <button type="button" onClick={loadMore} className="self-start text-sm font-semibold underline underline-offset-4 min-h-11" aria-expanded={Array.isArray(more)}>
              {more === "loading" ? t("discover.tafsirLoading") : Array.isArray(more) ? t("discover.tafsirLess") : t("discover.tafsirMore")}
            </button>
            {Array.isArray(more) &&
              more.map((m) => (
                <div key={m.book_id} className="border-t border-sand-ink/15 pt-3 flex flex-col gap-1">
                  <p className="text-sm font-semibold"><bdi>{locale === "ar" ? m.title_ar : m.title_en}</bdi> <span className="mono text-xs" dir="ltr">{m.range}</span></p>
                  <p dir="auto" className="leading-[1.9] text-[0.98rem]">{m.text}</p>
                </div>
              ))}
          </div>
        </details>
      )}
    </article>
  );
}

function HadithItem({ h }: { h: DiscoveryHadith }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const coll = locale === "ar" ? h.collection_ar : h.collection_en;
  const sahihayn = h.id.startsWith("H:");
  return (
    <article id={cssId(h.id)} className="flex flex-col gap-2.5 rounded-[18px] border border-line p-4 scroll-mt-20" data-hadith={h.id}>
      <RelationChip relation={h.relation} reason={locale === "ar" ? h.reason.ar : h.reason.en} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink"><bdi>{coll}</bdi> <span className="mono" dir="ltr">{h.number}</span></span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", "bg-ok-soft text-ok")}>
          <ShieldCheck className="size-3.5" aria-hidden />
          {sahihayn ? t("discover.gradeSahih", { collection: coll }) : t("discover.grade", { grade: locale === "ar" ? h.grade_ar : h.grade, grader: h.grader })}
        </span>
      </div>
      <p lang="ar" dir="rtl" className={cn("text-[1.05rem] leading-[2] text-ink font-[family-name:var(--font-arabic)]", !open && h.text_ar.length > 260 && "line-clamp-4")}>{h.text_ar}</p>
      {locale === "en" && h.text_en && <p lang="en" dir="ltr" className={cn("rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-[0.95rem] leading-relaxed text-ink", !open && h.text_en.length > 320 && "line-clamp-4")}>{h.text_en}</p>}
      {(h.text_ar.length > 260 || (h.text_en?.length ?? 0) > 320) && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="self-end text-sm font-medium text-accent min-h-11 px-1" aria-expanded={open}>
          {open ? t("ask.hadith.showLess") : t("ask.hadith.showMore")}
        </button>
      )}
    </article>
  );
}

function BookItem({ b }: { b: DiscoveryBook }) {
  const { t, locale } = useI18n();
  return (
    <article id={cssId(b.id)} className="flex flex-col gap-2 rounded-[18px] border border-line p-4 scroll-mt-20">
      <RelationChip relation={b.relation} reason={locale === "ar" ? b.reason.ar : b.reason.en} />
      <p dir="auto" className="leading-[1.9] text-ink">{b.text.length > 900 ? b.text.slice(0, 900) + " …" : b.text}</p>
      <p className="text-xs text-ink-3">
        <bdi>{locale === "ar" ? b.title_ar || b.title_en : b.title_en || b.title_ar}</bdi>
        {b.page != null && <> · {t("discover.page", { n: b.page })}</>}
        {b.machine_read && <> · {t("discover.machineRead")}</>}
      </p>
    </article>
  );
}

function Section({ title, icon, children, testid }: { title: string; icon: React.ReactNode; children: React.ReactNode; testid: string }) {
  return (
    <section className="flex flex-col gap-3" data-testid={testid}>
      <h2 className="text-lg font-semibold text-ink inline-flex items-center gap-2"><span className="size-8 rounded-full bg-accent-soft text-accent grid place-items-center">{icon}</span>{title}</h2>
      {children}
    </section>
  );
}

function Panel({ tone, icon, title, children }: { tone: "neutral" | "warn"; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className={cn("flex flex-col gap-2 rounded-[18px] p-5", tone === "warn" ? "bg-warn-soft" : "bg-surface border border-line")} data-testid="discover-panel">
      <h2 className="font-semibold text-ink inline-flex items-start gap-2">{icon}<span>{title}</span></h2>
      <div className="text-ink-2 text-[0.95rem] leading-relaxed flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Actions({ result, label }: { result: DiscoveryResult; label: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const notify = async () => {
    const token = getDeviceToken(true);
    if (!token) return;
    const r = await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: `${result.label_en || result.label_ar} · ${result.label_ar || result.label_en}`.slice(0, 280), device_token: token }) }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setSent(true);
      toast({ tone: "ok", text: t("discover.notified") });
    }
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-testid="discover-actions">
      {result.category !== "person" && !result.card && (
        <button type="button" onClick={notify} disabled={sent} className="h-12 px-5 rounded-[14px] bg-accent text-accent-ink font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
          <BellRing className="size-5" aria-hidden />{sent ? t("discover.notified") : t("discover.notify")}
        </button>
      )}
      {result.category !== "person" && (
        <Link href={`/ask?q=${encodeURIComponent(label)}`} className="h-12 px-5 rounded-[14px] border border-line-strong font-medium inline-flex items-center justify-center gap-2 hover:bg-surface-2">
          <MessageCircleQuestion className="size-5" aria-hidden />{t("discover.ask")}
        </Link>
      )}
      <Link href="/talk" className="h-12 px-5 rounded-[14px] border border-line-strong font-medium inline-flex items-center justify-center gap-2 hover:bg-surface-2">
        <UsersRound className="size-5" aria-hidden />{t("discover.talk")}
      </Link>
    </div>
  );
}

function HowChecked({ result }: { result: DiscoveryResult }) {
  const { t, locale } = useI18n();
  const shown = result.checks.filter((c) => c.id !== "timing");
  return (
    <details className="rounded-[16px] border border-line bg-surface px-4 py-3 text-sm" data-testid="discover-how">
      <summary className="cursor-pointer min-h-11 flex items-center gap-2 font-medium text-ink"><ShieldCheck className="size-4 text-accent" aria-hidden />{t("discover.how")}</summary>
      <div className="flex flex-col gap-2 pt-2 text-ink-2">
        <p>{t("discover.howBody")}</p>
        <ul className="flex flex-col gap-1">
          {shown.map((c, i) => (
            <li key={`${c.id}-${i}`} className="flex gap-2"><span className="mono text-ink-3 w-24 shrink-0" dir="ltr">{c.id}</span><span>{t(`discover.check.${c.status}`)}{c.detail && c.status !== "fail" ? ` · ${c.detail}` : ""}</span></li>
          ))}
        </ul>
        {result.cached && <p className="text-ink-3">{t("discover.cached", { date: fmtDate(result.generated_at, locale) })}</p>}
      </div>
    </details>
  );
}
