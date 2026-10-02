import { z } from "zod";
import { body, handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { transitionCard } from "@/features/cards/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  decision: z.enum(["submit", "approve", "return", "publish", "archive"]),
  note: z.string().max(1000).nullable().optional(),
  ack_lint: z.boolean().optional(),
  version: z.number().int().positive().optional(),
});

/** POST /api/cards/:id/transition — every rule (role, stage, institution, checklist, four eyes) is re-checked here. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const input = await body(req, Input);
  return ok(await transitionCard(user, decodeURIComponent((await ctx.params).id), input));
});
