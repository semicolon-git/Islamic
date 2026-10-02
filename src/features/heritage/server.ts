import "server-only";
import { one, q, sql, tx, type Queryable } from "@/lib/db";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import { matchText } from "@/lib/quran";
import { canTransition, fourEyesOk, type Decision, type Status } from "@/lib/workflow";
import type { SessionUser } from "@/lib/auth";
import { nextItemCode } from "./codes";
import { proposedKeys } from "./inscription-view";
import type { InscriptionRow, ItemRow } from "./types";
import type { ItemInput } from "./schemas";

/** Points a reader earns when a researcher confirms their inscription reading. */
export const INSCRIPTION_POINTS = 10;
const EDITABLE: Status[] = ["ai_draft", "returned", "student_submitted"];

const scopeFor = (item: { id: string; item_code: string | null }) => `item:${item.item_code ?? item.id}`;

async function lockItem(qb: Queryable, id: string) {
  const [row] = await q<ItemRow>(qb, "select * from heritage_items where id = $1 for update", [id]);
  if (!row) throw new HttpError(404, "not_found", "This item doesn't exist.");
  return row;
}

async function checkRefs(qb: Queryable, input: ItemInput) {
  if (input.venue_id && !(await q(qb, "select 1 from venues where id=$1", [input.venue_id])).length)
    throw new HttpError(400, "bad_venue", "Unknown venue.");
  if (input.concept_id && !(await q(qb, "select 1 from concepts where id=$1", [input.concept_id])).length)
    throw new HttpError(400, "bad_concept", "Unknown concept.");
  if (input.card_id && !(await q(qb, "select 1 from cards where id=$1", [input.card_id])).length)
    throw new HttpError(400, "bad_card", "Unknown card.");
}

/** Institution that owns an item: the venue's institution, else the registering user's. */
async function institutionFor(qb: Queryable, venueId: string | null, user: SessionUser) {
  if (venueId) {
    const [v] = await q<{ institution_id: string | null }>(qb, "select institution_id from venues where id=$1", [venueId]);
    if (v?.institution_id) return v.institution_id;
  }
  return user.institution_id;
}

export async function createItem(user: SessionUser, input: ItemInput): Promise<{ id: string }> {
  return tx(async (qb) => {
    await checkRefs(qb, input);
    const id = newId("item");
    const inst = await institutionFor(qb, input.venue_id, user);
    await qb.query(
      `insert into heritage_items (id, item_code, institution_id, venue_id, kind, concept_id, title_en, title_ar,
         date_text, date_text_ar, origin, origin_ar, material, material_ar, description_en, description_ar,
         images, card_id, manuscript_id, status, created_by)
       values ($1,null,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'ai_draft',$19)`,
      [
        id, inst, input.venue_id, input.kind, input.concept_id, input.title_en, input.title_ar,
        input.date_text, input.date_text_ar, input.origin, input.origin_ar, input.material, input.material_ar,
        input.description_en, input.description_ar, JSON.stringify(input.images), input.card_id, input.manuscript_id, user.id,
      ],
    );
    await audit(qb, user.id, "item.create", "item", id, null, input);
    await emit("items", "item.created", { id }, user.id, qb);
    return { id };
  });
}

export async function updateItem(user: SessionUser, id: string, input: ItemInput) {
  return tx(async (qb) => {
    const before = await lockItem(qb, id);
    if (!EDITABLE.includes(before.status)) throw new HttpError(409, "locked", "Published or approved items can't be edited.");
    await checkRefs(qb, input);
    const inst = await institutionFor(qb, input.venue_id, user);
    await qb.query(
      `update heritage_items set institution_id=coalesce($2, institution_id), venue_id=$3, kind=$4, concept_id=$5, title_en=$6, title_ar=$7,
         date_text=$8, date_text_ar=$9, origin=$10, origin_ar=$11, material=$12, material_ar=$13,
         description_en=$14, description_ar=$15, images=$16, card_id=$17, manuscript_id=$18, updated_at=now()
       where id=$1`,
      [
        id, inst, input.venue_id, input.kind, input.concept_id, input.title_en, input.title_ar,
        input.date_text, input.date_text_ar, input.origin, input.origin_ar, input.material, input.material_ar,
        input.description_en, input.description_ar, JSON.stringify(input.images), input.card_id, input.manuscript_id,
      ],
    );
    await audit(qb, user.id, "item.update", "item", id, before, input);
    await emit(scopeFor(before), "item.updated", { id }, user.id, qb);
    await emit("items", "item.updated", { id }, user.id, qb);
    return { id };
  });
}

export async function transitionItem(user: SessionUser, id: string, decision: Decision, note: string | null) {
  return tx(async (qb) => {
    const item = await lockItem(qb, id);
    const t = canTransition(user.role, item.status, decision);
    if (!t.ok) throw new HttpError(409, "bad_transition", t.reason);
    if (decision === "return" && !note) throw new HttpError(400, "note_required", "Add a note so the student knows what to change.");
    let code = item.item_code;
    if (decision === "publish") {
      if (user.role === "institution_admin" && item.institution_id && user.institution_id !== item.institution_id)
        throw new HttpError(403, "other_institution", "Only the institution that holds this item can publish it.");
      const [approval] = await q<{ reviewer_id: string }>(
        qb,
        "select reviewer_id from reviews where entity_type='item' and entity_id=$1 and decision='approve' order by created_at desc, id desc limit 1",
        [id],
      );
      if (!fourEyesOk(user.id, approval?.reviewer_id)) throw new HttpError(409, "four_eyes", "Publishing needs a different person from the researcher who approved it.");
      const images = (item.images ?? []) as { credit?: string; license?: string }[];
      if (!images.length) throw new HttpError(409, "no_images", "Add at least one image with its licence and credit line before publishing.");
      if (images.some((im) => !im.credit?.trim() || !im.license?.trim()))
        throw new HttpError(409, "rights_missing", "Every image needs a licence and a credit line.");
      if (!code) {
        const existing = await q<{ item_code: string }>(qb, "select item_code from heritage_items where item_code is not null");
        code = nextItemCode(item.kind, existing.map((r) => r.item_code));
      }
    }
    await qb.query(
      `update heritage_items set status=$2, item_code=$3, updated_at=now(),
         published_at = case when $2 = 'published' then now() else published_at end where id=$1`,
      [id, t.to, code],
    );
    await qb.query(
      `insert into reviews (entity_type, entity_id, version, reviewer_id, from_status, to_status, decision, note)
       values ('item',$1,null,$2,$3,$4,$5,$6)`,
      [id, user.id, item.status, t.to, decision, note],
    );
    await audit(qb, user.id, `item.${decision}`, "item", id, { status: item.status }, { status: t.to, item_code: code });
    const payload = { id, status: t.to, item_code: code };
    await emit(`item:${code ?? id}`, "item.status", payload, user.id, qb);
    if (code && !item.item_code) await emit(`item:${id}`, "item.status", payload, user.id, qb);
    await emit("items", "item.status", payload, user.id, qb);
    return payload;
  });
}

export interface ItemReview {
  id: number;
  decision: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
  reviewer_id: string | null;
  reviewer_name_en: string | null;
  reviewer_name_ar: string | null;
  reviewer_role: string | null;
}

export async function itemHistory(id: string): Promise<ItemReview[]> {
  return sql<ItemReview>(
    `select r.id::int as id, r.decision, r.from_status, r.to_status, r.note, r.created_at, r.reviewer_id,
            u.display_name_en as reviewer_name_en, u.display_name_ar as reviewer_name_ar, u.role as reviewer_role
       from reviews r left join users u on u.id = r.reviewer_id
      where r.entity_type='item' and r.entity_id=$1 order by r.created_at asc, r.id asc`,
    [id],
  );
}

export async function lastApprover(id: string): Promise<string | null> {
  const r = await one<{ reviewer_id: string }>(
    "select reviewer_id from reviews where entity_type='item' and entity_id=$1 and decision='approve' order by created_at desc, id desc limit 1",
    [id],
  );
  return r?.reviewer_id ?? null;
}

// ───────────────────────── Inscriptions (student reads → matcher proposes → student links → researcher confirms)

export async function addInscription(user: SessionUser, itemId: string, transcription: string, verseKeys: string[]) {
  const match = await matchText(transcription);
  const allowed = new Set(proposedKeys(match));
  if (match.status === "near") match.candidates.forEach((c) => c.verses.forEach((k) => allowed.add(k)));
  const keys = verseKeys.filter((k) => allowed.has(k));
  return tx(async (qb) => {
    const [item] = await q<{ id: string; item_code: string | null }>(qb, "select id, item_code from heritage_items where id=$1", [itemId]);
    if (!item) throw new HttpError(404, "not_found", "This item doesn't exist.");
    const id = newId("ins");
    await qb.query(
      `insert into inscriptions (id, item_id, transcription, match, verse_keys, author_id, status)
       values ($1,$2,$3,$4,$5,$6,'suggested')`,
      [id, itemId, transcription, JSON.stringify(match), keys, user.id],
    );
    await audit(qb, user.id, "inscription.create", "inscription", id, null, { item_id: itemId, transcription, verse_keys: keys, match: match.status });
    await emit(scopeFor(item), "inscription.created", { id, item_id: itemId }, user.id, qb);
    return { id, match_status: match.status, verse_keys: keys };
  });
}

export async function actOnInscription(
  user: SessionUser,
  inscriptionId: string,
  action: { action: "link"; verse_keys: string[] } | { action: "confirm" | "reject"; note: string | null },
) {
  return tx(async (qb) => {
    const [ins] = await q<InscriptionRow & { item_code: string | null }>(
      qb,
      `select n.*, h.item_code from inscriptions n join heritage_items h on h.id = n.item_id where n.id=$1 for update of n`,
      [inscriptionId],
    );
    if (!ins) throw new HttpError(404, "not_found", "This inscription doesn't exist.");
    if (ins.status !== "suggested") throw new HttpError(409, "already_reviewed", "This reading has already been reviewed.");
    const scope = scopeFor({ id: ins.item_id, item_code: ins.item_code });
    if (action.action === "link") {
      if (user.role !== "platform_admin" && user.role !== "researcher" && user.id !== ins.author_id)
        throw new HttpError(403, "forbidden", "Only the reader or a researcher can change the linked verses.");
      const match = ins.match as Parameters<typeof proposedKeys>[0] | null;
      const allowed = new Set(match ? proposedKeys(match) : []);
      if (match?.status === "near") match.candidates.forEach((c) => c.verses.forEach((k) => allowed.add(k)));
      const keys = action.verse_keys.filter((k) => allowed.has(k));
      await qb.query("update inscriptions set verse_keys=$2 where id=$1", [inscriptionId, keys]);
      await audit(qb, user.id, "inscription.link", "inscription", inscriptionId, { verse_keys: ins.verse_keys }, { verse_keys: keys });
      await emit(scope, "inscription.linked", { id: inscriptionId }, user.id, qb);
      return { id: inscriptionId, verse_keys: keys };
    }
    if (user.role !== "researcher" && user.role !== "platform_admin") throw new HttpError(403, "forbidden", "A researcher confirms inscription readings.");
    if (ins.author_id === user.id) throw new HttpError(409, "four_eyes", "Someone other than the reader confirms.");
    const status = action.action === "confirm" ? "confirmed" : "rejected";
    await qb.query(
      `update inscriptions set status=$2, verified_by=$3, note=$4, confirmed_at=case when $2='confirmed' then now() else null end where id=$1`,
      [inscriptionId, status, user.id, action.note],
    );
    await qb.query(
      `insert into reviews (entity_type, entity_id, reviewer_id, from_status, to_status, decision, note)
       values ('item',$1,$2,'suggested',$3,$4,$5)`,
      [ins.item_id, user.id, status, action.action === "confirm" ? "accept" : "reject", action.note ?? `inscription ${inscriptionId}`],
    );
    if (status === "confirmed" && ins.author_id) {
      await qb.query("insert into points_ledger (user_id, delta, reason, ref) values ($1,$2,'inscription_confirmed',$3)", [ins.author_id, INSCRIPTION_POINTS, inscriptionId]);
      await qb.query("update users set points = points + $2 where id=$1", [ins.author_id, INSCRIPTION_POINTS]);
    }
    await audit(qb, user.id, `inscription.${action.action}`, "inscription", inscriptionId, { status: "suggested" }, { status });
    await emit(scope, `inscription.${status}`, { id: inscriptionId }, user.id, qb);
    return { id: inscriptionId, status };
  });
}
