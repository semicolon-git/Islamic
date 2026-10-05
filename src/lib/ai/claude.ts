import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env, type AgentName } from "@/lib/env";

/**
 * Claude access for every AI agent in the platform (vision, router, composer, verifier, draft).
 * - Disabled unless ANTHROPIC_API_KEY is set: callers MUST have a deterministic fallback.
 * - Structured output via output_config.format (zod) → typed object, or a typed AiFailure.
 * - Server-side refusal fallback enabled ("default" routing).
 * - No forced tool_choice; no assistant prefill; stop_reason always checked.
 */
export class AiFailure extends Error {
  constructor(
    public kind: "disabled" | "refusal" | "max_tokens" | "parse" | "api" | "timeout",
    message: string,
  ) {
    super(message);
  }
}

export const aiEnabled = () => !!env.anthropicKey;

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!aiEnabled()) throw new AiFailure("disabled", "AI is not configured (ANTHROPIC_API_KEY missing).");
  if (!client) {
    client = new Anthropic({
      apiKey: env.anthropicKey,
      maxRetries: 2,
      timeout: 60_000,
      // Keys that are not scoped to a workspace must name one on every request.
      defaultHeaders: env.anthropicWorkspaceId ? { "anthropic-workspace-id": env.anthropicWorkspaceId } : undefined,
    });
  }
  return client;
}
/** Test hook: inject a fake client. */
export function __setClientForTests(c: unknown) {
  client = c as Anthropic;
}

export type ImageInput = { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export interface StructuredCall<S extends z.ZodType> {
  agent: AgentName;
  system: string;              // stable instructions (cached)
  user: string;                // per-request text
  images?: ImageInput[];
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  timeoutMs?: number;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null };
  fallback_used: boolean;
}

export async function callStructured<S extends z.ZodType>(req: StructuredCall<S>): Promise<StructuredResult<z.infer<S>>> {
  const c = getClient();
  const model = env.models[req.agent];
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(req.images ?? []).map(
      (img): Anthropic.Beta.BetaImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 },
      }),
    ),
    { type: "text", text: req.user },
  ];
  let res;
  try {
    res = await c.beta.messages.parse(
      {
        model,
        max_tokens: req.maxTokens ?? 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        cache_control: { type: "ephemeral" },
        system: req.system,
        messages: [{ role: "user", content }],
        output_config: { format: betaZodOutputFormat(req.schema), effort: req.effort ?? "low" },
      },
      { timeout: req.timeoutMs ?? 45_000 },
    );
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new AiFailure("timeout", "The AI service timed out.");
    if (e instanceof Anthropic.APIError) {
      // Visible in the server log so a misconfigured key or workspace doesn't hide behind the fallbacks.
      console.warn(`[ai] ${req.agent} (${model}) failed: ${e.status ?? "?"} ${e.message}`);
      throw new AiFailure("api", `AI service error (${e.status ?? "?"}).`);
    }
    // The SDK throws when the structured answer is cut off or isn't valid JSON.
    if (e instanceof Error && /parse structured output/i.test(e.message)) throw new AiFailure("parse", "The model's answer did not match the expected format.");
    throw new AiFailure("api", e instanceof Error ? e.message : "AI call failed.");
  }
  if (res.stop_reason === "refusal") throw new AiFailure("refusal", "The model declined this request.");
  if (res.stop_reason === "max_tokens") throw new AiFailure("max_tokens", "The model ran out of room.");
  if (res.parsed_output == null) throw new AiFailure("parse", "The model's answer did not match the expected format.");
  const fallbackUsed = (res.usage.iterations ?? []).some((i: { type: string }) => i.type === "fallback_message");
  return {
    data: res.parsed_output as z.infer<S>,
    model: res.model,
    usage: {
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
      cache_read_input_tokens: res.usage.cache_read_input_tokens,
    },
    fallback_used: fallbackUsed,
  };
}
