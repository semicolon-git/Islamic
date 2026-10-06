import { z } from "zod";
import { body, fail, handler, ok } from "@/lib/http";
import { rateLimit } from "@/features/ask/rate-limit";
import { discoverSubject } from "@/features/discover/server";
import { SUBJECT_CATEGORIES } from "@/features/beneficiary/vision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const term = z.string().trim().min(1).max(40);
const Input = z
  .object({
    label_en: z.string().trim().max(80).default(""),
    label_ar: z.string().trim().max(80).default(""),
    category: z.enum(SUBJECT_CATEGORIES).nullish(),
    search_terms_en: z.array(term).max(8).optional(),
    search_terms_ar: z.array(term).max(10).optional(),
    sensitive: z.boolean().optional(),
    source: z.enum(["snap", "search"]).default("search"),
  })
  .refine((v) => v.label_en || v.label_ar, { message: "Say what to look up." });

/**
 * POST /api/discover — what the verified sources say about a subject no approved card covers yet.
 * With `Accept: application/x-ndjson` it streams {type:"stage"} lines, then {type:"result"} or {type:"error"}.
 */
export const POST = handler(async (req: Request) => {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`discover:${ip}`, 40, 10 * 60_000)) return fail(429, "rate_limited", "Too many look-ups in a short time. Please wait a few minutes.");
  const input = await body(req, Input);
  const args = { ...input, category: input.category ?? null };
  if (!(req.headers.get("accept") ?? "").includes("application/x-ndjson")) return ok(await discoverSubject(args));

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        const data = await discoverSubject(args, { onStage: (stage) => send({ type: "stage", stage }) });
        send({ type: "result", data });
      } catch (e) {
        console.error("[discover]", e);
        send({ type: "error", error: { code: "server_error", message: "Something went wrong on our side. Please try again." } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
});
