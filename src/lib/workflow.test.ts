import { describe, expect, it } from "vitest";
import { availableDecisions, canTransition, fourEyesOk } from "./workflow";

describe("workflow", () => {
  it("follows the four-stage chain", () => {
    expect(canTransition("student", "ai_draft", "submit")).toEqual({ ok: true, to: "student_submitted" });
    expect(canTransition("researcher", "student_submitted", "approve")).toEqual({ ok: true, to: "researcher_approved" });
    expect(canTransition("institution_admin", "researcher_approved", "publish")).toEqual({ ok: true, to: "published" });
  });
  it("blocks skipping stages and wrong roles", () => {
    expect(canTransition("institution_admin", "student_submitted", "publish").ok).toBe(false);
    expect(canTransition("student", "student_submitted", "approve").ok).toBe(false);
    expect(canTransition("researcher", "researcher_approved", "publish").ok).toBe(false);
  });
  it("lists available decisions", () => {
    expect(availableDecisions("researcher", "student_submitted").sort()).toEqual(["approve", "return"]);
    expect(availableDecisions("student", "returned")).toEqual(["submit"]);
  });
  it("enforces four eyes", () => {
    expect(fourEyesOk("u1", "u1")).toBe(false);
    expect(fourEyesOk("u2", "u1")).toBe(true);
  });
});
