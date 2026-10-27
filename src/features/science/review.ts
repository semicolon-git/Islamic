import "server-only";
import { one, q, sql, tx } from "@/lib/db";
import { audit, emit } from "@/lib/events";
import { HttpError } from "@/lib/http";
import type { SessionUser } from "@/lib/auth";
import type { Chain, ChainReview } from "./chains";

/**
 * Scholarly review of contribution chains: a researcher checks the steps against their sources and approves (or returns
 * it with a note); then an institution admin who is NOT that researcher signs it off. Only then does the visitor see
 * "Reviewed by <institution>" instead of "every step sourced · not yet reviewed".
 */

export type ChainReviewState = "pending" | "returned" | "approved" | "reviewed";
export type ChainDecision = "approve" | "return" | "publish";

export interface ChainReviewRow {
  id: string;
  name_en: string;
  name_ar: string;
  review: ChainReview;
  state: ChainReviewState;
  last: { decision: string; note: string | null; reviewer_id: string | null; reviewer_en: string | null; reviewer_ar: string | null; at: string } | null;
}

const stateOf = (review: ChainReview | null | undefined, last: { decision: string } | null): ChainReviewState =>
  review?.status === "reviewed" ? "reviewed" : last?.decision === "approve" ? "approved" : last?.decision === "return" ? "returned" : "pending";

const LAST = `(select json_build_object('decision', r.decision, 'note', r.note, 'reviewer_id', r.reviewer_id, 'reviewer_en', u.display_name_en,
                 'reviewer_ar', u.display_name_ar, 'at', r.created_at)
            from reviews r left join users u on u.id = r.reviewer_id
           where r.entity_type = 'chain' and r.entity_id = e.id order by r.created_at desc, r.id desc limit 1)`;

export async function chainsForReview(): Promise<ChainReviewRow[]> {
  const rows = await sql<{ id: string; name_en: string; name_ar: string; review: ChainReview | null; last: ChainReviewRow["last"] }>(
    `select e.id, e.name_en, e.name_ar, e.data->'review' as review, ${LAST} as last
       from science_entries e where e.kind = 'chain' and e.status = 'approved' order by e.sort, e.id`,
  );
  return rows.map((r) => ({ ...r, review: r.review ?? { status: "sourced" }, state: stateOf(r.review, r.last) }));
}

export async function chainForReview(id: string): Promise<(ChainReviewRow & { chain: Chain }) | null> {
  const r = await one<{ id: string; name_en: string; name_ar: string; data: Chain; last: ChainReviewRow["last"] }>(
    `select e.id, e.name_en, e.name_ar, e.data, ${LAST} as last from science_entries e where e.kind = 'chain' and e.id = $1`,
    [id],
  );
  if (!r) return null;
  const review = r.data.review ?? { status: "sourced" as const };
  return { id: r.id, name_en: r.name_en, name_ar: r.name_ar, review, state: stateOf(review, r.last), last: r.last, chain: r.data };
}

export async function reviewChain(user: SessionUser, id: string, decision: ChainDecision, note: string | null) {
  return tx(async (qb) => {
    const [row] = await q<{ data: Chain }>(qb, "select data from science_entries where kind = 'chain' and id = $1 for update", [id]);
    if (!row) throw new HttpError(404, "not_found", "No such chain.");
    const [last] = await q<{ decision: string; reviewer_id: string | null }>(
      qb, "select decision, reviewer_id from reviews where entity_type = 'chain' and entity_id = $1 order by created_at desc, id desc limit 1", [id],
    );
    const before = stateOf(row.data.review, last ?? null);
    if (before === "reviewed") throw new HttpError(409, "already_reviewed", "This chain is already reviewed.");
    const admin = user.role === "platform_admin";
    let after: ChainReviewState;
    if (decision === "approve" || decision === "return") {
      if (user.role !== "researcher" && !admin) throw new HttpError(403, "forbidden", "A researcher checks the chain against its sources.");
      if (decision === "return" && !note?.trim()) throw new HttpError(400, "note_required", "Say what needs fixing.");
      after = decision === "approve" ? "approved" : "returned";
    } else {
      if (user.role !== "institution_admin" && !admin) throw new HttpError(403, "forbidden", "An institution admin signs off.");
      if (before !== "approved" || !last?.reviewer_id) throw new HttpError(409, "needs_approval", "A researcher must approve the chain first.");
      if (last.reviewer_id === user.id) throw new HttpError(409, "four_eyes", "Signing off needs a different person from the researcher who approved it.");
      after = "reviewed";
      const review: ChainReview = {
        status: "reviewed",
        by_en: user.institution_name_en ?? user.display_name_en,
        by_ar: user.institution_name_ar ?? user.display_name_ar,
        on: new Date().toISOString().slice(0, 10),
      };
      // updated_by marks the entry as edited in the portal, so a re-seed never overwrites the review.
      await qb.query("update science_entries set data = jsonb_set(data, '{review}', $2::jsonb), updated_by = $3, updated_at = now() where kind = 'chain' and id = $1", [id, JSON.stringify(review), user.id]);
    }
    await qb.query(
      `insert into reviews (entity_type, entity_id, reviewer_id, from_status, to_status, decision, note) values ('chain',$1,$2,$3,$4,$5,$6)`,
      [id, user.id, before, after, decision, note?.trim() || null],
    );
    await audit(qb, user.id, `chain.${decision}`, "chain", id, { state: before }, { state: after });
    await emit("chains", "chain.review", { id, state: after }, user.id, qb);
    return { id, state: after };
  });
}
