/**
 * Heritage seed (B5): one demo venue, four demo items, and a confirmed Light Verse inscription.
 * Idempotent: re-running updates the same rows. Works with an empty or full content set
 * (concept / card / manuscript links are only set when those rows exist).
 * Art cards are NOT created here; the content builder owns data/content/cards.
 */
import type { Queryable } from "../../src/lib/db";
import { buildIndex, matchQuran, type VerseRow } from "../../src/lib/quran/matcher";
import { exists, log, readJson } from "./util";

const GENERATED = { credit: "Generated illustration — not the actual object", license: "Generated illustration (decorative)", generated: true };
const LIGHT_VERSE = "الله نور السموات والأرض مثل نوره كمشكاة فيها مصباح";

type Wf = { decision: "submit" | "approve" | "publish"; by: string; note?: string };
interface SeedItem {
  id: string;
  code: string;
  kind: string;
  concept: string;
  image: string;
  title_en: string;
  title_ar: string;
  date_text: string;
  date_text_ar: string;
  origin: string;
  origin_ar: string;
  material: string;
  material_ar: string;
  description_en: string;
  description_ar: string;
  alt_en: string;
  alt_ar: string;
  manuscript?: string;
  sort: number;
  workflow: Wf[];
}

const ITEMS: SeedItem[] = [
  {
    id: "item_astrolabe",
    code: "AST-7",
    kind: "astrolabe",
    concept: "astrolabe",
    image: "astrolabe",
    sort: 10,
    title_en: "Planispheric astrolabe",
    title_ar: "أسطرلاب مسطّح",
    date_text: "Demo record · later Islamic period",
    date_text_ar: "سجل تجريبي · العصر الإسلامي المتأخر",
    origin: "Islamic world (demo record)",
    origin_ar: "العالم الإسلامي (سجل تجريبي)",
    material: "Brass, engraved",
    material_ar: "نحاس أصفر محفور",
    description_en:
      "An astrolabe models the sky on a flat brass disc. By sighting the sun or a bright star and turning the pierced star map (the rete) over the plate for the observer's latitude, its user could tell the time of day or night — which is how astronomers kept the times of prayer and found the direction of Mecca (the qibla).\n\nThis is a demo record: the image is an illustration, not a photograph of a particular instrument.",
    description_ar:
      "يحاكي الأسطرلاب السماءَ على قرص نحاسي مسطّح. فبرصد الشمس أو نجم لامع، وتدوير الشبكة المثقّبة التي تحمل مواقع النجوم فوق الصفيحة الخاصة بخط عرض الراصد، كان المستخدم يعرف الوقت ليلًا ونهارًا؛ وبهذا ضبط الفلكيون مواقيت الصلاة وعيّنوا اتجاه القبلة.\n\nهذا سجل تجريبي، والصورة رسم توضيحي لا صورة آلة بعينها.",
    alt_en: "Illustration of a brass astrolabe",
    alt_ar: "رسم توضيحي لأسطرلاب نحاسي",
    workflow: [
      { decision: "submit", by: "u_omar" },
      { decision: "approve", by: "u_huda", note: "Description checked against King, D. A. (1996) Astronomy and Islamic society." },
      { decision: "publish", by: "u_khalid" },
    ],
  },
  {
    id: "item_lamp",
    code: "LMP-3",
    kind: "lamp",
    concept: "mosque_lamp",
    image: "mosque_lamp",
    sort: 20,
    title_en: "Enamelled glass mosque lamp",
    title_ar: "قنديل مسجد من الزجاج المموّه بالمينا",
    date_text: "Demo record · Mamluk style",
    date_text_ar: "سجل تجريبي · على الطراز المملوكي",
    origin: "Egypt or Syria (style)",
    origin_ar: "مصر أو الشام (بحسب الطراز)",
    material: "Blown glass, enamel and gilding",
    material_ar: "زجاج منفوخ، مينا وتذهيب",
    description_en:
      "Lamps like this hung by chains in mosques and madrasas, with an oil wick glowing inside the glass. Their makers often painted a band from the Light Verse (Surah An-Nur, 24:35), which speaks of a niche, a lamp and a glass.\n\nThe inscription on this lamp was read by a student and confirmed by a researcher. This is a demo record with an illustrative image.",
    description_ar:
      "كانت مثل هذه القناديل تُعلَّق بالسلاسل في المساجد والمدارس، وفي داخل زجاجها فتيل زيت يضيء. وكثيرًا ما رسم صنّاعها عليها شريطًا من آية النور (سورة النور: ٣٥) التي تذكر المشكاة والمصباح والزجاجة.\n\nقرأ نقشَ هذا القنديل طالبٌ، وأكّد قراءته باحث. هذا سجل تجريبي بصورة توضيحية.",
    alt_en: "Illustration of an enamelled glass mosque lamp",
    alt_ar: "رسم توضيحي لقنديل مسجد زجاجي مموّه بالمينا",
    workflow: [
      { decision: "submit", by: "u_sara" },
      { decision: "approve", by: "u_huda", note: "Inscription confirmed as 24:35 by the matcher and checked by hand." },
      { decision: "publish", by: "u_khalid" },
    ],
  },
  {
    id: "item_tile",
    code: "TIL-2",
    kind: "tile",
    concept: "geometric_pattern",
    image: "geometric_pattern",
    sort: 30,
    title_en: "Geometric tile panel",
    title_ar: "لوح خزفي بزخارف هندسية",
    date_text: "Demo record",
    date_text_ar: "سجل تجريبي",
    origin: "Western Islamic world (style)",
    origin_ar: "الغرب الإسلامي (بحسب الطراز)",
    material: "Glazed ceramic tile mosaic (zellij style)",
    material_ar: "فسيفساء خزفية مزجّجة (على طراز الزليج)",
    description_en:
      "Star-and-polygon patterns like these are built with a compass and a straight edge: a few circles and lines repeated across the wall. There is no verse attached to this panel — a pattern does not need one.",
    description_ar:
      "تُبنى أنماط النجوم والمضلّعات هذه بالفرجار والمسطرة: دوائر وخطوط قليلة تتكرّر على امتداد الجدار. ولا آية مرتبطة بهذا اللوح؛ فالزخرفة لا تحتاج إلى آية.",
    alt_en: "Illustration of a geometric star pattern in tiles",
    alt_ar: "رسم توضيحي لنمط نجمي هندسي من البلاط",
    workflow: [{ decision: "submit", by: "u_sara" }], // awaiting the researcher
  },
  {
    id: "item_qamus",
    code: "QMS-1",
    kind: "manuscript",
    concept: "illuminated_mushaf",
    image: "illuminated_mushaf",
    manuscript: "umich-isl-22",
    sort: 40,
    title_en: "al-Qāmūs al-muḥīṭ (facsimile)",
    title_ar: "القاموس المحيط (نسخة مصوّرة)",
    date_text: "Work completed before 817 AH / 1415 CE",
    date_text_ar: "أُلِّف قبل سنة ٨١٧هـ / ١٤١٥م",
    origin: "Copy held at the University of Michigan Library (Isl. Ms. 22)",
    origin_ar: "النسخة محفوظة في مكتبة جامعة ميشيغان (Isl. Ms. 22)",
    material: "Facsimile of a paper manuscript",
    material_ar: "نسخة مصوّرة عن مخطوط ورقي",
    description_en:
      "The Qāmūs of al-Fīrūzābādī (d. 817/1415) is one of the best-known dictionaries of Arabic. This reading-room facsimile reproduces a public-domain copy digitised by the University of Michigan (via HathiTrust). Students are transcribing its pages in our Manuscript Studio; approved pages can be read in the app.",
    description_ar:
      "قاموس الفيروزآبادي (ت ٨١٧هـ) من أشهر معاجم العربية. وهذه نسخة مصوّرة معروضة في قاعة القراءة لنسخة في الملك العام رقمنتها جامعة ميشيغان (عبر HathiTrust). ويعمل الطلاب على نسخ صفحاتها في استوديو المخطوطات، ويمكن قراءة الصفحات المعتمدة في التطبيق.",
    alt_en: "Illustration of an illuminated manuscript page",
    alt_ar: "رسم توضيحي لصفحة مخطوط مزخرفة",
    workflow: [
      { decision: "submit", by: "u_omar" },
      { decision: "approve", by: "u_huda" },
      { decision: "publish", by: "u_khalid" },
    ],
  },
];

const TO: Record<Wf["decision"], string> = { submit: "student_submitted", approve: "researcher_approved", publish: "published" };

export async function seed(q: Queryable) {
  const one = async <T>(text: string, params: unknown[] = []) => (await q.query<T>(text, params)).rows[0] ?? null;
  const has = async (table: string, id: string) => !!(await one(`select 1 from ${table} where id = $1`, [id]));

  // ── Venue (Al-Noor Library reading room)
  const inst = (await has("institutions", "inst_lib")) ? "inst_lib" : null;
  await q.query(
    `insert into venues (id, institution_id, name_en, name_ar, code) values ('venue_noor', $1, $2, $3, 'NOOR')
     on conflict (id) do update set institution_id = excluded.institution_id, name_en = excluded.name_en, name_ar = excluded.name_ar, code = excluded.code`,
    [inst, "Al-Noor Library — Reading Room", "مكتبة النور — قاعة القراءة"],
  );

  // Concept images from the generated-image manifest (local vendored copy preferred).
  const manifest = exists("data/content/concept_images.json") ? readJson<{ images: Record<string, string> }>("data/content/concept_images.json").images : {};
  const imageFor = (id: string) => {
    for (const ext of ["webp", "jpg", "png"]) if (exists(`public/images/concepts/${id}.${ext}`)) return `/images/concepts/${id}.${ext}`;
    return manifest[id] ?? null;
  };

  const usersExist = await has("users", "u_huda");
  const base = Date.now() - 1000 * 60 * 60 * 24 * 9;

  for (const [n, it] of ITEMS.entries()) {
    const concept = (await has("concepts", it.concept)) ? it.concept : null;
    const card = concept ? await one<{ id: string }>("select id from cards where concept_id = $1 and status = 'published' order by published_at desc limit 1", [concept]) : null;
    const manuscript = it.manuscript && (await has("manuscripts", it.manuscript)) ? it.manuscript : null;
    const src = imageFor(it.image);
    const images = src ? [{ src, ...GENERATED, source_url: null, alt_en: it.alt_en, alt_ar: it.alt_ar }] : [];
    const wf = usersExist ? it.workflow : [];
    const status = wf.length ? TO[wf[wf.length - 1].decision] : "ai_draft";
    const t0 = base + n * 1000 * 60 * 60 * 20;
    const stepAt = (i: number) => new Date(t0 + (i + 1) * 1000 * 60 * 60 * 6).toISOString();
    const publishedAt = status === "published" ? stepAt(wf.length - 1) : null;

    await q.query(
      `insert into heritage_items (id, item_code, institution_id, venue_id, kind, concept_id, title_en, title_ar,
         date_text, date_text_ar, origin, origin_ar, material, material_ar, description_en, description_ar,
         images, card_id, manuscript_id, status, created_by, created_at, updated_at, published_at, sort)
       values ($1,$2,$3,'venue_noor',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       on conflict (id) do update set item_code=excluded.item_code, institution_id=excluded.institution_id, venue_id=excluded.venue_id,
         kind=excluded.kind, concept_id=excluded.concept_id, title_en=excluded.title_en, title_ar=excluded.title_ar,
         date_text=excluded.date_text, date_text_ar=excluded.date_text_ar, origin=excluded.origin, origin_ar=excluded.origin_ar,
         material=excluded.material, material_ar=excluded.material_ar, description_en=excluded.description_en,
         description_ar=excluded.description_ar, images=excluded.images, card_id=excluded.card_id,
         manuscript_id=excluded.manuscript_id, status=excluded.status, sort=excluded.sort`,
      [
        it.id, it.code, inst, it.kind, concept, it.title_en, it.title_ar, it.date_text, it.date_text_ar, it.origin, it.origin_ar,
        it.material, it.material_ar, it.description_en, it.description_ar, JSON.stringify(images), card?.id ?? null, manuscript, status,
        usersExist ? wf[0]?.by ?? null : null, new Date(t0).toISOString(), stepAt(Math.max(0, wf.length - 1)), publishedAt, it.sort,
      ],
    );

    // Replay the review chain once (reviews are history; don't duplicate them on re-seed).
    const reviewed = await one("select 1 from reviews where entity_type = 'item' and entity_id = $1 limit 1", [it.id]);
    if (!reviewed) {
      let from = "ai_draft";
      for (const [i, s] of wf.entries()) {
        await q.query(
          `insert into reviews (entity_type, entity_id, version, reviewer_id, from_status, to_status, decision, note, created_at)
           values ('item', $1, null, $2, $3, $4, $5, $6, $7)`,
          [it.id, s.by, from, TO[s.decision], s.decision, s.note ?? null, stepAt(i)],
        );
        from = TO[s.decision];
      }
    }
  }

  // ── The lamp's inscription: read by a student, matched, confirmed by a researcher.
  const verses = (await q.query<VerseRow>("select key, sura, aya, text_emlaey, text_uthmani, sura_name_ar, sura_name_en from quran_ayah order by sura, aya")).rows;
  if (verses.length) {
    const match = matchQuran(buildIndex(verses), LIGHT_VERSE);
    const keys = match.status === "exact" ? [...new Set(match.locations.flatMap((l) => l.verses))] : [];
    await q.query(
      `insert into inscriptions (id, item_id, transcription, match, verse_keys, author_id, verified_by, status, confirmed_at)
       values ('ins_lamp_light', 'item_lamp', $1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set transcription = excluded.transcription, match = excluded.match, verse_keys = excluded.verse_keys`,
      [LIGHT_VERSE, JSON.stringify(match), keys, usersExist ? "u_sara" : null, usersExist ? "u_huda" : null, usersExist ? "confirmed" : "suggested", usersExist ? new Date(base).toISOString() : null],
    );
    if (keys[0] !== "24:35") throw new Error(`heritage seed: lamp inscription should match 24:35, got ${match.status} ${keys.join(",")}`);
  }

  const counts = (await q.query<{ status: string; n: number }>("select status, count(*)::int as n from heritage_items group by status order by status")).rows;
  log(`1 venue (NOOR), ${ITEMS.length} heritage items (${counts.map((c) => `${c.n} ${c.status}`).join(", ")}), lamp inscription → 24:35`);
}
