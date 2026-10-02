import { handler, HttpError, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getVersionDoc } from "@/features/cards/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; v: string }> };

/** GET /api/cards/:id/versions/:v — one saved version (meta + content), e.g. to restore it. */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id, v } = await ctx.params;
  const version = Number(v);
  if (!Number.isInteger(version) || version < 1) throw new HttpError(400, "bad_version", "Unknown version.");
  return ok({ version, doc: await getVersionDoc(user, decodeURIComponent(id), version) });
});
