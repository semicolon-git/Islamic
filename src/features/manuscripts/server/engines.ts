import "server-only";
import path from "node:path";
import { z } from "zod";
import { AiFailure, aiEnabled, callStructured } from "@/lib/ai/claude";
import { env } from "@/lib/env";
import { fromWords, mergeAdjacent, normalizeTokens, type Tok } from "../tokens";

export interface LineCrop { line_id: string; png: Buffer }
export interface DraftLine { line_id: string; tokens: Tok[] }
export interface DraftOutput { engine: string; lines: DraftLine[]; note?: string }

/**
 * Transcription-only prompt (research memo M2, review doc risk 15). The model must never correct the manuscript.
 * Versioned so the published record can cite which prompt produced the draft.
 */
export const DRAFT_PROMPT_VERSION = "ms-draft-v1";
export const DRAFT_SYSTEM = `You produce a machine DRAFT of a diplomatic transcription of a historical Arabic manuscript, one image per text line.
Human students and researchers will check every word against the image, so honesty about uncertainty matters more than fluency.

Rules — follow all of them:
1. Transcribe exactly what is written, letter by letter, as the scribe wrote it. Do not correct spelling, grammar or the scribe's slips.
2. Do not modernise orthography: keep omitted or "eased" hamza, ى for ي, ه for ة, missing alef, as written.
3. Do not add dots (iʿjām) or diacritics (tashkīl) that are not visible in the image. Include vowel signs only where the scribe wrote them.
4. Do not expand abbreviations (e.g. ثنا, ع, م, صلعم stay as written). Do not insert ﷺ.
5. Never "fix" or complete a Quranic quotation to the standard muṣḥaf text. Transcribe the scribe's wording, even if it differs.
6. Do not translate, explain, summarise or add punctuation that is not on the page.
7. Uncertainty: if you are not sure of a word, output it as an "unclear" token with your best reading in "v" and up to three other plausible readings in "alts".
8. If a word cannot be read at all, output a "gap" token with reason "illegible", or "damage" when the paper is physically damaged.
9. Output each word as its own token. Return exactly one entry per line_id, in the order given; never merge or split lines. If a line image is blank, return an empty token list.`;

const draftSchema = z.object({
  lines: z.array(
    z.object({
      line_id: z.string(),
      tokens: z.array(
        z.object({
          t: z.enum(["text", "unclear", "gap"]),
          v: z.string().optional(),
          alts: z.array(z.string()).optional(),
          reason: z.enum(["illegible", "damage"]).optional(),
        }),
      ),
    }),
  ),
});

type ModelTok = z.infer<typeof draftSchema>["lines"][number]["tokens"][number];

/** Convert the model's word tokens to our token model: spaces between words, alternatives cleaned, never a model "confidence". */
export function modelTokensToTokens(words: ModelTok[]): Tok[] {
  const out: Tok[] = [];
  for (const w of words) {
    let tok: Tok | null = null;
    if (w.t === "gap") tok = { t: "gap", reason: w.reason ?? "illegible" };
    else {
      const v = (w.v ?? "").trim();
      if (!v) continue;
      if (w.t === "unclear") {
        const alts = [...new Set((w.alts ?? []).map((a) => a.trim()).filter((a) => a && a !== v))].slice(0, 3);
        tok = { t: "unclear", v, ...(alts.length ? { alts } : {}) };
      } else tok = { t: "text", v };
    }
    if (out.length) out.push({ t: "text", v: " " });
    out.push(tok);
  }
  return normalizeTokens(mergeAdjacent(out)).tokens;
}

/**
 * Line crops are only ~50–70 px tall at page resolution; doubling them (≤ 2600 px wide) measurably steadies the model:
 * page CER 12–13% vs 14–42% run to run at native size (scripts/ms-draft-bench.ts, bnf-arabe-5341_03).
 */
export async function enlargeForVision(png: Buffer, maxWidth = 2600): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    const m = await sharp(png).metadata();
    const w = m.width ?? 0;
    const k = Math.min(2, maxWidth / Math.max(1, w));
    if (!w || k <= 1.05) return png;
    return await sharp(png).resize({ width: Math.round(w * k), kernel: "lanczos3" }).png().toBuffer();
  } catch {
    return png; // unreadable image: send as is and let the model (or the fallback) deal with it
  }
}

/**
 * Claude vision draft: batches of several line crops per call, structured tokens.
 * A batch whose answer comes back cut off or malformed is retried once as two smaller batches, so one bad batch
 * doesn't send the whole page to the open-source fallback. Refusals and API errors still fail the draft.
 */
export async function draftWithClaude(crops: LineCrop[], opts: { batch?: number; context?: string; effort?: "low" | "medium" | "high" } = {}): Promise<DraftOutput> {
  const size = opts.batch ?? 6;
  const lines: DraftLine[] = [];
  let model = env.models.draft;
  const run = async (chunk: LineCrop[], retry: boolean): Promise<void> => {
    const user = [
      opts.context ? `Manuscript: ${opts.context}` : "",
      `Transcribe these ${chunk.length} line images in order. Image k corresponds to line_id:`,
      ...chunk.map((c, k) => `Image ${k + 1} → line_id "${c.line_id}"`),
    ].filter(Boolean).join("\n");
    let r;
    try {
      r = await callStructured({
        agent: "draft",
        system: DRAFT_SYSTEM,
        user,
        images: await Promise.all(chunk.map(async (c) => ({ mediaType: "image/png" as const, base64: (await enlargeForVision(c.png)).toString("base64") }))),
        schema: draftSchema,
        effort: opts.effort ?? "medium",
        maxTokens: 400 + chunk.length * 500,
        timeoutMs: 90_000,
      });
    } catch (e) {
      if (retry && chunk.length > 1 && e instanceof AiFailure && (e.kind === "parse" || e.kind === "max_tokens")) {
        const half = Math.ceil(chunk.length / 2);
        await run(chunk.slice(0, half), false);
        await run(chunk.slice(half), false);
        return;
      }
      throw e;
    }
    model = r.model;
    const byId = new Map(r.data.lines.map((l) => [l.line_id, l]));
    for (const c of chunk) {
      const l = byId.get(c.line_id);
      if (l) lines.push({ line_id: c.line_id, tokens: modelTokensToTokens(l.tokens) });
    }
  };
  for (let i = 0; i < crops.length; i += size) await run(crops.slice(i, i + size), true);
  return { engine: `claude:${model}`, lines };
}

type TesseractWorker = {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(img: Buffer, opts?: unknown, out?: unknown): Promise<{ data: { blocks?: { paragraphs: { lines: { words: { text: string; confidence: number }[] }[] }[] }[] | null } }>;
  terminate(): Promise<unknown>;
};

/**
 * Open-source OCR draft without an API key: tesseract.js with the local Arabic model (data/ocr/ara.traineddata).
 * Honest label: it is trained on print and is weak on manuscripts (dataset CER ≈ 0.5–0.8).
 */
export async function draftWithTesseract(crops: LineCrop[]): Promise<DraftOutput> {
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const worker = (await createWorker("ara", OEM.LSTM_ONLY, {
    langPath: path.join(process.cwd(), "data", "ocr"),
    gzip: false,
    cacheMethod: "none",
  })) as unknown as TesseractWorker;
  try {
    await worker.setParameters({ tessedit_pageseg_mode: String(PSM.SINGLE_LINE), preserve_interword_spaces: "1" });
    const lines: DraftLine[] = [];
    for (const c of crops) {
      const r = await worker.recognize(c.png, {}, { text: true, blocks: true });
      const words = (r.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
      lines.push({ line_id: c.line_id, tokens: normalizeTokens(fromWords(words.map((w) => ({ t: w.text, conf: w.confidence })))).tokens });
    }
    return { engine: "tesseract", lines };
  } finally {
    await worker.terminate();
  }
}

/** Pick the engine: Claude when a key is configured, Tesseract otherwise or when the AI call fails. */
export async function draftLines(crops: LineCrop[], context?: string): Promise<DraftOutput> {
  if (aiEnabled()) {
    try {
      return await draftWithClaude(crops, { context });
    } catch (e) {
      const why = e instanceof AiFailure ? e.kind : "error";
      const out = await draftWithTesseract(crops);
      return { ...out, note: `AI draft unavailable (${why}); used open-source OCR instead.` };
    }
  }
  return draftWithTesseract(crops);
}
