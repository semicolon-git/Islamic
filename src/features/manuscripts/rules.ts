/**
 * Who may do what in the Studio (pure; enforced on the server, mirrored in the UI).
 * Research memo §4.3/§4.4: students edit their working text, researchers edit directly or review,
 * institution users never edit text (they return or publish), a page is approved by someone who did not transcribe
 * or submit it, and published by someone other than the approving researcher (four eyes). A "Problematic" flag
 * pauses the workflow until a researcher resolves it.
 */
import type { Role } from "@/lib/auth";
import { canTransition, fourEyesOk, type Decision, type Status } from "@/lib/workflow";
import type { VersionKind } from "./types";

const TEXT_ROLES: Role[] = ["student", "researcher", "platform_admin"];

export function canEditText(role: Role, status: Status): boolean {
  if (!TEXT_ROLES.includes(role)) return false;
  if (status === "ai_draft" || status === "returned") return true;
  if (status === "student_submitted") return role === "researcher" || role === "platform_admin";
  return false; // researcher_approved / published / archived: the text is frozen
}

export function canEditLayout(role: Role, status: Status): boolean {
  if (role === "specialist") return false;
  return status === "ai_draft" || status === "returned";
}

export const canSeeEvaluation = (role: Role) => role === "researcher" || role === "institution_admin" || role === "platform_admin";
export const canRunDraft = (role: Role, status: Status) => canEditText(role, status) || (role === "institution_admin" && (status === "ai_draft" || status === "returned"));
export const canResolveFlag = (role: Role) => role === "researcher" || role === "institution_admin" || role === "platform_admin";
export const canApproveLine = (role: Role) => role === "researcher" || role === "platform_admin";
export const canCreateManuscript = (role: Role) => role === "researcher" || role === "institution_admin" || role === "platform_admin";

/** Version kind recorded for a human save. */
export const saveKind = (role: Role): VersionKind => (role === "student" ? "student" : "researcher");

export interface DecisionInput {
  role: Role;
  userId: string;
  status: Status;
  decision: Decision;
  flagged: boolean;
  note?: string;
  /** Who submitted the current round (latest submit review). */
  submitterId: string | null;
  /** Who approved the current round (latest approve review). */
  approverId: string | null;
  /** Authors of student-kind line versions on this page. */
  studentAuthors: string[];
  /** Lines with at least one human version. */
  humanLines: number;
  /** The user belongs to the manuscript's institution (needed to publish). */
  sameInstitution: boolean;
}

export type DecisionCheck = { ok: true; to: Status } | { ok: false; code: string; reason: string };

export function checkPageDecision(i: DecisionInput): DecisionCheck {
  const base = canTransition(i.role, i.status, i.decision);
  if (!base.ok) return { ok: false, code: "not_allowed", reason: base.reason };
  if (i.flagged && i.decision !== "return") return { ok: false, code: "flagged", reason: "This page is marked as problematic. A researcher must resolve the flag first." };
  if (i.decision === "submit" && i.humanLines === 0) return { ok: false, code: "nothing_to_submit", reason: "Transcribe or check at least one line before submitting." };
  if (i.decision === "return" && !i.note?.trim()) return { ok: false, code: "note_required", reason: "Say what needs another look: a note is required to return a page." };
  if (i.decision === "approve") {
    if (i.submitterId === i.userId || i.studentAuthors.includes(i.userId))
      return { ok: false, code: "four_eyes", reason: "Four eyes: the reviewer must be someone other than the person who transcribed or submitted this page." };
  }
  if (i.decision === "publish") {
    if (!fourEyesOk(i.userId, i.approverId))
      return { ok: false, code: "four_eyes", reason: "Four eyes: the institution approval must come from someone other than the researcher who approved this page." };
    if (!i.sameInstitution && i.role !== "platform_admin")
      return { ok: false, code: "wrong_institution", reason: "Only the holding institution can publish this page." };
  }
  return { ok: true, to: base.to };
}

/** Canonical JSON (sorted keys) for content hashing of a frozen publication. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
