import type { Catalogue, CatalogueCard } from "./catalogue";
import { containsPhrase, phraseNorm, tokenize } from "./text";

/**
 * Deterministic retriever over published cards (the no-key router).
 * BM25-style idf weighting over fields with different strengths, plus phrase containment of `match_phrases`.
 * A relevance threshold means the result can genuinely be EMPTY — we never return "the nearest card" by default.
 */
export interface Hit {
  card: CatalogueCard;
  score: number; // weighted idf mass matched
  coverage: number; // 0..1: share of the question's content terms (idf-weighted) found in strong fields
  phrase: boolean; // a match phrase occurs verbatim in the question
  strongHits: number; // distinct content terms matched in title/phrases/concept label
}

interface DocIndex {
  card: CatalogueCard;
  strong: Map<string, number>; // term → field weight (3 phrases, 2 title, 2 label)
  weak: Set<string>; // explanation terms
  phrases: string[]; // phraseNorm'd match phrases + titles
}

export interface RetrieverIndex {
  docs: DocIndex[];
  df: Map<string, number>;
  n: number;
}

export const THRESHOLD = { coverage: 0.5, minStrongHits: 1, phraseCoverage: 0.95, related: 0.75 };

export function buildRetriever(cat: Catalogue): RetrieverIndex {
  const docs: DocIndex[] = cat.cards.map((card) => {
    const strong = new Map<string, number>();
    const add = (text: string, w: number) => {
      for (const t of tokenize(text).all) strong.set(t, Math.max(strong.get(t) ?? 0, w));
    };
    card.match_phrases.forEach((p) => add(p, 3));
    add(card.title_en, 2);
    add(card.title_ar, 2);
    if (card.concept_label_en) add(card.concept_label_en, 2);
    if (card.concept_label_ar) add(card.concept_label_ar, 2);
    const weak = new Set([...tokenize(card.explanation.en).all, ...tokenize(card.explanation.ar).all]);
    const phrases = [...card.match_phrases, card.title_en, card.title_ar].map(phraseNorm).filter((p) => p.split(" ").length >= 1 && p.length >= 4);
    return { card, strong, weak, phrases };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set([...d.strong.keys(), ...d.weak])) df.set(t, (df.get(t) ?? 0) + 1);
  return { docs, df, n: docs.length };
}

const idf = (ix: RetrieverIndex, t: string) => Math.log(1 + (ix.n - (ix.df.get(t) ?? 0) + 0.5) / ((ix.df.get(t) ?? 0) + 0.5));

/**
 * Rank cards for a question. Returns only hits above the relevance threshold, best first.
 * Scored on the whole question and on each sentence; the best sentence wins, so an added remark
 * ("…? It seems pointless.") does not dilute the actual question.
 */
export function retrieve(ix: RetrieverIndex, question: string, opts: { limit?: number; all?: boolean } = {}): Hit[] {
  const parts = [question, ...question.split(/[.!?؟\n]+/).map((s) => s.trim()).filter((s) => s && s !== question.trim() && tokenize(s).content.length >= 1)];
  const best = new Map<string, Hit>();
  for (const part of parts)
    for (const h of scoreAll(ix, part)) {
      const prev = best.get(h.card.id);
      if (!prev || h.coverage > prev.coverage || (h.coverage === prev.coverage && h.score > prev.score)) best.set(h.card.id, h);
    }
  const hits = [...best.values()].sort((a, b) => b.coverage - a.coverage || b.score - a.score);
  const kept = opts.all ? hits : hits.filter((h) => h.phrase || (h.coverage >= THRESHOLD.coverage && h.strongHits >= THRESHOLD.minStrongHits));
  return kept.slice(0, opts.limit ?? 5);
}

function scoreAll(ix: RetrieverIndex, question: string): Hit[] {
  const q = tokenize(question);
  const terms = [...new Set(q.content)];
  const qNorm = phraseNorm(question);
  const hits: Hit[] = [];
  const totalIdf = terms.reduce((s, t) => s + Math.max(idf(ix, t), 0.3), 0);
  for (const d of ix.docs) {
    let score = 0;
    let strongMass = 0;
    let strongHits = 0;
    for (const t of terms) {
      const w = Math.max(idf(ix, t), 0.3);
      const fw = d.strong.get(t);
      if (fw) {
        score += w * fw;
        strongMass += w;
        strongHits++;
      } else if (d.weak.has(t)) score += w * 0.5;
    }
    const phrase = d.phrases.some((p) => p.split(" ").length >= 2 && containsPhrase(qNorm, p)) ||
      d.phrases.some((p) => p.split(" ").length === 1 && p.length >= 4 && containsPhrase(qNorm, p) && terms.length <= 2);
    let coverage = totalIdf ? strongMass / totalIdf : 0;
    if (phrase) coverage = Math.max(coverage, THRESHOLD.phraseCoverage);
    hits.push({ card: d.card, score, coverage: Math.round(coverage * 1000) / 1000, phrase, strongHits });
  }
  return hits;
}
