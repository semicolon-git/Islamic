"use client";
import { useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/i18n/client";
import { num } from "../../../manuscripts/components/api";
import type { WorkspaceContext } from "../../../manuscripts/extensions";
import { bbox } from "../../../manuscripts/geometry";
import type { PresenceUser } from "../../types";
import { useOverview } from "./store";

const HEARTBEAT_MS = 20_000;
const FRESH_MS = 45_000;

const fresh = (p: PresenceUser) => Date.now() - new Date(p.at).getTime() < FRESH_MS;

/** Heartbeat while the page is open (with the line being edited), and "leave" when it closes. */
function useHeartbeat(pageId: string, lineId: string | null) {
  const line = useRef(lineId);
  line.current = lineId;
  const send = (leaving = false) => {
    const body = JSON.stringify({ line_id: line.current, leaving });
    if (leaving && navigator.sendBeacon) navigator.sendBeacon(`/api/ms-collab/pages/${pageId}/presence`, new Blob([body], { type: "application/json" }));
    else fetch(`/api/ms-collab/pages/${pageId}/presence`, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: leaving }).catch(() => {});
  };
  useEffect(() => {
    send();
    const timer = setInterval(() => send(), HEARTBEAT_MS);
    const leave = () => send(true);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      send(true);
    };
  }, [pageId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => send(), 400); // tell others which line I moved to
    return () => clearTimeout(t);
  }, [lineId]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Who else is on this page now: avatars in the toolbar (from heartbeats and line locks). */
export function PresenceBar({ ctx }: { ctx: WorkspaceContext }) {
  const { t, locale } = useI18n();
  const pageId = ctx.detail.page.id;
  useHeartbeat(pageId, ctx.selected?.id ?? null);
  const { data } = useOverview(pageId);
  const me = ctx.detail.viewer.id;
  const others = (data?.presence ?? []).filter((p) => p.id !== me && fresh(p));
  const lineN = (id: string | null) => (id ? ctx.detail.lines.find((l) => l.id === id)?.n : undefined);
  if (!others.length) return null;
  const label = (p: PresenceUser) => {
    const name = locale === "ar" ? p.name_ar : p.name_en;
    const n = lineN(p.line_id);
    return n ? t("collab.presence.onLine", { name, n: num(n, locale) }) : t("collab.presence.here", { name });
  };
  return (
    <span className="inline-flex items-center me-1" data-testid="presence" aria-label={t("collab.presence.label", { n: num(others.length, locale) })} role="group">
      <span className="flex -space-x-2 rtl:space-x-reverse">
        {others.slice(0, 4).map((p) => (
          <span key={p.id} className="relative" title={label(p)}>
            <Avatar name={locale === "ar" ? p.name_ar : p.name_en} hue={p.hue} size={28} title={label(p)} />
            <span className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full bg-ok ring-2 ring-surface" aria-hidden />
          </span>
        ))}
      </span>
      {others.length > 4 && <span className="text-xs text-ink-3 ms-1.5">+{num(others.length - 4, locale)}</span>}
      <span className="sr-only" aria-live="polite">{others.map(label).join("، ")}</span>
    </span>
  );
}

/** Pins on the image for lines other people are on (their lock or their last heartbeat). Image pixel coordinates. */
export function PresencePins({ ctx }: { ctx: WorkspaceContext }) {
  const { locale } = useI18n();
  const { data } = useOverview(ctx.detail.page.id);
  const me = ctx.detail.viewer.id;
  const pins = new Map<string, { lineId: string; name: string; hue: number }>();
  for (const l of ctx.detail.lines)
    if (l.locked_by && l.locked_by !== me) pins.set(l.locked_by, { lineId: l.id, name: (locale === "ar" ? l.lock_name_ar : l.lock_name_en) ?? "", hue: l.lock_hue ?? 200 });
  for (const p of data?.presence ?? [])
    if (p.id !== me && p.line_id && fresh(p) && !pins.has(p.id)) pins.set(p.id, { lineId: p.line_id, name: locale === "ar" ? p.name_ar : p.name_en, hue: p.hue });
  const r = Math.max(16, ctx.detail.page.width * 0.014);
  return (
    <g data-testid="presence-pins" pointerEvents="none">
      {[...pins.values()].map((p) => {
        const line = ctx.detail.lines.find((l) => l.id === p.lineId);
        if (!line) return null;
        const b = bbox(line.polygon);
        const cx = Math.min(ctx.detail.page.width - r, b.x + b.w + r * 0.6), cy = b.y + b.h / 2;
        const initials = p.name.replace(/^(Dr\.?|د\.)\s*/i, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
        return (
          <g key={p.lineId + p.name}>
            <circle cx={cx} cy={cy} r={r} fill={`oklch(0.47 0.12 ${p.hue})`} stroke="white" strokeWidth={r * 0.18} />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={r * 0.85} fontWeight={600}>{initials}</text>
          </g>
        );
      })}
    </g>
  );
}
