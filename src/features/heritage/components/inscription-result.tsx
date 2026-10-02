"use client";
import Link from "next/link";
import { BadgeCheck, CircleHelp, MessageCircle, RotateCcw, ScanText, ShieldCheck } from "lucide-react";
import { Badge, Button, ButtonLink, cn, VerseBlock } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import type { AlignedWord, InscriptionView, ViewCandidate, ViewLocation } from "../inscription-view";

const toAr = (n: number | string) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

/** Result of matching an inscription against the Quran text: exact · near · none · too short. */
export function InscriptionResult({ view, onReset, className }: { view: InscriptionView; onReset?: () => void; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn("flex flex-col gap-4 animate-rise", className)} data-testid="inscription-result" data-status={view.status}>
      {view.status === "exact" && <Exact view={view} />}
      {view.status === "near" && <Near view={view} />}
      {view.status === "none" && <NoneResult input={view.input} />}
      {view.status === "too_short" && <TooShort input={view.input} />}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="flex items-start gap-2 text-xs text-ink-3 max-w-[52ch]">
          <ShieldCheck className="size-4 shrink-0 mt-0.5 text-accent" aria-hidden />
          {t("heritage.ins.source")}
        </p>
        {onReset && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw className="size-4" aria-hidden />
            {t("heritage.ins.again")}
          </Button>
        )}
      </div>
    </div>
  );
}

function Headline({ tone, icon, title, body, children }: { tone: "ok" | "warn" | "neutral"; icon: React.ReactNode; title: React.ReactNode; body?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3.5 items-start">
      <span
        className={cn(
          "size-11 shrink-0 rounded-full grid place-items-center",
          tone === "ok" && "bg-ok-soft text-ok",
          tone === "warn" && "bg-warn-soft text-warn",
          tone === "neutral" && "bg-surface-2 text-ink-2",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="flex flex-col gap-1.5 min-w-0 pt-1">
        <h2 className="text-xl font-semibold text-ink leading-snug">{title}</h2>
        {body && <p className="text-ink-2 text-[0.95rem]">{body}</p>}
        {children}
      </div>
    </div>
  );
}

function useSura() {
  const { locale, t } = useI18n();
  const name = (l: ViewLocation) => (locale === "ar" ? l.sura_name_ar : l.sura_name_en);
  const num = (n: number) => (locale === "ar" ? toAr(n) : String(n));
  const title = (l: ViewLocation) =>
    l.ayaFrom === l.ayaTo || l.keys.length === 1
      ? t("heritage.ins.exactOne", { sura: name(l), aya: num(l.ayaFrom) })
      : t("heritage.ins.exactRange", { sura: name(l), from: num(l.ayaFrom), to: num(l.ayaTo) });
  return { name, title };
}

function Coverage({ loc }: { loc: ViewLocation }) {
  const { t } = useI18n();
  return (
    <Badge tone={loc.partial ? "violet" : "accent"} data-testid="coverage">
      {loc.partial ? t("heritage.ins.partial") : t("heritage.ins.whole")}
    </Badge>
  );
}

function Exact({ view }: { view: Extract<InscriptionView, { status: "exact" }> }) {
  const { t, locale } = useI18n();
  const { name, title } = useSura();
  const many = view.locations.length > 1;
  return (
    <>
      <Headline
        tone="ok"
        icon={<BadgeCheck className="size-6" />}
        title={many ? t("heritage.ins.exactMany", { n: locale === "ar" ? toAr(view.locations.length) : view.locations.length }) : title(view.locations[0])}
        body={many ? t("heritage.ins.exactManyBody") : undefined}
      >
        {!many && (
          <div className="flex flex-wrap items-center gap-2">
            <Coverage loc={view.locations[0]} />
            <span className="mono text-sm text-ink-3" dir="ltr">{view.locations[0].ref}</span>
          </div>
        )}
      </Headline>
      <YouEntered input={view.input} />
      <ol className="flex flex-col gap-3">
        {view.locations.map((loc, i) => (
          <li key={loc.ref + i} className="rounded-[var(--radius-lg)] border border-line bg-surface p-4 sm:p-5 shadow-card" data-testid="match-location" data-ref={loc.ref}>
            {many && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-ink">{t("heritage.ins.place", { i: locale === "ar" ? toAr(i + 1) : i + 1 })}</span>
                <span className="text-ink-3">·</span>
                <span className="text-ink-2">{locale === "ar" ? `سورة ${name(loc)}` : `Surah ${name(loc)}`}</span>
                <span className="mono text-ink-3" dir="ltr">{loc.ref}</span>
                <Coverage loc={loc} />
              </div>
            )}
            <VerseBlock verses={loc.verses} locale={locale} size="lg" translationLabel={t("quran.translation")} />
          </li>
        ))}
      </ol>
    </>
  );
}

function Words({ words, testId }: { words: AlignedWord[]; testId: string }) {
  return (
    <p lang="ar" dir="rtl" className="font-[family-name:var(--font-ms)] text-[1.45rem] leading-[2.2] text-ink" data-testid={testId}>
      {words.map((w, i) => (
        <span key={i}>
          {w.state === "same" ? (
            w.w
          ) : (
            <mark className="rounded-md bg-warn-soft text-ink px-1 underline decoration-warn decoration-2 underline-offset-[6px]" data-diff={w.state}>
              {w.w}
            </mark>
          )}{" "}
        </span>
      ))}
    </p>
  );
}

function Candidate({ c, primary }: { c: ViewCandidate; primary: boolean }) {
  const { t, locale } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2 items-start">
        <section className="rounded-[var(--radius-lg)] border border-line bg-sand/60 p-4" aria-label={t("heritage.ins.reads")}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-sand-ink mb-1">{t("heritage.ins.reads")}</h3>
          <Words words={c.alignment.inscription} testId={primary ? "near-inscription" : "near-inscription-alt"} />
        </section>
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-4" aria-label={t("heritage.ins.standard")}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">{t("heritage.ins.standard")}</h3>
          <VerseBlock verses={c.verses} locale={locale} translationLabel={t("quran.translation")} />
        </section>
      </div>
      {c.alignment.differences.length > 0 && (
        <section aria-label={t("heritage.ins.differences")} className="rounded-[var(--radius)] border border-line overflow-hidden">
          <h3 className="px-4 py-2.5 text-sm font-semibold bg-surface-2 text-ink">{t("heritage.ins.differences")}</h3>
          <table className="w-full text-sm" data-testid={primary ? "differences" : undefined}>
            <thead className="sr-only">
              <tr>
                <th scope="col">{t("heritage.ins.diffGiven")}</th>
                <th scope="col">{t("heritage.ins.diffStandard")}</th>
              </tr>
            </thead>
            <tbody>
              {c.alignment.differences.map((d, i) => (
                <tr key={i} className="border-t border-line align-top">
                  <td className="px-4 py-2.5 w-1/2">
                    <span className="block text-[0.7rem] uppercase tracking-wider text-ink-3">{t("heritage.ins.diffGiven")}</span>
                    {d.given ? (
                      <bdi lang="ar" className="font-[family-name:var(--font-ms)] text-lg text-ink">{d.given}</bdi>
                    ) : (
                      <span className="text-ink-3 italic">{t("heritage.ins.diffMissing")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 w-1/2 border-s border-line">
                    <span className="block text-[0.7rem] uppercase tracking-wider text-ink-3">{t("heritage.ins.diffStandard")}</span>
                    {d.standard ? (
                      <bdi lang="ar" className="font-[family-name:var(--font-quran)] text-xl text-ink">{d.standard}</bdi>
                    ) : (
                      <span className="text-ink-3 italic">{t("heritage.ins.diffExtra")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Near({ view }: { view: Extract<InscriptionView, { status: "near" }> }) {
  const { t, locale } = useI18n();
  const { name } = useSura();
  const [best, ...rest] = view.candidates;
  return (
    <>
      <Headline tone="warn" icon={<ScanText className="size-6" />} title={<span data-testid="near-title" data-ref={best.ref}>{t("heritage.ins.nearTitle", { sura: name(best), ref: best.ref })}</span>} body={t("heritage.ins.nearBody")}>
        <div className="flex flex-wrap items-center gap-2">
          <Coverage loc={best} />
        </div>
      </Headline>
      <Candidate c={best} primary />
      {rest.length > 0 && (
        <details className="group rounded-[var(--radius)] border border-line bg-surface">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink flex items-center justify-between min-h-11">
            {t("heritage.ins.others")}
            <span className="mono text-ink-3" dir="ltr">{rest.map((r) => r.ref).join(" · ")}</span>
          </summary>
          <div className="flex flex-col gap-6 px-4 pb-4">
            {rest.map((c) => (
              <div key={c.ref} className="flex flex-col gap-2">
                <p className="text-sm font-medium text-ink-2">
                  {locale === "ar" ? `سورة ${name(c)}` : `Surah ${name(c)}`} <span className="mono text-ink-3" dir="ltr">{c.ref}</span>
                </p>
                <Candidate c={c} primary={false} />
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function YouEntered({ input }: { input: string }) {
  const { t } = useI18n();
  return (
    <div className="rounded-[var(--radius)] bg-sand/60 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-sand-ink">{t("heritage.ins.youTyped")}</p>
      <p lang="ar" dir="rtl" className="font-[family-name:var(--font-ms)] text-xl leading-[2.1] text-ink">{input}</p>
    </div>
  );
}

function NoneResult({ input }: { input: string }) {
  const { t } = useI18n();
  return (
    <>
      <Headline tone="neutral" icon={<CircleHelp className="size-6" />} title={t("heritage.ins.noneTitle")} body={t("heritage.ins.noneBody")} />
      <YouEntered input={input} />
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/talk?topic=inscription" variant="primary" size="lg">
          <MessageCircle className="size-5" aria-hidden />
          {t("heritage.ins.askPerson")}
        </ButtonLink>
      </div>
    </>
  );
}

function TooShort({ input }: { input: string }) {
  const { t } = useI18n();
  return (
    <>
      <Headline tone="neutral" icon={<CircleHelp className="size-6" />} title={t("heritage.ins.tooShortTitle")} body={t("heritage.ins.tooShortBody")} />
      <YouEntered input={input} />
    </>
  );
}

/** Small link to the full inscription reader, used elsewhere. */
export function InscriptionLink({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Link href="/inscription" className={cn("text-accent underline underline-offset-4", className)}>
      {t("heritage.cta.inscriptionTitle")}
    </Link>
  );
}
