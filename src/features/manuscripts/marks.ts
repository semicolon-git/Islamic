/**
 * The manuscript tradition's own marks (research memo §2.1, M8). Marks are typed annotations placed after the word
 * they qualify. They are never part of the transcribed text: plain and reading text exclude them, and TEI exports
 * them as <metamark>.
 */
export const MARK_KINDS = ["sahh", "nuskha", "balagha", "hashiya", "intaha", "sic", "dabba", "zahir", "other"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export interface MarkInfo {
  kind: MarkKind;
  /** The sign as usually written. The transcriber may change it to what this scribe wrote. */
  glyph: string;
  /** Arabic technical name (always shown, also in the English UI). */
  term: string;
  /** Physical key (KeyboardEvent.code) after Ctrl+Shift+M. */
  key: string;
  /** TEI @function on <metamark>. */
  tei: string;
  /** Whether the mark carries a note (variant reading, gloss text, collation note). */
  note?: "variant" | "gloss" | "collation" | "free";
}

export const MARKS: MarkInfo[] = [
  { kind: "sahh", glyph: "صح", term: "تصحيح", key: "KeyS", tei: "sahh" },
  { kind: "nuskha", glyph: "خ", term: "نسخة", key: "KeyK", tei: "nuskha", note: "variant" },
  { kind: "balagha", glyph: "بلغ", term: "بلاغ", key: "KeyB", tei: "balagha", note: "collation" },
  { kind: "hashiya", glyph: "حاشية", term: "حاشية", key: "KeyH", tei: "gloss", note: "gloss" },
  { kind: "intaha", glyph: "اهـ", term: "انتهى", key: "KeyE", tei: "intaha" },
  { kind: "sic", glyph: "كذا", term: "كذا", key: "KeyY", tei: "sic" },
  { kind: "dabba", glyph: "ص", term: "ضبّة", key: "KeyD", tei: "dabba" },
  { kind: "zahir", glyph: "ظ", term: "الظاهر", key: "KeyZ", tei: "zahir", note: "variant" },
  { kind: "other", glyph: "※", term: "علامة أخرى", key: "KeyO", tei: "other", note: "free" },
];

export const markInfo = (kind: MarkKind): MarkInfo => MARKS.find((m) => m.kind === kind) ?? MARKS[MARKS.length - 1];

/** Special characters palette (memo §4.10): hamza forms, tanwin, shadda, sukun, dagger alef, dotless letters, Quranic marks. */
export const SPECIAL_CHARS: { group: string; chars: { ch: string; name: string }[] }[] = [
  {
    group: "hamza",
    chars: [
      { ch: "ء", name: "hamza" }, { ch: "أ", name: "alef with hamza above" }, { ch: "إ", name: "alef with hamza below" },
      { ch: "آ", name: "alef madda" }, { ch: "ؤ", name: "waw with hamza" }, { ch: "ئ", name: "yeh with hamza" },
      { ch: "ٱ", name: "alef wasla" }, { ch: "ٔ", name: "hamza above (combining)" }, { ch: "ٕ", name: "hamza below (combining)" },
    ],
  },
  {
    group: "harakat",
    chars: [
      { ch: "َ", name: "fatha" }, { ch: "ِ", name: "kasra" }, { ch: "ُ", name: "damma" },
      { ch: "ً", name: "tanwin fath" }, { ch: "ٍ", name: "tanwin kasr" }, { ch: "ٌ", name: "tanwin damm" },
      { ch: "ّ", name: "shadda" }, { ch: "ْ", name: "sukun" }, { ch: "ٰ", name: "dagger alef" },
      { ch: "ٓ", name: "maddah above" },
    ],
  },
  {
    group: "dotless",
    chars: [
      { ch: "ٮ", name: "dotless beh" }, { ch: "ڡ", name: "dotless feh" }, { ch: "ٯ", name: "dotless qaf" },
      { ch: "ں", name: "dotless noon" }, { ch: "ى", name: "alef maksura" }, { ch: "ڢ", name: "Maghribi feh" }, { ch: "ڧ", name: "Maghribi qaf" },
    ],
  },
  {
    group: "quranic",
    chars: [
      { ch: "ۖ", name: "small high ligature sad-lam-alef" }, { ch: "ۗ", name: "small high ligature qaf-lam-alef" },
      { ch: "ۚ", name: "small high jeem" }, { ch: "ۛ", name: "small high three dots" },
      { ch: "ۥ", name: "small waw" }, { ch: "ۦ", name: "small yeh" }, { ch: "۞", name: "rub el hizb" }, { ch: "۩", name: "place of sajdah" },
    ],
  },
  {
    group: "signs",
    chars: [
      { ch: "ﷺ", name: "sallallahu alayhi wasallam ligature" }, { ch: "ؐ", name: "small sallallahu sign" },
      { ch: "ؒ", name: "small rahmatullah sign" }, { ch: "‌", name: "zero-width non-joiner" },
      { ch: "٠", name: "Arabic-Indic zero" }, { ch: "۰", name: "Eastern Arabic-Indic zero" },
    ],
  },
];
