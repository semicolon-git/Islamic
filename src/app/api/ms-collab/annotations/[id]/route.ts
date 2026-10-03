import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { quoteReviewSchema } from "@/features/ms-collab/schema";
import { reviewQuote } from "@/features/ms-collab/server/understanding";

export const dynamic = "force-dynamic";

/** A researcher confirms or rejects a proposed Quran quotation (the manuscript text never changes). */
export const PATCH = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(["researcher"]);
  const { id } = await ctx.params;
  return ok(await reviewQuote(user, id, await body(req, quoteReviewSchema)));
});
