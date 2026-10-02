import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";

/** Item images live in UPLOAD_DIR/items as re-encoded WebP (EXIF/GPS stripped). */
export const ITEM_FILE_RE = /^[a-z0-9_]+\.webp$/;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function itemsDir() {
  return path.resolve(env.uploadDir, "items");
}

/** Resolve a public file name to a path inside the items folder, or null if it isn't a safe name. */
export function safeItemPath(name: string): string | null {
  if (!ITEM_FILE_RE.test(name)) return null;
  const dir = itemsDir();
  const p = path.resolve(dir, name);
  return p.startsWith(dir + path.sep) ? p : null;
}

export class UploadError extends Error {
  constructor(public code: "too_large" | "bad_type" | "bad_image", message: string) {
    super(message);
  }
}

/**
 * Re-encode an uploaded image: auto-rotate from EXIF, then drop ALL metadata (sharp writes none by default),
 * cap at 2000 px, WebP. A 600 px thumbnail is written alongside.
 */
export async function storeItemImage(buf: Buffer, mime: string): Promise<{ src: string; thumb: string; width: number; height: number }> {
  if (buf.byteLength > MAX_UPLOAD_BYTES) throw new UploadError("too_large", "Images must be 10 MB or smaller.");
  if (!ACCEPTED.has(mime)) throw new UploadError("bad_type", "Use a JPEG, PNG or WebP image.");
  const sharp = (await import("sharp")).default;
  let main: { data: Buffer; info: { width: number; height: number } };
  let thumb: Buffer;
  try {
    const base = sharp(buf, { failOn: "error" }).rotate();
    main = await base.clone().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    thumb = await base.clone().resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  } catch {
    throw new UploadError("bad_image", "This file isn't a readable image.");
  }
  const id = newId("img").replace(/[^a-z0-9_]/g, "");
  const dir = itemsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${id}.webp`), main.data);
  await fs.writeFile(path.join(dir, `${id}_t.webp`), thumb);
  return { src: `/api/items/files/${id}.webp`, thumb: `/api/items/files/${id}_t.webp`, width: main.info.width, height: main.info.height };
}

/** Thumbnail URL for an uploaded item image (other sources are returned unchanged). */
export function thumbOf(src: string) {
  const m = /^\/api\/items\/files\/([a-z0-9_]+)\.webp$/.exec(src);
  return m && !m[1].endsWith("_t") ? `/api/items/files/${m[1]}_t.webp` : src;
}
