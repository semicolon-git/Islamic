import "server-only";
import { one, q, sql, tx } from "@/lib/db";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import { hashToken } from "@/features/inbox/server";
import { plain } from "@/features/portal/plain";

export interface DemandGroup {
  key: string;
  concept_id: string | null;
  topic: string | null;
  item_code: string | null;
  label_en: string | null;
  label_ar: string | null;
  track: string | null;
  image: string | null;
  total: number;
  open: number;
  fulfilled: number;
  dismissed: number;
  recent: number;
  first_at: string;
  last_at: string;
  status: "open" | "in_progress" | "fulfilled" | "dismissed";
  card: { id: string; kind: string; concept_id: string | null; title_en: string; title_ar: string } | null;
  in_progress: { id: string; stage: string; title_en: string; title_ar: string }[];
}

/** Group key for a request: its concept, else its free-text topic, else the heritage item code. */
export function demandKey(r: { concept_id?: string | null; topic?: string | null; item_code?: string | null }) {
  if (r.concept_id) return `concept:${r.concept_id}`;
  if (r.topic?.trim()) return `topic:${r.topic.trim().toLowerCase().replace(/\s+/g, " ")}`;
  if (r.item_code) return `item:${r.item_code.toUpperCase()}`;
  return null;
}

export async function demandBoard(): Promise<DemandGroup[]> {
  const rows = await sql<Omit<DemandGroup, "status" | "card" | "in_progress"> & { card_id: string | null }>(
    `with r as (
       select *, case when concept_id is not null then 'concept:' || concept_id
                      when coalesce(trim(topic), '') <> '' then 'topic:' || regexp_replace(lower(trim(topic)), '\\s+', ' ', 'g')
                      else 'item:' || upper(coalesce(item_code, '?')) end as key
         from card_requests)
     select r.key, min(r.concept_id) as concept_id, min(r.topic) as topic, min(r.item_code) as item_code,
            k.label_en, k.label_ar, k.track, k.image,
            count(*)::int as total,
            count(*) filter (where r.status = 'open')::int as open,
            count(*) filter (where r.status = 'fulfilled')::int as fulfilled,
            count(*) filter (where r.status = 'dismissed')::int as dismissed,
            count(*) filter (where r.created_at > now() - interval '7 days')::int as recent,
            min(r.created_at) as first_at, max(r.created_at) as last_at,
            (array_agg(r.fulfilled_card_id order by r.created_at desc) filter (where r.fulfilled_card_id is not null))[1] as card_id
       from r left join concepts k on k.id = r.concept_id
      group by r.key, k.label_en, k.label_ar, k.track, k.image
      order by count(*) filter (where r.status = 'open') desc, max(r.created_at) desc
      limit 200`,
  );
  const conceptIds = rows.map((r) => r.concept_id).filter((x): x is string => !!x);
  const cardIds = rows.map((r) => r.card_id).filter((x): x is string => !!x);
  const [cards, published, working] = await Promise.all([
    cardIds.length ? sql<NonNullable<DemandGroup["card"]>>("select id, kind, concept_id, title_en, title_ar from cards where id = any($1::text[])", [cardIds]) : [],
    conceptIds.length
      ? sql<NonNullable<DemandGroup["card"]>>(
          "select distinct on (concept_id) id, kind, concept_id, title_en, title_ar from cards where concept_id = any($1::text[]) and status = 'published' order by concept_id, published_at desc nulls last",
          [conceptIds],
        )
      : [],
    conceptIds.length
      ? sql<{ id: string; concept_id: string; stage: string; title_en: string; title_ar: string }>(
          `select id, concept_id, case when status = 'published' then revision_status else status end as stage, title_en, title_ar
             from cards where concept_id = any($1::text[]) and (status in ('ai_draft','student_submitted','researcher_approved','returned') or revision_status is not null)
            order by updated_at desc`,
          [conceptIds],
        )
      : [],
  ]);
  const cardBy = new Map(cards.map((c) => [c.id, c]));
  const pubBy = new Map(published.map((c) => [c.concept_id, c]));
  return plain(rows).map(({ card_id, ...r }) => {
    const card = (card_id && cardBy.get(card_id)) || (r.concept_id && pubBy.get(r.concept_id)) || null;
    const in_progress = working.filter((w) => w.concept_id === r.concept_id).map(({ concept_id: _c, ...w }) => w);
    const status: DemandGroup["status"] =
      r.open === 0 ? (r.fulfilled > 0 ? "fulfilled" : "dismissed") : in_progress.length ? "in_progress" : "open";
    return { ...r, card, in_progress, status };
  });
}

/** A visitor asks for a card (concept "Notify me" or Ask's "Request this topic"). Deduped per device. */
export async function postRequest(input: { device_token: string; concept_id?: string | null; topic?: string | null; item_code?: string | null }) {
  const key = demandKey(input);
  if (!key) throw new HttpError(400, "empty", "Tell us which topic you'd like.");
  if (input.concept_id && !(await one("select 1 from concepts where id = $1", [input.concept_id]))) throw new HttpError(400, "bad_concept", "Unknown concept.");
  const hash = hashToken(input.device_token);
  return tx(async (qb) => {
    const dup = (
      await q<{ id: string }>(
        qb,
        `select id from card_requests where device_hash = $1 and status = 'open'
            and coalesce(concept_id,'') = coalesce($2,'') and lower(trim(coalesce(topic,''))) = lower(trim(coalesce($3,''))) and upper(coalesce(item_code,'')) = upper(coalesce($4,''))`,
        [hash, input.concept_id ?? null, input.topic ?? null, input.item_code ?? null],
      )
    )[0];
    if (dup) return { id: dup.id, duplicate: true };
    const id = newId("req");
    await qb.query("insert into card_requests (id, concept_id, topic, item_code, device_hash) values ($1,$2,$3,$4,$5)", [
      id,
      input.concept_id ?? null,
      input.topic?.trim().slice(0, 200) || null,
      input.item_code?.trim().slice(0, 40) || null,
      hash,
    ]);
    const label = input.concept_id ? (await q<{ label_en: string; label_ar: string }>(qb, "select label_en, label_ar from concepts where id = $1", [input.concept_id]))[0] : null;
    await audit(qb, null, "demand.request", "card_request", id, null, { key });
    await emit("demand", "request", { id, key, concept_id: input.concept_id ?? null, topic: input.topic ?? null, label_en: label?.label_en ?? input.topic ?? input.item_code, label_ar: label?.label_ar ?? input.topic ?? input.item_code }, null, qb);
    return { id, duplicate: false };
  });
}

/** Researchers can dismiss (or reopen) a group of requests that the institution won't cover. */
export async function setGroupStatus(actorId: string, key: string, status: "dismissed" | "open") {
  const [kind, ...rest] = key.split(":");
  const value = rest.join(":");
  const cond = kind === "concept" ? "concept_id = $2" : kind === "topic" ? "concept_id is null and regexp_replace(lower(trim(topic)), '\\s+', ' ', 'g') = $2" : "concept_id is null and coalesce(trim(topic),'') = '' and upper(item_code) = $2";
  const from = status === "dismissed" ? "open" : "dismissed";
  return tx(async (qb) => {
    const rows = await q<{ id: string }>(qb, `update card_requests set status = $1 where status = '${from}' and ${cond} returning id`, [status, value]);
    await audit(qb, actorId, `demand.${status === "dismissed" ? "dismiss" : "reopen"}`, "card_request", key, null, { count: rows.length });
    await emit("demand", status === "dismissed" ? "dismissed" : "reopened", { key, count: rows.length }, actorId, qb);
    return { count: rows.length };
  });
}
