import { cn } from "./cn";

const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

export interface VerseView {
  key: string;
  aya: number;
  text_uthmani: string;
  sura_name_ar: string;
  sura_name_en: string;
  translation?: { edition_name: string; text: string } | null;
}

/**
 * Renders Quran text exactly as stored (KFGQPC Hafs v18) in the KFGQPC font, with its reference and a labelled translation.
 * Never pass model-generated text here.
 */
export function VerseBlock({
  verses,
  locale,
  showTranslation = true,
  size = "md",
  className,
  translationLabel,
}: {
  verses: VerseView[];
  locale: "en" | "ar";
  showTranslation?: boolean;
  size?: "md" | "lg";
  className?: string;
  translationLabel: string;
}) {
  if (!verses.length) return null;
  const first = verses[0];
  const last = verses[verses.length - 1];
  const ref =
    verses.length > 1 ? `${first.key}–${last.aya}` : first.key;
  return (
    <figure className={cn("flex flex-col gap-3", className)}>
      <blockquote lang="ar" dir="rtl" className={cn("quran", size === "lg" && "quran-lg")}>
        {verses.map((v) => (
          <span key={v.key}>
            {v.text_uthmani}
            <span className="ayah-mark">﴿{toArabicDigits(v.aya)}﴾</span>{" "}
          </span>
        ))}
      </blockquote>
      <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
        <span className="font-medium text-ink">{locale === "ar" ? `سورة ${first.sura_name_ar}` : `Surah ${first.sura_name_en}`}</span>
        <span className="mono text-ink-3" dir="ltr">{ref}</span>
      </figcaption>
      {showTranslation && verses.some((v) => v.translation) && (
        <div className="rounded-[12px] bg-surface-2 px-4 py-3">
          <p className="text-[0.95rem] leading-relaxed text-ink" dir="ltr" lang="en">
            “{verses.map((v) => v.translation?.text).filter(Boolean).join(" ")}”
          </p>
          <p className="mt-1.5 text-xs text-ink-3">
            {translationLabel} · {first.translation?.edition_name}
          </p>
        </div>
      )}
    </figure>
  );
}
