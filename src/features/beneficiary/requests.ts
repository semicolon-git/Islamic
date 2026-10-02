import { createHash } from "node:crypto";
import { z } from "zod";

/** Device tokens are random strings generated in the browser; only their sha256 is ever stored. */
export const DEVICE_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
export const isValidDeviceToken = (t: unknown): t is string => typeof t === "string" && DEVICE_TOKEN_RE.test(t);
export const hashDeviceToken = (t: string) => createHash("sha256").update(`say-device:${t}`).digest("hex");

/** Max card requests per device per rolling hour. */
export const REQUESTS_PER_HOUR = 20;

export const RequestBody = z
  .object({
    concept_id: z.string().min(1).max(80).optional(),
    topic: z.string().trim().min(2).max(300).optional(),
    item_code: z.string().trim().min(1).max(40).optional(),
    device_token: z.string().regex(DEVICE_TOKEN_RE, "Invalid device token"),
  })
  .refine((b) => !!(b.concept_id || b.topic || b.item_code), { message: "concept_id, topic or item_code is required" });
export type RequestBody = z.infer<typeof RequestBody>;

/** Rate-limit decision from the number of requests this device made in the last hour. */
export function rateLimited(countLastHour: number, limit = REQUESTS_PER_HOUR) {
  return countLastHour >= limit;
}
