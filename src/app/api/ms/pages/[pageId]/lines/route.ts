import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { lineCreateSchema } from "@/features/manuscripts/schema";
import { createLine } from "@/features/manuscripts/server/layout";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ pageId: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { pageId } = await ctx.params;
  const { polygon, region_id } = await body(req, lineCreateSchema);
  return ok(await createLine(user, pageId, polygon, region_id), { status: 201 });
});
