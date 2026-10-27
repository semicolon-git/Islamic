import { z } from "zod";
import { body, handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { reviewChain } from "@/features/science/review";

export const dynamic = "force-dynamic";

const Input = z.object({ decision: z.enum(["approve", "return", "publish"]), note: z.string().max(2000).nullable().optional() });

/** Review a contribution chain: a researcher approves or returns it; a different institution admin signs it off. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(["researcher", "institution_admin"]);
  const { id } = await ctx.params;
  const { decision, note } = await body(req, Input);
  return ok(await reviewChain(user, id, decision, note ?? null));
});
