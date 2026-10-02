import { handler, HttpError, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getStaffThread, getVisitorThread, validToken, STAFF_ROLES } from "@/features/inbox/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/threads/:id — the visitor (x-device-token header) or a specialist. */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const token = req.headers.get("x-device-token");
  if (token) {
    if (!validToken(token)) throw new HttpError(400, "bad_token", "Invalid device token.");
    return ok(await getVisitorThread(id, token));
  }
  await requireUser([...STAFF_ROLES]);
  return ok(await getStaffThread(id));
});
