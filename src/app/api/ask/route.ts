import { z } from "zod";
import { body, fail, handler, ok } from "@/lib/http";
import { answerQuestion } from "@/features/ask/server";
import { MAX_QUESTION } from "@/features/ask/text";
import { rateLimit } from "@/features/ask/rate-limit";

export const dynamic = "force-dynamic";

const Input = z.object({
  question: z.string().max(MAX_QUESTION * 2),
  lang: z.enum(["en", "ar"]).default("en"),
  cardId: z.string().max(120).nullish(),
});

/**
 * POST /api/ask — answer a question from approved evidence only.
 * With `Accept: application/x-ndjson` the response streams honest progress lines
 * ({type:"stage",stage}) as each pipeline step completes, then {type:"result",data} or {type:"error",error}.
 * Otherwise it returns the usual {ok, data} JSON.
 */
export const POST = handler(async (req: Request) => {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`ask:${ip}`, 30, 60_000)) return fail(429, "rate_limited", "Too many questions in a short time. Please wait a minute.");
  const input = await body(req, Input);

  if (!(req.headers.get("accept") ?? "").includes("application/x-ndjson")) {
    const data = await answerQuestion(input.question, { lang: input.lang, cardId: input.cardId ?? null });
    return ok(data);
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        const data = await answerQuestion(input.question, { lang: input.lang, cardId: input.cardId ?? null, onStage: (stage) => send({ type: "stage", stage }) });
        send({ type: "result", data });
      } catch (e) {
        console.error("[ask]", e);
        send({ type: "error", error: { code: "server_error", message: "Something went wrong on our side. Please try again." } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
});
