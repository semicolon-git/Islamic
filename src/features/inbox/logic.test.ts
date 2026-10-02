import { describe, expect, it } from "vitest";
import { buildThreadContext, cannedText, CANNED, consentSummary, personHasJoined, publicCardPath, splitMessage, waitingSince } from "./logic";

describe("consent", () => {
  const offered = { question: "Why do Muslims fast?", card: { id: "card:moon", title_en: "The Moon", title_ar: "القمر" }, lang: "ar" as const };
  it("stores only what the visitor ticked", () => {
    expect(buildThreadContext({ question: true, card: true, lang: true }, offered)).toEqual({
      context: { question: "Why do Muslims fast?", card_id: "card:moon", card_title_en: "The Moon", card_title_ar: "القمر" },
      lang: "ar",
    });
    expect(buildThreadContext({ question: false, card: false, lang: false }, offered)).toEqual({ context: {}, lang: "und" });
    expect(buildThreadContext({ question: true, card: false, lang: true }, { ...offered, question: "   " })).toEqual({ context: {}, lang: "ar" });
  });
  it("summarises consent", () => {
    expect(consentSummary({ question: true, card: false, lang: true })).toEqual(["question", "lang"]);
    expect(consentSummary(null)).toEqual([]);
  });
});

describe("waiting time", () => {
  const m = (sender: "visitor" | "specialist" | "system", at: string) => ({ sender, created_at: at });
  it("starts at the first unanswered visitor message", () => {
    expect(waitingSince([m("visitor", "1"), m("visitor", "2")])).toBe("1");
    expect(waitingSince([m("visitor", "1"), m("specialist", "2")])).toBeNull();
    expect(waitingSince([m("visitor", "1"), m("specialist", "2"), m("system", "3"), m("visitor", "4"), m("visitor", "5")])).toBe("4");
    expect(waitingSince([])).toBeNull();
  });
  it("knows when a person has joined", () => {
    expect(personHasJoined([m("visitor", "1")])).toBe(false);
    expect(personHasJoined([m("visitor", "1"), m("specialist", "2")])).toBe(true);
  });
});

describe("canned replies", () => {
  it("has the three replies in both languages", () => {
    expect(CANNED.map((c) => c.id)).toEqual(["welcome", "ifta", "card"]);
    for (const c of CANNED) expect(c.en && c.ar).toBeTruthy();
    expect(CANNED.find((c) => c.id === "ifta")!.en).toContain("alifta.gov.sa");
  });
  it("uses the visitor's language when shared", () => {
    expect(cannedText("welcome", "ar", "en")).toBe(CANNED[0].ar);
    expect(cannedText("welcome", "und", "en")).toBe(CANNED[0].en);
  });
});

describe("card links in messages", () => {
  it("builds public paths", () => {
    expect(publicCardPath({ id: "card:moon", kind: "concept", concept_id: "moon" })).toBe("/c/moon");
    expect(publicCardPath({ id: "answer:kaaba", kind: "answer", concept_id: "qibla" })).toBe("/card/answer%3Akaaba");
  });
  it("splits text and links", () => {
    expect(splitMessage("Here: /c/moon. Thanks")).toEqual([
      { type: "text", value: "Here: " },
      { type: "link", value: "/c/moon" },
      { type: "text", value: ". Thanks" },
    ]);
    expect(splitMessage("no links here")).toEqual([{ type: "text", value: "no links here" }]);
    expect(splitMessage("a/c/moon")).toEqual([{ type: "text", value: "a/c/moon" }]);
  });
});
