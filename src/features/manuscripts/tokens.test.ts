import { describe, expect, it } from "vitest";
import {
  GAP_TEXT,
  acceptAlternative,
  applyMarkup,
  applyTextEdit,
  editorString,
  fromPlain,
  fromWords,
  insertAt,
  mergeAdjacent,
  normalizeTokens,
  plainText,
  readingText,
  replaceWithGap,
  sameTokens,
  segments,
  splitAt,
  teiToTokens,
  toRenderSpans,
  tokenAt,
  tokensCer,
  tokensToTei,
  trimRange,
  wordAt,
  type Tok,
} from "./tokens";
import { checkWellFormed } from "./xml";

const T = (v: string): Tok => ({ t: "text", v });

/** Simulate typing: replace [a,b) of the editor string by `ins`, caret after the insertion. */
function type(toks: Tok[], a: number, b: number, ins: string) {
  const s = editorString(toks);
  return applyTextEdit(toks, s, s.slice(0, a) + ins + s.slice(b), a + ins.length);
}

describe("text forms", () => {
  const toks: Tok[] = [
    T("قال "),
    { t: "abbr", v: "ثنا", expan: "حدثنا" },
    T(" "),
    { t: "unclear", v: "بشر", alts: ["بسر"], conf: 41 },
    { t: "mark", kind: "sahh", v: "صح" },
    T(" عن "),
    { t: "gap", reason: "damage", extent: 2, unit: "word" },
    T(" "),
    { t: "del", v: "الرجل", rend: "strike" },
    T(" "),
    { t: "add", v: "الفاحش", place: "margin" },
    T(" "),
    { t: "supplied", v: "و", reason: "omitted" },
    { t: "hi", rend: "red", v: "فصل" },
  ];
  it("diplomatic plain text keeps what is written, gaps as […], marks excluded", () => {
    expect(plainText(toks)).toBe("قال ثنا بشر عن […] الرجل الفاحش [و]فصل");
  });
  it("reading text applies confirmed expansions and drops scribal deletions", () => {
    expect(readingText(toks)).toBe("قال حدثنا بشر عن […] الفاحش وفصل");
  });
  it("unconfirmed expansions are not applied in the reading", () => {
    expect(readingText([{ t: "abbr", v: "ع", expan: "موضع", confirmed: false }])).toBe("ع");
  });
  it("never puts a mark into text", () => {
    expect(plainText([T("بذأ"), { t: "mark", kind: "sahh", v: "صح" }])).toBe("بذأ");
    expect(readingText([T("بذأ"), { t: "mark", kind: "sahh", v: "صح" }])).toBe("بذأ");
  });
  it("editor string shows gaps atomically and marks as zero width", () => {
    expect(editorString(toks)).toContain(GAP_TEXT);
    expect(editorString([T("ا"), { t: "mark", kind: "sic", v: "كذا" }, T("ب")])).toBe("اب");
  });
  it("fromPlain / fromWords", () => {
    expect(fromPlain("")).toEqual([]);
    expect(fromPlain("بدأ")).toEqual([T("بدأ")]);
    expect(fromWords([{ t: "قال", conf: 91 }, { t: "ثنا", conf: 35.6 }, { t: "", conf: 10 }, { t: "عن", conf: 80 }])).toEqual([
      T("قال "),
      { t: "unclear", v: "ثنا", conf: 36 },
      T(" عن"),
    ]);
  });
});

describe("structure", () => {
  it("merges adjacent text and drops empty spans", () => {
    expect(mergeAdjacent([T("a"), T("b"), { t: "unclear", v: "" }, T("c")])).toEqual([T("abc")]);
    expect(mergeAdjacent([{ t: "hi", rend: "red", v: "a" }, { t: "hi", rend: "red", v: "b" }])).toEqual([{ t: "hi", rend: "red", v: "ab" }]);
    expect(mergeAdjacent([{ t: "hi", rend: "red", v: "a" }, { t: "hi", rend: "overline", v: "b" }])).toHaveLength(2);
  });
  it("segments, tokenAt, splitAt", () => {
    const toks: Tok[] = [T("ab "), { t: "unclear", v: "cd", alts: ["x"] }, T(" e")];
    expect(segments(toks).map((s) => [s.start, s.end])).toEqual([[0, 3], [3, 5], [5, 7]]);
    expect(tokenAt(toks, 4)).toBe(1);
    expect(tokenAt(toks, 5)).toBe(1); // caret right after the word
    const split = splitAt(toks, 4);
    expect(split).toHaveLength(4);
    expect(split[1]).toEqual({ t: "unclear", v: "c" });
  });
  it("trimRange and wordAt", () => {
    expect(trimRange(" ab  ", 0, 5)).toEqual([1, 3]);
    expect(wordAt("قال حدثنا عن", 6)).toEqual([4, 9]);
    expect(wordAt("قال حدثنا عن", 9)).toEqual([4, 9]);
  });
});

describe("typing (applyTextEdit)", () => {
  it("inserts into plain text and keeps markup elsewhere", () => {
    const toks: Tok[] = [T("قال "), { t: "unclear", v: "بشر", conf: 30 }];
    const out = type(toks, 0, 0, "و");
    expect(out).toEqual([T("وقال "), { t: "unclear", v: "بشر", conf: 30 }]);
  });
  it("typing inside an unclear word keeps it unclear and drops stale alternatives", () => {
    const toks: Tok[] = [T("x "), { t: "unclear", v: "بسر", alts: ["بشر"] }];
    const out = type(toks, 3, 4, "ش");
    expect(out).toEqual([T("x "), { t: "unclear", v: "بشر" }]);
  });
  it("retyping a whole unclear word keeps the markup", () => {
    const toks: Tok[] = [T("x "), { t: "unclear", v: "القب" }];
    const out = type(toks, 2, 6, "الثقب");
    expect(out).toEqual([T("x "), { t: "unclear", v: "الثقب" }]);
  });
  it("extending a word at its end continues that word", () => {
    const toks: Tok[] = [{ t: "unclear", v: "كتا" }, T(" و")];
    expect(type(toks, 3, 3, "ب")).toEqual([{ t: "unclear", v: "كتاب" }, T(" و")]);
  });
  it("deleting part of a gap removes the whole gap", () => {
    const toks: Tok[] = [T("a "), { t: "gap", reason: "illegible" }, T(" b")];
    const s = editorString(toks);
    const out = applyTextEdit(toks, s, s.slice(0, 4) + s.slice(5), 4); // backspace inside "[…]"
    expect(out).toEqual([T("a  b")]);
  });
  it("marks survive edits next to them and go only when the deletion surrounds them", () => {
    const toks: Tok[] = [T("بذأ"), { t: "mark", kind: "sahh", v: "صح" }, T(" ثم")];
    const extended = type(toks, 3, 3, "ه");
    expect(extended).toEqual([T("بذأه"), { t: "mark", kind: "sahh", v: "صح" }, T(" ثم")]);
    const s = editorString(toks);
    expect(applyTextEdit(toks, s, "ثم", 0)).toEqual([T("ثم")]);
  });
  it("uses the caret to disambiguate repeated characters", () => {
    const toks: Tok[] = [T("a"), { t: "unclear", v: "b" }];
    // typing "b" between a and the unclear b: the caret says the new b is at index 1, so it continues the word before it
    const out = applyTextEdit(toks, "ab", "abb", 2);
    expect(out).toEqual([T("ab"), { t: "unclear", v: "b" }]);
    // the same keystroke after the unclear b extends the unclear word
    expect(applyTextEdit(toks, "ab", "abb", 3)).toEqual([T("a"), { t: "unclear", v: "bb" }]);
    const out2 = applyTextEdit([T("a "), { t: "unclear", v: "b" }], "a b", "a  b", 2);
    expect(out2).toEqual([T("a  "), { t: "unclear", v: "b" }]);
  });
  it("is a no-op when nothing changed and handles clearing the line", () => {
    const toks: Tok[] = [T("abc")];
    expect(applyTextEdit(toks, "abc", "abc")).toBe(toks);
    expect(applyTextEdit(toks, "abc", "", 0)).toEqual([]);
  });
  it("typing into an empty line creates text", () => {
    expect(applyTextEdit([], "", "بدأ", 3)).toEqual([T("بدأ")]);
  });
});

describe("markup operations", () => {
  const base = [T("بذأه كمنعه الرجل")];
  it("marks a selection unclear with alternatives", () => {
    const r = applyMarkup(base, 5, 10, { op: "unclear", alts: ["كمنعة"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tokens).toEqual([T("بذأه "), { t: "unclear", v: "كمنعه", alts: ["كمنعة"] }, T(" الرجل")]);
  });
  it("trims whitespace from the selection (double-click selects a trailing space)", () => {
    const r = applyMarkup(base, 5, 11, { op: "del", rend: "strike" });
    expect(r.ok && r.range).toEqual([5, 10]);
  });
  it("abbreviation keeps the written form and stores the expansion", () => {
    const r = applyMarkup([T("وة بالنهروان")], 1, 2, { op: "abbr", expan: "قرية" });
    expect(r.ok && r.tokens).toEqual([T("و"), { t: "abbr", v: "ة", expan: "قرية" }, T(" بالنهروان")]);
    if (r.ok) {
      expect(plainText(r.tokens)).toBe("وة بالنهروان");
      expect(readingText(r.tokens)).toBe("وقرية بالنهروان");
    }
  });
  it("supplied, add, hi and clear", () => {
    const s = applyMarkup(base, 0, 4, { op: "supplied", reason: "omitted" });
    expect(s.ok && s.tokens[0]).toEqual({ t: "supplied", v: "بذأه", reason: "omitted" });
    const a = applyMarkup(base, 11, 16, { op: "add", place: "above" });
    expect(a.ok && a.tokens[1]).toEqual({ t: "add", v: "الرجل", place: "above" });
    const h = applyMarkup(base, 0, 4, { op: "hi", rend: "red" });
    expect(h.ok && h.tokens[0]).toEqual({ t: "hi", rend: "red", v: "بذأه" });
    if (h.ok) {
      const c = applyMarkup(h.tokens, 0, 16, { op: "clear" });
      expect(c.ok && c.tokens).toEqual(base);
    }
  });
  it("re-wrapping an unclear word keeps its model score", () => {
    const toks: Tok[] = [{ t: "unclear", v: "abc", conf: 22 }];
    const r = applyMarkup(toks, 0, 3, { op: "unclear", cert: "low" });
    expect(r.ok && r.tokens).toEqual([{ t: "unclear", v: "abc", cert: "low", conf: 22 }]);
  });
  it("refuses empty selections and selections containing a gap", () => {
    expect(applyMarkup(base, 4, 5, { op: "unclear" })).toEqual({ ok: false, reason: "empty" });
    const withGap: Tok[] = [T("a "), { t: "gap", reason: "damage" }, T(" b")];
    expect(applyMarkup(withGap, 0, 7, { op: "unclear" })).toEqual({ ok: false, reason: "contains_gap" });
    expect(applyMarkup(base, 3, 99, { op: "unclear" }).ok).toBe(false);
  });
  it("a mark at the end of the selection stays after the new span", () => {
    const toks: Tok[] = [T("بذأ"), { t: "mark", kind: "sahh", v: "صح" }, T(" ثم")];
    const r = applyMarkup(toks, 0, 3, { op: "unclear" });
    expect(r.ok && r.tokens).toEqual([{ t: "unclear", v: "بذأ" }, { t: "mark", kind: "sahh", v: "صح" }, T(" ثم")]);
  });
  it("inserts marks after the word and gaps at the caret", () => {
    const m = insertAt(base, 2, { t: "mark", kind: "nuskha", v: "خ", note: "بدأه" });
    expect(m).toEqual([T("بذأه"), { t: "mark", kind: "nuskha", v: "خ", note: "بدأه" }, T(" كمنعه الرجل")]);
    const g = replaceWithGap(base, 5, 10, { t: "gap", reason: "illegible", extent: 1, unit: "word" });
    expect(g).toEqual([T("بذأه "), { t: "gap", reason: "illegible", extent: 1, unit: "word" }, T(" الرجل")]);
    expect(plainText(g)).toBe("بذأه […] الرجل");
    const g2 = replaceWithGap([], 0, 0, { t: "gap", reason: "lacuna" });
    expect(g2).toEqual([{ t: "gap", reason: "lacuna" }]);
  });
  it("accepts an alternative as certain text", () => {
    const toks: Tok[] = [T("x "), { t: "unclear", v: "القب", alts: ["الثقب"] }];
    expect(acceptAlternative(toks, 1, "الثقب")).toEqual([T("x الثقب")]);
    expect(acceptAlternative(toks, 0, "nope")).toBe(toks);
  });
});

describe("normalisation", () => {
  it("NFC: shadda + fatha in either order compare equal (no phantom diffs)", () => {
    const a = [T("بَّ")];
    const b = [T("بَّ")];
    expect(sameTokens(a, b)).toBe(true);
  });
  it("removes presentation forms, Persian letters and bidi controls, keeps ﷺ", () => {
    const r = normalizeTokens([T("ﻻ یک ‏ﷺ")]);
    expect(r.tokens).toEqual([T("لا يك ﷺ")]);
    expect(r.changes.sort()).toEqual(["bidi", "persian", "presentation"]);
    expect(normalizeTokens([T("ی")], { persianHand: true }).tokens).toEqual([T("ی")]);
  });
  it("normalises every string field (alternatives, expansions, notes)", () => {
    const r = normalizeTokens([{ t: "unclear", v: "a", alts: ["ک"] }, { t: "abbr", v: "x", expan: "ی" }, { t: "mark", kind: "nuskha", v: "خ", note: "ک" }]);
    expect(JSON.stringify(r.tokens)).not.toMatch(/[یک]/);
  });
});

describe("render plan", () => {
  const toks: Tok[] = [{ t: "abbr", v: "ع", expan: "موضع" }, { t: "del", v: "x" }, { t: "mark", kind: "sahh", v: "صح" }];
  it("diplomatic shows the written form, deletions and marks", () => {
    expect(toRenderSpans(toks).map((s) => [s.kind, s.text])).toEqual([["abbr", "ع"], ["del", "x"], ["mark", "صح"]]);
  });
  it("reading shows expansions and hides deletions and marks", () => {
    expect(toRenderSpans(toks, "reading").map((s) => [s.kind, s.text])).toEqual([["abbr", "موضع"]]);
  });
});

describe("TEI", () => {
  const all: Tok[] = [
    T("قال "),
    { t: "unclear", v: "بشر", alts: ["بسر", "يسر"], conf: 41 },
    { t: "unclear", v: "عن", cert: "low" },
    { t: "gap", reason: "damage", extent: 2, unit: "word" },
    { t: "gap", reason: "illegible" },
    { t: "supplied", v: "و", reason: "omitted" },
    { t: "del", v: "الرجل", rend: "la_ila" },
    { t: "add", v: "الفاحش", place: "margin" },
    { t: "abbr", v: "ثنا", expan: "حدثنا" },
    { t: "abbr", v: "ع", expan: "موضع", confirmed: false },
    { t: "mark", kind: "sahh", v: "صح" },
    { t: "mark", kind: "nuskha", v: "خ", note: "بدأ <و> & \"x\"" },
    { t: "hi", rend: "red", v: "فصل" },
    { t: "unclear", v: "باب", conf: 30, rend: "gold" },
    { t: "hi", rend: "gold", v: "الهمزة" },
    T(" & <tail>"),
  ];
  it("maps every token type to TEI", () => {
    const x = tokensToTei(all);
    expect(x).toContain('<choice><unclear cert="medium" n="41">بشر</unclear><unclear>بسر</unclear>');
    expect(x).toContain('<gap reason="damage" extent="2" unit="word"/>');
    expect(x).toContain('<supplied reason="omitted">و</supplied>');
    expect(x).toContain('<del rend="la-ila">الرجل</del>');
    expect(x).toContain('<add place="margin">الفاحش</add>');
    expect(x).toContain("<choice><abbr>ثنا</abbr><expan>حدثنا</expan></choice>");
    expect(x).toContain('<metamark function="sahh">صح</metamark>');
    expect(x).toContain('<hi rend="red">فصل</hi>');
    expect(x).toContain("&amp; &lt;tail&gt;");
  });
  it("is well-formed XML", () => {
    expect(checkWellFormed(`<ab>${tokensToTei(all)}</ab>`)).toEqual({ ok: true });
  });
  it("round-trips losslessly", () => {
    expect(teiToTokens(tokensToTei(all))).toEqual(all);
  });
});

describe("CER", () => {
  it("scores the diplomatic text against a reference ignoring diacritics", () => {
    expect(tokensCer([T("بَدَأَ")], "بدأ")).toBe(0);
    expect(tokensCer([T("بدا")], "بدأ")).toBeCloseTo(1 / 3);
    expect(tokensCer([T("بدا")], "بدأ", true)).toBe(0);
    expect(tokensCer([T("x")], "")).toBeNull();
  });
});
