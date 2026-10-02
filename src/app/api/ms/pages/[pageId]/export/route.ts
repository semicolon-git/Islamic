import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";
import { baseUrlOf, exportDoc, FORMATS, render, type Format } from "@/features/manuscripts/server/export";

export const dynamic = "force-dynamic";

/** GET /api/ms/pages/:id/export?format=tei|txt|json|jsonl&layer=diplomatic|reading */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ pageId: string }> }) => {
  await requireUser();
  const { pageId } = await ctx.params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "tei") as Format;
  if (!FORMATS.includes(format)) throw new HttpError(400, "bad_format", "Choose tei, txt, json or jsonl.");
  const layer = url.searchParams.get("layer") === "reading" ? "reading" : "diplomatic";
  const page = await one<{ manuscript_id: string }>("select manuscript_id from ms_pages where id = $1", [pageId]);
  if (!page) throw new HttpError(404, "not_found", "This page doesn't exist.");
  const doc = await exportDoc(page.manuscript_id, [pageId], baseUrlOf(req));
  return render(doc, format, layer, pageId);
});
