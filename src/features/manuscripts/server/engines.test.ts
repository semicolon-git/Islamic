import { afterEach, describe, expect, it, vi } from "vitest";

describe("machine draft engines", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("maps the model's words to tokens: spaces, cleaned alternatives, no self-reported confidence", async () => {
    const { modelTokensToTokens } = await import("./engines");
    expect(
      modelTokensToTokens([
        { t: "text", v: "قال" },
        { t: "unclear", v: "بشر", alts: ["بسر", "بشر", " ", "يسر", "نشر", "تسر"] },
        { t: "gap", reason: "damage" },
        { t: "text", v: "ک" },
        { t: "text", v: "  " },
      ]),
    ).toEqual([
      { t: "text", v: "قال " },
      { t: "unclear", v: "بشر", alts: ["بسر", "يسر", "نشر"] },
      { t: "text", v: " " },
      { t: "gap", reason: "damage" },
      { t: "text", v: " ك" },
    ]);
  });

  it("batches line crops into Claude vision calls with a transcription-only prompt", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const claude = await import("@/lib/ai/claude");
    const parse = vi.fn().mockImplementation(async (req: { messages: { content: { type: string; text?: string }[] }[] }) => {
      const text = req.messages[0].content.find((c) => c.type === "text")!.text!;
      const ids = [...text.matchAll(/line_id "([^"]+)"/g)].map((m) => m[1]);
      return {
        stop_reason: "end_turn",
        model: "claude-opus-5-5",
        usage: { input_tokens: 10, output_tokens: 10 },
        parsed_output: { lines: ids.map((id) => ({ line_id: id, tokens: [{ t: "text", v: `سطر ${id}` }, { t: "unclear", v: "وة", alts: ["وه"] }] })) },
      };
    });
    claude.__setClientForTests({ beta: { messages: { parse } } });
    const { draftLines, DRAFT_SYSTEM } = await import("./engines");
    const crops = Array.from({ length: 8 }, (_, i) => ({ line_id: `l${i + 1}`, png: Buffer.from([i]) }));
    const out = await draftLines(crops, "al-Qamus");
    expect(parse).toHaveBeenCalledTimes(2); // 6 + 2 lines
    const first = parse.mock.calls[0][0];
    expect(first.system).toBe(DRAFT_SYSTEM);
    expect(first.messages[0].content.filter((c: { type: string }) => c.type === "image")).toHaveLength(6);
    expect(first.tool_choice).toBeUndefined();
    for (const rule of ["Do not correct", "Do not add dots", "Do not expand abbreviations", "Never \"fix\" or complete a Quranic quotation", "unclear"])
      expect(DRAFT_SYSTEM).toContain(rule);
    expect(out.engine).toBe("claude:claude-opus-5-5");
    expect(out.lines).toHaveLength(8);
    expect(out.lines[7]).toEqual({ line_id: "l8", tokens: [{ t: "text", v: "سطر l8 " }, { t: "unclear", v: "وة", alts: ["وه"] }] });
  });

  it("retries a cut-off batch as two smaller batches instead of dropping the page to OCR", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const claude = await import("@/lib/ai/claude");
    const parse = vi.fn().mockImplementation(async (req: { messages: { content: { type: string; text?: string }[] }[] }) => {
      const text = req.messages[0].content.find((c) => c.type === "text")!.text!;
      const ids = [...text.matchAll(/line_id "([^"]+)"/g)].map((m) => m[1]);
      if (ids.length > 3) throw new Error("Failed to parse structured output: SyntaxError: Unexpected end of JSON input");
      return { stop_reason: "end_turn", model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1 }, parsed_output: { lines: ids.map((id) => ({ line_id: id, tokens: [{ t: "text", v: id }] })) } };
    });
    claude.__setClientForTests({ beta: { messages: { parse } } });
    const { draftLines } = await import("./engines");
    const out = await draftLines(Array.from({ length: 6 }, (_, i) => ({ line_id: `l${i + 1}`, png: Buffer.from([i]) })));
    expect(out.engine).toBe("claude:claude-opus-5-5");
    expect(out.lines.map((l) => l.line_id)).toEqual(["l1", "l2", "l3", "l4", "l5", "l6"]);
    expect(parse).toHaveBeenCalledTimes(3);
  });

  it("falls back to open-source OCR when the AI call fails", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const claude = await import("@/lib/ai/claude");
    claude.__setClientForTests({ beta: { messages: { parse: vi.fn().mockResolvedValue({ stop_reason: "refusal", parsed_output: null, model: "m", usage: { input_tokens: 1, output_tokens: 0 } }) } } });
    vi.doMock("tesseract.js", () => ({
      OEM: { LSTM_ONLY: 1 },
      PSM: { SINGLE_LINE: 7 },
      createWorker: async () => ({
        setParameters: async () => ({}),
        recognize: async () => ({ data: { blocks: [{ paragraphs: [{ lines: [{ words: [{ text: "قال", confidence: 91 }, { text: "ثنا", confidence: 30 }] }] }] }] } }),
        terminate: async () => ({}),
      }),
    }));
    const { draftLines } = await import("./engines");
    const out = await draftLines([{ line_id: "l1", png: Buffer.from([1]) }]);
    expect(out.engine).toBe("tesseract");
    expect(out.note).toContain("refusal");
    expect(out.lines[0].tokens).toEqual([{ t: "text", v: "قال " }, { t: "unclear", v: "ثنا", conf: 30 }]);
  });

  it("uses Tesseract without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.doMock("tesseract.js", () => ({
      OEM: { LSTM_ONLY: 1 },
      PSM: { SINGLE_LINE: 7 },
      createWorker: async () => ({ setParameters: async () => ({}), recognize: async () => ({ data: { blocks: [] } }), terminate: async () => ({}) }),
    }));
    const { draftLines } = await import("./engines");
    const out = await draftLines([{ line_id: "l1", png: Buffer.from([1]) }]);
    expect(out).toEqual({ engine: "tesseract", lines: [{ line_id: "l1", tokens: [] }] });
  });
});
