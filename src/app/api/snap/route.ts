import { handler, ok, HttpError } from "@/lib/http";
import { aiEnabled, AiFailure } from "@/lib/ai/claude";
import { listConcepts, visionConcepts } from "@/features/beneficiary/data";
import { recognize } from "@/features/beneficiary/vision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Light in-memory limiter for the paid vision call (per IP, rolling 10 minutes). */
const hits = new Map<string, number[]>();
function allow(ip: string, limit = 40, windowMs = 10 * 60_000) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return true;
}

async function readImage(req: Request): Promise<{ bytes: Buffer; type: string }> {
  const ct = req.headers.get("content-type") || "";
  if (ct.startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const f = form?.get("image");
    if (!f || typeof f === "string") throw new HttpError(400, "no_image", "Send the photo in the 'image' field.");
    if (f.size > MAX_BYTES) throw new HttpError(413, "too_large", "That photo is too large.");
    return { bytes: Buffer.from(await f.arrayBuffer()), type: f.type || "image/jpeg" };
  }
  let json: { image?: unknown };
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "invalid_body", "Send multipart/form-data or JSON {image: dataURL}.");
  }
  const m = typeof json.image === "string" ? /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(json.image) : null;
  if (!m) throw new HttpError(400, "no_image", "image must be a base64 data URL.");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_BYTES) throw new HttpError(413, "too_large", "That photo is too large.");
  return { bytes, type: m[1] };
}

/**
 * POST /api/snap — recognise what the visitor is pointing at.
 * The photo is processed in memory only and never stored or logged.
 * Without an API key (or if the AI call fails) → {mode:'manual'} so the client opens the picker.
 */
export const POST = handler(async (req: Request) => {
  const { bytes, type } = await readImage(req);
  if (!ALLOWED.has(type)) throw new HttpError(415, "unsupported_type", "Please use a JPEG, PNG or WebP photo.");
  if (!bytes.length) throw new HttpError(400, "empty_image", "The photo is empty.");
  if (!aiEnabled()) return ok({ mode: "manual" as const, reason: "no_key" });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  if (!allow(ip)) return ok({ mode: "manual" as const, reason: "busy" });

  // Re-encode server-side too (auto-orient, ≤1024px, metadata dropped) — defence in depth if a client skipped it.
  let base64: string;
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(bytes, { limitInputPixels: 50_000_000 }).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    base64 = out.toString("base64");
  } catch {
    throw new HttpError(422, "bad_image", "We couldn't read that photo. Try another one.");
  }

  const concepts = await visionConcepts();
  try {
    const { result } = await recognize({ mediaType: "image/jpeg", base64 }, concepts);
    const all = await listConcepts();
    const by = new Map(all.map((c) => [c.id, c]));
    const candidates = result.candidates
      .map((c) => ({ ...c, concept: by.get(c.concept_id) }))
      .filter((c) => c.concept)
      .map((c) => ({ concept_id: c.concept_id, tier: c.tier, ...c.concept! }));
    return ok({ mode: "ai" as const, status: result.status, candidates, flags: result.flags, subject: result.subject ?? null });
  } catch (e) {
    if (e instanceof AiFailure) return ok({ mode: "manual" as const, reason: e.kind });
    throw e;
  }
});
