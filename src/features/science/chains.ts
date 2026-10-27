import { normalizeArabic } from "@/lib/quran/normalize";

/**
 * Contribution chains («سلاسل الإسهام»): how the documented work of Muslim scholars sits in the history of the science behind
 * an everyday object — a TV → light and image → Ibn al-Haytham's Book of Optics → … → electronic television. Each chain is
 * curated and sourced (data/science/chains.json); the discovery pipeline only picks chain ids, it never writes their text.
 * Shared by the server, the pipeline and the UI (no server imports here).
 */

export interface Source { citation: string; url: string }
export type ChainRole = "before" | "muslim" | "transmission" | "after" | "today";
export type ChainClaim = "foundational" | "contributor" | "direct";

export interface ChainStep {
  role: ChainRole;
  who_en: string;
  who_ar: string;
  /** A scholar id in science_entries, for steps by Muslim scholars that have a page. */
  scientist: string | null;
  date_text: string;
  place_en?: string;
  place_ar?: string;
  what_en: string;
  what_ar: string;
  sources: Source[];
}

export interface ChainMyth { claim_en: string; claim_ar: string; correction_en: string; correction_ar: string; sources: Source[] }

export interface ChainReview {
  /** "sourced": every step cites its sources, but no scholar has signed it off yet. "reviewed": an institution approved it. */
  status: "sourced" | "reviewed";
  by_en?: string;
  by_ar?: string;
  on?: string;
}

export interface Chain {
  id: string;
  title_en: string;
  title_ar: string;
  science_en: string;
  science_ar: string;
  claim: ChainClaim;
  /** Lowercase labels a vision model gives for photos where this chain applies. */
  objects: string[];
  objects_ar: string[];
  answer_en: string;
  answer_ar: string;
  not_claimed_en: string;
  not_claimed_ar: string;
  steps: ChainStep[];
  myths?: ChainMyth[];
  sources: Source[];
  review?: ChainReview;
}

/** What the discovery result carries: the chain itself plus how it was matched. */
export type DiscoveryChain = Omit<Chain, "objects" | "objects_ar"> & { review: ChainReview; matched: "words" | "ai"; href: string };

/** The fields the matcher and the AI picker need. */
export type ChainLite = Pick<Chain, "id" | "title_en" | "title_ar" | "science_en" | "objects" | "objects_ar">;

export const chainHref = (id: string) => `/science/chain/${encodeURIComponent(id)}`;

const enWords = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).filter((w, i) => !(i === 0 && /^(?:a|an|the)$/.test(w)));
const singular = (w: string) => (w.length > 3 ? w.replace(/(?:ies)$/, "y").replace(/(?<![s])s$/, "") : w);
const arWords = (s: string) =>
  normalizeArabic(s).replace(/[^ء-ي ]+/g, " ").trim().split(/\s+/).filter(Boolean).map((w) => (w.length > 3 ? w.replace(/^(?:وال|بال|فال|كال|ال)/, "") : w)).map((w) => w.replace(/ة$/, "ه"));

/** `needle` is the head of `hay`: its last words in English ("flat screen tv"), its first words in Arabic («ساعة حائط»). */
const endsWith = (hay: string[], needle: string[]) => needle.length > 0 && hay.length >= needle.length && needle.every((w, j) => hay[hay.length - needle.length + j] === w);
const startsWith = (hay: string[], needle: string[]) => needle.length > 0 && hay.length >= needle.length && needle.every((w, j) => hay[j] === w);

/**
 * Chains whose object list names the subject — the label's head noun, compared word by word ("flat screen tv" → "tv",
 * «ساعة حائط» → «ساعة»), so a "television tower" is not a television. Deterministic, so it works without AI; it is deliberately
 * narrow (the label, not loose search terms) and the AI picker covers the rest.
 */
export function matchChains(subject: { label_en: string; label_ar: string }, chains: ChainLite[]): string[] {
  const en = enWords(subject.label_en).map(singular);
  const ar = arWords(subject.label_ar);
  const out: string[] = [];
  for (const c of chains) {
    const hitEn = en.length && c.objects.some((o) => endsWith(en, enWords(o).map(singular)));
    const hitAr = ar.length && c.objects_ar.some((o) => startsWith(ar, arWords(o)));
    if (hitEn || hitAr) out.push(c.id);
  }
  return out;
}

/** The chain list as the AI picker sees it: id, title, science, a few example objects. */
export function renderChainList(chains: ChainLite[]): string {
  return chains.map((c) => `${c.id}: ${c.title_en} — ${c.science_en} — e.g. ${c.objects.slice(0, 8).join(", ")}`).join("\n");
}
