import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { workflowSchema } from "@/features/manuscripts/schema";
import { decidePage } from "@/features/manuscripts/server/workflow";

export const dynamic = "force-dynamic";

/** Page workflow: submit -> approve -> publish (four eyes), return with a note, archive. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ pageId: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { pageId } = await ctx.params;
  const { decision, note } = await body(req, workflowSchema);
  return ok(await decidePage(user, pageId, decision, note));
});
