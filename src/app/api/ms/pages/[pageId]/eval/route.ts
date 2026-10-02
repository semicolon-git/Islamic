import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { getPageDetail } from "@/features/manuscripts/server/repo";
import { pageEvaluation } from "@/features/manuscripts/server/manuscripts";

export const dynamic = "force-dynamic";

/** Evaluation against dataset ground truth: researchers and admins only. */
export const GET = handler(async (_req: Request, ctx: { params: Promise<{ pageId: string }> }) => {
  const user = await requireUser(["researcher", "institution_admin"]);
  const { pageId } = await ctx.params;
  const detail = await getPageDetail(pageId, user);
  const ev = await pageEvaluation(pageId, detail.lines.map((l) => l.id));
  return ok({
    ...ev,
    stored_draft_cer: detail.page.draft_cer,
    draft_engine: detail.page.draft_engine,
    gt_reliability: detail.manuscript.gt_reliability,
    gt_note: detail.manuscript.gt_note,
  });
});
