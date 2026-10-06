import { handler, HttpError, ok } from "@/lib/http";
import { tafsirFor } from "@/features/library/server";

export const dynamic = "force-dynamic";

/** GET /api/library/tafsir?verse=2:255[&book=tafsir-muyassar] — verbatim tafsir passages covering a verse (approved books). */
export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);
  const verse = url.searchParams.get("verse") ?? "";
  if (!/^\d{1,3}:\d{1,3}$/.test(verse)) throw new HttpError(400, "bad_verse", "Use verse=sura:aya, e.g. 2:255.");
  const books = url.searchParams.getAll("book").filter((b) => /^[a-z0-9_-]{2,60}$/.test(b));
  return ok(await tafsirFor(verse, { books, maxChars: Number(url.searchParams.get("max")) || undefined }));
});
