import { body, handler, HttpError, ok } from "@/lib/http";
import { AiFailure, aiEnabled } from "@/lib/ai/claude";
import { hasArabic } from "@/lib/quran/normalize";
import { InscribeInput } from "@/features/heritage/schemas";
import { readInscriptionText } from "@/features/heritage/verses";
import { transcribeInscription } from "@/features/heritage/vision";
import { rateLimit } from "@/features/ask/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Read an inscription: typed text → matcher; or a photo → vision transcription → matcher.
 * Photos are processed in memory only. Nothing is stored and nothing is logged.
 */
export const POST = handler(async (req: Request) => {
  const input = await body(req, InscribeInput);
  if (input.image) {
    // The photo path is a paid vision call: a light per-IP limit stops accidental floods.
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
    if (!rateLimit(`inscribe:${ip}`, 30, 10 * 60_000)) throw new HttpError(429, "rate_limited", "Too many photos in a short time. Please wait a few minutes.");
    if (!aiEnabled()) throw new HttpError(503, "ai_disabled", "Photo reading isn't available on this server. Type the text instead.");
    let reading;
    try {
      reading = await transcribeInscription({ mediaType: input.image.mediaType, base64: input.image.base64 });
    } catch (e) {
      if (e instanceof AiFailure) throw new HttpError(502, "ai_failed", "We couldn't read this photo just now.", { kind: e.kind });
      throw e;
    }
    if (!reading.text || !hasArabic(reading.text)) return ok({ reading, view: null });
    const { view } = await readInscriptionText(reading.text);
    return ok({ reading, view });
  }
  const text = (input.text ?? "").trim();
  if (!hasArabic(text)) throw new HttpError(400, "not_arabic", "Type Arabic letters: we compare against the Arabic text of the Quran.");
  const { view } = await readInscriptionText(text);
  return ok({ reading: null, view });
});
