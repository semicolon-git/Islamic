import { describe, expect, it, vi } from "vitest";
import { discover, searchTerms, type DiscoverDeps } from "./pipeline";
import { citedIds, stripCitations } from "./ai";
import type { DiscoverInput } from "./types";

const AYA = (key: string, en = "…") => {
  const [sura, aya] = key.split(":").map(Number);
  return { key, sura, aya, text_uthmani: `نص ${key}`, sura_name_ar: "الأنعام", sura_name_en: "Al-Anʿam", translation: { edition_id: "en", edition_name: "Saheeh", text: en } };
};
const HAD = (id: string) => ({ id, collection: id.split(":")[0] as "bukhari", number: id.split(":")[1], text_ar: "حديث", text_en: "hadith", grade: "Sahih", grader: "al-Bukhari", numbering_scheme: "std", source_url: null });

function deps(over: Partial<DiscoverDeps> & { judge?: unknown; verify?: unknown; rewrite?: unknown } = {}): DiscoverDeps {
  const call = vi.fn().mockImplementation(async (req: { system: string }) => {
    if (req.system.startsWith("You help an Islamic-content app find")) return { data: { quran: ["6:99", "99:99"], hadith: ["bukhari:5427"] }, model: "m", usage: {}, fallback_used: false };
    if (req.system.startsWith("You are the evidence checker")) return { data: over.judge, model: "m", usage: {}, fallback_used: false };
    if (req.system.startsWith("You independently check")) return { data: over.verify ?? { supported: true, problems: [] }, model: "m", usage: {}, fallback_used: false };
    if (req.system.startsWith("You fix a short")) return { data: over.rewrite, model: "m", usage: {}, fallback_used: false };
    throw new Error("unexpected call");
  });
  return {
    ai: true,
    call: call as unknown as DiscoverDeps["call"],
    searchQuran: async () => [{ key: "6:141", ar: 1, en: 1, terms: ["الرمان"] }, { key: "55:68", ar: 1, en: 0, terms: ["رمان"] }],
    getAyat: async (keys) => keys.filter((k) => k !== "99:99").map((k) => AYA(k)),
    searchSahihayn: async () => [{ ...HAD("muslim:2448"), matched: 1, terms: ["رمان"] }],
    getHadith: async (ids) => ids.map(HAD),
    searchLibraryHadith: async () => [],
    searchBooks: async () => [],
    tafsirFor: async (k) => ({ book_id: "tafsir-muyassar", title_en: "Muyassar", title_ar: "الميسر", author_en: "", author_ar: "", range: k, text: "تفسير" }),
    science: async () => [{ kind: "scientist", id: "al-dinawari", name_en: "al-Dinawari", name_ar: "الدينوري" }],
    quranIndex: async () => null,
    ...over,
  };
}

const INPUT: DiscoverInput = { label_en: "pomegranate", label_ar: "رمان", category: "food", search_terms_ar: ["الرمان"], search_terms_en: ["pomegranate"], source: "snap" };
const item = (id: string, relation: string) => ({ id, relation, reason_en: `r ${id}`, reason_ar: `س ${id}` });

describe("discover pipeline", () => {
  it("keeps only judged passages, fetched by reference; drops unknown proposed keys", async () => {
    const r = await discover(INPUT, deps({
      judge: { label_en: "pomegranate", label_ar: "رمان", items: [item("Q:6:99", "direct"), item("Q:55:68", "thematic"), item("H:bukhari:5427", "unrelated")], summary_en: "Named among fruits [Q:6:99].", summary_ar: "يذكر بين الثمار [Q:6:99].", science: [{ id: "al-dinawari", reason_en: "Book of Plants", reason_ar: "كتاب النبات" }, { id: "made-up", reason_en: "x", reason_ar: "x" }] },
    }));
    expect(r.verses.map((v) => v.id)).toEqual(["Q:6:99", "Q:55:68"]);
    expect(r.verses[0].tafsir?.book_id).toBe("tafsir-muyassar");
    expect(r.hadith).toEqual([]);
    expect(r.summary?.cites).toEqual(["Q:6:99"]);
    expect(r.science.map((s) => s.id)).toEqual(["al-dinawari"]);
    expect(r.tier).toBe("sources");
    expect(r.no_direct_mention).toBe(false);
  });

  it("drops a summary that cites a passage that is not shown", async () => {
    const r = await discover(INPUT, deps({
      judge: { label_en: "p", label_ar: "ر", items: [item("Q:6:99", "direct")], summary_en: "A [Q:6:99]. B [H:bukhari:5427].", summary_ar: "أ [Q:6:99]. ب [H:bukhari:5427].", science: [] },
    }));
    expect(r.summary).toBeNull();
    expect(r.checks.find((c) => c.id === "summary")?.status).toBe("fail");
  });

  it("drops the summary when the independent check fails", async () => {
    const r = await discover(INPUT, deps({
      judge: { label_en: "p", label_ar: "ر", items: [item("Q:6:99", "direct")], summary_en: "It cures all illness [Q:6:99].", summary_ar: "يشفي من كل داء [Q:6:99].", science: [] },
      verify: { supported: false, problems: ["unsupported claim"] },
    }));
    expect(r.summary).toBeNull();
    expect(r.verses).toHaveLength(1);
    expect(r.checks.find((c) => c.id === "verify")?.status).toBe("fail");
  });

  it("rewrites once when lint fails (miracle framing), then keeps the clean version", async () => {
    const r = await discover(INPUT, deps({
      judge: { label_en: "p", label_ar: "ر", items: [item("Q:6:99", "direct")], summary_en: "This is a scientific miracle of the Quran [Q:6:99].", summary_ar: "هذا إعجاز علمي [Q:6:99].", science: [] },
      rewrite: { summary_en: "Named among the fruits [Q:6:99].", summary_ar: "يُذكر بين الثمار [Q:6:99]." },
    }));
    expect(r.checks.find((c) => c.id === "lint")?.status).toBe("fail");
    expect(r.checks.find((c) => c.id === "rewrite")?.status).toBe("pass");
    expect(r.summary?.en).toBe("Named among the fruits [Q:6:99].");
  });

  it("never searches or describes a person", async () => {
    const d = deps();
    const r = await discover({ ...INPUT, label_en: "a person", label_ar: "شخص", category: "person" }, d);
    expect(r.status).toBe("sensitive");
    expect(d.call).not.toHaveBeenCalled();
  });

  it("sensitive subjects get sources only, no summary", async () => {
    const r = await discover({ ...INPUT, sensitive: true }, deps({
      judge: { label_en: "p", label_ar: "ر", items: [item("Q:6:99", "direct")], summary_en: "S [Q:6:99].", summary_ar: "س [Q:6:99].", science: [] },
    }));
    expect(r.status).toBe("sensitive");
    expect(r.summary).toBeNull();
    expect(r.verses).toHaveLength(1);
  });

  it("without AI: only passages that contain the word, labelled as such", async () => {
    const r = await discover(INPUT, { ...deps(), ai: false });
    expect(r.ai).toBe(false);
    expect(r.verses.map((v) => v.id)).toEqual(["Q:6:141", "Q:55:68"]);
    expect(r.verses[0].reason.en).toContain("«الرمان»");
    expect(r.summary).toBeNull();
  });

  it("an honest empty result when nothing is found", async () => {
    const r = await discover({ ...INPUT, label_en: "coffee cup", label_ar: "فنجان قهوة" }, {
      ...deps({ judge: { label_en: "coffee cup", label_ar: "فنجان قهوة", items: [], summary_en: "", summary_ar: "", science: [] } }),
      searchQuran: async () => [], searchSahihayn: async () => [], getHadith: async () => [], getAyat: async () => [],
    });
    expect(r.status).toBe("empty");
    expect(r.tier).toBe("none");
  });
});

describe("helpers", () => {
  it("search terms add short labels", () => {
    expect(searchTerms({ label_en: "The Camel", label_ar: "جمل", source: "search" })).toEqual({ ar: ["جمل"], en: ["camel"] });
  });
  it("citations", () => {
    expect(citedIds("a [Q:6:99] b [H:bukhari:12] c [L:hadith-tirmidhi:5] [B:upl_x:p3.1]")).toEqual(["Q:6:99", "H:bukhari:12", "L:hadith-tirmidhi:5", "B:upl_x:p3.1"]);
    expect(stripCitations("a [Q:6:99] b [Q:1:1].", new Set(["Q:6:99"]))).toBe("a [Q:6:99] b.");
  });
});
