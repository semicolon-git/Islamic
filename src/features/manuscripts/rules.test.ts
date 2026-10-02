import { describe, expect, it } from "vitest";
import { canEditLayout, canEditText, canonicalJson, checkPageDecision, saveKind, type DecisionInput } from "./rules";

const base: DecisionInput = {
  role: "student", userId: "u_sara", status: "ai_draft", decision: "submit", flagged: false,
  submitterId: null, approverId: null, studentAuthors: ["u_sara"], humanLines: 3, sameInstitution: false,
};

describe("who may edit", () => {
  it("students and researchers transcribe; institution reviewers never edit text", () => {
    expect(canEditText("student", "ai_draft")).toBe(true);
    expect(canEditText("researcher", "returned")).toBe(true);
    expect(canEditText("institution_admin", "ai_draft")).toBe(false);
    expect(canEditText("specialist", "ai_draft")).toBe(false);
  });
  it("only researchers edit while a page is under review; approved and published text is frozen", () => {
    expect(canEditText("student", "student_submitted")).toBe(false);
    expect(canEditText("researcher", "student_submitted")).toBe(true);
    expect(canEditText("researcher", "researcher_approved")).toBe(false);
    expect(canEditText("platform_admin", "published")).toBe(false);
  });
  it("layout changes only while transcribing", () => {
    expect(canEditLayout("student", "ai_draft")).toBe(true);
    expect(canEditLayout("institution_admin", "returned")).toBe(true);
    expect(canEditLayout("researcher", "published")).toBe(false);
  });
  it("version kind by role", () => {
    expect(saveKind("student")).toBe("student");
    expect(saveKind("researcher")).toBe("researcher");
  });
});

describe("page decisions", () => {
  it("submit needs at least one human-checked line", () => {
    expect(checkPageDecision(base)).toEqual({ ok: true, to: "student_submitted" });
    expect(checkPageDecision({ ...base, humanLines: 0 })).toMatchObject({ ok: false, code: "nothing_to_submit" });
  });
  it("a problematic page is paused (except returning it)", () => {
    expect(checkPageDecision({ ...base, flagged: true })).toMatchObject({ ok: false, code: "flagged" });
    expect(checkPageDecision({ ...base, role: "researcher", status: "student_submitted", decision: "return", flagged: true, note: "x" }).ok).toBe(true);
  });
  it("return requires a note", () => {
    const r = { ...base, role: "researcher" as const, status: "student_submitted" as const, decision: "return" as const };
    expect(checkPageDecision(r)).toMatchObject({ ok: false, code: "note_required" });
    expect(checkPageDecision({ ...r, note: "check line 4" }).ok).toBe(true);
  });
  it("the reviewer is not the transcriber or submitter", () => {
    const a = { ...base, role: "researcher" as const, userId: "u_huda", status: "student_submitted" as const, decision: "approve" as const, submitterId: "u_sara" };
    expect(checkPageDecision(a)).toEqual({ ok: true, to: "researcher_approved" });
    expect(checkPageDecision({ ...a, userId: "u_sara" })).toMatchObject({ ok: false });
    expect(checkPageDecision({ ...a, role: "platform_admin", userId: "u_admin", submitterId: "u_admin" })).toMatchObject({ ok: false, code: "four_eyes" });
    expect(checkPageDecision({ ...a, role: "platform_admin", userId: "u_admin", studentAuthors: ["u_admin"] })).toMatchObject({ ok: false, code: "four_eyes" });
  });
  it("the publisher is not the approving researcher, and belongs to the holding institution", () => {
    const p = { ...base, role: "institution_admin" as const, userId: "u_khalid", status: "researcher_approved" as const, decision: "publish" as const, approverId: "u_huda", sameInstitution: true };
    expect(checkPageDecision(p)).toEqual({ ok: true, to: "published" });
    expect(checkPageDecision({ ...p, sameInstitution: false })).toMatchObject({ ok: false, code: "wrong_institution" });
    expect(checkPageDecision({ ...p, role: "platform_admin", userId: "u_admin", approverId: "u_admin" })).toMatchObject({ ok: false, code: "four_eyes" });
    expect(checkPageDecision({ ...p, role: "researcher", userId: "u_huda" })).toMatchObject({ ok: false, code: "not_allowed" });
  });
  it("cannot skip stages", () => {
    expect(checkPageDecision({ ...base, role: "institution_admin", status: "student_submitted", decision: "publish", sameInstitution: true })).toMatchObject({ ok: false, code: "not_allowed" });
  });
});

describe("canonical JSON (content hash input)", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(canonicalJson({ a: [{ x: 1, y: 2 }], b: 1 }));
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });
});
