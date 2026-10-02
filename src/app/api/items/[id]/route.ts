import { body, handler, HttpError, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { ItemInput } from "@/features/heritage/schemas";
import { itemHistory, updateItem } from "@/features/heritage/server";
import { getPortalItem } from "@/features/heritage/portal-queries";
import { itemInscriptions } from "@/features/heritage/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const ROLES = ["student", "researcher", "institution_admin"] as const;

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireUser([...ROLES]);
  const { id } = await ctx.params;
  const item = await getPortalItem(id);
  if (!item) throw new HttpError(404, "not_found", "This item doesn't exist.");
  const [history, inscriptions] = await Promise.all([itemHistory(id), itemInscriptions(id)]);
  return ok({ item, history, inscriptions });
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser([...ROLES]);
  const { id } = await ctx.params;
  const input = await body(req, ItemInput);
  return ok(await updateItem(user, id, input));
});
