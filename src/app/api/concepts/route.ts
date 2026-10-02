import { handler, ok, HttpError } from "@/lib/http";
import { listConcepts } from "@/features/beneficiary/data";
import { TRACKS, type Track } from "@/features/beneficiary/labels";

export const dynamic = "force-dynamic";

/** GET /api/concepts?track=nature|art|heritage → enabled concepts with whether an approved card exists. */
export const GET = handler(async (req: Request) => {
  const track = new URL(req.url).searchParams.get("track");
  if (track && !TRACKS.includes(track as Track)) throw new HttpError(400, "invalid_track", "track must be nature, art or heritage.");
  const concepts = await listConcepts((track as Track) || undefined);
  return ok(concepts);
});
