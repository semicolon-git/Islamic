import { z } from "zod";
import { body, handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { resolveDraft } from "@/features/cards/server";

export const dynamic = "force-dynamic";

const Input = z.object({
  verses: z.array(z.string().max(12)).max(60).default([]),
  hadith: z.array(z.string().max(40)).max(40).default([]),
  glossary_terms: z.array(z.string().max(80)).max(40).default([]),
  concept_id: z.string().max(80).nullable().default(null),
  show_count: z.boolean().default(false),
});

/** POST /api/cards/resolve — resolve unsaved editor references from the database for the live preview. */
export const POST = handler(async (req: Request) => {
  await requireUser();
  return ok(await resolveDraft(await body(req, Input)));
});
