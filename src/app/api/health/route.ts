import { sql } from "@/lib/db";
import { aiEnabled } from "@/lib/ai/claude";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [{ ayat }] = await sql<{ ayat: number }>("select count(*)::int as ayat from quran_ayah");
    return Response.json({ ok: true, data: { ayat, ai: aiEnabled(), demo: env.demoMode, db: env.databaseUrl ? "postgres" : "pglite" } });
  } catch (e) {
    return Response.json({ ok: false, error: { code: "db", message: String(e) } }, { status: 503 });
  }
}
