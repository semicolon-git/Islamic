import { eventsAfter, latestEventId } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events over the `events` table.
 * GET /api/events?scopes=a,b&after=<id>   (after omitted → start from now)
 * GET /api/events?scopes=a,b&after=<id>&poll=1 → JSON snapshot (fallback for clients without SSE)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const scopes = (url.searchParams.get("scopes") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const afterParam = url.searchParams.get("after");
  let after = afterParam ? Number(afterParam) || 0 : await latestEventId();

  if (url.searchParams.get("poll")) {
    const events = await eventsAfter(scopes, after);
    return Response.json({ ok: true, data: { events, last: events.at(-1)?.id ?? after } });
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => {
        if (!closed) controller.enqueue(encoder.encode(s));
      };
      send(`retry: 2000\nevent: hello\ndata: ${JSON.stringify({ after })}\n\n`);
      const started = Date.now();
      let lastPing = Date.now();
      while (!closed && Date.now() - started < 55_000) {
        try {
          const events = await eventsAfter(scopes, after);
          for (const ev of events) {
            after = ev.id;
            send(`id: ${ev.id}\nevent: app\ndata: ${JSON.stringify(ev)}\n\n`);
          }
        } catch {
          /* transient db error: keep the stream alive */
        }
        if (Date.now() - lastPing > 15_000) {
          send(`: ping\n\n`);
          lastPing = Date.now();
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      if (!closed) controller.close();
    },
    cancel() {
      closed = true;
    },
  });
  req.signal.addEventListener("abort", () => {
    closed = true;
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
