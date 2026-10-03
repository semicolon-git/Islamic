import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { presenceSchema } from "@/features/ms-collab/schema";
import { heartbeat, presence } from "@/features/ms-collab/server/overview";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ pageId: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const { pageId } = await ctx.params;
  return ok({ presence: await presence(pageId) });
});

/** Heartbeat (every ~20 s while the page is open) or leave (sent with sendBeacon, so the body may be empty). */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { pageId } = await ctx.params;
  let input: { line_id?: string | null; leaving?: boolean } = {};
  try {
    input = presenceSchema.parse(JSON.parse((await req.text()) || "{}"));
  } catch {
    input = {};
  }
  return ok(await heartbeat(user, pageId, input.line_id ?? null, !!input.leaving));
});
