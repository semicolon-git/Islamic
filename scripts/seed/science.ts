/**
 * Muslim-science knowledge graph from data/science/*.json (curated, every entry sourced; see data/science/README.md).
 * Additive and idempotent: entries are upserted, except ones a person has edited in the portal (updated_by set).
 */
import type { Queryable } from "../../src/lib/db";
import { exists, log, readJson } from "./util";

type Entry = Record<string, unknown> & { id: string };
const FILES: { kind: "scientist" | "work" | "instrument" | "holding" | "topic"; file: string; name: (e: Entry) => [string, string]; id?: (e: Entry) => string }[] = [
  { kind: "scientist", file: "data/science/scientists.json", name: (e) => [String(e.name_en), String(e.name_ar)] },
  { kind: "work", file: "data/science/works.json", name: (e) => [String(e.title_en), String(e.title_ar)] },
  { kind: "instrument", file: "data/science/instruments.json", name: (e) => [String(e.name_en), String(e.name_ar)] },
  { kind: "holding", file: "data/science/holdings.json", name: (e) => [String(e.object_en), String(e.object_ar)] },
  { kind: "topic", file: "data/science/topics.json", name: (e) => [String(e.concept), String(e.concept)], id: (e) => String(e.concept) },
];

export async function seed(q: Queryable) {
  let n = 0;
  for (const f of FILES) {
    if (!exists(f.file)) continue;
    const rows = readJson<Entry[]>(f.file);
    let sort = 0;
    for (const e of rows) {
      const id = f.id ? f.id(e) : e.id;
      const [en, ar] = f.name(e);
      await q.query(
        `insert into science_entries (kind, id, name_en, name_ar, data, status, sort) values ($1,$2,$3,$4,$5,'approved',$6)
         on conflict (kind, id) do update set name_en = excluded.name_en, name_ar = excluded.name_ar, data = excluded.data, sort = excluded.sort, updated_at = now()
         where science_entries.updated_by is null`,
        [f.kind, id, en, ar, JSON.stringify(e), (sort += 10)],
      );
      n++;
    }
  }
  if (n) log(`science: ${n} entries (scientists, works, instruments, museum holdings, topics)`);
}
