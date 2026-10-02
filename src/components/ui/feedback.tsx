import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-[10px]", className)} aria-hidden />;
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-ink-2", className)}>
      <span className="size-4 rounded-full border-2 border-current border-e-transparent animate-spin" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: { icon?: React.ReactNode; title: React.ReactNode; body?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center text-center gap-3 py-10 px-6", className)}>
      {icon && <div className="size-14 rounded-2xl bg-surface-2 text-ink-2 grid place-items-center">{icon}</div>}
      <h3 className="text-lg font-semibold text-ink max-w-[28ch]">{title}</h3>
      {body && <p className="text-ink-2 max-w-[42ch]">{body}</p>}
      {action && <div className="mt-2 flex flex-wrap gap-2 justify-center">{action}</div>}
    </div>
  );
}

export function Callout({ tone = "neutral", icon, title, children, className }: { tone?: "neutral" | "ok" | "warn" | "bad" | "accent" | "violet"; icon?: React.ReactNode; title?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  const t = {
    neutral: "bg-surface-2 border-line",
    ok: "bg-ok-soft border-transparent",
    warn: "bg-warn-soft border-transparent",
    bad: "bg-bad-soft border-transparent",
    accent: "bg-accent-soft border-transparent",
    violet: "bg-violet-soft border-transparent",
  }[tone];
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={cn("flex gap-3 rounded-[12px] border p-3.5 text-sm text-ink", t, className)}>
      {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
      <div className="flex flex-col gap-1 min-w-0">
        {title && <strong className="font-semibold">{title}</strong>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mono inline-flex items-center rounded-md border border-line-strong bg-surface-2 px-1.5 text-[0.75rem] text-ink-2">{children}</kbd>;
}
