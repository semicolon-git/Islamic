import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { adjudicationList } from "@/features/ms-collab/server/hardwords";

export const dynamic = "force-dynamic";

/** Disputed words (both readings, machine guess and alternatives) and recent agreements to spot-check. Researchers only. */
export const GET = handler(async (req: Request) => {
  const user = await requireUser(["researcher"]);
  const page = new URL(req.url).searchParams.get("page") || undefined;
  return ok(await adjudicationList(user, { pageId: page }));
});
