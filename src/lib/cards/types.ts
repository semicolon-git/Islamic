import { z } from "zod";

/** Evidence reference ids used everywhere: Q:<sura>:<aya> · H:<collection>:<number> · T:<source>:<verse> · C:<card id> · G:<term id> */
export const VerseRef = z.object({
  key: z.string().regex(/^\d{1,3}:\d{1,3}$/),
  role: z.enum(["primary", "supporting"]).default("primary"),
});
export const HadithRef = z.object({ id: z.string().regex(/^(bukhari|muslim):\d+[a-z]?$/) });
export const TafsirExcerpt = z.object({
  source_id: z.string(),            // 'tabari'
  book_ar: z.string(),
  book_en: z.string(),
  author_ar: z.string(),
  author_en: z.string(),
  verse_key: z.string(),
  excerpt_ar: z.string(),           // verbatim
  excerpt_en: z.string().optional(),// researcher-written paraphrase, labelled
  url: z.string().optional(),
});
export const SourceRef = z.object({ citation: z.string(), url: z.string().optional(), kind: z.enum(["academic", "sharia", "museum", "dataset"]).default("academic") });
export const Bilingual = z.object({ en: z.string().default(""), ar: z.string().default("") });

export const CardContent = z.object({
  verses: z.array(VerseRef).default([]),
  hadith: z.array(HadithRef).default([]),
  tafsir: z.array(TafsirExcerpt).default([]),
  /** Plain-language explanation (not Quran text). Every sentence must be supported by the evidence above. */
  explanation: Bilingual.default({ en: "", ar: "" }),
  /** Historical / civilisational note — non-sharia, needs an academic source. */
  civilizational_note: z.object({ en: z.string().default(""), ar: z.string().default(""), sources: z.array(SourceRef).default([]) }).optional(),
  /** For level C content: how scholars differ (no preference stated). */
  disagreement_note: Bilingual.optional(),
  show_count: z.boolean().default(false),
  glossary_terms: z.array(z.string()).default([]),
  related_cards: z.array(z.string()).default([]),
  sensitivity_flags: z.array(z.string()).default([]),
  image: z.object({ src: z.string(), credit: z.string(), license: z.string() }).optional(),
});
export type CardContent = z.infer<typeof CardContent>;

export type CardStatus = "ai_draft" | "student_submitted" | "researcher_approved" | "published" | "returned" | "archived";
export interface CardRow {
  id: string;
  kind: "concept" | "answer" | "item" | "art";
  concept_id: string | null;
  level: "A" | "B" | "C" | "D";
  certainty: "established" | "disputed" | "ijma";
  title_en: string;
  title_ar: string;
  match_phrases: string[];
  status: CardStatus;
  current_version: number;
  published_version: number | null;
  institution_id: string | null;
  published_at: string | null;
  updated_at: string;
}
