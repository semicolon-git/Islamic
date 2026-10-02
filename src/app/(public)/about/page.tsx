import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, BadgeCheck, BookOpenCheck, Building2, Camera, CheckCircle2, EyeOff, Hash, Image as ImageIcon, Languages, Library, MessageCircleQuestion, ScrollText, ShieldCheck, Sparkles, UserRound, Users, XCircle, Info } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { env } from "@/lib/env";
import { aiEnabled } from "@/lib/ai/claude";
import { Khatam } from "@/components/ui/khatam";
import { institutionsList } from "@/features/beneficiary/data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("beneficiary.about.metaTitle") };
}

const H2 = "text-2xl font-semibold text-ink";

export default async function AboutPage() {
  const { t, locale } = await getI18n();
  const institutions = await institutionsList();
  const demo = env.demoMode;
  const ai = aiEnabled();

  const flows = [
    { k: "snap", steps: [{ icon: Camera, s: "1" }, { icon: Library, s: "2" }, { icon: BadgeCheck, s: "3" }] },
    { k: "ask", steps: [{ icon: MessageCircleQuestion, s: "1" }, { icon: BookOpenCheck, s: "2" }, { icon: ShieldCheck, s: "3" }] },
    { k: "talk", steps: [{ icon: Users, s: "1" }, { icon: EyeOff, s: "2" }, { icon: UserRound, s: "3" }] },
  ] as const;

  const sources = [
    { icon: ScrollText, k: "quran" },
    { icon: Languages, k: "translation" },
    { icon: BookOpenCheck, k: "hadith" },
    { icon: Hash, k: "counts" },
    { icon: Library, k: "tafsir" },
    { icon: ImageIcon, k: "images" },
  ];

  return (
    <div className="flex flex-col gap-10 pb-12">
      <header className="relative overflow-hidden rounded-[24px] bg-brand text-brand-ink p-6 sm:p-8 flex flex-col gap-3">
        <span className="pointer-events-none absolute -top-10 -end-10 text-[#36dcb8] opacity-20" aria-hidden><Khatam size={200} strokeWidth={0.5} /></span>
        <h1 className="relative text-[2rem] leading-tight font-semibold max-w-[20ch]">{t("beneficiary.about.title")}</h1>
        <p className="relative text-brand-ink/80 leading-relaxed max-w-[52ch]">{t("beneficiary.about.intro")}</p>
      </header>

      {demo && (
        <p className="flex items-start gap-2 rounded-[14px] bg-warn-soft px-4 py-3 text-sm text-ink" role="note">
          <Info className="size-4 text-warn shrink-0 mt-[3px]" aria-hidden />
          <span>{t("beneficiary.about.demoNote")}</span>
        </p>
      )}

      {/* How it works — diagram */}
      <section className="flex flex-col gap-4" aria-labelledby="how-h">
        <h2 id="how-h" className={H2}>{t("beneficiary.about.howTitle")}</h2>
        <div className="flex flex-col gap-3">
          {flows.map((f) => (
            <figure key={f.k} className="rounded-[20px] border border-line bg-surface p-4 sm:p-5 flex flex-col gap-3">
              <figcaption className="font-semibold text-ink">{t(`beneficiary.about.flow.${f.k}`)}</figcaption>
              <ol className="flex flex-col sm:flex-row sm:items-stretch gap-2">
                {f.steps.map((st, i) => (
                  <li key={st.s} className="contents">
                    <div className="flex-1 flex items-center sm:flex-col sm:items-start gap-3 rounded-[14px] bg-surface-2 p-3">
                      <span className="size-9 shrink-0 rounded-[10px] bg-accent-soft text-accent grid place-items-center"><st.icon className="size-[1.1rem]" aria-hidden /></span>
                      <span className="text-sm text-ink leading-snug">{t(`beneficiary.about.flow.${f.k}.${st.s}`)}</span>
                    </div>
                    {i < f.steps.length - 1 && (
                      <span className="self-center text-ink-3" aria-hidden>
                        <ArrowDown className="size-4 sm:hidden" />
                        <ArrowRight className="size-4 hidden sm:block rtl:rotate-180" />
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </figure>
          ))}
        </div>
      </section>

      {/* AI disclosure */}
      <section className="flex flex-col gap-4" aria-labelledby="ai-h">
        <h2 id="ai-h" className={H2}>{t("beneficiary.about.aiTitle")}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-[18px] border border-line bg-surface p-4 flex flex-col gap-2">
            <h3 className="font-semibold text-ink inline-flex items-center gap-2"><Sparkles className="size-4 text-violet" aria-hidden />{t("beneficiary.about.aiDoes")}</h3>
            <ul className="flex flex-col gap-1.5 text-sm text-ink-2">
              {["1", "2", "3"].map((k) => (
                <li key={k} className="flex gap-2"><CheckCircle2 className="size-4 text-ok shrink-0 mt-[3px]" aria-hidden />{t(`beneficiary.about.aiDoes.${k}`)}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[18px] border border-line bg-surface p-4 flex flex-col gap-2">
            <h3 className="font-semibold text-ink inline-flex items-center gap-2"><XCircle className="size-4 text-bad" aria-hidden />{t("beneficiary.about.aiNever")}</h3>
            <ul className="flex flex-col gap-1.5 text-sm text-ink-2">
              {["1", "2", "3", "4"].map((k) => (
                <li key={k} className="flex gap-2"><XCircle className="size-4 text-bad shrink-0 mt-[3px]" aria-hidden />{t(`beneficiary.about.aiNever.${k}`)}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-sm text-ink-2">
          {t("beneficiary.about.labels")} <span className="font-medium text-ink">“{t("badge.ai")}”</span> · <span className="font-medium text-ink">“{t("badge.approved", { institution: "…" })}”</span>
        </p>
        <p className="text-xs text-ink-3">{ai ? t("beneficiary.about.aiOn") : t("beneficiary.about.aiOffNow")}</p>
      </section>

      {/* Sources */}
      <section className="flex flex-col gap-4" aria-labelledby="src-h">
        <h2 id="src-h" className={H2}>{t("beneficiary.about.sourcesTitle")}</h2>
        <ul className="flex flex-col divide-y divide-line rounded-[20px] border border-line bg-surface overflow-hidden">
          {sources.map((s) => (
            <li key={s.k} className="flex gap-3 p-4">
              <span className="size-10 shrink-0 rounded-[12px] bg-surface-2 text-ink-2 grid place-items-center"><s.icon className="size-5" aria-hidden /></span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <h3 className="font-semibold text-ink">{t(`beneficiary.about.src.${s.k}`)}</h3>
                <p className="text-sm text-ink-2 leading-relaxed">{t(`beneficiary.about.src.${s.k}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Privacy */}
      <section className="flex flex-col gap-4" aria-labelledby="priv-h">
        <h2 id="priv-h" className={H2}>{t("beneficiary.about.privacyTitle")}</h2>
        <ul className="grid sm:grid-cols-2 gap-3">
          {["1", "2", "3", "4", "5", "6"].map((k) => (
            <li key={k} className="rounded-[16px] bg-surface-2 p-4 flex gap-3">
              <ShieldCheck className="size-5 text-accent shrink-0 mt-0.5" aria-hidden />
              <span className="text-sm text-ink leading-relaxed">{t(`beneficiary.about.privacy.${k}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Institutions */}
      <section className="flex flex-col gap-4" aria-labelledby="inst-h">
        <h2 id="inst-h" className={H2}>{t("beneficiary.about.institutionsTitle")}</h2>
        <p className="text-ink-2">{t("beneficiary.about.institutionsBody")}</p>
        <ul className="grid sm:grid-cols-3 gap-3">
          {institutions.map((i) => (
            <li key={i.id} className="rounded-[16px] border border-line bg-surface p-4 flex flex-col gap-2">
              <Building2 className="size-5 text-accent" aria-hidden />
              <span className="font-medium text-ink leading-snug">{locale === "ar" ? i.name_ar : i.name_en}</span>
              <span className="text-xs text-ink-3">
                {t(`beneficiary.about.kind.${i.kind}`)}
                {demo && i.is_demo && <span className="ms-1.5 uppercase tracking-wider border border-line rounded-full px-1.5 py-px">{t("badge.demo")}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[20px] bg-accent-soft p-5 flex flex-col gap-3" aria-labelledby="next-h">
        <h2 id="next-h" className="text-lg font-semibold text-ink">{t("beneficiary.about.nextTitle")}</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/snap" className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-accent text-accent-ink text-sm font-semibold"><Camera className="size-4" aria-hidden />{t("beneficiary.home.cta")}</Link>
          <Link href="/ask" className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-surface text-ink text-sm font-medium border border-line-strong"><MessageCircleQuestion className="size-4" aria-hidden />{t("nav.ask")}</Link>
          <Link href="/talk" className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-surface text-ink text-sm font-medium border border-line-strong"><Users className="size-4" aria-hidden />{t("beneficiary.card.talk")}</Link>
          <Link href="/portal" className="inline-flex items-center gap-2 h-11 px-4 rounded-full text-ink-2 text-sm font-medium hover:bg-surface/60"><Building2 className="size-4" aria-hidden />{t("beneficiary.home.forInstitutions")}</Link>
        </div>
      </section>
    </div>
  );
}
