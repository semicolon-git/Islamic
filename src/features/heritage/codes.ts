/**
 * Item & venue short codes and QR payloads (pure; shared by client and server).
 *
 * Codes are printed on museum labels, e.g. "AST-7". Visitors type them however they like:
 * "ast7", "AST 7", "ast–7" all resolve to the same item. We compare on the *normalised* form
 * (upper-case letters and digits only), and display the stored form.
 */

export const CODE_MIN = 3;
export const CODE_MAX = 8;

const DASHES = /[\s\-‐-―−_.·/\\]+/g;
// Arabic-Indic and Eastern Arabic-Indic digits → ASCII (a visitor on an Arabic keyboard may type ٧).
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const toAsciiDigit = (d: string) => {
  const c = d.charCodeAt(0);
  return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
};

/** Normalise a typed or scanned code: case, spaces, dashes and digit scripts are ignored. */
export function normalizeCode(input: string): string {
  return (input ?? "")
    .normalize("NFKC")
    .replace(ARABIC_DIGITS, toAsciiDigit)
    .replace(DASHES, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Is this input plausible as a label code (after normalisation)? */
export function isPlausibleCode(input: string): boolean {
  const n = normalizeCode(input);
  return n.length >= CODE_MIN && n.length <= CODE_MAX && /[A-Z0-9]/.test(n);
}

/** Do a typed code and a stored code refer to the same thing? */
export const sameCode = (a: string, b: string) => normalizeCode(a) === normalizeCode(b);

/** Three-letter prefixes for generated item codes, by kind. */
export const KIND_PREFIX: Record<string, string> = {
  astrolabe: "AST",
  lamp: "LMP",
  tile: "TIL",
  manuscript: "QMS",
  folio: "FOL",
  textile: "TXT",
  ceramic: "CER",
  metalwork: "MTL",
  coin: "CON",
  woodwork: "WOD",
  other: "OBJ",
};
export const ITEM_KINDS = Object.keys(KIND_PREFIX);

/**
 * Next free code for a kind, e.g. kind "lamp" with existing ["LMP-3"] → "LMP-4".
 * Codes stay short (≤ 8 chars) so they can be typed from a label.
 */
export function nextItemCode(kind: string, existing: string[]): string {
  const prefix = KIND_PREFIX[kind] ?? KIND_PREFIX.other;
  const taken = new Set(existing.map(normalizeCode));
  let max = 0;
  for (const c of existing) {
    const m = /^([A-Z]+)-?(\d+)$/.exec(c.toUpperCase().replace(/\s+/g, ""));
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  let n = max + 1;
  while (taken.has(normalizeCode(`${prefix}-${n}`))) n++;
  return `${prefix}-${n}`;
}

// ───────────────────────── QR payloads

export type QrTarget = { kind: "item"; code: string } | { kind: "venue"; code: string } | { kind: "unknown"; raw: string };

/** QR payload printed on an item label: an ordinary link, so any phone camera opens the item page. */
export function itemQrPayload(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/heritage/item/${encodeURIComponent(code)}`;
}

/** QR payload at a venue entrance. Scanning it inside the app scopes the visit to that venue (no GPS). */
export function venueQrPayload(code: string): string {
  return `venue:${code}`;
}

/**
 * Understand a scanned QR code. Accepts:
 *  - item links: https://<any host>/heritage/item/<code>  (we only take the code; we never follow foreign links)
 *  - venue tokens: venue:<code>, or links with ?venue=<code>
 *  - a bare code ("AST-7")
 */
export function parseQrPayload(raw: string): QrTarget {
  const text = (raw ?? "").trim();
  if (!text) return { kind: "unknown", raw: text };
  const venue = /^venue:\s*([A-Za-z0-9\- ]{2,16})$/i.exec(text);
  if (venue && isPlausibleCode(venue[1])) return { kind: "venue", code: normalizeCode(venue[1]) };
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      const m = /\/heritage\/item\/([^/?#]+)\/?$/.exec(u.pathname);
      if (m) {
        const code = decodeURIComponent(m[1]);
        if (isPlausibleCode(code)) return { kind: "item", code: normalizeCode(code) };
      }
      const v = u.searchParams.get("venue");
      if (v && isPlausibleCode(v)) return { kind: "venue", code: normalizeCode(v) };
    } catch {
      /* not a URL */
    }
    return { kind: "unknown", raw: text };
  }
  if (isPlausibleCode(text) && text.length <= 12) return { kind: "item", code: normalizeCode(text) };
  return { kind: "unknown", raw: text };
}
