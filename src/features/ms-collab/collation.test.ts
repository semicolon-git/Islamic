import { describe, expect, it } from "vitest";
import { agreement, alignWords, buildApparatus, foldWord, markedWords, noteAr, noteEn, wordsOf } from "./collation";

const W = (text: string, line = "a-l1", n = 1) => wordsOf(text, line, n);

describe("word alignment", () => {
  it("folds spelling conventions so they are not variants", () => {
    expect(foldWord("حَتَاءَ")).toBe(foldWord("حتا"));
    expect(foldWord("بِكَيئة")).toBe(foldWord("بكيىه"));
    expect(foldWord("•")).toBe("");
  });

  it("drops punctuation-only runs and the gap placeholder", () => {
    expect(W("قال • تعالى […] ،").map((w) => w.w)).toEqual(["قال", "تعالى"]);
  });

  it("aligns word by word and groups replacements, omissions and additions", () => {
    const a = W("بذأه كمنعه الرجل الفاحش وقد بذأ");
    const b = W("بذأه كمنعه رأى منه حالا الرجل وقد بدأ", "b-l1");
    const ops = alignWords(a, b);
    expect(ops.map((o) => o.op)).toEqual(["equal", "insert", "equal", "delete", "equal", "replace"]);
    expect(agreement(ops)).toBeCloseTo(4 / 6);
  });

  it("identical passages align fully", () => {
    const a = W("وجعلوا له من عباده جزءا");
    expect(alignWords(a, W("وَجَعَلُوا لَهُ مِنْ عِبَادِهِ جُزْءًا", "b-l1"))).toHaveLength(1);
  });
});

describe("apparatus", () => {
  const base = [...W("بذأه كمنعه الرجل الفاحش", "a-l1", 1), ...W("وقد بذأ ويثلث", "a-l2", 2)];
  const ب = alignWords(base, W("بذأه كمنعه الرجل وقد بذأ ويثلث", "b-l4", 4));
  const ج = alignWords(base, W("بذاه كمنعه الرجل الفاحش وقد بدا ويثلث زيادة", "c-l9", 9));
  const app = buildApparatus(base, [{ siglum: "ب", ms_id: "B", ops: ب }, { siglum: "ج", ms_id: "C", ops: ج }]);

  it("one footnote per place, in base order, with every witness's reading", () => {
    expect(app.map((e) => [e.no, e.lemma, e.readings.map((r) => `${r.siglum}:${r.kind}:${r.text}`)])).toEqual([
      [1, "الفاحش", ["ب:omits:"]],
      [2, "بذأ", ["ج:reads:بدا"]],
      [3, "", ["ج:adds:زيادة"]],
    ]);
    expect(app[0].base_lines).toEqual(["a-l1"]);
    expect(app[1].readings[0].lines).toEqual(["c-l9"]);
  });

  it("writes notes in the Arabic editorial convention and in English", () => {
    expect(noteAr(app[0].readings[0])).toBe("سقط من (ب)");
    expect(noteAr(app[1].readings[0])).toBe("في (ج): بدا");
    expect(noteAr(app[2].readings[0])).toBe("زيادة في (ج): زيادة");
    expect(noteEn(app[1].readings[0])).toBe("(ج) reads: بدا");
    expect(noteEn(app[0].readings[0])).toBe("omitted in (ب)");
  });

  it("marks the base words that carry a footnote (an addition marks the word before it)", () => {
    const m = markedWords(app);
    expect(m.get(3)).toBe(1); // الفاحش
    expect(m.get(5)).toBe(2); // بذأ
    expect(m.get(6)).toBe(3); // ويثلث, before the addition
    expect(m.has(0)).toBe(false);
  });

  it("an alignment that starts later in the base keeps its positions (offset by an equal run)", () => {
    const tail = base.slice(4);
    const ops = alignWords(tail, W("وقد بدأ ويثلث", "b-l5"));
    const shifted = buildApparatus(base, [{ siglum: "ب", ms_id: "B", ops: [{ op: "equal", a: base.slice(0, 4), b: base.slice(0, 4) }, ...ops] }]);
    expect(shifted[0].from).toBe(5);
  });
});
