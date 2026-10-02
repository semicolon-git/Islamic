import { body, handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { InscriptionInput } from "@/features/heritage/schemas";
import { addInscription } from "@/features/heritage/server";

export const dynamic = "force-dynamic";

/** Record an inscription reading for an item; the matcher's proposal is stored with it (status: suggested). */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { id } = await ctx.params;
  const { transcription, verse_keys } = await body(req, InscriptionInput);
  return ok(await addInscription(user, id, transcription, verse_keys), { status: 201 });
});
