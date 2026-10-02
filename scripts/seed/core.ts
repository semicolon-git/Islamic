import fs from "node:fs";
import path from "node:path";
import type { Queryable } from "../../src/lib/db";
import { RAW, ROOT, exists, insertMany, log, readJson } from "./util";

interface KfgqpcRow { sora: number; aya_no: number; aya_text: string; aya_text_emlaey: string; sora_name_ar: string; sora_name_en: string; page: number; jozz: number }

export async function seedCore(q: Queryable) {
  // ── Institutions & personas
  const p = readJson<{ institutions: Record<string, unknown>[]; users: Record<string, unknown>[] }>("data/demo/personas.json");
  for (const i of p.institutions)
    await q.query(
      "insert into institutions (id, slug, kind, name_en, name_ar, review_policy, is_demo) values ($1,$2,$3,$4,$5,$6,true) on conflict (id) do update set name_en=excluded.name_en, name_ar=excluded.name_ar",
      [i.id, i.slug, i.kind, i.name_en, i.name_ar, JSON.stringify(i.review_policy ?? {})],
    );
  for (const u of p.users)
    await q.query(
      `insert into users (id, role, institution_id, display_name_en, display_name_ar, title_en, title_ar, avatar_hue, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,true) on conflict (id) do nothing`,
      [u.id, u.role, u.institution_id, u.display_name_en, u.display_name_ar, u.title_en, u.title_ar, u.avatar_hue],
    );
  log(`${p.users.length} personas in ${p.institutions.length} institutions`);

  // ── Quran (KFGQPC Hafs v18)
  const n = (await q.query<{ n: number }>("select count(*)::int as n from quran_ayah")).rows[0].n;
  if (n < 6236) {
    const src = path.join(RAW, "quran_kfgqpc_hafs_v18.json");
    if (!fs.existsSync(src)) throw new Error("Missing Quran data. Run `npm run data:fetch` first.");
    const rows = readJson<KfgqpcRow[]>(src);
    if (rows.length !== 6236) throw new Error(`Expected 6236 ayat, got ${rows.length}`);
    await insertMany(
      q,
      "quran_ayah",
      ["key", "sura", "aya", "text_uthmani", "text_emlaey", "sura_name_ar", "sura_name_en", "page", "juz"],
      rows.map((r) => [`${r.sora}:${r.aya_no}`, r.sora, r.aya_no, r.aya_text, r.aya_text_emlaey, r.sora_name_ar.trim(), r.sora_name_en.trim(), r.page, r.jozz]),
      "on conflict (key) do nothing",
    );
    log("6236 ayat (KFGQPC Hafs v18)");
  }

  // ── Translation (Saheeh International — mirror; pin to Quranpedia edition 1947 before launch)
  await q.query(
    `insert into translation_editions (id, lang, name, translator, source, status_note) values
      ('en.saheeh','en','Saheeh International','Saheeh International','fawazahmed0/quran-api eng-ummmuhammad (mirror)','Mirror copy — verify against Quranpedia edition 1947 before launch')
     on conflict (id) do nothing`,
  );
  const tn = (await q.query<{ n: number }>("select count(*)::int as n from quran_translation where edition_id='en.saheeh'")).rows[0].n;
  if (tn < 6236) {
    const t = readJson<{ quran: { chapter: number; verse: number; text: string }[] }>(path.join(RAW, "translations/eng-ummmuhammad.json")).quran;
    await insertMany(q, "quran_translation", ["edition_id", "key", "text"], t.map((r) => ["en.saheeh", `${r.chapter}:${r.verse}`, r.text.trim()]), "on conflict do nothing");
    log(`${t.length} translation verses`);
  }

  // ── Hadith: Sahih al-Bukhari (standard numbering) & Sahih Muslim (Abd al-Baqi numbering, first narration of each number)
  const hn = (await q.query<{ n: number }>("select count(*)::int as n from hadith")).rows[0].n;
  if (hn < 1000) {
    type H = { hadithnumber: number; arabicnumber?: number | string; text: string };
    const load = (f: string) => readJson<{ hadiths: H[] }>(path.join(RAW, "hadith", f)).hadiths;
    const rows: unknown[][] = [];
    for (const coll of ["bukhari", "muslim"] as const) {
      const ar = load(`ara-${coll}.json`);
      const en = new Map(load(`eng-${coll}.json`).map((h) => [h.hadithnumber, h.text]));
      const seen = new Set<string>();
      for (const h of ar) {
        if (!h.text?.trim()) continue;
        let num: string;
        if (coll === "bukhari") {
          if (!Number.isInteger(h.hadithnumber)) continue;
          num = String(h.hadithnumber);
        } else {
          if (h.arabicnumber === undefined || h.arabicnumber === null || h.arabicnumber === "") continue;
          num = String(h.arabicnumber).split(".")[0];
        }
        if (seen.has(num)) continue;
        seen.add(num);
        rows.push([
          `${coll}:${num}`, coll, num,
          coll === "bukhari" ? "Bukhari standard (Fath al-Bari)" : "Muslim — Muhammad Fu'ad Abd al-Baqi",
          h.text.trim(), en.get(h.hadithnumber)?.trim() || null,
          "sahih", coll === "bukhari" ? "al-Bukhari" : "Muslim",
          null,
        ]);
      }
    }
    await insertMany(q, "hadith", ["id", "collection", "number", "numbering_scheme", "text_ar", "text_en", "grade", "grader", "source_url"], rows, "on conflict (id) do nothing");
    log(`${rows.length} hadith (Bukhari + Muslim)`);
  }

  // ── Concepts (nature + art/heritage) with code-computed counts
  type Concept = { id: string; label_en: string; label_ar: string; qac_lemmas?: string[]; count_tokens?: number; count_verses?: number; camera?: string; sensitivity?: string };
  const nature = readJson<Concept[]>("prep/data/concepts_verified.json");
  const art = readJson<{ concepts: (Concept & { track: string; card: string })[] }>("prep/data/art_heritage_concepts.json").concepts;
  const labels = exists("data/content/concept_labels.json") ? readJson<Record<string, { label_en?: string; label_ar?: string; blurb_en?: string; blurb_ar?: string; visual_hints?: string; sort?: number; enabled?: boolean }>>("data/content/concept_labels.json") : {};
  let sort = 0;
  const imgFor = (id: string) => {
    for (const ext of ["webp", "jpg", "png"]) if (fs.existsSync(path.join(ROOT, "public/images/concepts", `${id}.${ext}`))) return `/images/concepts/${id}.${ext}`;
    return null;
  };
  for (const c of nature) {
    const l = labels[c.id] ?? {};
    await q.query(
      `insert into concepts (id, track, label_en, label_ar, blurb_en, blurb_ar, image, visual_hints, qac_lemmas, count_tokens, count_verses, count_rule, sensitivity, sort, enabled)
       values ($1,'nature',$2,$3,$4,$5,$6,$7,$8,$9,$10,'qac-lemma-word-token@0.4',$11,$12,$13)
       on conflict (id) do update set label_en=excluded.label_en, label_ar=excluded.label_ar, blurb_en=excluded.blurb_en, blurb_ar=excluded.blurb_ar, image=excluded.image, visual_hints=excluded.visual_hints, sort=excluded.sort, enabled=excluded.enabled`,
      [c.id, l.label_en ?? c.label_en, l.label_ar ?? c.label_ar, l.blurb_en ?? null, l.blurb_ar ?? null, imgFor(c.id), l.visual_hints ?? c.camera ?? null, c.qac_lemmas ?? [], c.count_tokens ?? null, c.count_verses ?? null, c.sensitivity ?? null, l.sort ?? sort++, l.enabled ?? true],
    );
  }
  for (const c of art) {
    const l = labels[c.id] ?? {};
    const track = c.track === "heritage" ? "heritage" : "art";
    await q.query(
      `insert into concepts (id, track, label_en, label_ar, blurb_en, blurb_ar, image, visual_hints, sensitivity, sort, enabled)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (id) do update set label_en=excluded.label_en, label_ar=excluded.label_ar, blurb_en=excluded.blurb_en, blurb_ar=excluded.blurb_ar, image=excluded.image, visual_hints=excluded.visual_hints, sort=excluded.sort, enabled=excluded.enabled`,
      [c.id, track, l.label_en ?? humanize(c.id), l.label_ar ?? c.id, l.blurb_en ?? c.card ?? null, l.blurb_ar ?? null, imgFor(c.id), l.visual_hints ?? null, c.sensitivity ?? null, l.sort ?? 100 + sort++, l.enabled ?? true],
    );
  }
  log(`${nature.length} nature + ${art.length} art/heritage concepts`);

  await q.query(
    `insert into agent_configs (agent, model_id, prompt_version) values
      ('vision','claude-opus-5-5','v1'),('router','claude-opus-5-5','v1'),('composer','claude-opus-5-5','v1'),('verifier','claude-opus-5-5','v1'),('draft','claude-opus-5-5','v1')
     on conflict (agent) do nothing`,
  );
}

const humanize = (id: string) => id.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
