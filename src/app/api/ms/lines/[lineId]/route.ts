import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { body, handler, HttpError, ok } from "@/lib/http";
import { linePatchSchema, saveLineSchema } from "@/features/manuscripts/schema";
import { getVersion } from "@/features/manuscripts/server/repo";
import { saveLine } from "@/features/manuscripts/server/lines";
import { deleteLine, patchLine } from "@/features/manuscripts/server/layout";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ lineId: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const { lineId } = await ctx.params;
  const line = await one<{ id: string; current_version: number; status: string }>("select id, current_version, status from ms_lines where id = $1", [lineId]);
  if (!line) throw new HttpError(404, "not_found", "This line no longer exists.");
  return ok({ line, version: line.current_version ? await getVersion(lineId, line.current_version) : null });
});

/** Save a new version (optimistic concurrency via base_version; 409 returns their version). */
export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(["student", "researcher"]);
  const { lineId } = await ctx.params;
  return ok(await saveLine(user, lineId, await body(req, saveLineSchema)));
});

/** Layout change: polygon and/or region. */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { lineId } = await ctx.params;
  return ok(await patchLine(user, lineId, await body(req, linePatchSchema)));
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { lineId } = await ctx.params;
  return ok(await deleteLine(user, lineId));
});
