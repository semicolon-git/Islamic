import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { reviewPageSchema } from "@/features/ms-collab/schema";
import { decideReviewPage, pageReview } from "@/features/ms-collab/server/review";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ pageId: string }> };

/** The page as a line-by-line diff against the last approved text (default) or the machine draft, with CER. */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(["researcher", "institution_admin"]);
  const { pageId } = await ctx.params;
  const against = new URL(req.url).searchParams.get("against") === "machine" ? "machine" : "approved";
  return ok(await pageReview(user, pageId, against));
});

/** Whole-page decision: approve (four eyes) or return with a note. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(["researcher"]);
  const { pageId } = await ctx.params;
  const { decision, note } = await body(req, reviewPageSchema);
  return ok(await decideReviewPage(user, pageId, decision, note));
});
