import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { regionCreateSchema } from "@/features/manuscripts/schema";
import { createRegion } from "@/features/manuscripts/server/layout";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ pageId: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { pageId } = await ctx.params;
  const { type, polygon } = await body(req, regionCreateSchema);
  return ok(await createRegion(user, pageId, type, polygon), { status: 201 });
});
