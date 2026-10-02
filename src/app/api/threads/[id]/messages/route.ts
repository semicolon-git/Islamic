import { z } from "zod";
import { body, handler, HttpError, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { postStaffMessage, postVisitorMessage, validToken, STAFF_ROLES } from "@/features/inbox/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  body: z.string().trim().min(1, "Write a message first.").max(2000),
  /** Client-generated id so an offline retry never sends the same message twice. */
  client_id: z.string().max(40).nullable().optional(),
});

/** POST /api/threads/:id/messages — visitor (x-device-token) or specialist. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await body(req, Input);
  const token = req.headers.get("x-device-token");
  if (token) {
    if (!validToken(token)) throw new HttpError(400, "bad_token", "Invalid device token.");
    return ok(await postVisitorMessage(id, token, input.body, input.client_id), { status: 201 });
  }
  const user = await requireUser([...STAFF_ROLES]);
  return ok(await postStaffMessage(user, id, input.body, input.client_id), { status: 201 });
});
