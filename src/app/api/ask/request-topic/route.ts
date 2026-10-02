import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { tx } from "@/lib/db";
import { emit } from "@/lib/events";
import { newId } from "@/lib/ids";
import { body, fail, handler, ok } from "@/lib/http";
import { redactPII } from "@/features/ask/text";
import { rateLimit } from "@/features/ask/rate-limit";

export const dynamic = "force-dynamic";

const Input = z.object({
  topic: z.string().trim().min(2).max(300),
  deviceToken: z.string().max(200).optional(),
});

/** POST /api/ask/request-topic — "Request this topic" from the empty-evidence screen. Feeds the portal demand board. */
export const POST = handler(async (req: Request) => {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`req:${ip}`, 10, 60_000)) return fail(429, "rate_limited", "Too many requests. Please wait a minute.");
  const input = await body(req, Input);
  const topic = redactPII(input.topic).text;
  // Only a hash of the random device token is stored (no accounts, no identifiers).
  const deviceHash = createHash("sha256").update(input.deviceToken || randomUUID()).digest("hex");
  const id = newId("req");
  await tx(async (q) => {
    await q.query("insert into card_requests (id, topic, device_hash) values ($1,$2,$3)", [id, topic, deviceHash]);
    await emit("demand", "request.created", { id, topic, source: "ask" }, null, q);
  });
  return ok({ id });
});
