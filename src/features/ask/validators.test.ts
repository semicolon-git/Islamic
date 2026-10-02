import { describe, expect, it } from "vitest";
import { findQuranInProse, validate, type ValidationContext } from "./validators";
import { fixture } from "./__fixtures__/deps";
import type { ComposedBlock } from "./types";

const f = fixture();
const base = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  level: "A",
  evidence: new Set(["C:answer:kaaba", "Q:2:144", "Q:106:3", "H:bukhari:1597", "C:card:moon", "Q:10:5", "G:tawhid"]),
  cards: [
    { id: "answer:kaaba", certainty: "established", verses: ["2:144", "106:3"], hasTafsir: false },
    { id: "five", certainty: "ijma", verses: ["2:43"], hasTafsir: false },
  ],
  glossary: f.catalogue.glossary,
  quranIndex: f.ix,
  model: null,
  ...over,
});
const expl = (text: string, cites = ["C:answer:kaaba"]): ComposedBlock => ({ type: "explanation", text, cites });
const status = (blocks: ComposedBlock[], id: string, ctx = base()) => validate(blocks, ctx).find((c) => c.id === id)?.status;

const GOOD: ComposedBlock[] = [
  { type: "quote", ref: "Q:106:3" },
  expl("Muslims worship Allah alone; the Kaaba is the direction they face in prayer.", ["C:answer:kaaba", "Q:2:144"]),
];

describe("V0 — model call", () => {
  it("is skipped for deterministic answers and passes valid calls", () => {
    expect(status(GOOD, "V0")).toBe("skip");
    expect(status(GOOD, "V0", base({ model: { ok: true, schemaValid: true, stopReason: "end_turn" } }))).toBe("pass");
  });
  it("fails on errors, invalid schema or a non end_turn stop", () => {
    expect(status(GOOD, "V0", base({ model: { ok: false, schemaValid: false, error: "refusal" } }))).toBe("fail");
    expect(status(GOOD, "V0", base({ model: { ok: true, schemaValid: true, stopReason: "max_tokens" } }))).toBe("fail");
  });
});

describe("V1 — refs in evidence", () => {
  it("passes", () => expect(status(GOOD, "V1")).toBe("pass"));
  it("fails on a ref outside E", () => expect(status([{ type: "quote", ref: "Q:9:5" }], "V1")).toBe("fail"));
  it("fails on a cite outside E", () => expect(status([expl("Text.", ["H:bukhari:1"])], "V1")).toBe("fail"));
});

describe("V2 — explanations are cited", () => {
  it("passes", () => expect(status(GOOD, "V2")).toBe("pass"));
  it("fails without a citation", () => expect(status([expl("Uncited claim.", [])], "V2")).toBe("fail"));
  it("checks disagreement views too", () => expect(status([{ type: "disagreement", views: [{ text: "A view.", cites: [] }] }], "V2")).toBe("fail"));
});

describe("V3 — no Quran text in prose", () => {
  it("passes plain prose", () => expect(status(GOOD, "V3")).toBe("pass"));
  it("catches short verse phrases with particles («لا إكراه في الدين»)", () => {
    expect(status([expl("يقرر القرآن أنه لا إكراه في الدين")], "V3")).toBe("fail");
  });
  it("fails when a verse is typed into prose (Arabic)", () => {
    expect(status([expl("كما قال تعالى هو الذي جعل الشمس ضياء والقمر نورا")], "V3")).toBe("fail");
  });
  it("catches near-copies too (≥ 0.8 similarity)", () => {
    expect(findQuranInProse("قال: الله لا اله الا هو الحي القيم", f.ix)).not.toBeNull();
  });
  it("fails on copied English translation of a verse in E", () => {
    const ctx = base({ translations: { "10:5": f.verses.get("10:5")!.translation!.text } });
    expect(status([expl("It is He who made the sun a shining light and the moon a derived light", ["Q:10:5"])], "V3", ctx)).toBe("fail");
  });
  it("fails closed when the index is unavailable", () => expect(status([expl("Text.")], "V3", base({ quranIndex: null }))).toBe("fail"));
  it("only warns for human-approved card text", () => {
    expect(status([expl("هو الذي جعل الشمس ضياء والقمر نورا")], "V3", base({ approvedText: true }))).toBe("warn");
  });
});

describe("V4 — hadith attribution needs an H: ref", () => {
  it("passes when cited", () => expect(status([expl("The Prophet ﷺ said that deeds are by intentions.", ["H:bukhari:1597"])], "V4")).toBe("pass"));
  it("fails when uncited", () => expect(status([expl("The Prophet said that deeds are by intentions.")], "V4")).toBe("fail"));
  it("fails in Arabic", () => expect(status([expl("قال رسول الله إن الأعمال بالنيات")], "V4")).toBe("fail"));
  it("does not flag a mere mention of the Prophet", () => expect(status([expl("The Quran asks the Prophet ﷺ whether he would compel people.")], "V4")).toBe("pass"));
});

describe("V5 — no grades in prose", () => {
  it("passes; collection names are not grades", () => expect(status([expl("This is reported in Sahih al-Bukhari.")], "V5")).toBe("pass"));
  it("fails on a grade word", () => expect(status([expl("This hadith is authentic.")], "V5")).toBe("fail"));
  it("fails on an Arabic grade word", () => expect(status([expl("وهذا حديث ضعيف")], "V5")).toBe("fail"));
});

describe("V6 — no occurrence counts in prose", () => {
  it("passes on ordinary numbers", () => expect(status([expl("There are five pillars and Ramadan is the ninth month.")], "V6")).toBe("pass"));
  it("fails on a count claim", () => expect(status([expl("The moon is mentioned 27 times in the Quran.")], "V6")).toBe("fail"));
  it("fails in Arabic", () => expect(status([expl("ذكر القمر في القرآن ٢٧ مرة")], "V6")).toBe("fail"));
});

describe("V7 — level policy", () => {
  it("passes level D with a referral and no ruling", () => {
    expect(status([expl("Marriage in Islam is a contract.", ["C:answer:kaaba"]), { type: "referral", reason: "personal" }], "V7", base({ level: "D" }))).toBe("pass");
  });
  it("fails level D without a referral", () => expect(status([expl("General info.")], "V7", base({ level: "D" }))).toBe("fail"));
  it("fails ruling phrases at level D", () => {
    expect(status([expl("You must repeat the contract."), { type: "referral", reason: "x" }], "V7", base({ level: "D" }))).toBe("fail");
  });
  it("fails ruling phrases at any level", () => expect(status([expl("It is permissible for you to do this.")], "V7")).toBe("fail"));
  it("fails level C without disagreement or referral", () => expect(status([expl("Scholars say X.")], "V7", base({ level: "C" }))).toBe("fail"));
  it("passes level C with a disagreement block", () => {
    expect(status([{ type: "disagreement", views: [{ text: "One view.", cites: ["C:answer:kaaba"] }] }], "V7", base({ level: "C" }))).toBe("pass");
  });
  it("fails a stated preference", () => expect(status([expl("The correct view is the first one.")], "V7")).toBe("fail"));
  it("fails more than 3 views", () => {
    const v = { text: "A view.", cites: ["C:answer:kaaba"] };
    expect(status([{ type: "disagreement", views: [v, v, v, v] }], "V7", base({ level: "C" }))).toBe("fail");
  });
  it("allows consensus words only with an ijma'-tagged card cited", () => {
    expect(status([expl("There is consensus on this.", ["C:answer:kaaba"])], "V7")).toBe("fail");
    const ctx = base({ evidence: new Set(["C:five"]) });
    expect(status([expl("There is consensus on this.", ["C:five"])], "V7", ctx)).toBe("pass");
  });
});

describe("V8 — glossary term-lock", () => {
  it("passes with the approved equivalent", () => expect(status([expl("Tawhid (Oneness of God) is central.", ["G:tawhid"])], "V8")).toBe("pass"));
  it("fails a variant without the approved equivalent", () => expect(status([expl("Monotheism is central.", ["G:tawhid"])], "V8")).toBe("fail"));
  it("fails a banned rendering", () => expect(status([expl("Tawhid means unity.", ["G:tawhid"])], "V8")).toBe("fail"));
  it("fails a loaded term in use, but allows it quoted as a mention", () => {
    expect(status([expl("Jihad is a holy war.")], "V8")).toBe("fail");
    expect(status([expl("Rendering jihad as 'holy war' is misleading.")], "V8")).toBe("pass");
  });
});

describe("V9 — persona and science framing", () => {
  it("passes", () => expect(status(GOOD, "V9")).toBe("pass"));
  it("fails a persona", () => expect(status([expl("As a scholar, I can tell you this.")], "V9")).toBe("fail"));
  it("fails science-miracle framing", () => expect(status([expl("Science proves the Quran is right.")], "V9")).toBe("fail"));
  it("fails Arabic framing", () => expect(status([expl("هذا من الإعجاز العلمي")], "V9")).toBe("fail"));
});

describe("V10 — sensitive verses", () => {
  it("passes when no sensitive verse is in E", () => expect(status(GOOD, "V10")).toBe("pass"));
  it("fails when a sensitive verse has no approved card or tafsir", () => {
    expect(status([{ type: "quote", ref: "Q:9:5" }], "V10", base({ evidence: new Set(["Q:9:5"]) }))).toBe("fail");
  });
  it("passes when an approved card covering it is cited", () => {
    const ctx = base({ evidence: new Set(["Q:9:5", "C:ctx"]), cards: [{ id: "ctx", certainty: "established", verses: ["9:5"], hasTafsir: false }] });
    expect(status([{ type: "quote", ref: "Q:9:5" }, expl("Context.", ["C:ctx"])], "V10", ctx)).toBe("pass");
  });
});
