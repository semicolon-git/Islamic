import { handler, ok } from "@/lib/http";
import { publishedItems } from "@/features/heritage/queries";

export const dynamic = "force-dynamic";

/** Published heritage items, optionally scoped to a venue: GET /api/heritage/items?venue=NOOR */
export const GET = handler(async (req: Request) => {
  const venue = new URL(req.url).searchParams.get("venue");
  const items = await publishedItems(venue);
  return ok({
    items: items.map((i) => ({
      code: i.item_code,
      kind: i.kind,
      title_en: i.title_en,
      title_ar: i.title_ar,
      date_text: i.date_text,
      date_text_ar: i.date_text_ar,
      venue_code: i.venue_code,
      image: i.images[0] ?? null,
    })),
  });
});
