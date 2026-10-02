import { requireUser } from "@/lib/auth";
import { body, handler, ok } from "@/lib/http";
import { manuscriptCreateSchema } from "@/features/manuscripts/schema";
import { listManuscripts } from "@/features/manuscripts/server/repo";
import { createManuscript } from "@/features/manuscripts/server/manuscripts";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireUser();
  return ok({ manuscripts: await listManuscripts() });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser(["researcher", "institution_admin"]);
  const input = await body(req, manuscriptCreateSchema);
  return ok(await createManuscript(user, input), { status: 201 });
});
