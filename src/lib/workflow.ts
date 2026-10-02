import type { Role } from "@/lib/auth";

/** Shared content workflow for cards, manuscript pages and heritage items. See SPEC §4. */
export type Status = "ai_draft" | "student_submitted" | "researcher_approved" | "published" | "returned" | "archived";
export type Decision = "submit" | "approve" | "return" | "publish" | "archive";

export const STATUS_ORDER: Status[] = ["ai_draft", "student_submitted", "researcher_approved", "published"];

const RULES: Record<Decision, { from: Status[]; to: Status; roles: Role[] }> = {
  submit: { from: ["ai_draft", "returned"], to: "student_submitted", roles: ["student", "researcher", "institution_admin"] },
  approve: { from: ["student_submitted"], to: "researcher_approved", roles: ["researcher"] },
  return: { from: ["student_submitted", "researcher_approved"], to: "returned", roles: ["researcher", "institution_admin"] },
  publish: { from: ["researcher_approved"], to: "published", roles: ["institution_admin"] },
  archive: { from: ["published"], to: "archived", roles: ["institution_admin"] },
};

export function nextStatus(decision: Decision): Status {
  return RULES[decision].to;
}

export function canTransition(role: Role, from: Status, decision: Decision): { ok: true; to: Status } | { ok: false; reason: string } {
  const r = RULES[decision];
  if (!r) return { ok: false, reason: "Unknown action." };
  if (!r.from.includes(from)) return { ok: false, reason: `This item is "${from}" — "${decision}" isn't available at this stage.` };
  if (role !== "platform_admin" && !r.roles.includes(role)) return { ok: false, reason: "Your role can't do this step." };
  return { ok: true, to: r.to };
}

/** Actions a role may take from a given status (for rendering buttons). */
export function availableDecisions(role: Role, from: Status): Decision[] {
  return (Object.keys(RULES) as Decision[]).filter((d) => canTransition(role, from, d).ok);
}

/** Four-eyes rule: the institution publisher must differ from the researcher who approved the same version. */
export function fourEyesOk(publisherId: string, approverId: string | null | undefined) {
  return !approverId || approverId !== publisherId;
}
