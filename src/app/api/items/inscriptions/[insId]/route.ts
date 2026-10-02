import { body, handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { InscriptionAction } from "@/features/heritage/schemas";
import { actOnInscription } from "@/features/heritage/server";

export const dynamic = "force-dynamic";

/** Link verses to a reading (reader or researcher) or confirm/reject it (researcher, not the reader). */
export const PATCH = handler(async (req: Request, ctx: { params: Promise<{ insId: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { insId } = await ctx.params;
  const action = await body(req, InscriptionAction);
  return ok(await actOnInscription(user, insId, action));
});
