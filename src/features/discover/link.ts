/** Client-safe helpers to link to a discovery. The subject travels in the URL (shareable); no photo ever does. */
export interface SubjectLink {
  label_en?: string;
  label_ar?: string;
  category?: string | null;
  search_terms_en?: string[];
  search_terms_ar?: string[];
  sensitive?: boolean;
}

export function discoverHref(s: SubjectLink, source: "snap" | "search" = "snap"): string {
  const p = new URLSearchParams();
  if (s.label_en) p.set("en", s.label_en);
  if (s.label_ar) p.set("ar", s.label_ar);
  if (s.category) p.set("c", s.category);
  if (s.search_terms_en?.length) p.set("te", s.search_terms_en.join("|"));
  if (s.search_terms_ar?.length) p.set("ta", s.search_terms_ar.join("|"));
  if (s.sensitive) p.set("s", "1");
  if (source !== "snap") p.set("src", source);
  return `/discover?${p.toString()}`;
}

export function parseDiscoverParams(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const list = (k: string) => one(k).split("|").map((x) => x.trim()).filter(Boolean).slice(0, 10);
  const q = one("q").trim().slice(0, 80);
  const isAr = /[؀-ۿ]/.test(q);
  return {
    label_en: (one("en") || (q && !isAr ? q : "")).slice(0, 80),
    label_ar: (one("ar") || (q && isAr ? q : "")).slice(0, 80),
    category: one("c") || null,
    search_terms_en: list("te"),
    search_terms_ar: list("ta"),
    sensitive: one("s") === "1",
    source: (one("src") === "search" || q ? "search" : "snap") as "snap" | "search",
  };
}

/** Explore search: short subject phrases go to discovery; questions go to Ask. */
export function looksLikeQuestion(q: string): boolean {
  const s = q.trim();
  if (/[?؟]/.test(s)) return true;
  if (s.split(/\s+/).length > 5) return true;
  return /^(what|why|how|is|are|can|does|do|should|who|when|where|which|ما|ماذا|لماذا|كيف|هل|من|متى|أين|اين|ما هو|ما هي)\b/i.test(s);
}
