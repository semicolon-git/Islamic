"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, BookOpen, ChevronRight, MessageCircleQuestion, Users, ShieldCheck } from "lucide-react";
import { ConceptImage } from "@/components/ui/concept-image";
import { Button, ButtonLink } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { useEvents } from "@/lib/use-events";
import { getDeviceToken } from "./device";
import { conceptHref } from "./labels";
import { discoverHref } from "@/features/discover/link";

type State = "idle" | "sending" | "requested" | "error" | "limited";

/**
 * "No reviewed card yet — we won't guess." Lets the visitor ask to be notified, then listens live:
 * when an institution publishes a card for this concept, the page swaps to the card.
 */
export function NoCard({
  conceptId,
  labels,
  label,
  image,
  hue,
  suggestions,
}: {
  conceptId: string;
  labels?: { en: string; ar: string };
  label: string;
  image: string | null;
  hue: number;
  suggestions: { id: string; label: string }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<State>("idle");

  // Restore "requested" state for this device (no account: an anonymous token in localStorage).
  useEffect(() => {
    const token = getDeviceToken(false);
    if (!token) return;
    let alive = true;
    fetch("/api/requests", { headers: { "x-device-token": token } })
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.ok && (j.data as { concept_id: string | null; status: string }[]).some((x) => x.concept_id === conceptId && x.status === "open")) setState("requested");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [conceptId]);

  useEvents([`concept:${conceptId}`], (ev) => {
    if (ev.type === "published") {
      router.replace(`${conceptHref(conceptId)}?approved=1`, { scroll: false });
      router.refresh();
    }
  });

  const notify = useCallback(async () => {
    const token = getDeviceToken(true);
    if (!token) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ concept_id: conceptId, device_token: token }),
      });
      if (res.status === 429) return setState("limited");
      const j = await res.json();
      if (!j.ok) throw new Error(j.error?.code);
      setState("requested");
      toast({ tone: "ok", text: t("beneficiary.nocard.requestedToast") });
    } catch {
      setState(navigator.onLine === false ? "error" : "error");
    }
  }, [conceptId, t, toast]);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="relative">
        <ConceptImage src={image} alt="" hue={hue} className="aspect-[16/9] sm:aspect-[21/9] w-full rounded-[22px] opacity-90" />
        <span className="absolute bottom-3 start-3 inline-flex items-center gap-1.5 rounded-full bg-[rgb(8_10_30/0.72)] backdrop-blur px-3 py-1.5 text-[0.8rem] font-medium text-white">
          {label}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] leading-tight font-semibold text-ink">{t("beneficiary.nocard.title")}</h1>
        <p className="text-ink-2 leading-relaxed">{t("beneficiary.nocard.why", { label })}</p>
      </div>

      {labels && (
        <Link href={discoverHref({ label_en: labels.en, label_ar: labels.ar }, "search")} className="flex items-center gap-3 rounded-[20px] bg-[#fdf3d6] text-[#5c4100] dark:bg-[#3a2f12] dark:text-[#f3d27a] p-4 hover:brightness-95" data-testid="nocard-discover">
          <BookOpen className="size-6 shrink-0" aria-hidden />
          <span className="flex-1 flex flex-col">
            <span className="font-semibold">{t("discover.fromSnapCta")}</span>
            <span className="text-sm opacity-90">{t("discover.tier.sources")}</span>
          </span>
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
        </Link>
      )}

      <div className="rounded-[20px] border border-line bg-surface p-5 flex flex-col gap-3 shadow-card" aria-live="polite">
        {state === "requested" ? (
          <div className="flex flex-col gap-2 animate-pop" data-testid="requested">
            <p className="inline-flex items-center gap-2 font-semibold text-ink">
              <BellRing className="size-5 text-accent" aria-hidden />
              {t("beneficiary.nocard.requested")}
            </p>
            <p className="text-sm text-ink-2">{t("beneficiary.nocard.requestedBody")}</p>
            <p className="inline-flex items-center gap-2 text-xs text-ink-3">
              <span className="relative flex size-2.5" aria-hidden>
                <span className="absolute inline-flex size-full rounded-full bg-accent opacity-60 animate-ping motion-reduce:animate-none" />
                <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
              </span>
              {t("beneficiary.nocard.live")}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-2">{t("beneficiary.nocard.notifyBody")}</p>
            <Button size="xl" full onClick={notify} loading={state === "sending"}>
              <Bell className="size-5" aria-hidden />
              {t("beneficiary.nocard.notify")}
            </Button>
            {state === "error" && <p role="alert" className="text-sm text-bad">{t("beneficiary.nocard.error")}</p>}
            {state === "limited" && <p role="alert" className="text-sm text-warn">{t("beneficiary.nocard.limited")}</p>}
            <p className="inline-flex items-center gap-1.5 text-xs text-ink-3">
              <ShieldCheck className="size-3.5" aria-hidden />
              {t("beneficiary.nocard.privacy")}
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ButtonLink href={`/ask?concept=${encodeURIComponent(conceptId)}`} variant="secondary" size="lg">
          <MessageCircleQuestion className="size-5" aria-hidden />
          {t("beneficiary.nocard.ask")}
        </ButtonLink>
        <ButtonLink href={`/talk?concept=${encodeURIComponent(conceptId)}`} variant="secondary" size="lg">
          <Users className="size-5" aria-hidden />
          {t("beneficiary.card.talk")}
        </ButtonLink>
      </div>

      {suggestions.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="meanwhile-h">
          <h2 id="meanwhile-h" className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("beneficiary.nocard.meanwhile")}</h2>
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s.id}>
                <Link href={conceptHref(s.id)} className="inline-flex items-center h-11 px-4 rounded-full bg-accent-soft text-sm font-medium text-ink hover:brightness-95">
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
