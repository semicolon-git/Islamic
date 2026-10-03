import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { abbrConfirmSchema } from "@/features/ms-collab/schema";
import { confirmAbbreviation } from "@/features/ms-collab/server/understanding";

export const dynamic = "force-dynamic";

/** Confirm an abbreviation's expansion: applies to the reading layer only (the written form is kept). */
export const POST = handler(async (req: Request) => {
  const user = await requireUser(["student", "researcher"]);
  return ok(await confirmAbbreviation(user, await body(req, abbrConfirmSchema)));
});
