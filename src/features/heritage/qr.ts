import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { itemQrPayload, venueQrPayload } from "./codes";

/** Public origin used in printed QR codes: PUBLIC_BASE_URL if set, else the request's host. */
export async function publicOrigin(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Inline SVG (dark modules on white, quiet zone included) so it prints crisply at any size. */
export function qrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#10143a", light: "#ffffff" } });
}

export async function itemQr(code: string) {
  const payload = itemQrPayload(await publicOrigin(), code);
  return { payload, svg: await qrSvg(payload) };
}

export async function venueQr(code: string) {
  const payload = venueQrPayload(code);
  return { payload, svg: await qrSvg(payload) };
}
