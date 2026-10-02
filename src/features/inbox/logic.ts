/**
 * Pure logic for "Talk to a person": what the visitor agreed to share, how long they've been waiting,
 * canned replies, and how card links travel inside messages. Shared by the visitor app, the inbox and the API.
 */

export interface Consent {
  /** Share the question text I typed (or brought from Ask). */
  question: boolean;
  /** Share which approved card I was looking at. */
  card: boolean;
  /** Share my language so the specialist replies in it. */
  lang: boolean;
}

export interface ThreadContext {
  question?: string;
  card_id?: string;
  card_title_en?: string;
  card_title_ar?: string;
}

/** Keep only what the visitor ticked. Nothing else is stored: no names, no contact details. */
export function buildThreadContext(
  consent: Consent,
  offered: { question?: string | null; card?: { id: string; title_en: string; title_ar: string } | null; lang: "en" | "ar" },
): { context: ThreadContext; lang: "en" | "ar" | "und" } {
  const context: ThreadContext = {};
  const q = offered.question?.trim();
  if (consent.question && q) context.question = q.slice(0, 1000);
  if (consent.card && offered.card) {
    context.card_id = offered.card.id;
    context.card_title_en = offered.card.title_en;
    context.card_title_ar = offered.card.title_ar;
  }
  return { context, lang: consent.lang ? offered.lang : "und" };
}

/** Short consent summary for the inbox list ("question · card · language"). */
export function consentSummary(consent: Partial<Consent> | null | undefined): (keyof Consent)[] {
  const c = consent ?? {};
  return (["question", "card", "lang"] as const).filter((k) => !!c[k]);
}

export interface MsgLike {
  sender: "visitor" | "specialist" | "system";
  created_at: string;
}

/** When the visitor started waiting: their first message after the last specialist reply (null if answered). */
export function waitingSince(messages: MsgLike[]): string | null {
  let since: string | null = null;
  for (const m of messages) {
    if (m.sender === "specialist") since = null;
    else if (m.sender === "visitor" && !since) since = m.created_at;
  }
  return since;
}

/** Has a person replied yet? Drives the "You are now talking with a person" banner. */
export const personHasJoined = (messages: Pick<MsgLike, "sender">[]) => messages.some((m) => m.sender === "specialist");

export type CannedId = "welcome" | "ifta" | "card";
export const CANNED: { id: CannedId; en: string; ar: string }[] = [
  {
    id: "welcome",
    en: "Hello, and welcome. Thank you for your question — I'm a person from the team, and I'm glad to help. Take your time.",
    ar: "أهلًا وسهلًا بك، وشكرًا على سؤالك. أنا من فريق المختصين، ويسعدني أن أساعدك. خذ وقتك.",
  },
  {
    id: "ifta",
    en: "For a ruling on your own situation, please ask an official fatwa body — in Saudi Arabia, the General Presidency of Scholarly Research and Ifta (alifta.gov.sa). I can share general, approved information, but not a ruling on your case.",
    ar: "للحصول على حكم في حالتك الخاصة، أرجو أن تتوجه إلى جهة إفتاء رسمية، ففي المملكة العربية السعودية: الرئاسة العامة للبحوث العلمية والإفتاء (alifta.gov.sa). يمكنني مشاركتك معلومات عامة معتمدة، لا حكمًا في حالتك.",
  },
  {
    id: "card",
    en: "Thank you — I'll send you an approved card on this topic, so you can read the sources yourself.",
    ar: "شكرًا لك، سأرسل إليك بطاقة معتمدة في هذا الموضوع لتطّلع على المصادر بنفسك.",
  },
];

/** Pick the canned reply language: the visitor's language if shared, otherwise the specialist's UI language. */
export function cannedText(id: CannedId, threadLang: string, uiLang: "en" | "ar") {
  const c = CANNED.find((x) => x.id === id)!;
  const lang = threadLang === "en" || threadLang === "ar" ? threadLang : uiLang;
  return c[lang];
}

/** Card links are sent as plain text so they survive any client; splitMessage() turns them into chips. */
/** Public URL for an approved card: concept cards open on their concept page, others by id. */
export function publicCardPath(card: { id: string; kind: string; concept_id: string | null }) {
  return card.kind === "concept" && card.concept_id ? `/c/${card.concept_id}` : `/card/${encodeURIComponent(card.id)}`;
}

/** Split a message into text and card-link parts for rendering. */
export function splitMessage(body: string): { type: "text" | "link"; value: string }[] {
  const out: { type: "text" | "link"; value: string }[] = [];
  let last = 0;
  for (const m of body.matchAll(/\/(?:card|c)\/[A-Za-z0-9%:_\-~.]+/g)) {
    const i = m.index ?? 0;
    if (i > 0 && !/\s/.test(body[i - 1])) continue;
    if (i > last) out.push({ type: "text", value: body.slice(last, i) });
    out.push({ type: "link", value: m[0].replace(/[.,]+$/, "") });
    last = i + m[0].replace(/[.,]+$/, "").length;
  }
  if (last < body.length) out.push({ type: "text", value: body.slice(last) });
  return out;
}
