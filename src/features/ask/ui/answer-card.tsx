"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, BookA, BookOpen, Database, Info, Languages, MessageCircleHeart, ScrollText, ShieldCheck, Sigma, Sparkles, Send, Check } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { dirOf, makeT, messages } from "@/i18n";
import type { AnswerBlock, AskResult, EvidenceChip } from "../types";
import {
  CardLink,
  Civilizational,
  Disagreement,
  Explanation,
  Fact,
  GlossaryBlock,
  HadithCard,
  HelpTopics,
  Misquote,
  Notice,
  Referral,
  Tafsir,
  TermLock,
  Verses,
  Rich,
  type T,
} from "./blocks";
import { WhySheet } from "./why-sheet";
import { EvidenceSheet } from "./evidence-sheet";
import { getDeviceToken } from "./device";

const CHIP_ICON: Record<EvidenceChip["kind"], React.ComponentType<{ className?: string }>> = {
  quran: BookOpen,
  hadith: ScrollText,
  card: BadgeCheck,
  glossary: Languages,
  fact: Sigma,
  tafsir: BookA,
};

export function AnswerBadge({ r, t }: { r: AskResult; t: T }) {
  const b = r.badge;
  const demo = b.kind === "approved" && b.is_demo ? ` ${t("ask.badge.demoSuffix")}` : "";
  const map = {
    approved: { icon: BadgeCheck, cls: "bg-ok-soft text-ok", text: b.kind === "approved" ? t("badge.approved", { institution: r.lang === "ar" ? b.institution_ar : b.institution_en }) + demo : "" },
    ai: { icon: Sparkles, cls: "bg-violet-soft text-ink", text: t("badge.ai") },
    glossary: { icon: Languages, cls: "bg-accent-soft text-ink", text: t("ask.badge.glossary") },
    safety: { icon: ShieldCheck, cls: "bg-surface-2 text-ink-2", text: t("ask.badge.safety") },
    sources: { icon: Database, cls: "bg-accent-soft text-ink", text: t("ask.badge.sources") },
  }[b.kind];
  const Icon = map.icon;
  return (
    <span className={cn("inline-flex self-start items-start gap-1.5 rounded-[10px] px-2.5 py-1 text-xs font-medium leading-5", map.cls)} data-badge={b.kind}>
      <Icon className="size-3.5 mt-[3px] shrink-0" aria-hidden />
      <span>{map.text}</span>
    </span>
  );
}

function Block({ b, r, t, onAsk, versesLabel }: { b: AnswerBlock; r: AskResult; t: T; onAsk?: (q: string) => void; versesLabel?: string }) {
  switch (b.type) {
    case "notice":
      return <Notice block={b} t={t} lang={r.lang} />;
    case "explanation":
      return <Explanation block={b} t={t} />;
    case "verses":
      return <Verses block={b} t={t} lang={r.lang} label={versesLabel} />;
    case "hadith":
      return <HadithCard h={b.hadith} t={t} lang={r.lang} />;
    case "tafsir":
      return <Tafsir block={b} t={t} lang={r.lang} />;
    case "civilizational":
      return <Civilizational block={b} t={t} />;
    case "disagreement":
      return <Disagreement block={b} t={t} />;
    case "fact":
      return <Fact block={b} t={t} lang={r.lang} />;
    case "glossary":
      return <GlossaryBlock block={b} t={t} lang={r.lang} />;
    case "term_lock":
      return <TermLock block={b} t={t} lang={r.lang} />;
    case "misquote":
      return <Misquote block={b} t={t} />;
    case "referral":
      return <Referral block={b} t={t} />;
    case "help_topics":
      return <HelpTopics block={b} t={t} onAsk={onAsk} />;
    case "card_link":
      return <CardLink block={b} t={t} lang={r.lang} />;
  }
}

/** One answer, rendered in the answer's own language (an Arabic question gets an Arabic, RTL answer). */
export function AnswerCard({ r, onAsk }: { r: AskResult; onAsk?: (q: string) => void }) {
  const t = useMemo(() => makeT(messages, r.lang), [r.lang]);
  const [why, setWhy] = useState(false);
  const [evidence, setEvidence] = useState<string | null>(null);
  const [req, setReq] = useState<"idle" | "busy" | "done" | "error">("idle");
  const hasReferral = r.blocks.some((b) => b.type === "referral");
  let verseIdx = 0;
  // "Request this topic" sits right under the first notice (e.g. "No verified reference yet").
  const requestAfter = r.canRequestTopic ? Math.max(0, r.blocks.findIndex((b) => b.type === "notice")) : -1;

  const requestTopic = async () => {
    setReq("busy");
    try {
      const res = await fetch("/api/ask/request-topic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: r.question, deviceToken: getDeviceToken() }),
      });
      setReq(res.ok ? "done" : "error");
    } catch {
      setReq("error");
    }
  };

  const requestButton = (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={requestTopic}
            disabled={req === "busy" || req === "done"}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-[12px] bg-accent-soft text-ink font-medium text-[0.95rem] hover:brightness-95 disabled:opacity-70"
          >
            {req === "done" ? <Check className="size-4 text-ok" aria-hidden /> : <Send className="size-4" aria-hidden />}
            {req === "done" ? t("ask.requested") : t("ask.requestTopic")}
          </button>
          {req === "error" && <span role="alert" className="text-sm text-bad">{t("ask.requestFailed")}</span>}
        </div>
  );

  return (
    <article lang={r.lang} dir={dirOf(r.lang)} className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-4 sm:p-5 shadow-card animate-rise" data-route={r.route} data-level={r.level} aria-label={t("ask.assistant")}>
      <header className="flex flex-col gap-2">
        <AnswerBadge r={r} t={t} />
        {r.title && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-ink-3">{r.related ? t("ask.answer.relatedFor") : t("ask.answer.approvedFor")}</span>
            <h3 className="text-[1.12rem] font-semibold text-ink leading-snug">
              <Rich text={r.lang === "ar" ? r.title.ar : r.title.en} />
            </h3>
            {r.related && <span className="text-xs text-ink-3">{t("ask.answer.relatedNote")}</span>}
          </div>
        )}
      </header>

      <div className="flex flex-col gap-3.5">
        {r.blocks.map((b, i) => {
          let label: string | undefined;
          if (b.type === "verses" && r.route === "misquote") label = verseIdx++ === 0 ? t("ask.misquote.quran") : t("ask.misquote.alt");
          return (
            <Fragment key={i}>
              <Block b={b} r={r} t={t} onAsk={onAsk} versesLabel={label} />
              {i === requestAfter && requestButton}
            </Fragment>
          );
        })}
      </div>

      {r.evidence.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-ink-3">{t("ask.evidence")}</span>
          <ul className="flex flex-wrap gap-2">
            {r.evidence.map((e) => {
              const Icon = CHIP_ICON[e.kind];
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setEvidence(e.id)}
                    className="inline-flex items-center gap-1.5 h-9 min-h-9 px-3 rounded-full border border-line bg-surface-2/60 text-sm text-ink hover:border-line-strong"
                    data-evidence={e.id}
                  >
                    <Icon className="size-3.5 text-accent" aria-hidden />
                    <bdi>{r.lang === "ar" ? e.label_ar : e.label_en}</bdi>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-x-1 gap-y-1 border-t border-line pt-2 -mx-1">
        <button type="button" onClick={() => setWhy(true)} className="inline-flex items-center gap-1.5 h-11 px-2 rounded-[12px] text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
          <Info className="size-4" aria-hidden />
          {t("ask.why")}
        </button>
        {!hasReferral && (
          <Link href="/talk" className="inline-flex items-center gap-1.5 h-11 px-2 rounded-[12px] text-sm font-medium text-accent hover:bg-accent-soft">
            <MessageCircleHeart className="size-4" aria-hidden />
            {t("ask.talk")}
          </Link>
        )}
      </footer>

      <WhySheet open={why} onClose={() => setWhy(false)} r={r} t={t} />
      <EvidenceSheet focus={evidence} onClose={() => setEvidence(null)} r={r} t={t} />
    </article>
  );
}
