import { requireUser } from "@/lib/auth";
import { handler, HttpError } from "@/lib/http";
import { bookFile } from "@/features/library/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/library/books/:id/file — the uploaded PDF (portal users only; never public). */
export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await ctx.params;
  const f = await bookFile(id);
  if (!f) throw new HttpError(404, "not_found", "No file for this book.");
  return new Response(new Uint8Array(f.data), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${f.name}"`, "cache-control": "private, no-store" } });
});
