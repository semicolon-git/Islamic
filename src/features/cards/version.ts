import { z } from "zod";
import { CardContent } from "@/lib/cards/types";
import type { VersionDoc } from "./diff";

/**
 * A card_versions.content row stores the CardContent plus a `_meta` object (titles, level, certainty, concept,
 * match phrases). Versioning the meta means editing a published card never changes the live title or level:
 * the cards row is updated from `_meta` only on publish. resolveCard() ignores `_meta` (zod strips unknown keys).
 */
export const CardMetaSchema = z.object({
  title_en: z.string().max(200).default(""),
  title_ar: z.string().max(200).default(""),
  level: z.enum(["A", "B", "C", "D"]).default("A"),
  certainty: z.enum(["established", "disputed", "ijma"]).default("established"),
  concept_id: z.string().nullable().default(null),
  match_phrases: z.array(z.string().max(200)).max(40).default([]),
});
export type VersionMeta = z.infer<typeof CardMetaSchema>;

export function parseVersion(raw: unknown, fallback: VersionMeta): VersionDoc {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const meta = obj._meta ? CardMetaSchema.parse(obj._meta) : fallback;
  return { meta, content: CardContent.parse(obj) };
}

export function serializeVersion(doc: VersionDoc): Record<string, unknown> {
  return { ...doc.content, _meta: doc.meta };
}

/** Deterministic JSON (sorted keys) so the same content always hashes the same. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as Record<string, unknown>)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

export const emptyContent = (): CardContent => CardContent.parse({});
