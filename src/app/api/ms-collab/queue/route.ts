import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { myQueue } from "@/features/ms-collab/server/tasks";

export const dynamic = "force-dynamic";

/** "My work": the viewer's tasks, review and publication queues, hard-word counts, mentions and suggestions to decide. */
export const GET = handler(async () => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  return ok(await myQueue(user));
});
