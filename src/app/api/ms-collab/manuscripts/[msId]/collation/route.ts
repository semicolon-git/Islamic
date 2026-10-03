import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { collationView } from "@/features/ms-collab/server/collation";

export const dynamic = "force-dynamic";

/** Word-by-word collation of this copy with the other copies of the same work, on the current reading text. */
export const GET = handler(async (_req: Request, ctx: { params: Promise<{ msId: string }> }) => {
  await requireUser();
  const { msId } = await ctx.params;
  return ok(await collationView(msId));
});
