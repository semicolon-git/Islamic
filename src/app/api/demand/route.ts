import { z } from "zod";
import { body, handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { demandBoard, postRequest, setGroupStatus } from "@/features/cards/demand";
import { validToken } from "@/features/inbox/server";

export const dynamic = "force-dynamic";

/** GET /api/demand — visitor requests grouped by concept / topic, with counts, recency and status. */
export const GET = handler(async () => {
  await requireUser(["student", "researcher", "institution_admin"]);
  return ok({ groups: await demandBoard() });
});

const RequestInput = z
  .object({
    device_token: z.string().refine(validToken, "Invalid device token."),
    concept_id: z.string().max(80).nullable().optional(),
    topic: z.string().max(200).nullable().optional(),
    item_code: z.string().max(40).nullable().optional(),
  })
  .refine((v) => v.concept_id || v.topic?.trim() || v.item_code, { message: "Tell us which topic you'd like." });

/** POST /api/demand — public: a visitor asks for a card on a concept or topic (only a device-token hash is kept). */
export const POST = handler(async (req: Request) => {
  const input = await body(req, RequestInput);
  const res = await postRequest(input);
  return ok(res, { status: res.duplicate ? 200 : 201 });
});

const PatchInput = z.object({ key: z.string().min(3).max(260), status: z.enum(["dismissed", "open"]) });

/** PATCH /api/demand — researchers dismiss (or reopen) a request group. */
export const PATCH = handler(async (req: Request) => {
  const user = await requireUser(["researcher", "institution_admin"]);
  const input = await body(req, PatchInput);
  return ok(await setGroupStatus(user.id, input.key, input.status));
});
