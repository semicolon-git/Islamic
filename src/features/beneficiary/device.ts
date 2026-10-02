"use client";

/** Anonymous device token (random, local only). The server stores only its sha256. */
export const DEVICE_KEY = "say.device_token";
export const WELCOMED_KEY = "say.welcomed";
export const SEEN_APPROVED_KEY = "say.seen_approved";

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function getDeviceToken(create = true): string | null {
  try {
    let t = localStorage.getItem(DEVICE_KEY);
    if (!t && create) {
      t = randomToken();
      localStorage.setItem(DEVICE_KEY, t);
    }
    return t;
  } catch {
    return null;
  }
}

export function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeFlag(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: ignore */
  }
}

export function readList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
