/**
 * Safety evaluation runner (review §9.3–9.5).
 *   npx tsx scripts/eval.ts            → runs every case in data/eval/cases.json through the real pipeline
 *                                        against the seeded database and writes data/eval/results.json
 *   npx tsx scripts/eval.ts --only r6  → only cases whose id starts with "r6"
 *   npx tsx scripts/eval.ts --save-db  → also stores the run in eval_runs (shown on /portal/eval)
 * Without ANTHROPIC_API_KEY this measures the deterministic (no-key) system.
 */
import fs from "node:fs";
import path from "node:path";
import { runEval, CASES } from "../src/features/eval/runner";
import { saveRun } from "../src/features/eval/store";
import { METRIC_DEFINITIONS } from "../src/features/eval/metrics";

const pct = (x: number | null) => (x === null ? "  n/a" : `${(x * 100).toFixed(1).padStart(5)}%`);

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const cases = only ? CASES.filter((c) => c.id.startsWith(only)) : CASES;
  const t0 = Date.now();
  const run = await runEval({ cases });
  if (!only) {
    const out = path.join(process.cwd(), "data/eval/results.json");
    fs.writeFileSync(out, JSON.stringify(run, null, 1) + "\n");
    console.log(`wrote ${path.relative(process.cwd(), out)}`);
  }
  if (process.argv.includes("--save-db")) await saveRun(run);

  for (const split of ["all", "dev", "heldout"] as const) {
    const s = run.summary[split];
    console.log(`\n${split.toUpperCase()} — ${s.passed}/${s.cases} cases pass · latency p50 ${s.latency.p50} ms, p95 ${s.latency.p95} ms`);
    for (const m of s.metrics) {
      const ci = m.ci ? `[${pct(m.ci[0])} – ${pct(m.ci[1])}]` : "";
      console.log(`  ${m.met === false ? "✗" : m.met ? "✓" : "·"} ${m.id.padEnd(18)} ${String(m.k).padStart(3)}/${String(m.n).padEnd(3)} ${pct(m.rate)} ${ci}`);
    }
  }
  const failures = run.results.filter((r) => !r.pass);
  if (failures.length) {
    console.log(`\nFailures (${failures.length}):`);
    for (const f of failures) console.log(`  ${f.split === "heldout" ? "[held-out] " : ""}${f.id}: ${f.actual.level}/${f.actual.route} — ${f.failures.join("; ")}`);
  }
  if (process.argv.includes("--defs")) for (const [k, v] of Object.entries(METRIC_DEFINITIONS)) console.log(`${k}: ${v}`);
  console.log(`\n${run.results.length} cases in ${((Date.now() - t0) / 1000).toFixed(1)}s · AI ${run.ai_enabled ? "on" : "off (deterministic path)"}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
