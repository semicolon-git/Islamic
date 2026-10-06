import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { discoveryBoard, dismissDiscovery } from "@/features/discover/server";

export const dynamic = "force-dynamic";

/** GET /api/discover/board — what visitors explored that no reviewed card covers (portal). */
export const GET = handler(async () => {
  await requireUser(["student", "researcher", "institution_admin"]);
  return ok(await discoveryBoard());
});

/** PATCH /api/discover/board {key} — hide a discovery from the board. */
export const PATCH = handler(async (req: Request) => {
  await requireUser(["researcher", "institution_admin"]);
  const { key } = await body(req, z.object({ key: z.string().min(3).max(200) }));
  await dismissDiscovery(key);
  return ok({ key });
});
