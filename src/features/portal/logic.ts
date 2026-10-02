import type { Role } from "@/lib/auth";

/* ───────────────────────────── "Your next task" */

export interface TaskCounts {
  myReturned: number;
  myDrafts: number;
  submitted: number; // awaiting a researcher
  approved: number; // awaiting institution publish
  waiting: number; // visitors waiting for a reply
  openRequests: number; // open visitor card requests
}
export interface TaskFirsts {
  returned?: string | null;
  draft?: string | null;
  submitted?: string | null;
  approved?: string | null;
  thread?: string | null;
  topConcept?: string | null;
}

export type TaskKind = "fix_returned" | "continue_draft" | "review" | "publish" | "answer" | "demand" | "start_card" | "inbox_clear" | "all_clear";
export interface NextTask {
  kind: TaskKind;
  count: number;
  href: string;
}

const cardHref = (id: string) => `/portal/cards/${encodeURIComponent(id)}`;

/** One primary action per role (SPEC §7.1). The order inside each role is the priority. */
export function pickNextTask(role: Role, c: TaskCounts, first: TaskFirsts = {}): NextTask {
  const one = (kind: TaskKind, count: number, firstId: string | null | undefined, list: string, single: (id: string) => string = cardHref): NextTask => ({
    kind,
    count,
    href: count === 1 && firstId ? single(firstId) : list,
  });
  const fixReturned = () => one("fix_returned", c.myReturned, first.returned, "/portal/cards?stage=returned&mine=1");
  const draft = () => one("continue_draft", c.myDrafts, first.draft, "/portal/cards?stage=ai_draft&mine=1");
  const review = () => one("review", c.submitted, first.submitted, "/portal/cards?stage=student_submitted");
  const publish = () => one("publish", c.approved, first.approved, "/portal/cards?stage=researcher_approved");
  const answer = () => one("answer", c.waiting, first.thread, "/portal/inbox", (id) => `/portal/inbox/${id}`);
  const demand = (): NextTask => ({ kind: "demand", count: c.openRequests, href: "/portal/demand" });
  const start = (): NextTask => ({ kind: "start_card", count: 0, href: first.topConcept ? `/portal/cards/new?concept=${encodeURIComponent(first.topConcept)}` : "/portal/cards/new" });

  switch (role) {
    case "student":
      if (c.myReturned) return fixReturned();
      if (c.myDrafts) return draft();
      return start();
    case "researcher":
      if (c.submitted) return review();
      if (c.myReturned) return fixReturned();
      if (c.waiting) return answer();
      if (c.openRequests) return demand();
      return start();
    case "institution_admin":
      if (c.approved) return publish();
      if (c.openRequests) return demand();
      return { kind: "all_clear", count: 0, href: "/portal/cards" };
    case "specialist":
      if (c.waiting) return answer();
      return { kind: "inbox_clear", count: 0, href: "/portal/inbox" };
    default:
      if (c.approved) return publish();
      if (c.submitted) return review();
      if (c.waiting) return answer();
      if (c.openRequests) return demand();
      return { kind: "all_clear", count: 0, href: "/portal/cards" };
  }
}

/* ───────────────────────────── activity feed (audit rows + live events → one shape) */

export type Verb =
  | "card.create"
  | "card.submit"
  | "card.approve"
  | "card.return"
  | "card.publish"
  | "card.archive"
  | "card.revision"
  | "demand.request"
  | "demand.fulfil"
  | "demand.dismiss"
  | "thread.start"
  | "thread.visitor"
  | "thread.reply"
  | "thread.close"
  | "other";

export interface ActivityItem {
  id: string;
  at: string;
  verb: Verb;
  actor_en: string | null;
  actor_ar: string | null;
  title_en: string | null;
  title_ar: string | null;
  href: string | null;
  raw?: string;
}

export interface AuditRowLike {
  id: number | string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  actor_en: string | null;
  actor_ar: string | null;
  title_en: string | null;
  title_ar: string | null;
}

const KNOWN: Record<string, Verb> = {
  "card.create": "card.create",
  "card.submit": "card.submit",
  "card.approve": "card.approve",
  "card.return": "card.return",
  "card.publish": "card.publish",
  "card.archive": "card.archive",
  "demand.request": "demand.request",
  "demand.fulfil": "demand.fulfil",
  "demand.dismiss": "demand.dismiss",
  "thread.start": "thread.start",
  "thread.reply": "thread.reply",
  "thread.close": "thread.close",
};

/** Noisy actions (autosaves, locks) never reach the feed. */
export const isFeedWorthy = (action: string) => !/(^|\.)(save|autosave|lock|unlock|heartbeat|read)$/.test(action);

function hrefFor(entityType: string, entityId: string, verb: Verb): string | null {
  if (entityType === "card") return verb === "demand.fulfil" ? "/portal/demand" : cardHref(entityId);
  if (entityType === "card_request") return "/portal/demand";
  if (entityType === "thread") return `/portal/inbox/${entityId}`;
  return null;
}

export function activityFromAudit(r: AuditRowLike): ActivityItem {
  const verb = KNOWN[r.action] ?? "other";
  return {
    id: `a${r.id}`,
    at: r.created_at,
    verb,
    actor_en: r.actor_en,
    actor_ar: r.actor_ar,
    title_en: r.title_en,
    title_ar: r.title_ar,
    href: hrefFor(r.entity_type, r.entity_id, verb),
    raw: verb === "other" ? r.action : undefined,
  };
}

export interface EventLike {
  id: number;
  scope: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const TRANSITION_VERBS: Record<string, Verb> = { submit: "card.submit", approve: "card.approve", return: "card.return", archive: "card.archive" };
const s = (v: unknown) => (typeof v === "string" ? v : null);

/** Map a realtime event to a feed item; null when it isn't feed material. */
export function activityFromEvent(ev: EventLike): ActivityItem | null {
  const p = ev.payload ?? {};
  const base = { id: `e${ev.id}`, at: ev.created_at, actor_en: s(p.actor_en), actor_ar: s(p.actor_ar), title_en: s(p.title_en) ?? s(p.label_en), title_ar: s(p.title_ar) ?? s(p.label_ar) };
  const card = s(p.card_id);
  if (ev.scope === "cards") {
    const verb: Verb | null =
      ev.type === "created" ? "card.create" : ev.type === "published" ? "card.publish" : ev.type === "revision" ? "card.revision" : ev.type === "transition" ? (TRANSITION_VERBS[s(p.decision) ?? ""] ?? null) : null;
    if (!verb) return null;
    return { ...base, verb, href: card ? cardHref(card) : null };
  }
  if (ev.scope === "demand") {
    if (ev.type === "request") return { ...base, verb: "demand.request", href: "/portal/demand" };
    if (ev.type === "fulfilled") return { ...base, verb: "demand.fulfil", href: "/portal/demand" };
    if (ev.type === "dismissed") return { ...base, verb: "demand.dismiss", href: "/portal/demand" };
    return null;
  }
  if (ev.scope === "inbox") {
    const thread = s(p.thread_id);
    const href = thread ? `/portal/inbox/${thread}` : "/portal/inbox";
    if (ev.type === "thread_started") return { ...base, verb: "thread.start", href };
    if (ev.type === "message") return { ...base, verb: p.sender === "specialist" ? "thread.reply" : "thread.visitor", href };
    if (ev.type === "closed") return { ...base, verb: "thread.close", href };
  }
  return null;
}

/* ───────────────────────────── privacy: student initials */

const TITLES = /^(dr\.?|prof\.?|د\.|أ\.د\.|أ\.)\s*/i;

/** "Sara Al-Harbi" → "S. H." · "سارة الحربي" → "س. ح." (students are shown by initials by default). */
export function initialsOf(name: string): string {
  const words = name.replace(TITLES, "").split(/[\s-]+/).filter(Boolean);
  const letters = words
    .map((w) => {
      const core = /^ال[؀-ۿ]{2,}/.test(w) ? w.slice(2) : /^al$/i.test(w) ? "" : w;
      return core ? core[0].toUpperCase() : "";
    })
    .filter(Boolean)
    .slice(0, 3);
  return letters.map((l) => `${l}.`).join(" ");
}
