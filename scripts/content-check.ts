/**
 * Content gate for data/content/** — run: npx tsx scripts/content-check.ts [--fetch] [--quiet]
 *
 * Fails (exit 1) on:
 *  - card shape errors (zod CardContent), unknown concept / institution / persona / glossary term / related card
 *  - unknown verse keys (KFGQPC v18) and unknown hadith ids (Bukhari standard / Muslim Abd al-Baqi, as seeded)
 *  - tafsir excerpts that are not exact substrings of the cached source (data/content/sources/tafsir/<sura>_<aya>.json)
 *  - banned framings in prose (review §9.2 V4–V9, EN + AR), Quran text typed into Arabic prose (V3)
 *  - empty bilingual fields, level C without disagreement_note
 *  - explanations citing a verse/hadith that is not in the card's evidence, or EN/AR citing different evidence
 *  - invalid workflow chains (roles, transitions, four-eyes)
 *  - concept_labels.json gaps, or a published card for a disabled concept
 * --fetch downloads any missing cached tafsir source from its recorded URL (needs network).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CardContent } from "../src/lib/cards/types";
import { canTransition, fourEyesOk, type Decision, type Status } from "../src/lib/workflow";
import type { Role } from "../src/lib/auth";
import { BANNED, CONSENSUS, bannedHits, longestSharedRun, normalizeArabic, parseCitations, sentences, unattributedSentences } from "./content-check/lib";

const ROOT = process.cwd();
const RAW = path.join(ROOT, "prep/data/raw");
const CARDS_DIR = path.join(ROOT, "data/content/cards");
const TAFSIR_DIR = path.join(ROOT, "data/content/sources/tafsir");
const FETCH = process.argv.includes("--fetch");
const QUIET = process.argv.includes("--quiet");

const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), "utf8")) as T;

/** Verse-like keys commonly marketed as scientific proofs (review §8.4, §9.2 V9). Kept off cards entirely. */
const IJAZ_KEYS = new Set(["78:7", "21:30", "25:53", "55:19", "55:20", "57:25", "22:5", "23:12", "23:13", "23:14", "96:2", "36:38", "15:22", "86:6", "86:7", "51:47", "54:1"]);
/** V10: verses that need an approved card or tafsir alongside them. */
const SENSITIVE_KEYS = new Set(["9:5", "2:191", "4:89", "4:91", "8:12", "47:4"]);
const TAFSIR_URL = (key: string) => {
  const [s, a] = key.split(":");
  return `https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir/ar-tafsir-al-tabari/${s}/${a}.json`;
};
const MIN_PHRASES = 3;
const MAX_SENTENCES = 5;
const V3_MAX_RUN = 3; // at most 3 consecutive words of a cited verse may appear in Arabic prose

type Issue = { where: string; msg: string };
const errors: Issue[] = [];
const warnings: Issue[] = [];
const err = (where: string, msg: string) => errors.push({ where, msg });
const warn = (where: string, msg: string) => warnings.push({ where, msg });

// ───────────────────────── Reference data
if (!fs.existsSync(path.join(RAW, "quran_kfgqpc_hafs_v18.json"))) {
  console.error("content-check: pinned sources missing (prep/data/raw). Run `npm run data:fetch` or copy prep/data/raw first.");
  process.exit(2);
}
interface Kfgqpc { sora: number; aya_no: number; aya_text_emlaey: string; sora_name_ar: string }
const quran = new Map<string, string>();
const suraByName = new Map<string, number>();
for (const r of readJson<Kfgqpc[]>(path.join(RAW, "quran_kfgqpc_hafs_v18.json"))) {
  quran.set(`${r.sora}:${r.aya_no}`, r.aya_text_emlaey);
  suraByName.set(normalizeArabic(r.sora_name_ar), r.sora);
}

// Same id rules as scripts/seed/core.ts
const hadithIds = new Set<string>();
for (const coll of ["bukhari", "muslim"] as const) {
  const rows = readJson<{ hadiths: { hadithnumber: number; arabicnumber?: number | string; text: string }[] }>(path.join(RAW, "hadith", `ara-${coll}.json`)).hadiths;
  for (const h of rows) {
    if (!h.text?.trim()) continue;
    if (coll === "bukhari") {
      if (Number.isInteger(h.hadithnumber)) hadithIds.add(`bukhari:${h.hadithnumber}`);
    } else if (h.arabicnumber !== undefined && h.arabicnumber !== null && h.arabicnumber !== "") {
      hadithIds.add(`muslim:${String(h.arabicnumber).split(".")[0]}`);
    }
  }
}

const personas = readJson<{ institutions: { id: string }[]; users: { id: string; role: Role }[] }>("data/demo/personas.json");
const roleOf = new Map(personas.users.map((u) => [u.id, u.role]));
const institutions = new Set(personas.institutions.map((i) => i.id));
const glossary = readJson<{ id: string; banned_renderings?: string[] }[]>("data/content/glossary.json");
const glossaryIds = new Set(glossary.map((g) => g.id));

interface Concept { id: string; track?: string; count_tokens?: number }
const nature = readJson<Concept[]>("prep/data/concepts_verified.json").map((c) => ({ ...c, track: "nature" }));
const art = readJson<{ concepts: Concept[] }>("prep/data/art_heritage_concepts.json").concepts;
const concepts = new Map<string, Concept>([...nature, ...art].map((c) => [c.id, c]));

// ───────────────────────── concept_labels.json
type Label = { label_en: string; label_ar: string; blurb_en: string; blurb_ar: string; visual_hints: string; sort: number; enabled: boolean };
const labels = readJson<Record<string, Label>>("data/content/concept_labels.json");
const sorts = new Map<number, string>();
for (const id of concepts.keys()) if (!labels[id]) err("concept_labels.json", `missing entry for concept "${id}"`);
for (const [id, l] of Object.entries(labels)) {
  const where = `concept_labels.json:${id}`;
  if (!concepts.has(id)) err(where, "unknown concept id");
  for (const f of ["label_en", "label_ar", "blurb_en", "blurb_ar", "visual_hints"] as const)
    if (typeof l[f] !== "string" || !l[f].trim()) err(where, `empty ${f}`);
  if (typeof l.sort !== "number") err(where, "sort must be a number");
  if (typeof l.enabled !== "boolean") err(where, "enabled must be a boolean");
  if (sorts.has(l.sort)) warn(where, `sort ${l.sort} also used by ${sorts.get(l.sort)}`);
  sorts.set(l.sort, id);
}

// ───────────────────────── Cards
interface CardFile {
  id: string; kind: string; concept_id: string | null; level: string; certainty: string;
  title_en: string; title_ar: string; match_phrases?: string[]; institution_id?: string;
  workflow?: { decision: string; by: string; note?: string }[]; content: unknown;
}
const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json")).sort();
const cards: { file: string; c: CardFile }[] = [];
for (const file of files) {
  try {
    cards.push({ file, c: readJson<CardFile>(path.join(CARDS_DIR, file)) });
  } catch (e) {
    err(file, `invalid JSON: ${(e as Error).message}`);
  }
}
const cardIds = new Set(cards.map((x) => x.c.id));
const statusCount: Record<string, number> = {};
const glossaryBanned = glossary.flatMap((g) => (g.banned_renderings ?? []).map((b) => ({ term: g.id, b })));
const sourceCache = new Map<string, { url?: string; text: string } | null>();

function loadSource(key: string, url: string): { url?: string; text: string } | null {
  if (sourceCache.has(key)) return sourceCache.get(key)!;
  const [s, a] = key.split(":");
  const p = path.join(TAFSIR_DIR, `${s}_${a}.json`);
  if (!fs.existsSync(p) && FETCH) {
    try {
      const body = execFileSync("curl", ["-sS", "-f", "-m", "30", url], { encoding: "utf8" });
      const text = (JSON.parse(body) as { text: string }).text;
      fs.mkdirSync(TAFSIR_DIR, { recursive: true });
      fs.writeFileSync(p, JSON.stringify({ source_id: "tabari", verse_key: key, url, retrieved: new Date().toISOString().slice(0, 10), text }, null, 1) + "\n");
      console.log(`  fetched ${url}`);
    } catch (e) {
      console.error(`  could not fetch ${url}: ${(e as Error).message}`);
    }
  }
  const v = fs.existsSync(p) ? readJson<{ url?: string; text: string }>(p) : null;
  sourceCache.set(key, v);
  return v;
}

for (const { file, c } of cards) {
  const where = c.id ?? file;

  // Shape
  if (!/^(card|answer|item):[a-z0-9_]+$/.test(c.id ?? "")) err(where, `bad id "${c.id}"`);
  if (`${(c.id ?? "").replace(":", "__")}.json` !== file) err(where, `file name should be ${(c.id ?? "").replace(":", "__")}.json`);
  if (!["concept", "answer", "item", "art"].includes(c.kind)) err(where, `bad kind "${c.kind}"`);
  if (!["A", "B", "C", "D"].includes(c.level)) err(where, `bad level "${c.level}"`);
  if (!["established", "disputed", "ijma"].includes(c.certainty)) err(where, `bad certainty "${c.certainty}"`);
  if (!c.title_en?.trim() || !c.title_ar?.trim()) err(where, "empty title_en/title_ar");
  if (c.institution_id && !institutions.has(c.institution_id)) err(where, `unknown institution "${c.institution_id}"`);
  const parsed = CardContent.safeParse(c.content);
  if (!parsed.success) {
    err(where, `content does not match CardContent: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    continue;
  }
  const k = parsed.data;

  // Concept link
  if (c.concept_id) {
    const concept = concepts.get(c.concept_id);
    if (!concept) err(where, `unknown concept "${c.concept_id}"`);
    else {
      if (c.kind === "concept" && concept.track !== "nature") err(where, `kind "concept" but concept ${c.concept_id} is ${concept.track}`);
      if (c.kind === "art" && concept.track === "nature") err(where, `kind "art" but concept ${c.concept_id} is nature`);
    }
  } else if (c.kind === "concept" || c.kind === "art") err(where, "concept/art cards need a concept_id");

  // Evidence: verses
  const verseKeys = new Set<string>();
  for (const v of k.verses) {
    if (!quran.has(v.key)) err(where, `unknown verse key ${v.key}`);
    if (verseKeys.has(v.key)) err(where, `duplicate verse ${v.key}`);
    if (IJAZ_KEYS.has(v.key)) err(where, `verse ${v.key} is on the i'jaz/scientific-claim avoid list`);
    verseKeys.add(v.key);
  }
  // Evidence: hadith
  const hadithSet = new Set<string>();
  for (const h of k.hadith) {
    if (!hadithIds.has(h.id)) err(where, `unknown hadith id ${h.id}`);
    if (hadithSet.has(h.id)) err(where, `duplicate hadith ${h.id}`);
    hadithSet.add(h.id);
  }
  // Evidence: tafsir
  const tafsirKeys = new Set<string>();
  for (const t of k.tafsir) {
    const tw = `${where} tafsir ${t.verse_key}`;
    if (t.source_id !== "tabari") err(tw, `unknown tafsir source "${t.source_id}" (only al-Tabari is cached)`);
    if (!verseKeys.has(t.verse_key)) err(tw, "tafsir verse is not among the card's verses");
    for (const f of ["book_ar", "book_en", "author_ar", "author_en", "excerpt_ar"] as const) if (!t[f]?.trim()) err(tw, `empty ${f}`);
    const url = TAFSIR_URL(t.verse_key);
    if (t.url !== url) err(tw, `url should be ${url}`);
    const src = loadSource(t.verse_key, url);
    if (!src) err(tw, `no cached source at data/content/sources/tafsir/${t.verse_key.replace(":", "_")}.json (run with --fetch)`);
    else {
      if (src.url && src.url !== url) err(tw, "cached source URL does not match");
      if (!src.text.includes(t.excerpt_ar)) err(tw, "excerpt_ar is not an exact substring of the cached source");
    }
    if (t.excerpt_en && !/paraphrase|translation/i.test(t.excerpt_en)) warn(tw, "excerpt_en should be labelled as a paraphrase");
    tafsirKeys.add(t.verse_key);
  }
  for (const key of verseKeys) if (SENSITIVE_KEYS.has(key) && !tafsirKeys.has(key)) err(where, `sensitive verse ${key} needs a tafsir excerpt (V10)`);

  // Bilingual fields
  const ex = k.explanation;
  if (!ex.en.trim() || !ex.ar.trim()) err(where, "explanation needs both en and ar");
  if (k.civilizational_note) {
    if (!k.civilizational_note.en.trim() || !k.civilizational_note.ar.trim()) err(where, "civilizational_note needs both en and ar");
    if (!k.civilizational_note.sources.length) err(where, "civilizational_note needs at least one source");
    for (const s of k.civilizational_note.sources) if (!s.citation.trim()) err(where, "empty civilizational_note source citation");
  }
  if (k.disagreement_note && (!k.disagreement_note.en.trim() || !k.disagreement_note.ar.trim())) err(where, "disagreement_note needs both en and ar");
  if (c.level === "C" && !k.disagreement_note) err(where, "level C needs a disagreement_note");
  if (c.level === "D" && !/not a ruling/i.test(ex.en)) err(where, "level D must say it is not a ruling");
  if (!k.verses.length && !k.hadith.length && !k.civilizational_note) err(where, "a card with no verse or hadith needs a sourced civilizational_note");

  // Prose checks (titles and match phrases are questions and are exempt)
  const prose: { label: string; text: string }[] = [
    { label: "explanation.en", text: ex.en },
    { label: "explanation.ar", text: ex.ar },
    ...(k.civilizational_note ? [{ label: "civilizational_note.en", text: k.civilizational_note.en }, { label: "civilizational_note.ar", text: k.civilizational_note.ar }] : []),
    ...(k.disagreement_note ? [{ label: "disagreement_note.en", text: k.disagreement_note.en }, { label: "disagreement_note.ar", text: k.disagreement_note.ar }] : []),
    ...k.tafsir.filter((t) => t.excerpt_en).map((t) => ({ label: `tafsir ${t.verse_key} excerpt_en`, text: t.excerpt_en! })),
  ];
  for (const p of prose) {
    for (const h of bannedHits(p.text, BANNED)) err(`${where} ${p.label}`, `${h.rule.id}: ${h.rule.why} ("${h.match}")`);
    if (c.certainty !== "ijma") for (const h of bannedHits(p.text, CONSENSUS)) err(`${where} ${p.label}`, `${h.rule.id}: ${h.rule.why} ("${h.match}")`);
    for (const g of glossaryBanned) if (new RegExp(`(^|[^A-Za-z])${g.b}(?![A-Za-z])`, "i").test(p.text)) err(`${where} ${p.label}`, `V8: "${g.b}" is a banned rendering of ${g.term}`);
    for (const s of unattributedSentences(p.text, suraByName)) err(`${where} ${p.label}`, `V4: attribution to the Prophet without a hadith citation: "${s.slice(0, 90)}…"`);
  }

  // Citations: every cited ref must be in the evidence, EN and AR must cite the same evidence
  const enP = parseCitations(ex.en, suraByName);
  const arP = parseCitations(ex.ar, suraByName);
  for (const u of [...enP.unresolved, ...arP.unresolved]) err(where, `unrecognised citation "(${u})"`);
  for (const [lang, p] of [["en", enP], ["ar", arP]] as const) {
    for (const cit of p.citations) {
      if (cit.kind === "verse" && !verseKeys.has(cit.ref)) err(`${where} explanation.${lang}`, `cites ${cit.ref} (${cit.raw}) which is not in the card's verses`);
      if (cit.kind === "hadith" && !hadithSet.has(cit.ref)) err(`${where} explanation.${lang}`, `cites ${cit.ref} (${cit.raw}) which is not in the card's hadith`);
    }
    if ((k.verses.length || k.hadith.length) && !p.citations.length) err(`${where} explanation.${lang}`, "V2: explanation cites none of the card's evidence");
  }
  const enRefs = new Set(enP.citations.map((x) => x.ref));
  const arRefs = new Set(arP.citations.map((x) => x.ref));
  const onlyEn = [...enRefs].filter((r) => !arRefs.has(r));
  const onlyAr = [...arRefs].filter((r) => !enRefs.has(r));
  if (onlyEn.length || onlyAr.length) err(where, `EN and AR cite different evidence (only EN: ${onlyEn.join(", ") || "–"}; only AR: ${onlyAr.join(", ") || "–"})`);
  for (const v of verseKeys) if (!enRefs.has(v)) warn(where, `verse ${v} is in the evidence but not cited in the explanation`);
  for (const h of hadithSet) if (!enRefs.has(h)) warn(where, `hadith ${h} is in the evidence but not cited in the explanation`);

  // V3: no Quran text typed into Arabic prose
  for (const p of prose.filter((x) => x.label.endsWith(".ar"))) {
    for (const key of verseKeys) {
      // window = the cited verse with its neighbours, so short verses quoted back to back are caught too
      const [su, ay] = key.split(":").map(Number);
      const window = [ay - 1, ay, ay + 1].map((n) => quran.get(`${su}:${n}`) ?? "").join(" ");
      const run = longestSharedRun(p.text, window);
      if (run.length > V3_MAX_RUN) err(`${where} ${p.label}`, `V3: ${run.length} consecutive words of ${key} typed into prose ("${run.text}") — paraphrase, or let the verse block show it`);
    }
  }

  // Length
  for (const lang of ["en", "ar"] as const) {
    const n = sentences(ex[lang]).length;
    if (n > MAX_SENTENCES) warn(`${where} explanation.${lang}`, `${n} sentences (aim for 2–4)`);
  }

  // Counts, glossary, related
  if (k.show_count) {
    const concept = c.concept_id ? concepts.get(c.concept_id) : undefined;
    if (c.kind !== "concept" || !concept?.count_tokens) err(where, "show_count needs a nature concept with a code-computed count");
  }
  for (const g of k.glossary_terms) if (!glossaryIds.has(g)) err(where, `unknown glossary term "${g}"`);
  for (const r of k.related_cards) {
    if (!cardIds.has(r)) err(where, `related card "${r}" does not exist`);
    if (r === c.id) err(where, "card relates to itself");
  }

  // Match phrases (answers are retrieved by them)
  const phrases = c.match_phrases ?? [];
  const lower = phrases.map((p) => p.trim().toLowerCase());
  if (new Set(lower).size !== lower.length) err(where, "duplicate match_phrases");
  if (lower.some((p) => !p)) err(where, "empty match phrase");
  if (c.kind === "answer") {
    const ar = phrases.filter((p) => /[؀-ۿ]/.test(p)).length;
    const en = phrases.length - ar;
    if (en < MIN_PHRASES || ar < MIN_PHRASES) err(where, `answers need at least ${MIN_PHRASES} EN and ${MIN_PHRASES} AR match phrases (have ${en} EN, ${ar} AR)`);
  }

  // Workflow replay (same mapping as scripts/seed/content.ts)
  let status: Status = "ai_draft";
  let approver: string | null = null;
  for (const [i, step] of (c.workflow ?? []).entries()) {
    const sw = `${where} workflow[${i}]`;
    const role = roleOf.get(step.by);
    if (!role) { err(sw, `unknown persona "${step.by}"`); break; }
    const r = canTransition(role, status, step.decision as Decision);
    if (!r.ok) { err(sw, `${step.by} (${role}) cannot ${step.decision} from ${status}: ${r.reason}`); break; }
    if (step.decision === "approve") approver = step.by;
    if (step.decision === "publish" && !fourEyesOk(step.by, approver)) err(sw, "four-eyes: publisher must differ from the approving researcher");
    if (step.decision === "return" && !step.note?.trim()) err(sw, "a return needs a note for the student");
    status = r.to;
  }
  statusCount[status] = (statusCount[status] ?? 0) + 1;
  if (status === "published" && c.concept_id && labels[c.concept_id] && !labels[c.concept_id].enabled && c.kind !== "answer")
    err(where, `published card for disabled concept "${c.concept_id}"`);
}

// ───────────────────────── Report
const fmt = (i: Issue) => `  - ${i.where}: ${i.msg}`;
if (!QUIET && warnings.length) console.log(`\n${warnings.length} warning(s):\n${warnings.map(fmt).join("\n")}`);
if (errors.length) console.log(`\n${errors.length} error(s):\n${errors.map(fmt).join("\n")}`);
const summary = Object.entries(statusCount).map(([s, n]) => `${n} ${s}`).join(", ");
console.log(`\ncontent-check: ${cards.length} cards (${summary}), ${Object.keys(labels).length} concept labels, ${sourceCache.size} tafsir sources — ${errors.length ? "FAIL" : "OK"}`);
process.exit(errors.length ? 1 : 0);
