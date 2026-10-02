import "server-only";
import { z } from "zod";
import { AiFailure, aiEnabled, callStructured, type ImageInput } from "@/lib/ai/claude";

/**
 * Vision transcription of an inscription photo (agent "vision").
 * The model transcribes what it SEES, word by word, flags uncertain words, and never completes or corrects
 * a quotation from memory. Identification of the verse is done afterwards by the deterministic matcher.
 * The photo is processed in memory only and never stored.
 */
export const VISION_PROMPT_VERSION = "inscription-v1";

export const TranscriptionSchema = z.object({
  has_arabic_text: z.boolean().describe("false if no readable Arabic writing is visible"),
  words: z
    .array(
      z.object({
        text: z.string().describe("one word exactly as written (Arabic script); no added diacritics"),
        uncertain: z.boolean().describe("true if you are not sure of this word"),
        alternatives: z.array(z.string()).describe("other plausible readings of an uncertain word (max 3)"),
      }),
    )
    .describe("the words in reading order (right to left, top to bottom)"),
  script_tier: z.enum(["kufic", "naskh", "thuluth", "diwani", "maghribi", "nastaliq", "other", "unsure"]),
  legibility: z.enum(["clear", "partly_legible", "illegible"]),
});
export type Transcription = z.infer<typeof TranscriptionSchema>;

const SYSTEM = `You read Arabic calligraphy and inscriptions from photos for a museum guide app.
Transcribe ONLY the Arabic writing that is visible, exactly as written, word by word, in reading order.
Rules:
- Do not complete, correct or "fix" the text, even if it looks like a well-known Quranic verse, hadith or saying. If words are cut off, hidden or damaged, stop there or mark them uncertain. Never add words that are not visible.
- Do not add diacritics (tashkil) that are not clearly written.
- Mark a word uncertain when you are not sure; give up to 3 alternative readings.
- Do not translate and do not identify the source. Another system does that.
- Ignore Latin text, signatures in other scripts, and decorative motifs.
- If there is no readable Arabic writing, return has_arabic_text=false and an empty word list.`;

export interface VisionReading {
  text: string;
  words: Transcription["words"];
  script_tier: Transcription["script_tier"];
  legibility: Transcription["legibility"];
  model: string;
}

export async function transcribeInscription(image: ImageInput): Promise<VisionReading> {
  if (!aiEnabled()) throw new AiFailure("disabled", "AI is not configured.");
  const res = await callStructured({
    agent: "vision",
    system: SYSTEM,
    user: "Transcribe the Arabic inscription in this photo, following the rules.",
    images: [image],
    schema: TranscriptionSchema,
    effort: "low",
    maxTokens: 2000,
  });
  const words = res.data.has_arabic_text ? res.data.words.filter((w) => w.text.trim()) : [];
  return {
    text: words.map((w) => w.text.trim()).join(" "),
    words: words.map((w) => ({ ...w, alternatives: w.alternatives.slice(0, 3) })),
    script_tier: res.data.script_tier,
    legibility: res.data.legibility,
    model: res.model,
  };
}
