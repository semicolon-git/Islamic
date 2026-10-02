import { describe, expect, it } from "vitest";
import { buildRetriever, retrieve, THRESHOLD } from "./retriever";
import { fixture } from "./__fixtures__/deps";
import type { Catalogue } from "./catalogue";

const ix = buildRetriever(fixture().catalogue);
const top = (q: string) => retrieve(ix, q)[0]?.card.id ?? null;

describe("deterministic retriever", () => {
  it.each([
    ["Why do Muslims worship the Kaaba?", "answer:kaaba"],
    ["لماذا يعبد المسلمون الكعبة؟", "answer:kaaba"],
    ["Why do Muslims fast?", "answer:fasting"],
    ["When does Ramadan start?", "answer:ramadan_start"],
    ["Did Islam spread by the sword?", "answer:spread_by_sword"],
    ["Why do scholars' rulings differ?", "answer:why_rulings_differ"],
    ["لماذا تختلف فتاوى العلماء؟", "answer:why_rulings_differ"],
    ["Why don't Muslims eat pork?", "answer:pork"],
    ["What are the five pillars of Islam?", "answer:five_pillars"],
    ["ما هي أركان الإسلام؟", "answer:five_pillars"],
    ["What does the Quran say about the moon?", "card:moon"],
  ])("%s → %s", (q, id) => {
    expect(top(q)).toBe(id);
  });

  it("returns nothing when no approved card is relevant (E can be empty)", () => {
    expect(retrieve(ix, "What is the capital of France?")).toEqual([]);
    expect(retrieve(ix, "Who won the football world cup?")).toEqual([]);
    expect(retrieve(ix, "Tell me about quantum physics")).toEqual([]);
  });

  it("generic words alone never match", () => {
    expect(retrieve(ix, "What do Muslims believe about Islam and the Quran?")).toEqual([]);
  });

  it("scores the best sentence, so an added remark does not dilute the question", () => {
    expect(top("Why does Islam forbid pork? It seems pointless to me.")).toBe("answer:pork");
  });

  it("exposes coverage and phrase hits; 'all' returns sub-threshold candidates too", () => {
    const h = retrieve(ix, "Do Muslims worship the Kaaba?")[0];
    expect(h.phrase).toBe(true);
    expect(h.coverage).toBeGreaterThanOrEqual(THRESHOLD.phraseCoverage);
    expect(retrieve(ix, "What is the capital of France?", { all: true }).length).toBeGreaterThan(0);
  });

  it("works on an empty catalogue", () => {
    const empty: Catalogue = { version: "0", cards: [], glossary: [] };
    expect(retrieve(buildRetriever(empty), "Why do Muslims fast?")).toEqual([]);
  });
});
