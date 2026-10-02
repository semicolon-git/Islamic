import type { MatchResult, QuranIndex } from "@/lib/quran/matcher";
import { skeleton } from "@/lib/quran/normalize";
import type { Hadith } from "@/lib/hadith";
import { COLLECTION_NAMES } from "@/lib/hadith";
import type { GlossaryTerm } from "@/lib/glossary";
import { AiFailure } from "@/lib/ai/claude";
import type { Catalogue, CatalogueCard } from "./catalogue";
import { cardEvidenceIds, catalogueIds } from "./catalogue";
import { buildRetriever, retrieve, THRESHOLD, type Hit, type RetrieverIndex } from "./retriever";
import { MAX_QUESTION, MIN_QUESTION, detectLang, redactPII, tokenize, wordCount } from "./text";
import {
  arabicSpans,
  asksIfVerse,
  detectCSignal,
  detectFloorD,
  detectFraming,
  detectGlossaryQuestion,
  detectKnownSaying,
  detectLoadedTerm,
  detectOutOfScope,
  hadithClaim,
  isContextDependent,
  isHadithRequest,
  isRulingQuestion,
  subSpans,
  type KnownSaying,
  type LoadedTerm,
} from "./prechecks";
import { failed, passed, validate, type ValidationContext } from "./validators";
import {
  ComposerOut,
  HadithCheckOut,
  RouterOut,
  VerifierOut,
  composerSystem,
  composerUser,
  hadithCheckSystem,
  hadithCheckUser,
  routerSystem,
  routerUser,
  verifierSystem,
  verifierUser,
  type CallFn,
} from "./ai";
import type {
  AnswerBlock,
  AskOptions,
  AskResult,
  AskTrace,
  Badge,
  Check,
  ComposedBlock,
  EvidenceChip,
  HadithView,
  Lang,
  Level,
  Outcome,
  Route,
  Stage,
  VerseView,
} from "./types";
import { LEVEL_ORDER } from "./types";

/**
 * The Ask pipeline: answer(question, {lang, cardId?}, deps) → AskResult.
 *   0. pre-checks (code): language, PII, length, floors (D/X), quote auditor, hadith requests, glossary, loaded terms, framing
 *   1. router: Claude (closed catalogue) or the deterministic retriever
 *   2. composer: Claude reference blocks, or the approved card as-is
 *   3. verifier: V0–V10 (fail-closed) + Claude support/tone; revise once, else degrade
 *   4. render: verse/hadith text from the DB, badges, evidence chips, trace
 * All data access goes through `deps`, so the whole pipeline is unit-testable without a database.
 */
export interface AskDeps {
  catalogue(): Promise<Catalogue>;
  matchText(text: string): Promise<MatchResult>;
  quranIndex(): Promise<QuranIndex | null>;
  searchHadith(q: string, limit?: number): Promise<Hadith[]>;
  getAyat(keys: string[]): Promise<VerseView[]>;
  getHadith(ids: string[]): Promise<Hadith[]>;
  writeTrace?(r: AskResult): Promise<void>;
  ai?: { enabled: boolean; call: CallFn } | null;
  newId?(): string;
  now?(): number;
}

type Pending =
  | AnswerBlock
  | { type: "verses_ref"; keys: string[]; role: "primary" | "supporting" }
  | { type: "hadith_ref"; id: string };

interface Draft {
  level: Level;
  route: Route;
  intent: string;
  outcome: Outcome;
  badge: Badge;
  blocks: Pending[];
  composed: ComposedBlock[]; // validator view
  evidence: Set<string>;
  title: { en: string; ar: string } | null;
  related: boolean;
  card: CatalogueCard | null;
  canRequestTopic: boolean;
  approvedText: boolean;
  model?: ValidationContext["model"];
}

const maxLevel = (a: Level, b: Level): Level => {
  if (a === "X" || b === "X") return "X";
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
};

const retrieverCache = new Map<string, RetrieverIndex>();
function retrieverFor(cat: Catalogue): RetrieverIndex {
  let ix = retrieverCache.get(cat.version);
  if (!ix) {
    ix = buildRetriever(cat);
    retrieverCache.clear();
    retrieverCache.set(cat.version, ix);
  }
  return ix;
}

const pickLang = (b: { en: string; ar: string }, lang: Lang): { text: string; lang: Lang } =>
  b[lang]?.trim() ? { text: b[lang], lang } : { text: b[lang === "ar" ? "en" : "ar"], lang: lang === "ar" ? "en" : "ar" };

function newDraft(level: Level, route: Route, intent: string): Draft {
  return {
    level,
    route,
    intent,
    outcome: "pass",
    badge: { kind: "safety" },
    blocks: [],
    composed: [],
    evidence: new Set(),
    title: null,
    related: false,
    card: null,
    canRequestTopic: false,
    approvedText: true,
  };
}

// ───────────────────────── Building blocks for deterministic routes
function addCard(d: Draft, card: CatalogueCard, lang: Lang, mode: "full" | "general" | "verses") {
  for (const id of cardEvidenceIds(card)) d.evidence.add(id);
  const primary = card.verses.filter((v) => v.role === "primary").map((v) => v.key);
  const supporting = card.verses.filter((v) => v.role !== "primary").map((v) => v.key);
  const cites = [`C:${card.id}`, ...card.verses.map((v) => `Q:${v.key}`), ...card.hadith.map((h) => `H:${h}`)];
  if (mode !== "verses" && (card.explanation.en || card.explanation.ar)) {
    const e = pickLang(card.explanation, lang);
    d.blocks.push({ type: "explanation", text: e.text, lang: e.lang, cites, source: "card" });
    d.composed.push({ type: "explanation", text: e.text, cites });
  }
  if (primary.length) {
    d.blocks.push({ type: "verses_ref", keys: primary, role: "primary" });
    primary.forEach((k) => d.composed.push({ type: "quote", ref: `Q:${k}` }));
  }
  if (mode === "general" || mode === "verses") return;
  if (supporting.length) {
    d.blocks.push({ type: "verses_ref", keys: supporting, role: "supporting" });
    supporting.forEach((k) => d.composed.push({ type: "quote", ref: `Q:${k}` }));
  }
  for (const h of card.hadith) {
    d.blocks.push({ type: "hadith_ref", id: h });
    d.composed.push({ type: "hadith", ref: `H:${h}` });
  }
  for (const t of card.tafsir) d.blocks.push({ type: "tafsir", ...t });
  if (card.disagreement_note && (card.disagreement_note.en || card.disagreement_note.ar)) {
    const n = pickLang(card.disagreement_note, lang);
    d.blocks.push({ type: "disagreement", intro: true, text: n.text, lang: n.lang, views: [] });
    d.composed.push({ type: "disagreement", views: [{ text: n.text, cites: [`C:${card.id}`] }] });
  }
  if (card.count && card.concept_id) {
    d.blocks.push({ type: "fact", ...card.count });
    d.composed.push({ type: "fact", ref: `F:count:${card.concept_id}` });
  }
  if (card.civilizational_note && (card.civilizational_note.en || card.civilizational_note.ar)) {
    const n = pickLang(card.civilizational_note, lang);
    d.blocks.push({ type: "civilizational", text: n.text, lang: n.lang, sources: card.civilizational_note.sources });
  }
}

function approvedBadge(card: CatalogueCard): Badge {
  return card.institution
    ? { kind: "approved", card_id: card.id, institution_en: card.institution.name_en, institution_ar: card.institution.name_ar, is_demo: card.institution.is_demo }
    : { kind: "sources" };
}

const cardRef = (c: CatalogueCard) => ({ id: c.id, title_en: c.title_en, title_ar: c.title_ar, kind: c.kind });

function referral(d: Draft, reason: "level_d" | "level_c" | "x" | "sensitive" | "empty" | "ruling") {
  d.blocks.push({ type: "referral", reason, official: reason === "level_d" || reason === "ruling" || reason === "level_c" });
  d.composed.push({ type: "referral", reason });
}

/** Approved-card answer. */
function cardAnswer(card: CatalogueCard, hit: Hit | null, lang: Lang, intent = "explain"): Draft {
  const d = newDraft(card.level, "approved_card", intent);
  d.badge = approvedBadge(card);
  d.card = card;
  d.title = { en: card.title_en, ar: card.title_ar };
  d.related = hit ? !hit.phrase && hit.coverage < THRESHOLD.related : false;
  if (card.level === "C") d.blocks.push({ type: "notice", kind: "disagreement_intro", tone: "violet" });
  addCard(d, card, lang, "full");
  if (card.level === "C" && !card.disagreement_note) referral(d, "level_c");
  if (card.level === "D") {
    d.blocks.push({ type: "notice", kind: "not_ruling", tone: "warn" });
    referral(d, "level_d");
    d.outcome = "referred";
  }
  return d;
}

// ───────────────────────── Main entry
export async function answer(question: string, opts: AskOptions, deps: AskDeps): Promise<AskResult> {
  const now = deps.now ?? (() => performance.now());
  const t0 = now();
  const stages: Stage[] = [];
  let tStage = t0;
  const mark = (name: Stage["name"]) => {
    const t = now();
    stages.push({ name, ms: Math.round((t - tStage) * 10) / 10 });
    tStage = t;
    try {
      opts.onStage?.(name);
    } catch {
      /* progress reporting must never break an answer */
    }
  };
  const floors: string[] = [];
  const flags: string[] = [];
  const aiInfo: AskTrace["ai"] = { enabled: !!deps.ai?.enabled, models: [], calls: 0 };
  let dropped: string[] = [];
  let retrieval: Hit[] = [];
  let revised = false;
  let composedRaw: ComposedBlock[] | undefined;

  const raw = (question ?? "").replace(/\s+/g, " ").trim();
  const { text: q, redacted } = redactPII(raw.slice(0, MAX_QUESTION + 50));
  if (redacted.length) flags.push("pii_redacted");
  const lang = detectLang(q, opts.lang);

  const finish = async (d: Draft, checks: Check[]): Promise<AskResult> => {
    if (!stages.some((x) => x.name === "verify")) mark("verify");
    const result = await render(d, checks, {
      q, lang, deps, stages, mark, t0, now, floors, flags, aiInfo, dropped, retrieval, revised, composed: composedRaw,
    });
    if (opts.persistTrace !== false && deps.writeTrace) {
      try {
        await deps.writeTrace(result);
      } catch {
        /* tracing must never break an answer */
      }
    }
    return result;
  };

  // Length limit
  if (raw.length < MIN_QUESTION || raw.length > MAX_QUESTION) {
    const d = newDraft("A", "invalid", "invalid");
    d.blocks.push({ type: "notice", kind: "length", tone: "warn", vars: { max: String(MAX_QUESTION) } });
    d.outcome = "empty";
    mark("prechecks");
    return finish(d, []);
  }

  const cat = await deps.catalogue();
  const ix = retrieverFor(cat);
  const ctxCard = opts.cardId ? cat.cards.find((c) => c.id === opts.cardId) ?? null : null;

  // ── X: out of scope (judging people/groups, private disputes)
  const x = detectOutOfScope(q);
  if (x) {
    floors.push(`X:${x.kind}`);
    const d = newDraft("X", "decline_x", "out_of_scope");
    d.blocks.push({ type: "notice", kind: "decline_x", tone: "neutral" });
    d.blocks.push({ type: "help_topics", topics: ["meaning", "verses", "practices", "misconceptions"] });
    referral(d, "x");
    d.outcome = "declined";
    mark("prechecks");
    return finish(d, validate(d.composed, await vctx(d, cat, deps, "X")));
  }

  // ── Level-D floor (personal rulings). General info from an approved card only; never a ruling.
  const floor = detectFloorD(q);
  if (floor) {
    floors.push(`D:${floor.kind}`);
    mark("prechecks");
    retrieval = retrieve(ix, q, { limit: 3 });
    const d = newDraft("D", "refer_d", "personal_case");
    const general = retrieval[0]?.card ?? ctxCard;
    d.blocks.push({ type: "notice", kind: "not_ruling", tone: "warn" });
    d.badge = { kind: "safety" };
    if (general && general.level !== "D") {
      d.blocks.push({ type: "notice", kind: "ruling_general", tone: "neutral" });
      addCard(d, general, lang, "general");
      d.card = general;
    }
    referral(d, "level_d");
    d.outcome = "referred";
    mark("retrieve");
    return finish(d, validate(d.composed, await vctx(d, cat, deps, "D")));
  }

  // ── Quote auditor: Arabic spans checked against the KFGQPC text
  const quote = await auditQuotes(q, deps);
  if (quote) {
    mark("prechecks");
    const d = quote.draft;
    if (quote.known) {
      floors.push(`known:${quote.known.id}`);
      d.blocks.push({ type: "notice", kind: "known_unsupported", tone: "neutral" });
      for (const r of quote.known.related ?? []) {
        d.blocks.push({ type: "notice", kind: "related_card", tone: "neutral", vars: { related: "hadith" } });
        d.blocks.push({ type: "hadith_ref", id: r });
        d.evidence.add(`H:${r}`);
        d.composed.push({ type: "hadith", ref: `H:${r}` });
      }
    }
    // approved cards that cite the verse
    const keys = d.blocks.flatMap((b) => (b.type === "verses_ref" ? b.keys : []));
    const citing = cat.cards.filter((c) => c.verses.some((v) => keys.includes(v.key))).slice(0, 2);
    for (const c of citing) {
      d.blocks.push({ type: "card_link", card: cardRef(c) });
      d.evidence.add(`C:${c.id}`);
    }
    return finish(d, validate(d.composed, await vctx(d, cat, deps, d.level)));
  }

  // ── Hadith requests: strict. Known non-hadith sayings are never confirmed.
  const known = detectKnownSaying(q);
  if (isHadithRequest(q) || (known && !asksIfVerse(q))) {
    flags.push("hadith_request");
    mark("prechecks");
    const d = await hadithRoute(q, known, lang, ix, deps, aiInfo, flags);
    mark("verify");
    return finish(d, validate(d.composed, await vctx(d, cat, deps, d.level)));
  }

  // ── Glossary (deterministic term-lock answer)
  const gq = detectGlossaryQuestion(q, cat.glossary);
  if (gq) {
    mark("prechecks");
    const d = glossaryAnswer(gq.term, gq.mode, cat, lang);
    return finish(d, validate(d.composed, await vctx(d, cat, deps, d.level)));
  }

  // ── Culturally loaded terms: correct with evidence
  const lt = detectLoadedTerm(q);
  if (lt) {
    floors.push(`term:${lt.id}`);
    mark("prechecks");
    const d = loadedTermAnswer(lt, cat, lang);
    return finish(d, validate(d.composed, await vctx(d, cat, deps, d.level)));
  }

  // ── Framing bait (science miracles, number patterns): never confirmed
  const framing = detectFraming(q);
  if (framing) {
    flags.push(framing);
    mark("prechecks");
    retrieval = retrieve(ix, q, { all: true, limit: 3 });
    const d = newDraft("B", "claim_check", "claim_check");
    d.blocks.push({ type: "notice", kind: framing, tone: "warn" });
    const rel = retrieval.find((h) => h.coverage >= 0.3 && h.strongHits >= 1);
    if (rel) {
      d.blocks.push({ type: "card_link", card: cardRef(rel.card) });
      d.evidence.add(`C:${rel.card.id}`);
    }
    d.canRequestTopic = true;
    mark("retrieve");
    return finish(d, validate(d.composed, await vctx(d, cat, deps, d.level)));
  }

  // ── Level-C signals ("do all Muslims agree…", "which view is correct")
  if (detectCSignal(q)) {
    flags.push("c_signal");
    mark("prechecks");
    retrieval = retrieve(ix, q, { limit: 3 });
    const contextual = isContextDependent(q);
    const card = (contextual ? ctxCard : null) ?? retrieval[0]?.card ?? null;
    if (!card) {
      if (contextual) {
        const d = newDraft("C", "clarify", "disagreement");
        d.blocks.push({ type: "notice", kind: "clarify", tone: "neutral" });
        d.outcome = "empty";
        referral(d, "empty");
        return finish(d, validate(d.composed, await vctx(d, cat, deps, "C")));
      }
      const d = newDraft("C", "empty", "disagreement");
      d.blocks.push({ type: "notice", kind: "disagreement_intro", tone: "violet" });
      d.blocks.push({ type: "notice", kind: "empty", tone: "neutral" });
      referral(d, "level_c");
      d.canRequestTopic = true;
      d.outcome = "empty";
      return finish(d, validate(d.composed, await vctx(d, cat, deps, "C")));
    }
    const d = cardAnswer(card, retrieval.find((h) => h.card.id === card.id) ?? null, lang, "disagreement");
    const notice = card.certainty === "ijma" ? "consensus_card" : card.certainty === "disputed" || card.level === "C" ? "disagreement_intro" : "no_consensus_record";
    if (!d.blocks.some((b) => b.type === "notice" && b.kind === notice)) d.blocks.unshift({ type: "notice", kind: notice, tone: notice === "consensus_card" ? "ok" : "violet" });
    if (card.certainty === "disputed" || card.level === "C") d.level = "C";
    if (d.level === "C" && !d.composed.some((b) => b.type === "disagreement" || b.type === "referral")) referral(d, "level_c");
    mark("retrieve");
    return finish(d, validate(d.composed, await vctx(d, cat, deps, d.level)));
  }

  mark("prechecks");

  // ── Retrieval (deterministic) — always computed: it's the no-key router and a hint for the AI router.
  retrieval = retrieve(ix, q, { limit: 5 });
  const top = retrieval[0] ?? null;
  const ruling = isRulingQuestion(q);
  if (ruling) flags.push("ruling_request");

  // Strong approved answer: use it as-is (cheaper and safer than composing), with or without AI.
  if (top && (top.phrase || top.coverage >= THRESHOLD.related)) {
    mark("retrieve");
    const d = cardAnswer(top.card, top, lang, ruling ? "ruling" : "explain");
    return finish(d, validate(d.composed, await vctx(d, cat, deps, d.level)));
  }

  // Context card for deictic / very short follow-ups on a card page ("What does it say about this?")
  if (!top && ctxCard && (isContextDependent(q) || tokenize(q).content.length <= 2)) {
    mark("retrieve");
    const d = cardAnswer(ctxCard, null, lang);
    d.related = true;
    d.blocks.unshift({ type: "notice", kind: "context_card", tone: "neutral", vars: { title_en: ctxCard.title_en, title_ar: ctxCard.title_ar } });
    return finish(d, validate(d.composed, await vctx(d, cat, deps, d.level)));
  }

  // ── AI router + composer + verifier
  if (deps.ai?.enabled) {
    try {
      const out = await aiAnswer(q, lang, cat, retrieval, ctxCard, deps, aiInfo, floors, flags, opts.onStage);
      dropped = out.dropped;
      revised = out.revised;
      composedRaw = out.composedRaw;
      for (const s of out.stages) stages.push(s);
      tStage = now();
      if (out.draft) return finish(out.draft, out.checks);
    } catch (e) {
      aiInfo.error = e instanceof AiFailure ? e.kind : `error: ${e instanceof Error ? e.message : String(e)}`;
      flags.push("ai_fallback");
    }
  }

  // ── No-key path: related approved answer, or a ruling referral, or empty
  mark("retrieve");
  if (top) {
    const d = cardAnswer(top.card, top, lang, ruling ? "ruling" : "explain");
    return finish(d, validate(d.composed, await vctx(d, cat, deps, d.level)));
  }
  if (ruling) {
    const d = newDraft("D", "refer_d", "ruling");
    d.blocks.push({ type: "notice", kind: "not_ruling", tone: "warn" });
    referral(d, "ruling");
    d.outcome = "referred";
    d.canRequestTopic = true;
    return finish(d, validate(d.composed, await vctx(d, cat, deps, "D")));
  }
  const d = newDraft("B", "empty", "explain");
  d.blocks.push({ type: "notice", kind: "empty", tone: "neutral" });
  const weak = retrieve(ix, q, { all: true, limit: 1 })[0];
  if (weak && weak.coverage >= 0.3 && weak.strongHits >= 1) {
    d.blocks.push({ type: "notice", kind: "related_card", tone: "neutral", vars: { related: "card" } });
    d.blocks.push({ type: "card_link", card: cardRef(weak.card) });
    d.evidence.add(`C:${weak.card.id}`);
  }
  referral(d, "empty");
  d.canRequestTopic = true;
  d.outcome = "empty";
  return finish(d, validate(d.composed, await vctx(d, cat, deps, d.level)));
}

// ───────────────────────── Quote auditor
/** Map skeleton tokens in matcher differences back to the words as written (input) and as in the KFGQPC text. */
export function readableDiff(diffs: { op: string; given: string; quran: string }[], input: string, canonical: string[]) {
  const map = (words: string[]) => {
    const m = new Map<string, string>();
    for (const w of words) {
      const k = skeleton(w);
      if (k && !m.has(k)) m.set(k, w.replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g, ""));
    }
    return m;
  };
  const given = map(input.split(/\s+/));
  const quran = map(canonical.join(" ").split(/\s+/));
  const conv = (s: string, m: Map<string, string>) => s.split(" ").filter(Boolean).map((tk) => m.get(tk) ?? tk).join(" ");
  return diffs.map((d) => ({ op: d.op, given: conv(d.given, given), quran: conv(d.quran, quran) }));
}

async function auditQuotes(q: string, deps: AskDeps): Promise<{ draft: Draft; known: KnownSaying | null } | null> {
  const spans = arabicSpans(q);
  const askVerse = asksIfVerse(q);
  const known = detectKnownSaying(q);
  if (!spans.length) {
    if (askVerse && known) {
      const d = newDraft("A", "not_in_quran", "verse_check");
      d.blocks.push({ type: "notice", kind: "not_in_quran", tone: "warn", vars: { text: "" } });
      return { draft: d, known };
    }
    return null;
  }
  let calls = 0;
  let noneSpan: string | null = null;
  for (const span of spans) {
    const subs = subSpans(span);
    // exact first (longest sub-span first)
    for (const sub of subs) {
      if (calls++ > 24) break;
      const r = await deps.matchText(sub);
      if (r.status === "exact") {
        const letters = sub.replace(/[^\u0621-\u064A]/g, "").length;
        if (!span.quoted && (wordCount(sub) < 3 || letters < 12)) continue;
        const d = newDraft("A", "verse", "verse_check");
        d.badge = { kind: "sources" };
        d.blocks.push({ type: "notice", kind: "verse_found", tone: "ok" });
        for (const loc of r.locations.slice(0, 2)) {
          d.blocks.push({ type: "verses_ref", keys: loc.verses, role: "primary" });
          loc.verses.forEach((k) => {
            d.evidence.add(`Q:${k}`);
            d.composed.push({ type: "quote", ref: `Q:${k}` });
          });
        }
        return { draft: d, known: null };
      }
      if (r.status === "near" && subs[0] === sub) {
        const c = r.candidates[0];
        const strongEnough = span.quoted || askVerse ? c.similarity >= 0.82 : c.similarity >= 0.85 && wordCount(sub) >= 4;
        if (strongEnough) {
          const d = newDraft("A", "misquote", "verse_check");
          d.badge = { kind: "sources" };
          d.blocks.push({ type: "notice", kind: "misquote", tone: "warn" });
          const top2 = r.candidates.slice(0, 2);
          d.blocks.push({ type: "misquote", input: sub, candidates: top2.map((x) => ({ verses: x.verses, similarity: x.similarity, differences: readableDiff(x.differences, sub, x.canonical_uthmani) })) });
          for (const cand of top2) {
            d.blocks.push({ type: "verses_ref", keys: cand.verses, role: cand === top2[0] ? "primary" : "supporting" });
            cand.verses.forEach((k) => {
              d.evidence.add(`Q:${k}`);
              d.composed.push({ type: "quote", ref: `Q:${k}` });
            });
          }
          return { draft: d, known: null };
        }
      }
      if (r.status === "none" && !noneSpan && (span.quoted || askVerse)) noneSpan = sub;
    }
  }
  if (askVerse && (noneSpan || known)) {
    const d = newDraft("A", "not_in_quran", "verse_check");
    d.badge = { kind: "sources" };
    d.blocks.push({ type: "notice", kind: "not_in_quran", tone: "warn", vars: { text: noneSpan ?? "" } });
    return { draft: d, known };
  }
  return null;
}

// ───────────────────────── Hadith route
const SUPPORT_MIN = 0.6;
/** Share of the claim's content terms present in the hadith text (EN + AR). Lexical only — never called "verification". */
export function lexicalSupport(claim: string, h: Pick<Hadith, "text_ar" | "text_en">): number {
  const terms = [...new Set(tokenize(claim).content)];
  if (terms.length < 2) return 0;
  const hay = new Set([...tokenize(h.text_en ?? "").all, ...tokenize(h.text_ar).all]);
  return terms.filter((t) => hay.has(t)).length / terms.length;
}

async function hadithRoute(q: string, known: KnownSaying | null, lang: Lang, ix: RetrieverIndex, deps: AskDeps, aiInfo: AskTrace["ai"], flags: string[]): Promise<Draft> {
  const claim = hadithClaim(q) || q;
  const none = (kind: "no_hadith" | "no_hadith_unverified") => {
    const d = newDraft("A", "hadith_none", "hadith_request");
    d.blocks.push({ type: "notice", kind, tone: "warn" });
    return d;
  };
  if (known) {
    const d = none("no_hadith");
    d.blocks.push({ type: "notice", kind: "known_unsupported", tone: "neutral" });
    for (const r of known.related ?? []) {
      d.blocks.push({ type: "notice", kind: "related_card", tone: "neutral", vars: { related: "hadith" } });
      d.blocks.push({ type: "hadith_ref", id: r });
      d.evidence.add(`H:${r}`);
      d.composed.push({ type: "hadith", ref: `H:${r}` });
    }
    flags.push(`known:${known.id}`);
    return d;
  }
  const hits = retrieve(ix, claim, { limit: 3 });
  // Candidate cards are looser than for answers: the gate is whether the hadith text itself states the claim.
  const candidates = retrieve(ix, claim, { all: true, limit: 4 }).filter((h) => h.strongHits >= 1 || h.score > 0);
  const cardHadith = candidates.flatMap((h) => h.card.hadith.map((id) => ({ id, card: h.card })));
  const fetched = await deps.getHadith(cardHadith.map((c) => c.id));
  let found: { id: string; card: CatalogueCard | null }[] = [];

  if (deps.ai?.enabled) {
    const searched = await deps.searchHadith(claim, 6);
    const pool = [...fetched, ...searched.filter((s) => !fetched.some((f) => f.id === s.id))].slice(0, 8);
    if (pool.length) {
      try {
        const r = await deps.ai.call({
          agent: "verifier",
          system: hadithCheckSystem(),
          user: hadithCheckUser(claim, pool.map((h) => ({ id: h.id, text: (h.text_en ?? h.text_ar).slice(0, 900) }))),
          schema: HadithCheckOut,
          effort: "low",
          maxTokens: 800,
        });
        aiInfo.calls++;
        aiInfo.models.push(r.model);
        const yes = new Set(r.data.verdicts.filter((v) => v.states_claim).map((v) => v.id.replace(/^H:/, "")));
        // the model's "yes" must also share vocabulary with the claim (sanity check against drift)
        found = pool.filter((h) => yes.has(h.id) && lexicalSupport(claim, h) >= 0.3).map((h) => ({ id: h.id, card: cardHadith.find((c) => c.id === h.id)?.card ?? null }));
        flags.push("hadith_checked_by_ai");
      } catch (e) {
        aiInfo.error = e instanceof AiFailure ? e.kind : "error";
      }
    }
  } else {
    found = fetched.filter((h) => lexicalSupport(claim, h) >= SUPPORT_MIN).map((h) => ({ id: h.id, card: cardHadith.find((c) => c.id === h.id)?.card ?? null }));
  }

  if (found.length) {
    const d = newDraft("A", "hadith_found", "hadith_request");
    const card = found[0].card;
    d.badge = card ? approvedBadge(card) : { kind: "sources" };
    for (const f of found.slice(0, 2)) {
      d.blocks.push({ type: "hadith_ref", id: f.id });
      d.evidence.add(`H:${f.id}`);
      d.composed.push({ type: "hadith", ref: `H:${f.id}` });
    }
    if (card) {
      d.card = card;
      d.blocks.push({ type: "card_link", card: cardRef(card) });
      d.evidence.add(`C:${card.id}`);
    }
    return d;
  }
  // No verified hadith. With a key, the strict checker looked at the candidates and none states the claim.
  // Without a key we cannot verify entailment, so we say exactly that rather than asserting that none exists.
  const d = none(flags.includes("hadith_checked_by_ai") ? "no_hadith" : "no_hadith_unverified");
  if (hits[0]) {
    d.blocks.push({ type: "notice", kind: "related_card", tone: "neutral", vars: { related: "card" } });
    d.blocks.push({ type: "card_link", card: cardRef(hits[0].card) });
    d.evidence.add(`C:${hits[0].card.id}`);
  }
  void lang;
  return d;
}

// ───────────────────────── Glossary & loaded terms
function glossaryAnswer(term: GlossaryTerm, mode: "meaning" | "translate", cat: Catalogue, lang: Lang): Draft {
  const d = newDraft("A", "glossary", mode === "translate" ? "translate" : "definition");
  d.badge = { kind: "glossary", source: term.source };
  d.evidence.add(`G:${term.id}`);
  // Plain language first (an approved answer card for this term), then the term, then the verses.
  // Prefer the card written about this term (answer:<term>) over one that merely uses it.
  const card =
    cat.cards.find((c) => c.kind === "answer" && c.id === `answer:${term.id}`) ??
    cat.cards.find((c) => c.kind === "answer" && c.glossary_terms.includes(term.id)) ??
    null;
  if (card && mode === "meaning") {
    const e = pickLang(card.explanation, lang);
    const cites = [`C:${card.id}`, ...card.verses.map((v) => `Q:${v.key}`)];
    for (const id of cardEvidenceIds(card)) d.evidence.add(id);
    d.blocks.push({ type: "explanation", text: e.text, lang: e.lang, cites, source: "card" });
    d.composed.push({ type: "explanation", text: e.text, cites });
  }
  d.blocks.push({ type: "glossary", term: { id: term.id, term_ar: term.term_ar, term_en: term.term_en, rule_en: term.rule_en, rule_ar: term.rule_ar, meaning_en: term.meaning_en ?? null, meaning_ar: term.meaning_ar ?? null, source: term.source } });
  if (card) {
    const keys = card.verses.map((v) => v.key);
    if (keys.length) {
      d.blocks.push({ type: "verses_ref", keys, role: "primary" });
      keys.forEach((k) => d.composed.push({ type: "quote", ref: `Q:${k}` }));
    }
    d.blocks.push({ type: "card_link", card: cardRef(card) });
    d.card = card;
  }
  return d;
}

function loadedTermAnswer(lt: LoadedTerm, cat: Catalogue, lang: Lang): Draft {
  const d = newDraft("B", "term_correction", "misconception");
  d.badge = { kind: "safety" };
  d.blocks.push({ type: "term_lock", term: lt.term, correction_en: lt.correction_en, correction_ar: lt.correction_ar, cites: lt.cites });
  for (const c of lt.cites) d.evidence.add(c);
  const keys = lt.cites.filter((c) => c.startsWith("Q:")).map((c) => c.slice(2));
  if (keys.length) {
    d.blocks.push({ type: "verses_ref", keys, role: "primary" });
    keys.forEach((k) => d.composed.push({ type: "quote", ref: `Q:${k}` }));
  }
  if (lt.glossary) {
    const g = cat.glossary.find((t) => t.id === lt.glossary);
    if (g) d.blocks.push({ type: "glossary", term: { id: g.id, term_ar: g.term_ar, term_en: g.term_en, rule_en: g.rule_en, rule_ar: g.rule_ar, meaning_en: g.meaning_en ?? null, meaning_ar: g.meaning_ar ?? null, source: g.source } });
  }
  const card = lt.concept ? cat.cards.find((c) => c.concept_id === lt.concept && c.kind !== "answer") ?? null : null;
  if (card) {
    d.blocks.push({ type: "card_link", card: cardRef(card) });
    d.evidence.add(`C:${card.id}`);
    d.card = card;
  }
  void lang;
  return d;
}

// ───────────────────────── AI path
interface AiOut {
  draft: Draft | null;
  checks: Check[];
  dropped: string[];
  revised: boolean;
  composedRaw?: ComposedBlock[];
  stages: Stage[];
}

async function evidenceText(ids: string[], cat: Catalogue, deps: AskDeps, lang: Lang): Promise<string> {
  const keys = ids.filter((i) => i.startsWith("Q:")).map((i) => i.slice(2));
  const hids = ids.filter((i) => i.startsWith("H:")).map((i) => i.slice(2));
  const [ayat, hadith] = await Promise.all([deps.getAyat(keys), deps.getHadith(hids)]);
  const lines: string[] = [];
  for (const id of ids) {
    if (id.startsWith("C:")) {
      const c = cat.cards.find((x) => `C:${x.id}` === id);
      if (c) lines.push(`${id} [approved card, level ${c.level}, ${c.certainty}] "${lang === "ar" ? c.title_ar : c.title_en}": ${pickLang(c.explanation, lang).text}${c.disagreement_note ? ` | Disagreement note: ${pickLang(c.disagreement_note, lang).text}` : ""}`);
    } else if (id.startsWith("Q:")) {
      const a = ayat.find((x) => `Q:${x.key}` === id);
      if (a) lines.push(`${id} [Quran ${a.sura_name_en} ${a.key}] translation (${a.translation?.edition_name ?? "n/a"}): ${a.translation?.text ?? ""}`);
    } else if (id.startsWith("H:")) {
      const h = hadith.find((x) => `H:${x.id}` === id);
      if (h) lines.push(`${id} [${COLLECTION_NAMES[h.collection].en} ${h.number}]: ${(h.text_en ?? h.text_ar).slice(0, 900)}`);
    } else if (id.startsWith("G:")) {
      const g = cat.glossary.find((x) => `G:${x.id}` === id);
      if (g) lines.push(`${id} [glossary] ${g.term_en} / ${g.term_ar}: ${lang === "ar" ? g.rule_ar : g.rule_en}`);
    } else if (id.startsWith("F:count:")) {
      const c = cat.cards.find((x) => x.concept_id && `F:count:${x.concept_id}` === id && x.count);
      if (c?.count) lines.push(`${id} [code-computed count] ${c.count.label_en}: ${c.count.tokens} occurrences in ${c.count.verses} verses (${c.count.rule})`);
    }
  }
  return lines.join("\n");
}

async function aiAnswer(
  q: string,
  lang: Lang,
  cat: Catalogue,
  retrieval: Hit[],
  ctxCard: CatalogueCard | null,
  deps: AskDeps,
  aiInfo: AskTrace["ai"],
  floors: string[],
  flags: string[],
  onStage?: (s: Stage["name"]) => void,
): Promise<AiOut> {
  const call = deps.ai!.call;
  const stages: Stage[] = [];
  const now = deps.now ?? (() => performance.now());
  let t = now();
  const stage = (name: Stage["name"]) => {
    const n = now();
    stages.push({ name, ms: Math.round((n - t) * 10) / 10 });
    t = n;
    try {
      onStage?.(name);
    } catch {
      /* ignore */
    }
  };
  const usage = (u: { input_tokens: number; output_tokens: number }, model: string) => {
    aiInfo.calls++;
    aiInfo.models.push(model);
    aiInfo.usage = { input_tokens: (aiInfo.usage?.input_tokens ?? 0) + u.input_tokens, output_tokens: (aiInfo.usage?.output_tokens ?? 0) + u.output_tokens };
  };

  // 1. Router over the closed catalogue
  const candidates = (await deps.searchHadith(q, 5)).map((h) => ({ id: h.id, text: (h.text_en ?? h.text_ar).slice(0, 300) }));
  const routed = await call({
    agent: "router",
    system: routerSystem(cat),
    user: routerUser(q, lang, floors, candidates, retrieval.map((h) => `C:${h.card.id}`).concat(ctxCard ? [`context C:${ctxCard.id}`] : [])),
    schema: RouterOut,
    effort: "low",
    maxTokens: 1200,
  });
  usage(routed.usage, routed.model);
  stage("router");
  const r = routed.data;
  const allowed = catalogueIds(cat);
  for (const c of candidates) allowed.add(`H:${c.id}`);
  const ids = r.evidence_ids.map((i) => i.trim());
  const dropped = ids.filter((i) => !allowed.has(i));
  let evidence = ids.filter((i) => allowed.has(i));
  for (const f of r.flags) if (!flags.includes(f)) flags.push(f);
  // A floor can never be lowered; the router may raise the level.
  let level: Level = r.level;
  if (floors.some((f) => f.startsWith("D:"))) level = maxLevel(level, "D");

  if (level === "X") {
    const d = newDraft("X", "decline_x", "out_of_scope");
    d.blocks.push({ type: "notice", kind: "decline_x", tone: "neutral" });
    d.blocks.push({ type: "help_topics", topics: ["meaning", "verses", "practices", "misconceptions"] });
    referral(d, "x");
    d.outcome = "declined";
    return { draft: d, checks: validate(d.composed, await vctx(d, cat, deps, "X")), dropped, revised: false, stages };
  }
  // Expand cards into their own evidence so the composer can cite verses/hadith inside them.
  const expanded = new Set(evidence);
  for (const id of evidence) {
    const c = cat.cards.find((x) => `C:${x.id}` === id);
    if (c) for (const e of cardEvidenceIds(c)) expanded.add(e);
  }
  evidence = [...expanded];
  if (level === "D") {
    const d = newDraft("D", "refer_d", r.intent);
    const general = cat.cards.find((c) => evidence.includes(`C:${c.id}`) && c.level !== "D") ?? retrieval[0]?.card ?? null;
    d.blocks.push({ type: "notice", kind: "not_ruling", tone: "warn" });
    if (general) {
      d.blocks.push({ type: "notice", kind: "ruling_general", tone: "neutral" });
      addCard(d, general, lang, "general");
      d.card = general;
    }
    referral(d, "level_d");
    d.outcome = "referred";
    return { draft: d, checks: validate(d.composed, await vctx(d, cat, deps, "D")), dropped, revised: false, stages };
  }
  if (!evidence.length) return { draft: null, checks: [], dropped, revised: false, stages };

  // 2. Composer
  const evText = await evidenceText(evidence, cat, deps, lang);
  const cardsInE = cat.cards.filter((c) => evidence.includes(`C:${c.id}`));
  const translations: Record<string, string> = {};
  for (const a of await deps.getAyat(evidence.filter((i) => i.startsWith("Q:")).map((i) => i.slice(2)))) if (a.translation) translations[a.key] = a.translation.text;
  const ctxFor = async (): Promise<ValidationContext> => ({
    level,
    evidence: new Set(evidence),
    cards: cardsInE.map((c) => ({ id: c.id, certainty: c.certainty, verses: c.verses.map((v) => v.key), hasTafsir: c.tafsir.length > 0 })),
    glossary: cat.glossary,
    quranIndex: await deps.quranIndex(),
    translations,
    model: { ok: true, schemaValid: true, stopReason: "end_turn" },
  });
  const compose = async (feedback?: string[]) => {
    const res = await call({
      agent: "composer",
      system: composerSystem(),
      user: composerUser(q, lang, level, evText, feedback),
      schema: ComposerOut,
      effort: "medium",
      maxTokens: 2500,
    });
    usage(res.usage, res.model);
    return res.data.blocks as ComposedBlock[];
  };
  let blocks = await compose();
  stage("compose");
  const vc = await ctxFor();
  let checks = validate(blocks, vc);
  let revised = false;
  if (!passed(checks)) {
    revised = true;
    blocks = await compose(failed(checks).map((c) => `${c.id}: ${c.detail ?? ""}`));
    checks = validate(blocks, vc);
  }
  const composedRaw = blocks;

  // 3. LLM support + tone check (only on deterministic pass)
  let degrade: "sources" | "referral" | null = null;
  if (!passed(checks)) degrade = checks.some((c) => c.id === "V10" && c.status === "fail") || level === "C" ? "referral" : "sources";
  else {
    try {
      const v = await call({ agent: "verifier", system: verifierSystem(), user: verifierUser(q, blocks, evText), schema: VerifierOut, effort: "low", maxTokens: 1200 });
      usage(v.usage, v.model);
      const unsupported = new Set(v.data.claims.filter((c) => !c.supported).map((c) => c.block));
      const toneBad = v.data.tone.scolding || v.data.tone.mirrors_hostility || v.data.tone.concedes_false_premise;
      checks.push(unsupported.size ? { id: "L1", status: "fail", detail: `${unsupported.size} unsupported block(s) dropped` } : { id: "L1", status: "pass" });
      checks.push(toneBad ? { id: "L2", status: "fail", detail: "tone flagged" } : { id: "L2", status: "pass" });
      if (unsupported.size) blocks = blocks.filter((b, i) => !unsupported.has(i) || (b.type !== "explanation" && b.type !== "disagreement"));
      if (toneBad) blocks = blocks.filter((b) => b.type !== "explanation" && b.type !== "disagreement");
      if (!blocks.some((b) => b.type === "explanation" || b.type === "disagreement")) degrade = level === "C" ? "referral" : "sources";
    } catch (e) {
      checks.push({ id: "L1", status: "fail", detail: `verifier unavailable (${e instanceof AiFailure ? e.kind : "error"}) — fail-closed` });
      degrade = level === "C" ? "referral" : "sources";
    }
  }
  stage("verify");

  if (degrade) {
    const d = newDraft(level, "sources_only", r.intent);
    d.badge = { kind: "sources" };
    d.blocks.push({ type: "notice", kind: "sources_only", tone: "neutral" });
    const card = cardsInE[0] ?? null;
    if (card) {
      addCard(d, card, lang, "verses");
      d.blocks.push({ type: "card_link", card: cardRef(card) });
      d.card = card;
    }
    if (degrade === "referral" || !card) referral(d, level === "C" ? "level_c" : "sensitive");
    d.outcome = "sources_only";
    d.approvedText = true;
    const finalChecks = [...checks.filter((c) => c.id.startsWith("L")), ...validate(d.composed, await vctx(d, cat, deps, level))];
    return { draft: d, checks: finalChecks, dropped, revised, composedRaw, stages };
  }

  // Render composed blocks
  const d = newDraft(level, "composed", r.intent);
  d.badge = { kind: "ai" };
  d.approvedText = false;
  d.evidence = new Set(evidence);
  d.composed = blocks;
  d.card = cardsInE[0] ?? null;
  d.outcome = revised ? "revised" : "pass";
  if (level === "C") d.blocks.push({ type: "notice", kind: "disagreement_intro", tone: "violet" });
  for (const b of blocks) {
    if (b.type === "quote") d.blocks.push({ type: "verses_ref", keys: [b.ref.slice(2)], role: "primary" });
    else if (b.type === "hadith") d.blocks.push({ type: "hadith_ref", id: b.ref.slice(2) });
    else if (b.type === "fact") {
      const c = cat.cards.find((x) => x.concept_id && `F:count:${x.concept_id}` === b.ref && x.count);
      if (c?.count) d.blocks.push({ type: "fact", ...c.count });
    } else if (b.type === "explanation") d.blocks.push({ type: "explanation", text: b.text, lang, cites: b.cites, source: "ai" });
    else if (b.type === "disagreement") d.blocks.push({ type: "disagreement", intro: false, lang, views: b.views.slice(0, 3) });
    else if (b.type === "referral") d.blocks.push({ type: "referral", reason: level === "C" ? "level_c" : "sensitive", official: level === "C" });
  }
  // merge consecutive single-verse blocks
  const merged: Pending[] = [];
  for (const b of d.blocks) {
    const last = merged.at(-1);
    if (b.type === "verses_ref" && last?.type === "verses_ref" && last.role === b.role) last.keys.push(...b.keys);
    else merged.push(b);
  }
  d.blocks = merged;
  if (d.card) d.blocks.push({ type: "card_link", card: cardRef(d.card) });
  d.model = { ok: true, schemaValid: true, stopReason: "end_turn" };
  return { draft: d, checks, dropped, revised, composedRaw, stages };
}

// ───────────────────────── Validation context for deterministic drafts
async function vctx(d: Draft, cat: Catalogue, deps: AskDeps, level: Level): Promise<ValidationContext> {
  const cards = cat.cards.filter((c) => d.evidence.has(`C:${c.id}`));
  const needsIndex = d.composed.some((b) => b.type === "explanation" || b.type === "disagreement");
  return {
    level,
    evidence: d.evidence,
    cards: cards.map((c) => ({ id: c.id, certainty: c.certainty, verses: c.verses.map((v) => v.key), hasTafsir: c.tafsir.length > 0 })),
    glossary: cat.glossary,
    quranIndex: needsIndex ? await deps.quranIndex() : null,
    model: d.model ?? null,
    approvedText: d.approvedText,
  };
}

// ───────────────────────── Render
interface RenderCtx {
  q: string;
  lang: Lang;
  deps: AskDeps;
  stages: Stage[];
  mark: (n: Stage["name"]) => void;
  t0: number;
  now: () => number;
  floors: string[];
  flags: string[];
  aiInfo: AskTrace["ai"];
  dropped: string[];
  retrieval: Hit[];
  revised: boolean;
  composed?: ComposedBlock[];
}

function hadithView(h: Hadith): HadithView {
  return {
    id: h.id,
    collection: h.collection,
    collection_en: COLLECTION_NAMES[h.collection].en,
    collection_ar: COLLECTION_NAMES[h.collection].ar,
    number: h.number,
    numbering_scheme: h.numbering_scheme,
    text_ar: h.text_ar,
    text_en: h.text_en,
    grade: h.grade,
    grader: h.grader,
    source_url: h.source_url,
  };
}

async function render(d: Draft, checks: Check[], c: RenderCtx): Promise<AskResult> {
  const keys = [...new Set(d.blocks.flatMap((b) => (b.type === "verses_ref" ? b.keys : [])))];
  const hids = [...new Set(d.blocks.flatMap((b) => (b.type === "hadith_ref" ? [b.id] : [])))];
  const [ayat, hadith] = await Promise.all([c.deps.getAyat(keys), c.deps.getHadith(hids)]);
  const byKey = new Map(ayat.map((a) => [a.key, a]));
  const byId = new Map(hadith.map((h) => [h.id, h]));
  const blocks: AnswerBlock[] = [];
  for (const b of d.blocks) {
    if (b.type === "verses_ref") {
      const verses = b.keys.map((k) => byKey.get(k)).filter((v): v is VerseView => !!v);
      if (verses.length) blocks.push({ type: "verses", verses, role: b.role });
    } else if (b.type === "hadith_ref") {
      const h = byId.get(b.id);
      if (h) blocks.push({ type: "hadith", hadith: hadithView(h) });
    } else blocks.push(b);
  }
  // Evidence chips (in display order, unique)
  const chips: EvidenceChip[] = [];
  const seen = new Set<string>();
  const push = (chip: EvidenceChip) => {
    if (!seen.has(chip.id)) {
      seen.add(chip.id);
      chips.push(chip);
    }
  };
  if (d.card) push({ id: `C:${d.card.id}`, kind: "card", label_en: d.card.title_en, label_ar: d.card.title_ar, href: `/card/${encodeURIComponent(d.card.id)}` });
  for (const b of blocks) {
    if (b.type === "verses")
      for (const v of b.verses) push({ id: `Q:${v.key}`, kind: "quran", label_en: `${v.sura_name_en} ${v.key}`, label_ar: `${v.sura_name_ar} ${v.key}` });
    if (b.type === "hadith") push({ id: `H:${b.hadith.id}`, kind: "hadith", label_en: `${b.hadith.collection_en} ${b.hadith.number}`, label_ar: `${b.hadith.collection_ar} ${b.hadith.number}` });
    if (b.type === "glossary") push({ id: `G:${b.term.id}`, kind: "glossary", label_en: b.term.term_en, label_ar: b.term.term_ar });
    if (b.type === "fact") push({ id: `F:count`, kind: "fact", label_en: `Count · ${b.label_en}`, label_ar: `إحصاء · ${b.label_ar}` });
    if (b.type === "tafsir") push({ id: `T:${b.book_en}:${b.verse_key}`, kind: "tafsir", label_en: `${b.book_en} · ${b.verse_key}`, label_ar: `${b.book_ar} · ${b.verse_key}` });
    if (b.type === "card_link") push({ id: `C:${b.card.id}`, kind: "card", label_en: b.card.title_en, label_ar: b.card.title_ar, href: `/card/${encodeURIComponent(b.card.id)}` });
  }
  c.mark("render");
  const latency = Math.round(c.now() - c.t0);
  const id = c.deps.newId ? c.deps.newId() : `ans_${Math.random().toString(36).slice(2, 12)}`;
  return {
    id,
    question: c.q,
    lang: c.lang,
    level: d.level,
    intent: d.intent,
    route: d.route,
    outcome: d.outcome,
    badge: d.badge,
    title: d.title,
    related: d.related,
    blocks,
    evidence: chips,
    card: d.card ? cardRef(d.card) : null,
    canRequestTopic: d.canRequestTopic,
    trace: {
      level: d.level,
      route: d.route,
      intent: d.intent,
      floors: c.floors,
      flags: c.flags,
      evidence_ids: [...d.evidence],
      dropped_ids: c.dropped,
      checks,
      retrieval: c.retrieval.slice(0, 5).map((h) => ({ id: h.card.id, score: Math.round(h.score * 100) / 100, coverage: h.coverage })),
      stages: c.stages,
      latency_ms: latency,
      ai: c.aiInfo,
      revised: c.revised,
      composed: c.composed,
    },
  };
}
