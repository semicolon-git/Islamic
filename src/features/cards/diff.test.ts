import { describe, expect, it } from "vitest";
import { CardContent } from "@/lib/cards/types";
import { diffVersions, diffWords, type VersionDoc } from "./diff";

const doc = (over: Partial<VersionDoc["meta"]> = {}, content: Partial<CardContent> = {}): VersionDoc => ({
  meta: { title_en: "The Moon", title_ar: "القمر", level: "A", certainty: "established", concept_id: "moon", match_phrases: [], ...over },
  content: CardContent.parse({ verses: [{ key: "10:5" }, { key: "36:39", role: "supporting" }], explanation: { en: "The moon is a sign.", ar: "القمر آية." }, ...content }),
});

describe("word diff", () => {
  it("marks inserted and deleted words, keeping equal runs together", () => {
    expect(diffWords("the moon is a sign", "the moon is a great sign")).toEqual([
      { op: "equal", text: "the moon is a " },
      { op: "insert", text: "great " },
      { op: "equal", text: "sign" },
    ]);
    expect(diffWords("a b c", "a c")).toEqual([{ op: "equal", text: "a " }, { op: "delete", text: "b " }, { op: "equal", text: "c" }]);
  });
  it("works on Arabic", () => {
    const ops = diffWords("القمر آية", "القمر آية من آيات الله");
    expect(ops.filter((o) => o.op === "insert").map((o) => o.text.trim())).toEqual(["من آيات الله"]);
  });
  it("handles empty sides", () => {
    expect(diffWords("", "new text")).toEqual([{ op: "insert", text: "new text" }]);
    expect(diffWords("old", "")).toEqual([{ op: "delete", text: "old" }]);
  });
});

describe("version diff", () => {
  it("returns nothing for identical versions", () => {
    expect(diffVersions(doc(), doc())).toEqual([]);
  });
  it("reports text, value and list changes in editor order", () => {
    const b = doc({ level: "B", title_en: "The Moon and Its Phases" }, {
      verses: [{ key: "36:39", role: "supporting" }, { key: "10:5", role: "primary" }, { key: "41:37", role: "supporting" }],
      hadith: [{ id: "bukhari:1042" }],
      explanation: { en: "The moon is a clear sign.", ar: "القمر آية." },
    });
    const d = diffVersions(doc(), b);
    expect(d.map((x) => x.path)).toEqual(["title_en", "level", "verses", "hadith", "explanation.en"]);
    const verses = d.find((x) => x.path === "verses");
    expect(verses).toEqual({ path: "verses", kind: "list", added: ["41:37 · supporting"], removed: [], reordered: true });
    expect(d.find((x) => x.path === "level")).toEqual({ path: "level", kind: "value", before: "A", after: "B" });
  });
  it("detects pure reordering", () => {
    const b = doc({}, { verses: [{ key: "36:39", role: "supporting" }, { key: "10:5", role: "primary" }] });
    expect(diffVersions(doc(), b)).toEqual([{ path: "verses", kind: "list", added: [], removed: [], reordered: true }]);
  });
});
