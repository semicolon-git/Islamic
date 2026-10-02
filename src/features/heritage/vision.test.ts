import { afterEach, describe, expect, it, vi } from "vitest";

describe("transcribeInscription (vision agent)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("refuses without a key (the page offers typing instead)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { transcribeInscription } = await import("./vision");
    await expect(transcribeInscription({ mediaType: "image/jpeg", base64: "AAAA" })).rejects.toMatchObject({ kind: "disabled" });
  });

  it("sends the image to the vision model and returns the words as seen, with uncertain flags", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const ai = await import("@/lib/ai/claude");
    const parse = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      model: "claude-opus-5-5",
      usage: { input_tokens: 10, output_tokens: 5 },
      parsed_output: {
        has_arabic_text: true,
        words: [
          { text: "الله", uncertain: false, alternatives: [] },
          { text: "نور", uncertain: false, alternatives: [] },
          { text: "السموات", uncertain: true, alternatives: ["السماوات", "السموت", "x", "y"] },
        ],
        script_tier: "thuluth",
        legibility: "partly_legible",
      },
    });
    ai.__setClientForTests({ beta: { messages: { parse } } });
    const { transcribeInscription } = await import("./vision");
    const r = await transcribeInscription({ mediaType: "image/jpeg", base64: "QUJD" });
    expect(r.text).toBe("الله نور السموات");
    expect(r.words[2]).toMatchObject({ uncertain: true });
    expect(r.words[2].alternatives).toHaveLength(3);
    expect(r.script_tier).toBe("thuluth");
    const sent = parse.mock.calls[0][0];
    expect(sent.model).toBe("claude-opus-5-5");
    expect(sent.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
    expect(sent.system).toMatch(/Do not complete, correct/);
    expect(sent.tool_choice).toBeUndefined();
  });

  it("returns no text when the photo has no Arabic writing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const ai = await import("@/lib/ai/claude");
    ai.__setClientForTests({
      beta: {
        messages: {
          parse: vi.fn().mockResolvedValue({
            stop_reason: "end_turn",
            model: "m",
            usage: { input_tokens: 1, output_tokens: 1 },
            parsed_output: { has_arabic_text: false, words: [{ text: "ignored", uncertain: false, alternatives: [] }], script_tier: "unsure", legibility: "illegible" },
          }),
        },
      },
    });
    const { transcribeInscription } = await import("./vision");
    const r = await transcribeInscription({ mediaType: "image/png", base64: "QUJD" });
    expect(r.text).toBe("");
    expect(r.words).toEqual([]);
  });

  it("maps a refusal to a typed failure (the UI falls back to typing)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const ai = await import("@/lib/ai/claude");
    ai.__setClientForTests({ beta: { messages: { parse: vi.fn().mockResolvedValue({ stop_reason: "refusal", parsed_output: null, model: "m", usage: { input_tokens: 1, output_tokens: 0 } }) } } });
    const { transcribeInscription } = await import("./vision");
    await expect(transcribeInscription({ mediaType: "image/png", base64: "QUJD" })).rejects.toMatchObject({ kind: "refusal" });
  });
});
