import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handler, HttpError, ok } from "@/lib/http";
import { createUpload, listBooks, MAX_PDF_BYTES } from "@/features/library/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** GET /api/library/books — every book with its status (portal). */
export const GET = handler(async () => {
  await requireUser();
  return ok(await listBooks());
});

const Meta = z.object({
  title_en: z.string().trim().max(300).default(""),
  title_ar: z.string().trim().max(300).default(""),
  author_en: z.string().trim().max(300).default(""),
  author_ar: z.string().trim().max(300).default(""),
  lang: z.enum(["ar", "en"]).default("ar"),
  note_en: z.string().trim().max(1000).optional(),
  note_ar: z.string().trim().max(1000).optional(),
  source_url: z.string().trim().url().max(500).optional().or(z.literal("")),
  licence_note: z.string().trim().min(3, "Say why the platform may use this book (licence or permission).").max(500),
  rights: z.literal("yes", { message: "Confirm that the institution has the right to use this book." }),
}).refine((m) => m.title_en || m.title_ar, { message: "Give the book a title.", path: ["title_en"] });

/** POST /api/library/books — upload a PDF (multipart: file + metadata). Processed in the background, then reviewed. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser(["researcher", "institution_admin"]);
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "invalid_body", "Send multipart/form-data with a 'file' field.");
  const file = form.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "no_file", "Choose a PDF file.");
  if (file.size > MAX_PDF_BYTES) throw new HttpError(413, "too_large", `PDFs must be ${MAX_PDF_BYTES / 1024 / 1024} MB or smaller.`);
  const fields = Object.fromEntries([...form.entries()].filter(([k, v]) => k !== "file" && typeof v === "string"));
  const parsed = Meta.safeParse(fields);
  if (!parsed.success) throw new HttpError(400, "invalid_meta", parsed.error.issues[0]?.message ?? "Check the form.", { issues: parsed.error.issues });
  const book = await createUpload(user, Buffer.from(await file.arrayBuffer()), { ...parsed.data, source_url: parsed.data.source_url || undefined });
  return ok(book, { status: 201 });
});
