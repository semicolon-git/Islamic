import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { assignSchema } from "@/features/ms-collab/schema";
import { assign, assignData } from "@/features/ms-collab/server/tasks";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser(["researcher", "institution_admin"]);
  return ok(await assignData(user));
});

/** Assign pages to a student (researchers and institution admins). */
export const POST = handler(async (req: Request) => {
  const user = await requireUser(["researcher", "institution_admin"]);
  return ok(await assign(user, await body(req, assignSchema)));
});
