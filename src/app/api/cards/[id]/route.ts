import { z } from "zod";
import { body, handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { CardContent } from "@/lib/cards/types";
import { checklistFor, getCardDetail, saveCard } from "@/features/cards/server";
import { CardMetaSchema } from "@/features/cards/version";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const cardId = async (ctx: Ctx) => decodeURIComponent((await ctx.params).id);

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const detail = await getCardDetail(user, await cardId(ctx));
  const check = await checklistFor(detail.card.kind, detail.doc, false);
  return ok({ ...detail, checklist: check.items, lint: check.lint });
});

const SaveInput = z.object({
  base_version: z.number().int().positive(),
  meta: CardMetaSchema,
  content: CardContent,
  note: z.string().max(300).nullable().optional(),
});

export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const input = await body(req, SaveInput);
  return ok(await saveCard(user, await cardId(ctx), input));
});
