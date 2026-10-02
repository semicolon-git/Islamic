import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { runDraft } from "@/features/manuscripts/server/draft";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Machine draft: Claude vision with a key, open-source OCR without. Never overwrites human versions. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ pageId: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { pageId } = await ctx.params;
  let lineIds: string[] | undefined;
  try {
    lineIds = z.object({ line_ids: z.array(z.string()).max(500).optional() }).parse(await req.json()).line_ids;
  } catch {
    lineIds = undefined;
  }
  return ok(await runDraft(user, pageId, lineIds));
});
