import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public data?: unknown) {
    super(message);
  }
}

export const ok = <T,>(data: T, init?: ResponseInit) => NextResponse.json({ ok: true, data }, init);
export const fail = (status: number, code: string, message: string, data?: unknown) =>
  NextResponse.json({ ok: false, error: { code, message, data } }, { status });

/** Wrap a route handler: maps HttpError/ZodError to JSON errors, logs unexpected ones. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.code, e.message, e.data);
      if (e instanceof ZodError)
        return fail(400, "invalid_input", "Some fields are missing or invalid.", e.issues);
      console.error("[api]", e);
      return fail(500, "server_error", "Something went wrong on our side. Please try again.");
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  }
  return schema.parse(raw);
}
