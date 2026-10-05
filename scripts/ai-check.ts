/**
 * Checks that the Claude configuration works end to end: one tiny structured call per agent model.
 *   npx tsx scripts/ai-check.ts
 * In the deployed container:  docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec app npx tsx scripts/ai-check.ts
 * Prints no secrets. Exit code 0 when every agent answered.
 */
import { z } from "zod";
import { aiEnabled, callStructured, AiFailure } from "../src/lib/ai/claude";
import { env, type AgentName } from "../src/lib/env";

async function main() {
  if (!aiEnabled()) {
    console.log("AI is off: ANTHROPIC_API_KEY is not set. Every feature uses its deterministic fallback.");
    process.exit(1);
  }
  console.log(`key: ${env.anthropicKey.slice(0, 10)}…  workspace header: ${env.anthropicWorkspaceId || "(none)"}`);
  let ok = true;
  const byModel = new Map<string, AgentName[]>();
  for (const a of Object.keys(env.models) as AgentName[]) byModel.set(env.models[a], [...(byModel.get(env.models[a]) ?? []), a]);
  for (const [model, agents] of byModel) {
    const t0 = Date.now();
    try {
      const r = await callStructured({
        agent: agents[0],
        system: "You are a connectivity check. Answer exactly as asked.",
        user: "Return ok=true and the Arabic word for 'moon'.",
        schema: z.object({ ok: z.boolean(), word: z.string() }),
        maxTokens: 200,
        timeoutMs: 60_000,
      });
      console.log(`✓ ${model} (${agents.join(", ")}): ${JSON.stringify(r.data)} in ${Date.now() - t0} ms, served by ${r.model}`);
    } catch (e) {
      ok = false;
      console.log(`✗ ${model} (${agents.join(", ")}): ${e instanceof AiFailure ? `${e.kind}: ${e.message}` : String(e)}`);
    }
  }
  if (!ok) {
    console.log("\nIf the log above says the key is not scoped to a workspace, set ANTHROPIC_WORKSPACE_ID");
    console.log("(Claude Console → Settings → Workspaces, starts with wrkspc_) or create a key inside a workspace.");
  }
  process.exit(ok ? 0 : 1);
}
main();
