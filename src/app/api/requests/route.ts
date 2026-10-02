import { handler, ok, body, HttpError } from "@/lib/http";
import { one, q, sql, tx } from "@/lib/db";
import { emit } from "@/lib/events";
import { newId } from "@/lib/ids";
import { hashDeviceToken, isValidDeviceToken, rateLimited, RequestBody, REQUESTS_PER_HOUR } from "@/features/beneficiary/requests";

export const dynamic = "force-dynamic";

/**
 * POST /api/requests — "Notify me when it's approved" / "Request this topic".
 * Body: { concept_id? | topic? | item_code?, device_token }. Only sha256(device_token) is stored.
 * Deduped per device + target; max 20 requests per device per hour. Emits `demand` / `request`.
 */
export const POST = handler(async (req: Request) => {
  const b = await body(req, RequestBody);
  const deviceHash = hashDeviceToken(b.device_token);

  if (b.concept_id) {
    const c = await one("select 1 from concepts where id = $1 and enabled = true", [b.concept_id]);
    if (!c) throw new HttpError(404, "unknown_concept", "We don't know that topic.");
  }

  const result = await tx(async (qb) => {
    const existing = (
      await q<{ id: string; status: string }>(
        qb,
        `select id, status from card_requests
          where device_hash = $1 and status = 'open'
            and coalesce(concept_id,'') = coalesce($2,'') and coalesce(lower(topic),'') = coalesce(lower($3),'') and coalesce(item_code,'') = coalesce($4,'')
          limit 1`,
        [deviceHash, b.concept_id ?? null, b.topic ?? null, b.item_code ?? null],
      )
    )[0];
    if (existing) return { id: existing.id, created: false };

    const [{ n }] = await q<{ n: number }>(
      qb,
      "select count(*)::int as n from card_requests where device_hash = $1 and created_at > now() - interval '1 hour'",
      [deviceHash],
    );
    if (rateLimited(n))
      throw new HttpError(429, "rate_limited", `You've sent ${REQUESTS_PER_HOUR} requests this hour. Please try again later.`);

    const id = newId("req");
    await qb.query("insert into card_requests (id, concept_id, topic, item_code, device_hash) values ($1,$2,$3,$4,$5)", [
      id,
      b.concept_id ?? null,
      b.topic ?? null,
      b.item_code ?? null,
      deviceHash,
    ]);
    await emit("demand", "request", { request_id: id, concept_id: b.concept_id ?? null, topic: b.topic ?? null, item_code: b.item_code ?? null }, null, qb);
    return { id, created: true };
  });
  return ok(result, { status: result.created ? 201 : 200 });
});

/**
 * GET /api/requests — this device's requests (header `x-device-token`), so the app can show
 * "We'll let you know" and "Approved since you asked" without any account.
 */
export const GET = handler(async (req: Request) => {
  const token = req.headers.get("x-device-token");
  if (!isValidDeviceToken(token)) throw new HttpError(400, "invalid_token", "Missing or invalid device token.");
  const rows = await sql<{ id: string; concept_id: string | null; topic: string | null; item_code: string | null; status: string; created_at: string; card_id: string | null }>(
    `select r.id, r.concept_id, r.topic, r.item_code, r.status, r.created_at,
            coalesce(r.fulfilled_card_id,
              (select k.id from cards k where k.concept_id = r.concept_id and k.status = 'published' and k.kind in ('concept','art') order by k.published_at desc limit 1)) as card_id
       from card_requests r where r.device_hash = $1 order by r.created_at desc limit 100`,
    [hashDeviceToken(token)],
  );
  return ok(rows);
});
