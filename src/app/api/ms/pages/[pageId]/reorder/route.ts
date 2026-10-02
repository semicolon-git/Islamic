import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { reorderSchema } from "@/features/manuscripts/schema";
import { reorderLines } from "@/features/manuscripts/server/layout";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ pageId: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { pageId } = await ctx.params;
  const { line_ids } = await body(req, reorderSchema);
  return ok(await reorderLines(user, pageId, line_ids));
});
