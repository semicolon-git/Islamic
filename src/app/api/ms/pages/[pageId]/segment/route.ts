import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { segmentSchema } from "@/features/manuscripts/schema";
import { autoSegment } from "@/features/manuscripts/server/layout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ pageId: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { pageId } = await ctx.params;
  let replace = false;
  try {
    replace = !!segmentSchema.parse(await req.json()).replace;
  } catch {
    replace = false;
  }
  return ok(await autoSegment(user, pageId, replace));
});
