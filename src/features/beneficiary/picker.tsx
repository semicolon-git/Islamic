"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Search, SearchX } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { ConceptImage } from "@/components/ui/concept-image";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import { cardsFirst, conceptHref, conceptHue, conceptLabel, searchConcepts, TRACKS, type ConceptSummary, type Track } from "./labels";

/** "Choose what you see": searchable grid of concepts (EN/AR search), optionally with the visitor's photo as context. */
export function ConceptPicker({
  open,
  onClose,
  concepts,
  photo,
  note,
  initialTrack,
}: {
  open: boolean;
  onClose: () => void;
  concepts: ConceptSummary[];
  photo?: string | null;
  note?: string | null;
  initialTrack?: Track | null;
}) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [track, setTrack] = useState<Track | "all">(initialTrack ?? "all");
  const list = useMemo(() => {
    const base = track === "all" ? concepts : concepts.filter((c) => c.track === track);
    return q.trim() ? searchConcepts(base, q) : cardsFirst(base);
  }, [concepts, q, track]);

  return (
    <Sheet open={open} onClose={onClose} title={t("beneficiary.picker.title")} description={t("beneficiary.picker.subtitle")} closeLabel={t("action.close")} className="sm:max-h-[86dvh]">
      <div className="flex flex-col gap-4">
        {photo && (
          <div className="flex items-center gap-3 rounded-[14px] bg-surface-2 p-2.5" data-testid="picker-photo">
            <img src={photo} alt={t("beneficiary.picker.yourPhoto")} className="size-16 rounded-[10px] object-cover shrink-0" />
            <p className="text-sm text-ink-2" aria-live="polite">{note ?? t("beneficiary.picker.photoNote")}</p>
          </div>
        )}
        <div className="sticky top-0 z-10 -mx-5 px-5 pb-2 pt-0.5 bg-surface flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">{t("beneficiary.picker.search")}</span>
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 size-[1.1rem] text-ink-3 pointer-events-none" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("beneficiary.picker.searchPlaceholder")}
              className="w-full h-12 rounded-[14px] border border-line-strong bg-surface ps-11 pe-3.5 text-ink placeholder:text-ink-3 focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/25"
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label={t("beneficiary.picker.filter")}>
            {(["all", ...TRACKS] as const).map((tr) => (
              <button
                key={tr}
                type="button"
                aria-pressed={track === tr}
                onClick={() => setTrack(tr)}
                className={cn(
                  "shrink-0 h-10 px-4 rounded-full text-sm font-medium border transition-colors",
                  track === tr ? "bg-ink text-bg border-ink" : "bg-surface-2 text-ink-2 border-transparent hover:border-line-strong",
                )}
              >
                {tr === "all" ? t("beneficiary.picker.all") : t(`beneficiary.track.${tr}`)}
              </button>
            ))}
          </div>
        </div>
        <p className="sr-only" aria-live="polite">{t("beneficiary.picker.count", { n: list.length.toLocaleString(locale === "ar" ? "ar-SA" : "en-US") })}</p>
        {list.length ? (
          <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {list.map((c) => {
              const label = conceptLabel(c, locale);
              return (
                <li key={c.id}>
                  <Link href={conceptHref(c.id)} className="group flex flex-col gap-1.5 rounded-[14px] p-1 -m-1 hover:bg-surface-2" onClick={onClose}>
                    <span className="relative block">
                      <ConceptImage src={c.image} alt="" hue={conceptHue(c.id, c.track)} className="aspect-square w-full rounded-[12px]" />
                      {c.has_card && (
                        <span className="absolute top-1.5 end-1.5 size-6 rounded-full bg-white text-[#0a6b5b] grid place-items-center shadow-sm" title={t("beneficiary.tile.approved")}>
                          <BadgeCheck className="size-4" aria-hidden />
                        </span>
                      )}
                    </span>
                    <span className="text-[0.82rem] font-medium leading-snug text-ink line-clamp-2">
                      {label}
                      {c.has_card && <span className="sr-only"> · {t("beneficiary.tile.approved")}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center text-center gap-2 py-8">
            <SearchX className="size-8 text-ink-3" aria-hidden />
            <p className="font-medium text-ink">{t("beneficiary.picker.empty", { q })}</p>
            <p className="text-sm text-ink-2">{t("beneficiary.picker.emptyBody")}</p>
            <Link href={`/ask?q=${encodeURIComponent(q)}`} className="min-h-11 inline-flex items-center text-accent font-medium underline underline-offset-4">
              {t("beneficiary.picker.askInstead")}
            </Link>
          </div>
        )}
      </div>
    </Sheet>
  );
}
