/**
 * Database drivers return timestamptz columns as Date objects. Our view models use ISO strings everywhere
 * (sorting, relative times, JSON, React props), so server functions pass their results through plain().
 */
export function plain<T>(value: T): T {
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map(plain) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = plain(v);
    return out as T;
  }
  return value;
}
