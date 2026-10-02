import Link from "next/link";
import { BadgeCheck, BookOpen, Info, Landmark, MessageCircleQuestion, ScrollText, Sparkles, Users, Quote, ChevronRight } from "lucide-react";
import { VerseBlock } from "@/components/ui/quran";
import { ConceptImage } from "@/components/ui/concept-image";
import { Khatam } from "@/components/ui/khatam";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { getI18n } from "@/i18n/server";
import { fmtDate, fmtNumber, pick, type Locale } from "@/i18n/core";
import { env } from "@/lib/env";
import { COLLECTION_NAMES } from "@/lib/hadith";
import type { ResolvedCard } from "@/lib/cards/resolve";
import { conceptImage, lemmasFor, publishedTitles } from "./data";
import { cardHref, conceptHue } from "./labels";
import { CardActions, Expandable, GlossaryChips, JustApproved, ProvenanceButton, type ProvenanceView } from "./card-islands";

type T = (key: string, vars?: Record<string, string | number>) => string;

const SECTION_LABEL = "text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-ink-3";
const arStyle = { fontFamily: "var(--font-arabic)" } as const;

/** "sahih" + bukhari → "Sahih — in Sahih al-Bukhari" (EN) / «صحيح — في صحيح البخاري» (AR). */
export function gradeLabel(grade: string, collection: "bukhari" | "muslim", locale: Locale, t: T) {
  const g = grade.toLowerCase();
  const word = g.startsWith("sahih") ? t("beneficiary.hadith.sahih") : g.startsWith("hasan") ? t("beneficiary.hadith.hasan") : grade;
  return t("beneficiary.hadith.gradeIn", { grade: word, collection: COLLECTION_NAMES[collection][locale] });
}

/** Human label for a hadith numbering scheme (translated when known). */
function schemeLabel(scheme: string, t: T) {
  if (/^bukhari/i.test(scheme)) return t("beneficiary.hadith.scheme.bukhari");
  if (/^muslim/i.test(scheme)) return t("beneficiary.hadith.scheme.muslim");
  return scheme;
}

/** First http(s) URL in a free-text source field, if any. */
const firstUrl = (s?: string | null) => (s ? /(https?:\/\/[^\s)]+)/.exec(s)?.[1] ?? null : null);

function buildProvenance(r: ResolvedCard, locale: Locale, t: T, demo: boolean): ProvenanceView {
  const decisionTitle: Record<string, string> = {
    submit: t("beneficiary.trust.stage.submit"),
    approve: t("beneficiary.trust.stage.approve"),
    publish: t("beneficiary.trust.stage.publish"),
    return: t("beneficiary.trust.stage.return"),
    archive: t("beneficiary.trust.stage.archive"),
  };
  const roleName = (role: string | null) => (role ? t(`beneficiary.role.${role}`) : null);
  const stages: ProvenanceView["stages"] = [
    {
      key: "draft",
      title: t("beneficiary.trust.stage.draft"),
      who: null,
      role: null,
      institution: null,
      demo: false,
      date: null,
      note: null,
      desc: t("beneficiary.trust.stage.draftNote"),
      done: true,
    },
    ...r.provenance.map((p) => ({
      key: p.decision,
      title: decisionTitle[p.decision] ?? p.decision,
      who: (locale === "ar" ? p.reviewer_name_ar : p.reviewer_name_en) ?? null,
      role: roleName(p.reviewer_role),
      institution: (locale === "ar" ? p.institution_ar : p.institution_en) ?? null,
      demo: demo && !!p.is_demo,
      date: p.at ? fmtDate(p.at, locale, { dateStyle: "medium" }) : null,
      note: p.note,
      done: true,
    })),
  ];
  const checks: string[] = [];
  if (r.verses.length) checks.push(t("beneficiary.trust.check.quran", { n: fmtNumber(r.verses.length, locale) }));
  const edition = r.verses.find((v) => v.translation)?.translation?.edition_name;
  if (edition) checks.push(t("beneficiary.trust.check.translation", { edition }));
  if (r.hadith.length) checks.push(t("beneficiary.trust.check.hadith", { n: fmtNumber(r.hadith.length, locale) }));
  if (r.content.tafsir.length) checks.push(t("beneficiary.trust.check.tafsir"));
  if (r.count) checks.push(t("beneficiary.trust.check.count"));
  if (r.content.civilizational_note?.sources?.length) checks.push(t("beneficiary.trust.check.sources"));
  const approver = r.provenance.find((p) => p.decision === "approve");
  const publisher = [...r.provenance].reverse().find((p) => p.decision === "publish");
  if (approver && publisher && approver.reviewer_name_en !== publisher.reviewer_name_en) checks.push(t("beneficiary.trust.check.fourEyes"));
  return {
    stages,
    checks,
    footer: t("beneficiary.trust.footer", { version: fmtNumber(r.version, locale), level: r.card.level, levelText: t(`beneficiary.level.${r.card.level}`) }),
  };
}

/**
 * The approved card, rendered for visitors. Server component; reusable by other features
 * (answers, heritage items). Pass a ResolvedCard from `resolveCard(id, 'published')`.
 */
export async function CardView({ resolved, justApproved = false, showAsk = true }: { resolved: ResolvedCard; justApproved?: boolean; showAsk?: boolean }) {
  const { t, locale } = await getI18n();
  const r = resolved;
  const { card, content } = r;
  const demo = env.demoMode;
  const title = pick(card as unknown as Record<string, unknown>, "title", locale);
  const altTitle = locale === "en" ? card.title_ar : null;
  const inst = r.institution ? (locale === "ar" ? r.institution.name_ar : r.institution.name_en) : null;
  const instDemo = demo && !!r.institution?.is_demo;
  const approvedLine = inst ? t("badge.approved", { institution: inst }) + (instDemo ? ` (${t("badge.demo")})` : "") : null;

  const [concept, lemmas, related] = await Promise.all([conceptImage(card.concept_id), r.count ? lemmasFor(card.concept_id) : Promise.resolve([]), publishedTitles(content.related_cards.filter((x) => x !== card.id))]);
  const image = content.image?.src ?? concept?.image ?? null;
  const hue = conceptHue(card.concept_id ?? card.id, concept?.track ?? "art");

  const roleOf = new Map(content.verses.map((v) => [v.key, v.role]));
  const primary = r.verses.filter((v) => roleOf.get(v.key) !== "supporting");
  const supporting = r.verses.filter((v) => roleOf.get(v.key) === "supporting");
  const lead = primary.length ? primary : r.verses.slice(0, 1);
  const rest = primary.length ? supporting : r.verses.slice(1);
  const showTranslation = locale === "en";

  const explanation = content.explanation[locale] || content.explanation[locale === "ar" ? "en" : "ar"];
  const civ = content.civilizational_note;
  const civText = civ ? civ[locale] || civ[locale === "ar" ? "en" : "ar"] : "";
  const disagreement = content.disagreement_note ? content.disagreement_note[locale] || content.disagreement_note.en : "";
  const lemma = lemmas.length === 1 && /^[a-z]+$/.test(lemmas[0]) ? lemmas[0] : null;

  const provenance = buildProvenance(r, locale, t, demo);
  const path = cardHref(card);
  const shareVerse = lead[0]
    ? {
        text: lead[0].text_uthmani,
        key: lead[0].key,
        surah: locale === "ar" ? `سورة ${lead[0].sura_name_ar}` : `Surah ${lead[0].sura_name_en}`,
        translation: lead[0].translation?.text ?? null,
        edition: lead[0].translation?.edition_name ?? null,
      }
    : null;

  return (
    <article className="flex flex-col gap-6 pb-10" aria-labelledby="card-title">
      {justApproved && approvedLine && inst && <JustApproved text={t("beneficiary.card.justApproved", { institution: inst })} />}

      {demo && (
        <p className="flex items-start gap-2 rounded-[12px] bg-warn-soft px-3.5 py-2.5 text-sm text-ink">
          <Info className="size-4 text-warn shrink-0 mt-[3px]" aria-hidden />
          <span>{t("demo.banner")}</span>
        </p>
      )}

      {/* Header */}
      <header className="flex flex-col gap-4">
        <div className="relative">
          <ConceptImage src={image} alt="" hue={hue} className="aspect-[16/9] sm:aspect-[21/9] w-full rounded-[22px]" />
          <div className="pointer-events-none absolute inset-0 rounded-[22px] bg-gradient-to-t from-[rgb(8_10_30/0.55)] via-transparent to-transparent" aria-hidden />
          {approvedLine && (
            <span className="absolute bottom-3 start-3 end-3 sm:end-auto inline-flex items-center gap-1.5 rounded-full bg-[rgb(8_10_30/0.72)] backdrop-blur px-3 py-1.5 text-[0.8rem] font-medium text-white w-fit max-w-[calc(100%-1.5rem)]">
              <BadgeCheck className="size-4 text-[#36dcb8] shrink-0" aria-hidden />
              <span className="truncate">{approvedLine}</span>
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h1 id="card-title" className="text-[2rem] leading-tight font-semibold text-ink">{title}</h1>
          {altTitle && altTitle !== title && (
            <p lang="ar" dir="rtl" className="text-lg text-ink-3 text-start self-start" style={arStyle}>
              <bdi>{altTitle}</bdi>
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ProvenanceButton data={provenance} variant="tile" />
          <CardActions
            path={path}
            title={title}
            share={{
              locale,
              title,
              verse: shareVerse,
              fallbackText: shareVerse ? null : explanation.slice(0, 320),
              fallbackLabel: t("beneficiary.card.explanationLabel"),
              approvedLine: approvedLine ?? t("app.name"),
              translationLabel: t("quran.translation"),
              appName: `${t("app.name")} · ${locale === "ar" ? "Signs Around You" : "آيات حولك"}`,
            }}
          />
        </div>
      </header>

      {disagreement && (
        <section className="rounded-[16px] border border-line bg-violet-soft p-4 flex flex-col gap-1.5" aria-labelledby="disagree-h">
          <h2 id="disagree-h" className="text-sm font-semibold text-ink inline-flex items-center gap-2"><Users className="size-4" aria-hidden />{t("beneficiary.card.disagreement")}</h2>
          <p className="text-ink-2 leading-relaxed">{disagreement}</p>
        </section>
      )}

      {/* Quran */}
      {r.verses.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="quran-h">
          <h2 id="quran-h" className={SECTION_LABEL}>{t("beneficiary.card.fromQuran")}</h2>
          <div className="relative overflow-hidden rounded-[20px] border border-line bg-surface shadow-card p-5 sm:p-6">
            <span className="pointer-events-none absolute -top-6 -end-6 text-accent opacity-[0.07]" aria-hidden><Khatam size={150} strokeWidth={0.8} /></span>
            <VerseBlock verses={lead} locale={locale} size="lg" showTranslation={showTranslation} translationLabel={t("quran.translation")} />
            {r.count && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-sm text-ink-2 leading-relaxed" data-testid="count-line">
                  {locale === "ar"
                    ? t("beneficiary.count.lineAr", { word: r.count.label_ar, tokens: fmtNumber(r.count.tokens, locale), verses: fmtNumber(r.count.verses, locale) })
                    : lemma
                      ? t("beneficiary.count.line", { word: r.count.label_en.toLowerCase(), lemma, tokens: r.count.tokens, verses: r.count.verses })
                      : t("beneficiary.count.lineNoLemma", { word: r.count.label_en.toLowerCase(), tokens: r.count.tokens, verses: r.count.verses })}
                  <span className="text-ink-3"> · {t("beneficiary.count.source")}</span>
                </p>
                <details className="group mt-1">
                  <summary className="inline-flex items-center gap-1.5 min-h-11 cursor-pointer list-none text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
                    <Info className="size-4" aria-hidden />
                    {t("beneficiary.count.how")}
                  </summary>
                  <div className="rounded-[12px] bg-surface-2 p-3.5 text-sm text-ink-2 leading-relaxed flex flex-col gap-1.5">
                    <p>{t("beneficiary.count.rule")}</p>
                    <p>{t("beneficiary.count.noSignificance")}</p>
                    <p className="mono text-xs text-ink-3" dir="ltr">{r.count.rule}</p>
                  </div>
                </details>
              </div>
            )}
          </div>
          {rest.length > 0 && (
            <div className="flex flex-col gap-3">
              {rest.map((v) => (
                <div key={v.key} className="rounded-[18px] border border-line bg-surface p-4 sm:p-5">
                  <VerseBlock verses={[v]} locale={locale} showTranslation={showTranslation} translationLabel={t("quran.translation")} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tafsir */}
      {content.tafsir.map((tf, i) => (
        <section key={`${tf.source_id}-${i}`} className="rounded-[18px] bg-sand text-sand-ink p-5 flex flex-col gap-3" aria-labelledby={`tafsir-h-${i}`}>
          <div className="flex flex-col gap-0.5">
            <h2 id={`tafsir-h-${i}`} className="text-sm font-semibold inline-flex items-center gap-2">
              <ScrollText className="size-4" aria-hidden />
              {t("beneficiary.card.commentary", { author: locale === "ar" ? tf.author_ar : tf.author_en })}
            </h2>
            <p className="text-sm opacity-80">
              {locale === "ar" ? tf.book_ar : <>{tf.book_en} · <bdi lang="ar" style={arStyle}>{tf.book_ar}</bdi></>}
              <span className="mono ms-2 text-xs" dir="ltr">{tf.verse_key}</span>
            </p>
          </div>
          <blockquote lang="ar" dir="rtl" className="text-[1.15rem] leading-[2.1] text-start" style={arStyle}>
            {tf.excerpt_ar}
          </blockquote>
          {locale === "en" && tf.excerpt_en && (
            <div className="border-t border-current/15 pt-2">
              <p className="text-xs font-semibold opacity-80">{t("beneficiary.card.tafsirSummary")}</p>
              <p className="text-sm leading-relaxed">{tf.excerpt_en}</p>
            </div>
          )}
          <p className="text-xs opacity-75">
            {t("beneficiary.card.verbatim")}
            {firstUrl(tf.url) && (
              <>
                {" · "}
                <a href={firstUrl(tf.url)!} target="_blank" rel="noreferrer" className="underline underline-offset-2">{t("beneficiary.card.sourceLink")}</a>
              </>
            )}
          </p>
        </section>
      ))}

      {/* Explanation (not Quran text) */}
      {explanation && (
        <section className="rounded-[18px] border border-line bg-surface p-5 flex flex-col gap-2" aria-labelledby="explain-h">
          <h2 id="explain-h" className="text-sm font-semibold text-ink inline-flex items-center gap-2">
            <BookOpen className="size-4 text-violet" aria-hidden />
            {t("beneficiary.card.explanationLabel")}
          </h2>
          <p className="text-ink leading-[1.8]">{explanation}</p>
        </section>
      )}

      {/* Hadith */}
      {r.hadith.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="hadith-h">
          <h2 id="hadith-h" className={SECTION_LABEL}>{t("beneficiary.card.fromHadith")}</h2>
          {r.hadith.map((h) => (
            <div key={h.id} className="rounded-[18px] border border-line bg-surface p-5 flex flex-col gap-3" data-testid="hadith">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <Quote className="size-4 text-accent" aria-hidden />
                <span className="font-semibold text-ink">{COLLECTION_NAMES[h.collection][locale]}</span>
                <span className="mono text-sm text-ink-2" dir="ltr">#{h.number}</span>
                <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-ok-soft text-ok px-2.5 py-0.5 text-xs font-semibold">
                  <BadgeCheck className="size-3.5" aria-hidden />
                  {gradeLabel(h.grade, h.collection, locale, t)}
                </span>
              </div>
              <p className="text-xs text-ink-3">{t("beneficiary.hadith.numbering", { scheme: schemeLabel(h.numbering_scheme, t) })}</p>
              <Expandable lines={4} moreLabel={t("beneficiary.card.showMore")} lessLabel={t("beneficiary.card.showLess")} className="text-[1.08rem] leading-[2] text-ink">
                <p lang="ar" dir="rtl" className="text-start" style={arStyle}>{h.text_ar}</p>
              </Expandable>
              {locale === "en" && h.text_en && (
                <Expandable lines={4} moreLabel={t("beneficiary.card.showMore")} lessLabel={t("beneficiary.card.showLess")} className="text-[0.95rem] leading-relaxed text-ink-2">
                  <p lang="en">{h.text_en}</p>
                </Expandable>
              )}
              {!h.verified_by && (
                <p className="flex items-start gap-1.5 text-xs text-ink-3">
                  <Info className="size-3.5 shrink-0 mt-[2px]" aria-hidden />
                  {t("beneficiary.hadith.mirrorNote")}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Civilisational note */}
      {civText && (
        <section className="rounded-[18px] border border-line bg-surface-2 p-5 flex flex-col gap-2" aria-labelledby="civ-h">
          <h2 id="civ-h" className="text-sm font-semibold text-ink inline-flex items-center gap-2">
            <Landmark className="size-4 text-accent" aria-hidden />
            {t("beneficiary.card.civilisation")}
          </h2>
          <p className="text-ink leading-[1.8]">{civText}</p>
          {civ?.sources?.length ? (
            <div className="mt-1 flex flex-col gap-1">
              <p className="text-xs font-semibold text-ink-3">{t("beneficiary.card.sources")}</p>
              <ul className="flex flex-col gap-1">
                {civ.sources.map((s, i) => (
                  <li key={i} className="text-xs text-ink-2 leading-relaxed" dir="ltr" lang="en">
                    {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{s.citation}</a> : s.citation}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}

      {/* Glossary */}
      {r.terms.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="terms-h">
          <h2 id="terms-h" className={SECTION_LABEL}>{t("beneficiary.card.keyTerms")}</h2>
          <GlossaryChips
            terms={r.terms.map((g) => ({ id: g.id, term_ar: g.term_ar, term_en: g.term_en, rule: locale === "ar" ? g.meaning_ar || g.rule_ar : g.meaning_en || g.rule_en, source: g.source }))}
          />
        </section>
      )}

      {/* Related */}
      {related.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="related-h">
          <h2 id="related-h" className={SECTION_LABEL}>{t("beneficiary.card.related")}</h2>
          <ul className="flex flex-col gap-2">
            {related.map((rc) => (
              <li key={rc.id}>
                <Link href={cardHref(rc)} className="flex items-center gap-3 min-h-14 rounded-[14px] border border-line bg-surface px-4 py-3 hover:bg-surface-2">
                  <Sparkles className="size-4 text-accent shrink-0" aria-hidden />
                  <span className="flex-1 font-medium text-ink">{locale === "ar" ? rc.title_ar : rc.title_en}</span>
                  <ChevronRight className="size-4 text-ink-3 rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Next steps */}
      {showAsk && (
        <section className="relative overflow-hidden rounded-[22px] bg-brand text-brand-ink p-5 sm:p-6 flex flex-col gap-4" aria-labelledby="next-h">
          <span className="pointer-events-none absolute -bottom-10 -end-8 text-[#36dcb8] opacity-15" aria-hidden><Khatam size={160} strokeWidth={0.8} /></span>
          <div className="flex flex-col gap-1">
            <h2 id="next-h" className="text-xl font-semibold">{t("beneficiary.card.curious")}</h2>
            <p className="text-brand-ink/80 text-sm">{t("beneficiary.card.curiousBody")}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <ButtonLink href={`/ask?card=${encodeURIComponent(card.id)}`} size="lg" className="bg-[#36dcb8] text-[#052a22] hover:bg-[#5ae6c7] shadow-none">
              <MessageCircleQuestion className="size-5" aria-hidden />
              {t("beneficiary.card.ask")}
            </ButtonLink>
            <ButtonLink href={`/talk?card=${encodeURIComponent(card.id)}`} size="lg" className="bg-white/10 text-white hover:bg-white/15 shadow-none">
              <Users className="size-5" aria-hidden />
              {t("beneficiary.card.talk")}
            </ButtonLink>
          </div>
        </section>
      )}

      <footer className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3")}>
        {approvedLine && <span>{approvedLine}</span>}
        {card.published_at && <span>{t("beneficiary.card.publishedOn", { date: fmtDate(card.published_at, locale) })}</span>}
        <ProvenanceButton data={provenance} variant="link" />
      </footer>
    </article>
  );
}
