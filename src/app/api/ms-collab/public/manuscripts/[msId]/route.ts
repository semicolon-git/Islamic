import { handler, HttpError, ok } from "@/lib/http";
import { publishedManuscript, publishedPages } from "@/features/ms-collab/server/public";

export const dynamic = "force-dynamic";

/** Public: the published pages of one manuscript (frozen publications only; never working text or ground truth). */
export const GET = handler(async (_req: Request, ctx: { params: Promise<{ msId: string }> }) => {
  const { msId } = await ctx.params;
  const manuscript = await publishedManuscript(msId);
  if (!manuscript) throw new HttpError(404, "not_found", "Nothing from this manuscript has been published yet.");
  return ok({ manuscript, pages: await publishedPages(msId) });
});
