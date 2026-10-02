import type { CardContent } from "@/lib/cards/types";
import type { LintWarning } from "./lint";

/**
 * Validation checklist that must pass before a card can be submitted, approved or published.
 * Pure: the caller supplies which verse keys / hadith ids exist (from the DB on the server, from the resolver on the client).
 */
export type CheckId =
  | "titles"
  | "evidence"
  | "verse_keys_exist"
  | "hadith_exist"
  | "no_duplicates"
  | "tafsir_labelled"
  | "explanation_bilingual"
  | "notes_bilingual"
  | "disagreement_required"
  | "match_phrases"
  | "lint";

export interface CheckItem {
  id: CheckId;
  ok: boolean;
  /** Offending values (missing keys, unlabelled excerpt numbers, missing languages…). */
  detail: string[];
}

export interface CardMeta {
  kind: "concept" | "answer" | "item" | "art";
  level: "A" | "B" | "C" | "D";
  certainty: "established" | "disputed" | "ijma";
  title_en: string;
  title_ar: string;
  concept_id: string | null;
  match_phrases: string[];
}

export interface ValidateInput {
  meta: CardMeta;
  content: CardContent;
  knownVerseKeys: Iterable<string>;
  knownHadithIds: Iterable<string>;
  lint: LintWarning[];
  lintAcknowledged: boolean;
}

const filled = (s: string | undefined | null) => !!s && s.trim().length > 0;

export function validateCard(input: ValidateInput): CheckItem[] {
  const { meta, content } = input;
  const verses = new Set(input.knownVerseKeys);
  const hadith = new Set(input.knownHadithIds);
  const items: CheckItem[] = [];
  const add = (id: CheckId, detail: string[]) => items.push({ id, ok: detail.length === 0, detail });

  add("titles", [!filled(meta.title_en) && "en", !filled(meta.title_ar) && "ar"].filter(Boolean) as string[]);
  add("evidence", content.verses.length + content.hadith.length > 0 ? [] : ["none"]);
  add("verse_keys_exist", content.verses.map((v) => v.key).filter((k) => !verses.has(k)));
  add("hadith_exist", content.hadith.map((h) => h.id).filter((id) => !hadith.has(id)));

  const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
  add("no_duplicates", [...new Set([...dup(content.verses.map((v) => v.key)), ...dup(content.hadith.map((h) => h.id))])]);

  const verseKeys = new Set(content.verses.map((v) => v.key));
  add(
    "tafsir_labelled",
    content.tafsir
      .map((t, i) => {
        const ok =
          filled(t.source_id) && filled(t.book_en) && filled(t.book_ar) && filled(t.author_en) && filled(t.author_ar) &&
          filled(t.excerpt_ar) && verseKeys.has(t.verse_key);
        return ok ? null : String(i + 1);
      })
      .filter((x): x is string => !!x),
  );

  add("explanation_bilingual", [!filled(content.explanation.en) && "en", !filled(content.explanation.ar) && "ar"].filter(Boolean) as string[]);

  const notes: string[] = [];
  const civ = content.civilizational_note;
  if (civ && (filled(civ.en) || filled(civ.ar) || civ.sources.length)) {
    if (!filled(civ.en)) notes.push("civilizational_note.en");
    if (!filled(civ.ar)) notes.push("civilizational_note.ar");
    if (!civ.sources.some((s) => filled(s.citation))) notes.push("civilizational_note.sources");
  }
  const dis = content.disagreement_note;
  if (dis && (filled(dis.en) || filled(dis.ar))) {
    if (!filled(dis.en)) notes.push("disagreement_note.en");
    if (!filled(dis.ar)) notes.push("disagreement_note.ar");
  }
  add("notes_bilingual", notes);

  if (meta.level === "C") add("disagreement_required", [!filled(dis?.en) && "en", !filled(dis?.ar) && "ar"].filter(Boolean) as string[]);
  if (meta.kind === "answer") add("match_phrases", meta.match_phrases.some(filled) ? [] : ["none"]);

  add("lint", input.lint.length && !input.lintAcknowledged ? [String(input.lint.length)] : []);
  return items;
}

export const checklistPasses = (items: CheckItem[]) => items.every((i) => i.ok);
