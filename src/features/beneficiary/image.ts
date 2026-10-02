/**
 * Client-side photo preparation. Re-drawing the image on a canvas and exporting a JPEG drops all metadata (EXIF, GPS),
 * and downscaling keeps uploads small. The original photo never leaves the device.
 */
export const MAX_EDGE = 1024;

/** Scale (w, h) to fit inside max×max, never upscaling. */
export function fitWithin(w: number, h: number, max = MAX_EDGE): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0 };
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

type Drawable = HTMLVideoElement | ImageBitmap | HTMLImageElement | HTMLCanvasElement;

function sizeOf(src: Drawable): { w: number; h: number } {
  if (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement) return { w: src.videoWidth, h: src.videoHeight };
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) return { w: src.naturalWidth, h: src.naturalHeight };
  return { w: (src as ImageBitmap).width, h: (src as ImageBitmap).height };
}

/** Draw a frame/image to a canvas at ≤ MAX_EDGE and export as JPEG (metadata stripped). */
export async function toJpeg(src: Drawable, quality = 0.85): Promise<Blob> {
  const { w, h } = sizeOf(src);
  const { width, height } = fitWithin(w, h);
  if (!width || !height) throw new Error("empty_image");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  ctx.drawImage(src, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) throw new Error("encode_failed");
  return blob;
}

/** Decode a picked file (respecting its orientation) and re-encode it as a clean JPEG. */
export async function fileToJpeg(file: File): Promise<Blob> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      try {
        return await toJpeg(bmp);
      } finally {
        bmp.close();
      }
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await toJpeg(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}
