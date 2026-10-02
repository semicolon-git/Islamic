import { handler, HttpError, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/events";
import { getDb } from "@/lib/db";
import { MAX_UPLOAD_BYTES, storeItemImage, UploadError } from "@/features/heritage/uploads";

export const dynamic = "force-dynamic";

/** Upload one item image (multipart field "file"). Returns its public URL. EXIF/GPS are stripped on re-encode. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser(["student", "researcher", "institution_admin"]);
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, "too_large", "Images must be 10 MB or smaller.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "bad_form", "Send the image as multipart form data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "no_file", "Choose an image to upload.");
  try {
    const out = await storeItemImage(Buffer.from(await file.arrayBuffer()), file.type);
    const db = await getDb();
    await audit(db, user.id, "item.image_upload", "item_image", out.src, null, { width: out.width, height: out.height });
    return ok(out, { status: 201 });
  } catch (e) {
    if (e instanceof UploadError) throw new HttpError(e.code === "too_large" ? 413 : 400, e.code, e.message);
    throw e;
  }
});
