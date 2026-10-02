import { sql } from "@/lib/db";

export interface GlossaryTerm {
  id: string;
  term_ar: string;
  term_en: string;
  rule_en: string;
  rule_ar: string;
  variants: string[];
  banned_renderings: string[];
  source: string;
}

export async function allTerms(): Promise<GlossaryTerm[]> {
  return sql<GlossaryTerm>("select * from glossary_terms where status = 'approved' order by term_en");
}

/** Find glossary terms mentioned in a text (by Arabic term, English term or variants). */
export function detectTerms(text: string, terms: GlossaryTerm[]): GlossaryTerm[] {
  const low = text.toLowerCase();
  return terms.filter((t) =>
    [t.term_ar, t.term_en.toLowerCase(), ...t.variants.map((v) => v.toLowerCase())].some(
      (needle) => needle && (/[؀-ۿ]/.test(needle) ? text.includes(needle) : new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(low)),
    ),
  );
}
