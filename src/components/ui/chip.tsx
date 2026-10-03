import { cn } from "./cn";

type Tone = "neutral" | "accent" | "violet" | "ok" | "warn" | "bad" | "sand";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-ink",
  violet: "bg-violet-soft text-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  sand: "bg-sand text-sand-ink",
};

export function Badge({ tone = "neutral", className, children, ...rest }: { tone?: Tone } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium leading-5", tones[tone], className)} {...rest}>
      {children}
    </span>
  );
}

export function Chip({
  tone = "neutral",
  selected,
  className,
  children,
  ...rest
}: { tone?: Tone; selected?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full h-9 pointer-coarse:h-11 px-3.5 text-sm font-medium border transition-colors",
        selected ? "bg-ink text-bg border-ink" : cn(tones[tone], "border-transparent hover:border-line-strong"),
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Status pill for workflow states. */
const STATUS_TONE: Record<string, Tone> = {
  ai_draft: "neutral",
  student_submitted: "violet",
  researcher_approved: "accent",
  published: "ok",
  returned: "warn",
  archived: "neutral",
  draft: "neutral",
  transcribed: "violet",
  agreed: "accent",
  disputed: "warn",
  approved: "ok",
};
export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </Badge>
  );
}
