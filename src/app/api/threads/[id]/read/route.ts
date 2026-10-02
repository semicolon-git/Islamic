import { handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { markRead, STAFF_ROLES } from "@/features/inbox/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** POST /api/threads/:id/read — the specialist has seen the visitor's messages. */
export const POST = handler(async (_req: Request, ctx: Ctx) => {
  await requireUser([...STAFF_ROLES]);
  await markRead((await ctx.params).id);
  return ok({});
});
