import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { commentSchema } from "@/features/ms-collab/schema";
import { addComment, listComments } from "@/features/ms-collab/server/comments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ pageId: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { pageId } = await ctx.params;
  return ok(await listComments(user, pageId));
});

/** Comment on a line (or a word range), reply to a thread, @mention page participants. Comments never change the text. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { pageId } = await ctx.params;
  return ok(await addComment(user, pageId, await body(req, commentSchema)));
});
