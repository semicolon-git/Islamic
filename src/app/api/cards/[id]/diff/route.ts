import { handler, HttpError, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { diffCardVersions } from "@/features/cards/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/cards/:id/diff?a=1&b=3 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const a = Number(sp.get("a")), b = Number(sp.get("b"));
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) throw new HttpError(400, "bad_versions", "Pick two versions to compare.");
  return ok({ a, b, entries: await diffCardVersions(user, decodeURIComponent((await ctx.params).id), a, b) });
});
