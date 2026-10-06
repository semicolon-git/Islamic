import "server-only";
import { sql } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { SessionUser } from "@/lib/auth";
import { createCard, saveCard } from "@/features/cards/server";
import { CardContent } from "@/lib/cards/types";
import { CardMetaSchema } from "@/features/cards/version";
import { getDiscovery } from "./server";
import { TAFSIR_SOURCES } from "@/features/cards/tafsir-sources";

/** Library book id → the card editor's tafsir preset (same labels everywhere). */
const PRESET: Record<string, string> = { "tafsir-muyassar": "muyassar", "tafsir-saadi": "saadi", "tafsir-ibn-kathir": "ibn_kathir", "tafsir-tabari": "tabari" };

/**
 * The review flywheel: turn a visitor's discovery into a DRAFT card (status ai_draft). Every verse, hadith and tafsir
 * excerpt is carried over by reference; the AI summary becomes a draft explanation for the student to rewrite.
 * Nothing is public until the normal student → researcher → institution workflow publishes it.
 */
export async function cardFromDiscovery(user: SessionUser, key: string): Promise<{ id: string; existed: boolean }> {
  const d = await getDiscovery(key);
  if (!d) throw new HttpError(404, "not_found", "This discovery doesn't exist.");
  const row = (await sql<{ card_id: string | null }>("select card_id from discoveries where key = $1", [key]))[0];
  if (row?.card_id) return { id: row.card_id, existed: true };

  const label_en = d.label_en || d.label_ar;
  const label_ar = d.label_ar || d.label_en;
  const title_en = `What do the Quran and Sunnah say about ${label_en}?`.slice(0, 200);
  const title_ar = `ماذا يقول القرآن والسنة عن ${label_ar}؟`.slice(0, 200);
  const { id } = await createCard(user, { kind: "answer", concept_id: null, title_en, title_ar });

  const strip = (s: string) => s.replace(/\s*\[[QHLB]:[^\]]+\]/g, "").trim();
  const content = CardContent.parse({
    verses: d.verses.map((v) => ({ key: v.verse.key, role: v.relation === "direct" ? "primary" : "supporting" })),
    hadith: d.hadith.filter((h) => /^H:(bukhari|muslim):\d+[a-z]?$/.test(h.id)).map((h) => ({ id: h.id.slice(2) })),
    tafsir: d.verses.filter((v) => v.tafsir).map((v) => {
      const preset = PRESET[v.tafsir!.book_id];
      return preset
        ? { source_id: preset, ...TAFSIR_SOURCES[preset], verse_key: v.verse.key, excerpt_ar: v.tafsir!.text }
        : { source_id: v.tafsir!.book_id, book_ar: v.tafsir!.title_ar, book_en: v.tafsir!.title_en, author_ar: v.tafsir!.author_ar, author_en: v.tafsir!.author_en, verse_key: v.verse.key, excerpt_ar: v.tafsir!.text };
    }),
    explanation: d.summary ? { en: strip(d.summary.en), ar: strip(d.summary.ar) } : { en: "", ar: "" },
    sensitivity_flags: d.status === "sensitive" ? ["sensitive_subject"] : [],
  });
  const meta = CardMetaSchema.parse({ title_en, title_ar, level: "A", certainty: "established", concept_id: null, match_phrases: [label_en, label_ar].filter(Boolean) });
  const other = d.hadith.filter((h) => !h.id.startsWith("H:")).map((h) => `${h.collection_en} ${h.number} (${h.grade}, ${h.grader})`);
  await saveCard(user, id, {
    base_version: 1,
    meta,
    content,
    note: `Drafted from a visitor discovery (sources found by AI and fetched by reference; the explanation is an AI draft). Check every item before submitting.${other.length ? ` Also found, not carried over (outside the two Sahihs): ${other.join("; ")}.` : ""}`,
  });
  await sql("update discoveries set card_id = $2 where key = $1", [key, id]);
  return { id, existed: false };
}
