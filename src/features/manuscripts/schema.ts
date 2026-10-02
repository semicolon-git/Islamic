/** zod schemas for the token model and the Studio APIs. */
import { z } from "zod";
import { MARK_KINDS } from "./marks";
import type { Tok } from "./tokens";

const str = (max = 2000) => z.string().max(max);

export const tokSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("text"), v: str() }),
  z.object({ t: z.literal("unclear"), v: str(), alts: z.array(str(200)).max(9).optional(), conf: z.number().min(0).max(100).optional(), cert: z.enum(["low", "medium", "high"]).optional(), rend: z.enum(["red", "gold", "overline", "large"]).optional() }),
  z.object({ t: z.literal("gap"), reason: z.enum(["illegible", "damage", "lacuna"]), extent: z.number().int().min(1).max(999).optional(), unit: z.enum(["char", "word"]).optional() }),
  z.object({ t: z.literal("supplied"), v: str(), reason: z.enum(["omitted", "damage"]).optional() }),
  z.object({ t: z.literal("del"), v: str(), rend: z.enum(["strike", "la_ila", "bracket", "zaid"]).optional() }),
  z.object({ t: z.literal("add"), v: str(), place: z.enum(["margin", "above", "below", "inline"]) }),
  z.object({ t: z.literal("abbr"), v: str(200), expan: str(400), confirmed: z.boolean().optional() }),
  z.object({ t: z.literal("mark"), kind: z.enum(MARK_KINDS), v: str(40), note: str(1000).optional() }),
  z.object({ t: z.literal("hi"), rend: z.enum(["red", "gold", "overline", "large"]), v: str() }),
]);

export const tokensSchema = z.array(tokSchema).max(600) as unknown as z.ZodType<Tok[]>;

export const pointSchema = z.tuple([z.number(), z.number()]);
export const polygonSchema = z.array(pointSchema).min(3).max(400);

export const REGION_TYPES = ["main", "margin", "title", "rubric", "catchword", "colophon", "seal", "illustration", "other"] as const;
export type RegionType = (typeof REGION_TYPES)[number];

export const saveLineSchema = z.object({
  base_version: z.number().int().min(0),
  tokens: tokensSchema,
  normalized_text: z.string().max(4000).nullable().optional(),
  note: z.string().max(500).optional(),
});

export const lockSchema = z.object({ action: z.enum(["acquire", "renew", "release"]) });

export const LICENSE_KINDS = ["public_domain", "pdm", "cc0", "cc_by", "cc_by_nc", "other"] as const;

export const manuscriptCreateSchema = z.object({
  title_ar: z.string().trim().min(2).max(300),
  title_en: z.string().trim().min(2).max(300),
  author_ar: z.string().trim().max(300).optional().default(""),
  author_en: z.string().trim().max(300).optional().default(""),
  repository: z.string().trim().min(2).max(300),
  shelfmark: z.string().trim().min(1).max(120),
  script: z.string().trim().max(120).optional().default(""),
  genre: z.enum(["general", "hadith", "rijal", "fiqh", "lexicon"]).default("general"),
  license: z.string().trim().min(2).max(500),
  credit_line: z.string().trim().min(5).max(600),
  source_url: z.string().trim().max(500).optional().default(""),
  siglum: z.string().trim().max(8).optional().default(""),
  work_id: z.string().trim().max(80).optional().default(""),
  copy_date_text: z.string().trim().max(120).optional().default(""),
});

export const workflowSchema = z.object({
  decision: z.enum(["submit", "approve", "return", "publish", "archive"]),
  note: z.string().trim().max(1000).optional(),
});

export const flagSchema = z.object({ flagged: z.boolean(), reason: z.string().trim().max(500).optional() });

export const regionCreateSchema = z.object({ type: z.enum(REGION_TYPES), polygon: polygonSchema });
export const regionPatchSchema = z.object({ type: z.enum(REGION_TYPES).optional(), polygon: polygonSchema.optional(), seq: z.number().int().optional() });
export const lineCreateSchema = z.object({ polygon: polygonSchema, region_id: z.string().nullable().optional() });
export const linePatchSchema = z.object({ polygon: polygonSchema.optional(), region_id: z.string().nullable().optional() });
export const reorderSchema = z.object({ line_ids: z.array(z.string()).min(1).max(500) });
export const segmentSchema = z.object({ replace: z.boolean().optional() });
