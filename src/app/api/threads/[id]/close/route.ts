import { handler, HttpError, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { closeByStaff, closeByVisitor, validToken, STAFF_ROLES } from "@/features/inbox/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** POST /api/threads/:id/close — "End conversation" (visitor) or "Close thread" (specialist). */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const token = req.headers.get("x-device-token");
  if (token) {
    if (!validToken(token)) throw new HttpError(400, "bad_token", "Invalid device token.");
    return ok(await closeByVisitor(id, token));
  }
  const user = await requireUser([...STAFF_ROLES]);
  return ok(await closeByStaff(user, id));
});
