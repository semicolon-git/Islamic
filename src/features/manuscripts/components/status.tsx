"use client";
import { Badge, StatusPill } from "@/components/ui/chip";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n/client";
import type { LineDTO } from "../types";

export type LineState = "empty" | "draft" | "transcribed" | "agreed" | "disputed" | "approved";

export function lineState(l: Pick<LineDTO, "status" | "version">): LineState {
  if (!l.version) return "empty";
  if (l.status === "draft") return "draft";
  return l.status;
}

const DOT: Record<LineState, string> = {
  empty: "bg-transparent border border-line-strong",
  draft: "bg-ink-3/40 border border-ink-3",
  transcribed: "bg-violet",
  agreed: "bg-accent",
  disputed: "bg-warn",
  approved: "bg-ok",
};

/** Compact line status: a shaped dot plus its label (colour is never the only cue). */
export function LineStatusDot({ state, withLabel = false, className }: { state: LineState; withLabel?: boolean; className?: string }) {
  const { t } = useI18n();
  const label = t(`manuscripts.line.${state}`);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-ink-3", className)} title={label}>
      <span className={cn("size-2.5 shrink-0", state === "approved" ? "rounded-[3px]" : "rounded-full", DOT[state])} aria-hidden />
      {withLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

export function PageStatus({ status }: { status: string }) {
  const { t } = useI18n();
  return <StatusPill status={status} label={t(`manuscripts.status.${status}`)} />;
}

export function LicenceChip({ license, confidence }: { license: string | null; confidence?: string | null }) {
  const { t } = useI18n();
  const l = (license ?? "").toLowerCase();
  const kind = /non-?commercial|nc\b|gallica/.test(l) ? "nc" : /mark/.test(l) ? "pdm" : /public domain|cc0/.test(l) ? "pd" : /cc by|creative/.test(l) ? "cc" : "other";
  const tone = kind === "nc" ? "warn" : kind === "other" ? "neutral" : "ok";
  return (
    <Badge tone={tone} title={`${license ?? ""}${confidence ? ` · ${confidence}` : ""}`}>
      {t(`manuscripts.licence.${kind}`)}
    </Badge>
  );
}
