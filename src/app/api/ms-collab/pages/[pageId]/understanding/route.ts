import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { rescan, understanding } from "@/features/ms-collab/server/understanding";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ pageId: string }> };

/** Quran-quote proposals, abbreviations, glossary terms and the page's marks and notes. */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { pageId } = await ctx.params;
  return ok(await understanding(user, pageId));
});

/** Run the Quran-quote scan again (code proposes; a researcher confirms). */
export const POST = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { pageId } = await ctx.params;
  return ok(await rescan(user, pageId));
});
