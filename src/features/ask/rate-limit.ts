/** Tiny in-memory fixed-window rate limiter (per process). Enough to stop accidental floods on a demo deployment. */
const g = globalThis as unknown as { __askRate?: Map<string, { start: number; n: number }> };

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const m = (g.__askRate ??= new Map());
  const cur = m.get(key);
  if (!cur || now - cur.start >= windowMs) {
    m.set(key, { start: now, n: 1 });
    if (m.size > 5000) for (const [k, v] of m) if (now - v.start >= windowMs) m.delete(k);
    return true;
  }
  cur.n++;
  return cur.n <= max;
}
