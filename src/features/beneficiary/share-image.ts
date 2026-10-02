"use client";

/**
 * Renders a share card (1080×1350) on a canvas, typeset in code from database text:
 * the verse in the KFGQPC Hafs font (served unmodified), its labelled translation, the reference and the app mark.
 * No generated imagery, no generated calligraphy.
 */
export interface ShareCardData {
  locale: "en" | "ar";
  title: string;
  verse?: { text: string; key: string; surah: string; translation?: string | null; edition?: string | null } | null;
  /** Used when the card has no verse (e.g. art cards). */
  fallbackText?: string | null;
  fallbackLabel?: string;
  approvedLine: string;
  translationLabel: string;
  appName: string;
  url: string;
}

const W = 1080;
const H = 1350;
const PAD = 96;
const QURAN_FONT = "KFGQPC Hafs Share";
const UI_FONT = '"Readex Pro Variable", "IBM Plex Sans Arabic", system-ui, sans-serif';

let fontReady: Promise<void> | null = null;
function loadFonts(): Promise<void> {
  fontReady ??= (async () => {
    try {
      const f = new FontFace(QURAN_FONT, "url(/fonts/hafs.18.woff2)");
      await f.load();
      document.fonts.add(f);
    } catch {
      /* the system Arabic font will be used */
    }
    try {
      await Promise.all([document.fonts.load(`600 40px ${UI_FONT}`), document.fonts.load(`400 32px ${UI_FONT}`)]);
    } catch {
      /* ignore */
    }
  })();
  return fontReady;
}

/** Greedy word wrap using the context's current font. */
export function wrapWords(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next) <= maxWidth || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Find the largest font size (step 2px) at which text wraps within maxLines. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxWidth: number, maxLines: number, from: number, min: number) {
  for (let px = from; px >= min; px -= 2) {
    ctx.font = font(px);
    const lines = wrapWords((s) => ctx.measureText(s).width, text, maxWidth);
    if (lines.length <= maxLines) return { px, lines };
  }
  ctx.font = font(min);
  const lines = wrapWords((s) => ctx.measureText(s).width, text, maxWidth);
  const cut = lines.slice(0, maxLines);
  if (lines.length > maxLines) cut[maxLines - 1] = cut[maxLines - 1].replace(/\s*\S*$/, " …");
  return { px: min, lines: cut };
}

function khatam(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, stroke: string, width: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  for (const rot of [0, Math.PI / 4]) {
    ctx.save();
    ctx.rotate(rot);
    ctx.strokeRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  ctx.restore();
}

export async function renderShareCard(d: ShareCardData): Promise<Blob> {
  await loadFonts();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const rtl = d.locale === "ar";

  // Background: night ink with a quiet khatam motif.
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#151a4a");
  g.addColorStop(1, "#080b24");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.12, 10, W * 0.85, H * 0.12, 520);
  glow.addColorStop(0, "rgba(54,220,184,0.22)");
  glow.addColorStop(1, "rgba(54,220,184,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  khatam(ctx, W - 150, 170, 210, "rgba(54,220,184,0.10)", 3);
  khatam(ctx, 120, H - 120, 160, "rgba(160,148,255,0.08)", 3);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // App mark.
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textBaseline = "alphabetic";
  const markX = rtl ? W - PAD : PAD;
  khatam(ctx, rtl ? W - PAD - 20 : PAD + 20, 132, 15, "#36dcb8", 4);
  ctx.fillStyle = "#36dcb8";
  ctx.beginPath();
  ctx.arc(rtl ? W - PAD - 20 : PAD + 20, 132, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#eceefa";
  ctx.font = `600 34px ${UI_FONT}`;
  ctx.textAlign = rtl ? "right" : "left";
  ctx.fillText(d.appName, rtl ? markX - 56 : markX + 56, 144);

  // Title (eyebrow).
  ctx.fillStyle = "#36dcb8";
  ctx.font = `600 30px ${UI_FONT}`;
  ctx.fillText(d.title, markX, 236);

  let y = 300;
  const maxW = W - PAD * 2;
  ctx.textAlign = "center";
  if (d.verse) {
    ctx.direction = "rtl";
    const v = fit(ctx, d.verse.text, (px) => `${px}px "${QURAN_FONT}", "Amiri", serif`, maxW, 7, 64, 38);
    const lh = Math.round(v.px * 1.9);
    ctx.fillStyle = "#ffffff";
    y += lh * 0.6;
    for (const line of v.lines) {
      ctx.fillText(line, W / 2, y);
      y += lh;
    }
    // Ornament.
    y += 4;
    ctx.strokeStyle = "rgba(54,220,184,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 120, y);
    ctx.lineTo(W / 2 - 24, y);
    ctx.moveTo(W / 2 + 24, y);
    ctx.lineTo(W / 2 + 120, y);
    ctx.stroke();
    khatam(ctx, W / 2, y, 10, "#36dcb8", 2.5);
    y += 64;

    ctx.direction = "ltr";
    if (d.locale === "en" && d.verse.translation) {
      const tr = fit(ctx, `“${d.verse.translation}”`, (px) => `400 ${px}px ${UI_FONT}`, maxW - 40, 7, 36, 24);
      const tlh = Math.round(tr.px * 1.5);
      ctx.fillStyle = "#d3d6f0";
      for (const line of tr.lines) {
        ctx.fillText(line, W / 2, y);
        y += tlh;
      }
      y += 10;
    }
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.fillStyle = "#36dcb8";
    ctx.font = `600 30px ${UI_FONT}`;
    ctx.fillText(`${d.verse.surah} · ${d.verse.key}`, W / 2, y + 8);
    y += 52;
    if (d.locale === "en" && d.verse.translation && d.verse.edition) {
      ctx.fillStyle = "#9aa0c8";
      ctx.font = `400 24px ${UI_FONT}`;
      ctx.fillText(`${d.translationLabel} · ${d.verse.edition}`, W / 2, y);
    }
  } else if (d.fallbackText) {
    ctx.direction = rtl ? "rtl" : "ltr";
    const tr = fit(ctx, d.fallbackText, (px) => `400 ${px}px ${UI_FONT}`, maxW, 10, 40, 26);
    const tlh = Math.round(tr.px * 1.6);
    y += 40;
    ctx.fillStyle = "#eceefa";
    for (const line of tr.lines) {
      ctx.fillText(line, W / 2, y);
      y += tlh;
    }
    if (d.fallbackLabel) {
      ctx.fillStyle = "#9aa0c8";
      ctx.font = `400 24px ${UI_FONT}`;
      ctx.fillText(d.fallbackLabel, W / 2, y + 20);
    }
  }

  // Footer.
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(PAD, H - 196, W - PAD * 2, 2);
  ctx.fillStyle = "#c9cdea";
  ctx.font = `500 26px ${UI_FONT}`;
  const foot = fit(ctx, d.approvedLine, (px) => `500 ${px}px ${UI_FONT}`, maxW, 1, 26, 18);
  ctx.fillText(foot.lines[0] ?? "", W / 2, H - 140);
  ctx.fillStyle = "#8b91ba";
  ctx.font = `400 24px ${UI_FONT}`;
  ctx.direction = "ltr";
  ctx.fillText(d.url, W / 2, H - 96);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("render_failed");
  return blob;
}
