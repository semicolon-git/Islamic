import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { suggestionDecisionSchema } from "@/features/ms-collab/schema";
import { decideSuggestion } from "@/features/ms-collab/server/suggestions";

export const dynamic = "force-dynamic";

/** Accept, accept with edits, or reject (page owner or researcher; never your own suggestion). */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(["student", "researcher"]);
  const { id } = await ctx.params;
  return ok(await decideSuggestion(user, id, await body(req, suggestionDecisionSchema)));
});
