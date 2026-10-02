import { requireUser } from "@/lib/auth";
import { handler, HttpError } from "@/lib/http";
import { baseUrlOf, exportDoc, FORMATS, render, type Format } from "@/features/manuscripts/server/export";

export const dynamic = "force-dynamic";

/** GET /api/ms/manuscripts/:id/export?format=tei|txt|json|jsonl&layer=diplomatic|reading */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ msId: string }> }) => {
  await requireUser();
  const { msId } = await ctx.params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "tei") as Format;
  if (!FORMATS.includes(format)) throw new HttpError(400, "bad_format", "Choose tei, txt, json or jsonl.");
  const layer = url.searchParams.get("layer") === "reading" ? "reading" : "diplomatic";
  const doc = await exportDoc(msId, null, baseUrlOf(req));
  return render(doc, format, layer, msId);
});
