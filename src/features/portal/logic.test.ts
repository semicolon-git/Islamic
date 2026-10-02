import { describe, expect, it } from "vitest";
import { activityFromAudit, activityFromEvent, initialsOf, isFeedWorthy, pickNextTask, type TaskCounts } from "./logic";

const zero: TaskCounts = { myReturned: 0, myDrafts: 0, submitted: 0, approved: 0, waiting: 0, openRequests: 0 };

describe("next task", () => {
  it("students fix returned items before continuing drafts", () => {
    expect(pickNextTask("student", { ...zero, myReturned: 1, myDrafts: 2 }, { returned: "card:x" })).toEqual({ kind: "fix_returned", count: 1, href: "/portal/cards/card%3Ax" });
    expect(pickNextTask("student", { ...zero, myDrafts: 2 })).toEqual({ kind: "continue_draft", count: 2, href: "/portal/cards?stage=ai_draft&mine=1" });
    expect(pickNextTask("student", zero, { topConcept: "date_palm" })).toEqual({ kind: "start_card", count: 0, href: "/portal/cards/new?concept=date_palm" });
  });
  it("researchers review submissions, admins publish, specialists answer", () => {
    expect(pickNextTask("researcher", { ...zero, submitted: 3, waiting: 1 }).kind).toBe("review");
    expect(pickNextTask("researcher", { ...zero, openRequests: 4 }).kind).toBe("demand");
    expect(pickNextTask("institution_admin", { ...zero, approved: 1, openRequests: 9 }, { approved: "card:p" }).href).toBe("/portal/cards/card%3Ap");
    expect(pickNextTask("institution_admin", zero).kind).toBe("all_clear");
    expect(pickNextTask("specialist", { ...zero, waiting: 1 }, { thread: "thr_1" })).toEqual({ kind: "answer", count: 1, href: "/portal/inbox/thr_1" });
    expect(pickNextTask("specialist", zero).kind).toBe("inbox_clear");
    expect(pickNextTask("platform_admin", { ...zero, submitted: 1, approved: 1 }).kind).toBe("publish");
  });
});

describe("activity feed", () => {
  it("maps audit rows", () => {
    const a = activityFromAudit({ id: 7, action: "card.publish", entity_type: "card", entity_id: "card:moon", created_at: "2026-10-02T10:00:00Z", actor_en: "Noura", actor_ar: "نورة", title_en: "The Moon", title_ar: "القمر" });
    expect(a).toMatchObject({ id: "a7", verb: "card.publish", href: "/portal/cards/card%3Amoon" });
    expect(activityFromAudit({ ...a, id: 8, action: "ms.line.approve", entity_type: "line", entity_id: "l1", created_at: a.at }).verb).toBe("other");
  });
  it("maps live events and ignores the rest", () => {
    const ev = (scope: string, type: string, payload: Record<string, unknown> = {}) => ({ id: 1, scope, type, payload, created_at: "2026-10-02T10:00:00Z" });
    expect(activityFromEvent(ev("cards", "transition", { decision: "approve", card_id: "card:x", title_en: "X" }))).toMatchObject({ verb: "card.approve", title_en: "X" });
    expect(activityFromEvent(ev("cards", "published", { card_id: "card:x" }))?.verb).toBe("card.publish");
    expect(activityFromEvent(ev("demand", "request", { label_en: "Moon" }))).toMatchObject({ verb: "demand.request", title_en: "Moon", href: "/portal/demand" });
    expect(activityFromEvent(ev("inbox", "message", { sender: "visitor", thread_id: "t1" }))).toMatchObject({ verb: "thread.visitor", href: "/portal/inbox/t1" });
    expect(activityFromEvent(ev("inbox", "message", { sender: "specialist", thread_id: "t1" }))?.verb).toBe("thread.reply");
    expect(activityFromEvent(ev("card:x", "saved"))).toBeNull();
    expect(activityFromEvent(ev("cards", "transition", { decision: "weird" }))).toBeNull();
  });
  it("keeps autosaves out", () => {
    expect(isFeedWorthy("card.save")).toBe(false);
    expect(isFeedWorthy("line.lock")).toBe(false);
    expect(isFeedWorthy("card.publish")).toBe(true);
  });
});

describe("student initials", () => {
  it("abbreviates English and Arabic names", () => {
    expect(initialsOf("Sara Al-Harbi")).toBe("S. H.");
    expect(initialsOf("Omar Haddad")).toBe("O. H.");
    expect(initialsOf("سارة الحربي")).toBe("س. ح.");
    expect(initialsOf("Dr. Huda Al-Qahtani")).toBe("H. Q.");
  });
});
