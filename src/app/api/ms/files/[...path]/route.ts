import fs from "node:fs";
import { getUser } from "@/lib/auth";
import { handler, HttpError } from "@/lib/http";
import { resolveFile } from "@/features/manuscripts/server/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Page images and thumbnails: the read-only demo corpus (data/manuscripts) and uploads (UPLOAD_DIR/ms).
 * Safe path handling lives in resolveFile(). Uploaded images need a portal session; the openly licensed dataset
 * images are public so the beneficiary reader can show published pages.
 */
export const GET = handler(async (_req: Request, ctx: { params: Promise<{ path: string[] }> }) => {
  const { path } = await ctx.params;
  const { file, type, immutable } = resolveFile(path);
  if (!immutable && !(await getUser())) throw new HttpError(401, "unauthenticated", "Please sign in to the portal.");
  const data = await fs.promises.readFile(file);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": type,
      "cache-control": immutable ? "public, max-age=86400, immutable" : "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
});
