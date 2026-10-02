import { z } from "zod";
import type { StructuredCall, StructuredResult } from "@/lib/ai/claude";
import type { Catalogue } from "./catalogue";
import { cardEvidenceIds } from "./catalogue";
import type { ComposedBlock, Lang, Level } from "./types";

/**
 * Claude agents for Ask: router, composer, verifier (support + tone) and the strict hadith check.
 * The model never writes Quran or hadith text: it only points at evidence ids, and code inserts the text.
 */
export type CallFn = <S extends z.ZodType>(req: StructuredCall<S>) => Promise<StructuredResult<z.infer<S>>>;

export const PROMPT_VERSION = "ask-v1";

// ───────────────────────── Schemas (static so the cached prefix stays stable)
export const RouterOut = z.object({
  level: z.enum(["A", "B", "C", "D", "X"]),
  intent: z.enum(["explain", "misconception", "definition", "ruling", "personal_case", "hadith_request", "history", "disagreement", "comparison", "out_of_scope", "other"]),
  lang: z.enum(["en", "ar"]),
  flags: z.array(z.enum(["false_premise", "hostile_tone", "science_framing", "numerology", "sensitive", "needs_context"])),
  evidence_ids: z.array(z.string()),
});
export type RouterOut = z.infer<typeof RouterOut>;

export const ComposerBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("quote"), ref: z.string() }),
  z.object({ type: z.literal("hadith"), ref: z.string() }),
  z.object({ type: z.literal("fact"), ref: z.string() }),
  z.object({ type: z.literal("explanation"), text: z.string(), cites: z.array(z.string()) }),
  z.object({ type: z.literal("disagreement"), views: z.array(z.object({ text: z.string(), cites: z.array(z.string()) })) }),
  z.object({ type: z.literal("referral"), reason: z.string() }),
]);
export const ComposerOut = z.object({ blocks: z.array(ComposerBlock) });

export const VerifierOut = z.object({
  claims: z.array(z.object({ block: z.number().int(), supported: z.boolean(), note: z.string() })),
  tone: z.object({ scolding: z.boolean(), mirrors_hostility: z.boolean(), concedes_false_premise: z.boolean() }),
});
export type VerifierOut = z.infer<typeof VerifierOut>;

export const HadithCheckOut = z.object({ verdicts: z.array(z.object({ id: z.string(), states_claim: z.boolean() })) });

// ───────────────────────── Prompts
const POLICY = `You work for "Signs Around You", an app that answers questions about Islam ONLY from evidence approved by scholarly institutions.
Non-negotiable rules:
- Never write Quran text or hadith text yourself, in any language. Point at evidence ids; the app inserts the canonical text.
- Use only evidence ids from the catalogue or evidence list you are given. Ids look like Q:10:5, H:bukhari:1042, C:answer:kaaba, G:tawhid, F:count:moon.
- Levels: A = answer from source; B = answer with references, no categorical claims where scholars differ; C = state that scholars differ, at most 3 sourced views, no preference; D = personal case or fatwa request: never rule, give general information only, refer to a qualified body; X = judging specific people or groups, or private disputes: decline.
- Never issue rulings ("permissible for you", "you must"), never state which scholarly view is correct, never claim consensus unless a cited card is tagged ijma.
- No hadith grades in prose, no Quran word counts in prose, no "scientific miracle" or "science proves" framing, no number-pattern miracles, never speak as a scholar.
- Term-lock: say "Tawhid (Oneness of God)" not bare "unity"; never "holy war", "moon god", or "infidel"; Sharia is not reduced to penalties.
- Tone: calm, respectful, plain language first, gently correct false premises, never scold or mirror hostility.`;

export function catalogueText(cat: Catalogue): string {
  const cards = cat.cards
    .map((c) => `C:${c.id} | level ${c.level} | ${c.certainty} | "${c.title_en}" / "${c.title_ar}" | evidence: ${cardEvidenceIds(c).slice(1).join(" ")} | phrases: ${c.match_phrases.slice(0, 8).join("; ")}`)
    .join("\n");
  const gloss = cat.glossary.map((g) => `G:${g.id} | ${g.term_en} / ${g.term_ar}`).join("\n");
  return `APPROVED CATALOGUE (the only evidence you may choose from):\n${cards}\n\nGLOSSARY:\n${gloss}`;
}

export function routerSystem(cat: Catalogue): string {
  return `${POLICY}

You are the ROUTER. Classify the visitor's question and choose evidence ids ONLY from the catalogue below (and from the hadith candidates listed in the user message).
- Questions ABOUT why scholars differ are level B; questions asking WHICH view is right, or about disputed details, are level C.
- First-person ruling requests (my marriage, is it halal for me, my fast) are level D.
- If nothing in the catalogue actually supports an answer, return an empty evidence_ids list. Do not choose loosely related evidence.

${catalogueText(cat)}`;
}

export function routerUser(question: string, lang: Lang, floors: string[], hadithCandidates: { id: string; text: string }[], hints: string[]): string {
  return [
    `Visitor question (${lang}): ${question}`,
    floors.length ? `Deterministic floors already fired (cannot be lowered): ${floors.join(", ")}` : "",
    hints.length ? `Keyword retriever suggestions (may be wrong): ${hints.join(", ")}` : "",
    hadithCandidates.length ? `Hadith candidates from Sahih al-Bukhari / Sahih Muslim (keyword search, unverified):\n${hadithCandidates.map((h) => `H:${h.id}: ${h.text}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function composerSystem(): string {
  return `${POLICY}

You are the COMPOSER. Write the answer as JSON blocks:
- {"type":"quote","ref":"Q:<sura>:<aya>"} to show a verse (the app inserts the verse and a labelled translation).
- {"type":"hadith","ref":"H:<collection>:<number>"} to show a hadith with its grade.
- {"type":"fact","ref":"F:count:<concept>"} to show a code-computed count with its rule.
- {"type":"explanation","text":"…","cites":["…"]} plain-language sentences. EVERY explanation must cite at least one evidence id, and every sentence must be supported by what it cites. Mention a hadith only when you cite its H: id.
- {"type":"disagreement","views":[{"text":"…","cites":["…"]}]} for level C: at most 3 views, each cited, no preference.
- {"type":"referral","reason":"…"} for level D (and optionally C).
Write explanations in the visitor's language. Start with a plain, direct answer; correct a false premise gently. Keep it short (at most 3 explanation blocks).`;
}

export function composerUser(question: string, lang: Lang, level: Level, evidence: string, feedback?: string[]): string {
  return [
    `Question (${lang}): ${question}`,
    `Level: ${level}`,
    `EVIDENCE (cite only these ids):\n${evidence}`,
    feedback?.length ? `Your previous draft failed these checks — fix them:\n- ${feedback.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function verifierSystem(): string {
  return `${POLICY}

You are the VERIFIER. For each explanation or disagreement block (by index), decide whether EVERY claim in it is supported by the cited evidence text alone (not by general knowledge). Also flag tone problems: scolding, mirroring hostility, or conceding a false premise. Be strict.`;
}

export function verifierUser(question: string, blocks: ComposedBlock[], evidence: string): string {
  return `Question: ${question}\n\nBLOCKS:\n${blocks.map((b, i) => `[${i}] ${JSON.stringify(b)}`).join("\n")}\n\nEVIDENCE TEXT:\n${evidence}`;
}

export function hadithCheckSystem(): string {
  return `${POLICY}

You are a strict hadith checker. For each candidate narration, answer states_claim=true ONLY if the narration's own text clearly and explicitly states the claim. Related topics, partial overlap or the same keywords are NOT enough. When unsure, answer false.`;
}

export function hadithCheckUser(claim: string, candidates: { id: string; text: string }[]): string {
  return `Claim: ${claim}\n\nCANDIDATES:\n${candidates.map((c) => `H:${c.id}: ${c.text}`).join("\n\n")}`;
}
