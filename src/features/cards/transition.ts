import type { Role } from "@/lib/auth";
import { canTransition, fourEyesOk, type Decision, type Status } from "@/lib/workflow";

/** Learning points a student earns when a researcher approves their submission. */
export const POINTS_APPROVED = 15;

export interface TransitionInput {
  actor: { id: string; role: Role; institution_id: string | null };
  card: { status: Status; institution_id: string | null };
  decision: Decision;
  note?: string | null;
  /** Who submitted the version being reviewed (latest "submit" review). */
  submitter?: { id: string; role: Role } | null;
  /** Who approved the current version as researcher (latest "approve" review for this version). */
  approverId?: string | null;
  checklistOk: boolean;
}

export type TransitionPlan =
  | { ok: true; to: Status; award: { userId: string; delta: number; reason: string } | null }
  | { ok: false; status: 400 | 403 | 409 | 422; code: string; reason: string };

/** Decide whether a workflow action is allowed and what it causes. Pure; the API runs it inside the transaction. */
export function planTransition(i: TransitionInput): TransitionPlan {
  const t = canTransition(i.actor.role, i.card.status, i.decision);
  if (!t.ok) {
    const forbidden = t.reason.startsWith("Your role");
    return { ok: false, status: forbidden ? 403 : 409, code: forbidden ? "forbidden" : "wrong_stage", reason: t.reason };
  }
  if (i.actor.role !== "platform_admin" && i.card.institution_id && i.actor.institution_id !== i.card.institution_id)
    return { ok: false, status: 403, code: "other_institution", reason: "This card belongs to another institution." };
  if (i.decision === "return" && (i.note ?? "").trim().length < 3)
    return { ok: false, status: 400, code: "note_required", reason: "Write a short note so the author knows what to fix." };
  if ((i.decision === "submit" || i.decision === "approve" || i.decision === "publish") && !i.checklistOk)
    return { ok: false, status: 422, code: "checklist", reason: "The validation checklist must pass first." };
  if (i.decision === "approve" && i.submitter && i.submitter.id === i.actor.id)
    return { ok: false, status: 409, code: "self_review", reason: "You submitted this version — another researcher must review it." };
  if (i.decision === "publish" && !fourEyesOk(i.actor.id, i.approverId))
    return { ok: false, status: 409, code: "four_eyes", reason: "Four-eyes rule: the person who approved this version as researcher can't also publish it." };

  const award =
    i.decision === "approve" && i.submitter?.role === "student"
      ? { userId: i.submitter.id, delta: POINTS_APPROVED, reason: "card_approved" }
      : null;
  return { ok: true, to: t.to, award };
}

/** Workflow stage of a card for review purposes: an in-progress revision of a published card has its own stage. */
export function effectiveStatus(card: { status: Status; revision_status?: Status | null }): Status {
  return card.status === "published" && card.revision_status ? card.revision_status : card.status;
}

/** Content can be edited only while it is a draft or has been returned; a published card starts a revision. */
export function isEditable(status: Status, role: Role) {
  if (role === "specialist") return false;
  return status === "ai_draft" || status === "returned" || (status === "published" && role !== "student");
}
