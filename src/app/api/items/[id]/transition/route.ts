import { body, handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { TransitionInput } from "@/features/heritage/schemas";
import { transitionItem } from "@/features/heritage/server";

export const dynamic = "force-dynamic";

/** Move an item through the shared 4-stage workflow (submit → approve → publish), with four-eyes on publish. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { id } = await ctx.params;
  const { decision, note } = await body(req, TransitionInput);
  return ok(await transitionItem(user, id, decision, note));
});
