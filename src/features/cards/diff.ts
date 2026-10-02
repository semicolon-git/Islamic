import type { CardContent } from "@/lib/cards/types";
import type { CardMeta } from "./validate";

/** A saved version as the editor sees it: versioned meta + content. */
export interface VersionDoc {
  meta: Pick<CardMeta, "title_en" | "title_ar" | "level" | "certainty" | "concept_id" | "match_phrases">;
  content: CardContent;
}

export type WordOp = { op: "equal" | "insert" | "delete"; text: string };

export type DiffEntry =
  | { path: string; kind: "text"; words: WordOp[] }
  | { path: string; kind: "value"; before: string; after: string }
  | { path: string; kind: "list"; added: string[]; removed: string[]; reordered: boolean };

/** Word-level diff (LCS over whitespace-separated tokens, whitespace preserved). */
export function diffWords(a: string, b: string): WordOp[] {
  const ta = a.match(/\S+\s*/g) ?? [];
  const tb = b.match(/\S+\s*/g) ?? [];
  const n = ta.length, m = tb.length;
  if (n * m > 4_000_000) return [{ op: "delete", text: a }, { op: "insert", text: b }];
  const norm = (s: string) => s.trimEnd();
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i][j] = norm(ta[i]) === norm(tb[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops: WordOp[] = [];
  const push = (op: WordOp["op"], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.text += text;
    else ops.push({ op, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (norm(ta[i]) === norm(tb[j])) { push("equal", tb[j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) push("delete", ta[i++]);
    else push("insert", tb[j++]);
  }
  while (i < n) push("delete", ta[i++]);
  while (j < m) push("insert", tb[j++]);
  return ops;
}

function listDiff(path: string, a: string[], b: string[]): DiffEntry | null {
  const added = b.filter((x) => !a.includes(x));
  const removed = a.filter((x) => !b.includes(x));
  const common = (xs: string[], other: string[]) => xs.filter((x) => other.includes(x));
  const reordered = !added.length && !removed.length ? a.join("\u0001") !== b.join("\u0001") : common(a, b).join("\u0001") !== common(b, a).join("\u0001");
  if (!added.length && !removed.length && !reordered) return null;
  return { path, kind: "list", added, removed, reordered };
}

const verseLabel = (v: CardContent["verses"][number]) => `${v.key} · ${v.role}`;
const tafsirLabel = (t: CardContent["tafsir"][number]) => `${t.source_id} · ${t.verse_key} · ${t.excerpt_ar.slice(0, 48)}${t.excerpt_ar.length > 48 ? "…" : ""}`;

/** Readable, field-by-field diff between two versions (only changed fields are returned, in editor order). */
export function diffVersions(a: VersionDoc, b: VersionDoc): DiffEntry[] {
  const out: DiffEntry[] = [];
  const text = (path: string, x = "", y = "") => {
    if (x !== y) out.push({ path, kind: "text", words: diffWords(x, y) });
  };
  const value = (path: string, x: unknown, y: unknown) => {
    const sx = x == null ? "" : String(x), sy = y == null ? "" : String(y);
    if (sx !== sy) out.push({ path, kind: "value", before: sx, after: sy });
  };
  const list = (path: string, x: string[], y: string[]) => {
    const d = listDiff(path, x, y);
    if (d) out.push(d);
  };

  text("title_en", a.meta.title_en, b.meta.title_en);
  text("title_ar", a.meta.title_ar, b.meta.title_ar);
  value("level", a.meta.level, b.meta.level);
  value("certainty", a.meta.certainty, b.meta.certainty);
  value("concept_id", a.meta.concept_id, b.meta.concept_id);
  list("verses", a.content.verses.map(verseLabel), b.content.verses.map(verseLabel));
  list("hadith", a.content.hadith.map((h) => h.id), b.content.hadith.map((h) => h.id));
  list("tafsir", a.content.tafsir.map(tafsirLabel), b.content.tafsir.map(tafsirLabel));
  text("explanation.en", a.content.explanation.en, b.content.explanation.en);
  text("explanation.ar", a.content.explanation.ar, b.content.explanation.ar);
  text("civilizational_note.en", a.content.civilizational_note?.en, b.content.civilizational_note?.en);
  text("civilizational_note.ar", a.content.civilizational_note?.ar, b.content.civilizational_note?.ar);
  list("civilizational_note.sources", (a.content.civilizational_note?.sources ?? []).map((s) => s.citation), (b.content.civilizational_note?.sources ?? []).map((s) => s.citation));
  text("disagreement_note.en", a.content.disagreement_note?.en, b.content.disagreement_note?.en);
  text("disagreement_note.ar", a.content.disagreement_note?.ar, b.content.disagreement_note?.ar);
  value("show_count", a.content.show_count, b.content.show_count);
  list("glossary_terms", a.content.glossary_terms, b.content.glossary_terms);
  list("match_phrases", a.meta.match_phrases, b.meta.match_phrases);
  list("related_cards", a.content.related_cards, b.content.related_cards);
  return out;
}
