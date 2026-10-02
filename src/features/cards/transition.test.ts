import { describe, expect, it } from "vitest";
import { effectiveStatus, isEditable, planTransition, POINTS_APPROVED, type TransitionInput } from "./transition";

const sara = { id: "u_sara", role: "student" as const, institution_id: "inst_uni" };
const huda = { id: "u_huda", role: "researcher" as const, institution_id: "inst_uni" };
const noura = { id: "u_noura", role: "institution_admin" as const, institution_id: "inst_uni" };
const khalid = { id: "u_khalid", role: "institution_admin" as const, institution_id: "inst_lib" };
const admin = { id: "u_admin", role: "platform_admin" as const, institution_id: null };
const card = (status: TransitionInput["card"]["status"]) => ({ status, institution_id: "inst_uni" });
const plan = (i: Partial<TransitionInput>) => planTransition({ actor: sara, card: card("ai_draft"), decision: "submit", checklistOk: true, ...i });

describe("card workflow transitions", () => {
  it("walks the full chain: submit → return → submit → approve → publish", () => {
    expect(plan({})).toEqual({ ok: true, to: "student_submitted", award: null });
    expect(plan({ actor: huda, card: card("student_submitted"), decision: "return", note: "Add the Arabic explanation." })).toMatchObject({ ok: true, to: "returned" });
    expect(plan({ card: card("returned") })).toMatchObject({ ok: true, to: "student_submitted" });
    expect(plan({ actor: huda, card: card("student_submitted"), decision: "approve", submitter: sara })).toEqual({
      ok: true,
      to: "researcher_approved",
      award: { userId: "u_sara", delta: POINTS_APPROVED, reason: "card_approved" },
    });
    expect(plan({ actor: noura, card: card("researcher_approved"), decision: "publish", approverId: "u_huda" })).toEqual({ ok: true, to: "published", award: null });
    expect(plan({ actor: noura, card: card("published"), decision: "archive" })).toMatchObject({ ok: true, to: "archived" });
  });

  it("awards +15 only to students", () => {
    const r = plan({ actor: huda, card: card("student_submitted"), decision: "approve", submitter: { id: "u_x", role: "researcher" } });
    expect(r).toEqual({ ok: true, to: "researcher_approved", award: null });
    expect(POINTS_APPROVED).toBe(15);
  });

  it("enforces four eyes on publish", () => {
    const r = plan({ actor: admin, card: card("researcher_approved"), decision: "publish", approverId: "u_admin" });
    expect(r).toMatchObject({ ok: false, status: 409, code: "four_eyes" });
  });

  it("blocks self-approval", () => {
    const r = plan({ actor: admin, card: card("student_submitted"), decision: "approve", submitter: { id: "u_admin", role: "platform_admin" } });
    expect(r).toMatchObject({ ok: false, code: "self_review" });
  });

  it("rejects wrong roles and wrong stages", () => {
    expect(plan({ actor: sara, card: card("researcher_approved"), decision: "publish" })).toMatchObject({ ok: false, status: 403, code: "forbidden" });
    expect(plan({ actor: sara, card: card("student_submitted"), decision: "approve" })).toMatchObject({ ok: false, status: 403 });
    expect(plan({ actor: noura, card: card("student_submitted"), decision: "publish" })).toMatchObject({ ok: false, status: 409, code: "wrong_stage" });
  });

  it("keeps institutions apart", () => {
    expect(plan({ actor: khalid, card: card("researcher_approved"), decision: "publish", approverId: "u_huda" })).toMatchObject({ ok: false, code: "other_institution" });
  });

  it("requires a note to return and a passing checklist to move forward", () => {
    expect(plan({ actor: huda, card: card("student_submitted"), decision: "return", note: " " })).toMatchObject({ ok: false, code: "note_required" });
    expect(plan({ checklistOk: false })).toMatchObject({ ok: false, status: 422, code: "checklist" });
    expect(plan({ actor: noura, card: card("researcher_approved"), decision: "publish", approverId: "u_huda", checklistOk: false })).toMatchObject({ ok: false, code: "checklist" });
    // returning never needs the checklist
    expect(plan({ actor: huda, card: card("student_submitted"), decision: "return", note: "Fix it", checklistOk: false })).toMatchObject({ ok: true });
  });

  it("derives the effective stage of a revision", () => {
    expect(effectiveStatus({ status: "published", revision_status: "ai_draft" })).toBe("ai_draft");
    expect(effectiveStatus({ status: "published", revision_status: null })).toBe("published");
    expect(effectiveStatus({ status: "returned", revision_status: null })).toBe("returned");
  });

  it("knows what is editable", () => {
    expect(isEditable("ai_draft", "student")).toBe(true);
    expect(isEditable("returned", "student")).toBe(true);
    expect(isEditable("student_submitted", "researcher")).toBe(false);
    expect(isEditable("published", "researcher")).toBe(true);
    expect(isEditable("published", "student")).toBe(false);
    expect(isEditable("ai_draft", "specialist")).toBe(false);
  });
});
