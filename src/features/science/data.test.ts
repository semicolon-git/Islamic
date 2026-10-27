import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

// Validates the curated "contributions of scholars in Muslim civilisation" knowledge base in data/science.
// Seeded into science_entries by scripts/seed/science.ts (see data/science/README.md).

const DIR = path.join(process.cwd(), "data", "science");
const load = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));

/** The platform's existing concept ids (the only ones science entries may link to). */
const CONCEPT_IDS = [
  "moon", "sun", "date_palm", "pen", "honey_bee", "olive", "rain_water", "tree_leaf", "birds", "camel", "mountain", "sea",
  "stars", "night_day", "shadow", "milk", "grain", "clouds", "fig", "qibla", "time_asr", "river", "ships", "pearl_coral",
  "pomegranate", "grapes", "ant", "livestock", "horse", "fish", "lamp", "water_life", "lightning", "wind", "stone", "soil",
  "iron", "salt_fresh", "onion_garlic", "spider", "calligraphy_inscription", "mosque_lamp", "mihrab", "pen_and_ink",
  "geometric_pattern", "arabesque", "mosque_dome", "minaret_call_to_prayer", "illuminated_mushaf", "astrolabe",
  "kiswa_textile", "muqarnas", "manuscript_page",
] as const;

const FIELDS = [
  "astronomy", "mathematics", "optics", "medicine", "geography", "botany", "engineering", "navigation", "chemistry", "cartography", "education",
] as const;

const ARABIC = /[؀-ۿ]/;
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase kebab-case slug");
const en = z.string().trim().min(1);
const ar = z.string().trim().min(1).regex(ARABIC, "must contain Arabic script");
const httpUrl = z.string().regex(/^https?:\/\/[^\s]+$/, "http(s) URL");
const source = z.strictObject({ citation: en, url: httpUrl });
const sources = z.array(source).min(1);
const concept = z.enum(CONCEPT_IDS);
// IAU proper names: capitalised words (e.g. "Vega", "Aldebaran").
const star = z.string().regex(/^[A-Z][a-z]+(?: [A-Z][a-z]+)*$/);

const Scientist = z.strictObject({
  id: slug,
  name_en: en,
  name_ar: ar,
  dates: z.string().regex(/\d.*\bCE\b/, "dates must give CE"),
  places_en: en,
  places_ar: ar,
  fields: z.array(z.enum(FIELDS)).min(1),
  summary_en: en,
  summary_ar: ar,
  contributions: z.array(z.strictObject({ en, ar })).min(2).max(5),
  works: z.array(slug),
  instruments: z.array(slug),
  stars: z.array(star),
  concepts: z.array(concept),
  sources,
});

const Work = z.strictObject({
  id: slug,
  title_en: en,
  title_ar: ar,
  author: slug,
  date_text: en,
  summary_en: en,
  summary_ar: ar,
  sources,
});

const Instrument = z.strictObject({
  id: slug,
  name_en: en,
  name_ar: ar,
  origin_en: en,
  origin_ar: ar,
  muslim_contribution_en: en,
  muslim_contribution_ar: ar,
  how_it_works_en: en,
  how_it_works_ar: ar,
  uses_en: z.array(en).min(1),
  uses_ar: z.array(ar).min(1),
  scientists: z.array(slug),
  concepts: z.array(concept),
  stars: z.array(star),
  sources,
});

const Holding = z.strictObject({
  id: slug,
  instrument: slug,
  object_en: en,
  object_ar: ar,
  maker_en: en.optional(),
  maker_ar: ar.optional(),
  date_text: en,
  place_made_en: en.optional(),
  museum_en: en,
  museum_ar: ar,
  city_en: en,
  city_ar: ar,
  country_code: z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2"),
  accession: en.optional(),
  url: httpUrl,
  verified_on: z.literal("2026-10-06"),
  note_en: en.optional(),
  note_ar: ar.optional(),
});

const Topic = z.strictObject({
  concept,
  note_en: en,
  note_ar: ar,
  scientists: z.array(slug),
  instruments: z.array(slug),
  works: z.array(slug),
  sources,
});

const step = z.strictObject({
  role: z.enum(["before", "muslim", "transmission", "after", "today"]),
  who_en: en,
  who_ar: ar,
  scientist: slug.nullable(),
  date_text: en,
  date_ar: ar,
  place_en: en.optional(),
  place_ar: ar.optional(),
  what_en: en,
  what_ar: ar,
  sources: z.array(source),
});
const Chain = z.strictObject({
  id: slug,
  title_en: en,
  title_ar: ar,
  science_en: en,
  science_ar: ar,
  claim: z.enum(["foundational", "contributor", "direct"]),
  objects: z.array(z.string().regex(/^[a-z0-9][a-z0-9 '-]*$/, "lowercase label")).min(3),
  objects_ar: z.array(ar).min(2),
  answer_en: en,
  answer_ar: ar,
  not_claimed_en: en,
  not_claimed_ar: ar,
  steps: z.array(step).min(3),
  myths: z.array(z.strictObject({ claim_en: en, claim_ar: ar, correction_en: en, correction_ar: ar, sources })).optional(),
  sources: z.array(source).min(2),
  review: z.strictObject({ status: z.enum(["sourced", "reviewed"]), by_en: en.optional(), by_ar: ar.optional(), on: en.optional() }).optional(),
});

const scientists = z.array(Scientist).min(1).parse(load("scientists.json"));
const chains = z.array(Chain).min(1).parse(load("chains.json"));
const works = z.array(Work).min(1).parse(load("works.json"));
const instruments = z.array(Instrument).min(1).parse(load("instruments.json"));
const holdings = z.array(Holding).min(1).parse(load("holdings.json"));
const topics = z.array(Topic).min(1).parse(load("topics.json"));

const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
const scientistIds = ids(scientists);
const workIds = ids(works);
const instrumentIds = ids(instruments);

const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
const missing = (refs: string[], known: Set<string>) => refs.filter((r) => !known.has(r));

describe("science knowledge base: schemas", () => {
  it("every file parses against its schema (strict: no unknown fields)", () => {
    // Parsing happens at module load; reaching here means all five files are valid.
    expect(scientists.length).toBeGreaterThanOrEqual(18);
    expect(works.length).toBeGreaterThanOrEqual(10);
    expect(instruments.length).toBeGreaterThanOrEqual(10);
    expect(holdings.length).toBeGreaterThanOrEqual(20);
    expect(topics.length).toBeGreaterThanOrEqual(20);
    expect(chains.length).toBeGreaterThanOrEqual(10);
  });

  it("ids are unique within each file, and each concept has at most one topic entry", () => {
    expect(dupes(scientists.map((s) => s.id))).toEqual([]);
    expect(dupes(works.map((w) => w.id))).toEqual([]);
    expect(dupes(instruments.map((i) => i.id))).toEqual([]);
    expect(dupes(holdings.map((h) => h.id))).toEqual([]);
    expect(dupes(topics.map((t) => t.concept))).toEqual([]);
    expect(dupes(chains.map((c) => c.id))).toEqual([]);
  });

  it("bilingual pairs are both present (optional pairs come together)", () => {
    for (const h of holdings) {
      expect(h.maker_en === undefined, `${h.id} maker_en/maker_ar`).toBe(h.maker_ar === undefined);
      expect(h.note_en === undefined, `${h.id} note_en/note_ar`).toBe(h.note_ar === undefined);
    }
    for (const i of instruments) expect(i.uses_ar.length, `${i.id} uses`).toBe(i.uses_en.length);
  });

  it("every source and holding URL is http(s)", () => {
    const urls = [
      ...[scientists, works, instruments, topics, chains].flat().flatMap((e) => e.sources.map((s) => s.url)),
      ...chains.flatMap((c) => [...c.steps, ...(c.myths ?? [])].flatMap((x) => x.sources.map((s) => s.url))),
      ...holdings.map((h) => h.url),
    ];
    expect(urls.filter((u) => !/^https?:\/\//.test(u))).toEqual([]);
  });

  it("includes the required scientists", () => {
    const required = [
      "al-fazari", "al-khwarizmi", "al-battani", "al-sufi", "al-biruni", "ibn-al-haytham", "al-zarqali", "al-ijliyya",
      "ibn-al-shatir", "nasir-al-din-al-tusi", "ulugh-beg", "al-jazari", "ibn-majid", "ibn-sina", "al-idrisi",
      "abu-al-wafa-al-buzjani", "taqi-al-din", "ibn-yunus",
    ];
    expect(missing(required, scientistIds)).toEqual([]);
  });
});

describe("science knowledge base: cross-references", () => {
  it("works.author resolves to a scientist", () => {
    expect(missing(works.map((w) => w.author), scientistIds)).toEqual([]);
  });

  it("scientists.works and scientists.instruments resolve", () => {
    expect(missing(scientists.flatMap((s) => s.works), workIds)).toEqual([]);
    expect(missing(scientists.flatMap((s) => s.instruments), instrumentIds)).toEqual([]);
  });

  it("a scientist lists every work attributed to them", () => {
    for (const w of works) {
      const author = scientists.find((s) => s.id === w.author)!;
      expect(author.works, `${w.author} should list ${w.id}`).toContain(w.id);
    }
  });

  it("instruments.scientists resolve", () => {
    expect(missing(instruments.flatMap((i) => i.scientists), scientistIds)).toEqual([]);
  });

  it("holdings.instrument resolves", () => {
    expect(missing(holdings.map((h) => h.instrument), instrumentIds)).toEqual([]);
  });

  it("topics link only to existing scientists, instruments and works", () => {
    expect(missing(topics.flatMap((t) => t.scientists), scientistIds)).toEqual([]);
    expect(missing(topics.flatMap((t) => t.instruments), instrumentIds)).toEqual([]);
    expect(missing(topics.flatMap((t) => t.works), workIds)).toEqual([]);
  });

  it("all concept ids come from the platform's concept list", () => {
    const used = [...topics.map((t) => t.concept), ...scientists.flatMap((s) => s.concepts), ...instruments.flatMap((i) => i.concepts)];
    expect(used.filter((c) => !(CONCEPT_IDS as readonly string[]).includes(c))).toEqual([]);
  });
});

describe("science knowledge base: history guardrails", () => {
  const astrolabe = instruments.find((i) => i.id === "astrolabe");

  it("has an astrolabe entry whose origin is Hellenistic/Greek", () => {
    expect(astrolabe).toBeDefined();
    expect(astrolabe!.origin_en).toMatch(/Hellenistic|Greek/);
    expect(astrolabe!.origin_ar).toMatch(/هلنستي|يوناني/);
  });

  it("never claims Muslims invented the astrolabe, and avoids miracle framing", () => {
    const allText = JSON.stringify([scientists, works, instruments, holdings, topics]);
    expect(allText).not.toMatch(/Muslims invented the astrolabe/i);
    expect(allText).not.toMatch(/(?<!not |never |did not )invented the astrolabe/i);
    expect(allText).not.toMatch(/scientific miracle|إعجاز علمي/i);
  });

  it("al-'Ijliyya's entry flags that 'Mariam' is a modern attribution", () => {
    const ijliyya = scientists.find((s) => s.id === "al-ijliyya")!;
    expect(ijliyya.name_en).not.toMatch(/Mariam/);
    expect(ijliyya.summary_en).toMatch(/Mariam.*modern/);
  });

  it("the Toledan Tables are described as a group work", () => {
    const toledan = works.find((w) => w.id === "toledan-tables")!;
    expect(toledan.summary_en).toMatch(/group/);
  });
});

describe("contribution chains (chains.json)", () => {
  const strip = (s: string) => s.replace(/\b(?:did not|didn't|not|never|nor)\b[^.]*\binvent\w*/gi, "");

  it("every chain has Muslim steps, credits who came before or after, and ends with today", () => {
    for (const c of chains) {
      const roles = c.steps.map((s) => s.role);
      expect(roles, `${c.id} needs a step by Muslim scholars`).toContain("muslim");
      expect(roles.some((r) => r === "before" || r === "after"), `${c.id} must credit predecessors or successors`).toBe(true);
      expect(roles.at(-1), `${c.id} should end with today`).toBe("today");
    }
  });

  it("every step by Muslim scholars, and every transmission step, cites at least one source", () => {
    for (const c of chains)
      for (const s of c.steps.filter((x) => x.role === "muslim" || x.role === "transmission"))
        expect(s.sources.length, `${c.id}: ${s.who_en}`).toBeGreaterThan(0);
  });

  it("scholar links resolve, and only steps by Muslim scholars link a scholar", () => {
    for (const c of chains)
      for (const s of c.steps) {
        if (s.scientist) expect(scientistIds.has(s.scientist), `${c.id}: unknown scholar ${s.scientist}`).toBe(true);
        if (s.scientist) expect(s.role, `${c.id}: ${s.scientist}`).toBe("muslim");
      }
  });

  it("an object label belongs to one chain only, so the word matcher is unambiguous", () => {
    expect(dupes(chains.flatMap((c) => c.objects))).toEqual([]);
    expect(dupes(chains.flatMap((c) => c.objects_ar))).toEqual([]);
  });

  it("says what it does not claim, and never says Muslims invented the object or frames history as a miracle", () => {
    for (const c of chains) {
      expect(c.not_claimed_en.length, c.id).toBeGreaterThan(30);
      // No Muslim-scholar step says "invented"; the answer may say others invented things ("paper was invented in China"),
      // but never that Muslims/Arabs/Islamic scholars did, unless negated.
      const steps = c.steps.filter((s) => s.role === "muslim").map((s) => strip(s.what_en)).join(" ");
      expect(steps, `${c.id} uses "invented" for a Muslim step`).not.toMatch(/\binvent(?:ed|or|ion)\b/i);
      const answer = c.answer_en.split(/(?<=[.;])\s+/).map(strip).filter((x) => /\b(?:Muslims?|Arabs?|Islamic|Islam)\b/.test(x)).join(" ");
      expect(answer, `${c.id} answer says Muslims invented something`).not.toMatch(/\binvent(?:ed|or|ion)\b/i);
      const claimsAr = [c.answer_ar, ...c.steps.filter((s) => s.role === "muslim").map((s) => s.what_ar)].join(" ");
      expect(claimsAr, `${c.id} uses «اخترع» for a Muslim step`).not.toMatch(/(?<!لم ي|لم |ما )اخترع/);
      expect(JSON.stringify(c), c.id).not.toMatch(/scientific miracle|إعجاز علمي|Quran predicted|predicted by the Quran/i);
    }
  });
});

