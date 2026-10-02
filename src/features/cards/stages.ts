import type { Status } from "@/lib/workflow";

export interface ReviewLike {
  decision: string;
  created_at: string;
  reviewer_en: string | null;
  reviewer_ar: string | null;
  reviewer_id?: string | null;
  note: string | null;
  version: number | null;
}

export type StepKey = "draft" | "submitted" | "approved" | "published";
export interface Step {
  key: StepKey;
  state: "done" | "current" | "upcoming" | "returned";
  who_en: string | null;
  who_ar: string | null;
  at: string | null;
}

const ORDER: StepKey[] = ["draft", "submitted", "approved", "published"];
const STAGE_INDEX: Record<Status, number> = { ai_draft: 0, returned: 0, student_submitted: 1, researcher_approved: 2, published: 3, archived: 3 };

/**
 * The 4-stage bar (who and when) for the CURRENT review cycle. A cycle starts after the last publication
 * when a revision is in progress, so the bar never mixes the old approval with the new draft.
 */
export function workflowSteps(stage: Status, reviews: ReviewLike[], created: { at: string; who_en: string | null; who_ar: string | null }): { steps: Step[]; returnedBy: ReviewLike | null } {
  const sorted = [...reviews].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let cycle = sorted;
  const lastPub = sorted.map((r) => r.decision).lastIndexOf("publish");
  if (lastPub >= 0 && stage !== "published" && stage !== "archived") cycle = sorted.slice(lastPub + 1);
  const last = (d: string, after = -1) => {
    for (let i = cycle.length - 1; i > after; i--) if (cycle[i].decision === d) return { r: cycle[i], i };
    return null;
  };
  const sub = last("submit");
  const appr = sub ? last("approve", sub.i) : null;
  const pub = appr ? last("publish", appr.i) : last("publish");
  const ret = last("return");
  const returned = stage === "returned" && ret ? ret.r : null;

  const cur = STAGE_INDEX[stage];
  const pick = (k: StepKey) =>
    k === "draft" ? { who_en: created.who_en, who_ar: created.who_ar, at: created.at } :
    k === "submitted" && sub ? { who_en: sub.r.reviewer_en, who_ar: sub.r.reviewer_ar, at: sub.r.created_at } :
    k === "approved" && appr ? { who_en: appr.r.reviewer_en, who_ar: appr.r.reviewer_ar, at: appr.r.created_at } :
    k === "published" && pub && stage === "published" ? { who_en: pub.r.reviewer_en, who_ar: pub.r.reviewer_ar, at: pub.r.created_at } :
    { who_en: null, who_ar: null, at: null };

  const steps = ORDER.map((key, i): Step => {
    let state: Step["state"] = i < cur ? "done" : i === cur ? "current" : "upcoming";
    if (stage === "published" && i === 3) state = "done";
    if (stage === "returned" && i === 0) state = "returned";
    const who = i <= cur || state === "done" ? pick(key) : { who_en: null, who_ar: null, at: null };
    return { key, state, ...who };
  });
  return { steps, returnedBy: returned };
}
