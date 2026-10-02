"use client";
import { useMemo, useState } from "react";
import { BadgeCheck, Eye, Hash, Landmark, Scale, BookMarked, Link2 } from "lucide-react";
import { makeT, messages, dirOf, fmtNumber, type Locale } from "@/i18n";
import { VerseBlock, type VerseView } from "@/components/ui/quran";
import { ConceptImage } from "@/components/ui/concept-image";
import { Badge } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import type { CardContent } from "@/lib/cards/types";
import type { GlossaryTerm } from "@/lib/glossary";
import type { HadithHit, ResolvedDraft, VerseHit } from "./server";
import type { VersionMeta } from "./version";

export interface PreviewProps {
  locale: Locale;
  meta: VersionMeta;
  content: CardContent;
  verses: Map<string, VerseHit>;
  hadith: Map<string, HadithHit>;
  terms: GlossaryTerm[];
  count: ResolvedDraft["count"];
  concept: ResolvedDraft["concept"];
  institution: { name_en: string; name_ar: string; is_demo: boolean } | null;
  related: { id: string; title_en: string; title_ar: string }[];
  demo: boolean;
  published?: boolean;
}

const toView = (v: VerseHit): VerseView => ({
  key: v.key,
  aya: v.aya,
  text_uthmani: v.text_uthmani,
  sura_name_ar: v.sura_name_ar,
  sura_name_en: v.sura_name_en,
  translation: v.translation ? { edition_name: v.edition ?? "", text: v.translation } : null,
});

/** Group consecutive verses of the same sura and role so 10:5–6 renders as one passage, as on the public card. */
function passages(content: CardContent, verses: Map<string, VerseHit>) {
  const out: { role: string; views: VerseView[]; missing: string[] }[] = [];
  for (const ref of content.verses) {
    const v = verses.get(ref.key);
    const last = out[out.length - 1];
    const prev = last?.views[last.views.length - 1];
    if (v && last && last.role === ref.role && prev && prev.key.split(":")[0] === String(v.sura) && prev.aya + 1 === v.aya) last.views.push(toView(v));
    else out.push({ role: ref.role, views: v ? [toView(v)] : [], missing: v ? [] : [ref.key] });
  }
  return out;
}

const paragraphs = (s: string) => s.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);

/**
 * The card exactly as visitors will see it, rendered from unsaved editor state. Quran text and hadith come
 * from the database (resolved by reference); the prose comes from the form. Has its own EN/AR switch.
 */
export function CardPreview(p: PreviewProps) {
  const t = useMemo(() => makeT(messages, p.locale), [p.locale]);
  const L = p.locale;
  const title = (L === "ar" ? p.meta.title_ar || p.meta.title_en : p.meta.title_en || p.meta.title_ar) || t("cards.untitled");
  const exp = (L === "ar" ? p.content.explanation.ar : p.content.explanation.en) || "";
  const civ = p.content.civilizational_note;
  const civText = civ ? (L === "ar" ? civ.ar : civ.en) : "";
  const dis = p.content.disagreement_note;
  const disText = dis ? (L === "ar" ? dis.ar : dis.en) : "";
  const inst = p.institution ? (L === "ar" ? p.institution.name_ar : p.institution.name_en) + (p.demo && p.institution.is_demo ? ` (${t("badge.demo")})` : "") : "";
  const empty = !p.content.verses.length && !exp.trim();

  return (
    <article lang={L} dir={dirOf(L)} className="rounded-[22px] border border-line bg-bg overflow-hidden shadow-card" data-testid="card-preview">
      {p.concept?.image?.startsWith("/") && <ConceptImage src={p.concept.image} alt={L === "ar" ? p.concept.label_ar : p.concept.label_en} className="h-36 w-full" rounded={false} />}
      <div className="p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {p.published ? (
            <Badge tone="ok"><BadgeCheck className="size-3.5" aria-hidden />{t("cards.pv.approvedBy", { institution: inst })}</Badge>
          ) : (
            <Badge tone="warn"><Eye className="size-3.5" aria-hidden />{t("cards.pv.notPublished")}</Badge>
          )}
          <Badge tone="neutral">{t("cards.pv.level", { level: p.meta.level })}</Badge>
          {p.concept && <Badge tone="sand">{L === "ar" ? p.concept.label_ar : p.concept.label_en}</Badge>}
        </div>
        <h3 className="text-2xl font-semibold leading-tight" dir="auto">{title}</h3>

        {empty && <p className="text-sm text-ink-3">{t("cards.pv.empty")}</p>}

        {passages(p.content, p.verses).map((ps, i) =>
          ps.views.length ? (
            <VerseBlock key={i} verses={ps.views} locale={L} size={ps.role === "primary" ? "lg" : "md"} translationLabel={t("quran.translation")} showTranslation={L === "en"} />
          ) : (
            <p key={i} className="text-sm text-ink-3 mono" dir="ltr">{t("cards.pv.verseLoading", { key: ps.missing.join(", ") })}</p>
          ),
        )}

        {exp.trim() && (
          <section className="rounded-[14px] bg-surface border border-line p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3 mb-1.5">{t("cards.pv.explanation")}</h4>
            {paragraphs(exp).map((x, i) => (
              <p key={i} className="text-[0.98rem] leading-relaxed text-ink mt-1 first:mt-0" dir="auto">{x}</p>
            ))}
          </section>
        )}

        {p.count && (
          <section className="flex items-start gap-3 rounded-[14px] bg-accent-soft p-3.5">
            <Hash className="size-5 text-accent mt-0.5 shrink-0" aria-hidden />
            <div className="text-sm">
              <p className="font-medium text-ink">{t("cards.pv.count")}: {t("cards.pv.countLine", { tokens: fmtNumber(p.count.tokens, L), verses: fmtNumber(p.count.verses, L) })}</p>
              <p className="text-ink-2 text-xs mt-0.5">{t("cards.pv.countRule", { rule: p.count.rule })}</p>
            </div>
          </section>
        )}

        {p.content.hadith.length > 0 && (
          <section className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-ink">{t("cards.pv.hadith")}</h4>
            {p.content.hadith.map((ref) => {
              const h = p.hadith.get(ref.id);
              return h ? <HadithView key={ref.id} h={h} L={L} t={t} /> : <p key={ref.id} className="mono text-sm text-ink-3" dir="ltr">{ref.id}</p>;
            })}
          </section>
        )}

        {p.content.tafsir.length > 0 && (
          <section className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-ink">{t("cards.pv.tafsir")}</h4>
            {p.content.tafsir.map((x, i) => (
              <figure key={i} className="rounded-[14px] border border-line bg-surface p-3.5 flex flex-col gap-2">
                <blockquote lang="ar" dir="rtl" className="text-[1.05rem] leading-[2] text-ink">{x.excerpt_ar}</blockquote>
                {L === "en" && x.excerpt_en && (
                  <p className="text-sm text-ink-2"><span className="font-medium">{t("cards.pv.paraphrase")}: </span>{x.excerpt_en}</p>
                )}
                <figcaption className="text-xs text-ink-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <BookMarked className="size-3.5" aria-hidden />
                  <span>{L === "ar" ? `${x.book_ar} — ${x.author_ar}` : `${x.book_en} — ${x.author_en}`}</span>
                  <span className="mono" dir="ltr">{x.verse_key}</span>
                  {x.url && /^https?:\/\//.test(x.url) && <a href={x.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 inline-flex items-center gap-1"><Link2 className="size-3" aria-hidden />{t("cards.pv.sources")}</a>}
                </figcaption>
              </figure>
            ))}
          </section>
        )}

        {disText.trim() && (
          <section className="rounded-[14px] bg-violet-soft p-4">
            <h4 className="text-sm font-semibold text-ink flex items-center gap-2 mb-1"><Scale className="size-4" aria-hidden />{t("cards.pv.disagreement")}</h4>
            {paragraphs(disText).map((x, i) => <p key={i} className="text-sm text-ink leading-relaxed" dir="auto">{x}</p>)}
          </section>
        )}

        {civText?.trim() && (
          <section className="rounded-[14px] bg-sand p-4">
            <h4 className="text-sm font-semibold text-sand-ink flex items-center gap-2 mb-1"><Landmark className="size-4" aria-hidden />{t("cards.pv.civ")}</h4>
            {paragraphs(civText).map((x, i) => <p key={i} className="text-sm text-sand-ink leading-relaxed" dir="auto">{x}</p>)}
            {!!civ?.sources.length && (
              <ul className="mt-2 flex flex-col gap-1 text-xs text-sand-ink/90 list-disc ps-4">
                {civ.sources.map((s, i) => (
                  <li key={i} dir="auto">{s.url && /^https?:\/\//.test(s.url) ? <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{s.citation}</a> : s.citation}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {p.terms.length > 0 && (
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-ink">{t("cards.pv.glossary")}</h4>
            <dl className="flex flex-col gap-2">
              {p.terms.map((g) => (
                <div key={g.id} className="rounded-[12px] bg-surface border border-line px-3 py-2">
                  <dt className="font-medium text-sm"><bdi>{g.term_en}</bdi> · <bdi lang="ar">{g.term_ar}</bdi></dt>
                  <dd className="text-xs text-ink-2 mt-0.5">{L === "ar" ? g.rule_ar : g.rule_en}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {p.related.length > 0 && (
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-ink">{t("cards.pv.related")}</h4>
            <div className="flex flex-wrap gap-2">
              {p.related.map((r) => <Badge key={r.id} tone="accent">{L === "ar" ? r.title_ar : r.title_en}</Badge>)}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

function HadithView({ h, L, t }: { h: HadithHit; L: Locale; t: (k: string, v?: Record<string, string | number>) => string }) {
  const [open, setOpen] = useState(false);
  const coll = L === "ar" ? h.collection_ar : h.collection_en;
  const grade = h.grade.charAt(0).toUpperCase() + h.grade.slice(1);
  return (
    <figure className="rounded-[14px] border border-line bg-surface p-3.5 flex flex-col gap-2">
      <blockquote lang="ar" dir="rtl" className={cn("text-[1.02rem] leading-[2] text-ink", !open && "line-clamp-4")}>{h.text_ar}</blockquote>
      {L === "en" && h.text_en && <p className={cn("text-sm text-ink-2 leading-relaxed", !open && "line-clamp-3")} dir="ltr" lang="en">{h.text_en}</p>}
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="self-start text-xs font-medium text-accent underline underline-offset-2 py-1">
        {open ? t("cards.pv.less") : t("cards.pv.more")}
      </button>
      <figcaption className="text-xs text-ink-3 flex flex-wrap gap-x-3 gap-y-1">
        <span className="font-medium text-ink-2">{coll} <span className="mono" dir="ltr">{h.number}</span></span>
        <span>{t("cards.hadith.grade", { grade: `${grade} (${h.grader})` })}</span>
        <span>{t("cards.hadith.numbering", { scheme: h.numbering_scheme })}</span>
      </figcaption>
    </figure>
  );
}
