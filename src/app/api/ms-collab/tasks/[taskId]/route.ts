import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { taskActionSchema } from "@/features/ms-collab/schema";
import { updateTask } from "@/features/ms-collab/server/tasks";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, ctx: { params: Promise<{ taskId: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { taskId } = await ctx.params;
  const { action } = await body(req, taskActionSchema);
  return ok(await updateTask(user, taskId, action));
});
