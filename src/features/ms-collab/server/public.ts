import "server-only";
import { q, sql, tx } from "@/lib/db";
import type { Polygon } from "../../manuscripts/geometry";
import type { Tok } from "../../manuscripts/tokens";
import { initials } from "../rules";
import type { PublishedManuscript, PublishedPage } from "../types";
import { iso, isoOrNull } from "./core";
import { fetchAyat } from "./understanding";

/**
 * Public reader data. Only frozen publications (ms_page_publications) are shown — never working text, never the
 * dataset ground truth. Students are credited by initials only (research memo §6.4).
 */
export async function publishedManuscripts(): Promise<PublishedManuscript[]> {
  const rows = await sql<PublishedManuscript>(
    `select m.id, m.title_en, m.title_ar, m.author_en, m.author_ar, m.siglum, m.repository, m.holding_library_ar, m.shelfmark, m.license, m.credit_line, m.source_url,
            i.name_en as institution_en, i.name_ar as institution_ar, coalesce(i.is_demo, false) as institution_demo,
            (array_agg(coalesce(p.thumb_path, p.image_path) order by p.seq))[1] as thumb,
            count(p.id)::int as pages, max(p.published_at) as last_published
       from manuscripts m join ms_pages p on p.manuscript_id = m.id and p.published_version is not null
       left join institutions i on i.id = m.institution_id
      group by m.id, i.name_en, i.name_ar, i.is_demo order by max(p.published_at) desc`);
  return rows.map((r) => ({ ...r, last_published: isoOrNull(r.last_published) }));
}

export async function publishedManuscript(msId: string): Promise<PublishedManuscript | null> {
  return (await publishedManuscripts()).find((m) => m.id === msId) ?? null;
}

interface Content {
  lines: { n: number; line_id: string; zone: string | null; tokens: Tok[]; plain_text: string; reading_text: string }[];
  contributors: { author_id: string; kind: string }[];
  machine_draft: string[];
}

export async function publishedPages(msId: string): Promise<PublishedPage[]> {
  return tx(async (qb) => {
    const pages = await q<{ id: string; seq: number; label: string | null; image_path: string; width: number; height: number; published_version: number; inst_demo: boolean }>(qb,
      `select p.id, p.seq, p.label, p.image_path, p.width, p.height, p.published_version, coalesce(i.is_demo, false) as inst_demo
         from ms_pages p join manuscripts m on m.id = p.manuscript_id left join institutions i on i.id = m.institution_id
        where p.manuscript_id = $1 and p.published_version is not null order by p.seq`, [msId]);
    const out: PublishedPage[] = [];
    for (const p of pages) {
      const pub = (await q<{ version: number; content: Content; content_sha: string; created_at: string; published_by: string | null; approved_by: string | null }>(qb,
        "select version, content, content_sha, created_at, published_by, approved_by from ms_page_publications where page_id = $1 order by version desc limit 1", [p.id]))[0];
      if (!pub) continue;
      const ids = pub.content.lines.map((l) => l.line_id);
      const polys = new Map((await q<{ id: string; polygon: Polygon }>(qb, "select id, polygon from ms_lines where id = any($1::text[])", [ids])).map((r) => [r.id, r.polygon]));
      const people = [...new Set([...pub.content.contributors.map((c) => c.author_id), pub.published_by, pub.approved_by].filter(Boolean) as string[])];
      const keyers = (await q<{ author_id: string }>(qb,
        `select distinct k.author_id from ms_keyings k join ms_hard_words h on h.id = k.hard_word_id
          where h.page_id = $1 and h.status in ('agreed','resolved') and h.resolved_at <= $2`, [p.id, pub.created_at])).map((r) => r.author_id);
      const users = new Map((await q<{ id: string; role: string; en: string; ar: string; inst_en: string | null; inst_ar: string | null; is_demo: boolean }>(qb,
        `select u.id, u.role, u.display_name_en as en, u.display_name_ar as ar, i.name_en as inst_en, i.name_ar as inst_ar, u.is_demo
           from users u left join institutions i on i.id = u.institution_id where u.id = any($1::text[])`, [[...people, ...keyers]])).map((u) => [u.id, u]));
      type Name = { en: string; ar: string; demo: boolean };
      const display = (id: string): Name | null => {
        const u = users.get(id);
        if (!u) return null;
        return u.role === "student" ? { en: initials(u.en), ar: initials(u.ar), demo: u.is_demo } : { en: u.en, ar: u.ar, demo: u.is_demo };
      };
      const transcribers = [...new Set(pub.content.contributors.filter((c) => c.kind === "student" || c.kind === "suggestion").map((c) => c.author_id))];
      const reviewers = [...new Set([...pub.content.contributors.filter((c) => c.kind === "researcher" || c.kind === "consensus").map((c) => c.author_id), pub.approved_by].filter(Boolean) as string[])]
        .filter((id) => users.get(id)?.role !== "student");
      const pubBy = pub.published_by ? users.get(pub.published_by) : null;
      const credits: PublishedPage["credits"] = [
        { role: "transcription", names: transcribers.map(display).filter(Boolean) as Name[] },
        { role: "hard_words", names: keyers.filter((k) => !transcribers.includes(k)).map(display).filter(Boolean) as Name[] },
        { role: "review", names: reviewers.map(display).filter(Boolean) as Name[] },
        { role: "approval", names: pubBy ? [{ en: `${pubBy.en}${pubBy.inst_en ? ` · ${pubBy.inst_en}` : ""}`, ar: `${pubBy.ar}${pubBy.inst_ar ? ` · ${pubBy.inst_ar}` : ""}`, demo: pubBy.is_demo }] : [] },
      ];
      const machineAt = (await q<{ at: string | null }>(qb,
        "select min(v.created_at) as at from ms_line_versions v join ms_lines l on l.id = v.line_id where l.page_id = $1 and v.kind = 'machine'", [p.id]))[0]?.at ?? null;
      const quotes = await q<{ id: string; anchor_text: string; data: { verse_keys: string[]; line_ids: string[]; from_n: number; to_n: number; sura_name_ar: string; sura_name_en: string } }>(qb,
        "select id, anchor_text, data from ms_annotations where page_id = $1 and kind = 'quran' and status = 'confirmed' order by (data->>'from_n')::int", [p.id]);
      out.push({
        page_id: p.id, seq: p.seq, label: p.label, version: pub.version, sha: pub.content_sha, published_at: iso(pub.created_at),
        image: { src: p.image_path, width: p.width, height: p.height },
        lines: pub.content.lines.map((l) => ({ line_id: l.line_id, n: l.n, zone: l.zone, tokens: l.tokens, plain_text: l.plain_text, reading_text: l.reading_text, polygon: polys.get(l.line_id) ?? null })),
        quotes: await Promise.all(quotes.map(async (x) => ({
          id: x.id, verse_keys: x.data.verse_keys, line_ids: x.data.line_ids, from_n: x.data.from_n, to_n: x.data.to_n, ms_text: x.anchor_text,
          sura_name_ar: x.data.sura_name_ar, sura_name_en: x.data.sura_name_en,
          verses: (await fetchAyat(qb, x.data.verse_keys)).map((v) => ({
            key: v.key, aya: v.aya, text_uthmani: v.text_uthmani, sura_name_ar: v.sura_name_ar, sura_name_en: v.sura_name_en,
            translation: v.t_text ? { edition_name: v.t_name ?? "", text: v.t_text } : null,
          })),
        }))),
        credits: credits.filter((c) => c.names.length),
        machine: { engines: pub.content.machine_draft ?? [], date: isoOrNull(machineAt) },
        institution_demo: p.inst_demo,
      });
    }
    return out;
  });
}
