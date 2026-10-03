import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { listSuggestions } from "@/features/ms-collab/server/suggestions";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ pageId: string }> }) => {
  const user = await requireUser();
  const { pageId } = await ctx.params;
  return ok({ suggestions: await listSuggestions(user, pageId) });
});
