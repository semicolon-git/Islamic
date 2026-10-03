import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { decideWordSchema } from "@/features/ms-collab/schema";
import { decideHardWord } from "@/features/ms-collab/server/hardwords";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(["researcher"]);
  const { id } = await ctx.params;
  return ok(await decideHardWord(user, id, await body(req, decideWordSchema)));
});
