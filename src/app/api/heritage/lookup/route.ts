import { handler, HttpError, ok } from "@/lib/http";
import { isPlausibleCode, normalizeCode } from "@/features/heritage/codes";
import { publishedItemByCode, venueByCode } from "@/features/heritage/queries";

export const dynamic = "force-dynamic";

/** Resolve a typed or scanned code: a published item, or a venue. GET /api/heritage/lookup?code=ast7 */
export const GET = handler(async (req: Request) => {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!isPlausibleCode(code)) throw new HttpError(400, "invalid_code", "Label codes have 3–8 letters or numbers.");
  const item = await publishedItemByCode(code);
  if (item) return ok({ type: "item" as const, code: item.item_code, title_en: item.title_en, title_ar: item.title_ar });
  const venue = await venueByCode(code);
  if (venue) return ok({ type: "venue" as const, venue: { code: venue.code, name_en: venue.name_en, name_ar: venue.name_ar } });
  throw new HttpError(404, "not_found", `No published item or venue has the code ${normalizeCode(code)}.`);
});
