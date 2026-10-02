import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { flagSchema } from "@/features/manuscripts/schema";
import { flagPage } from "@/features/manuscripts/server/workflow";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ pageId: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { pageId } = await ctx.params;
  const { flagged, reason } = await body(req, flagSchema);
  return ok(await flagPage(user, pageId, flagged, reason));
});
