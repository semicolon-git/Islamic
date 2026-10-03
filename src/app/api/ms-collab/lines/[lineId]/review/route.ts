import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { reviewLineSchema } from "@/features/ms-collab/schema";
import { decideReviewLine } from "@/features/ms-collab/server/review";

export const dynamic = "force-dynamic";

/** Per-line review decision: accept, or revert to the baseline with a reason. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ lineId: string }> }) => {
  const user = await requireUser(["researcher"]);
  const { lineId } = await ctx.params;
  return ok(await decideReviewLine(user, lineId, await body(req, reviewLineSchema)));
});
