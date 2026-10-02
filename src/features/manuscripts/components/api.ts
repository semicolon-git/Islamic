"use client";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data?: unknown) {
    super(message);
  }
}

/** JSON fetch against the Studio API: returns `data` or throws ApiError (status/code/message/data). */
export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "offline", "You seem to be offline. Your text is still here; try again.");
  }
  let payload: { ok: boolean; data?: T; error?: { code: string; message: string; data?: unknown } } | null = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok || !payload?.ok) {
    const e = payload?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? `Request failed (${res.status}).`, e?.data);
  }
  return payload.data as T;
}

/** Percent formatting for CER and progress (locale digits). */
export const pct = (v: number | null | undefined, locale: string, digits = 1) =>
  v == null ? "–" : new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { style: "percent", maximumFractionDigits: digits }).format(v);

export const num = (n: number, locale: string) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(n);
