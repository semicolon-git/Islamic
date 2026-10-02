import { one, sql } from "@/lib/db";
import type { EvalRun } from "./types";
import snapshot from "../../../data/eval/results.json";

/** Eval runs: the latest stored run, falling back to the committed snapshot (works offline / read-only). */
export async function saveRun(run: EvalRun) {
  await sql("insert into eval_runs (id, created_at, run_by, ai_enabled, summary, results) values ($1,$2,$3,$4,$5,$6)", [
    run.id,
    run.created_at,
    run.run_by,
    run.ai_enabled,
    JSON.stringify({ ...run.summary, dataset_version: run.dataset_version }),
    JSON.stringify(run.results),
  ]);
}

export async function latestRun(): Promise<{ run: EvalRun; source: "db" | "snapshot" } | null> {
  try {
    const row = await one<{ id: string; created_at: string; run_by: string | null; ai_enabled: boolean; summary: EvalRun["summary"] & { dataset_version?: string }; results: EvalRun["results"] }>(
      "select id, created_at::text as created_at, run_by, ai_enabled, summary, results from eval_runs order by created_at desc limit 1",
    );
    if (row) {
      const { dataset_version, ...summary } = row.summary;
      return {
        source: "db",
        run: { id: row.id, created_at: new Date(row.created_at).toISOString(), run_by: row.run_by, ai_enabled: row.ai_enabled, dataset_version: dataset_version ?? "", summary, results: row.results },
      };
    }
  } catch {
    /* fall through to the snapshot */
  }
  const snap = snapshot as unknown as EvalRun;
  return snap?.summary ? { run: snap, source: "snapshot" } : null;
}

export async function runCount(): Promise<number> {
  try {
    return (await one<{ n: number }>("select count(*)::int as n from eval_runs"))?.n ?? 0;
  } catch {
    return 0;
  }
}
