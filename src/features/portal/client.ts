"use client";
import { useEffect, useState } from "react";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: { code: string; message: string; data?: unknown } };

/** fetch + JSON with the platform's { ok, data } / { ok:false, error } envelope. Network errors become status 0. */
export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<ApiResult<T>> {
  const { json, headers, ...rest } = init;
  try {
    const res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(headers as Record<string, string>) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (body && body.ok) return { ok: true, data: body.data as T };
    return { ok: false, status: res.status, error: body?.error ?? { code: "http", message: res.statusText || "Request failed" } };
  } catch (e) {
    return { ok: false, status: 0, error: { code: "network", message: e instanceof Error ? e.message : "Network error" } };
  }
}

/** Re-render every `ms` so relative times ("3 min ago") stay fresh. */
export function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** True when the user is typing in a field (to keep single-key shortcuts out of the way). */
export function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** "12 min", "3 hr", "2 days" since an ISO time (for "Waiting 12 min"). */
export function fmtDuration(fromIso: string, locale: "en" | "ar") {
  const s = Math.max(0, (Date.now() - new Date(fromIso).getTime()) / 1000);
  const [value, unit] = s < 3600 ? [Math.max(1, Math.round(s / 60)), "minute"] : s < 86400 ? [Math.round(s / 3600), "hour"] : [Math.round(s / 86400), "day"];
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en", { style: "unit", unit: unit as string, unitDisplay: "short" }).format(value as number);
}

/** Debounced value. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
