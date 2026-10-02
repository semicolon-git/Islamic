import fs from "node:fs/promises";
import { safeItemPath } from "@/features/heritage/uploads";

export const dynamic = "force-dynamic";

/** Serve an uploaded item image. Only names produced by the uploader are accepted (no paths, no traversal). */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const p = safeItemPath(name);
  if (!p) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(p);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
