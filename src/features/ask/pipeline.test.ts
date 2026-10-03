import { afterEach, describe, expect, it, vi } from "vitest";
import { answer, lexicalSupport, type AskDeps } from "./pipeline";
import { testDeps } from "./__fixtures__/deps";
import { AiFailure } from "@/lib/ai/claude";
import type { AskResult } from "./types";

const ask = (q: string, deps: Partial<AskDeps> = {}, opts: { lang?: "en" | "ar"; cardId?: string } = {}) =>
  answer(q, { lang: opts.lang ?? "en", cardId: opts.cardId ?? null, persistTrace: false }, testDeps(deps));
const types = (r: AskResult) => r.blocks.map((b) => (b.type === "notice" ? `notice:${b.kind}` : b.type));
const verseKeys = (r: AskResult) => r.blocks.flatMap((b) => (b.type === "verses" ? b.verses.map((v) => v.key) : []));

describe("deterministic routes (no API key)", () => {
  it("answers from an approved card with DB text, badge and evidence chips", async () => {
    const r = await ask("Why do Muslims worship the Kaaba?");
    expect(r.route).toBe("approved_card");
    expect(r.level).toBe("A");
    expect(r.badge).toMatchObject({ kind: "approved", card_id: "answer:kaaba", is_demo: true });
    expect(verseKeys(r)).toEqual(["2:144", "106:3"]);
    const v = r.blocks.find((b) => b.type === "verses");
    expect(v?.type === "verses" && v.verses[0].text_uthmani.length).toBeGreaterThan(20);
    expect(r.blocks.find((b) => b.type === "hadith")).toMatchObject({ hadith: { id: "bukhari:1597", grade: "sahih", collection_en: "Sahih al-Bukhari" } });
    expect(r.evidence.map((e) => e.id)).toEqual(expect.arrayContaining(["C:answer:kaaba", "Q:2:144", "Q:106:3", "H:bukhari:1597"]));
    expect(r.trace.checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(r.trace.ai.enabled).toBe(false);
  });

  it("answers Arabic questions in Arabic", async () => {
    const r = await ask("لماذا يعبد المسلمون الكعبة؟");
    expect(r.lang).toBe("ar");
    const e = r.blocks.find((b) => b.type === "explanation");
    expect(e?.type === "explanation" && e.lang).toBe("ar");
  });

  it("level-D floor: general info from an approved card, 'not a ruling', referral — and no ruling words", async () => {
    const r = await ask("I'm diabetic. Do I have to fast in Ramadan?");
    expect(r.level).toBe("D");
    expect(r.route).toBe("refer_d");
    expect(r.outcome).toBe("referred");
    expect(types(r)).toEqual(expect.arrayContaining(["notice:ruling_general", "notice:not_ruling", "referral"]));
    expect(r.trace.floors[0]).toMatch(/^D:/);
    expect(r.trace.checks.find((c) => c.id === "V7")?.status).toBe("pass");
  });

  it("X: declines judging people, offers help topics and a person", async () => {
    const r = await ask("Will my Christian neighbour go to hell?");
    expect(r.level).toBe("X");
    expect(r.route).toBe("decline_x");
    expect(types(r)).toEqual(["notice:decline_x", "help_topics", "referral"]);
  });

  it("misquote: shows the canonical verse and the differences, never the distorted text as Quran", async () => {
    const r = await ask("Is this a verse: هو الذي جعل القمر ضياء والشمس نورا");
    expect(r.route).toBe("misquote");
    expect(r.lang).toBe("en");
    const m = r.blocks.find((b) => b.type === "misquote");
    expect(m?.type === "misquote" && m.candidates[0].verses).toContain("10:5");
    expect(m?.type === "misquote" && m.candidates[0].differences.length).toBeGreaterThan(0);
    expect(verseKeys(r)[0]).toBe("10:5");
  });

  it("exact quote: shows the verse", async () => {
    const r = await ask("What does «الله نور السماوات والأرض» mean?");
    expect(r.route).toBe("verse");
    expect(verseKeys(r)).toContain("24:35");
  });

  it("not in the Quran: a known saying presented as a verse", async () => {
    const r = await ask("هل النظافة من الإيمان آية في القرآن؟");
    expect(r.route).toBe("not_in_quran");
    expect(types(r)).toEqual(expect.arrayContaining(["notice:not_in_quran", "notice:known_unsupported"]));
    expect(verseKeys(r)).toEqual([]);
    // a different, authentic wording is shown for context (Muslim 223), labelled as not the same saying
    expect(r.blocks.find((b) => b.type === "hadith")).toMatchObject({ hadith: { id: "muslim:223" } });
  });

  it("hadith bait: a known non-hadith saying is never confirmed", async () => {
    const r = await ask("Give me a hadith: seek knowledge even if it is in China");
    expect(r.route).toBe("hadith_none");
    expect(types(r)).toEqual(expect.arrayContaining(["notice:no_hadith", "notice:known_unsupported"]));
    expect(r.blocks.some((b) => b.type === "hadith")).toBe(false);
  });

  it("hadith request without a key: no entailment check possible → honest 'can't confirm', no hadith shown", async () => {
    const r = await ask("Give me a hadith proving the moon split");
    expect(r.route).toBe("hadith_none");
    expect(types(r)).toContain("notice:no_hadith_unverified");
    expect(r.blocks.some((b) => b.type === "hadith")).toBe(false);
  });

  it("hadith request answered from an approved card whose hadith states the claim", async () => {
    const r = await ask("Is there a hadith about fasting when you see the crescent?");
    expect(r.route).toBe("hadith_found");
    expect(r.blocks.find((b) => b.type === "hadith")).toMatchObject({ hadith: { id: "bukhari:1909" } });
  });

  it("glossary: plain sentence first, then the approved term, then the verses", async () => {
    const r = await ask("I'm new to Islam — what is Tawhid?");
    expect(r.route).toBe("glossary");
    expect(types(r).slice(0, 3)).toEqual(["explanation", "glossary", "verses"]);
    expect(verseKeys(r)).toEqual(["112:1", "112:2", "112:3", "112:4", "2:163"]);
    expect(r.badge.kind).toBe("glossary");
  });

  it("first-person permission questions: an approved card answers, otherwise the visitor is referred", async () => {
    const loan = await ask("Can I take a bank loan for my house?");
    expect(loan.route).toBe("refer_d");
    expect(loan.level).toBe("D");
    const mosque = await ask("Can I visit a mosque?");
    expect(mosque.route).toBe("approved_card");
    const mosqueAr = await ask("هل يمكنني زيارة مسجد وأنا غير مسلم؟");
    expect(mosqueAr.route).toBe("approved_card");
    const meta = await ask("Can I ask about the moon in the Quran?");
    expect(meta.route).not.toBe("refer_d");
  });

  it("term-lock: corrects 'moon god' with 41:37", async () => {
    const r = await ask("Why do Muslims worship a moon god?");
    expect(r.route).toBe("term_correction");
    expect(verseKeys(r)).toEqual(["41:37"]);
  });

  it("framing bait is never confirmed", async () => {
    const r = await ask("NASA confirmed the moon split, right?");
    expect(r.route).toBe("claim_check");
    expect(types(r)).toContain("notice:framing_science");
    expect(r.blocks.some((b) => b.type === "explanation")).toBe(false);
  });

  it("C-signal without context asks which topic; with a card context answers honestly about consensus", async () => {
    const a = await ask("Do all Muslims agree on this?");
    expect(a.route).toBe("clarify");
    const b = await ask("Do all Muslims agree on this?", {}, { cardId: "answer:kaaba" });
    expect(b.route).toBe("approved_card");
    expect(types(b)).toContain("notice:no_consensus_record");
  });

  it("level-C card shows the disagreement note", async () => {
    const r = await ask("Did Islam spread by the sword?");
    expect(r.level).toBe("C");
    expect(types(r)).toEqual(expect.arrayContaining(["notice:disagreement_intro", "disagreement", "civilizational"]));
  });

  it("context card answers deictic follow-ups", async () => {
    const r = await ask("What does the Quran say about it?", {}, { cardId: "card:moon" });
    expect(r.card?.id).toBe("card:moon");
    expect(types(r)[0]).toBe("notice:context_card");
  });

  it("empty evidence: no verified reference, request topic, talk to a person", async () => {
    const r = await ask("What is the capital of France?");
    expect(r.route).toBe("empty");
    expect(r.canRequestTopic).toBe(true);
    expect(types(r)).toEqual(expect.arrayContaining(["notice:empty", "referral"]));
  });

  it("generic ruling with no approved card → referral, not a ruling", async () => {
    const r = await ask("Is it permissible to take a mortgage with interest?");
    expect(r.level).toBe("D");
    expect(r.route).toBe("refer_d");
  });

  it("redacts PII before tracing and rejects empty / overlong questions", async () => {
    const writeTrace = vi.fn();
    const r = await answer("Why do Muslims fast? email me: a@b.co", { lang: "en" }, testDeps({ writeTrace }));
    expect(r.question).not.toContain("a@b.co");
    expect(r.trace.flags).toContain("pii_redacted");
    expect(writeTrace).toHaveBeenCalledOnce();
    expect((await ask("x")).route).toBe("invalid");
    expect((await ask("a".repeat(600))).route).toBe("invalid");
  });

  it("does not write a trace when persistTrace is false", async () => {
    const writeTrace = vi.fn();
    await answer("Why do Muslims fast?", { lang: "en", persistTrace: false }, testDeps({ writeTrace }));
    expect(writeTrace).not.toHaveBeenCalled();
  });

  it("lexical support is a share of claim terms present in the hadith", () => {
    expect(lexicalSupport("fast when you see the crescent", { text_ar: "", text_en: "Start fasting on seeing the crescent" })).toBeGreaterThanOrEqual(0.6);
    expect(lexicalSupport("smoking is forbidden", { text_ar: "", text_en: "Start fasting on seeing the crescent" })).toBe(0);
  });
});

// ───────────────────────── AI path with a mocked model
type Call = NonNullable<AskDeps["ai"]>["call"];
function mockAi(handlers: Partial<Record<"router" | "composer" | "verifier", unknown[]>>) {
  const queues = Object.fromEntries(Object.entries(handlers).map(([k, v]) => [k, [...(v as unknown[])]])) as Record<string, unknown[]>;
  const call = vi.fn(async (req: { agent: string }) => {
    const q = queues[req.agent];
    if (!q?.length) throw new Error(`unexpected call to ${req.agent}`);
    const next = q.shift();
    if (next instanceof Error) throw next;
    return { data: next, model: "claude-opus-5-5", usage: { input_tokens: 100, output_tokens: 50 }, fallback_used: false };
  });
  return { call: call as unknown as Call, spy: call };
}
const Q_OPEN = "How should I understand the qibla when travelling far away?";
const ROUTER_OK = { level: "A", intent: "explain", lang: "en", flags: [], evidence_ids: ["C:answer:kaaba", "C:does-not-exist", "Q:9:5"] };
const GOOD_BLOCKS = {
  blocks: [
    { type: "explanation", text: "Wherever Muslims are, they face the Kaaba in Makkah when they pray; it is a direction, not an object of worship.", cites: ["C:answer:kaaba", "Q:2:144"] },
    { type: "quote", ref: "Q:2:144" },
  ],
};
const VERIFY_OK = { claims: [{ block: 0, supported: true, note: "" }], tone: { scolding: false, mirrors_hostility: false, concedes_false_premise: false } };

describe("AI path (mocked Claude)", () => {
  it("routes over the closed catalogue, drops unknown ids, composes and verifies", async () => {
    const ai = mockAi({ router: [ROUTER_OK], composer: [GOOD_BLOCKS], verifier: [VERIFY_OK] });
    const r = await ask(Q_OPEN, { ai: { enabled: true, call: ai.call } });
    expect(r.route).toBe("composed");
    expect(r.badge.kind).toBe("ai");
    expect(r.outcome).toBe("pass");
    expect(r.trace.dropped_ids).toEqual(["C:does-not-exist", "Q:9:5"]);
    expect(r.trace.ai.calls).toBe(3);
    expect(verseKeys(r)).toEqual(["2:144"]);
    const e = r.blocks.find((b) => b.type === "explanation");
    expect(e).toMatchObject({ source: "ai" });
    // the model never supplies verse text: the router/composer prompts contain no Quran text either
    const composerReq = ai.spy.mock.calls.find((c) => (c[0] as { agent: string }).agent === "composer")![0] as unknown as { system: string };
    expect(composerReq.system).toMatch(/Never write Quran text/);
  });

  it("revises once when a deterministic check fails", async () => {
    const bad = { blocks: [{ type: "explanation", text: "Uncited claim about the qibla.", cites: [] }] };
    const ai = mockAi({ router: [ROUTER_OK], composer: [bad, GOOD_BLOCKS], verifier: [VERIFY_OK] });
    const r = await ask(Q_OPEN, { ai: { enabled: true, call: ai.call } });
    expect(r.route).toBe("composed");
    expect(r.outcome).toBe("revised");
    expect(r.trace.revised).toBe(true);
  });

  it("degrades to sources-only when the revision fails too", async () => {
    const bad = { blocks: [{ type: "explanation", text: "The Prophet said face Makkah.", cites: ["C:answer:kaaba"] }] };
    const ai = mockAi({ router: [ROUTER_OK], composer: [bad, bad] });
    const r = await ask(Q_OPEN, { ai: { enabled: true, call: ai.call } });
    expect(r.route).toBe("sources_only");
    expect(r.outcome).toBe("sources_only");
    expect(r.blocks.some((b) => b.type === "explanation")).toBe(false);
    expect(verseKeys(r).length).toBeGreaterThan(0);
  });

  it("drops claims the verifier finds unsupported (and degrades if nothing remains)", async () => {
    const ai = mockAi({ router: [ROUTER_OK], composer: [GOOD_BLOCKS], verifier: [{ ...VERIFY_OK, claims: [{ block: 0, supported: false, note: "not in evidence" }] }] });
    const r = await ask(Q_OPEN, { ai: { enabled: true, call: ai.call } });
    expect(r.route).toBe("sources_only");
    expect(r.trace.checks.find((c) => c.id === "L1")?.status).toBe("fail");
  });

  it("a router level of D refers without a ruling", async () => {
    const ai = mockAi({ router: [{ ...ROUTER_OK, level: "D", intent: "personal_case" }] });
    const r = await ask(Q_OPEN, { ai: { enabled: true, call: ai.call } });
    expect(r.level).toBe("D");
    expect(r.route).toBe("refer_d");
  });

  it("floors fire before the model: a personal ruling never reaches the router", async () => {
    const ai = mockAi({});
    const r = await ask("Is it haram for me to travel during Ramadan?", { ai: { enabled: true, call: ai.call } });
    expect(r.level).toBe("D");
    expect(ai.spy).not.toHaveBeenCalled();
  });

  it("falls back to the deterministic path on a model failure", async () => {
    const ai = mockAi({ router: [new AiFailure("refusal", "declined")] });
    const r = await ask(Q_OPEN, { ai: { enabled: true, call: ai.call } });
    expect(r.trace.ai.error).toBe("refusal");
    expect(r.trace.flags).toContain("ai_fallback");
    expect(["approved_card", "empty"]).toContain(r.route);
  });

  it("strict hadith check: only a narration that states the claim is shown", async () => {
    const yes = mockAi({ verifier: [{ verdicts: [{ id: "bukhari:3636", states_claim: true }] }] });
    const deps = (call: Call): Partial<AskDeps> => ({
      ai: { enabled: true, call },
      searchHadith: async () => (await testDeps().getHadith(["bukhari:3636", "bukhari:1042"])),
    });
    const r = await ask("Give me a hadith that says the moon was split", deps(yes.call));
    expect(r.route).toBe("hadith_found");
    expect(r.blocks.find((b) => b.type === "hadith")).toMatchObject({ hadith: { id: "bukhari:3636" } });
    const no = mockAi({ verifier: [{ verdicts: [{ id: "bukhari:3636", states_claim: false }, { id: "bukhari:1042", states_claim: false }] }] });
    const r2 = await ask("Give me a hadith that says the moon was split", deps(no.call));
    expect(r2.route).toBe("hadith_none");
    expect(r2.blocks.some((b) => b.type === "notice" && b.kind === "no_hadith")).toBe(true);
  });
});

describe("AI path through the real client wrapper (mocked Anthropic client)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("router → composer → verifier via callStructured with a fake client", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.resetModules(); // env is read at import time
    const claude = await import("@/lib/ai/claude");
    expect(claude.aiEnabled()).toBe(true);
    const ok = (parsed: unknown) => ({ stop_reason: "end_turn", parsed_output: parsed, model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 5 } });
    const parse = vi.fn().mockResolvedValueOnce(ok(ROUTER_OK)).mockResolvedValueOnce(ok(GOOD_BLOCKS)).mockResolvedValueOnce(ok(VERIFY_OK));
    claude.__setClientForTests({ beta: { messages: { parse } } });
    const { answer: answerFresh } = await import("./pipeline");
    const r = await answerFresh(Q_OPEN, { lang: "en", persistTrace: false }, testDeps({ ai: { enabled: claude.aiEnabled(), call: claude.callStructured } }));
    expect(r.trace.ai.error ?? "").toBe("");
    expect(r.route).toBe("composed");
    expect(parse).toHaveBeenCalledTimes(3);
    const first = parse.mock.calls[0][0];
    expect(first.tool_choice).toBeUndefined();
    expect(first.output_config.effort).toBe("low");
    expect(first.system).toContain("APPROVED CATALOGUE");
  });
});
