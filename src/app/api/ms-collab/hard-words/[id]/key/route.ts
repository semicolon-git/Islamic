import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { keyingSchema } from "@/features/ms-collab/schema";
import { submitKeying } from "@/features/ms-collab/server/hardwords";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(["student"]);
  const { id } = await ctx.params;
  const input = await body(req, keyingSchema);
  return ok(await submitKeying(user, id, input.cant_read ? { cant_read: input.cant_read } : { reading: input.reading! }));
});
