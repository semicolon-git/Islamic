import { body, handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { ItemInput } from "@/features/heritage/schemas";
import { createItem } from "@/features/heritage/server";
import { listPortalItems } from "@/features/heritage/portal-queries";

export const dynamic = "force-dynamic";

const ROLES = ["student", "researcher", "institution_admin"] as const;

export const GET = handler(async () => {
  await requireUser([...ROLES]);
  return ok({ items: await listPortalItems() });
});

/** Register a new heritage item (starts as a draft). */
export const POST = handler(async (req: Request) => {
  const user = await requireUser([...ROLES]);
  const input = await body(req, ItemInput);
  return ok(await createItem(user, input), { status: 201 });
});
