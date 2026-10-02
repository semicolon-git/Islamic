import { headers } from "next/headers";
import { PwaClient } from "./pwa-client";
import { EARLY_CAPTURE_SCRIPT } from "./logic";

/** Absolute origin for social-preview URLs: NEXT_PUBLIC_SITE_URL, else the request's own host. */
async function siteOrigin(): Promise<string> {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL;
  if (fixed) return fixed.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

/**
 * Rendered once in the root layout. Server part: social-preview image tags (React hoists <meta>/<link> into
 * <head>) and a tiny inline script that catches an early `beforeinstallprompt`. Client part: <PwaClient/>.
 */
export async function PwaProvider() {
  const origin = await siteOrigin();
  const og = `${origin}/icons/og.png`;
  return (
    <>
      <meta property="og:site_name" content="Signs Around You · آيات حولك" />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={og} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Signs Around You · آيات حولك — the khatam star mark" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={og} />
      <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
      <script dangerouslySetInnerHTML={{ __html: EARLY_CAPTURE_SCRIPT }} />
      <PwaClient />
    </>
  );
}
