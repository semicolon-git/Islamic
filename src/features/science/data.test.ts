import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

// Validates the curated "contributions of scholars in Muslim civilisation" knowledge base in data/science.
// Data only: no app code reads these files yet (see data/science/README.md).

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
  "astronomy", "mathematics", "optics", "medicine", "geography", "botany", "engineering", "navigation", "chemistry", "cartography",
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

const scientists = z.array(Scientist).min(1).parse(load("scientists.json"));
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
  });

  it("ids are unique within each file, and each concept has at most one topic entry", () => {
    expect(dupes(scientists.map((s) => s.id))).toEqual([]);
    expect(dupes(works.map((w) => w.id))).toEqual([]);
    expect(dupes(instruments.map((i) => i.id))).toEqual([]);
    expect(dupes(holdings.map((h) => h.id))).toEqual([]);
    expect(dupes(topics.map((t) => t.concept))).toEqual([]);
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
      ...[scientists, works, instruments, topics].flat().flatMap((e) => e.sources.map((s) => s.url)),
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
