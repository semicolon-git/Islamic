"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BadgeCheck, BookOpenCheck, Camera, Check, EyeOff, Languages, ShieldCheck, Sparkles, UserX } from "lucide-react";
import { Khatam } from "@/components/ui/khatam";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { WELCOMED_KEY, writeFlag } from "./device";

const STEPS = 3;

/** First-run onboarding: three short swipeable steps. Skippable at any point; never shown again once done or skipped. */
export function Welcome() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.6) setStep(Number((e.target as HTMLElement).dataset.step));
      },
      { root: el, threshold: [0.6] },
    );
    el.querySelectorAll("[data-step]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  const go = (i: number) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-step="${i}"]`);
    el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", inline: "start", block: "nearest" });
    setStep(i);
  };
  const finish = () => {
    writeFlag(WELCOMED_KEY, "1");
    router.replace("/");
  };
  const Next = locale === "ar" ? ArrowLeft : ArrowRight;

  return (
    <div className="relative min-h-dvh flex flex-col bg-[#0b0e29] text-white overflow-hidden">
      <span className="pointer-events-none absolute -top-24 -end-24 text-[#36dcb8] opacity-[0.12]" aria-hidden><Khatam size={340} strokeWidth={0.4} /></span>
      <span className="pointer-events-none absolute -bottom-28 -start-28 text-[#a094ff] opacity-[0.1]" aria-hidden><Khatam size={300} strokeWidth={0.4} /></span>

      <header className="relative z-10 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] h-16">
        <span className="inline-flex items-center gap-2 font-semibold">
          <span className="text-[#36dcb8]"><Khatam size={24} /></span>
          {t("app.name")}
        </span>
        <button type="button" onClick={finish} className="h-11 px-4 rounded-full text-sm font-medium text-white/80 hover:text-white hover:bg-white/10">
          {t("beneficiary.welcome.skip")}
        </button>
      </header>

      <div className="relative z-10 flex-1 flex flex-col">
        <div
          ref={scroller}
          className="flex-1 flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-roledescription="carousel"
          aria-label={t("beneficiary.welcome.label")}
        >
          {/* 1 · Language */}
          <section data-step="0" className="snap-start shrink-0 w-full flex flex-col justify-center gap-6 px-6 py-6 max-w-xl mx-auto" aria-labelledby="w1" aria-roledescription="slide" aria-label={`1 / ${STEPS}`}>
            <span className="size-14 rounded-2xl bg-white/10 grid place-items-center"><Languages className="size-7 text-[#36dcb8]" aria-hidden /></span>
            <h1 id="w1" className="text-[2rem] leading-tight font-semibold">{t("beneficiary.welcome.s1.title")}</h1>
            <p className="text-white/75 text-lg leading-relaxed">{t("beneficiary.welcome.s1.body")}</p>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t("lang.label")}>
              {(
                [
                  { v: "en", label: "English", sub: "Welcome" },
                  { v: "ar", label: "العربية", sub: "أهلًا بك" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  role="radio"
                  aria-checked={locale === o.v}
                  lang={o.v}
                  onClick={() => setLocale(o.v)}
                  className={cn(
                    "relative flex flex-col items-start gap-1 rounded-[18px] p-4 min-h-24 text-start ring-1 transition-colors",
                    locale === o.v ? "bg-[#36dcb8] text-[#052a22] ring-[#36dcb8]" : "bg-white/5 text-white ring-white/15 hover:bg-white/10",
                  )}
                >
                  <span className="text-xl font-semibold">{o.label}</span>
                  <span className={cn("text-sm", locale === o.v ? "text-[#052a22]/80" : "text-white/60")}>{o.sub}</span>
                  {locale === o.v && <Check className="absolute top-3 end-3 size-5" aria-hidden />}
                </button>
              ))}
            </div>
          </section>

          {/* 2 · What this is */}
          <section data-step="1" className="snap-start shrink-0 w-full flex flex-col justify-center gap-6 px-6 py-6 max-w-xl mx-auto" aria-labelledby="w2" aria-roledescription="slide" aria-label={`2 / ${STEPS}`}>
            <span className="size-14 rounded-2xl bg-white/10 grid place-items-center"><Sparkles className="size-7 text-[#36dcb8]" aria-hidden /></span>
            <h2 id="w2" className="text-[2rem] leading-tight font-semibold">{t("beneficiary.welcome.s2.title")}</h2>
            <ul className="flex flex-col gap-4">
              {[
                { icon: Camera, k: "a" },
                { icon: BadgeCheck, k: "b" },
                { icon: BookOpenCheck, k: "c" },
              ].map(({ icon: Icon, k }) => (
                <li key={k} className="flex gap-3">
                  <span className="size-10 shrink-0 rounded-[12px] bg-white/10 grid place-items-center"><Icon className="size-5 text-[#36dcb8]" aria-hidden /></span>
                  <span className="flex flex-col">
                    <span className="font-semibold">{t(`beneficiary.welcome.s2.${k}`)}</span>
                    <span className="text-white/70 text-[0.95rem] leading-relaxed">{t(`beneficiary.welcome.s2.${k}Body`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* 3 · Privacy + camera */}
          <section data-step="2" className="snap-start shrink-0 w-full flex flex-col justify-center gap-6 px-6 py-6 max-w-xl mx-auto" aria-labelledby="w3" aria-roledescription="slide" aria-label={`3 / ${STEPS}`}>
            <span className="size-14 rounded-2xl bg-white/10 grid place-items-center"><ShieldCheck className="size-7 text-[#36dcb8]" aria-hidden /></span>
            <h2 id="w3" className="text-[2rem] leading-tight font-semibold">{t("beneficiary.welcome.s3.title")}</h2>
            <ul className="flex flex-col gap-4">
              {[
                { icon: UserX, k: "a" },
                { icon: EyeOff, k: "b" },
                { icon: Camera, k: "c" },
              ].map(({ icon: Icon, k }) => (
                <li key={k} className="flex gap-3">
                  <span className="size-10 shrink-0 rounded-[12px] bg-white/10 grid place-items-center"><Icon className="size-5 text-[#36dcb8]" aria-hidden /></span>
                  <span className="flex flex-col">
                    <span className="font-semibold">{t(`beneficiary.welcome.s3.${k}`)}</span>
                    <span className="text-white/70 text-[0.95rem] leading-relaxed">{t(`beneficiary.welcome.s3.${k}Body`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="px-6 pb-[max(env(safe-area-inset-bottom),24px)] pt-2 flex flex-col gap-5 max-w-xl w-full mx-auto">
          <div className="flex justify-center gap-1" role="group" aria-label={t("beneficiary.welcome.progress")}>
            {Array.from({ length: STEPS }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={t("beneficiary.welcome.goto", { n: i + 1, total: STEPS })}
                aria-current={step === i ? "step" : undefined}
                className="size-11 grid place-items-center"
              >
                <span className={cn("h-2 rounded-full transition-all", step === i ? "w-7 bg-[#36dcb8]" : "w-2 bg-white/30")} />
              </button>
            ))}
          </div>
          {step < STEPS - 1 ? (
            <button type="button" onClick={() => go(step + 1)} className="inline-flex items-center justify-center gap-2 h-14 rounded-[18px] bg-white text-[#0b0e29] text-lg font-semibold active:scale-[0.98] transition-transform">
              {t("action.continue")}
              <Next className="size-5" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={finish} className="inline-flex items-center justify-center gap-2 h-14 rounded-[18px] bg-[#36dcb8] text-[#052a22] text-lg font-semibold active:scale-[0.98] transition-transform">
              {t("beneficiary.welcome.start")}
              <Next className="size-5" aria-hidden />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
