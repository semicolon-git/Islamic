"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { normalizeArabic } from "@/lib/quran/normalize";
import { conceptHref } from "@/features/beneficiary/labels";
import { looksLikeQuestion } from "../link";

const norm = (s: string) => (/[؀-ۿ]/.test(s) ? normalizeArabic(s).replace(/^ال/, "") : s.toLowerCase().replace(/^(?:a|an|the)\s+/, "").replace(/s$/, "")).trim();

/** Explore → "Search anything": a covered concept opens its page; any other subject opens discovery; a question opens Ask. */
export function ExploreSearch({ concepts }: { concepts: { id: string; label_en: string; label_ar: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const s = q.trim();
    if (!s) return;
    if (looksLikeQuestion(s)) return router.push(`/ask?q=${encodeURIComponent(s)}`);
    const n = norm(s);
    const hit = concepts.find((c) => [c.label_en, c.label_ar, ...c.label_en.split(/\s*[&,]\s*|\s+and\s+/i), ...c.label_ar.split(/\s*[،,و]\s+/)].some((l) => l && norm(l) === n));
    router.push(hit ? conceptHref(hit.id) : `/discover?q=${encodeURIComponent(s)}`);
  };
  return (
    <form onSubmit={go} role="search" className="flex flex-col gap-1.5" data-testid="explore-search">
      <label htmlFor="explore-q" className="text-sm font-medium text-ink">{t("discover.searchLabel")}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 size-5 text-ink-3" aria-hidden />
          <input id="explore-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("discover.searchPlaceholder")} dir="auto" maxLength={80}
            className="w-full h-12 rounded-[14px] border border-line-strong bg-surface ps-11 pe-3 text-[1rem] text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-accent" />
        </div>
        <button type="submit" className="h-12 px-5 rounded-[14px] bg-accent text-accent-ink font-semibold hover:bg-accent-hover">{t("discover.searchGo")}</button>
      </div>
      <p className="text-xs text-ink-3">{t("discover.searchHint")}</p>
    </form>
  );
}
