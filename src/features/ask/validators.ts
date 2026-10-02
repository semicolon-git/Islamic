import type { QuranIndex } from "@/lib/quran/matcher";
import { levenshtein, skeleton } from "@/lib/quran/normalize";
import type { GlossaryTerm } from "@/lib/glossary";
import type { Check, ComposedBlock, Level } from "./types";
import { LOADED_TERMS } from "./prechecks";
import { normalizeEnglish } from "./text";

/**
 * Deterministic validators V0–V10 (review §9.2). Fail-closed: anything that cannot be checked fails.
 * They run on composer output (AI path) and on deterministic answers (approved-card text is human-approved,
 * so prose checks on it are reported as warnings instead of failures).
 */

export interface ValidationContext {
  level: Level;
  /** Evidence set E: every id the answer may cite. */
  evidence: Set<string>;
  /** Cards cited/available in E, with metadata needed by V7 and V10. */
  cards: { id: string; certainty: "established" | "disputed" | "ijma"; verses: string[]; hasTafsir: boolean }[];
  glossary: GlossaryTerm[];
  quranIndex: QuranIndex | null;
  /** English translations of verses in E (for the English quote check in V3). */
  translations?: Record<string, string>;
  /** Did a model call produce these blocks? (V0) */
  model?: { ok: boolean; stopReason?: string | null; schemaValid: boolean; error?: string } | null;
  /** Prose is human-approved card text (warn instead of fail on prose checks). */
  approvedText?: boolean;
}

export const SENSITIVE_VERSES = new Set(["9:5", "2:191", "4:89", "4:91", "8:12", "47:4"]);

// ───────────────── regexes
export const RE_HADITH_ATTRIBUTION = /\b(the\s+prophet|the\s+messenger(\s+of\s+allah)?|he)\s*(\(?ﷺ\)?\s*)?(said|says|told\s+(us|them|his)|taught|stated|used\s+to\s+say)\b|\bnarrated\b|\bnarrates\b|\breported\s+that\s+the\s+prophet\b|قال\s+رسول\s+الله|قال\s+النبي|عن\s+النبي|عن\s+رسول\s+الله|أن\s+النبي\s*ﷺ?\s*قال|أخبر\s+النبي|أخبر\s+رسول\s+الله|رواه\s+(البخاري|مسلم)/i;
/** Grade words. Arabic only in grading constructions (bare «صحيح»/«حسن» are everyday words). */
export const RE_GRADE = /\b(sahih|saheeh|hasan|da'?if|da['’]?eef|daif|authentic|weak|fabricated|mawdu'?|agreed\s+upon|muttafaq)\b|(حديث|الحديث|إسناده|اسناده|سنده)\s+(صحيح|حسن|ضعيف|موضوع|منكر)|صححه|حسّنه|حسنه\s+(الألباني|الترمذي)|ضعّفه|ضعفه|متفق\s+عليه/i;
/** Collection names contain "Sahih"/«صحيح» but are not grades. */
export const RE_COLLECTION_NAMES = /sahih\s+(al-)?bukhari|sahih\s+muslim|صحيح\s+البخاري|صحيح\s+مسلم|الصحيحين/gi;
export const RE_OCCURRENCE = /\b\d+\s+times\b|\bmentioned\s+\d+|\b\d+\s+verses\b|ذكرت?\s+.{0,30}\s*مرة|[0-9٠-٩]+\s*مرة|[0-9٠-٩]+\s*آية/i;
export const RE_RULING_ALL = /يجوز\s+لك|لا\s+يجوز\s+لك|يجب\s+عليك|يحرم\s+عليك|حكمك|permissible\s+for\s+you|(is|it'?s)\s+(haram|halal|forbidden|obligatory|allowed)\s+for\s+you\b|you\s+are\s+(not\s+)?(allowed|permitted|obliged|obligated)\s+to\b|your\s+(marriage|fast|prayer|divorce)\s+is\s+(valid|invalid|void)/i;
export const RE_RULING_D = /\byou\s+(must|may|should|have\s+to|need\s+to|are\s+required\s+to)\b|عليك\s+أن|يلزمك|ينبغي\s+لك/i;
export const RE_TARJIH = /الراجح|القول\s+الصحيح|الصحيح\s+من\s+أقوال|\bthe\s+correct\s+(view|opinion)\b|\bstrongest\s+(view|opinion)\b|\bthe\s+(right|preferred)\s+(view|opinion)\b|\bthe\s+most\s+correct\s+(view|opinion)\b/i;
export const RE_CONSENSUS = /\bconsensus\b|\bijma'?\b|\ball\s+(muslims|scholars)\s+agree\b|\bscholars\s+(unanimously|all)\s+agree\b|\bunanimous(ly)?\b|إجماع|اجماع|أجمع|اجمع|اتفق\s+العلماء|باتفاق\s+العلماء/i;
export const RE_PERSONA = /\bas\s+an?\s+(scholar|sheikh|shaykh|mufti|imam|alim)\b|\bmy\s+fatwa\b|\bi\s+(rule|issue\s+a\s+fatwa)\b|أفتيك|افتيك|فتواي|بصفتي\s+(عالما|شيخا|مفتيا)/i;
export const RE_SCIENCE = /\bscientific\s+miracles?\b|\bscience\s+(proves|confirms|has\s+proven|has\s+confirmed|agrees)\b|\b(proven|confirmed)\s+by\s+(modern\s+)?science\b|إعجاز\s*علمي|الإعجاز\s+العلمي|أثبت\s+العلم|اثبت\s+العلم|\b1400\s+years\s+ago\b|numerical\s+miracle|إعجاز\s*عددي/i;

const proseOf = (blocks: ComposedBlock[]): { text: string; cites: string[] }[] =>
  blocks.flatMap((b) => (b.type === "explanation" ? [{ text: b.text, cites: b.cites }] : b.type === "disagreement" ? b.views : []));
const allRefs = (blocks: ComposedBlock[]) =>
  blocks.flatMap((b) => (b.type === "quote" || b.type === "hadith" || b.type === "fact" ? [b.ref] : b.type === "explanation" ? b.cites : b.type === "disagreement" ? b.views.flatMap((v) => v.cites) : []));

/** Is a banned rendering merely mentioned (quoted or negated) rather than used? */
function mentionedOnly(text: string, phrase: string): boolean {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`["“'‘«]\\s*${esc}\\s*["”'’»]`, "i").test(text) || new RegExp(`\\bnot\\s+(a\\s+|an\\s+)?(accurate\\s+)?(rendering|translation)?.{0,20}${esc}`, "i").test(text);
}

/** Is the span [i, i+len) wrapped in quotation marks (allowing a short prefix such as «بـ»)? */
function quotedAt(text: string, i: number, len: number): boolean {
  const before = text.slice(Math.max(0, i - 3), i);
  const after = text.slice(i + len, i + len + 2);
  return /["“'‘«]/.test(before) && /["”'’»]/.test(after);
}

const charRatio = (a: string, b: string) => 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);

/** V3 core: does this prose contain ≥ 4 consecutive normalised tokens that match a Quran window with similarity ≥ 0.8? */
export function findQuranInProse(text: string, ix: QuranIndex): string | null {
  const toks = skeleton(text).split(" ").filter(Boolean);
  if (toks.length < 4) return null;
  for (let i = 0; i + 4 <= toks.length; i++) {
    const win = toks.slice(i, i + 4);
    const joined = win.join("");
    if (joined.length < 10) continue;
    const votes = new Map<number, number>();
    win.forEach((t, j) => {
      for (const pos of (ix.byToken.get(t) ?? []).slice(0, 400)) votes.set(pos - j, (votes.get(pos - j) ?? 0) + 1);
    });
    for (const [start, v] of votes) {
      if (v < 2 || start < 0) continue;
      const qw = ix.toks.slice(start, start + 4).join("");
      if (charRatio(joined, qw) >= 0.8) return win.join(" ");
    }
  }
  return null;
}

/** English: 8 consecutive words copied from a verse translation in E. */
function findTranslationInProse(text: string, translations: Record<string, string>): string | null {
  const words = normalizeEnglish(text).split(" ");
  if (words.length < 8) return null;
  for (const [key, tr] of Object.entries(translations)) {
    const t = ` ${normalizeEnglish(tr)} `;
    for (let i = 0; i + 8 <= words.length; i++) {
      const shingle = words.slice(i, i + 8).join(" ");
      if (t.includes(` ${shingle} `)) return `${key}: “${shingle}”`;
    }
  }
  return null;
}

export function validate(blocks: ComposedBlock[], ctx: ValidationContext): Check[] {
  const checks: Check[] = [];
  const prose = proseOf(blocks);
  const proseText = prose.map((p) => p.text).join("\n");
  const proseFail = (id: Check["id"], detail: string): Check => ({ id, status: ctx.approvedText ? "warn" : "fail", detail });

  // V0 — model call succeeded, schema valid, stop_reason end_turn
  if (ctx.model === undefined || ctx.model === null) checks.push({ id: "V0", status: "skip", detail: "no model call (deterministic)" });
  else if (!ctx.model.ok || !ctx.model.schemaValid) checks.push({ id: "V0", status: "fail", detail: ctx.model.error ?? "model call failed or schema invalid" });
  else if (ctx.model.stopReason && ctx.model.stopReason !== "end_turn") checks.push({ id: "V0", status: "fail", detail: `stop_reason=${ctx.model.stopReason}` });
  else checks.push({ id: "V0", status: "pass" });

  // V1 — every ref and cite is in E
  const outside = allRefs(blocks).filter((r) => !ctx.evidence.has(r));
  checks.push(outside.length ? { id: "V1", status: "fail", detail: `not in evidence: ${[...new Set(outside)].join(", ")}` } : { id: "V1", status: "pass" });

  // V2 — every explanation block (and disagreement view) has at least one citation
  const uncited = prose.filter((p) => !p.cites.length).length;
  checks.push(uncited ? { id: "V2", status: "fail", detail: `${uncited} prose block(s) without a citation` } : { id: "V2", status: "pass" });

  // V3 — no Quran text in free prose
  if (!prose.length) checks.push({ id: "V3", status: "pass", detail: "no prose" });
  else if (!ctx.quranIndex) checks.push({ id: "V3", status: ctx.approvedText ? "warn" : "fail", detail: "Quran index unavailable (fail-closed)" });
  else {
    const hit = findQuranInProse(proseText, ctx.quranIndex) ?? (ctx.translations ? findTranslationInProse(proseText, ctx.translations) : null);
    checks.push(hit ? proseFail("V3", `Quran text in prose: ${hit}`) : { id: "V3", status: "pass" });
  }

  // V4 — hadith attribution needs a hadith reference
  const v4bad = prose.filter((p) => RE_HADITH_ATTRIBUTION.test(p.text) && !p.cites.some((c) => c.startsWith("H:")));
  checks.push(v4bad.length ? proseFail("V4", "hadith attribution without an H: citation") : { id: "V4", status: "pass" });

  // V5 — no grade words in free text (grades are rendered from the DB only)
  const g = proseText.replace(RE_COLLECTION_NAMES, " ").match(RE_GRADE);
  checks.push(g ? proseFail("V5", `grade word in prose: “${g[0]}”`) : { id: "V5", status: "pass" });

  // V6 — no Quran occurrence claims in prose (counts come from fact blocks)
  const o = proseText.match(RE_OCCURRENCE);
  checks.push(o ? proseFail("V6", `occurrence claim in prose: “${o[0]}”`) : { id: "V6", status: "pass" });

  // V7 — level policy
  const v7: string[] = [];
  const hasReferral = blocks.some((b) => b.type === "referral");
  const hasDisagreement = blocks.some((b) => b.type === "disagreement");
  const r1 = proseText.match(RE_RULING_ALL);
  if (r1) v7.push(`ruling phrase “${r1[0]}”`);
  if (ctx.level === "D") {
    if (!hasReferral) v7.push("level D without a referral");
    const r2 = proseText.match(RE_RULING_D);
    if (r2) v7.push(`ruling phrase at level D “${r2[0]}”`);
  }
  if (ctx.level === "C" && !hasDisagreement && !hasReferral) v7.push("level C without a disagreement block or referral");
  if (hasDisagreement) {
    const views = blocks.flatMap((b) => (b.type === "disagreement" ? b.views : []));
    if (views.length > 3) v7.push("more than 3 views");
  }
  const tj = proseText.match(RE_TARJIH);
  if (tj) v7.push(`preference stated “${tj[0]}”`);
  const cs = proseText.match(RE_CONSENSUS);
  if (cs) {
    const cited = new Set(allRefs(blocks));
    const ijmaCited = ctx.cards.some((c) => c.certainty === "ijma" && cited.has(`C:${c.id}`));
    if (!ijmaCited) v7.push(`consensus claim “${cs[0]}” without an ijma'-tagged source`);
  }
  checks.push(v7.length ? (r1 || tj || cs ? proseFail("V7", v7.join("; ")) : { id: "V7", status: "fail", detail: v7.join("; ") }) : { id: "V7", status: "pass" });
  // structural V7 failures (missing referral/disagreement) always fail, even for approved text
  if (v7.some((m) => m.startsWith("level ") || m.startsWith("more than"))) checks[checks.length - 1] = { id: "V7", status: "fail", detail: v7.join("; ") };

  // V8 — glossary term-lock: detected term ⇒ approved equivalent present; banned renderings fail
  const v8: string[] = [];
  const low = proseText.toLowerCase();
  for (const t of ctx.glossary) {
    const variants = t.variants.map((v) => v.toLowerCase());
    const mentions = variants.some((v) => new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(low)) || (t.term_ar && proseText.includes(t.term_ar));
    if (mentions) {
      const equivalents = [t.term_ar, ...t.term_en.split("/").map((x) => x.trim().toLowerCase())];
      if (!equivalents.some((e) => e && (/[؀-ۿ]/.test(e) ? proseText.includes(e) : low.includes(e)))) v8.push(`term “${t.id}” used without its approved equivalent`);
      for (const b of t.banned_renderings) {
        const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`\\b${esc}\\b`, "i").test(proseText) && !mentionedOnly(proseText, b) && !(b === "unity" && /oneness/i.test(proseText))) v8.push(`banned rendering “${b}”`);
      }
    }
  }
  for (const lt of LOADED_TERMS) {
    for (const r of lt.patterns) {
      const m = r.exec(proseText);
      if (m && !quotedAt(proseText, m.index, m[0].length) && !mentionedOnly(proseText, lt.term)) {
        v8.push(`loaded term “${lt.term}”`);
        break;
      }
    }
  }
  checks.push(v8.length ? proseFail("V8", v8.join("; ")) : { id: "V8", status: "pass" });

  // V9 — persona and science framing
  const p9 = proseText.match(RE_PERSONA) ?? proseText.match(RE_SCIENCE);
  checks.push(p9 ? proseFail("V9", `framing “${p9[0]}”`) : { id: "V9", status: "pass" });

  // V10 — sensitive verses need an approved card or tafsir that covers them
  const sens = [...ctx.evidence].filter((e) => e.startsWith("Q:") && SENSITIVE_VERSES.has(e.slice(2)));
  const used = new Set(allRefs(blocks));
  const uncovered = sens.filter((e) => {
    const key = e.slice(2);
    return !ctx.cards.some((c) => c.verses.includes(key) && (used.has(`C:${c.id}`) || c.hasTafsir));
  });
  checks.push(uncovered.length ? { id: "V10", status: "fail", detail: `sensitive verse without an approved card/tafsir: ${uncovered.join(", ")}` } : { id: "V10", status: "pass" });

  return checks;
}

export const failed = (checks: Check[]) => checks.filter((c) => c.status === "fail");
export const passed = (checks: Check[]) => !checks.some((c) => c.status === "fail");
