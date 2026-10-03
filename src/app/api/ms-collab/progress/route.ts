import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { myProgress } from "@/features/ms-collab/server/points";

export const dynamic = "force-dynamic";

/** The viewer's own learning points for accepted manuscript work (never anyone else's). */
export const GET = handler(async () => {
  const user = await requireUser();
  return ok(await myProgress(user.id));
});
