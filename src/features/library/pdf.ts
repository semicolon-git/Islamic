/**
 * PDF → page texts → passages, for books uploaded from the portal.
 * 1. The PDF's own text layer (pdfjs). Arabic presentation forms are folded (NFKC) and visually-ordered lines are
 *    detected and put back in reading order.
 * 2. Pages without a usable text layer (scans) can be read by Claude from the PDF itself, a few pages per call,
 *    with a verbatim-transcription prompt. Such passages are marked as machine-read; nothing is public before approval.
 */
import { z } from "zod";
import { aiEnabled, callStructured } from "@/lib/ai/claude";

export interface PageText { page: number; text: string; method: "text" | "ai" | "none" }

const AR = /[؀-ۿ]/;
// Frequent Arabic words and their character-reversed forms: tells logical from visual order.
const COMMON = ["الله", "في", "من", "على", "إلى", "التي", "الذي", "عن", "هذا", "قال", "كان", "ذلك"];
const REVERSED = COMMON.map((w) => [...w].reverse().join(""));

const countWords = (text: string, words: string[]) => {
  const toks = text.split(/\s+/);
  let n = 0;
  for (const t of toks) if (words.includes(t)) n++;
  return n;
};

/** Put a line back in logical order when the PDF stored Arabic visually (reversed). */
export function fixArabicOrder(text: string): string {
  const folded = text.normalize("NFKC");
  if (!AR.test(folded)) return folded;
  const normal = countWords(folded, COMMON);
  const reversed = countWords(folded, REVERSED);
  if (reversed <= normal || reversed < 2) return folded;
  return folded
    .split("\n")
    .map((line) => [...line].reverse().join("").replace(/[()[\]{}]/g, (c) => ({ "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{" })[c]!))
    .join("\n");
}

/** Tidy extracted text: fold presentation forms, drop tatweel runs and repeated whitespace, keep paragraph breaks. */
export function cleanText(s: string): string {
  return fixArabicOrder(s)
    .replace(/ـ{2,}/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split a page into passages of about `target` characters on paragraph, then sentence boundaries. */
export function toPassages(page: number, text: string, target = 1200): { ref: string; page: number; text: string }[] {
  const paras = text.split(/\n\s*\n|\n(?=\S{0,3}[-•*]|\d+[.)-])/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  for (const p of paras) {
    if (p.length > target * 1.5) {
      for (const s of p.split(/(?<=[.!?؟。])\s+/)) {
        if ((cur + " " + s).length > target) push();
        cur += (cur ? " " : "") + s;
      }
      continue;
    }
    if ((cur + "\n" + p).length > target) push();
    cur += (cur ? "\n" : "") + p;
  }
  push();
  return out.map((t, i) => ({ ref: `p${page}.${i + 1}`, page, text: t }));
}

/**
 * Is an extracted text layer usable? Many Arabic PDFs store glyphs one by one (shaped, reversed or without a
 * Unicode map), which extracts as isolated letters or control characters. Such pages are better read by Claude.
 */
export function textLayerUsable(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.replace(/\s/g, "").length < 40) return false;
  if (/[\u0000-\u0008\uFFFD]/.test(t)) return false;
  const arabic = t.split(" ").filter((w) => AR.test(w));
  if (arabic.length >= 8) {
    const single = arabic.filter((w) => [...w.replace(/[\u064B-\u0652\u0670]/g, "")].length === 1).length;
    if (single / arabic.length > 0.35) return false;
  }
  return true;
}

/** Text layer of every page. */
export async function extractTextLayer(data: Uint8Array): Promise<{ pages: PageText[]; numPages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs takes ownership of (detaches) the buffer it is given: hand it a copy.
  const doc = await pdfjs.getDocument({ data: data.slice(), useSystemFonts: false, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
  const pages: PageText[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
        if (typeof item.str !== "string") continue;
        text += item.str + (item.hasEOL ? "\n" : " ");
      }
      const clean = cleanText(text);
      const usable = textLayerUsable(clean);
      pages.push({ page: i, text: usable ? clean : "", method: usable ? "text" : "none" });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return { pages, numPages: pages.length };
}

const OcrSchema = z.object({
  pages: z.array(z.object({ page: z.number().int(), text: z.string(), legible: z.boolean() })),
});

export const OCR_SYSTEM = `You transcribe pages of a scanned book for a library of Islamic sources.
Rules:
- Transcribe the text exactly as printed, in reading order, page by page. Keep the book's own wording, spelling and diacritics when printed.
- Do not correct, complete, summarise, translate or comment. Never add Quran verses, hadith or words that are not printed.
- Skip running headers, page numbers and decorative elements. Keep footnotes at the end of the page text, prefixed with "—".
- If a page is blank or unreadable, return legible=false and an empty text.`;

/** Transcribe a short PDF (a few pages) with Claude. `firstPage` is the page number of its first page in the book. */
export async function ocrPdfChunk(pdfBase64: string, firstPage: number, count: number): Promise<PageText[]> {
  if (!aiEnabled()) return [];
  const r = await callStructured({
    agent: "draft",
    system: OCR_SYSTEM,
    user: `These are pages ${firstPage}–${firstPage + count - 1} of the book. Return one entry per page with "page" numbered from ${firstPage}.`,
    documents: [{ base64: pdfBase64 }],
    schema: OcrSchema,
    effort: "low",
    maxTokens: 1500 + count * 2500,
    timeoutMs: 180_000,
  });
  return r.data.pages
    .filter((p) => p.page >= firstPage && p.page < firstPage + count)
    .map((p) => ({ page: p.page, text: p.legible ? cleanText(p.text) : "", method: p.legible && p.text.trim() ? ("ai" as const) : ("none" as const) }));
}

/** Split a PDF into a smaller PDF with pages [from, to] (1-based, inclusive). */
export async function slicePdf(data: Uint8Array, from: number, to: number): Promise<string> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(data, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
  pages.forEach((p) => out.addPage(p));
  return Buffer.from(await out.save()).toString("base64");
}
