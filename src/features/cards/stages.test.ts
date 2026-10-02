import { describe, expect, it } from "vitest";
import { workflowSteps, type ReviewLike } from "./stages";

const r = (decision: string, at: string, who: string, note: string | null = null): ReviewLike => ({ decision, created_at: at, reviewer_en: who, reviewer_ar: who, note, version: 1 });
const created = { at: "2026-10-01T08:00:00Z", who_en: "Sara", who_ar: "سارة" };
const states = (x: ReturnType<typeof workflowSteps>) => x.steps.map((s) => `${s.key}:${s.state}:${s.who_en ?? "-"}`);

describe("workflow bar", () => {
  it("shows a fresh draft", () => {
    expect(states(workflowSteps("ai_draft", [], created))).toEqual(["draft:current:Sara", "submitted:upcoming:-", "approved:upcoming:-", "published:upcoming:-"]);
  });
  it("shows who submitted and approved", () => {
    const reviews = [r("submit", "2026-10-01T09:00:00Z", "Sara"), r("approve", "2026-10-01T10:00:00Z", "Huda")];
    expect(states(workflowSteps("researcher_approved", reviews, created))).toEqual(["draft:done:Sara", "submitted:done:Sara", "approved:current:Huda", "published:upcoming:-"]);
  });
  it("shows a returned card with the note", () => {
    const reviews = [r("submit", "2026-10-01T09:00:00Z", "Sara"), r("return", "2026-10-01T10:00:00Z", "Huda", "Add the Arabic")];
    const out = workflowSteps("returned", reviews, created);
    expect(states(out)[0]).toBe("draft:returned:Sara");
    expect(out.returnedBy?.note).toBe("Add the Arabic");
  });
  it("marks a published card done with its publisher", () => {
    const reviews = [r("submit", "1", "Sara"), r("approve", "2", "Huda"), r("publish", "3", "Noura")];
    expect(states(workflowSteps("published", reviews, created))).toEqual(["draft:done:Sara", "submitted:done:Sara", "approved:done:Huda", "published:done:Noura"]);
  });
  it("starts a new cycle for a revision of a published card", () => {
    const reviews = [r("submit", "1", "Sara"), r("approve", "2", "Huda"), r("publish", "3", "Noura"), r("submit", "4", "Omar")];
    expect(states(workflowSteps("student_submitted", reviews, created))).toEqual(["draft:done:Sara", "submitted:current:Omar", "approved:upcoming:-", "published:upcoming:-"]);
  });
});
