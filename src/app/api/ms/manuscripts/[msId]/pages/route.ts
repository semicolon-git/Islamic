import { requireUser } from "@/lib/auth";
import { handler, HttpError, ok } from "@/lib/http";
import { addPages } from "@/features/manuscripts/server/manuscripts";
import { MAX_UPLOAD_BYTES } from "@/features/manuscripts/server/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Upload page images (multipart: files[] + segment=1). */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ msId: string }> }) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const { msId } = await ctx.params;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "bad_form", "Send the images as a multipart form.");
  }
  const files: { name: string; type: string; data: Buffer }[] = [];
  for (const v of form.getAll("files")) {
    if (typeof v === "string") continue;
    if (v.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "too_large", `"${v.name}" is larger than 15 MB.`);
    files.push({ name: v.name || "page", type: v.type, data: Buffer.from(await v.arrayBuffer()) });
  }
  const segment = form.get("segment") !== "0";
  return ok({ pages: await addPages(user, msId, files, segment) }, { status: 201 });
});
