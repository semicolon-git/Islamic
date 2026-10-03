import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { explainSchema } from "@/features/ms-collab/schema";
import { explainLine } from "@/features/ms-collab/server/explain";

export const dynamic = "force-dynamic";

/** "Explain this line": deterministic parts always; an AI gloss (labelled, never applied) only when asked and configured. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ lineId: string }> }) => {
  const user = await requireUser();
  const { lineId } = await ctx.params;
  const { ai } = await body(req, explainSchema);
  return ok(await explainLine(user, lineId, !!ai));
});
