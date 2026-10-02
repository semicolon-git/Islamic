import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

describe("callStructured", () => {
  afterEach(() => vi.resetModules());

  it("throws 'disabled' without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const m = await import("./claude");
    expect(m.aiEnabled()).toBe(false);
    await expect(m.callStructured({ agent: "router", system: "s", user: "u", schema: z.object({ a: z.string() }) })).rejects.toMatchObject({ kind: "disabled" });
  });

  it("returns parsed data and maps refusals", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const m = await import("./claude");
    const parse = vi.fn().mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: { a: "x" }, model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 2 } })
      .mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null, model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 0 } });
    m.__setClientForTests({ beta: { messages: { parse } } });
    const r = await m.callStructured({ agent: "router", system: "s", user: "u", schema: z.object({ a: z.string() }) });
    expect(r.data).toEqual({ a: "x" });
    const sent = parse.mock.calls[0][0];
    expect(sent.model).toBe("claude-opus-5-5");
    expect(sent.tool_choice).toBeUndefined();
    expect(sent.fallbacks).toBe("default");
    await expect(m.callStructured({ agent: "router", system: "s", user: "u", schema: z.object({ a: z.string() }) })).rejects.toMatchObject({ kind: "refusal" });
  });
});
