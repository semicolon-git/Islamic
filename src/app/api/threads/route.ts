import { z } from "zod";
import { body, handler, HttpError, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { hashToken, listInbox, startThread, validToken, STAFF_ROLES } from "@/features/inbox/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/threads?status=open|closed — specialist inbox.
 * GET /api/threads with header x-device-token — the visitor's own open conversation id (to resume), if any.
 */
export const GET = handler(async (req: Request) => {
  const token = req.headers.get("x-device-token");
  if (token) {
    if (!validToken(token)) throw new HttpError(400, "bad_token", "Invalid device token.");
    const t = await one<{ id: string }>("select id from threads where device_hash = $1 and status = 'open' order by last_message_at desc limit 1", [hashToken(token)]);
    return ok({ thread_id: t?.id ?? null });
  }
  await requireUser([...STAFF_ROLES]);
  const status = new URL(req.url).searchParams.get("status") === "closed" ? "closed" : "open";
  return ok({ items: await listInbox(status) });
});

const StartInput = z.object({
  device_token: z.string().refine(validToken, "Invalid device token."),
  consent: z.object({ question: z.boolean(), card: z.boolean(), lang: z.boolean() }),
  question: z.string().max(1000).nullable().optional(),
  card_id: z.string().max(120).nullable().optional(),
  lang: z.enum(["en", "ar"]).default("en"),
});

/** POST /api/threads — a visitor starts (or resumes) a conversation. No account, no name, no contact details. */
export const POST = handler(async (req: Request) => {
  const input = await body(req, StartInput);
  const res = await startThread({ token: input.device_token, consent: input.consent, question: input.question, card_id: input.card_id, lang: input.lang });
  return ok(res, { status: res.resumed ? 200 : 201 });
});
