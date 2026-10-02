import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { lockSchema } from "@/features/manuscripts/schema";
import { lockLine } from "@/features/manuscripts/server/lines";

export const dynamic = "force-dynamic";

/** Soft lock: acquire (60 s), renew every 20 s while editing, release on leave. 423 when someone else holds it. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ lineId: string }> }) => {
  const user = await requireUser(["student", "researcher"]);
  const { lineId } = await ctx.params;
  const text = await req.text();
  const action = text ? lockSchema.parse(JSON.parse(text)).action : "acquire";
  return ok(await lockLine(user, lineId, action));
});
