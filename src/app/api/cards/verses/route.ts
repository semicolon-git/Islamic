import { handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { searchVerses } from "@/features/cards/server";

export const dynamic = "force-dynamic";

/** GET /api/cards/verses?q=10:5 | 10:5-7 | Arabic text (Quran matcher) | English words (translation) */
export const GET = handler(async (req: Request) => {
  await requireUser();
  return ok(await searchVerses(new URL(req.url).searchParams.get("q") ?? ""));
});
