/**
 * Who may do what in the collaboration layer (pure; enforced on the server, mirrored in the UI), and how accepted work
 * earns learning points. Research memo §4.3/§4.4/§4.8.
 *
 * - Students transcribe, key hard words blind, suggest and comment. They never adjudicate, approve, confirm
 *   annotations or publish.
 * - Researchers assign, adjudicate, review suggestions and pages, and confirm or reject understanding annotations.
 * - Institution admins assign and publish (four eyes is enforced by the Studio core); they never edit text.
 * - Points accrue only for work accepted at the next stage, weighted by difficulty. There is no public leaderboard.
 */
import type { Role } from "@/lib/auth";
import type { Status } from "@/lib/workflow";
import { canEditText } from "../manuscripts/rules";

const any = (role: Role, roles: Role[]) => role === "platform_admin" || roles.includes(role);

export const canAssign = (role: Role) => any(role, ["researcher", "institution_admin"]);
export const canKey = (role: Role) => any(role, ["student"]);
export const canAdjudicate = (role: Role) => any(role, ["researcher"]);
export const canComment = (role: Role) => any(role, ["student", "researcher", "institution_admin"]);
export const canConfirmAnnotation = (role: Role) => any(role, ["researcher"]);
export const canScanAnnotations = (role: Role) => any(role, ["student", "researcher", "institution_admin"]);
export const canReviewPage = (role: Role) => any(role, ["researcher"]);
export const canSuggest = (role: Role, status: Status) => any(role, ["student", "researcher"]) && status !== "published" && status !== "archived";

/** Comments: the author, or a researcher / institution admin, may resolve a thread. */
export const canResolveComment = (role: Role, userId: string, authorId: string) => userId === authorId || any(role, ["researcher", "institution_admin"]);

/** Pages whose uncertain words are open for blind keying (the text is still being transcribed). */
export const KEYING_STATUSES: Status[] = ["ai_draft", "returned"];
/** Pages where a researcher may still decide a hard word (adds the review stage). */
export const ADJUDICATION_STATUSES: Status[] = ["ai_draft", "returned", "student_submitted"];

export type LineAccess = "edit" | "suggest" | "read";

/**
 * How a viewer can change a line: edit directly, propose a suggestion (page locked or owned by someone else, or the
 * stage is frozen for this role), or read only.
 */
export function lineAccess(i: { role: Role; userId: string; status: Status; lockedBy: string | null; ownerId: string | null }): LineAccess {
  const lockedByOther = !!i.lockedBy && i.lockedBy !== i.userId;
  const ownedByOther = i.role === "student" && !!i.ownerId && i.ownerId !== i.userId;
  if (canEditText(i.role, i.status) && !lockedByOther && !ownedByOther) return "edit";
  if (canSuggest(i.role, i.status)) return "suggest";
  return "read";
}

/** Who may accept or reject a suggestion: a researcher, or the page's owner (assignee) — never its own author. */
export function canReviewSuggestion(i: { role: Role; userId: string; authorId: string; ownerId: string | null; status: Status }): { ok: true } | { ok: false; reason: string } {
  if (i.userId === i.authorId) return { ok: false, reason: "You can't review your own suggestion." };
  if (i.status === "published" || i.status === "archived") return { ok: false, reason: "The page is published; its text is frozen." };
  if (any(i.role, ["researcher"])) return { ok: true };
  if (i.role === "student" && i.ownerId === i.userId && canEditText(i.role, i.status)) return { ok: true };
  return { ok: false, reason: "Only the page's owner or a researcher can decide on suggestions." };
}

/** Four eyes for adjudication: a researcher does not decide a word they keyed themselves. */
export function canDecideHardWord(i: { role: Role; userId: string; keyers: string[]; status: Status }): { ok: true } | { ok: false; reason: string } {
  if (!canAdjudicate(i.role)) return { ok: false, reason: "Only a researcher can decide a disputed word." };
  if (i.keyers.includes(i.userId)) return { ok: false, reason: "Four eyes: you keyed this word yourself." };
  if (!ADJUDICATION_STATUSES.includes(i.status)) return { ok: false, reason: "This page is past review; its text is frozen." };
  return { ok: true };
}

// ───────────────────────────────────────────── Points

export type AwardReason = "ms_line_accepted" | "ms_keying_accepted" | "ms_suggestion_accepted";

const HARD_ZONES = new Set(["margin", "colophon", "seal", "title", "rubric", "catchword", "other"]);
/** Margins and paratexts are harder than the main text, so they count more. */
export const isHardZone = (zone: string | null | undefined) => !!zone && HARD_ZONES.has(zone);

export const POINTS: Record<AwardReason, { main: number; hard: number }> = {
  ms_line_accepted: { main: 2, hard: 4 },
  ms_keying_accepted: { main: 1, hard: 2 },
  ms_suggestion_accepted: { main: 2, hard: 3 },
};

export const pointsFor = (reason: AwardReason, zone: string | null | undefined) => (isHardZone(zone) ? POINTS[reason].hard : POINTS[reason].main);

export interface Award {
  user_id: string;
  reason: AwardReason;
  ref: string;
  delta: number;
}

/** Deduplicate a batch of awards (the database also enforces one row per user, reason and ref). */
export function uniqueAwards(awards: Award[]): Award[] {
  const seen = new Set<string>();
  return awards.filter((a) => {
    const k = `${a.user_id}|${a.reason}|${a.ref}`;
    if (seen.has(k) || a.delta <= 0) return false;
    seen.add(k);
    return true;
  });
}

// ───────────────────────────────────────────── Mentions

export interface Participant {
  id: string;
  name_en: string;
  name_ar: string;
}

/** Users mentioned as «@Name» in a comment, limited to the page's participants. */
export function extractMentions(body: string, participants: Participant[]): string[] {
  const text = body.normalize("NFC");
  const hit = (name: string) => {
    if (!name) return false;
    const i = text.indexOf(`@${name}`);
    if (i < 0) return false;
    const next = text[i + name.length + 1];
    return next === undefined || !/[\p{L}\p{N}]/u.test(next);
  };
  return participants.filter((p) => hit(p.name_en) || hit(p.name_ar)).map((p) => p.id);
}

/** Initials for public credits (students are shown by initials only): «سارة الحربي» → «س. ح.», "Sara Al-Harbi" → "S. A.". */
export function initials(name: string): string {
  return name
    .replace(/^(Dr\.?|د\.)\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => `${[...w.replace(/^(?:Al-|al-|ال)(?=\S{2,})/u, "")][0] ?? w[0]}.`)
    .join(" ");
}
