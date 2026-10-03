import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIndex } from "@/lib/quran/matcher";

/** "Explain this line" AI gloss: mocked client only (tests never call the API), and a deterministic no-key path. */
const input = {
  reading: "وجزأه كجعله قسمه والجزء[?] بالضم البعض",
  genre: "lexicon",
  work: "al-Qamus al-muhit",
  abbreviations: [{ written: "ج", expan: "جمع" }],
  verseKeys: ["43:15"],
};

const ok = (gloss_ar: string) => ({
  stop_reason: "end_turn",
  parsed_output: { gloss_en: "Explains the verb jazaʾa: to divide.", gloss_ar, uncertain: false },
  model: "claude-opus-5-5",
  usage: { input_tokens: 10, output_tokens: 20 },
});

describe("aiGloss", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("without a key: no AI, the caller shows the deterministic parts only", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { aiGloss } = await import("./explain-ai");
    expect(await aiGloss(input, null)).toEqual({ available: false });
  });

  it("with a key: structured output, verse by key only, no forced tool choice; the result is a labelled draft", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const claude = await import("@/lib/ai/claude");
    const parse = vi.fn().mockResolvedValue(ok("يشرح الفعل جزأ بمعنى قسم."));
    claude.__setClientForTests({ beta: { messages: { parse } } });
    const { aiGloss, GLOSS_SYSTEM } = await import("./explain-ai");
    const r = await aiGloss(input, null);
    expect(r).toEqual({ available: true, gloss_en: "Explains the verb jazaʾa: to divide.", gloss_ar: "يشرح الفعل جزأ بمعنى قسم.", model: "claude-opus-5-5", uncertain: false });
    const sent = parse.mock.calls[0][0];
    expect(sent.tool_choice).toBeUndefined();
    expect(sent.system).toBe(GLOSS_SYSTEM);
    expect(sent.system).toMatch(/Never write out Quran text/);
    expect(sent.messages[0].content.at(-1).text).toContain("43:15");
    expect(sent.messages[0].content.at(-1).text).toContain("ج = جمع");
  });

  it("withholds a gloss that writes out Quran text, and maps refusals to a typed failure", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const claude = await import("@/lib/ai/claude");
    const parse = vi.fn()
      .mockResolvedValueOnce(ok("كما في قوله وجعلوا له من عباده جزءا أي إناثا"))
      .mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null, model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 0 } });
    claude.__setClientForTests({ beta: { messages: { parse } } });
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prep/data/raw/quran_kfgqpc_hafs_v18.json"), "utf8")) as { sora: number; aya_no: number; aya_text: string; aya_text_emlaey: string; sora_name_ar: string; sora_name_en: string }[];
    const ix = buildIndex(raw.map((r) => ({ key: `${r.sora}:${r.aya_no}`, sura: r.sora, aya: r.aya_no, text_emlaey: r.aya_text_emlaey, text_uthmani: r.aya_text, sura_name_ar: r.sora_name_ar, sura_name_en: r.sora_name_en })));
    const { aiGloss } = await import("./explain-ai");
    expect(await aiGloss(input, ix)).toEqual({ available: true, failure: "withheld_quran" });
    expect(await aiGloss(input, ix)).toEqual({ available: true, failure: "refusal" });
  });
});
