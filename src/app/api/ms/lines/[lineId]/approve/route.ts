import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { approveLine } from "@/features/manuscripts/server/lines";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ lineId: string }> }) => {
  const user = await requireUser(["researcher"]);
  const { lineId } = await ctx.params;
  const { approved } = await body(req, z.object({ approved: z.boolean().default(true) }));
  return ok(await approveLine(user, lineId, approved));
});
