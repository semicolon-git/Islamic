import { handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { lookupHadith } from "@/features/cards/server";

export const dynamic = "force-dynamic";

/** GET /api/cards/hadith?q=bukhari:1042 | keywords (Arabic trigram or English) */
export const GET = handler(async (req: Request) => {
  await requireUser();
  return ok(await lookupHadith(new URL(req.url).searchParams.get("q") ?? ""));
});
