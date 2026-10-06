import { fail, handler, ok } from "@/lib/http";
import { wordTimings } from "@/lib/quran/recitation-segments";

/** GET /api/quran/recitation?keys=10:5,36:39 → word timings per verse (null = no highlighting for that verse). */
export const GET = handler(async (req: Request) => {
  const keys = (new URL(req.url).searchParams.get("keys") ?? "").split(",").filter(Boolean).slice(0, 50);
  if (!keys.length) return fail(400, "invalid_input", "Pass verse keys, e.g. ?keys=10:5");
  return ok({ timings: wordTimings(keys) }, { headers: { "Cache-Control": "public, max-age=86400" } });
});
