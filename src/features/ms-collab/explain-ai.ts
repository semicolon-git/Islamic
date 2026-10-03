/**
 * Optional AI gloss for "Explain this line". Clearly an *AI draft — not reviewed*; it never alters the manuscript text,
 * never types Quran or hadith text (verses by key only), and has a deterministic no-key path (the caller then shows only
 * the reading layer, confirmed references and abbreviation expansions).
 */
import { z } from "zod";
import { AiFailure, aiEnabled, callStructured } from "@/lib/ai/claude";
import type { QuranIndex } from "@/lib/quran/matcher";
import { detectQuotes } from "./quran-detect";

export const glossSchema = z.object({
  gloss_en: z.string().max(1200).describe("Plain-English explanation of what the line says, for a student. At most 80 words."),
  gloss_ar: z.string().max(1500).describe("The same explanation in clear modern Arabic. At most 80 words."),
  uncertain: z.boolean().describe("True if the line is too fragmentary or uncertain to explain with confidence."),
});
export type Gloss = z.infer<typeof glossSchema>;

export const GLOSS_SYSTEM = `You help students understand one line of a classical Arabic manuscript that they are transcribing.
Rules (strict):
- Explain the meaning in plain language. Do not rewrite, correct, vocalise or "fix" the manuscript text: it is evidence.
- Never write out Quran text or hadith text. If the line quotes the Quran, refer to the verse only by its key (for example 43:15).
- Do not give religious rulings or opinions; describe what the text says.
- Words marked [?] or […] are uncertain or missing: say so instead of guessing.
- If the line is a fragment, explain the visible words and say it continues on the next line.
- Keep each explanation under 80 words.`;

export interface GlossInput {
  reading: string;
  genre: string;
  work: string;
  abbreviations: { written: string; expan: string }[];
  verseKeys: string[];
  prevLine?: string;
  nextLine?: string;
}

export type GlossOutcome =
  | { available: false }
  | { available: true; gloss_en: string; gloss_ar: string; model: string; uncertain: boolean }
  | { available: true; failure: string };

/** Ask the model for a gloss. Quran text in the answer (exact match of 4+ words) withholds the gloss. */
export async function aiGloss(input: GlossInput, ix: QuranIndex | null): Promise<GlossOutcome> {
  if (!aiEnabled()) return { available: false };
  const user = [
    `Work: ${input.work} (genre: ${input.genre}).`,
    input.prevLine ? `Previous line (context only): ${input.prevLine}` : null,
    `LINE TO EXPLAIN: ${input.reading}`,
    input.nextLine ? `Next line (context only): ${input.nextLine}` : null,
    input.abbreviations.length ? `Abbreviations confirmed by a person: ${input.abbreviations.map((a) => `${a.written} = ${a.expan}`).join("; ")}` : null,
    input.verseKeys.length ? `Confirmed Quran references in this line (refer by key only): ${input.verseKeys.join(", ")}` : null,
  ].filter(Boolean).join("\n");
  try {
    const r = await callStructured({ agent: "composer", system: GLOSS_SYSTEM, user, schema: glossSchema, effort: "medium", maxTokens: 1200 });
    if (ix && detectQuotes(ix, [{ line_id: "gloss", n: 1, text: r.data.gloss_ar }]).some((p) => p.match === "exact"))
      return { available: true, failure: "withheld_quran" };
    return { available: true, gloss_en: r.data.gloss_en.trim(), gloss_ar: r.data.gloss_ar.trim(), model: r.model, uncertain: r.data.uncertain };
  } catch (e) {
    return { available: true, failure: e instanceof AiFailure ? e.kind : "api" };
  }
}
