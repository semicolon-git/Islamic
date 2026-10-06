import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { body, handler, HttpError, ok } from "@/lib/http";
import { bookPassages, getBook, reviewBook } from "@/features/library/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/library/books/:id?q=&offset= — the book and a page of its passages (portal). */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await ctx.params;
  const book = await getBook(id);
  if (!book) throw new HttpError(404, "not_found", "This book doesn't exist.");
  const url = new URL(req.url);
  const passages = await bookPassages(id, { q: url.searchParams.get("q") ?? "", offset: Number(url.searchParams.get("offset") ?? 0) || 0, limit: 30 });
  return ok({ book, passages });
});

const Action = z.object({ action: z.enum(["approve", "archive", "unarchive", "retry", "delete"]) });

/** POST /api/library/books/:id {action} — review actions (approve needs an institution admin other than the uploader). */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(["researcher", "institution_admin"]);
  const { id } = await ctx.params;
  const { action } = await body(req, Action);
  return ok(await reviewBook(user, id, action));
});
