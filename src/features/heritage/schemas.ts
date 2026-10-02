import { z } from "zod";
import { ITEM_KINDS } from "./codes";

export const LICENSES = ["cc0", "pd", "ccby", "ccbysa", "own", "permission", "generated"] as const;
/** Stored licence text per option (English, as printed in credit lines). */
export const LICENSE_TEXT: Record<(typeof LICENSES)[number], string> = {
  cc0: "CC0 1.0",
  pd: "Public domain",
  ccby: "CC BY 4.0",
  ccbysa: "CC BY-SA 4.0",
  own: "© Institution — all rights reserved",
  permission: "Used with permission",
  generated: "Generated illustration (decorative)",
};

const trimmed = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Image entry with mandatory rights: a licence and a credit line. */
export const ItemImageInput = z.object({
  src: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .refine((s) => /^\/api\/items\/files\/[a-z0-9_]+\.webp$/.test(s) || /^https:\/\//.test(s) || /^\/images\//.test(s), "Unsupported image source"),
  credit: trimmed(300).min(2, "Credit line is required"),
  license: trimmed(120).min(2, "Licence is required"),
  source_url: z
    .string()
    .trim()
    .max(600)
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || /^https?:\/\//.test(v), "Source link must start with http(s)://"),
  generated: z.boolean().optional().default(false),
  alt_en: optText(200),
  alt_ar: optText(200),
});

export const ItemInput = z.object({
  title_en: trimmed(200).min(2),
  title_ar: trimmed(200).min(2),
  kind: z.enum(ITEM_KINDS as [string, ...string[]]),
  venue_id: optText(80),
  concept_id: optText(80),
  card_id: optText(120),
  manuscript_id: optText(120),
  date_text: optText(120),
  date_text_ar: optText(120),
  origin: optText(160),
  origin_ar: optText(160),
  material: optText(160),
  material_ar: optText(160),
  description_en: optText(4000),
  description_ar: optText(4000),
  images: z.array(ItemImageInput).max(8).default([]),
});
export type ItemInput = z.infer<typeof ItemInput>;

export const TransitionInput = z.object({
  decision: z.enum(["submit", "approve", "return", "publish", "archive"]),
  note: optText(1000),
});

export const InscriptionInput = z.object({
  transcription: trimmed(2000).min(1),
  verse_keys: z.array(z.string().regex(/^\d{1,3}:\d{1,3}$/)).max(12).default([]),
});

export const InscriptionAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("link"), verse_keys: z.array(z.string().regex(/^\d{1,3}:\d{1,3}$/)).max(12) }),
  z.object({ action: z.literal("confirm"), note: optText(1000) }),
  z.object({ action: z.literal("reject"), note: optText(1000) }),
]);

export const InscribeInput = z
  .object({
    text: z.string().max(2000).optional(),
    image: z
      .object({
        mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        // ~9 MB of base64; the client downsizes to ≤ 1600 px JPEG first.
        base64: z.string().min(16).max(12_000_000),
      })
      .optional(),
  })
  .refine((v) => !!v.text?.trim() || !!v.image, "Send text or an image.");
