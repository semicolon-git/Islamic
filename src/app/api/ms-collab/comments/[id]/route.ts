import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { resolveSchema } from "@/features/ms-collab/schema";
import { resolveComment } from "@/features/ms-collab/server/comments";

export const dynamic = "force-dynamic";

export const PATCH = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { id } = await ctx.params;
  const { resolved } = await body(req, resolveSchema);
  return ok(await resolveComment(user, id, resolved));
});
