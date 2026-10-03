import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { overview } from "@/features/ms-collab/server/overview";

export const dynamic = "force-dynamic";

/** Per-line collaboration badges for the workspace: comments, suggestions, hard words, Quran quotes, presence. */
export const GET = handler(async (_req: Request, ctx: { params: Promise<{ pageId: string }> }) => {
  await requireUser();
  const { pageId } = await ctx.params;
  return ok(await overview(pageId));
});
