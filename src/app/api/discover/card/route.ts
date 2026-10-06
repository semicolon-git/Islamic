import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { cardFromDiscovery } from "@/features/discover/to-card";

export const dynamic = "force-dynamic";

/** POST /api/discover/card {key} — draft a card from a visitor discovery (portal authors). */
export const POST = handler(async (req: Request) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { key } = await body(req, z.object({ key: z.string().min(3).max(200) }));
  return ok(await cardFromDiscovery(user, key));
});
