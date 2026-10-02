import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Queryable } from "../../src/lib/db";
import { CardContent } from "../../src/lib/cards/types";
import { ROOT, exists, insertMany, log, readJson } from "./util";

/**
 * Seeds approved content from data/content/: glossary.json and cards/*.json.
 * Card file: { id, kind, concept_id, level, certainty, title_en, title_ar, match_phrases, institution_id,
 *              workflow: [{decision, by, note}], content: CardContent }
 * The workflow array replays the review chain (demo personas) and sets the resulting status/published version.
 */
export async function seed(q: Queryable) {
  if (exists("data/content/glossary.json")) {
    const terms = readJson<Record<string, unknown>[]>("data/content/glossary.json");
    for (const t of terms)
      await q.query(
        `insert into glossary_terms (id, term_ar, term_en, rule_en, rule_ar, meaning_en, meaning_ar, variants, banned_renderings, source, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved')
         on conflict (id) do update set term_ar=excluded.term_ar, term_en=excluded.term_en, rule_en=excluded.rule_en, rule_ar=excluded.rule_ar,
           meaning_en=excluded.meaning_en, meaning_ar=excluded.meaning_ar,
           variants=excluded.variants, banned_renderings=excluded.banned_renderings, source=excluded.source`,
        [t.id, t.term_ar, t.term_en, t.rule_en, t.rule_ar, t.meaning_en ?? null, t.meaning_ar ?? null, t.variants ?? [], t.banned_renderings ?? [], t.source],
      );
    log(`${terms.length} glossary terms`);
  }

  const dir = path.join(ROOT, "data/content/cards");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  let n = 0;
  for (const f of files) {
    const c = readJson<{
      id: string; kind: string; concept_id: string | null; level: string; certainty: string; title_en: string; title_ar: string;
      match_phrases?: string[]; institution_id?: string; workflow?: { decision: string; by: string; note?: string }[]; content: unknown;
    }>(path.join(dir, f));
    const content = CardContent.parse(c.content);
    const json = JSON.stringify(content);
    const sha = createHash("sha256").update(json).digest("hex").slice(0, 16);
    const existing = (await q.query("select 1 from cards where id=$1", [c.id])).rows.length;
    if (existing) continue;
    const wf = c.workflow ?? [];
    let status = "ai_draft";
    let t = Date.now() - 1000 * 60 * 60 * 24 * 6; // workflow history spread over the last days
    const reviews: unknown[][] = [];
    for (const step of wf) {
      const to = ({ submit: "student_submitted", approve: "researcher_approved", publish: "published", return: "returned", archive: "archived" } as Record<string, string>)[step.decision];
      if (!to) throw new Error(`${f}: unknown decision ${step.decision}`);
      t += 1000 * 60 * 60 * (8 + reviews.length * 5);
      reviews.push(["card", c.id, 1, step.by, status, to, step.decision, step.note ?? null, new Date(t).toISOString()]);
      status = to;
    }
    const published = status === "published";
    await q.query(
      `insert into cards (id, kind, concept_id, level, certainty, title_en, title_ar, match_phrases, status, current_version, published_version, institution_id, created_by, published_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$12,$13)`,
      [c.id, c.kind, c.concept_id, c.level, c.certainty, c.title_en, c.title_ar, c.match_phrases ?? [], status, published ? 1 : null, c.institution_id ?? null, wf[0]?.by ?? null, published ? new Date(t).toISOString() : null],
    );
    await q.query("insert into card_versions (card_id, version, content, content_sha, author_id, note) values ($1,1,$2,$3,$4,$5)", [c.id, json, sha, wf[0]?.by ?? null, "Initial version"]);
    if (reviews.length) await insertMany(q, "reviews", ["entity_type", "entity_id", "version", "reviewer_id", "from_status", "to_status", "decision", "note", "created_at"], reviews);
    n++;
  }
  log(`${n} cards`);
}
