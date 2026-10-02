import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { lineVersions } from "@/features/manuscripts/server/repo";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ lineId: string }> }) => {
  await requireUser();
  const { lineId } = await ctx.params;
  return ok({ versions: await lineVersions(lineId) });
});
