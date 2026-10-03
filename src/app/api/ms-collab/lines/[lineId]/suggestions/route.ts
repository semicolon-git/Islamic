import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { suggestionSchema } from "@/features/ms-collab/schema";
import { createSuggestion } from "@/features/ms-collab/server/suggestions";

export const dynamic = "force-dynamic";

/** Propose a change to a line you can't edit directly (locked, owned by someone else, or frozen for your role). */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ lineId: string }> }) => {
  const user = await requireUser(["student", "researcher"]);
  const { lineId } = await ctx.params;
  return ok(await createSuggestion(user, lineId, await body(req, suggestionSchema)));
});
