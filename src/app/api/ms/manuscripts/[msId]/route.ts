import { requireUser } from "@/lib/auth";
import { handler, HttpError, ok } from "@/lib/http";
import { getManuscript, listPages } from "@/features/manuscripts/server/repo";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ msId: string }> }) => {
  await requireUser();
  const { msId } = await ctx.params;
  const manuscript = await getManuscript(msId);
  if (!manuscript) throw new HttpError(404, "not_found", "Manuscript not found.");
  return ok({ manuscript, pages: await listPages(msId) });
});
