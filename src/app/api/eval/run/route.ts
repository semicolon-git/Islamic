import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { runEval } from "@/features/eval/runner";
import { saveRun } from "@/features/eval/store";
import { audit } from "@/lib/events";
import { tx } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/eval/run — run the safety evaluation server-side (researcher, institution admin, platform admin). */
export const POST = handler(async () => {
  const user = await requireUser(["researcher", "institution_admin"]);
  const run = await runEval({ runBy: user.id });
  await saveRun(run);
  await tx((q) => audit(q, user.id, "eval.run", "eval_run", run.id, null, { cases: run.results.length, passed: run.summary.all.passed }));
  return ok({ id: run.id, created_at: run.created_at, passed: run.summary.all.passed, cases: run.summary.all.cases });
});
