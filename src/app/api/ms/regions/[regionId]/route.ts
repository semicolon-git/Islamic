import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { regionPatchSchema } from "@/features/manuscripts/schema";
import { deleteRegion, patchRegion } from "@/features/manuscripts/server/layout";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ regionId: string }> };

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { regionId } = await ctx.params;
  return ok(await patchRegion(user, regionId, await body(req, regionPatchSchema)));
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { regionId } = await ctx.params;
  return ok(await deleteRegion(user, regionId));
});
