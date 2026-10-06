"use client";
import { memo } from "react";
import type { Locale } from "@/i18n/core";
import { norm360, type Pointer, type SkyObject } from "./engine";
import { primaryName } from "./words";

const SIZE = 360;
const C = SIZE / 2;
/** Half the field of view across the square, degrees. */
const HALF_FOV = 32;
const SCALE = C / Math.tan((HALF_FOV * Math.PI) / 180);
const RAD = Math.PI / 180;

type V3 = [number, number, number];
const vec = (p: Pointer): V3 => [Math.sin(p.az * RAD) * Math.cos(p.alt * RAD), Math.cos(p.az * RAD) * Math.cos(p.alt * RAD), Math.sin(p.alt * RAD)];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Camera basis for a phone held upright without roll: forward, right (always level), up. */
function basis(p: Pointer) {
  const f = vec(p);
  const r: V3 = [Math.cos(p.az * RAD), -Math.sin(p.az * RAD), 0];
  return { f, r, u: cross(r, f) };
}

/** Gnomonic projection onto the screen; null when the direction is behind or far outside the view. */
function project(b: ReturnType<typeof basis>, p: Pointer, maxDeg = 60) {
  const v = vec(p);
  const d = dot(v, b.f);
  if (d < Math.cos(maxDeg * RAD)) return null;
  return { x: C + (dot(v, b.r) / d) * SCALE, y: C - (dot(v, b.u) / d) * SCALE };
}

const inView = (q: { x: number; y: number } | null, pad = 0): q is { x: number; y: number } => !!q && q.x >= -pad && q.x <= SIZE + pad && q.y >= -pad && q.y <= SIZE + pad;

const radius = (o: SkyObject) => (o.kind === "moon" ? 11 : o.kind === "sun" ? 13 : o.kind === "planet" ? Math.max(3, 4.6 - o.mag * 0.5) : Math.max(1.3, 4.2 - o.mag * 0.95));
const fill = (o: SkyObject) => (o.kind === "moon" ? "#f4ecd2" : o.kind === "sun" ? "#ffd147" : o.kind === "planet" ? "#ffd99a" : "#ffffff");

const CARDINALS: [number, string][] = [
  [0, "N"],
  [90, "E"],
  [180, "S"],
  [270, "W"],
];

export const SkyView = memo(function SkyView({
  pointer,
  objects,
  targetId,
  findId,
  locale,
  label,
  cardinal,
}: {
  pointer: Pointer;
  objects: SkyObject[];
  targetId: string | null;
  findId: string | null;
  locale: Locale;
  label: string;
  cardinal: (k: string) => string;
}) {
  const b = basis(pointer);

  // Horizon and ground (drawn only when the horizon is in front of us).
  const horizon: { x: number; y: number }[] = [];
  for (let d = -88; d <= 88; d += 4) {
    const q = project(b, { az: norm360(pointer.az + d), alt: 0 }, 89);
    if (q) horizon.push(q);
  }
  const horizonPath = horizon.length > 1 ? horizon.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" ") : null;
  const ground = horizonPath ? `${horizonPath} L${horizon[horizon.length - 1].x.toFixed(1)} ${SIZE * 6} L${horizon[0].x.toFixed(1)} ${SIZE * 6} Z` : null;

  const shown = objects
    .filter((o) => o.alt > -1)
    .map((o) => ({ o, q: project(b, o) }))
    .filter((s): s is { o: SkyObject; q: { x: number; y: number } } => inView(s.q, 20));
  const labelled = new Set(
    shown
      .slice()
      .sort((a, z) => a.o.mag - z.o.mag)
      .slice(0, 7)
      .map((s) => s.o.id),
  );
  if (targetId) labelled.add(targetId);
  if (findId) labelled.add(findId);

  // Off-screen arrow toward the object being searched for.
  let findArrow: { x: number; y: number; angle: number } | null = null;
  const find = findId ? objects.find((o) => o.id === findId) : null;
  if (find) {
    const q = project(b, find);
    if (!inView(q, -12)) {
      const v = vec(find);
      const ang = Math.atan2(-dot(v, b.u), dot(v, b.r));
      findArrow = { x: C + Math.cos(ang) * (C - 26), y: C + Math.sin(ang) * (C - 26), angle: (ang * 180) / Math.PI };
    }
  }

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label} className="block w-full h-auto select-none" style={{ direction: "ltr" }} data-testid="sky-view">
      <defs>
        <radialGradient id="sky-bg" cx="50%" cy="35%" r="80%">
          <stop offset="0" stopColor="#1b2154" />
          <stop offset="1" stopColor="#05060f" />
        </radialGradient>
        <radialGradient id="sky-glow">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={SIZE} height={SIZE} fill="url(#sky-bg)" />
      {ground && <path d={ground} fill="#0d1024" opacity="0.92" />}
      {horizonPath && <path d={horizonPath} fill="none" stroke="#36dcb8" strokeOpacity="0.55" strokeWidth="1.2" />}
      {CARDINALS.map(([az, k]) => {
        const q = project(b, { az, alt: 0 }, 70);
        if (!inView(q)) return null;
        return (
          <text key={k} x={q.x} y={q.y + 16} textAnchor="middle" fontSize="12" fontWeight="600" fill="#36dcb8">
            {cardinal(k)}
          </text>
        );
      })}

      {shown.map(({ o, q }) => {
        const r = radius(o);
        const isTarget = o.id === targetId;
        return (
          <g key={o.id}>
            {(o.mag < 1 || o.kind !== "star") && <circle cx={q.x} cy={q.y} r={r * 2.6} fill="url(#sky-glow)" opacity={o.kind === "sun" ? 0.9 : 0.5} />}
            <circle cx={q.x} cy={q.y} r={r} fill={fill(o)} opacity={o.kind === "star" ? Math.min(1, 1.15 - o.mag * 0.17) : 1} />
            {labelled.has(o.id) && (
              // Labels start right of the dot, or right of the reticle ring when the dot sits inside it.
              <text x={Math.hypot(q.x - C, q.y - C) < 30 ? Math.max(q.x + r + 5, C + 40) : q.x + r + 5} y={q.y + 4} fontSize={isTarget ? 13 : 11} fontWeight={isTarget ? 700 : 500} fill={isTarget ? "#ffffff" : "#c9cdf0"}>
                {primaryName(o, locale)}
              </text>
            )}
          </g>
        );
      })}

      {findArrow && (
        <g transform={`translate(${findArrow.x} ${findArrow.y}) rotate(${findArrow.angle})`} data-testid="find-arrow">
          <path d="M14 0 L-8 -10 L-3 0 L-8 10 Z" fill="#ffd99a" />
        </g>
      )}

      {/* Reticle */}
      <g fill="none" stroke={targetId ? "#36dcb8" : "#ffffff"} strokeOpacity={targetId ? 1 : 0.75} strokeWidth="2">
        <circle cx={C} cy={C} r="24" />
        <path d={`M${C} ${C - 36} V${C - 28} M${C} ${C + 28} V${C + 36} M${C - 36} ${C} H${C - 28} M${C + 28} ${C} H${C + 36}`} />
      </g>
    </svg>
  );
});
