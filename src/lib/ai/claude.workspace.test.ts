import { describe, it, expect, vi, afterEach } from "vitest";

describe("Claude client workspace header", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sends anthropic-workspace-id when ANTHROPIC_WORKSPACE_ID is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("ANTHROPIC_WORKSPACE_ID", "wrkspc_test123");
    vi.resetModules();
    const { getClient } = await import("./claude");
    const headers = (getClient() as unknown as { _options: { defaultHeaders?: Record<string, string> } })._options.defaultHeaders;
    expect(headers?.["anthropic-workspace-id"]).toBe("wrkspc_test123");
  });

  it("sends no workspace header by default", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("ANTHROPIC_WORKSPACE_ID", "");
    vi.resetModules();
    const { getClient } = await import("./claude");
    const headers = (getClient() as unknown as { _options: { defaultHeaders?: Record<string, string> } })._options.defaultHeaders;
    expect(headers?.["anthropic-workspace-id"]).toBeUndefined();
  });
});
