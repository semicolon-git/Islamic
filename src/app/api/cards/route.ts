import { z } from "zod";
import { body, handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { createCard, listCards, publishedCards } from "@/features/cards/server";

export const dynamic = "force-dynamic";

/** GET /api/cards?stage=&kind=&track=&concept=&q=&mine=1 · GET /api/cards?published=1&q= (any portal user) */
export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);
  const sp = url.searchParams;
  if (sp.get("published")) {
    await requireUser();
    return ok({ items: await publishedCards(sp.get("q") ?? "", Math.min(Number(sp.get("limit")) || 30, 100)) });
  }
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  return ok(
    await listCards(user, {
      stage: sp.get("stage") ?? undefined,
      kind: sp.get("kind") ?? undefined,
      track: sp.get("track") ?? undefined,
      concept: sp.get("concept") ?? undefined,
      q: sp.get("q") ?? undefined,
      mine: sp.get("mine") === "1",
    }),
  );
});

const CreateInput = z.object({
  kind: z.enum(["concept", "answer"]),
  concept_id: z.string().max(80).nullable().optional(),
  title_en: z.string().trim().max(200).default(""),
  title_ar: z.string().trim().max(200).default(""),
}).refine((v) => v.title_en || v.title_ar, { message: "Give the card a title in at least one language." });

export const POST = handler(async (req: Request) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const input = await body(req, CreateInput);
  const res = await createCard(user, { kind: input.kind, concept_id: input.concept_id ?? null, title_en: input.title_en, title_ar: input.title_ar });
  return ok(res, { status: 201 });
});
