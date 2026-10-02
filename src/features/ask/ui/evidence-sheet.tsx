"use client";
import { useEffect } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { VerseBlock } from "@/components/ui/quran";
import type { AskResult } from "../types";
import { HadithCard, GlossaryBlock, Fact, Tafsir, type T } from "./blocks";

/** All evidence for one answer; opening a chip scrolls to that item. Every text is loaded from the DB by id. */
export function EvidenceSheet({ focus, onClose, r, t }: { focus: string | null; onClose: () => void; r: AskResult; t: T }) {
  useEffect(() => {
    if (!focus) return;
    const id = requestAnimationFrame(() => document.querySelector(`[data-ev-item="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(id);
  }, [focus]);
  const verses = r.blocks.flatMap((b) => (b.type === "verses" ? b.verses : []));
  const hadith = r.blocks.flatMap((b) => (b.type === "hadith" ? [b.hadith] : []));
  return (
    <Sheet open={!!focus} onClose={onClose} title={t("ask.evidence")} description={t("ask.evidence.sheetDesc")} closeLabel={t("action.close")}>
      <div lang={r.lang} dir={r.lang === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-4" data-testid="evidence-sheet">
        {r.evidence.map((e) => {
          let body: React.ReactNode = null;
          if (e.kind === "quran") {
            const v = verses.find((x) => `Q:${x.key}` === e.id);
            if (v) body = <VerseBlock verses={[v]} locale={r.lang} translationLabel={t("quran.translation")} showTranslation={r.lang === "en"} />;
          } else if (e.kind === "hadith") {
            const h = hadith.find((x) => `H:${x.id}` === e.id);
            if (h) body = <HadithCard h={h} t={t} lang={r.lang} full />;
          } else if (e.kind === "card") {
            body = (
              <Link href={e.href ?? "#"} className="inline-flex items-center gap-2 h-11 px-4 rounded-[12px] border border-line-strong text-ink font-medium hover:bg-surface-2 w-fit">
                <BadgeCheck className="size-4 text-ok" aria-hidden />
                {t("ask.cardLink")}
              </Link>
            );
          } else if (e.kind === "glossary") {
            const g = r.blocks.find((b) => b.type === "glossary" && `G:${b.term.id}` === e.id);
            if (g?.type === "glossary") body = <GlossaryBlock block={g} t={t} lang={r.lang} />;
          } else if (e.kind === "fact") {
            const f = r.blocks.find((b) => b.type === "fact");
            if (f?.type === "fact") body = <Fact block={f} t={t} lang={r.lang} />;
          } else if (e.kind === "tafsir") {
            const tf = r.blocks.find((b) => b.type === "tafsir" && `T:${b.book_en}:${b.verse_key}` === e.id);
            if (tf?.type === "tafsir") body = <Tafsir block={tf} t={t} lang={r.lang} />;
          }
          return (
            <section key={e.id} data-ev-item={e.id} className="flex flex-col gap-2 scroll-mt-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-3">{t(`ask.evidence.kind.${e.kind}`)}</span>
                <code className="mono text-xs text-ink-3" dir="ltr">{e.id}</code>
              </div>
              <p className="font-medium text-ink">
                <bdi>{r.lang === "ar" ? e.label_ar : e.label_en}</bdi>
              </p>
              {body}
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}
