"use client";
import { useState } from "react";
import Link from "next/link";
import {
  BookA,
  BookOpen,
  ExternalLink,
  Info,
  Landmark,
  Languages,
  Lightbulb,
  MessageCircleHeart,
  ScrollText,
  Scale,
  ShieldCheck,
  Sigma,
  TriangleAlert,
  CircleCheck,
  CircleHelp,
} from "lucide-react";
import { VerseBlock } from "@/components/ui/quran";
import { cn } from "@/components/ui/cn";
import { dirOf } from "@/i18n/core";
import type { AnswerBlock, HadithView, Lang } from "../types";

export type T = (key: string, vars?: Record<string, string | number>) => string;

/** Render text with the honorific ﷺ in a font that has the glyph (UI fonts lack U+FDFA). */
export function Rich({ text }: { text: string }) {
  if (!text.includes("ﷺ")) return <>{text}</>;
  const parts = text.split("ﷺ");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="font-[family-name:var(--font-ms)] text-[1.1em] leading-none">ﷺ</span>}
        </span>
      ))}
    </>
  );
}

const ar = (n: number | string, lang: Lang) => (lang === "ar" ? String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]) : String(n));

/** Small uppercase label above each block — says what kind of text this is (Quran / hadith / explanation …). */
export function BlockLabel({ icon, children, className }: { icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 text-[0.78rem] font-semibold text-ink-3 tracking-wide", className)}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

const NOTICE_ICON: Record<string, React.ReactNode> = {
  warn: <TriangleAlert className="size-5 text-warn" aria-hidden />,
  ok: <CircleCheck className="size-5 text-ok" aria-hidden />,
  violet: <Scale className="size-5 text-violet" aria-hidden />,
  accent: <Info className="size-5 text-accent" aria-hidden />,
  neutral: <Info className="size-5 text-ink-2" aria-hidden />,
};
const NOTICE_BG: Record<string, string> = {
  warn: "bg-warn-soft",
  ok: "bg-ok-soft",
  violet: "bg-violet-soft",
  accent: "bg-accent-soft",
  neutral: "bg-surface-2",
};

export function Notice({ block, t, lang }: { block: Extract<AnswerBlock, { type: "notice" }>; t: T; lang: Lang }) {
  const base = block.kind === "related_card" ? `ask.n.related_card.${block.vars?.related ?? "card"}` : `ask.n.${block.kind}`;
  const vars = { ...block.vars, title: block.vars?.[lang === "ar" ? "title_ar" : "title_en"] ?? "" };
  return (
    <div className={cn("flex gap-3 rounded-[14px] p-3.5", NOTICE_BG[block.tone])} data-notice={block.kind}>
      <span className="shrink-0 mt-0.5">{NOTICE_ICON[block.tone]}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="font-semibold text-ink leading-snug">
          <Rich text={t(`${base}.t`, vars)} />
        </p>
        <p className="text-sm text-ink-2 leading-relaxed">
          <Rich text={t(`${base}.b`, vars)} />
        </p>
      </div>
    </div>
  );
}

export function Explanation({ block, t }: { block: Extract<AnswerBlock, { type: "explanation" }>; t: T }) {
  return (
    <section className="flex flex-col gap-1.5" data-block="explanation">
      <BlockLabel icon={<Lightbulb className="size-3.5" aria-hidden />}>{block.source === "ai" ? t("ask.block.explanationAi") : t("ask.block.explanation")}</BlockLabel>
      <p lang={block.lang} dir={dirOf(block.lang)} className="text-[1.02rem] leading-[1.8] text-ink">
        <Rich text={block.text} />
      </p>
    </section>
  );
}

export function Verses({ block, t, lang, label }: { block: Extract<AnswerBlock, { type: "verses" }>; t: T; lang: Lang; label?: string }) {
  return (
    <section className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface-2/40 p-4" data-block="verses">
      <BlockLabel icon={<BookOpen className="size-3.5" aria-hidden />}>{label ?? (block.role === "primary" ? t("ask.block.verses") : t("ask.block.versesSupporting"))}</BlockLabel>
      <VerseBlock verses={block.verses} locale={lang} showTranslation={lang === "en"} translationLabel={t("quran.translation")} />
    </section>
  );
}

export function gradeLabel(h: HadithView, t: T, lang: Lang) {
  const coll = lang === "ar" ? h.collection_ar : h.collection_en;
  return /^sahih/i.test(h.grade) ? t("ask.hadith.gradeSahih", { collection: coll }) : t("ask.hadith.grade", { grade: h.grade });
}

export function HadithCard({ h, t, lang, full = false }: { h: HadithView; t: T; lang: Lang; full?: boolean }) {
  const [open, setOpen] = useState(full);
  const long = h.text_ar.length > 260;
  return (
    <section className="flex flex-col gap-2.5 rounded-[16px] border border-line p-4" data-block="hadith" data-hadith={h.id}>
      <div className="flex flex-wrap items-center gap-2">
        <BlockLabel icon={<ScrollText className="size-3.5" aria-hidden />}>{t("ask.block.hadith")}</BlockLabel>
        <span className="text-sm font-semibold text-ink">
          <bdi>{lang === "ar" ? h.collection_ar : h.collection_en}</bdi> <span className="mono" dir="ltr">{h.number}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft text-ok px-2.5 py-0.5 text-xs font-medium">
          <ShieldCheck className="size-3.5" aria-hidden />
          {gradeLabel(h, t, lang)}
        </span>
      </div>
      <p lang="ar" dir="rtl" className={cn("text-[1.08rem] leading-[2] text-ink font-[family-name:var(--font-arabic)]", !open && long && "line-clamp-4")}>
        {h.text_ar}
      </p>
      {lang === "en" && h.text_en && (
        <div className="rounded-[12px] bg-surface-2 px-3.5 py-2.5">
          <p lang="en" dir="ltr" className={cn("text-[0.95rem] leading-relaxed text-ink", !open && h.text_en.length > 320 && "line-clamp-4")}>
            <Rich text={h.text_en} />
          </p>
          <p className="mt-1 text-xs text-ink-3">{t("ask.hadith.english")}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">{t("ask.hadith.scheme", { scheme: h.numbering_scheme })}</p>
        {(long || (h.text_en?.length ?? 0) > 320) && !full && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm font-medium text-accent hover:underline underline-offset-4 min-h-11 px-1" aria-expanded={open}>
            {open ? t("ask.hadith.showLess") : t("ask.hadith.showMore")}
          </button>
        )}
      </div>
    </section>
  );
}

export function Tafsir({ block, t, lang }: { block: Extract<AnswerBlock, { type: "tafsir" }>; t: T; lang: Lang }) {
  return (
    <section className="flex flex-col gap-2 rounded-[16px] bg-sand text-sand-ink p-4" data-block="tafsir">
      <BlockLabel className="text-sand-ink/80" icon={<BookA className="size-3.5" aria-hidden />}>
        {t("ask.block.tafsir")}
      </BlockLabel>
      <p lang="ar" dir="rtl" className="ms-text text-[1.15rem] leading-[2]">
        {block.excerpt_ar}
      </p>
      <p className="text-sm">
        <bdi>{lang === "ar" ? block.book_ar : block.book_en}</bdi> · <bdi>{lang === "ar" ? block.author_ar : block.author_en}</bdi> · <span className="mono" dir="ltr">{block.verse_key}</span>
      </p>
    </section>
  );
}

export function Civilizational({ block, t }: { block: Extract<AnswerBlock, { type: "civilizational" }>; t: T }) {
  return (
    <section className="flex flex-col gap-2 rounded-[16px] border border-dashed border-line-strong p-4" data-block="civilizational">
      <BlockLabel icon={<Landmark className="size-3.5" aria-hidden />}>{t("ask.block.civ")}</BlockLabel>
      <p lang={block.lang} dir={dirOf(block.lang)} className="text-[0.97rem] leading-relaxed text-ink">
        {block.text}
      </p>
      {block.sources.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-3">{t("ask.block.civSources")}</span>
          <ul className="flex flex-col gap-1 text-xs text-ink-2 leading-relaxed" dir="ltr" lang="en">
            {block.sources.map((s) => (
              <li key={s.citation}>{s.url ? <a href={s.url} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">{s.citation}</a> : s.citation}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function Disagreement({ block, t }: { block: Extract<AnswerBlock, { type: "disagreement" }>; t: T }) {
  return (
    <section className="flex flex-col gap-2 rounded-[16px] bg-violet-soft p-4" data-block="disagreement">
      <BlockLabel icon={<Scale className="size-3.5" aria-hidden />}>{t("ask.block.disagreement")}</BlockLabel>
      {block.text && (
        <p lang={block.lang} dir={dirOf(block.lang)} className="text-[0.97rem] leading-relaxed text-ink">
          {block.text}
        </p>
      )}
      {block.views.length > 0 && (
        <ol className="flex flex-col gap-2">
          {block.views.map((v, i) => (
            <li key={i} className="rounded-[12px] bg-surface px-3 py-2 text-[0.95rem] leading-relaxed text-ink">
              {v.text} <span className="mono text-xs text-ink-3" dir="ltr">{v.cites.join(" · ")}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Fact({ block, t, lang }: { block: Extract<AnswerBlock, { type: "fact" }>; t: T; lang: Lang }) {
  return (
    <section className="flex items-center gap-4 rounded-[16px] border border-line p-4" data-block="fact">
      <span className="grid place-items-center size-12 rounded-[12px] bg-accent-soft text-accent shrink-0">
        <Sigma className="size-6" aria-hidden />
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <BlockLabel>{t("ask.block.fact")} · {lang === "ar" ? block.label_ar : block.label_en}</BlockLabel>
        <p className="text-lg font-semibold text-ink tabular">{t("ask.fact.value", { tokens: ar(block.tokens, lang), verses: ar(block.verses, lang) })}</p>
        <p className="text-xs text-ink-3">
          {t("ask.fact.rule", { rule: "" })}
          <span className="mono" dir="ltr">{block.rule}</span>
        </p>
      </div>
    </section>
  );
}

export function GlossaryBlock({ block, t, lang }: { block: Extract<AnswerBlock, { type: "glossary" }>; t: T; lang: Lang }) {
  const g = block.term;
  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line p-4" data-block="glossary">
      <BlockLabel icon={<Languages className="size-3.5" aria-hidden />}>{t("ask.block.glossary")}</BlockLabel>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span lang="ar" dir="rtl" className="text-[1.9rem] leading-[1.6] font-semibold text-ink font-[family-name:var(--font-arabic)]">
          {g.term_ar}
        </span>
        <span lang="en" dir="ltr" className="text-lg font-semibold text-accent">
          {g.term_en}
        </span>
      </div>
      <p lang={lang} className="text-[0.98rem] leading-relaxed text-ink">
        {lang === "ar" ? g.meaning_ar || g.rule_ar : g.meaning_en || g.rule_en}
      </p>
      <p className="text-xs text-ink-3">{t("ask.glossary.source", { source: g.source })}</p>
    </section>
  );
}

export function TermLock({ block, t, lang }: { block: Extract<AnswerBlock, { type: "term_lock" }>; t: T; lang: Lang }) {
  return (
    <section className="flex flex-col gap-2 rounded-[16px] bg-warn-soft p-4" data-block="term_lock">
      <BlockLabel className="text-warn" icon={<Languages className="size-3.5" aria-hidden />}>
        {t("ask.block.termlock")}
      </BlockLabel>
      <p className="text-sm font-semibold text-ink">
        {t("ask.termlock.avoidLabel")}{" "}
        <span className="line-through decoration-2 decoration-warn" lang="en" dir="ltr">
          {block.term}
        </span>
      </p>
      <p className="text-[1rem] leading-relaxed text-ink">{lang === "ar" ? block.correction_ar : block.correction_en}</p>
    </section>
  );
}

export function Misquote({ block, t }: { block: Extract<AnswerBlock, { type: "misquote" }>; t: T }) {
  const top = block.candidates[0];
  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line p-4" data-block="misquote">
      <BlockLabel icon={<CircleHelp className="size-3.5" aria-hidden />}>{t("ask.block.misquote")}</BlockLabel>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-bad">{t("ask.misquote.you")}</span>
        <p lang="ar" dir="rtl" className="rounded-[12px] bg-bad-soft px-3.5 py-2.5 text-[1.15rem] leading-[1.9] text-ink font-[family-name:var(--font-arabic)]">
          {block.input}
        </p>
      </div>
      {top && top.differences.length > 0 && (
        // differences use the words as you wrote them and as they appear in the verse
        <ul className="flex flex-col gap-1.5" aria-label={t("ask.block.misquote")}>
          {top.differences.slice(0, 6).map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-ink-2">
              <span className="mt-1.5 size-1.5 rounded-full bg-warn shrink-0" aria-hidden />
              <span>
                {d.op === "replace"
                  ? t("ask.misquote.replace", { given: d.given, quran: d.quran })
                  : d.op === "delete"
                    ? t("ask.misquote.delete", { given: d.given })
                    : t("ask.misquote.insert", { quran: d.quran })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Referral({ block, t }: { block: Extract<AnswerBlock, { type: "referral" }>; t: T }) {
  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-4" data-block="referral">
      <div className="flex gap-3">
        <span className="grid place-items-center size-10 rounded-full bg-accent-soft text-accent shrink-0">
          {block.official ? <Landmark className="size-5" aria-hidden /> : <MessageCircleHeart className="size-5" aria-hidden />}
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold text-ink">{t(`ask.ref.${block.reason}.t`)}</p>
          <p className="text-sm text-ink-2 leading-relaxed">{t(`ask.ref.${block.reason}.b`)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {block.official && (
          <a
            href="https://www.alifta.gov.sa"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 min-h-11 py-2 px-4 rounded-[12px] bg-surface border border-line-strong text-ink text-[0.95rem] font-medium hover:bg-surface-2"
          >
            <ExternalLink className="size-4" aria-hidden />
            <span>{t("ask.ref.official")}</span>
          </a>
        )}
        <Link href="/talk" className="inline-flex items-center gap-2 h-11 px-4 rounded-[12px] bg-accent text-accent-ink text-[0.95rem] font-medium hover:bg-accent-hover">
          <MessageCircleHeart className="size-4" aria-hidden />
          {t("ask.talk")}
        </Link>
      </div>
    </section>
  );
}

export const HELP_TOPICS: Record<string, string> = { meaning: "ask.s.tawhid", verses: "ask.s.moon", practices: "ask.s.fast", misconceptions: "ask.s.kaaba" };

export function HelpTopics({ block, t, onAsk }: { block: Extract<AnswerBlock, { type: "help_topics" }>; t: T; onAsk?: (q: string) => void }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2" data-block="help_topics">
      {block.topics.map((k) => (
        <li key={k}>
          <button
            type="button"
            onClick={() => onAsk?.(t(HELP_TOPICS[k] ?? "ask.s.fast"))}
            className="w-full text-start min-h-11 rounded-[12px] border border-line px-3.5 py-2.5 text-sm text-ink hover:bg-surface-2 transition-colors"
          >
            <span className="block font-medium">{t(`ask.help.${k}`)}</span>
            <span className="block text-ink-3 text-xs mt-0.5">{t(HELP_TOPICS[k] ?? "ask.s.fast")}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CardLink({ block, t, lang }: { block: Extract<AnswerBlock, { type: "card_link" }>; t: T; lang: Lang }) {
  return (
    <Link
      href={`/card/${encodeURIComponent(block.card.id)}`}
      className="group flex items-center gap-3 rounded-[14px] border border-line px-4 py-3 hover:bg-surface-2 transition-colors min-h-11"
      data-block="card_link"
    >
      <span className="grid place-items-center size-9 rounded-full bg-accent-soft text-accent shrink-0">
        <BookOpen className="size-4" aria-hidden />
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-xs text-ink-3">{t("ask.cardLink")}</span>
        <span className="font-medium text-ink truncate">{lang === "ar" ? block.card.title_ar : block.card.title_en}</span>
      </span>
    </Link>
  );
}
