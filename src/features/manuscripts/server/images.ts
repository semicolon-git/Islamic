import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { bbox, padBox, type Box, type Polygon } from "../geometry";

/** Roots served by /api/ms/files/<root>/...: the read-only demo corpus and the upload directory. */
export const FILE_ROOTS = {
  dataset: () => path.join(process.cwd(), "data", "manuscripts"),
  uploads: () => path.resolve(process.cwd(), env.uploadDir, "ms"),
} as const;

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/**
 * Resolve a public file path safely: known root, no traversal, no hidden files, image extensions only,
 * and the resolved path must stay inside the root.
 */
export function resolveFile(parts: string[]): { file: string; type: string; immutable: boolean } {
  const [root, ...rest] = parts;
  if (!(root in FILE_ROOTS) || !rest.length) throw new HttpError(404, "not_found", "File not found.");
  if (rest.some((p) => !p || p === "." || p === ".." || p.startsWith(".") || /[\\/\0]/.test(p))) throw new HttpError(400, "bad_path", "Invalid file path.");
  const ext = path.extname(rest[rest.length - 1]).toLowerCase();
  const type = TYPES[ext];
  if (!type) throw new HttpError(404, "not_found", "File not found.");
  const base = FILE_ROOTS[root as keyof typeof FILE_ROOTS]();
  const file = path.resolve(base, ...rest);
  if (file !== base && !file.startsWith(base + path.sep)) throw new HttpError(400, "bad_path", "Invalid file path.");
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new HttpError(404, "not_found", "File not found.");
  return { file, type, immutable: root === "dataset" };
}

/** Map a stored public image path (/api/ms/files/...) back to a file on disk. */
export function fileForPublicPath(publicPath: string): string {
  const prefix = "/api/ms/files/";
  if (!publicPath.startsWith(prefix)) throw new HttpError(400, "bad_path", "Unknown image location.");
  return resolveFile(publicPath.slice(prefix.length).split("/").map(decodeURIComponent)).file;
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/tiff"];
export const WEB_MAX = 2400;
export const THUMB_MAX = 400;

export interface ProcessedImage { web: Buffer; thumb: Buffer; width: number; height: number }

/**
 * Validate and process an uploaded page image: auto-orient, resize to ≤ 2400 px (long side), re-encode as JPEG
 * (sharp drops EXIF/GPS metadata unless asked to keep it), plus a 400 px thumbnail.
 */
export async function processUpload(buf: Buffer, mime: string): Promise<ProcessedImage> {
  if (!ACCEPTED_TYPES.includes(mime)) throw new HttpError(415, "bad_type", "Upload a JPEG, PNG, WebP or TIFF image of the page.");
  if (buf.length > MAX_UPLOAD_BYTES) throw new HttpError(413, "too_large", "That image is larger than 15 MB. Export a smaller JPEG and try again.");
  let meta;
  try {
    meta = await sharp(buf, { limitInputPixels: 120_000_000 }).metadata();
  } catch {
    throw new HttpError(415, "bad_image", "That file isn't a readable image.");
  }
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) throw new HttpError(422, "too_small", "The image is too small to read (at least 200 × 200 px).");
  const web = await sharp(buf).rotate().resize({ width: WEB_MAX, height: WEB_MAX, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(web.data).resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside" }).jpeg({ quality: 78 }).toBuffer();
  return { web: web.data, thumb, width: web.info.width, height: web.info.height };
}

export function saveUpload(msId: string, pageId: string, img: ProcessedImage) {
  const dir = path.join(FILE_ROOTS.uploads(), msId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${pageId}.jpg`), img.web);
  fs.writeFileSync(path.join(dir, `${pageId}.thumb.jpg`), img.thumb);
  return { image_path: `/api/ms/files/uploads/${msId}/${pageId}.jpg`, thumb_path: `/api/ms/files/uploads/${msId}/${pageId}.thumb.jpg` };
}

/** Greyscale raster for segmentation, scaled to `width` px wide. */
export async function grayRaster(file: string, width = 1000) {
  const { data, info } = await sharp(file).greyscale().resize({ width, withoutEnlargement: false }).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** A line crop (polygon bbox + padding) as PNG, for the machine draft. Outside-polygon areas are kept (context helps). */
export async function cropLine(file: string, poly: Polygon, size: { width: number; height: number }, pad = 6): Promise<{ png: Buffer; box: Box }> {
  const b = padBox(bbox(poly), pad, size.width, size.height);
  const box = { x: Math.round(b.x), y: Math.round(b.y), w: Math.max(1, Math.round(b.w)), h: Math.max(1, Math.round(b.h)) };
  const png = await sharp(file).extract({ left: box.x, top: box.y, width: Math.min(box.w, size.width - box.x), height: Math.min(box.h, size.height - box.y) }).greyscale().normalise().png().toBuffer();
  return { png, box };
}
